#!/usr/bin/env bun
/** Run by `bun install`: records which lockfile node_modules was installed from. */
import { writeFileSync } from "node:fs";
import { lockfileHash, STAMP } from "../../packages/app-cli/installed";

const hash = lockfileHash();
if (hash !== undefined) writeFileSync(STAMP, `${hash}\n`);
