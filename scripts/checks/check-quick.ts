#!/usr/bin/env bun
/**
 * The checks that answer in seconds, for before a commit rather than after a build.
 *
 * `bun run check` takes about three minutes, and 162 of those seconds are the
 * test suite. Everything else is measured below. Waiting for CI to report a
 * formatter disagreement is the cost this exists to remove.
 *
 * | step              | measured |
 * | ----------------- | -------- |
 * | test              | 162.0s   |
 * | check:cli         |  13.7s   |
 * | check:binary      |   3.6s   |
 * | typecheck         |   2.5s   |
 * | everything else   |  <1s each, ~4s together |
 *
 * **The list is derived, not written.** `check-all.ts` builds its steps from
 * the `check:*` scripts in `package.json`; this runs the same derivation and
 * drops the three that run or build the product. A `check:*` added later is in
 * both sweeps without anyone editing either file.
 *
 * **This is not a gate and it hides nothing.** `check` still runs everything,
 * including the three skipped here, and this prints which three they were. If
 * a new check turns out to be slow it lands here and is felt immediately —
 * that is the signal, and the fix is one name in `SLOW`.
 *
 * Usage: bun run check:quick
 * Exit:  0 when everything passed, 1 otherwise.
 */

import { SLOW, stepsFor, runSteps } from "./check-all.ts";

const all = stepsFor();
const quick = all.filter((step) => !SLOW.has(step.name));
const skipped = all.filter((step) => SLOW.has(step.name)).map((step) => step.name);

console.log(`Skipping ${skipped.join(", ")} — \`bun run check\` runs those.\n`);
process.exit(await runSteps(quick));
