/**
 * The four inventories: claims, enquiries, analyses, conditions.
 */

import type { ListedAnalysis, ListedClaim, ListedCriterion, ListedEnquiry } from "../../domain";
import type { Palette } from "../palette";
import { rows } from "./format";

const listed = (title: string, rows: string[], p: Palette): string =>
  rows.length === 0
    ? `${p.heading(`${title} — 0`)}\nnothing`
    : `${p.heading(`${title} — ${rows.length}`)}\n${rows.join("\n")}`;

export function renderClaimList(claims: ListedClaim[], p: Palette): string {
  const bearing = (c: ListedClaim) =>
    c.challenges > 0 ? "challenged" : c.supports > 0 ? "supported" : "unexamined";
  return listed(
    "Claims",
    rows(
      claims.map((c) => [bearing(c), c.claim, `${c.asserts}${c.confirmed ? "  [confirmed]" : ""}`]),
    ),
    p,
  );
}

export function renderEnquiryList(enquiries: ListedEnquiry[], p: Palette): string {
  const state = (e: ListedEnquiry) => (e.closed ? "closed" : e.runs > 0 ? "running" : "untested");
  return listed("Enquiries", rows(enquiries.map((e) => [state(e), e.enquiry, e.approach])), p);
}

export function renderAnalysisList(analyses: ListedAnalysis[], p: Palette): string {
  return listed(
    "Analyses",
    rows(analyses.map((a) => [a.analysis, `${a.method}  ${p.quiet(`${a.findings} findings`)}`])),
    p,
  );
}

export function renderCriterionList(criteria: ListedCriterion[], p: Palette): string {
  return listed(
    "Conditions",
    rows(
      criteria.map((c) => [c.state, c.criterion, `${c.requires}${c.amended ? "  [amended]" : ""}`]),
    ),
    p,
  );
}
