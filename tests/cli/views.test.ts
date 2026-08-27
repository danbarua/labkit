/**
 * The views, held to the distinctions the reports carry.
 *
 * **These assertions are the old `tests/cli.test.ts`'s, moved unchanged.** That
 * is the point of a port rather than a rewrite: an external review of the first
 * renderers (2026-08-21) found three distinctions the domain has scenarios for
 * being dropped between the report and the page, every one correct in `--json`,
 * and these are the tests that came out of it. Re-deriving them against new
 * modules would test the new modules against a fresh reading of the same code,
 * which is not the same thing at all.
 *
 * Only the imports changed: the renderers now live in `src/cli/views/`, split
 * by what they render rather than piled in one file.
 *
 * Fixtures rather than a seeded graph, as before. They are typed as the real
 * report interfaces, so a renamed or removed field is a compile error here —
 * which is the coupling that matters. What the *domain* puts in those fields is
 * covered by the scenarios.
 */

import { expect, test } from "bun:test";
import { ref } from "../../src/domain/report";
import { asHandles } from "../../src/cli/output";
import { PLAIN, palette } from "../../src/cli/palette";
import {
  renderKnown,
  renderWhy,
  renderClaims,
  renderConflict,
} from "../../src/cli/views/knowledge";
import { renderEnquiry, renderOrigin } from "../../src/cli/views/enquiry";
import { renderContract, renderGate } from "../../src/cli/views/gates";
import { renderReproducibility, renderReproduction } from "../../src/cli/views/analysis";
import { renderHappened } from "../../src/cli/views/events";
import type {
  ConflictVerdict,
  DomainEvent,
  EnquiryStatus,
  GateStatus,
  KnowledgeSurvey,
  ReproducibilityReport,
  ReproductionReport,
  SupportExplanation,
  TaskContract,
} from "../../src/domain";

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
  const out = renderEnquiry(status, PLAIN);
  expect(out).toContain("accepted as unresolved");
  expect(out).toContain("the confirmatory set is spent");
  expect(out).toContain("a genuinely new design");
});

test("an answered enquiry says whether its closure rests on promoted work", () => {
  const q = {
    question: ref("question", "Q_2"),
    asks: "does depth move convergence?",
    open: false,
    closure: "answered" as const,
    answer: "yes" as const,
    evidence: [{ evidence: ref("evidence", "EV_1"), states: "a result" }],
  };
  const base: EnquiryStatus = {
    enquiry: ref("enquiry", "LOE_2"),
    pursuing: "depth sweep",
    contributed: [],
    question: q,
  };
  expect(renderEnquiry({ ...base, question: { ...q, restsOn: "exploratory" } }, PLAIN)).toContain(
    "exploratory",
  );
  expect(renderEnquiry({ ...base, question: { ...q, restsOn: "confirmatory" } }, PLAIN)).toContain(
    "confirmatory",
  );
});

test("withdrawn, challenged and never-examined render apart", () => {
  const base: SupportExplanation = {
    claim: ref("claim", "CLM_9"),
    proposition: "the schedule moves convergence",
    supported: false,
    standing: "exploratory",
    support: [
      {
        finding: "moves by ~3 steps",
        evidence: ref("evidence", "EV_1"),
        method: "paired comparison",
        analysis: ref("analysis", "COMP_1"),
      },
    ],
    reverifiedBy: [],
    standard: [],
    unmet: [],
    restingOn: [],
    superseded: [],
    challenged: false,
    against: [],
    withdrawn: false,
  };

  // Nobody has examined it: no qualifier, and that is correct.
  const untouched = renderWhy({ ...base, support: [] }, PLAIN);
  expect(untouched).toContain("NOT supported");
  expect(untouched).not.toContain("withdrawn");
  expect(untouched).not.toContain("challenged");

  // Evidence bears against it.
  const challenged = renderWhy(
    {
      ...base,
      challenged: true,
      against: [
        {
          finding: "no effect at n=5",
          evidence: ref("evidence", "EV_2"),
          method: "replication",
          analysis: ref("analysis", "COMP_2"),
        },
      ],
    },
    PLAIN,
  );
  expect(challenged).toContain("challenged by evidence");
  expect(challenged).toContain("no effect at n=5");

  // Nobody asserts this wording any more -- and the findings underneath are
  // untouched, which is exactly why the old rendering was misleading.
  const withdrawn = renderWhy(
    {
      ...base,
      withdrawn: true,
      replacedBy: {
        claim: ref("claim", "CLM_9"),
        asserts: "the schedule moves convergence at depth 8",
      },
    },
    PLAIN,
  );
  expect(withdrawn).toContain("withdrawn");
  expect(withdrawn).toContain("the schedule moves convergence at depth 8");
  expect(withdrawn).toContain("moves by ~3 steps");
});

