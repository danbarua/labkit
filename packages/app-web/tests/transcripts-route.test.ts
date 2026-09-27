/** The route that serves packages/acp-transcripts/data from disk for the gallery. */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { transcriptsRoute } from "../src/infra/transcripts-plugin";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "labkit-transcripts-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(name: string, body: unknown) {
  await writeFile(join(dir, name), JSON.stringify(body));
}

describe("transcriptsRoute", () => {
  test("the list names id, title and description, not the events", async () => {
    await write("a.json", { id: "a", title: "A", description: "first", events: [1, 2, 3] });
    const { status, body } = await transcriptsRoute(dir, "");
    expect(status).toBe(200);
    expect(body).toEqual([{ id: "a", title: "A", description: "first" }]);
  });

  test("a named transcript comes back whole, events included", async () => {
    await write("a.json", { id: "a", title: "A", description: "first", events: [1, 2, 3] });
    const { status, body } = await transcriptsRoute(dir, "a");
    expect(status).toBe(200);
    expect(body).toEqual({ id: "a", title: "A", description: "first", events: [1, 2, 3] });
  });

  test("an id nothing on disk answers, is a 404 naming it", async () => {
    const { status, body } = await transcriptsRoute(dir, "missing");
    expect(status).toBe(404);
    expect(body).toMatchObject({ detail: expect.stringContaining("missing") });
  });

  test("a non-json file in the directory is not offered", async () => {
    await write("a.json", { id: "a", title: "A", description: "x", events: [] });
    await writeFile(join(dir, "README.md"), "not json");
    const { body } = await transcriptsRoute(dir, "");
    expect(body).toEqual([{ id: "a", title: "A", description: "x" }]);
  });

  test("one file's malformed JSON is left out of the list, not a reason to fail it", async () => {
    await write("a.json", { id: "a", title: "A", description: "x", events: [] });
    await writeFile(join(dir, "broken.json"), "{not valid json");
    const list = await transcriptsRoute(dir, "");
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ id: "a", title: "A", description: "x" }]);
  });

  test("that same broken file, asked for by name, is a 500 naming the parse failure", async () => {
    await writeFile(join(dir, "broken.json"), "{not valid json");
    const { status, body } = await transcriptsRoute(dir, "broken");
    expect(status).toBe(500);
    expect(body).toMatchObject({ title: "Application Error" });
  });
});
