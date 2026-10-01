/**
 * One process per record owns the PGlite datadir, migrates it once, and serves it on a unix
 * socket; every other process is a `pg` client of it through {@link daemonBackend}. PGlite is
 * one session in one process, so something has to own the datadir, and a daemon makes processes
 * wait for each other's single exchanges rather than their whole units of work. Nothing
 * supervises it: the first client that finds none spawns one, and it exits after
 * `LABKIT_DAEMON_IDLE_MS` (default 15 minutes) with no client connected.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stderrLine } from "./colour";
import {
  type DbBackend,
  directPostgresBackend,
  holderOf,
  openPglite,
  pgliteBackend,
  pidAlive,
  releaseLock,
  tryAcquire,
} from "./backend";
import { runMigrations } from "./migrate";
import { embeddedMigrations } from "./migrations";
import { hostPGlite } from "./wire-host";

const SOCKET_PORT = 5432;
const SOCKET_FILE = `.s.PGSQL.${SOCKET_PORT}`;
const CONNECT_DEADLINE_MS = 60_000;

/**
 * How many migrations this build carries: what a daemon and its clients compare. A client
 * carrying more replaces the daemon; one carrying fewer is refused. Builds are not compared,
 * because a compiled binary and a source checkout carry the same migrations.
 */
export function migrationCount(): number {
  return embeddedMigrations().length;
}

export function lockPathFor(dataDir: string): string {
  return `${dataDir}.lock`;
}
export function daemonLogPath(dataDir: string): string {
  return `${dataDir}.daemon.log`;
}
function infoPath(dataDir: string): string {
  return `${dataDir}.daemon.json`;
}

/**
 * Where the socket lives: beside the datadir when the path fits, since `pg` connects to
 * `<dir>/.s.PGSQL.<port>` and macOS caps a socket path at 104 bytes; otherwise a short directory
 * under /tmp keyed by a hash of the datadir.
 */
export function socketDirFor(dataDir: string): string {
  const local = `${dataDir}.daemon`;
  if (join(local, SOCKET_FILE).length <= 100) return local;
  const hash = createHash("sha256").update(dataDir).digest("hex").slice(0, 16);
  return join("/tmp", `labkit-${process.getuid?.() ?? "user"}`, hash);
}

export interface DaemonInfo {
  pid: number;
  /** The number of migrations the daemon's build carries, and so applied. */
  migrations: number;
  socketDir: string;
  startedAt: string;
}

/** The running daemon's record, or null if there is none or its process is gone. */
export function readDaemonInfo(dataDir: string): DaemonInfo | null {
  const path = infoPath(dataDir);
  if (!existsSync(path)) return null;
  try {
    const info = JSON.parse(readFileSync(path, "utf8")) as DaemonInfo;
    return pidAlive(info.pid) ? info : null;
  } catch {
    return null;
  }
}

function log(message: string): void {
  stderrLine(`${new Date().toISOString()} [labkit daemon ${process.pid}] ${message}`);
}

/** Serves the record at `dataDir` until idle or signalled. Returns the process exit code. */
export async function runDaemon(rawDataDir: string): Promise<number> {
  const dataDir = resolve(rawDataDir);
  mkdirSync(dirname(dataDir), { recursive: true });
  const lock = lockPathFor(dataDir);
  const idleMs = Number(process.env.LABKIT_DAEMON_IDLE_MS ?? 15 * 60_000);

  // The record's lockfile is the gate: of several daemons spawned at once, the one that takes it
  // serves, and one that finds a live daemon holding it exits. An in-process open holding it is
  // waited for.
  const gateDeadline = Date.now() + CONNECT_DEADLINE_MS;
  for (;;) {
    if (tryAcquire(lock)) break;
    const holder = Number(holderOf(lock));
    if (readDaemonInfo(dataDir)?.pid === holder) {
      log(`daemon ${holder} already serves ${dataDir}; exiting`);
      return 0;
    }
    if (Date.now() > gateDeadline) {
      log(`gave up after ${CONNECT_DEADLINE_MS}ms waiting for ${lock}, held by pid ${holder}`);
      return 1;
    }
    await Bun.sleep(50);
  }

  let db: Awaited<ReturnType<typeof openPglite>>;
  try {
    db = await openPglite(dataDir);
    await runMigrations(db);
  } catch (err) {
    log(`could not open ${dataDir}: ${err instanceof Error ? err.message : err}`);
    releaseLock(lock);
    return 1;
  }

  const socketDir = socketDirFor(dataDir);
  mkdirSync(socketDir, { recursive: true, mode: 0o700 });
  const socketPath = join(socketDir, SOCKET_FILE);
  // A crash leaves the socket file behind, and listen() refuses an existing path.
  rmSync(socketPath, { force: true });
  const host = await hostPGlite(db, socketPath);

  // Written last: a client treats this file as "a daemon is ready here".
  const info: DaemonInfo = {
    pid: process.pid,
    migrations: migrationCount(),
    socketDir,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(infoPath(dataDir), JSON.stringify(info));
  log(`serving ${dataDir} at ${socketPath} (${info.migrations} migrations, idle exit ${idleMs}ms)`);

  let stopping = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = async (why: string) => {
    if (stopping) return;
    stopping = true;
    if (timer) clearInterval(timer);
    log(`stopping: ${why}`);
    // First, so no new client connects to a daemon that is going away.
    if (readDaemonInfo(dataDir)?.pid === process.pid) rmSync(infoPath(dataDir), { force: true });
    try {
      await host.close();
    } catch (err) {
      log(`closing the socket: ${err instanceof Error ? err.message : err}`);
    }
    try {
      await db.close();
    } catch (err) {
      log(`closing the record: ${err instanceof Error ? err.message : err}`);
    }
    rmSync(socketPath, { force: true });
    releaseLock(lock);
    log("stopped");
    process.exit(0);
  };

  timer = setInterval(
    () => {
      // A record whose directory was deleted is served from files nobody can reach again.
      if (!existsSync(dataDir)) void stop("the record's directory is gone");
      else if (host.connections() === 0 && Date.now() - host.lastActivity() >= idleMs)
        void stop(`idle for ${idleMs}ms`);
    },
    Math.min(5_000, Math.max(100, Math.floor(idleMs / 4))),
  );
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));

  await new Promise(() => {});
  return 0;
}

