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
import { ReadSurface } from "../src/domain";
import { ref } from "../src/domain/report";
import { writeVerbNames, writeVerbsCalledIn } from "./helpers/read-only";
import { publicVerbsOf, verbsReachedIn } from "./helpers/surface-coverage";

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
  // Derived, not typed out, so a verb added later is covered without anyone
  // remembering -- and derived from BOTH surfaces the CLI holds. Until PJ-028
  // this checked `WriteSurface` alone, which by construction could never
  // contain `TenantGraph.createNode`; the CLI holds one of those too. See
  // tests/helpers/read-only.ts, including what this does and does not prove.
  expect(writeVerbNames().length).toBeGreaterThan(10);
  expect(writeVerbNames()).toContain("createNode");
  expect(writeVerbsCalledIn(code)).toEqual([]);
});

test("every command the usage text advertises is implemented", () => {
  const advertised = [...source.matchAll(/^ {2}labkit (\w+)/gm)].map((m) => m[1]);
  expect(advertised.length).toBeGreaterThan(0);
  const handled = [...source.matchAll(/^ {6}case "(\w+)":/gm)].map((m) => m[1]);
  for (const command of advertised) expect(handled).toContain(command);
});

/**
 * Read verbs deliberately without a command, and why.
 *
 * Empty, and that is the current state rather than a claim it must stay empty.
 * The same shape as `NOT_EXPOSED` in `tests/helpers/surface-coverage.ts`, and
 * for the same reason: a bare list of names would decay into whatever happens
 * to be unimplemented today, so an exclusion has to carry a reason.
 */
const NO_COMMAND_FOR: Readonly<Record<string, string>> = {};

test("every read verb the domain exposes has a CLI command", () => {
  // Derived from the surface declaration and the CLI's own source, so a read
  // verb added later is covered without anyone remembering. This replaced a
  // hardcoded list of five method names, which passed unchanged while eleven
  // reads went unreachable from the terminal and reachable over MCP.
  const reads = publicVerbsOf("src/domain/read.ts");

  // Guard the derivation: a regex that stopped matching would make this pass
  // by having nothing to check.
  expect(reads.length).toBeGreaterThan(10);
  expect(reads).toContain("gateStatus");
  for (const verb of reads) {
    expect(typeof (ReadSurface.prototype as unknown as Record<string, unknown>)[verb]).toBe("function");
  }

  const unreachable = reads
    .filter((v) => verbsReachedIn(code, "read", [v]).length === 0)
    .filter((v) => !(v in NO_COMMAND_FOR));
  expect(unreachable).toEqual([]);
});

test("the CLI hands the event log in rather than letting it default", () => {
  // `SessionCore` defaults `events` to `inMemoryEventLog()`. In a process that
  // exits after one query that is an array nothing ever wrote to, so `happened`
  // would report that nothing has ever happened -- a confidently wrong answer,
  // not an empty one. Asserted on the source because the alternative is
  // standing up a database to observe an absence.
  expect(code).toContain("pgEventLog(connection.db, ctx.tenantId)");
  expect(code).not.toContain("inMemoryEventLog");
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
    enquiry: ref("enquiry", "LOE_1"),
    pursuing: "response-curvature sweep",
    contributed: [],
    question: {
      question: ref("question", "Q_1"),
      asks: "does the pruning schedule move convergence?",
      open: true,
      closure: "accepted-as-unresolved",
      answer: null,
      acceptedBecause: "the confirmatory set is spent",
      reopensIf: "a genuinely new design, or a data source other than the spent set",
      evidence: [],
    },
  };
  const out = renderEnquiry(status);
  expect(out).toContain("accepted as unresolved");
  expect(out).toContain("the confirmatory set is spent");
  expect(out).toContain("a genuinely new design");
});

test("an answered enquiry says whether its closure rests on promoted work", () => {
  const q = {
    question: ref("question", "Q_2"), asks: "does depth move convergence?",
    open: false, closure: "answered" as const, answer: "yes" as const,
    evidence: [{ evidence: ref("evidence", "EV_1"), states: "a result" }],
  };
  const base: EnquiryStatus = {
    enquiry: ref("enquiry", "LOE_2"), pursuing: "depth sweep", contributed: [], question: q,
  };
  expect(renderEnquiry({ ...base, question: { ...q, restsOn: "exploratory" } })).toContain("exploratory");
  expect(renderEnquiry({ ...base, question: { ...q, restsOn: "confirmatory" } })).toContain("confirmatory");
});

