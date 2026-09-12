import { optional, scalar, vertexProps } from "../../db/cypher";
import type { EdgeLabel, Prose } from "../../db/domain";
import { SEARCHABLE_TEXT, labelForNaturalId } from "../../db/domain";
import { SessionCore } from "../core";
import { kindOf, ref } from "../report";
import type {
  AnalysisExplanation,
  AnalysisRef,
  AnalysisRevision,
  Cause,
  CheckStatus,
  ClaimExplanation,
  ClaimRef,
  ConcludedClaim,
  CriterionExplanation,
  CriterionRef,
  CriterionStanding,
  EnquiryExplanation,
  EnquiryInContext,
  EnquiryRef,
  Explanation,
  GateExplanation,
  GateGoverned,
  GateStatus,
  GatedWork,
  AnyRef,
  Kind,
  ListedWork,
  QuestionBucket,
  QuestionStanding,
  Ref,
  RevisedFinding,
  WalkExplanation,
  WalkedKind,
  WorkExplanation,
} from "../report";
import { compose, per, type Row } from "../facts";
import { criterionDetail } from "../survey-facts";
import type { ReadSurface } from "./index";
import type { Identified } from "./shared";

export class ExplainGroup extends SessionCore {
  /**
   * A record's own text, whatever kind it is — the properties `search` scans.
   *
   * Matches without a label because the kind is not known until the id is parsed, so the
   * per-label retraction policy cannot apply and `retracted` is filtered here instead. An
   * unlabelled pattern with no such filter reads nodes `undo` was supposed to have hidden.
   */
  async proseFor(subject: AnyRef): Promise<string | null> {
    const props = SEARCHABLE_TEXT[labelForNaturalId(subject)] ?? [];
    if (props.length === 0) return null;
    // AGE Cypher rejects `IS DISTINCT FROM`; undo only writes `retracted: true`.
    const [row] = await this.graph.query(
      `MATCH (n {natural_id: $id}) WHERE n.retracted IS NULL RETURN n`,
      { n: vertexProps<Record<string, unknown>>() },
      { id: subject },
    );
    if (!row) return null;
    for (const prop of props) {
      const value = row.n[prop];
      if (typeof value === "string" && value.length > 0) return value;
    }
    return null;
  }

  /**
   * Is this handle on the record and not retracted?
   *
   * Its own question rather than a null from `proseFor`: an `EvidenceUnit` holds no prose and
   * is still there, so "no words" and "not here" are different answers. Matches without a
   * label, so it filters `retracted` rather than relying on the per-label policy.
   */
  async reachable(subject: AnyRef): Promise<boolean> {
    // AGE Cypher rejects `IS DISTINCT FROM`; undo only writes `retracted: true`.
    const rows = await this.graph.query(
      `MATCH (n {natural_id: $id}) WHERE n.retracted IS NULL RETURN n`,
      { n: vertexProps<{ natural_id: string }>() },
      { id: subject },
    );
    return rows.length > 0;
  }

  /**
   * One record's neighbours: everything joined to it, both directions, with the edge each was
   * reached by and the other end's own prose.
   *
   * Both ends are unlabelled — the subject's kind is not known until its id is parsed, and the
   * far end is any kind by design — so neither carries the per-label retraction policy and both
   * filter `retracted` here. Without it, `why` cites decisions and findings `undo` took back.
   */
  async neighboursOf(subject: AnyRef): Promise<Neighbour[]> {
    const decoders = {
      other: vertexProps<Record<string, unknown> & { natural_id: string }>(),
      via: scalar<string>(),
    };
    // AGE Cypher rejects `IS DISTINCT FROM`; undo only writes `retracted: true`.
    const [out, into] = await Promise.all([
      this.graph.query(
        `MATCH (n {natural_id: $id})-[r]->(other)
         WHERE n.retracted IS NULL AND other.retracted IS NULL
         RETURN other, type(r) AS via`,
        decoders,
        { id: subject },
      ),
      this.graph.query(
        `MATCH (other)-[r]->(n {natural_id: $id})
         WHERE n.retracted IS NULL AND other.retracted IS NULL
         RETURN other, type(r) AS via`,
        decoders,
        { id: subject },
      ),
    ]);
    const seen = (rows: typeof out, direction: "out" | "in"): Neighbour[] =>
      rows.map((r) => {
        const label = labelForNaturalId(r.other.natural_id);
        const props = SEARCHABLE_TEXT[label] ?? [];
        const text = props
          .map((prop) => r.other[prop])
          .find((v): v is string => typeof v === "string" && v.length > 0);
        return {
          handle: ref(kindOf(r.other.natural_id) as Kind, r.other.natural_id),
          via: r.via as EdgeLabel,
          direction,
          wording: text ?? null,
        };
      });
    return [...seen(out, "out"), ...seen(into, "in")];
  }

