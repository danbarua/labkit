/**
 * Reaching a check's evaluations, now that a check does not carry them.
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
