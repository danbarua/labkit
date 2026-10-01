import { createServer, type Server, type Socket } from "node:net";
import type { PGlite } from "@electric-sql/pglite";
import { stderrLine } from "./colour";
import { TENANT_SETTING } from "./scoped";

/**
 * The settings a LabKit connection makes on its session, saved and restored per client when the
 * shared session changes hands. Without the swap a client runs under the tenant and role the
 * previous client left, as a superuser if none, which row-level security does not restrict.
 * `pg_settings` lists neither a custom setting nor the role as session-sourced, hence the list.
 * Anything else a client sets, and any named prepared statement, does not survive a hand-over.
 */
const SESSION_STATE = ["role", "search_path", TENANT_SETTING] as const;
type SessionState = Record<(typeof SESSION_STATE)[number], string>;

/**
 * How long a client may keep its hold while sending nothing before it is disconnected and
 * anything it left open rolled back. Every other client waits for the hold.
 */
const IDLE_HOLD_MS = Number(process.env.LABKIT_DAEMON_IDLE_HOLD_MS ?? 60_000);

const SYNC = 0x53;
const QUERY = 0x51;
const TERMINATE = 0x58;
const SSL_REQUEST = 80877103;
const GSS_REQUEST = 80877104;
const CANCEL_REQUEST = 80877102;

export interface WireHost {
  /** Clients connected now. */
  connections(): number;
  /** When a client last sent anything, or when the host started. */
  lastActivity(): number;
  /** Stop accepting; wait for the current hold; drop every client, rolling back an open transaction. */
  close(): Promise<void>;
}

interface Client {
  dropped: boolean;
  /** What this client's session looked like when it last let go; null before its first hold. */
  state: SessionState | null;
}

async function saveState(db: PGlite): Promise<SessionState> {
  const { rows } = await db.query<{ role: string; search_path: string; tenant: string | null }>(
    `SELECT current_setting('role') AS role, current_setting('search_path') AS search_path,
            current_setting($1, true) AS tenant`,
    [TENANT_SETTING],
  );
  const row = rows[0]!;
  return { role: row.role, search_path: row.search_path, [TENANT_SETTING]: row.tenant ?? "" };
}

async function restoreState(db: PGlite, state: SessionState | null): Promise<void> {
  await db.exec("DISCARD ALL");
  if (!state) return;
  for (const name of SESSION_STATE) {
    const value = state[name];
    // `role` reads back as `none` when no role was set, and a setting never made reads as "".
    if (value === "" || (name === "role" && value === "none")) continue;
    await db.query("SELECT set_config($1, $2, false)", [name, value]);
  }
}

/**
 * Serves one PGlite over the Postgres wire protocol to any number of clients, one exchange at a
 * time: a client holds the session from its first message until a Sync, a simple Query or a
 * Terminate has been processed with no transaction open. A parameterised query is several
 * messages whose unnamed statement lives on the session until the Sync, so interleaving clients
 * message by message, as `@electric-sql/pglite-socket`'s multiplexer does, crosses their results.
 * PGlite runs one statement at a time and cannot interrupt one, so a slow query stalls everyone.
 */
