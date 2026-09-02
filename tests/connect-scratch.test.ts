/**
 * `connectScratch` opens the directory it is given and never what
 * `LABKIT_DB_URL` names.
 *
 * The hazard is not a test concern. `replayIntoScratch` replays a record's
 * whole history as real writes, so a `--db` Explorer trace taken against a
 * deployment whose `LABKIT_DB_URL` is set would have replayed every one of
 * them into that deployment's own database. It was found as two failing
 * replay tests on the Postgres arm, which is the cheap end of the same bug.
 *
 * The URL below is deliberately unreachable: `connectDb` would try it and
 * fail, so a change routing scratch back through `connectDb` turns this red
 * rather than quietly writing somewhere real.
 */

import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectScratch } from "../src/db/connect";

const NOWHERE = "postgres://nobody:nobody@127.0.0.1:1/labkit_should_never_be_touched";

let previous: string | undefined;
afterEach(() => {
  if (previous === undefined) delete process.env.LABKIT_DB_URL;
  else process.env.LABKIT_DB_URL = previous;
});

test("connectScratch opens the directory it was given, not LABKIT_DB_URL", async () => {
  previous = process.env.LABKIT_DB_URL;
  process.env.LABKIT_DB_URL = NOWHERE;

  const dir = mkdtempSync(join(tmpdir(), "labkit-scratch-test-"));
  try {
    const connection = await connectScratch(dir);
    try {
      // It answered, so it did not go to the unreachable URL — and the
      // database it answered from is on disk here, where the caller asked for
      // it.
      const rows = await connection.db.query<{ one: number }>("SELECT 1 AS one", []);
      expect(rows.rows[0]?.one).toBe(1);
      expect(existsSync(join(dir, "pglite"))).toBe(true);
    } finally {
      await connection.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);
