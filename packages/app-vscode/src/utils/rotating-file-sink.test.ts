/** The extension's diagnostic log file: rotated at a size, with a bounded number of backups. */

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { rotatingFileSink } from "./rotating-file-sink.ts";

test("diagnostic rotation retains complete records with bounded backups", async () => {
  const directory = await mkdtemp(join(tmpdir(), "labkit-rotation-"));
  try {
    const path = join(directory, "events.jsonl");
    const sink = rotatingFileSink(path, 60, 2);
    for (let index = 0; index < 10; index++)
      sink.write(`${JSON.stringify({ index, event: "operation.completed" })}\n`);
    sink.close();
    expect((await readdir(directory)).sort()).toEqual([
      "events.jsonl",
      "events.jsonl.1",
      "events.jsonl.2",
    ]);
    expect(JSON.parse(await readFile(path, "utf8")).index).toBe(9);
    expect(JSON.parse(await readFile(`${path}.2`, "utf8")).index).toBe(7);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
