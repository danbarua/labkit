import { Client } from "pg";

/** Existing pg0 instance: ~/.pg0/instances/labkit (not hindsight, not PGlite). */
export const LABKIT_PG_URL =
  process.env.LABKIT_DB_URL ?? "postgresql://postgres:agens@127.0.0.1:5433/labkit";

export async function ensureLabkitPostgres(): Promise<string> {
  process.env.LABKIT_DB_URL = LABKIT_PG_URL;
  const client = new Client({ connectionString: LABKIT_PG_URL });
  await client.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS age");
  } finally {
    await client.end();
  }
  return LABKIT_PG_URL;
}