test("every question in the survey carries its handle", () => {
  const survey: KnowledgeSurvey = {
    established: [{ question: ref("question", "Q_1"), asks: "does it converge?" }],
    provisional: [],
    accepted: [],
    unresolved: [{ question: ref("question", "Q_2"), asks: "does it converge?" }],
    untested: [{ question: ref("question", "Q_3"), asks: "does depth matter?" }],
  };
  const out = renderKnown(survey, PLAIN);
  // Two questions may share wording, so the handle is what tells them apart.
  expect(out).toContain("does it converge?  (Q_1)");
  expect(out).toContain("does it converge?  (Q_2)");
  // And the unambiguous one carries its handle too, because a handle is not a
  // disambiguator — it is what the next command takes. A row without one can
  // be read and not acted on.
  expect(out).toContain("does depth matter?  (Q_3)");
});

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
  expect(renderGate(base, PLAIN)).toContain("failed at least once");
  // The flag is a separate fact from the state, so the state still prints.
  expect(renderGate(base, PLAIN)).toContain("satisfied");
  expect(renderGate({ ...base, everFailed: false }, PLAIN)).not.toContain("failed at least once");
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
  const out = renderGate(status, PLAIN);
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
        challengedBy: [
          {
            evidence: ref("evidence", "EV_2"),
            states: "no effect at depth 12",
          },
        ],
      },
    ],
  };
  const out = renderConflict(verdict, PLAIN);
  expect(out).toContain("do not disagree");
  expect(out).not.toContain("Contradiction");
  expect(out).toContain("scope");
  // Identically worded, so the questions are what tell the two sides apart.
  expect(out).toContain("depth 4");
  expect(out).toContain("depth 12");

  const contradiction = renderConflict(
    {
      ...verdict,
      conflict: true,
      relation: "contradiction",
      differsBy: null,
    },
    PLAIN,
  );
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
  const out = renderReproduction(report, PLAIN);
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
  const out = renderReproducibility(report, PLAIN);
  // Four buckets, four headings -- and the unverifiable one says why it is not
  // a failure, since the record kept no hash to compare against.
  expect(out).toContain("kept no hash");
  const positions = ["sweep-a", "sweep-b", "sweep-c", "sweep-d"].map((n) => out.indexOf(n));
  expect(positions.every((i) => i >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
});

test("a question nobody sharpened renders as an answer, not a gap", () => {
  const out = renderOrigin(null, ref("question", "Q_1"), PLAIN);
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
    PLAIN,
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
  const out = renderContract(contract, PLAIN);
  expect(out).toContain("sweep-a");
  expect(out).toContain("Not enforced");
});

test("two claims asserting one sentence are not rendered as a duplicate", () => {
  const one = renderClaims(
    [
      {
        claim: ref("claim", "CLM_1"),
        asserts: "the schedule moves convergence",
      },
    ],
    "the schedule moves convergence",
    PLAIN,
  );
  expect(one).toContain("CLM_1");
  expect(one).not.toContain("redundant");

  const two = renderClaims(
    [
      {
        claim: ref("claim", "CLM_1"),
        asserts: "the schedule moves convergence",
      },
      {
        claim: ref("claim", "CLM_2"),
        asserts: "the schedule moves convergence",
      },
    ],
    "the schedule moves convergence",
    PLAIN,
  );
  expect(two).toContain("CLM_1");
  expect(two).toContain("CLM_2");
  expect(two).toContain("none of them is redundant");

  expect(renderClaims([], "nobody says this", PLAIN)).toContain("nothing on the record asserts");
});

test("an empty event log does not read as an empty record", () => {
  const empty = renderHappened([], PLAIN);
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
  const out = renderHappened(events, PLAIN);
  expect(out).toContain("7");
  expect(out).toContain("recordAnalysis");
  // Who ran it and against what commit -- the two facts the graph cannot answer.
  expect(out).toContain("claude-opus-5");
  expect(out).toContain("@01234567");
  expect(out).toContain("CLM_1");
});

// ---------------------------------------------------------------------------
// Colour.
//
// **Every assertion above renders with `PLAIN`**, which is what `bun test`
// would get anyway — stdout is not a terminal, so `isColorSupported` is false
// and the composition root hands out an identity palette. That is exactly the
// trap `docs/TASKS.md` named when this was queued: if the palette were a
// module-level global rather than a parameter, all thirteen of those tests
// would silently be checking the uncoloured path and nothing would check the
// other one.
//
// So these render the same fixtures through a forced-on palette and assert on
// the difference — not on specific escape codes, which would be testing
// picocolors, but on the properties that matter: the colour is there, it lands
// on the state word rather than the whole line, and turning it on changes
// nothing a reader would read.
// ---------------------------------------------------------------------------