test("withdrawn, challenged and never-examined render apart", () => {
  const base: SupportExplanation = {
    claim: ref("claim", "CLM_9"),
    proposition: "the schedule moves convergence",
    supported: false, standing: "exploratory",
    support: [{ finding: "moves by ~3 steps", evidence: ref("evidence", "EV_1"), method: "paired comparison", analysis: ref("analysis", "COMP_1") }],
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
    ...base, challenged: true, against: [{ finding: "no effect at n=5", evidence: ref("evidence", "EV_2"), method: "replication", analysis: ref("analysis", "COMP_2") }],
  });
  expect(challenged).toContain("challenged by evidence");
  expect(challenged).toContain("no effect at n=5");

  // Nobody asserts this wording any more -- and the findings underneath are
  // untouched, which is exactly why the old rendering was misleading.
  const withdrawn = renderWhy({
    ...base, withdrawn: true, replacedBy: { claim: ref("claim", "CLM_9"), asserts: "the schedule moves convergence at depth 8" },
  });
  expect(withdrawn).toContain("withdrawn");
  expect(withdrawn).toContain("the schedule moves convergence at depth 8");
  expect(withdrawn).toContain("moves by ~3 steps");
});

test("identically worded questions are distinguishable in the survey", () => {
  const survey: KnowledgeSurvey = {
    established: [{ question: ref("question", "Q_1"), asks: "does it converge?" }],
    provisional: [],
    accepted: [],
    unresolved: [{ question: ref("question", "Q_2"), asks: "does it converge?" }],
    untested: [{ question: ref("question", "Q_3"), asks: "does depth matter?" }],
  };
  const out = renderKnown(survey);
  expect(out).toContain("does it converge?  [Q_1]");
  expect(out).toContain("does it converge?  [Q_2]");
  // The unambiguous one is not cluttered with an id.
  expect(out).toMatch(/- does depth matter\?$/);
});

// ---------------------------------------------------------------------------
// The commands added for parity with the MCP read tools.
//
// Same fixture discipline as above, and the same reason for it: these are
// typed as the real report interfaces, so a renamed or removed field is a
// compile error here. Each test guards one distinction the report type carries
// and prose is capable of dropping — which is the failure this file exists for.
// ---------------------------------------------------------------------------

import {
  renderClaims,
  renderConflict,
  renderContract,
  renderGate,
  renderHappened,
  renderOrigin,
  renderReproducibility,
  renderReproduction,
} from "../src/cli";
import type {
  ConflictVerdict,
  DomainEvent,
  GateStatus,
  ReproducibilityReport,
  ReproductionReport,
  TaskContract,
} from "../src/domain";

test("a gate that failed and was re-checked does not read as though it never failed", () => {
  const base: GateStatus = {
    gate: ref("gate", "GATE_1"),
    consequence: "the release is blocked",
    state: "satisfied",
    checks: [
      {
        criterion: ref("criterion", "CRIT_1"),
        proposition: "the effect holds at n=20",
        state: "passed",
        evaluations: [],
      },
    ],
    unmet: [],
    evaluations: [],
    gating: [],
    everFailed: true,
  };
  expect(renderGate(base)).toContain("failed at least once");
  // The flag is a separate fact from the state, so the state still prints.
  expect(renderGate(base)).toContain("satisfied");
  expect(renderGate({ ...base, everFailed: false })).not.toContain("failed at least once");
});

test("never-run and no-standing-verdict are printed apart, not as one 'not passed'", () => {
  const status: GateStatus = {
    gate: ref("gate", "GATE_2"),
    consequence: "the release is blocked",
    state: "incomplete",
    checks: [
      {
        criterion: ref("criterion", "CRIT_1"),
        proposition: "nobody has run this",
        state: "never-run",
        evaluations: [],
      },
      {
        criterion: ref("criterion", "CRIT_2"),
        proposition: "this was decided and then withdrawn",
        state: "no-standing-verdict",
        evaluations: [
          {
            evaluation: ref("evaluation", "CEVAL_1"),
            criterion: ref("criterion", "CRIT_2"),
            value: "0.31",
            outcome: "fail",
            at: "2026-03-01T00:00:00.000Z",
            withdrawn: true,
            basis: [],
          },
        ],
      },
    ],
    unmet: [],
    evaluations: [],
    gating: [],
    everFailed: false,
  };
  const out = renderGate(status);
  expect(out).toContain("never-run");
  expect(out).toContain("no-standing-verdict");
  // A withdrawn evaluation is listed and marked, not dropped: a check decided
  // and then withdrawn is not a check nobody ran.
  expect(out).toContain("withdrawn");
});

test("a dissociation is not reported as a disagreement", () => {
  const verdict: ConflictVerdict = {
    conflict: false,
    relation: "dissociation",
    differsBy: "scope",
    sides: [
      {
        claim: ref("claim", "CLM_1"),
        question: ref("question", "Q_1"),
        proposition: "the schedule moves convergence",
        asks: "does it move convergence at depth 4?",
        supportedBy: [{ evidence: ref("evidence", "EV_1"), states: "moves by ~3 steps" }],
        challengedBy: [],
      },
      {
        claim: ref("claim", "CLM_2"),
        question: ref("question", "Q_2"),
        proposition: "the schedule moves convergence",
        asks: "does it move convergence at depth 12?",
        supportedBy: [],
        challengedBy: [{ evidence: ref("evidence", "EV_2"), states: "no effect at depth 12" }],
      },
    ],
  };
  const out = renderConflict(verdict);
  expect(out).toContain("do not disagree");
  expect(out).not.toContain("Contradiction");
  expect(out).toContain("scope");
  // Identically worded, so the questions are what tell the two sides apart.
  expect(out).toContain("depth 4");
  expect(out).toContain("depth 12");

  const contradiction = renderConflict({
    ...verdict,
    conflict: true,
    relation: "contradiction",
    differsBy: null,
  });
  expect(contradiction).toContain("Contradiction");
  expect(contradiction).not.toContain("do not disagree");
});

