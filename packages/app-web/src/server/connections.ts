import { Pool } from "pg";

/** One connection, borrowed for the length of one request's transaction. */
export interface Session {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
  /** `broken`: the session failed part-way and must not be handed to another request. */
  release(broken?: boolean): void;
}

/** Where the API gets its database connections from. */
export interface Connections {
  connect(): Promise<Session>;
  end(): Promise<void>;
}

/** What has to be true of a session before its first query. */
const BOOTSTRAP = `LOAD 'age'; SET search_path = ag_catalog, "$user", public;`;

/** A pool of Postgres connections. */
export function pgConnections(connectionString: string): Connections {
  const pool = new Pool({ connectionString });
  // An idle client that loses its server must not take the process down.
  pool.on("error", (err) => console.error("postgres pool:", err.message));
  const ready = new WeakMap<object, Promise<unknown>>();
  pool.on("connect", (client) => {
    ready.set(client, client.query(BOOTSTRAP));
  });
  return {
    async connect() {
      const client = await pool.connect();
      // A connection is only used once its session setup has finished.
      await ready.get(client);
      return {
        query: async <R>(sql: string, params?: unknown[]) => ({
          rows: (await client.query(sql, params)).rows as R[],
        }),
        release: (broken) => client.release(broken === true ? true : undefined),
      };
    },
    end: () => pool.end(),
  };
}

/** The one thing a serialised database needs to offer: a query. */
interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * A database that can run one statement stream at a time, such as PGlite, made to look like a
 * pool of one. A request holds the only session until it releases it, so transactions cannot
 * interleave.
 */
export function serialised(
  db: Queryable,
  close: () => Promise<void> = async () => {},
): Connections {
  let tail: Promise<void> = Promise.resolve();
  return {
    async connect() {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      return {
        query: async <R>(sql: string, params?: unknown[]) => ({
          rows: (await db.query(sql, params)).rows as R[],
        }),
        release: () => release(),
      };
    },
    end: close,
  };
}
