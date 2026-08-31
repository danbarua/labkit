/**
 * The fragment library builds the record a hand-written scenario does.
 *
 * **This is the assertion that makes `fragments/` worth having.** Composing
 * moves is only useful if the composition produces the same record as writing
 * the verbs out — otherwise it is a second, quieter way of doing the same thing
 * that will drift from the first.
 *
 * So each test here runs a fragment composition and asserts on the **event
 * stream**: the operations, in order, and what each act created. That is
 * `commands in → graph mutations out`, checked.
 *
 * It lives in `tests/` and `fragments/` does not, which is the boundary that
 * matters: this file *tests* the library, and no scenario imports it. See the
 * header of `fragments/index.ts` for why a scenario sharing a fixture would
 * stop being an independent probe.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { openScenario, type Scenario } from "./helpers/scenario";
import {
  WriteSurface,
  inMemoryEventLog,
  type EventSink,
  type Clock,
  type DomainEvent,
} from "../src/domain";
import {
  askAndPursue,
  closeOnEvidence,
  failedCheck,
  gatedWork,
  multiPursuit,
  negativeResult,
  observeAndAnalyse,
  prespecify,
  promoteFinding,
  rerunCheck,
} from "../fragments";
import { danglingEndpoints, traceOf, type Trace } from "../fragments/trace";

const clock: Clock = { now: () => "2026-08-28T09:00:00.000Z" };

let scenario: Scenario;
// The surface itself, not `ResearchSession`, because that is what a fragment
// is written against — `main()` builds one of these too. The session is a
// facade over both halves and nothing here reads.
let w: WriteSurface;
let events: EventSink;

beforeAll(async () => {
  scenario = await openScenario();
});
beforeEach(async () => {
  const graph = await scenario.begin();
  events = inMemoryEventLog();
  w = new WriteSurface(graph, { clock, events });
});
afterEach(async () => {
  await scenario.end();
});
afterAll(async () => {
  await scenario.close();
});

const operations = (stream: readonly DomainEvent[]) => stream.map((e) => e.operation);

describe("a composition writes the record its moves describe", () => {
  /**
   * S-19's arc, as eight fragments.
   *
   * The LabKit Explorer mockup hand-wrote this sequence — command *and*
   * resulting nodes and edges — thirteen steps deep. Here the commands are the
   * only thing written and the rest is what LabKit did.
   */
  test("a gated advance: asked, gated, failed, re-run, promoted, closed", async () => {
    const { enquiry } = await askAndPursue(w, { question: "does the effect hold at n>=20?" });
    const { criterion } = await prespecify(w, { proposition: "panel variance below 5%" });
    const { gate } = await gatedWork(w, {
      criterion,
      consequence: "the interim may not be written up until this holds",
      objective: "write up the interim",
      acceptance: "the gate holds",
    });
    const first = await observeAndAnalyse(w, {
      enquiry,
      name: "raw-panel-90d",
      finding: "90 days, 24 sites",
      method: "panel regression",
      concludes: [{ proposition: "the effect holds at n=24", finding: "variance 7.1%" }],
      heldTo: [criterion],
    });
    await failedCheck(w, { criterion, gate, value: "0.071", citing: first.claims[0]!.claim });

    const second = await observeAndAnalyse(w, {
      enquiry,
      name: "raw-panel-120d",
      finding: "120 days, 41 sites",
      method: "panel regression, widened",
      concludes: [{ proposition: "the effect holds, variance 4.2%", finding: "variance 4.2%" }],
      heldTo: [criterion],
    });
    await rerunCheck(w, { criterion, gate, value: "0.042", citing: second.claims[0]!.claim });
    await promoteFinding(w, {
      claim: second.claims[0]!.claim,
      because: "held at the prespecified bar",
    });
    await closeOnEvidence(w, { enquiry, answeredBy: second.claims[0]!.claim });

    // The arc, as the record has it. Eight fragments, ten events: `gatedWork`
    // and `observeAndAnalyse` are each two acts, which is the honest count —
    // a fragment is a move for a researcher, not a promise about event count.
    expect(operations(await events.all())).toEqual([
      "openEnquiry",
      "stateCriterion",
      "planWork",
      "declareGate",
      "recordObservations",
      "recordAnalysis",
      "evaluateCriterion",
      "recordObservations",
      "recordAnalysis",
      "evaluateCriterion",
      "promote",
      "closeEnquiry",
    ]);

    // And the edges are there, which is what the hand-written mockup had to
    // invent. Asserted on the compound verb, where getting it wrong is easiest.
    const analysis = (await events.select({ operation: "recordAnalysis" }))[0]!;
    expect((analysis.edges ?? []).map((e) => e.label)).toContain("CONSUMES");
    expect((analysis.edges ?? []).map((e) => e.label)).toContain("SUPPORTS");
  });

  /**
   * S-5's shape, and the reason `multiPursuit` cannot be `askAndPursue` twice:
   * the second `pursue` needs the question handle, and `openEnquiry` does not
   * return one.
   */
  test("multiPursuit puts two lines against one question", async () => {
    const { question, enquiries } = await multiPursuit(w, {
      question: "does the drug reduce mortality?",
      approaches: ["phase II, 30-day endpoint", "phase III, 1-year endpoint"],
    });

    expect(enquiries).toHaveLength(2);
    expect(enquiries[0]).not.toBe(enquiries[1]);
    expect(operations(await events.all())).toEqual(["pose", "pursue", "pursue"]);

    // Both pursuits name the same question — the property that makes S-5's
    // "same wording, different claim" case expressible at all.
    const [, first, second] = await events.all();
    expect(first!.detail!.question).toBe(question);
    expect(second!.detail!.question).toBe(question);
  });

  /**
   * `danglingEndpoints` must be able to find one.
   *
   * It returns `[]` on every real trace, which is the shape of an assertion
   * that cannot fail. A hand-built trace with an edge into a node nobody
   * created is what shows it looks.
   */
  test("danglingEndpoints finds an edge into a node nobody created", async () => {
    await askAndPursue(w, { question: "does it hold?" });
    const trace = await traceOf("real", events);
    expect(danglingEndpoints(trace)).toEqual([]);

    const broken: Trace = {
      ...trace,
      steps: [
        ...trace.steps,
        {
          seq: 99,
          operation: "pose",
          subject: "Q_9",
          created: [],
          edges: [{ from: "Q_9", label: "MOTIVATES", to: "LOE_9" }],
          detail: {},
          command: "labkit pose",
          derived: [],
        },
      ],
    };
    expect(danglingEndpoints(broken)).toEqual(["LOE_9", "Q_9"]);
  });

  /**
   * S-4: an answered "no" is still an answer, and the finding bears against
   * the proposition rather than being absent.
   */
  test("negativeResult records a finding that challenges", async () => {
    const { enquiry } = await askAndPursue(w, { question: "does the additive prevent spoilage?" });
    const { claims } = await negativeResult(w, {
      enquiry,
      name: "accelerated-12wk",
      finding: "effect 0.2% [-1.1, 1.5]",
      method: "12-week accelerated trial",
      proposition: "the additive prevents spoilage",
    });
    await closeOnEvidence(w, { enquiry, answeredBy: claims[0]!.claim });

    const analysis = (await events.select({ operation: "recordAnalysis" }))[0]!;
    const labels = (analysis.edges ?? []).map((e) => e.label);
    // CHALLENGES, not SUPPORTS. A fragment that lost the bearing would still
    // produce a claim and a closed question, and only this distinguishes them.
    expect(labels).toContain("CHALLENGES");
    expect(labels).not.toContain("SUPPORTS");
  });
});
