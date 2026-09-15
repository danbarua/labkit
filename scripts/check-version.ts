#!/usr/bin/env bun
/**
 * The patch number is the pull request that ships it.
 *
 * `labkit --version` then names its own change: 0.7.426 is #426. Without this
 * the bump is a step somebody remembers, and the last one was written to a file
 * called `package.jsony` and went unnoticed for two days.
 *
 * Runs only where the pull request number is known — `_PR_NUMBER` on Cloud
 * Build, `GITHUB_REF` elsewhere. On a machine with neither, it says so and
 * passes, because a local `bun run check` has no pull request to compare to.
 *
 * retire-when: the version is written by the merge rather than by hand.
 */

import { readFileSync } from "node:fs";

const pr =
  process.env._PR_NUMBER ||
  process.env.PR_NUMBER ||
  /refs\/pull\/(\d+)\//.exec(process.env.GITHUB_REF ?? "")?.[1];

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

if (!pr) {
  console.log(`OK: version ${version}; no pull request number here to hold it to.`);
  process.exit(0);
}

const patch = version.split(".")[2];
if (patch === pr) {
  console.log(`OK: version ${version} names pull request #${pr}.`);
  process.exit(0);
}

console.error(
  `FAILED: version is ${version}, and this is pull request #${pr}.\n` +
    `  The patch number is the pull request that ships it, so a running binary\n` +
    `  names its own change. Set it to ${version.split(".").slice(0, 2).join(".")}.${pr}`,
);
process.exit(1);