const COLOUR = palette(true);
const ESC = "\u001b";

/**
 * Strips every SGR sequence, so a coloured page can be compared to a plain one.
 *
 * The rule below is right in general — a control character in a regex is
 * usually a typo — and this is the case it is wrong about: matching ANSI is
 * what the escape is *for*. Suppressed on the line rather than by turning the
 * rule off, which is the difference `biome.jsonc` argues for.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI is the point
const stripped = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, "");

const gateFixture: GateStatus = {
  gate: ref("gate", "GATE_9"),
  consequence: "the release is blocked",
  state: "blocked",
  checks: [
    {
      criterion: ref("criterion", "CRIT_1"),
      proposition: "the effect holds at n>=20",
      state: "failed",
      evaluations: [],
    },
    {
      criterion: ref("criterion", "CRIT_2"),
      proposition: "nobody has run this",
      state: "never-run",
      evaluations: [],
    },
  ],
  unmet: [
    { criterion: ref("criterion", "CRIT_1"), requires: "the effect holds at n>=20", blocks: [] },
  ],
  evaluations: [],
  gating: [],
  everFailed: true,
};

test("colouring changes nothing a reader would read", () => {
  // The strongest property here, and the cheapest to lose: turning colour on
  // must not move, reword or reorder anything. If this fails, the two
  // renderings have diverged and every plain-mode assertion above has stopped
  // covering what people actually see.
  expect(stripped(renderGate(gateFixture, COLOUR))).toBe(renderGate(gateFixture, PLAIN));

  const survey: KnowledgeSurvey = {
    established: [{ question: ref("question", "Q_1"), asks: "does it converge?" }],
    provisional: [],
    accepted: [],
    unresolved: [],
    untested: [{ question: ref("question", "Q_2"), asks: "does depth matter?" }],
  };
  expect(stripped(renderKnown(survey, COLOUR))).toBe(renderKnown(survey, PLAIN));
});

test("a gate's states are coloured apart, not as pass and not-pass", () => {
  const out = renderGate(gateFixture, COLOUR);
  expect(out).toContain(ESC);
  // `failed` and `never-run` are different findings and must not share a code.
  const codeFor = (word: string) =>
    out.match(new RegExp(`\\u001b\\[([0-9;]+)m${word}`))?.[1] ?? `uncoloured:${word}`;
  expect(codeFor("failed")).not.toBe(codeFor("never-run"));
});

test("colour lands on the state word, not the whole line", () => {
  const line = renderGate(gateFixture, COLOUR)
    .split("\n")
    .find((l) => l.includes("the effect holds at n>=20"));
  // An escape immediately before the proposition would mean the whole row had
  // been painted, which carries no information a reader can use.
  expect(line).toBeDefined();
  expect(line).not.toContain(`${ESC}[31mthe effect holds`);
  expect(stripped(line as string)).toContain("the effect holds at n>=20");
});

test("padding is applied before colour, so columns still line up", () => {
  // An escape sequence has length. Padding a coloured string pads the bytes
  // nobody can see, and the column then lands short by exactly that much.
  const columns = renderGate(gateFixture, COLOUR)
    .split("\n")
    // The condition rows only: `Not currently met` also carries a CRIT_ handle,
    // and its rows are not in this column at all.
    // Condition rows only. `Not currently met` also carries a CRIT_ handle and
    // is not in this column; the header line contains the word "failed".
    .filter((l) => /^ {2}- (failed|never-run|passed|no-standing-verdict)\b/.test(stripped(l)))
    .map((l) => stripped(l).search(/the effect holds|nobody has run/));
  expect(columns.length).toBe(2);
  expect(new Set(columns).size).toBe(1);
});

test("PLAIN is the identity function, so no view has a second code path", () => {
  // The difference between a coloured run and a plain one is escape sequences
  // and nothing else — never which branch rendered the page.
  for (const member of Object.values(PLAIN)) {
    expect(member("x")).toBe("x");
  }
});

test("a write command's handle is never coloured, even forced", () => {
  // Measured, not predicted: this was coloured, and under `FORCE_COLOR=1`
  // `$(labkit criterion 'x')` captured an id wrapped in escape sequences. The
  // whole of stdout for these commands is data a shell consumes, so the rule is
  // that a handle-only answer never takes the palette at all.
  expect(asHandles(["CRIT_1", "CLM_2"], COLOUR)).toBe("CRIT_1\nCLM_2");
  expect(asHandles(["CRIT_1"], COLOUR)).toBe(asHandles(["CRIT_1"], PLAIN));
});
