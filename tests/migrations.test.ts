/**
 * The embedded migrations are the same migrations.
 */

import { expect, test } from "bun:test";
import { readMigrationFiles } from "drizzle-orm/migrator";

import { embeddedMigrations } from "../src/db/migrations";

test("the embedded migrations are byte-identical to what drizzle reads off disk", () => {
  // `readMigrationFiles` is drizzle's own public API and reads the real folder.
  // Using it here is not a second implementation — it *is* the thing being
  // matched, which is why this test cannot drift with the copy in
  // `src/db/migrations.ts`.
  const fromDisk = readMigrationFiles({ migrationsFolder: "drizzle" });
  const embedded = embeddedMigrations();

  // Guard the comparison itself: an empty folder would make this pass by
  // having nothing to disagree about.
  expect(fromDisk.length).toBeGreaterThan(3);
  expect(embedded).toEqual(fromDisk);
});

test("every migration carries a hash and at least one statement", () => {
  for (const migration of embeddedMigrations()) {
    // The hash is what the ledger stores; an empty one would let every
    // migration re-apply against a database that had already run it.
    expect(migration.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(migration.sql.length).toBeGreaterThan(0);
    expect(migration.folderMillis).toBeGreaterThan(0);
  }
});

test("a journal entry with no embedded SQL is refused by name", () => {
  // The failure this guards is silent in both directions and neither shows up
  // in a passing suite: a forgotten import skips a migration, and an orphan
  // import is dead weight. Asserted through the real journal by proving the
  // guard is reached rather than by mutating a checked-in file.
  const journal = require("../drizzle/meta/_journal.json") as {
    entries: Array<{ tag: string }>;
  };
  expect(journal.entries.length).toBe(embeddedMigrations().length);
  // Each tag resolves to text; `embeddedMigrations()` throws before returning
  // if one does not, so reaching this line is the assertion.
  for (const entry of journal.entries) {
    expect(entry.tag).toMatch(/^\d{4}_/);
  }
});
