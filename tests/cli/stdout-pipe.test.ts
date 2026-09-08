/**
 * A report reaches a pipe whole, not just a file.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectScratch } from "../../src/db/connect";
import { resolveTenantContext } from "../../src/db/tenant";
import { scopeToTenant } from "../../src/db/scoped";
import { TenantGraph } from "../../src/db/graph";
import { pgEventLog } from "../../src/domain/event-store";
import { WriteSurface, systemClock } from "../../src/domain";

const CLI = join(import.meta.dir, "..", "..", "src", "cli", "cli.ts");
/** Comfortably past one 64 KiB pipe buffer once rendered. */
const NOTES = 1200;

let home: string;

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "labkit-stdout-pipe-"));
  const connection = await connectScratch(join(home, ".labkit"));
  try {
    const ctx = await resolveTenantContext(connection.db, connection.tx, "labkit");
    await scopeToTenant(connection.db, ctx);
    const graph = new TenantGraph(ctx, connection.db, connection.tx);
    const write = new WriteSurface(graph, {
      clock: systemClock,
      events: pgEventLog(connection.db, ctx.tenantId),
    });
    for (let i = 0; i < NOTES; i++) {
      await write.note({
        text: `note ${i} — padding, so the rendered report is wide as well as long`,
      });
    }
  } finally {
    await connection.close();
  }
}, 60000);

afterAll(() => rmSync(home, { recursive: true, force: true }));

/**
 * The CLI's own bytes, once to a file and once through a real shell pipe.
 */
function bytes(): { file: number; piped: number } {
  const out = join(home, "out.txt");
  const cli = `bun ${JSON.stringify(CLI)} --db ${JSON.stringify(home)} happened --limit 2000`;
  // Removed rather than set empty: `connectDb` reads the variable's presence,
  // and the Postgres arm sets one that would win over `--db`.
  const env = { ...process.env };
  delete env.LABKIT_DB_URL;
  const run = (script: string) => Bun.spawnSync(["bash", "-c", script], { env });

  const toFile = run(`${cli} > ${JSON.stringify(out)}`);
  expect(toFile.exitCode).toBe(0);
  const piped = run(`${cli} | wc -c`);
  expect(piped.exitCode).toBe(0);

  return {
    file: Bun.file(out).size,
    piped: Number(piped.stdout.toString().trim()),
  };
}

test("a report longer than a pipe buffer reaches a pipe whole", () => {
  const { file, piped } = bytes();

  // Bigger than one 64 KiB buffer, or the test cannot fail for its own reason.
  expect(file).toBeGreaterThan(64 * 1024);

  // The file is the control: the same command, the same render, an fd that
  // takes every byte. A pipe must not be shorter.
  expect(piped).toBe(file);
}, 120000);
