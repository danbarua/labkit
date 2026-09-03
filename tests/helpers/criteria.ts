/**
 * Reaching a check's evaluations, now that a check does not carry them.
 *
 * `GateStatus` and `whySupported`'s `standard` answer what state each
 * condition is in; the verdict text lives one criterion at a time, behind
 * `why <criterion>`. These scenarios assert on the text, so they reach it the
 * way a caller does.
 *
 * **Criterion-scoped, where a check is gate-scoped.** Identical wherever a
 * criterion governs one gate, which is every scenario using this; a test that
 * needs the narrower list must say so rather than reach here.
 */

import type { CheckStatus, EvaluationRecord, ResearchSession } from "../../src/domain";

/** Every evaluation of the criterion a check names, oldest first. */
export async function evaluationsOf(
  session: ResearchSession,
  check: CheckStatus,
): Promise<EvaluationRecord[]> {
  return (await session.criterionStanding(check.criterion)).evaluations;
}

/** What the evaluation that decided a check actually said. */
export async function decidedOn(
  session: ResearchSession,
  check: CheckStatus,
): Promise<string | undefined> {
  const decided = check.decidedBy;
  if (!decided) return undefined;
  const all = await evaluationsOf(session, check);
  return all.find((e) => e.evaluation === decided.evaluation)?.value;
}
