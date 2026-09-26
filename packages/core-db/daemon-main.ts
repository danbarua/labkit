#!/usr/bin/env bun
/** Entry for a daemon spawned from source: `bun daemon-main.ts <datadir>`. */
import { runDaemon } from "./daemon";

const dataDir = process.argv[2];
if (!dataDir) {
  console.error("usage: daemon-main.ts <datadir>");
  process.exit(2);
}
process.exit(await runDaemon(dataDir));
