/**
 * Every migration, embedded in the bundle rather than read off disk.
 */

import crypto from "node:crypto";
import type { MigrationMeta } from "drizzle-orm/migrator";

import journal from "../../drizzle/meta/_journal.json";

import m0000 from "../../drizzle/0000_overrated_texas_twister.sql" with { type: "text" };
import m0001 from "../../drizzle/0001_age_bootstrap.sql" with { type: "text" };
import m0002 from "../../drizzle/0002_natural_ids.sql" with { type: "text" };
import m0003 from "../../drizzle/0003_tense_hawkeye.sql" with { type: "text" };
import m0004 from "../../drizzle/0004_typical_bloodstrike.sql" with { type: "text" };
import m0005 from "../../drizzle/0005_equal_elektra.sql" with { type: "text" };
import m0006 from "../../drizzle/0006_sour_vermin.sql" with { type: "text" };
import m0007 from "../../drizzle/0007_note_natural_id.sql" with { type: "text" };
import m0008 from "../../drizzle/0008_concerned_next_avengers.sql" with { type: "text" };

/**
 * Tag to SQL, one entry per file in `drizzle/`.
 */
const EMBEDDED: Readonly<Record<string, string>> = {
  "0000_overrated_texas_twister": m0000,
  "0001_age_bootstrap": m0001,
  "0002_natural_ids": m0002,
  "0003_tense_hawkeye": m0003,
  "0004_typical_bloodstrike": m0004,
  "0005_equal_elektra": m0005,
  "0006_sour_vermin": m0006,
  "0007_note_natural_id": m0007,
  "0008_concerned_next_avengers": m0008,
};

/**
 * What `readMigrationFiles({ migrationsFolder: "drizzle" })` would return.
 */
export function embeddedMigrations(): MigrationMeta[] {
  // Both directions, because they fail differently and both fail silently. A
  // journal entry with no text would skip a migration; an embedded file the
  // journal does not list would be dead weight nobody notices.
  const tags = new Set(journal.entries.map((e) => e.tag));
  for (const tag of tags) {
    if (!(tag in EMBEDDED)) {
      throw new Error(
        `migration \`${tag}\` is in drizzle/meta/_journal.json but not imported in src/db/migrations.ts`,
      );
    }
  }
  for (const tag of Object.keys(EMBEDDED)) {
    if (!tags.has(tag)) {
      throw new Error(
        `migration \`${tag}\` is imported in src/db/migrations.ts but not in drizzle/meta/_journal.json`,
      );
    }
  }

  return journal.entries.map((entry) => {
    const query = EMBEDDED[entry.tag] as string;
    return {
      sql: query.split("--> statement-breakpoint"),
      bps: entry.breakpoints,
      folderMillis: entry.when,
      hash: crypto.createHash("sha256").update(query).digest("hex"),
    };
  });
}
