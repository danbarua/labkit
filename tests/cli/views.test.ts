/**
 * The views, held to the distinctions the reports carry.
 */

import { expect, test } from "bun:test";
import { ref } from "@labkit/core-domain/report";
import { domainEvent } from "@labkit/core-domain/events";
import { asHandles } from "@labkit/app-cli/output";
import { PLAIN, palette } from "@labkit/app-cli/palette";
import {
  renderKnown,
  renderWhy,
  renderWhyDispatch,
  renderClaims,
} from "@labkit/app-cli/views/knowledge";
import { renderHappened } from "@labkit/app-cli/views/events";
import type {
  RecordedEvent,
  Explanation,
  KnowledgeSurvey,
  SupportExplanation,
} from "@labkit/core-domain";

test("withdrawn, challenged and never-examined render apart", () => {
  const base: SupportExplanation = {
    claim: ref("claim", "CLM_9"),
    proposition: "the schedule moves convergence",
    drawnAcross: [],
    verdict: "unexamined",
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
      verdict: "challenged",
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
      verdict: "withdrawn",
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

/**
 * A synthesis measured nothing, so it reaches the last branch of the verdict — the one whose
 * words are "nothing has examined this".
 */
test("a synthesis declines the verdict and names its basis", () => {
  const base: SupportExplanation = {
    claim: ref("claim", "CLM_22"),
    proposition: "T shows no detectable advantage over any of the four tested controls",
    drawnAcross: [
      { claim: ref("claim", "CLM_12"), asserts: "T shows an advantage over lattice" },
      { claim: ref("claim", "CLM_17"), asserts: "T shows an advantage over rewired" },
    ],
    verdict: "drawn-across",
    standing: "exploratory",
    support: [],
    reverifiedBy: [],
    standard: [],
    unmet: [],
    restingOn: [],
    superseded: [],
    challenged: false,
    against: [],
    withdrawn: false,
  };

  const synthesis = renderWhy(base, PLAIN);
  expect(synthesis).toContain("drawn across 2 findings");
  expect(synthesis).not.toContain("NOT supported");
  expect(synthesis).toContain("T shows an advantage over lattice");
  // And not `Supported by / no supporting findings` one line under it, which
  // is the same wrong answer in a different place.
  expect(synthesis).not.toContain("no supporting findings");

  // The same page for a claim nobody examined, which shares the empty
  // `support` and says something else entirely. Which of the two a claim is
  // was settled upstream; this asserts only that the page keeps them apart.
  const untouched = renderWhy({ ...base, verdict: "unexamined", drawnAcross: [] }, PLAIN);
  expect(untouched).toContain("NOT supported");
  expect(untouched).not.toContain("drawn across");

  // A synthesis someone later withdrew, or challenged with its own evidence,
  // keeps the state that says so — a basis is not a blanket rule.
  expect(renderWhy({ ...base, verdict: "withdrawn", withdrawn: true }, PLAIN)).toContain(
    "withdrawn",
  );
  expect(renderWhy({ ...base, verdict: "challenged", challenged: true }, PLAIN)).toContain(
    "challenged by evidence",
  );
});

/**
 * The page that misled a reader into filing a defect against a correct record.
 */
test("a challenged claim says it has no supporting findings, not that it rests on nothing", () => {
  const challenged: SupportExplanation = {
    claim: ref("claim", "CLM_6"),
    proposition: "T vs lattice is distinguishable",
    drawnAcross: [],
    verdict: "challenged",
    standing: "exploratory",
    // Empty by definition: every finding bears against it.
    support: [],
    reverifiedBy: [],
    standard: [],
    unmet: [],
    // And yet it plainly rests on something.
    restingOn: [{ part: ref("observations", "ART_4"), name: "stage1a results" }],
    superseded: [],
    challenged: true,
    against: [
      {
        finding: "not significant (p_holm=0.13086)",
        evidence: ref("evidence", "EV_6"),
        method: "paired Wilcoxon",
        analysis: ref("analysis", "COMP_3"),
      },
    ],
    withdrawn: false,
  };
  const page = renderWhy(challenged, PLAIN);

  // The input is named under a heading that means inputs, and the page never
  // claims this claim rests on nothing while naming what it rests on.
  expect(page).toContain("Resting on\n  - stage1a results  [ART_4]");
  expect(page).not.toContain("Resting on\n  nothing");

  // The empty list says what is actually empty.
  expect(page).toContain("Supported by");
  expect(page).toContain("no supporting findings");

  // The finding that does exist is still shown, under its own heading.
  expect(page).toContain("Bearing against");
  expect(page).toContain("not significant (p_holm=0.13086)");
});

test("every question in the survey carries its handle", () => {
  const survey: KnowledgeSurvey = {
    established: [
      {
        question: ref("question", "Q_1"),
        asks: "does it converge?",
        answers: [
          { enquiry: ref("enquiry", "LOE_1"), claim: ref("claim", "CLM_1"), bearing: "supports" },
        ],
      },
    ],
    provisional: [],
    accepted: [],
    unresolved: [{ question: ref("question", "Q_2"), asks: "does it converge?" }],
    untested: [{ question: ref("question", "Q_3"), asks: "does depth matter?" }],
    closedPursuits: [],
  };
  const out = renderKnown(survey, PLAIN);
  // Two questions may share wording, so the handle is what tells them apart.
  expect(out).toContain("(Q_1)  does it converge?");
  expect(out).toContain("(Q_2)  does it converge?");
  // And the unambiguous one carries its handle too, because a handle is not a
  // disambiguator — it is what the next command takes. A row without one can
  // be read and not acted on.
  expect(out).toContain("(Q_3)  does depth matter?");
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

/**
 * The two buckets named what they hold and not what moves a question between them, and a reader
 * who inferred the rule inferred the wrong one — "unresolved" sounds like a judgement about the
 * science and is a fact about whether anything addresses the enquiry.
 */
test("`known` prints the buckets holding something and nothing else", () => {
  const empty: KnowledgeSurvey = {
    established: [],
    provisional: [],
    accepted: [],
    unresolved: [],
    untested: [],
    closedPursuits: [],
  };
  expect(renderKnown(empty, PLAIN).trim()).toBe("");

  const one = renderKnown(
    { ...empty, untested: [{ question: ref("question", "Q_1"), asks: "does it hold?" }] },
    PLAIN,
  );
  expect(one).toContain("does it hold?");
  expect(one).toContain("Untested");
  // The five buckets with nothing in them do not print, and neither does a
  // standing explanation of what moves a question between them.
  expect(one).not.toContain("Established");
  expect(one).not.toContain("Closed pursuits");
  // A bucket with no rows renders the word on a line of its own; the heading
  // "Untested (nothing has been run ...)" legitimately contains it.
  expect(one.split("\n").map((l) => l.trim())).not.toContain("nothing");
  expect(one).not.toContain("moves a question");
});

test("an empty event log does not read as an empty record", () => {
  const empty = renderHappened({ acts: [], more: false, narrowed: false }, PLAIN);
  expect(empty).toContain("Nothing recorded");
  expect(empty).toContain("every other command reads the graph");

  const events: RecordedEvent[] = [
    domainEvent({
      seq: 7,
      at: "2026-03-01T00:00:00.000Z",
      attribution: {
        attribution_label: "claude-opus-5",
        attribution_id: "sess_1",
        attribution_how: "claimed",
        git_hash: "0123456789abcdef",
      },
      operation: "recordAnalysis",
      subject: "COMP_1",
      command: { enquiry: ref("enquiry", "LOE_1"), method: "tensile test", from: [] },
      changes: [
        { change: "NodeCreated", id: "CLM_1", label: "Claim", props: { name: "it cracks" } },
        { change: "NodeCreated", id: "EV_1", label: "Evidence", props: { statement: "40MPa" } },
      ],
    }),
  ];
  const out = renderHappened({ acts: events, more: false, narrowed: false }, PLAIN);
  expect(out).toContain("7");
  expect(out).toContain("recordAnalysis");
  // Who ran it and against what commit -- the two facts the graph cannot answer.
  expect(out).toContain("claude-opus-5");
  expect(out).toContain("@01234567");
  expect(out).toContain("CLM_1");
});

test("an uncaptured commit is not printed as a hash", () => {
  const events: RecordedEvent[] = [
    domainEvent({
      seq: 8,
      at: "2026-03-01T00:00:00.000Z",
      attribution: {
        attribution_label: "claude-opus-5",
        attribution_id: "sess_1",
        attribution_how: "claimed",
        git_hash: null,
      },
      operation: "note",
      subject: "NOTE_1",
      command: { text: "a note" },
      changes: [{ change: "NodeCreated", id: "NOTE_1", label: "Note", props: { text: "a note" } }],
    }),
  ];
  const out = renderHappened({ acts: events, more: false, narrowed: false }, PLAIN);
  expect(out).toContain("not captured");
  expect(out).not.toMatch(/@[0-9a-f]{8}/);
});

// --------------------------------------------------------------------------- Colour. **Every
// assertion above renders with `PLAIN`**, which is what `bun test` would get anyway — stdout is
// not a terminal, so `colourWanted` is false and the composition root hands out an identity
// palette.

const COLOUR = palette(true);

/**
 * Strips every SGR sequence, so a coloured page can be compared to a plain one.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI is the point
const stripped = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, "");

test("colouring changes nothing a reader would read", () => {
  // The strongest property here, and the cheapest to lose: turning colour on
  // must not move, reword or reorder anything. If this fails, the two
  // renderings have diverged and every plain-mode assertion above has stopped
  // covering what people actually see.
  const survey: KnowledgeSurvey = {
    established: [
      {
        question: ref("question", "Q_1"),
        asks: "does it converge?",
        answers: [
          { enquiry: ref("enquiry", "LOE_1"), claim: ref("claim", "CLM_1"), bearing: "supports" },
        ],
      },
    ],
    provisional: [],
    accepted: [],
    unresolved: [],
    untested: [{ question: ref("question", "Q_2"), asks: "does depth matter?" }],
    closedPursuits: [],
  };
  expect(stripped(renderKnown(survey, COLOUR))).toBe(renderKnown(survey, PLAIN));
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

test("an evaluation with no basis reads as asserted, not as measured", () => {
  // Empty `basis` means the verdict was asserted, not measured (report.ts's
  // EvaluationRecord.basis doc comment) -- the page renders that distinction rather than
  // printing an asserted verdict the same as a cited one.
  const explanation: Explanation = {
    kind: "criterion",
    subject: ref("criterion", "CRIT_1"),
    is: "passed",
    because: [
      {
        handle: ref("evaluation", "CEVAL_1"),
        wording: "passed: 0.61 — asserted",
        when: "2026-03-01T00:00:00.000Z",
      },
      {
        // Same value and outcome as CEVAL_1 on purpose: if the two lines
        // differed only because 0.61 != 0.31, this would pass even with the
        // basis-driven suffix broken or missing entirely. Identical values
        // mean the only thing that can make the lines differ is basis.
        handle: ref("evaluation", "CEVAL_2"),
        wording: "passed: 0.61 — resting on cracks at 40MPa (EV_1)",
        when: "2026-03-01T00:00:00.000Z",
      },
    ],
    report: {
      criterion: ref("criterion", "CRIT_1"),
      requires: "the effect holds at n>=20",
      state: "passed",
      evaluations: [],
      governs: [],
    },
  };
  const out = renderWhyDispatch(explanation, PLAIN);
  expect(out).toContain("asserted");
  // Its evidence needs something the next command can take, same as enquiry.
  expect(out).toContain("(EV_1)");
  // The two verdicts must not read alike -- an asserted one is not a synonym
  // for "rests on nothing named" the way a cited one's finding text would be.
  const lines = out.split("\n").filter((l) => l.includes("CEVAL_"));
  expect(lines[0]).not.toBe(lines[1]);
});

test("an undecided claim's findings are one list, and no heading picks a side", () => {
  // The claim-level state says the evidence settles this neither way. Splitting the findings
  // into a supporting list and a `Bearing against` list re-asserts a per-finding direction that
  // state has overridden, and puts a heading that picks a side directly under a verdict line
  // saying nobody has.
  const base: SupportExplanation = {
    claim: ref("claim", "CLM_7"),
    proposition: "T vs rewiring is distinguishable",
    drawnAcross: [],
    verdict: "undecided",
    standing: "undecided",
    support: [],
    against: [
      {
        finding: "NOT resolved: primary and sign-flip still say significant, median does not",
        method: "log-scale re-aggregation",
        analysis: ref("analysis", "COMP_4"),
        evidence: ref("evidence", "EV_9"),
      },
    ],
    reverifiedBy: [],
    standard: [],
    unmet: [],
    superseded: [],
    restingOn: [],
    challenged: false,
    withdrawn: false,
  };
  const out = renderWhy(base, PLAIN);

  // The finding is on the page, under the neutral heading.
  expect(out).toContain("Findings");
  expect(out).toContain("NOT resolved:");
  expect(out).not.toContain("Bearing against");
  // And its recorded direction is not lost.
  expect(out).toMatch(/against/i);
  // The words the #228 rename existed to avoid.
  expect(out).not.toContain("no supporting findings");
});
