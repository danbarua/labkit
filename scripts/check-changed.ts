#!/usr/bin/env bun
/**
 * The sweep, with the test suite narrowed to what the change can reach.
 *
 * Every check still runs: they are seconds each, and a formatter or a layering
 * rule is not scoped to a package anyway. What narrows is `test`, which is 162
 * of the sweep's 180 seconds.
 *
 * A change to an app runs that app's tests. A change to `core-db` runs
 * everything, because everything depends on it. A change to `scripts/`, the
 * lockfile or a root config runs everything, because it is not a change to a
 * package and there is nothing to scope by.
 *
 * retire-when: `bun test` takes a fraction of the sweep, or bun grows a way to
 * select tests by the workspace they cover.
 *
 * Usage: bun run check:changed [base]      (base defaults to origin/main)
 * Exit:  0 when everything passed, 1 otherwise.
 */

import { runSteps, stepsFor } from "./check-all";
import { changedPackages, packageGraph, reached, testsFor } from "./changed";

const base = process.argv[2] ?? "origin/main";
const changed = changedPackages(base);

const steps = stepsFor();
if (changed === null) {
  console.log(`Nothing to narrow by: the change reaches outside any package.\n`);
} else {
  const all = reached(changed, packageGraph());
  const files = testsFor(all);
  const step = steps.find((s) => s.name === "test");
  if (step === undefined) throw new Error("no `test` step to narrow — check-all.ts changed shape");
  console.log(
    `Changed: ${[...changed].sort().join(", ") || "(nothing)"}\n` +
      `Reaches: ${[...all].sort().join(", ") || "(nothing)"}\n` +
      `Testing: ${files.length} of ${testsFor(new Set(packageGraph().keys())).length} files\n`,
  );
  // Replaced rather than removed: a run that silently skipped the suite would
  // be a green light meaning less than it looks like.
  steps[steps.indexOf(step)] = {
    ...step,
    name: `test (${files.length} files)`,
    // **`bun run test --`, not `bun test`.** A bare `bun test` ignores
    // `package.json`, so the suite's `--timeout` would not apply and a slow
    // test would fail at bun's 5s default. `check:test-ceiling` catches this,
    // and caught it here.
    argv: ["bun", "run", "test", "--", ...files],
  };
}

process.exit(await runSteps(steps));