test("a re-run's report never claims the original was reproduced", () => {
  const report: ReproductionReport = {
    verification: ref("analysis", "COMP_2"),
    verificationMethod: "replication at n=20",
    of: ref("analysis", "COMP_1"),
    ofMethod: "paired comparison",
    conclusion: "agrees",
    verificationRead: [{ part: ref("observations", "ART_1"), name: "sweep-a" }],
    ofRead: [{ part: ref("observations", "ART_1"), name: "sweep-a" }],
    differs: [],
    bearing: "raises",
  };
  const out = renderReproduction(report);
  expect(out).toContain("agrees");
  expect(out).not.toContain("reproduced the");
  expect(out).toContain("does not say the original was reproduced");
});

test("unverifiable inputs render apart from ones that differ", () => {
  const report: ReproducibilityReport = {
    analysis: ref("analysis", "COMP_1"),
    exact: [{ part: ref("observations", "ART_1"), name: "sweep-a" }],
    differing: [{ part: ref("observations", "ART_2"), name: "sweep-b" }],
    unverifiable: [{ part: ref("observations", "ART_3"), name: "sweep-c" }],
    notRebuilt: [{ part: ref("observations", "ART_4"), name: "sweep-d" }],
    reproducible: false,
  };
  const out = renderReproducibility(report);
  // Four buckets, four headings -- and the unverifiable one says why it is not
  // a failure, since the record kept no hash to compare against.
  expect(out).toContain("kept no hash");
  const positions = ["sweep-a", "sweep-b", "sweep-c", "sweep-d"].map((n) => out.indexOf(n));
  expect(positions.every((i) => i >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
});

test("a question nobody sharpened renders as an answer, not a gap", () => {
  const out = renderOrigin(null, ref("question", "Q_1"));
  expect(out).toContain("posed directly");
  expect(out).toContain("not a gap");

  const sharpened = renderOrigin(
    {
      from: ref("question", "Q_0"),
      fromAsks: "does the schedule matter?",
      reason: "the first sweep only moved at depth 4",
      knownAtTheTime: [{ evidence: ref("evidence", "EV_1"), states: "moves by ~3 steps" }],
    },
    ref("question", "Q_1"),
  );
  expect(sharpened).toContain("does the schedule matter?");
  expect(sharpened).toContain("moves by ~3 steps");
  // The frozen-at-the-time caveat, without which a reader takes the list for
  // what is known now.
  expect(sharpened).toContain("not recomputed now");
});

test("a work contract always says it is not enforced", () => {
  const contract: TaskContract = {
    work: ref("work", "TASK_1"),
    objective: "sweep depth 4 through 20",
    acceptance: "a curve with n>=20 at each depth",
    mayRead: ["sweep-a", "sweep-b"],
    enforced: false,
  };
  const out = renderContract(contract);
  expect(out).toContain("sweep-a");
  expect(out).toContain("Not enforced");
});

test("two claims asserting one sentence are not rendered as a duplicate", () => {
  const one = renderClaims(
    [{ claim: ref("claim", "CLM_1"), asserts: "the schedule moves convergence" }],
    "the schedule moves convergence",
  );
  expect(one).toContain("CLM_1");
  expect(one).not.toContain("redundant");

  const two = renderClaims(
    [
      { claim: ref("claim", "CLM_1"), asserts: "the schedule moves convergence" },
      { claim: ref("claim", "CLM_2"), asserts: "the schedule moves convergence" },
    ],
    "the schedule moves convergence",
  );
  expect(two).toContain("CLM_1");
  expect(two).toContain("CLM_2");
  expect(two).toContain("none of them is redundant");

  expect(renderClaims([], "nobody says this")).toContain("nothing on the record asserts");
});

test("an empty event log does not read as an empty record", () => {
  const empty = renderHappened([]);
  expect(empty).toContain("Nothing matching");
  expect(empty).toContain("every other command answers from");

  const events: DomainEvent[] = [
    {
      seq: 7,
      at: "2026-03-01T00:00:00.000Z",
      attribution: {
        attribution_label: "claude-opus-5",
        attribution_id: "sess_1",
        git_hash: "0123456789abcdef",
      },
      operation: "recordAnalysis",
      subject: "COMP_1",
      created: ["CLM_1", "EV_1"],
    },
  ];
  const out = renderHappened(events);
  expect(out).toContain("7");
  expect(out).toContain("recordAnalysis");
  // Who ran it and against what commit -- the two facts the graph cannot answer.
  expect(out).toContain("claude-opus-5");
  expect(out).toContain("@01234567");
  expect(out).toContain("CLM_1");
});
