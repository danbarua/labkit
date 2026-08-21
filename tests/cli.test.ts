/**
 * The CLI is read-only, and the test that matters is the structural one.
 *
 * It constructs a `ReadSurface`, never a `ResearchSession`, so no write verb is
 * in scope to reach for. That is the property worth asserting: a convention
 * that the CLI "only reads" is worth nothing next to a surface that cannot
 * write.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ReadSurface, WriteSurface } from "../src/domain";

const source = readFileSync("src/cli.ts", "utf8");
/** Comments explain what the CLI deliberately does not do, and naming a thing
 *  in prose is not importing it. Strip them before checking. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the CLI imports the read half and not the write half", () => {
  expect(code).toContain("ReadSurface");
  expect(code).not.toContain("WriteSurface");
  expect(code).not.toContain("ResearchSession");
});

test("no write verb name appears in the CLI", () => {
  // Every method on WriteSurface, checked against the CLI's text. A new write
  // verb added later is covered automatically -- the list is derived, not typed
  // out, so this cannot go stale the way a hand-written list would.
  const writeVerbs = Object.getOwnPropertyNames(WriteSurface.prototype).filter(
    (n) => n !== "constructor" && !n.startsWith("_"),
  );
  expect(writeVerbs.length).toBeGreaterThan(10);
  const leaked = writeVerbs.filter((v) => new RegExp(`\\b${v}\\s*\\(`).test(code));
  expect(leaked).toEqual([]);
});

test("every command the usage text advertises is implemented", () => {
  const advertised = [...source.matchAll(/^ {2}labkit (\w+)/gm)].map((m) => m[1]);
  expect(advertised.length).toBeGreaterThan(0);
  const handled = [...source.matchAll(/^ {6}case "(\w+)":/gm)].map((m) => m[1]);
  for (const command of advertised) expect(handled).toContain(command);
});

test("the read surface exposes what the CLI calls", () => {
  for (const method of ["whatIsKnown", "whatWasKnown", "whySupported", "whatDependsOn", "enquiryStatus"]) {
    expect(typeof (ReadSurface.prototype as unknown as Record<string, unknown>)[method]).toBe("function");
  }
});

// ---------------------------------------------------------------------------
// Rendering, which is where an external review found the real defects.
//
// The structural tests above check that the CLI cannot write. They said
// nothing about whether what it prints is what the read surface said, and on
// 2026-08-21 a review found three distinctions the domain has scenarios for
// being dropped between the report and the page. Every one was correct in
// `--json`.
//
// Fixtures rather than a seeded graph, deliberately. These are typed as the
// real report interfaces, so a renamed or removed field is a compile error
// here — which is the coupling that matters. What the *domain* puts in those
// fields is already covered by the scenarios, and re-deriving a withdrawn
// interpretation through five verbs would test that again rather than this.
// ---------------------------------------------------------------------------

import { parseArgs, renderEnquiry, renderWhy, renderKnown } from "../src/cli";
import type { EnquiryStatus, SupportExplanation, KnowledgeSurvey } from "../src/domain";

test("flags may precede the positional argument", () => {
  // The bug: positionals were "the first argument not starting with --", so a
  // flag's value was read as the proposition.
  const before = parseArgs(["why", "--tenant", "acme", "the schedule moves convergence"]);
  expect(before.command).toBe("why");
  expect(before.positionals[0]).toBe("the schedule moves convergence");
  expect(before.flags.tenant).toBe("acme");

  const after = parseArgs(["why", "the schedule moves convergence", "--tenant", "acme"]);
  expect(after.positionals).toEqual(before.positionals);
  expect(after.flags).toEqual(before.flags);

  expect(parseArgs(["known", "--json", "--at", "2026-03-01T00:00:00.000Z"]).json).toBe(true);
  expect(parseArgs(["known", "--json"]).flags.at).toBeUndefined();
});

test("an enquiry accepted as unresolved does not render as merely open", () => {
  const status: EnquiryStatus = {
    enquiry: "LOE_1",
    question: "does the pruning schedule move convergence?",
    open: true,
    closure: "accepted-as-unresolved",
    answer: null,
    acceptedBecause: "the confirmatory set is spent",
    reopensIf: "a genuinely new design, or a data source other than the spent set",
    evidence: [],
  };
  const out = renderEnquiry(status);
  expect(out).toContain("accepted as unresolved");
  expect(out).toContain("the confirmatory set is spent");
  expect(out).toContain("a genuinely new design");
});

test("an answered enquiry says whether its closure rests on promoted work", () => {
  const base: EnquiryStatus = {
    enquiry: "LOE_2", question: "does depth move convergence?",
    open: false, closure: "answered", answer: "yes", evidence: ["a result"],
  };
  expect(renderEnquiry({ ...base, restsOn: "exploratory" })).toContain("exploratory");
  expect(renderEnquiry({ ...base, restsOn: "confirmatory" })).toContain("confirmatory");
});

test("withdrawn, challenged and never-examined render apart", () => {
  const base: SupportExplanation = {
    proposition: "the schedule moves convergence",
    supported: false, standing: "exploratory",
    support: [{ finding: "moves by ~3 steps", via: "COMP_1" }],
    reverifiedBy: [], standard: [], unmet: [], restingOn: [], superseded: [],
    challenged: false, against: [], withdrawn: false,
  };

  // Nobody has examined it: no qualifier, and that is correct.
  const untouched = renderWhy({ ...base, support: [] });
  expect(untouched).toContain("NOT supported");
  expect(untouched).not.toContain("withdrawn");
  expect(untouched).not.toContain("challenged");

  // Evidence bears against it.
  const challenged = renderWhy({
    ...base, challenged: true, against: [{ finding: "no effect at n=5", via: "COMP_2" }],
  });
  expect(challenged).toContain("challenged by evidence");
  expect(challenged).toContain("no effect at n=5");

  // Nobody asserts this wording any more -- and the findings underneath are
  // untouched, which is exactly why the old rendering was misleading.
  const withdrawn = renderWhy({
    ...base, withdrawn: true, replacedBy: "the schedule moves convergence at depth 8",
  });
  expect(withdrawn).toContain("withdrawn");
  expect(withdrawn).toContain("the schedule moves convergence at depth 8");
  expect(withdrawn).toContain("moves by ~3 steps");
});

test("identically worded questions are distinguishable in the survey", () => {
  const survey: KnowledgeSurvey = {
    established: [{ question: "Q_1", asks: "does it converge?" }],
    provisional: [],
    accepted: [],
    unresolved: [{ question: "Q_2", asks: "does it converge?" }],
    untested: [{ question: "Q_3", asks: "does depth matter?" }],
  };
  const out = renderKnown(survey);
  expect(out).toContain("does it converge?  [Q_1]");
  expect(out).toContain("does it converge?  [Q_2]");
  // The unambiguous one is not cluttered with an id.
  expect(out).toMatch(/- does depth matter\?$/);
});
