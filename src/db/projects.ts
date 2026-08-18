import type { LabKitDB } from "./graph";
import type { Project } from "./schema";

export type { Project };

/**
 * Insert-or-fetch by name via a single `ON CONFLICT DO NOTHING ... RETURNING`,
 * rather than a check-then-insert — the old `getOrCreateProject` raced two
 * processes that both passed its `select` check before either `insert`d, and
 * the loser's `insert` threw on the `unique` constraint uncaught.
 *
 * Takes the generic `LabKitDB` (just `.query()`), not a Drizzle instance:
 * `connectDb()` (src/db/connect.ts) hands back a `pg.Client` talking over
 * the leader-election socket for BOTH the primary and secondary roles (the
 * primary talks to itself through the socket too — see backend.ts) — never
 * a raw PGlite/Drizzle handle a caller could otherwise build a typed query
 * against. Raw SQL here is what actually stays backend-agnostic.
 */
export async function getOrCreateProject(db: LabKitDB, name: string): Promise<Project> {
  const inserted = await db.query<Project>(
    `insert into projects (name) values ($1) on conflict (name) do nothing returning id, name, created_at`,
    [name],
  );
  if (inserted.rows[0]) return inserted.rows[0];

  const existing = await db.query<Project>(`select id, name, created_at from projects where name = $1`, [name]);
  if (!existing.rows[0]) throw new Error(`project "${name}" not found after insert-or-fetch race`);
  return existing.rows[0];
}
