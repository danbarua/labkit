/** The files labkit-effect's sessions stored, as the bridge answers them at `/blob/<sha256>.<ext>`. */

import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { labkitBlobs } from "../src/infra/labkit-blobs";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const idOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const ID = idOf(PNG);
const TAMPERED = idOf(new Uint8Array([1, 2, 3]));

let sessionsDir = "";

/** A session folder as labkit-effect keeps one: its facts file, and its blobs named by their ids. */
function session(name: string, blobs: Record<string, Uint8Array>) {
  const folder = path.join(sessionsDir, name);
  mkdirSync(path.join(folder, "blobs"), { recursive: true });
  writeFileSync(path.join(folder, "facts.jsonl"), "");
  for (const [id, bytes] of Object.entries(blobs))
    writeFileSync(path.join(folder, "blobs", id), bytes);
}

beforeAll(() => {
  sessionsDir = mkdtempSync(path.join(tmpdir(), "labkit-blobs-"));
  session("holds-it", { [ID]: PNG });
  session("holds-nothing", {});
  // Bytes that are not the ones the name says.
  session("tampered", { [TAMPERED]: new Uint8Array([9, 9, 9]) });
});

const get = (at: string, method = "GET") =>
  labkitBlobs(sessionsDir)(new Request(`http://bridge.test${at}`, { method }));

describe("a stored file", () => {
  test("is answered with its bytes, the Content-Type its extension names, and headers that keep a browser from running it", async () => {
    const response = await get(`/blob/${ID}.png`);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  });

  test("without an extension is answered as application/octet-stream", async () => {
    const response = await get(`/blob/${ID}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
  });

  test("asked for with HEAD is answered with its headers and no bytes", async () => {
    const response = await get(`/blob/${ID}.png`, "HEAD");
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });
});

describe("a request that names no stored file", () => {
  test("an id no session holds is 404, with the same safety headers and no caching", async () => {
    const response = await get(`/blob/${"0".repeat(64)}.png`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBeNull();
  });

  test("a file whose bytes do not match its id is 404", async () => {
    expect((await get(`/blob/${TAMPERED}`)).status).toBe(404);
  });

  test("a path that is not /blob/<sha256> is 404, and reads nothing outside the sessions", async () => {
    expect((await get("/blob/..%2F..%2Fetc%2Fpasswd")).status).toBe(404);
    expect((await get(`/blob/${ID.toUpperCase()}.png`)).status).toBe(404);
  });

  test("a method other than GET or HEAD is 405", async () => {
    const response = await get(`/blob/${ID}.png`, "DELETE");
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });
});