export function hostPGlite(db: PGlite, socketPath: string): Promise<WireHost> {
  // The chain every hold waits on: a client's hold starts when the previous holder lets go.
  let turn: Promise<void> = Promise.resolve();
  // The client whose settings the session carries now.
  let owner: Client | null = null;
  let lastActivity = Date.now();
  const sockets = new Set<Socket>();
  const drained = new Set<Promise<void>>();

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    const me: Client = { dropped: false, state: null };
    let buf = Buffer.alloc(0);
    let started = false;
    let release: (() => void) | null = null;
    let work: Promise<void> = Promise.resolve();
    let idleHold: ReturnType<typeof setTimeout> | undefined;

    const acquire = async () => {
      if (release) return;
      let letGo!: () => void;
      const mine = new Promise<void>((r) => {
        letGo = r;
      });
      const previous = turn;
      turn = previous.then(() => mine);
      await previous;
      release = letGo;
    };
    const letGo = () => {
      const r = release;
      release = null;
      r?.();
    };
    const handle = async (msg: Buffer, type: number | null) => {
      if (me.dropped) return;
      await acquire();
      // A client that gave up while it waited has usually closed its socket, but the close event
      // is not seen until the event loop has had a turn, because the query it waited behind ran
      // in this process. Yielding lets it arrive, so the abandoned work is skipped, not run late.
      await new Promise<void>((r) => setImmediate(r));
      if (me.dropped) return;
      if (idleHold) clearTimeout(idleHold);
      if (owner !== me) {
        // A hand-over happens only between exchanges with no transaction open.
        if (owner && !owner.dropped) owner.state = await saveState(db);
        await restoreState(db, me.state);
        owner = me;
      }
      await db.execProtocolRawStream(new Uint8Array(msg), {
        // Copied: `d` is a view into a buffer PGlite reuses, and `write` may send it after the
        // next chunk has overwritten it.
        onRawData: (d: Uint8Array) => {
          if (d.length && socket.writable) socket.write(Buffer.from(d));
        },
      });
      const boundary = type === null || type === SYNC || type === QUERY || type === TERMINATE;
      if (boundary && !db.isInTransaction()) {
        letGo();
      } else {
        idleHold = setTimeout(() => {
          stderrLine(
            `[labkit daemon] a client held the record and sent nothing for ${IDLE_HOLD_MS}ms; disconnecting it and rolling back`,
          );
          socket.destroy();
        }, IDLE_HOLD_MS);
      }
    };
    const enqueue = (msg: Buffer, type: number | null) => {
      work = work
        .then(() => handle(msg, type))
        .catch((err) => {
          stderrLine(`[labkit daemon] ${err instanceof Error ? err.message : err}`);
          socket.destroy();
        });
    };

    socket.on("data", (chunk: Buffer) => {
      lastActivity = Date.now();
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (!started) {
          if (buf.length < 8) return;
          const len = buf.readInt32BE(0);
          const code = buf.readInt32BE(4);
          if (code === SSL_REQUEST || code === GSS_REQUEST) {
            buf = buf.subarray(8);
            socket.write("N");
            continue;
          }
          if (code === CANCEL_REQUEST) {
            buf = buf.subarray(16);
            continue;
          }
          if (buf.length < len) return;
          const msg = buf.subarray(0, len);
          buf = buf.subarray(len);
          started = true;
          enqueue(msg, null);
          continue;
        }
        if (buf.length < 5) return;
        const len = 1 + buf.readInt32BE(1);
        if (buf.length < len) return;
        const type = buf[0]!;
        const msg = buf.subarray(0, len);
        buf = buf.subarray(len);
        enqueue(msg, type);
      }
    });

    // A client that goes away mid-hold must not keep everyone waiting, and must not leave its
    // transaction open on the one session everybody shares.
    const drop = () => {
      if (me.dropped) return;
      me.dropped = true;
      if (idleHold) clearTimeout(idleHold);
      sockets.delete(socket);
      const done = work.then(async () => {
        if (release) {
          if (db.isInTransaction()) await db.exec("rollback");
          letGo();
        }
      });
      drained.add(done);
      void done.finally(() => drained.delete(done));
    };
    socket.on("close", drop);
    socket.on("error", drop);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve({
        connections: () => sockets.size,
        lastActivity: () => lastActivity,
        close: async () => {
          // `server.close` calls back only once every connection has ended, so it is started
          // here and awaited last.
          const closed = new Promise<void>((r) => server.close(() => r()));
          for (const s of sockets) s.end();
          const deadline = Date.now() + 10_000;
          while ((sockets.size || drained.size) && Date.now() < deadline) await Bun.sleep(25);
          for (const s of sockets) s.destroy();
          await Promise.allSettled([...drained]);
          await closed;
        },
      });
    });
  });
}
