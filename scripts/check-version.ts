#!/usr/bin/env bun
/**
 * The patch number is the pull request that ships it.
 *
 * `labkit --version` then names its own change: 0.7.426 is #426. Without this
 * the bump is a step somebody remembers, and the last one was written to a file
 * called `package.jsony` and went unnoticed for two days.
 *
 * Needs the pull request number — `_PR_NUMBER` on Cloud Build, `GITHUB_REF`
 * elsewhere. A local `bun run check` has no pull request, so it says so and
 * passes; under `CI` the number's absence is itself the failure, because a
 * check that quietly stops being given its input prints success forever.
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
  if (process.env.CI) {
    console.error(
      `FAILED: no pull request number, and this is CI.\n` +
        `  This check compares the patch number to the pull request, so without one it\n` +
        `  verifies nothing. Pass \`_PR_NUMBER\` to the step (cloudbuild.test.yaml).`,
    );
    process.exit(1);
  }
  console.log(`version ${version}; no pull request here to hold it to.`);
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