  /**
   * `why <criterion>` — what a condition requires, what has been said about it, and what it
   * holds up.
   */
  async criterionStanding(criterion: CriterionRef): Promise<CriterionStanding> {
    const { cypher, decoders } = compose(
      `MATCH (crit:Criterion {natural_id: $id})`,
      criterionDetail,
      { crit: vertexProps<{ natural_id: string; proposition: string }>() },
    );
    const rows = (await this.graph.query(cypher, decoders, { id: criterion })) as unknown as Row[];
    const detail = [...per(criterionDetail, rows).values()][0];
    if (!detail) throw new Error(`no criterion named "${criterion}"`);

    // The gates it governs, and what each protects. A separate read because
    // it is a different grain -- per gate, not per criterion.
    const governed = await this.graph.query(
      // `GATES`, and the target is deliberately unlabelled: a gate reaches a
      // Task or a Computation, and `gateStatus` reads the same edge the same
      // way. Naming a label a gate does not use binds nothing and reports it
      // as nothing protected.
      `MATCH (c:Criterion {natural_id: $id})-[:GOVERNS]->(g:Gate)
       OPTIONAL MATCH (g)-[:GATES]->(w)
       RETURN g, w`,
      {
        g: vertexProps<{ natural_id: string; consequence: string }>(),
        w: optional(vertexProps<{ objective?: string } & Identified>()),
      },
      { id: criterion },
    );
    const byGate = new Map<string, GateGoverned>();
    for (const r of governed) {
      const existing = byGate.get(r.g.natural_id) ?? {
        gate: ref("gate", r.g.natural_id),
        consequence: r.g.consequence,
        protecting: [] as GatedWork[],
      };
      if (r.w)
        existing.protecting.push({
          work: ref("work", r.w.natural_id),
          objective: r.w.objective ?? "",
        });
      byGate.set(r.g.natural_id, existing);
    }

    return {
      criterion,
      requires: detail.proposition,
      state: detail.state,
      evaluations: detail.evaluations,
      governs: [...byGate.values()],
    };
  }

  /**
   * What an analysis revised, and which findings moved — {@link AnalysisRevision}.
   */
  async analysisRevision(analysis: AnalysisRef): Promise<AnalysisRevision> {
    const lineage = await this.graph.query(
      `MATCH (:Computation {natural_id: $id})<-[:MOTIVATES]-(d:Decision)-[:SUPERSEDES]->(old:Computation)
       OPTIONAL MATCH (d)-[:INVALIDATED_BY]->(rev:Review)
       RETURN old, rev, d`,
      {
        old: vertexProps<{ natural_id: string }>(),
        rev: optional(vertexProps<{ natural_id: string; verdict: string }>()),
        d: vertexProps<{ natural_id: string }>(),
      },
      { id: analysis },
    );
    const revises = lineage[0];
    if (!revises) return { analysis, changed: [], restated: [], kept: [], unpaired: [] };

    // What the successor concluded, and what the revision superseded and kept.
    // Both bearings throughout: a finding that challenges a claim is superseded
    // and carried forward exactly as a supporting one is, and reading one side
    // is silent.
    const now = await this.conclusionsIn(analysis);
    const decision = ref("decision", revises.d.natural_id);
    const fell = await this.claimsFrom(decision, "SUPERSEDES");
    const kept = await this.claimsFrom(decision, "KEEPS");

    // **The pairing the act recorded, and no other.** `conclude --replacing` mints a decision
    // per finding carrying `SUPERSEDES` to what fell and `MOTIVATES` to what stands in its
    // place, so which claim replaced which is on the record at write time. A successor that
    // named nothing is reported `unpaired`.
    const named = await this.namedSuccessors(fell.map((c) => c.claim));

    const changed: RevisedFinding[] = [];
    const restated: ConcludedClaim[] = [];
    const unpaired: ConcludedClaim[] = [];
    for (const was of fell) {
      const stated = named.get(was.claim);
      const successor = stated && now.find((c) => c.claim === stated);
      if (!successor) {
        unpaired.push({ claim: was.claim, asserts: was.asserts });
        continue;
      }
      const before = await this.findingText(was.claim);
      const after = await this.findingText(successor.claim);
      if (before === after) restated.push({ claim: successor.claim, asserts: successor.asserts });
      else
        changed.push({
          proposition: was.asserts,
          was: was.claim,
          before,
          claim: successor.claim,
          after,
        });
    }

    const byClaim = (a: { claim: string }, b: { claim: string }) => a.claim.localeCompare(b.claim);
    return {
      analysis,
      supersedes: ref("analysis", revises.old.natural_id),
      ...(revises.rev
        ? {
            because: {
              review: ref("review", revises.rev.natural_id),
              verdict: revises.rev.verdict,
            },
          }
        : {}),
      changed: changed.sort((a, b) => a.was.localeCompare(b.was)),
      restated: restated.sort(byClaim),
      kept: kept.sort(byClaim),
      unpaired: unpaired.sort(byClaim),
    };
  }

