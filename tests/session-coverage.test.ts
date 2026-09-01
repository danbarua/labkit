/**
 * Does every public domain verb reach `ResearchSession`?
 *
 * `session.ts` already checks, at compile time, that `ResearchSession`
 * delegates every verb `ResearchWrites`/`ResearchReads` name — but both are
 * hand-written `Pick<Surface, "a" | "b" | …>` lists, and `Pick` only demands
 * the keys it names. A verb the list never mentions is invisible to that
 * check and to `tsc`: `now` (`ReadSurface`) shipped, was never added to
 * `ResearchReads`, and `bun run typecheck` stayed green throughout, because
 * nothing asked the list itself whether it was complete.
 *
 * This is that question, asked the same way `tests/mcp.test.ts` and
 * `tests/cli/coverage.test.ts` ask it of their own adapters: derive the real
 * verb set from the class declaration (`publicVerbsOf`, which reads
 * `private`/`protected` off the AST — `keyof WriteSurface` cannot, since
 * TypeScript's accessibility modifiers are erased from a type's key set),
 * and compare it against the list. `tests/scenarios/` can reach a verb only
 * through `ResearchSession`, so a verb missing here is reachable from the
 * CLI and MCP and tested by no scenario at all.
 */

import { expect, test } from "bun:test";
import { RESEARCH_READ_VERBS, RESEARCH_WRITE_VERBS } from "../src/domain";
import { publicVerbsOf } from "./helpers/surface-coverage";

/**
 * Verbs deliberately outside `ResearchReads`/`RESEARCH_WRITE_VERBS`, and why.
 *
 * The same shape as `NOT_EXPOSED` in `tests/helpers/surface-coverage.ts`: a
 * bare list of names would decay into whatever happens to be missing today.
 */
const NOT_DELEGATED: Readonly<Record<string, string>> = {};

test("every public read verb is named in RESEARCH_READ_VERBS, or excluded with a reason", () => {
  const reads = publicVerbsOf("src/domain/read.ts");
  expect(reads.length).toBeGreaterThan(10);
  expect(reads).toContain("gateStatus");

  const listed = new Set<string>(RESEARCH_READ_VERBS);
  const missing = reads.filter((v) => !listed.has(v) && !(v in NOT_DELEGATED));
  expect(missing).toEqual([]);
});

test("every public write verb is named in RESEARCH_WRITE_VERBS, or excluded with a reason", () => {
  const writes = publicVerbsOf("src/domain/write.ts");
  expect(writes.length).toBeGreaterThan(10);
  expect(writes).toContain("recordAnalysis");

  const listed = new Set<string>(RESEARCH_WRITE_VERBS);
  const missing = writes.filter((v) => !listed.has(v) && !(v in NOT_DELEGATED));
  expect(missing).toEqual([]);
});
