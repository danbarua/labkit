import { Client } from "pg";
import { directPostgresBackend } from "@labkit/core-db/backend";
import { runMigrationsOnPostgres } from "@labkit/core-db/migrate";
import { seed } from "./seed";

export interface ScratchDb {
  /** A connection string for the new database. */
  url: string;
  drop(): Promise<void>;
}

const PREFIX = "labkit_web_test_";

/** The same server as `serverUrl`, on another database. */
function urlFor(serverUrl: string, database: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function seedOn(url: string): Promise<void> {
  const { db, tx, close } = await directPostgresBackend({ connectionString: url }).connect();
  try {
    await seed(db, tx);
  } finally {
    await close();
  }
}

/**
 * A throwaway Postgres database on the server `serverUrl` names, seeded by `seed`. Nothing else
 * is in it, so nothing a developer has loaded can change a result.
 */
export async function createScratchDb(serverUrl: string): Promise<ScratchDb> {
  const name = `${PREFIX}${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = async <T>(work: (client: Client) => Promise<T>): Promise<T> => {
    const client = new Client({ connectionString: urlFor(serverUrl, "postgres") });
    await client.connect();
    try {
      return await work(client);
    } finally {
      await client.end();
    }
  };

  await admin((client) => client.query(`CREATE DATABASE ${name}`));
  const url = urlFor(serverUrl, name);
  const migrator = new Client({ connectionString: url });
  await migrator.connect();
  try {
    await migrator.query("CREATE EXTENSION IF NOT EXISTS age");
    await runMigrationsOnPostgres(migrator);
  } finally {
    await migrator.end();
  }
  await seedOn(url);

  return {
    url,
    // The prefix is checked again at the point of dropping, so this can never name another database.
    drop: () =>
      admin((client) =>
        name.startsWith(PREFIX)
          ? client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
          : Promise.reject(new Error(`refusing to drop ${name}`)),
      ).then(() => undefined),
  };
}