  /** The claims an analysis concluded, both bearings. */
  private async conclusionsIn(analysis: AnalysisRef): Promise<ConcludedClaim[]> {
    const out: ConcludedClaim[] = [];
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (:Computation {natural_id: $id})<-[:USES]-(:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
         MATCH (e)-[:${bearing}]->(c:Claim)
         RETURN c`,
        { c: vertexProps<{ natural_id: string; name: string }>() },
        { id: analysis },
      );
      for (const row of rows)
        if (!out.some((o) => o.claim === row.c.natural_id))
          out.push({ claim: ref("claim", row.c.natural_id), asserts: row.c.name });
    }
    return out;
  }

  /**
   * Which claim was recorded as standing in place of each fallen one.
   */
  private async namedSuccessors(fallen: ClaimRef[]): Promise<Map<ClaimRef, ClaimRef>> {
    if (fallen.length === 0) return new Map();
    const rows = await this.graph.query(
      `MATCH (d:Decision)-[:SUPERSEDES]->(was:Claim)
       MATCH (d)-[:MOTIVATES]->(now:Claim)
       WHERE was.natural_id IN $fallen
       RETURN was, now`,
      {
        was: vertexProps<{ natural_id: string }>(),
        now: vertexProps<{ natural_id: string }>(),
      },
      { fallen: [...fallen] },
    );
    return new Map(
      rows.map((r) => [ref("claim", r.was.natural_id), ref("claim", r.now.natural_id)]),
    );
  }

  /** The claims one decision points at over one edge. */
  private async claimsFrom(
    decision: Ref<"decision">,
    edge: "SUPERSEDES" | "KEEPS",
  ): Promise<ConcludedClaim[]> {
    const rows = await this.graph.query(
      `MATCH (:Decision {natural_id: $id})-[:${edge}]->(c:Claim)
       RETURN c`,
      { c: vertexProps<{ natural_id: string; name: string }>() },
      { id: decision },
    );
    return rows.map((r) => ({ claim: ref("claim", r.c.natural_id), asserts: r.c.name }));
  }

  /** The wording of the finding bearing on a claim. */
  private async findingText(claim: ClaimRef): Promise<Prose> {
    for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
      const rows = await this.graph.query(
        `MATCH (e:Evidence)-[:${bearing}]->(:Claim {natural_id: $id})
         RETURN e`,
        { e: vertexProps<{ statement: string }>() },
        { id: claim },
      );
      if (rows[0]) return rows[0].e.statement;
    }
    return "";
  }
}

/**
 * `enquiryStatus`, alongside where this enquiry's own question sits in the overall survey — one
 * bucket, not the whole survey. See `EnquiryInContext`'s own doc comment.
 */
export async function enquiryInContext(
  self: ReadSurface,
  enquiry: EnquiryRef,
): Promise<EnquiryInContext> {
  const status = await self.enquiryStatus(enquiry);
  if (!status.question) return { enquiry: status, standing: null };

  const survey = await self.whatIsKnown();
  const buckets: [QuestionBucket, QuestionStanding[]][] = [
    ["established", survey.established],
    ["unresolved", survey.unresolved],
    ["untested", survey.untested],
    ["provisional", survey.provisional],
    ["accepted", survey.accepted],
  ];
  // Every question that exists lands in exactly one bucket, by construction
  // of the partition `whatIsKnown()` computes -- but this reads that back
  // from what the survey actually returned rather than assuming it, the
  // same discipline `contractFor()`'s `q`/`loe` pairing follows.
  let standing: EnquiryInContext["standing"] = null;
  for (const [bucket, questions] of buckets) {
    const found = questions.find((q) => q.question === status.question!.question);
    if (found) {
      standing = { question: found.question, asks: found.asks, bucket };
      break;
    }
  }
  return { enquiry: status, standing };
}

/**
 * One record's `why`, over the report that already exists for its kind — the table
 * `ReadSurface.why` dispatches through.
 */
type Explainer = (self: ReadSurface, subject: string) => Promise<Explanation>;

/** The `Claim` case: `whySupported`, plus the derived `{is, because}` envelope. */
async function explainClaim(self: ReadSurface, subject: string): Promise<ClaimExplanation> {
  const report = await self.whySupported(ref("claim", subject));
  // The read surface derived the state; this says it in words and names what
  // it rests on. It used to rebuild the state here from `supported`,
  // `withdrawn` and `challenged`, and had no arm for a synthesis or for a
  // finding that settles nothing — both came back as "nothing has examined
  // it", of claims analyses had been drawn across.
  let is: string;
  let because: Cause[];
  const findings = (of: typeof report.support): Cause[] =>
    of.map((s) => ({ handle: s.evidence, wording: s.finding }));
  switch (report.verdict) {
    case "supported":
      is = "supported";
      because = findings(report.support);
      break;
    case "undecided":
      // The evidence is real and the claim keeps it; what is absent is a
      // direction anyone will stand behind.
      is = "undecided — the findings settle this neither way";
      because = findings(report.support);
      break;
    case "withdrawn":
      is = "withdrawn";
      because = report.replacedBy
        ? [{ handle: report.replacedBy.claim, wording: report.replacedBy.asserts }]
        : [];
      break;
    case "challenged":
      is = "challenged";
      because = findings(report.against);
      break;
    case "drawn-across":
      is = `drawn across ${report.drawnAcross.length} findings`;
      because = report.drawnAcross.map((d) => ({ handle: d.claim, wording: d.asserts }));
      break;
    case "standard-unmet":
      is = "unsupported — the prespecified standard is not met";
      because = report.unmet.map((u) => ({ handle: u.criterion, wording: u.requires }));
      break;
    case "unexamined":
      is = "unsupported — nothing has examined it";
      because = [];
      break;
    default: {
      const check: never = report.verdict;
      throw new Error(`unreached claim state: ${check}`);
    }
  }
  return { kind: "claim", subject: report.claim, is, because, report };
}

/** The `Work` case: the state `workList` already computes, then the lineage. */
async function explainWork(self: ReadSurface, subject: string): Promise<WorkExplanation> {
  const work = ref("work", subject);
  const report = await self.contractFor(work);
  const listed = (await self.workList()).find((row) => row.work === work);
  if (!listed)
    throw new Error(
      `no planned work ${work}; work is planned before it can be read back, and 'search' finds its handle by the objective`,
    );

  const lineage: Cause[] = report.addressing
    ? [
        { handle: report.addressing.enquiry, wording: report.addressing.pursuing },
        { handle: report.addressing.question, wording: report.addressing.asks },
      ]
    : [];

  return {
    kind: "work",
    subject: work,
    is: sentenceForWork(listed, Boolean(report.addressing)),
    because: [...(await causesForWorkState(self, listed)), ...lineage],
    report,
  };
}

function sentenceForWork(listed: ListedWork, namedQuestion: boolean): string {
  switch (listed.state) {
    case "planned":
      if (listed.gates.length === 0)
        return namedQuestion
          ? "planned — ready, no gate holds it"
          : "planned — ready, no gate holds it, and no question named";
      return "planned — gates satisfied";
    case "waiting":
    case "blocked":
    case "carried-out":
    case "abandoned":
      return listed.state;
    default: {
      const state: never = listed.state;
      throw new Error(`unreached work state: ${state}`);
    }
  }
}

async function causesForWorkState(self: ReadSurface, listed: ListedWork): Promise<Cause[]> {
  switch (listed.state) {
    case "abandoned": {
      const stopped = await self.stoppedWork(listed.work);
      return stopped ? [{ handle: stopped.decision, wording: stopped.because }] : [];
    }
    case "blocked":
    case "waiting":
    case "planned":
      return causesForGates(self, listed.gates);
    case "carried-out":
      return implementingAnalyses(self, listed.work);
    default: {
      const state: never = listed.state;
      throw new Error(`unreached work state: ${state}`);
    }
  }
}

async function causesForGates(self: ReadSurface, gates: ListedWork["gates"]): Promise<Cause[]> {
  const causes: Cause[] = [];
  for (const gate of gates) {
    const status = await self.gateStatus(gate);
    causes.push(causeForHoldingGate(status));
  }
  return causes;
}

function causeForHoldingGate(status: GateStatus): Cause {
  const failed = status.checks.filter((c) => c.state === "failed");
  if (status.state === "blocked" && failed[0])
    return {
      handle: status.gate,
      wording: `blocked: ${failed[0].proposition} — failed`,
      when: failed[0].decidedBy?.at,
    };
  return { handle: status.gate, wording: status.state };
}

async function implementingAnalyses(self: ReadSurface, work: ListedWork["work"]): Promise<Cause[]> {
  const fromWork = await self.neighboursOf(work);
  const units = fromWork.filter((n) => n.via === "IMPLEMENTS" && n.direction === "out");
  const analyses: Cause[] = [];
  for (const unit of units) {
    const fromUnit = await self.neighboursOf(unit.handle);
    for (const n of fromUnit) {
      if (n.via === "USES" && n.direction === "out" && kindOf(n.handle) === "analysis")
        analyses.push({ handle: n.handle, wording: "carried out by" });
    }
  }
  return analyses;
}

/** The LineOfEnquiry case: its own closure, with aggregate question context beside it. */
async function explainEnquiry(self: ReadSurface, subject: string): Promise<EnquiryExplanation> {
  const enquiry = ref("enquiry", subject);
  const report = await self.enquiryInContext(enquiry);
  const status = report.enquiry;
  let is: string;
  switch (status.closure) {
    case "answered":
      is = `closed — answered${status.answer ? ` ${status.answer}` : ""}`;
      break;
    case "abandoned":
      is = "closed — abandoned";
      break;
    case null:
      is = status.question?.acceptedBecause
        ? "open — its question is accepted as unresolved"
        : "open";
      break;
    default: {
      const check: never = status.closure;
      throw new Error(`unreached enquiry closure: ${check}`);
    }
  }
  const because: Cause[] = report.standing
    ? [
        {
          handle: report.standing.question,
          wording: `${report.standing.asks} — currently ${report.standing.bucket}`,
        },
      ]
    : [];
  return { kind: "enquiry", subject: enquiry, is, because, report };
}

/**
 * One governing condition's cause, worded by its own state — the same `CheckStatus.state` four-
 * way split `renderGate` colours, turned into prose instead: `blocked` and `incomplete` both
 * cite whichever of these are not `passed`, so the wording (not just `when`) is what tells a
 * failed check apart from one nobody has run.
 */
function causeForCheck(c: CheckStatus): Cause {
  switch (c.state) {
    case "passed":
      return { handle: c.criterion, wording: `${c.proposition} — passed`, when: c.decidedBy?.at };
    case "failed":
      return { handle: c.criterion, wording: `${c.proposition} — failed`, when: c.decidedBy?.at };
    case "never-run":
      return { handle: c.criterion, wording: `${c.proposition} — has never been run` };
    case "no-standing-verdict":
      // Evaluated, and every evaluation has since been withdrawn -- not the
      // same fact as never-run, and `renderGate` keeps the two apart under this
      // exact name.
      return { handle: c.criterion, wording: `${c.proposition} — no standing verdict` };
    default: {
      const check: never = c.state;
      throw new Error(`unreached check state: ${check}`);
    }
  }
}

/**
 * The `Computation` case: what this analysis revised, and which findings moved.
 */
async function explainAnalysis(self: ReadSurface, subject: string): Promise<AnalysisExplanation> {
  const analysis = ref("analysis", subject);
  const report = await self.analysisRevision(analysis);
  if (report.supersedes === undefined)
    return { kind: "analysis", subject: analysis, is: "a first run", because: [], report };

  const because: Cause[] = [];
  if (report.because)
    because.push({ handle: report.because.review, wording: report.because.verdict });
  for (const c of report.changed)
    because.push({ handle: c.was, wording: `${c.proposition}: ${c.before} → ${c.after}` });
  for (const s of report.kept)
    because.push({ handle: s.claim, wording: `${s.asserts} — kept, on its original evidence` });
  for (const u of report.unpaired)
    because.push({ handle: u.claim, wording: `${u.asserts} — superseded, no successor named` });

  // **Every finding that fell, not just the reworded ones.** Counting only
  // `changed` loses the restated and the unpaired, so a revision that moved one
  // of two could report "0 of 1" while `because` listed both.
  const fell = report.changed.length + report.restated.length + report.unpaired.length;
  const stood = report.kept.length;
  return {
    kind: "analysis",
    subject: analysis,
    is:
      stood === 0
        ? `a revision of ${report.supersedes}`
        : `a partial revision of ${report.supersedes}, ${fell} of ${fell + stood} findings`,
    because,
    report,
  };
}

/**
 * `why <criterion>` — what a condition requires, what has been said about it, and what it holds
 * up.
 */
async function explainCriterion(self: ReadSurface, subject: string): Promise<CriterionExplanation> {
  const criterion = ref("criterion", subject);
  const report = await self.criterionStanding(criterion);
  const last = report.evaluations.at(-1);
  const is =
    report.state === "never-run"
      ? "never evaluated"
      : report.state === "no-standing-verdict"
        ? "evaluated, with no verdict still standing"
        : report.state;
  // The evaluations themselves, newest first: what was said is the cause of
  // the state, and the handle is what the next command takes.
  const because: Cause[] = [...report.evaluations].reverse().map((e) => ({
    handle: e.evaluation,
    // **Whether a verdict rested on anything is part of what it says.** An
    // empty `basis` means it was asserted rather than measured, and printing
    // the two alike would make a judgement read as a reading.
    wording:
      `${e.outcome === "pass" ? "passed" : "failed"}: ${e.value}` +
      // Which finding this verdict judged, when one rule was applied to
      // several. Without it four verdicts under one criterion are four
      // lines a reader cannot tell apart.
      `${e.about ? ` about ${e.about}` : ""}` +
      `${e.withdrawn ? " (withdrawn)" : ""}` +
      (e.basis.length === 0
        ? " — asserted"
        : ` — resting on ${e.basis.map((f) => `${f.states} (${f.evidence})`).join("; ")}`),
    when: e.at,
  }));
  return {
    kind: "criterion",
    subject: criterion,
    is: last ? `${is}, last evaluated ${last.at}` : is,
    because,
    report,
  };
}

/**
 * The `Gate` case: `gateStatus`, exhaustive over `GateStatus.state` — the same four-way split
 * `gateStateFrom` computes, worded rather than coloured.
 */
async function explainGate(self: ReadSurface, subject: string): Promise<GateExplanation> {
  const gate = ref("gate", subject);
  const report = await self.gateStatus(gate);
  let is: string;
  let because: Cause[];
  switch (report.state) {
    case "blocked":
      is = "blocked";
      because = report.checks.filter((c) => c.state !== "passed").map(causeForCheck);
      break;
    case "incomplete":
      is = "incomplete";
      because = report.checks.filter((c) => c.state !== "passed").map(causeForCheck);
      break;
    case "satisfied":
      is = "satisfied";
      because = report.checks.map(causeForCheck);
      break;
    case "sidestepped":
    case "retired":
      is = report.state;
      because = report.closure
        ? [{ handle: report.closure.decision, wording: report.closure.because }]
        : [];
      break;
    case "never-evaluated":
      is = "never evaluated";
      because = report.checks.map(causeForCheck);
      break;
    default: {
      const check: never = report.state;
      throw new Error(`unreached gate state: ${check}`);
    }
  }
  return { kind: "gate", subject: gate, is, because, report };
}

/**
 * The kinds `why` actually explains, and their cases.
 */
const EXPLAINED = {
  claim: explainClaim,
  work: explainWork,
  enquiry: explainEnquiry,
  gate: explainGate,
  criterion: explainCriterion,
  analysis: explainAnalysis,
} satisfies Partial<Record<Kind, Explainer>>;

const EXPLAINED_KINDS = Object.keys(EXPLAINED) as Kind[];

/** One record joined to another, and the edge it was reached by. */
export interface Neighbour {
  handle: AnyRef;
  via: EdgeLabel;
  direction: "out" | "in";
  wording: string | null;
}

/**
 * What one record is connected to, in a researcher's words rather than the schema's.
 */
const PHRASE: Record<EdgeLabel, { out: string; in: string }> = {
  MOTIVATES: { out: "led to", in: "was prompted by" },
  REQUIRES: { out: "needs", in: "is needed by" },
  ADDRESSES: { out: "works on", in: "is worked on by" },
  SUPPORTS: { out: "supports", in: "is supported by" },
  CHALLENGES: { out: "bears against", in: "is challenged by" },
  USES: { out: "uses", in: "is used by" },
  CONSUMES: { out: "reads", in: "was read by" },
  PRODUCES: { out: "produced", in: "was produced by" },
  RECORDED_IN: { out: "is recorded in", in: "records" },
  GOVERNS: { out: "governs", in: "is governed by" },
  QUALIFIES: { out: "qualifies", in: "is qualified by" },
  EVALUATED_AS: { out: "was evaluated as", in: "is a verdict on" },
  TRIGGERS: { out: "was judged against", in: "was judged by" },
  GATES: { out: "holds up", in: "is held up by" },
  REVERIFIES: { out: "re-checks", in: "was re-checked by" },
  PROMOTES: { out: "confirmed", in: "was confirmed by" },
  GRADES: { out: "graded", in: "was graded by" },
  ABOUT: { out: "is about", in: "is the subject of" },
  KEEPS: { out: "kept", in: "was kept by" },
  CHANGES: { out: "changed", in: "was changed by" },
  BASED_ON: { out: "rests on", in: "was cited by" },
  IN_LIGHT_OF: { out: "is in light of", in: "was considered in light of" },
  RESOLVES: { out: "settled", in: "was settled by" },
  ANSWERS: { out: "answers on", in: "was named as the answer by" },
  NARROWS: { out: "sharpened", in: "was sharpened by" },
  DEFERS: { out: "deferred", in: "was deferred by" },
  SUPERSEDES: { out: "replaced", in: "was replaced by" },
  EVALUATES: { out: "judged", in: "was judged by" },
  INVALIDATED_BY: { out: "was retracted by", in: "retracted" },
  IMPLEMENTS: { out: "carried out", in: "was carried out by" },
  RESTS_ON: { out: "is drawn from", in: "was drawn on by" },
  CONCERNS: { out: "concerns", in: "has a note on it" },
};

/**
 * What a record is, for the one case with no words of its own.
 */
function describe(handle: AnyRef): string {
  const kind = kindOf(handle);
  return kind && kind in SAYS ? SAYS[kind as WalkedKind] : "a record";
}

/** How a walked kind describes itself when it has nothing else to say. */
const SAYS: Record<WalkedKind, string> = {
  question: "a question on the record",
  unit: "one unit of work that was run",
  evidence: "a finding",
  decision: "a decision",
  evaluation: "a verdict on one condition",
  review: "a review",
  observations: "what was observed",
  note: "a note",
};

/**
 * The one query behind every walked kind: the node, and everything joined to it, both
 * directions. Handle existence is checked once by `ReadSurface.why` before dispatch.
 */
function walked(kind: WalkedKind): Explainer {
  return async (self, subject) => {
    const handle = ref(kind, subject);
    const neighbours = await self.neighboursOf(handle);
    const own = await self.proseFor(handle);
    return {
      kind,
      subject: handle,
      // The record's own words where it has any, and what it is where it does
      // not. An `EvidenceUnit` is the one kind holding no prose at all.
      is: own ?? SAYS[kind],
      because: neighbours.map((n: Neighbour) => ({
        handle: n.handle,
        // The other end's own words, or what it is when it has none. Falling
        // back to the handle printed it twice, the `Cause` carrying it
        // already: `was produced by EU_2 (EU_2)`.
        wording: `${PHRASE[n.via][n.direction]} ${n.wording ?? describe(n.handle)}`,
      })),
    };
  };
}

/**
 * Every kind `why` answers by walking, rather than from a report of its own.
 */
const WALKED = {
  question: walked("question"),
  unit: walked("unit"),
  evidence: walked("evidence"),
  decision: walked("decision"),
  evaluation: walked("evaluation"),
  review: walked("review"),
  observations: walked("observations"),
  note: walked("note"),
} satisfies Record<WalkedKind, Explainer>;

/**
 * The total table `why` dispatches through — one entry per {@link Kind}, so a kind added to
 * `LABEL_BY_KIND` with no case is a `tsc` failure.
 */
export const EXPLAINERS = { ...EXPLAINED, ...WALKED } satisfies Record<Kind, Explainer>;
