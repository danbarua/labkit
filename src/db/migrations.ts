/**
 * Every migration, embedded in the bundle rather than read off disk.
 *
 * **`bun run build` produced a binary that could not migrate**, and had since
 * the day the build script existed. `readMigrationFiles` — drizzle's own —
 * reads `${migrationsFolder}/meta/_journal.json` with `node:fs`, and the folder
 * was located from `import.meta.url`, which inside a `bun build --compile`
 * bundle is `/$bunfs/root/…`. Against an empty database the binary died with
 * `Can't find meta/_journal.json file`. Nothing caught it because nothing had
 * ever run the binary against an empty database; `bun run dev` and `bun test`
 * both read the folder off disk and worked.
 *
 * So the SQL comes in as text imports, which Bun embeds. `journal` drives the
 * order, exactly as drizzle does it, and {@link EMBEDDED} carries the text.
 *
 * **This is drizzle's own shape for a filesystem-less runtime.** Its
 * `durable-sqlite` migrator takes `{ journal, migrations: Record<tag, string> }`
 * for the same reason — a Durable Object has no `fs` either. There is no such
 * migrator for pglite, so {@link embeddedMigrations} builds the `MigrationMeta[]`
 * that `readMigrationFiles` would have returned.
 *
 * **Byte-identical to a disk read, and that is the property that matters.** The
 * hash is `sha256` of the whole file and the statement split is on
 * `--> statement-breakpoint`, both copied from `readMigrationFiles` rather than
 * reinvented — so a database migrated before this change has a ledger that
 * still matches, and nothing re-applies. `tests/migrations.test.ts` asserts the
 * two are deep-equal rather than trusting the copy.
 *
 * **One source of truth, not one per runtime.** `runMigrations()` uses this
 * everywhere — dev, tests, binary. A disk path kept "for development" would be
 * the path everything tests while the binary runs the other one.
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
 *
 * **Adding a migration means adding a line here.** That is a second place to
 * remember, and it is deliberate: the alternative is a generated file plus a
 * `check:*` to keep it fresh, which is more machinery than four imports. What
 * makes it safe is that {@link embeddedMigrations} refuses a mismatch in either
 * direction, and every `bun test` calls it during setup — so forgetting the
 * line fails the whole suite at boot with the tag named, not silently in a
 * binary nobody ran.
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
 *
 * The `sql`/`bps`/`folderMillis`/`hash` construction is drizzle's, verbatim.
 * Diverging from it would not fail loudly — it would write a different hash
 * into `drizzle.__drizzle_migrations` and leave two databases disagreeing about
 * what has run.
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
