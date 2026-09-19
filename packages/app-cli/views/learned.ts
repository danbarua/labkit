/**
 * What the programme found out, under the question it was asked for.
 */

import type { Learned } from "@labkit/core-domain";
import type { Palette } from "../palette";
import { rows } from "./format";

export function renderLearned(report: Learned, p: Palette): string {
  if (report.questions.length === 0) return "nothing";
  const questions = report.questions
    .filter((q) => q.found.length > 0)
    .map((q) =>
      [
        `${q.question}  ${q.asks}`,
        ...rows(
          q.found.flatMap((f) => [
            [`  ${f.bearing === "challenges" ? "challenged" : "supported"}`, f.claim, f.asserts],
            ["", `  ${f.finding}`, p.quiet(f.states)],
          ]),
        ),
      ].join("\n"),
    );
  const unanswered = report.questions.filter((q) => q.found.length === 0);
  return [
    p.heading(`Learned — ${report.found} across ${questions.length} questions`),
    "",
    questions.join("\n\n"),
    ...(unanswered.length
      ? ["", p.untested(`Nothing found yet under ${unanswered.map((q) => q.question).join(", ")}`)]
      : []),
  ].join("\n");
}
