#!/usr/bin/env bun
/**
 * The stack the browser tests run against, on a database of its own.
 *
 * A scratch database with two workspaces, the API on it, the Vite dev server, and `vite preview`
 * of a fresh production build. Preview starts last, so its being reachable means everything is,
 * and that is the URL Playwright waits on. `LABKIT_DB_URL` names the Postgres server the
 * database is created on.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createScratchDb } from "../tests/support/scratch-db";

const serverUrl = process.env.LABKIT_DB_URL;
if (!serverUrl) {
  console.error(
    "e2e needs LABKIT_DB_URL: a Postgres server it may create a throwaway database on.",
  );
  process.exit(1);
}

const port = (name: string, fallback: number) => String(Number(process.env[name] ?? fallback));
const ports = {
  api: port("E2E_PORT_API", 8999),
  dev: port("E2E_PORT_DEV", 8950),
  built: port("E2E_PORT_BUILT", 8951),
};

const scratch = await createScratchDb(serverUrl);
// The bundle goes in a directory of its own, so a test run leaves nothing in the package.
const built = await mkdtemp(path.join(tmpdir(), "labkit-e2e-"));
const env = { ...process.env, LABKIT_DB_URL: scratch.url, LABKIT_PORT_WEB: ports.api };
const vite = "node_modules/vite/bin/vite.js";
const inherit = { env, stdout: "inherit", stderr: "inherit" } as const;

const children: Bun.Subprocess[] = [];
let stopping = false;

async function stop(code: number): Promise<never> {
  if (!stopping) {
    stopping = true;
    for (const child of children) child.kill();
    await Promise.all(children.map((child) => child.exited));
    await scratch.drop();
    await rm(built, { recursive: true, force: true });
  }
  process.exit(code);
}
process.on("SIGINT", () => void stop(0));
process.on("SIGTERM", () => void stop(0));

async function reachable(url: string, seconds: number): Promise<boolean> {
  for (let i = 0; i < seconds * 4; i++) {
    if (
      await fetch(url).then(
        (res) => res.ok,
        () => false,
      )
    )
      return true;
    await Bun.sleep(250);
  }
  return false;
}

try {
  children.push(
    Bun.spawn(["bun", "src/server/main.ts"], inherit),
    Bun.spawn(["bun", vite, "--host", "127.0.0.1", "--port", ports.dev, "--strictPort"], {
      ...inherit,
      env: { ...env, LABKIT_PORT_EXPLORER: ports.dev },
    }),
  );
  if (!(await reachable(`http://127.0.0.1:${ports.dev}/healthz`, 60))) {
    throw new Error("the API and dev server did not come up");
  }

  const build = Bun.spawn(["bun", vite, "build", "--outDir", built, "--emptyOutDir"], inherit);
  if ((await build.exited) !== 0) throw new Error("vite build failed");

  children.push(
    Bun.spawn(
      [
        "bun",
        vite,
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        ports.built,
        "--strictPort",
        "--outDir",
        built,
      ],
      inherit,
    ),
  );
  // A child ending on its own is a failure of the stack, and the run should not carry on without it.
  for (const child of children) void child.exited.then(() => stopping || stop(1));
  await new Promise(() => {});
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  await stop(1);
}
