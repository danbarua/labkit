/**
 * The four inventories: claims, enquiries, analyses, conditions.
 */

import type { ListedAnalysis, ListedClaim, ListedCriterion, ListedEnquiry } from "../../domain";
import type { Palette } from "../palette";

const listed = (title: string, rows: string[], p: Palette): string =>
  rows.length === 0
    ? `${p.heading(`${title} — 0`)}\nnothing`
    : `${p.heading(`${title} — ${rows.length}`)}\n${rows.join("\n")}`;

/** Padded so the states line up; the words themselves are coloured centrally. */
const column = (values: string[]) => {
  const width = Math.max(...values.map((v) => v.length), 0);
  return (value: string) => value.padEnd(width);
};

export function renderClaimList(claims: ListedClaim[], p: Palette): string {
  const bearing = (c: ListedClaim) =>
    c.challenges > 0 ? "challenged" : c.supports > 0 ? "supported" : "unexamined";
  const pad = column(claims.map(bearing));
  return listed(
    "Claims",
    claims.map(
      (c) => `${pad(bearing(c))}  ${c.claim}  ${c.asserts}${c.confirmed ? "  [confirmed]" : ""}`,
    ),
    p,
  );
}

export function renderEnquiryList(enquiries: ListedEnquiry[], p: Palette): string {
  const state = (e: ListedEnquiry) => (e.closed ? "closed" : e.runs > 0 ? "running" : "untested");
  const pad = column(enquiries.map(state));
  return listed(
    "Enquiries",
    enquiries.map((e) => `${pad(state(e))}  ${e.enquiry}  ${e.approach}`),
    p,
  );
}

export function renderAnalysisList(analyses: ListedAnalysis[], p: Palette): string {
  return listed(
    "Analyses",
    analyses.map((a) => `${a.analysis}  ${a.method}  ${p.quiet(`${a.findings} findings`)}`),
    p,
  );
}

export function renderCriterionList(criteria: ListedCriterion[], p: Palette): string {
  const pad = column(criteria.map((c) => c.state));
  return listed(
    "Conditions",
    criteria.map(
      (c) => `${pad(c.state)}  ${c.criterion}  ${c.requires}${c.amended ? "  [amended]" : ""}`,
    ),
    p,
  );
}