function spawnDaemon(dataDir: string): void {
  // Compiled, the binary is the CLI and takes a hidden `daemon` command; from source, the entry
  // file beside this one.
  const compiled = import.meta.dir.startsWith("/$bunfs");
  const argv = compiled
    ? [process.execPath, "daemon", dataDir]
    : [process.execPath, join(import.meta.dir, "daemon-main.ts"), dataDir];
  // A brand-new record has no directory yet; the daemon creates the datadir, the log goes beside it.
  mkdirSync(dirname(dataDir), { recursive: true });
  const logFd = openSync(daemonLogPath(dataDir), "a");
  try {
    Bun.spawn(argv, {
      env: process.env,
      stdin: "ignore",
      stdout: logFd,
      stderr: logFd,
      // Its own process group, so it outlives the command that started it.
      detached: true,
    }).unref();
  } finally {
    closeSync(logFd);
  }
}

/** Asks a daemon to exit and waits until its process is gone. */
export async function stopDaemon(
  dataDir: string,
  pid: number,
  deadline = Date.now() + 30_000,
): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  while (pidAlive(pid)) {
    if (Date.now() > deadline)
      throw new Error(
        `the labkit daemon ${pid} for ${dataDir} did not exit within the deadline; its log is ${daemonLogPath(dataDir)}`,
      );
    await Bun.sleep(25);
  }
}

function socketUrl(socketDir: string): string {
  return `postgresql://postgres@/postgres?host=${encodeURIComponent(socketDir)}&port=${SOCKET_PORT}`;
}

/**
 * The record at `dataDir` through its daemon, spawning one if none is running.
 */
export function daemonBackend(rawDataDir: string): DbBackend {
  const dataDir = resolve(rawDataDir);
  return {
    async connect() {
      const mine = migrationCount();
      const deadline = Date.now() + CONNECT_DEADLINE_MS;
      let spawnedAt = 0;
      for (;;) {
        const info = readDaemonInfo(dataDir);
        if (info && info.migrations > mine)
          throw new Error(
            `the record at ${dataDir} is served with ${info.migrations} migrations applied; this build carries ${mine}.\n` +
              `  Something newer has migrated it, and this build would write against a schema it does not know.`,
          );
        if (info && info.migrations < mine) {
          stderrLine(
            `labkit: the daemon for ${dataDir} carries ${info.migrations} migrations and this build ${mine}; replacing it`,
          );
          await stopDaemon(dataDir, info.pid, deadline);
          continue;
        }
        if (info) {
          try {
            // A daemon removes its record before it stops serving, so a client that read the
            // record just before can connect and then lose the socket; `connect` proves the
            // connection with the session's first queries, and a failure here retries.
            return await directPostgresBackend({
              connectionString: socketUrl(info.socketDir),
            }).connect();
          } catch (err) {
            const code = (err as { code?: string }).code;
            const gone =
              code === "ENOENT" ||
              code === "ECONNREFUSED" ||
              code === "ECONNRESET" ||
              (err instanceof Error && /Connection terminated/.test(err.message));
            if (!gone) throw err;
          }
        } else if (Date.now() - spawnedAt > 5_000) {
          spawnDaemon(dataDir);
          spawnedAt = Date.now();
        }
        if (Date.now() > deadline)
          throw new Error(
            `no labkit daemon answered for ${dataDir} within ${CONNECT_DEADLINE_MS / 1000}s.\n` +
              `  Its log is ${daemonLogPath(dataDir)}; the lock at ${lockPathFor(dataDir)} is held by pid ${holderOf(lockPathFor(dataDir))}.`,
          );
        await Bun.sleep(25);
      }
    },
  };
}

/**
 * The record at `dataDir` opened in this process, with its daemon stopped: for what needs the
 * PGlite instance itself. A client arriving meanwhile spawns a daemon that waits for the lock.
 */
export function exclusiveBackend(rawDataDir: string): DbBackend {
  const dataDir = resolve(rawDataDir);
  return {
    async connect() {
      const info = readDaemonInfo(dataDir);
      if (info) await stopDaemon(dataDir, info.pid);
      return pgliteBackend({ dataDir, lockPath: lockPathFor(dataDir) }).connect();
    },
  };
}
