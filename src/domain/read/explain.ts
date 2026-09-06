import { optional, vertexProps } from "../../db/cypher";
import type { Prose } from "../../db/domain";
import { SessionCore } from "../core";
import { ref } from "../report";
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
  GatedWork,
  Kind,
  QuestionBucket,
  QuestionStanding,
  Ref,
  RevisedFinding,
  WorkExplanation,
} from "../report";
import { compose, per, type Row } from "../facts";
import { criterionDetail } from "../survey-facts";
import type { ReadSurface } from "./index";
import type { Identified } from "./shared";

export class ExplainGroup extends SessionCore {
  /**
   * `why <criterion>` — what a condition requires, what has been said about it,
   * and what it holds up.
   *
   * **Reached only through `why`** — a researcher asks *why is this condition
   * in the state it is*, and that is one verb, not a second one named for the
   * report. See `NO_COMMAND_FOR` in tests/cli/coverage.test.ts.
   *
   * Evaluations here are **criterion-scoped, not gate-scoped**: one criterion
   * can govern several gates and be evaluated separately against each, and a
   * reader asking about the condition itself is asking about all of them.
   * `gateStatus` keeps the narrower scope for the opposite reason, stated
   * there.
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
   *
   * Three reads, because they are three different questions about one act: the
   * lineage decision (which analysis this revises, on which review), the
   * per-finding decisions (old claim to new), and the superseded analysis's
   * own conclusions (so the ones nothing named can be reported standing).
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

    // **The recorded pairing first, wording only where there is none.**
    // `conclude --replacing` mints a decision per finding carrying
    // `SUPERSEDES` to what fell and `MOTIVATES` to what stands in its place,
    // so which claim replaced which is on the record at write time. Matching
    // propositions cannot recover it: an analysis may assert one sentence
    // twice about different endpoints, which is what a claim's handle is for.
    const named = await this.namedSuccessors(fell.map((c) => c.claim));

    // The fallback, for a conclusion recorded without naming what it replaces.
    // Unique on both sides or nothing: this is a description rather than an
    // act and cannot refuse, so an ambiguous match is reported unpaired
    // instead of guessed.
    const countBy = (cs: ConcludedClaim[], p: string) => cs.filter((c) => c.asserts === p).length;
    const changed: RevisedFinding[] = [];
    const restated: ConcludedClaim[] = [];
    const unpaired: ConcludedClaim[] = [];
    for (const was of fell) {
      const stated = named.get(was.claim);
      const successor =
        (stated && now.find((c) => c.claim === stated)) ??
        (countBy(fell, was.asserts) === 1 && countBy(now, was.asserts) === 1
          ? now.find((c) => c.asserts === was.asserts)
          : undefined);
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
   *
   * `conclude --replacing` mints a decision per finding, `SUPERSEDES` to what
   * fell and `MOTIVATES` to what replaces it — so the pairing is a fact the
   * act stated, not one a reader has to infer from wording.
   *
   * Two clauses rather than one pattern because AGE has no edge alternation,
   * and both are `MATCH`: a decision carrying only `SUPERSEDES` is the
   * revision's own act of retiring the finding, which names no successor.
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
 * `enquiryStatus`, alongside where this enquiry's own question sits in the
 * overall survey — one bucket, not the whole survey. See
 * `EnquiryInContext`'s own doc comment.
 *
 * **No adapter reaches this directly.** It is the body of `why <enquiry>`'s
 * `LineOfEnquiry` case (`explainEnquiry`, below) — see `NOT_EXPOSED`.
 *
 * **A module-level function taking `self: ReadSurface`, not a method here.**
 * It reads `enquiryStatus` (`./story.ts`) and `whatIsKnown` (`./standing.ts`),
 * both in other groups — a `SessionCore` method on this file's own class has
 * no way to reach a sibling group, so this takes the composed surface instead,
 * the same shape `Explainer` below uses.
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
 * One record's `why`, over the report that already exists for its kind — the
 * table `ReadSurface.why` dispatches through.
 *
 * **Module-level functions, not private methods.** `check:no-stringly-typed`
 * scans class members only (its own doc comment says so), so a class method
 * taking `subject: string` before it is known which kind's `Ref` that string
 * names would need an allowlist entry there; a free function does not. It also
 * keeps the table itself a plain value — `satisfies Record<Kind, Explainer>`
 * checks totality once, here, rather than at every call site.
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

/** The `Work` case: `contractFor`'s `addressing`, with an honest sentence when there is none (#98). */
async function explainWork(self: ReadSurface, subject: string): Promise<WorkExplanation> {
  const work = ref("work", subject);
  const report = await self.contractFor(work);

  // Somebody decided not to do it, which is the answer to *why is this work in
  // the state it's in* and displaces every other one: the question it serves
  // is still true and no longer the reason. The reason `stopWork` recorded is
  // on the decision, and this is what reads it.
  const stopped = await self.stoppedWork(work);
  if (stopped)
    return {
      kind: "work",
      subject: work,
      is: "abandoned",
      because: [{ handle: stopped.decision, wording: stopped.because }],
      report,
    };

  if (!report.addressing) {
    return {
      kind: "work",
      subject: work,
      is: "planned with no question named -- plan --enquiry records one",
      because: [],
      report,
    };
  }
  const a = report.addressing;
  return {
    kind: "work",
    subject: work,
    is: "planned to advance",
    because: [
      { handle: a.enquiry, wording: a.pursuing },
      { handle: a.question, wording: a.asks },
    ],
    report,
  };
}

/** The `LineOfEnquiry` case: `enquiryInContext` -- what `--in-context` computed, before the redesign folded it in here. */
async function explainEnquiry(self: ReadSurface, subject: string): Promise<EnquiryExplanation> {
  const enquiry = ref("enquiry", subject);
  const report = await self.enquiryInContext(enquiry);
  const q = report.enquiry.question;
  // Exhaustive over `QuestionClosure.closure`'s four values (three literals
  // plus `null`), the same union `renderEnquiry` branches on.
  let is: string;
  if (!q) {
    is = "pursuing nothing on the record";
  } else {
    switch (q.closure) {
      case "answered":
        is = `closed — answered${q.answer ? ` ${q.answer}` : ""}`;
        break;
      case "abandoned":
        is = "closed — abandoned";
        break;
      case "accepted-as-unresolved":
        is = "open — accepted as unresolved, deliberately";
        break;
      case null:
        is = "open";
        break;
      default: {
        const check: never = q.closure;
        throw new Error(`unreached enquiry closure: ${check}`);
      }
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
 * One governing condition's cause, worded by its own state — the same
 * `CheckStatus.state` four-way split `renderGate` colours, turned into prose
 * instead: `blocked` and `incomplete` both cite whichever of these are not
 * `passed`, so the wording (not just `when`) is what tells a failed check
 * apart from one nobody has run.
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
 *
 * An analysis that revises nothing answers so. That is the ordinary case — most
 * analyses are a first run — and reporting it as "revises nothing" is an
 * answer, where a refusal would say the question does not apply.
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
 * `why <criterion>` — what a condition requires, what has been said about it,
 * and what it holds up.
 *
 * **The detail `gate` sheds.** A gate's page answers what state every
 * condition is in and deliberately carries no verdict text; this is where the
 * text lives, one criterion at a time.
 *
 * The evaluations are **not** scoped to a gate: one criterion can govern
 * several and be evaluated separately against each, so a reader asking about
 * the condition itself is asking about all of them. `gateStatus` keeps the
 * narrower scope, and its own comment says why.
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
 * The `Gate` case: `gateStatus`, exhaustive over `GateStatus.state` — the same
 * four-way split `gateStateFrom` computes, worded rather than coloured.
 * `blocked` and `incomplete` both cite every condition not currently passing,
 * since a blocked gate can carry a never-run condition beside its failed one;
 * `satisfied` and `never-evaluated` cite every condition, all of them sharing
 * one state there.
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
 *
 * Every other kind gets a refusal built from **this** object, below, so a kind
 * added here is one the refusal stops claiming for itself. Naming the explained
 * kinds twice — once in a hand-written list, once in the table — is drift in
 * the direction that fails silently.
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

/** Every kind `EXPLAINED` does not already have a case for. */
type UnexplainedKind = Exclude<Kind, keyof typeof EXPLAINED>;

/**
 * The refusal every kind outside {@link EXPLAINED} gets — two parts, per the
 * discipline this file states above `ReadSurface`: **what was asked** (the
 * kind) and **what `why` explains instead**. There is deliberately no third
 * part naming where else to look: the domain does not know which surface is
 * calling, so it cannot name a command (that comment's own rule) — and a
 * blanket "this record has no other verb for it yet either" is false for most
 * of these: `gate`/`criteria`/`design` all read a gate, `origin`/`pursuits` a
 * question, `reproducibility` an analysis. Naming a false absence is what the
 * refusal discipline above exists to prevent, so this says only what is true.
 */
function refuseToExplain(kind: UnexplainedKind): Explainer {
  return async () => {
    throw new Error(
      `why does not yet explain a ${kind}; it explains ${EXPLAINED_KINDS.join(", ")}`,
    );
  };
}

/**
 * One refusal per {@link UnexplainedKind} — still a literal object, so
 * `satisfies` checks it totally over exactly the kinds `EXPLAINED` has not
 * claimed. That cuts both ways: moving a kind into `EXPLAINED` drops it from
 * `UnexplainedKind`, and this object's entry for it becomes an *excess*
 * property `satisfies` refuses — the compiler forces its removal rather than
 * leaving a dead refusal nobody's dispatch can reach.
 */
const REFUSED = {
  question: refuseToExplain("question"),
  unit: refuseToExplain("unit"),
  evidence: refuseToExplain("evidence"),
  decision: refuseToExplain("decision"),
  evaluation: refuseToExplain("evaluation"),
  review: refuseToExplain("review"),
  observations: refuseToExplain("observations"),
  note: refuseToExplain("note"),
} satisfies Record<UnexplainedKind, Explainer>;

/**
 * The total table `why` dispatches through — one entry per {@link Kind}, so
 * a kind added to `LABEL_BY_KIND` without a matching entry in `EXPLAINED` or
 * `REFUSED` is a `tsc` failure, not a runtime "unknown kind".
 */
export const EXPLAINERS = { ...EXPLAINED, ...REFUSED } satisfies Record<Kind, Explainer>;
