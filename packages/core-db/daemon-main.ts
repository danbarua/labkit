#!/usr/bin/env bun
/** Entry for a daemon spawned from source: `bun daemon-main.ts <datadir>`. */
import { stderrLine } from "./colour";
import { runDaemon } from "./daemon";

const dataDir = process.argv[2];
if (!dataDir) {
  stderrLine("usage: daemon-main.ts <datadir>");
  process.exit(2);
}
process.exit(await runDaemon(dataDir));
