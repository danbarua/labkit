/**
 * The LabKit domain model as data and types (docs/project-journal/001_git_init.md,
 * revised per docs/project-journal/003_review_domain_tenancy.md and
 * docs/project-journal/004_tenancy_implementation_plan.md).
 *
 * Deliberately free of any database import: this is what LabKit's entities
 * *are*, not how they're stored. `src/db/graph.ts` reads it to type and
 * validate writes; `src/db/provisioning.ts` reads it to decide what to
 * create in each tenant's graph. Neither owns it.
 */

export const NODE_LABELS = [
  "Question",
  "LineOfEnquiry",
  "EvidenceUnit",
  "Evidence",
  "Claim",
  "Decision",
  "Criterion",
  "CriterionEvaluation",
  "Gate",
  "Review",
  "Artefact",
  "Computation",
  "Task",
] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];

/**
 * Which node properties get a Postgres index, per label.
 *
 * **The runtime half of the string taxonomy, and the only half with teeth.**
 * `IndexedString` and `Timestamp` above are erased by the compiler, so
 * `provisionTenantGraph()` cannot read them; this table is what it actually
 * loops. Every entry must be a property annotated `IndexedString` or
 * `Timestamp`, and every such property must appear here —
 * `bun run check:prop-classes` fails when the two disagree.
 *
 * That checker exists under protest. CLAUDE.md is right that a fact in one
 * place needs no checker, and this is a fact in two: the type is for the reader
 * and this is for the machine. The honest upgrade is to **generate** this from
 * the types, the way `labkit://docs/tools` is generated from the tool
 * declarations and its freshness asserted by a test that was running anyway. It
 * is written by hand first because a generator for a table nobody has read yet
 * is a step ahead of the evidence.
 *
 * Non-unique, unlike the natural-id indexes next to them in
 * `provisioning.ts` — two claims may assert the same sentence on purpose (S-5),
 * and a unique index here would make that a database error instead of a
 * research finding.
 */
export const INDEXED_PROPS: { readonly [L in NodeLabel]?: readonly string[] } = {
  Question: ["posed_at"],
  Claim: ["name"],
  Decision: ["decided_at"],
  CriterionEvaluation: ["evaluated_at"],
  Artefact: ["logical_name"],
  // Written by nothing today, and indexed anyway — `check:prop-classes` found
  // them missing on its first run, which is the rule working. An index over a
  // property that is always absent costs almost nothing in Postgres, and it is
  // already there for the integration that fills them. Exceptions to
  // "every Timestamp is indexed" would need a reason; these have none.
  Computation: ["started_at", "finished_at"],
};

/**
 * Which scalar node properties `search()` scans, per label.
 *
 * Every entry must be a property annotated `Prose` (not `Prose[]` — see
 * {@link SEARCHABLE_PROSE_ARRAYS}), and every such scalar property must
 * appear here — `bun run check:prop-classes` fails when the two disagree,
 * the same guarantee it already gives {@link INDEXED_PROPS}.
 *
 * **This table has no hand-written exclusions, and that is the point.**
 * Three properties hold free text a person might reasonably search for and
 * are absent anyway, each for a different, derivable reason rather than a
 * name typed into a skip list:
 * - `Computation.method` is `ReadOnlyString`, not `Prose` — its own doc
 *   comment already says the annotation is probably wrong ("either this
 *   property is misnamed, or the writes are misusing it"). A real type bug,
 *   left as one rather than compensated for here.
 * - `Claim.name` and `Artefact.logical_name` are `IndexedString` —
 *   deliberately, not a bug: `ClaimProps.name`'s own doc comment says
 *   wording is treated as a key there, and `claimsAsserting()` is already
 *   the exact-match search for it. `IndexedString` is a different search
 *   mode from `Prose`'s substring one, not a smaller version of it.
 *
 * None of the three needed naming in this table's own logic — deriving
 * strictly from the written annotation excludes all three for free. They
 * are named here only so a reader does not have to rediscover why.
 */
export const SEARCHABLE_PROSE: { readonly [L in NodeLabel]?: readonly string[] } = {
  Question: ["name"],
  LineOfEnquiry: ["name"],
  Evidence: ["statement"],
  Decision: ["reason", "invalidation_check"],
  Criterion: ["proposition"],
  CriterionEvaluation: ["value"],
  Gate: ["consequence"],
  Review: ["verdict"],
  Task: ["objective", "acceptance"],
};

/**
 * Which `Prose[]` (array) node properties `search()` scans, per label.
 *
 * Split from {@link SEARCHABLE_PROSE} because AGE's Cypher has no `ANY(x IN
 * list WHERE cond)` form (measured 2026-08-31: syntax error) — an array
 * property needs `size([x IN n.prop WHERE toLower(x) CONTAINS
 * toLower($needle)]) > 0` instead of a plain `toLower(n.prop) CONTAINS …`,
 * so the query layer needs to know which shape it is building before it
 * runs, not just which properties are searchable.
 */
export const SEARCHABLE_PROSE_ARRAYS: { readonly [L in NodeLabel]?: readonly string[] } = {
  Task: ["mayRead"],
};

export const EDGE_LABELS = [
  "MOTIVATES", // Question -> LineOfEnquiry
  "REQUIRES", // LineOfEnquiry -> Evidence
  "ADDRESSES", // EvidenceUnit -> LineOfEnquiry
  "SUPPORTS", // Evidence -> Claim
  "CHALLENGES", // Evidence -> Claim
  "REVERIFIES", // Evidence -> Evidence
  "PROMOTES", // Decision -> Claim
  "USES", // EvidenceUnit -> Computation
  "CONSUMES", // Computation -> Artefact (execution lineage; the inverse of PRODUCES)
  "PRODUCES", // EvidenceUnit/Computation/Task -> Evidence/Artefact/Computation
  "RECORDED_IN", // Evidence -> Artefact
  "GOVERNS", // Criterion -> Gate (which condition a gate enforces)
  "QUALIFIES", // Criterion -> EvidenceUnit (which standard a finding is held to)
  "EVALUATED_AS", // Criterion -> CriterionEvaluation
  "TRIGGERS", // CriterionEvaluation -> Gate
  "GATES", // Gate -> Task/Computation
  "CHANGES", // Decision -> Criterion
  "BASED_ON", // Decision -> Evidence | CriterionEvaluation -> Evidence
  "RESOLVES", // Decision -> Question
  "NARROWS", // Decision -> Question
  "DEFERS", // Decision -> Question
  "SUPERSEDES", // Decision -> Decision (an amendment is a decision with this edge)
  "EVALUATES", // Review -> Claim | Decision | Evidence | EvidenceUnit
  "INVALIDATED_BY", // Artefact -> Review (which review the retraction rested on)
  "IMPLEMENTS", // Task -> EvidenceUnit
] as const;
export type EdgeLabel = (typeof EDGE_LABELS)[number];

/**
 * One edge, as an act reports having created it.
 *
 * Endpoints are natural ids rather than `Ref`s: this is the persistence layer,
 * where a handle's brand does not exist and `labelForNaturalId` is how a label
 * is recovered. The domain re-reads them as handles on the way out.
 *
 * Declared here beside {@link EdgeLabel} rather than in `src/domain/events.ts`
 * because the collector is in `TenantGraph.createEdge`, and `src/db` may not
 * import `src/domain`.
 */
export interface MintedEdge {
  from: string;
  label: EdgeLabel;
  to: string;
}

/**
 * Single authoritative source of truth for legal edge shapes (PJ-003 §8).
 * `createEdge` validates the resolved `(fromLabel, toLabel)` pair against
 * this table and throws before issuing any Cypher if the pair isn't listed.
 *
 * `GATES`'s source is `Gate`, not `Criterion` (PJ-004 decision #9): the
 * shipped shape had `CriterionEvaluation -[:TRIGGERS]-> Gate` and
 * *separately* `Criterion -[:GATES]-> Task/Computation`, meaning nothing
 * ever flowed out of `Gate` — `Criterion` did the gating, contradicting
 * PJ-001's own definition of `Gate` as "the policy consequence attached to
 * an evaluation." The chain now actually chains:
 * `Criterion -[:EVALUATED_AS]-> CriterionEvaluation -[:TRIGGERS]-> Gate -[:GATES]-> Task/Computation`.
 */
export const EDGE_SCHEMA: Record<EdgeLabel, ReadonlyArray<readonly [NodeLabel, NodeLabel]>> = {
  /**
   * "Gave rise to." A question gives rise to a line of enquiry; a decision
   * gives rise to a question.
   *
   * The second pair is earned by S-1. Sharpening a vague hunch into a testable
   * question records a `Decision` that `NARROWS` the original — but nothing
   * attached the *product* of that act to the act, so a question created by
   * sharpening had no path back to it. Demonstrated rather than argued: with
   * one hunch sharpened twice and a result landing in between,
   * `originOf(secondQuestion)` reported the knowledge that existed before the
   * *first* sharpening, back-dating an act onto evidence that had not yet
   * arrived. That is a confidently wrong answer, not an empty one — the reply
   * was populated and plausible, and belonged to a different event.
   *
   * The `Decision -> Claim` pair is S-12, and it is the third instance of the
   * same shape (PJ-008 row AB): `CHANGES` records which interpretation was
   * withdrawn, and nothing recorded which one replaced it. S-7 got away
   * without such an edge because a gate contains its design conditions and the
   * current one is derivable as the unchanged member. An interpretation has no
   * container, so from a narrowed claim there was no route back to the act
   * that narrowed it — the prediction that S-7's remedy would transfer was
   * wrong. Note what this makes redundant: with `CHANGES` and `MOTIVATES` both
   * present the revision chain walks claim-to-claim through its decisions, so
   * no `SUPERSEDES` edge is written between them. An edge needs a reader.
   *
   * A direct `Question -> Question` lineage edge was the other candidate and
   * was not chosen: it answers "where did this come from" but not "what did we
   * know when we asked it", because the reason and the frozen evidence set
   * live on the decision. The two models are not equally capable here, so
   * PJ-011's record-both-pick-neither rule does not apply — see PJ-008 row D.
   */
  MOTIVATES: [
    ["Question", "LineOfEnquiry"],
    ["Decision", "Question"],
    ["Decision", "Claim"],
    // The revision an act produced, at analysis grain — the half that pairs
    // with `SUPERSEDES -> Computation`. `MOTIVATES` names what an act put in
    // place; `SUPERSEDES` names what it stands instead of.
    ["Decision", "Computation"],
  ],
  REQUIRES: [["LineOfEnquiry", "Evidence"]],
  // A Task earns this pair by #98: `labkit contract` had no way to say why a
  // piece of planned work exists. Reusing ADDRESSES rather than minting a new
  // label -- an EvidenceUnit already ADDRESSES the enquiry it was recorded
  // towards, and a Task addressing the same enquiry before any evidence
  // exists is the same claim, one step earlier.
  //
  // Checked against the precedent that went the other way (PJ-016 §4, row V):
  // reusing GATES for qualification was rejected because GATES was "fully
  // occupied with control semantics", and one edge with two readings is
  // PJ-012 §1's shape -- the one that "has caused every expensive mistake in
  // this project". The difference here is not surface similarity, it's
  // whether the two readings can ever meet in a query. GATES governs which
  // work may proceed; folding qualification into it would have made a
  // control-flow edge also carry a content judgement, indistinguishable at
  // read time. ADDRESSES already has one reading -- "this work was done
  // towards this enquiry" -- and a planned Task's edge is the *same* reading
  // one step earlier in time, not a second one. Every existing reader
  // (`whatIsKnown`, `withinScope`, `enquiryStatus`'s `mine` query) binds its
  // source variable to `:EvidenceUnit` explicitly before matching the edge,
  // so the two node types never collide in a traversal even though they
  // share a label.
  ADDRESSES: [
    ["EvidenceUnit", "LineOfEnquiry"],
    ["Task", "LineOfEnquiry"],
  ],
  SUPPORTS: [["Evidence", "Claim"]],
  CHALLENGES: [["Evidence", "Claim"]],
  USES: [["EvidenceUnit", "Computation"]],
  /**
   * Execution lineage: what a computation read. Earned by S-11
   * (docs/project-journal/008_user_story_mining.md), which asks what an
   * analysis rests on and could previously only answer it by going out to the
   * enquiry and back — `ADDRESSES` to a LineOfEnquiry, then `REQUIRES` to
   * whatever observations that enquiry needs. That answers "what observations
   * is this enquiry associated with", not "what did this computation
   * consume", and the two stop being the same answer the moment one enquiry
   * carries two analyses over different inputs. It produced a real false
   * inference in the service layer's `whySupported()`, not a hypothetical one.
   *
   * Paired with `PRODUCES: Computation -> Artefact`, execution lineage reads
   * directly in both directions, and it is the seam an external run tracker
   * (W&B/MLflow knowing that run R42 read artefact D3) would eventually
   * attach to, while LabKit keeps the scientific identity and the reason.
   */
  CONSUMES: [["Computation", "Artefact"]],
  PRODUCES: [
    ["EvidenceUnit", "Evidence"],
    ["EvidenceUnit", "Artefact"],
    ["Computation", "Artefact"],
    ["Task", "Computation"],
    ["Task", "Artefact"],
  ],
  RECORDED_IN: [["Evidence", "Artefact"]],
  /**
   * Which condition a gate enforces, independent of whether it has ever been
   * evaluated. Earned by S-17.
   *
   * PJ-004 #9 made the control chain flow
   * `Criterion -EVALUATED_AS-> CriterionEvaluation -TRIGGERS-> Gate -GATES-> work`,
   * which correctly means nothing flows out of a gate that no evaluation
   * triggered. But it also made the criterion reachable from the gate ONLY
   * through an evaluation — so for a gate nobody has evaluated, which is
   * precisely S-17's subject, the governing criterion is unreachable and the
   * gate is an orphan that gates work while recording no condition at all.
   *
   * Demonstrated rather than argued: `criterionGoverning()` returned null for
   * a declared-but-unevaluated gate, so the reviewer's actual question —
   * "show me evidence this fails when the artefact is wrong" — could not even
   * be aimed at a criterion. Direction matches the rest of the chain so the
   * whole control path reads left to right.
   */
  GOVERNS: [["Criterion", "Gate"]],
  /**
   * The standard a finding is held to, as distinct from the work a condition
   * gates. Earned by S-3b (PJ-016), which is S-3's conversation with the
   * downstream work removed.
   *
   * Demonstrated rather than argued: with prespecified robustness checks
   * failing against the very analysis they were agreed about, `whySupported()`
   * reported `supported: true` — "some evidence exists" rather than "the
   * evidence holds up by the standard set for it". Criteria reached only
   * `Gate`, so there was no path from a claim to the conditions it was
   * supposed to satisfy, and the answer was confidently wrong rather than
   * empty. Ledger row V.
   *
   * The endpoint is the `EvidenceUnit` rather than the `Claim` because a
   * prespecified check is agreed about a *run* — "the checks we agreed before
   * running it" — and applies to what that run concluded. One analysis whose
   * conclusions are held to different standards would discriminate the two and
   * is the scenario that would move this; nothing in the corpus does yet.
   *
   * Written when the analysis is recorded, not when a check is evaluated: a
   * check that was never run must still count against the finding, and an edge
   * minted by evaluation could not express one.
   */
  QUALIFIES: [["Criterion", "EvidenceUnit"]],
  EVALUATED_AS: [["Criterion", "CriterionEvaluation"]],
  TRIGGERS: [["CriterionEvaluation", "Gate"]],
  GATES: [
    ["Gate", "Task"],
    ["Gate", "Computation"],
  ],
  /**
   * "Re-checked that finding, without reproducing the run behind it." Earned
   * by S-10.
   *
   * Demonstrated rather than argued: the only way to record a re-run was as
   * another analysis concluding the same proposition, which S-5's scope rules
   * then resolve to the same claim — so `whySupported()` reported the
   * proposition resting on *two independent findings*. It rests on one, checked
   * twice, and the second check specified initial conditions the first never
   * recorded. A historical claim reporting itself independently corroborated by
   * an execution nobody reproduced is confidently wrong, not merely thin.
   *
   * What a shared claim cannot carry is **direction** and **caveat**: which run
   * re-checked which, and that their executions are not the same. Two genuinely
   * independent analyses in one enquiry are indistinguishable from a
   * re-verification without it, and those are different scientific situations.
   *
   * `Evidence -> Evidence` rather than `EvidenceUnit -> EvidenceUnit` because a
   * re-run checks a *finding*: one analysis may re-verify one of several
   * conclusions and say nothing about the others. The unit-level relationship
   * is the one to reach for if a scenario ever re-runs a whole analysis as an
   * indivisible thing; nothing has.
   */
  REVERIFIES: [["Evidence", "Evidence"]],
  /**
   * The act that confers confirmatory standing on a finding. Earned by S-18.
   *
   * The prediction for that build was that `CHANGES` would carry it — a
   * decision acting on a claim, which is what `CHANGES` already means. It was
   * refuted by demonstration: `withdrawalOf()` reads *any* `Decision -CHANGES->
   * Claim` as a retraction (S-12, where that is exactly right), so promoting a
   * finding made `whySupported()` report it as withdrawn and no longer
   * supported. Promotion would have retracted the thing it promoted.
   *
   * That is the same lesson `GATES` taught in row V, from the other side: one
   * edge with two readings is the failure shape behind every expensive mistake
   * in this project. Two acts that both "change a claim" are not the same
   * relationship when one means *stop asserting this* and the other means
   * *assert it more strongly*.
   *
   * Direction and endpoint match `CHANGES`: the decision is the act, the claim
   * is what it acts on. Why it was promoted lives on the decision's `reason`,
   * so a reader can ask what justified the promotion and not merely that one
   * happened.
   */
  PROMOTES: [["Decision", "Claim"]],
  /**
   * What a decision withdrew or replaced. A design condition (S-7), an
   * interpretation (S-12).
   *
   * The `Claim` pair is earned by S-12. With only a `Review` recording that an
   * interpretation had been criticised, `whySupported()` went on reporting the
   * retracted sentence as supported — the record confidently asserting
   * something the reviewer had just withdrawn, which is the worst thing a
   * provenance system can do. A review is not a retraction: reviews also
   * confirm, and telling the two apart from a free-text verdict would be
   * text-matching.
   */
  CHANGES: [
    ["Decision", "Criterion"],
    ["Decision", "Claim"],
  ],
  BASED_ON: [
    ["Decision", "Evidence"],
    ["CriterionEvaluation", "Evidence"],
  ],
  RESOLVES: [["Decision", "Question"]],
  NARROWS: [["Decision", "Question"]],
  DEFERS: [["Decision", "Question"]],
  /**
   * **A later record stands instead of an earlier one.**
   *
   * The line between this and {@link CHANGES} is what keeps either honest, and
   * it was drawn by a reader that broke without it:
   *
   * - `CHANGES` — the *same evidence read differently*. A reading narrowed
   *   (S-12), a condition amended (S-7). Nothing is replaced; the record still
   *   stands and its meaning moved.
   * - `SUPERSEDES` — *this stands instead of that*. An amendment over an
   *   amendment, a corrected finding over a defective one, a re-analysis over
   *   the analysis it replaced.
   *
   * Dan's own line for it, which is the sentence to pattern-match on rather
   * than any paraphrase of it:
   *
   * > supersedes is a substitution of one record for another; the research
   * > journey follows a different fork in the road. changes = looking back at
   * > the map — same thing, interpreted differently from a perspective further
   * > down the road.
   *
   * That image is also the reason `interpretationHistory` must never see a
   * supersession: it walks the map being looked back at, and a fork taken is
   * not a step along it.
   *
   * **`reinterpret` does not supersede**, which is the case that makes the
   * distinction load-bearing rather than tidy: the evidence is untouched and
   * only the reading moved.
   *
   * ## The measurement that earned the two `Decision` pairs below
   *
   * #173 first wrote per-finding supersession as `CHANGES -> Claim`, argued as
   * one reading — *this decision changed which claim stands*. Building it
   * refuted the argument. `interpretationHistory` walks
   * `Decision -MOTIVATES-> Claim` with `-CHANGES-> Claim` to build a narrowing
   * chain, so a replacement entered the interpretation history and looped it:
   *
   *     interpretation history for "…" loops at "…"
   *
   * There is no structural discriminator — both decisions change exactly one
   * claim and motivate exactly one. So the edge did carry two readings and a
   * reader that wanted one got both. **That is the third instance of this
   * project's most expensive shape**, after `PROMOTES` (split out of `CHANGES`
   * because promotion read as retraction) and row V's `GATES`.
   *
   * ## Who reads which
   *
   * - `interpretationHistory` reads `CHANGES` only — a supersession is not a
   *   step in a narrowing chain.
   * - `withdrawalOf` reads both: a claim no longer stands whether its reading
   *   was narrowed or its finding was superseded.
   * - `whySupported` reads `SUPERSEDES` for *instead of*.
   *
   * The `Computation` pair is analysis-grain **lineage**: this analysis is a
   * revision of that one. It says nothing about the standing of the old
   * analysis's conclusions — no reader may infer that they fell from this
   * edge's existence. Retraction is one grain lower, per finding, which is
   * exactly #132's fix: the old code carried it on `Artefact.invalidated`, one
   * flag over every finding, so replacing one conclusion withdrew the rest.
   */
  SUPERSEDES: [
    ["Decision", "Decision"],
    ["Decision", "Claim"],
    ["Decision", "Computation"],
  ],
  /**
   * `Review -> EvidenceUnit` is the second relationship S-11 earned: a review
   * of an *analysis* previously had nowhere to point, so its subject survived
   * only in the ephemeral event stream and "why was this replaced?" was
   * unanswerable from the graph.
   *
   * The endpoint is the EvidenceUnit rather than the Computation
   * deliberately. What the S-11 reviewer criticized — "your bootstrap is
   * centred on the observed effect; it isn't a null test" — is the
   * inferential procedure, not the execution: nothing ran incorrectly. The
   * EvidenceUnit is the bounded inferential activity; the Computation is how
   * it was executed. `Review -> Computation` may well be earned later by a
   * scenario reviewing an execution, but S-11 did not earn it.
   */
  EVALUATES: [
    ["Review", "Claim"],
    ["Review", "Decision"],
    ["Review", "Evidence"],
    ["Review", "EvidenceUnit"],
  ],
  /**
   * Which review a retraction actually rested on. Earned by S-11b, row O.
   *
   * `replaceAnalysis()` took a `because: ReviewRef`, checked it reviewed the
   * analysis being replaced, and then wrote it nowhere — the reference reached
   * the event stream and stopped. So `whySupported()` reported a superseded
   * finding's reason from `OPTIONAL MATCH (r:Review)-[:EVALUATES]->(u)`, any
   * review of the unit. With a critical review and a confirming one on the same
   * analysis — which is what a programme with two reviewers produces
   * constantly — it reported *"numbers check out; independently recomputed the
   * same values"* as a reason the work was retracted. An approval presented as
   * a retraction, demonstrated in two worlds that differ only in which review
   * the researcher acted on and that the read surface could not tell apart.
   *
   * **Not `EVALUATES`.** `Review -> Evidence` already exists and means *this
   * was reviewed*; using it for *this caused the retraction* is one edge with
   * two readings, which CLAUDE.md names as the failure shape behind every
   * expensive mistake here. `PROMOTES` was split from `CHANGES` for exactly
   * this reason.
   *
   * **Not `BASED_ON`.** Semantically it fits — the invalidation rested on this
   * review — and that is the trap. Row AA is a live `boundary` recording that
   * `BASED_ON` already carries two senses, and a third would widen a row while
   * closing this one. Its sources are also judgments (`Decision`,
   * `CriterionEvaluation`); an `Artefact` is not one.
   *
   * The endpoint is the invalidated `Artefact` because that is the thing whose
   * standing changed and the thing a reader is holding when the question
   * arises: *why is this no longer valid?* The direction is passive, like
   * `BASED_ON` and `RECORDED_IN`, because a review does not retract anything —
   * a researcher does, on the strength of it.
   */
  INVALIDATED_BY: [["Artefact", "Review"]],
  IMPLEMENTS: [["Task", "EvidenceUnit"]],
};

// **What LabKit does with a stored string — five names instead of one.**
//
// Every property below is a `string` at runtime; these say nothing about the
// value's shape and everything about the *code's relationship to it*. That is
// the question a reader of `*Props` actually has, and answering it used to
// require reading every Cypher query in `src/domain/` — an audit that took
// three hundred seconds of machine time and could go stale the next afternoon.
//
// They are plain aliases, so none of them constrains anything at a call site.
// The enforcement is elsewhere and deliberately narrow: `INDEXED_PROPS` below
// is what `provisionTenantGraph()` actually reads, and `bun run
// check:prop-classes` fails when it disagrees with these annotations. A
// classification nobody re-reads is not a mechanism (PJ-025), so exactly one
// of them has a machine consequence and the rest are for the reader.
//
// The axis is *does LabKit inspect this, and where* — not *what does it look
// like*. `posed_at` is a timestamp and `content_hash` is a digest, but what
// decides their type here is that one appears in a Cypher predicate and the
// other is only ever compared in TypeScript.

/**
 * LabKit matches on this **in Cypher**, so it is worth an index and gets one.
 *
 * Only two properties qualify today, and both were sequential scans until
 * `INDEXED_PROPS` existed: `Claim.name` is matched in twelve places, and
 * `Artefact.logical_name` in one.
 */
export type IndexedString = string;

/**
 * A unique handle from **outside** LabKit — a digest, a URI, another system's
 * run id. Compared for equality in TypeScript, never matched in a query.
 *
 * **Most of these are written by nothing today, and that is not a reason to
 * delete them.** LabKit does not decide on their contents, but the wider
 * toolset may show them to a researcher who does, and an integration may fill
 * them: PJ-009 names `CONSUMES`/`PRODUCES` as *"where an external run tracker
 * would eventually attach"*, and these are its attachment points. The type is
 * where that reason lives, so the next audit finds an answer rather than an
 * unexplained empty field.
 */
export type IdentityString = string;

/**
 * An ISO-8601 instant, from the injected `Clock`.
 *
 * Indexed, like {@link IndexedString} — a timestamp exists to be ordered or
 * bounded, and `posed_at` already is, in Cypher. `decided_at` and
 * `evaluated_at` are compared in TypeScript today and get indexes on the same
 * reasoning rather than waiting for the query that needs one.
 */
export type Timestamp = string;

/**
 * Stored, handed back to callers, never decided on.
 *
 * **Generic on purpose.** A bare alias here would widen
 * `role: EvidenceUnitRole` to accept any string, which is strictly less safety
 * than before the classification existed. `ReadOnlyString<EvidenceUnitRole>`
 * keeps the union and adds the fact that nothing reads it.
 */
export type ReadOnlyString<T extends string = string> = T;

/**
 * {@link ReadOnlyString}, and potentially large — free text a human or an agent
 * wrote.
 *
 * The distinction from `ReadOnlyString` is size, not treatment, and it is drawn
 * because size is what would decide whether a property belongs in the graph at
 * all. Every property's value is parsed out of one `properties` agtype column
 * by a recursive-descent parser on **every read of that node**, including reads
 * that wanted only its `natural_id` — so a paragraph costs something on a path
 * that never looks at it. Nothing is being moved on that basis yet; the type is
 * what makes the question answerable without another audit.
 */
export type Prose = string;

export type EvidenceUnitRole =
  | "experiment"
  | "feasibility"
  | "verification"
  | "robustness"
  | "ablation"
  | "mechanistic"
  | "analysis"
  | "infrastructure"
  | "confirmatory";

// `project_id` removed from every *Props interface below (PJ-003 §4): the
// graph itself is the tenant partition now, not a repeated node property.

export interface QuestionProps {
  name: Prose;
  /**
   * When the question entered the record, from the injected clock.
   *
   * Earned the way `Decision.decided_at` was, and by the same kind of
   * demonstration: without it `whatWasKnown()` began `MATCH (q:Question)` —
   * every question that exists *now* — and reported a question posed in April
   * as `open` in March. `open` is an assertion, not an absence: it says the
   * question was on the record and nothing had settled it. Applied to a
   * question nobody had asked yet it back-dates the programme's own agenda,
   * which is the mirror of the failure that method already guarded against for
   * promotion. See tests/consumer/historical_survey.test.ts, which demonstrates
   * it rather than arguing it.
   *
   * **Record time, not the moment the researcher first wondered.** Same reading
   * as `decided_at`, and named here for the same reason: a bare timestamp looks
   * like a fix while silently choosing a side.
   *
   * Required, not optional. A question whose instant is unknown cannot be
   * placed in time at all, and a survey that quietly includes the unplaceable
   * is the wrong answer this property exists to stop.
   *
   * The **only** node property LabKit matches on in Cypher besides `natural_id`
   * — `WHERE q.posed_at <= $at` in `whatWasKnown()`. That is why it is indexed;
   * the other two timestamps are indexed by analogy, this one by a live query.
   */
  posed_at: Timestamp;
}

export interface LineOfEnquiryProps {
  name: Prose;
}

export interface EvidenceUnitProps {
  /**
   * Written by two verbs, read by none.
   *
   * `ReadOnlyString<EvidenceUnitRole>` rather than a bare `ReadOnlyString`: the
   * union is what stops a third writer inventing a tenth value, and widening it
   * to `string` in the name of classifying it would trade real safety for a
   * label. CLAUDE.md uses this property as the contrast that bounds the
   * no-cull policy — an unwalked *edge* is a claim about the domain and is
   * protected; a property value is not — so the type is now where that fact
   * lives, rather than a paragraph a reader has to find.
   */
  role: ReadOnlyString<EvidenceUnitRole>;
}

export interface EvidenceProps {
  statement: Prose;
}

export interface ClaimProps {
  /**
   * The proposition, and the most-matched string in the codebase — twelve
   * Cypher sites address a claim by it.
   *
   * `IndexedString`, not `Prose`, and the difference is the whole point of the
   * taxonomy: this reads like free text and behaves like a key. It is still
   * **not** identity — `claimsAsserting()` is the one seam where wording
   * becomes a handle, and it returns every match and refuses to pick, because
   * two claims can assert the same sentence (S-5).
   */
  name: IndexedString;
  /**
   * Whether the finding was prespecified, and whether anyone has promoted it —
   * **two facts under one value**, which is issue #63.
   *
   * `ReadOnlyString` until 2026-08-27, and that was **false**. The taxonomy
   * defines that class as *stored, handed back to callers, never decided on*;
   * the annotation exists to say nothing reads it. Three sites decide on it,
   * and the first is `whatIsKnown`'s bucketing, where it selects the survey's
   * strongest word. Found by reading the declaration beside its readers rather
   * than by any check — the shape issue #50 is a sweep for.
   *
   * It is a plain union now, which claims nothing beyond the values. That is
   * weaker than the taxonomy would like and it is what is true: a taxonomy
   * member asserting something false about the field it annotates is worse
   * than one absent, because the annotation is what a reader trusts instead of
   * grepping.
   *
   * Optional because it is unset until promotion, and absence is read as
   * exploratory rather than defaulted at the write.
   */
  kind?: "exploratory" | "confirmatory";
}

/**
 * `evidence` (a string shadow of `Decision -[:BASED_ON]-> Evidence`) is removed
 * (PJ-003 §10).
 *
 * So are `is_open`/`closed_at`, PJ-004 decision #2's explicit operational
 * state, removed on 2026-08-24 with `TenantGraph.closeDecision()` and the
 * biconditional validator that guarded them. **Nothing was ever stored in
 * them.** All six verbs that mint a Decision pass exactly the three properties
 * below, so the only branch of that validator production ever reached was the
 * one defaulting `is_open` to `true`; nothing anywhere read whether a decision
 * was closed. A decision's standing is expressed by supersession and review,
 * which is where the doc comment said it belonged all along.
 */
export interface DecisionProps {
  reason: Prose;
  /**
   * What would reopen this decision.
   *
   * `Prose`, but only one of the six writers takes it from the caller —
   * `acceptAsUnresolved` passes `input.until`. The other five write a constant
   * chosen by the verb. Worth knowing before treating this as something a
   * researcher said.
   */
  invalidation_check: Prose;
  /**
   * When the act was recorded, from the injected clock. Earned by row Z.
   *
   * **Record time, not belief time**, and the distinction is load-bearing rather
   * than pedantic. This says when the decision entered the record; it does not
   * say when the researcher came to hold it, and nothing here can. A designer in
   * the consumer exercise required both readings separately — *"recorded by 3
   * March"* against *"asserted as held on 3 March but written down later"* — and
   * `023` demoted that to a candidate extension because no source obligation
   * requires it. Naming the reading here is what stops the next reader assuming
   * the other one: a single timestamp otherwise looks like a fix while silently
   * choosing a side.
   *
   * Required, not optional. A decision whose instant is unknown cannot be
   * ordered, and an ordering with holes is the thing row Z already had —
   * `CriterionEvaluation.evaluated_at` bounded some closures and left the rest
   * unplaceable, which is why deriving the order from evidence failed.
   */
  decided_at: Timestamp;
}

export interface CriterionProps {
  proposition: Prose;
}

// `evidence_ref` removed (PJ-004 decision #5) — represented in-graph now as
// `CriterionEvaluation -[:BASED_ON]-> Evidence` instead of a string shadow.
export interface CriterionEvaluationProps {
  value: Prose;
  outcome: ReadOnlyString<"pass" | "fail">;
  evaluated_at: Timestamp;
}

export interface GateProps {
  consequence: Prose;
}

export interface ReviewProps {
  /**
   * `Prose`, and `EDGE_SCHEMA.CHANGES` says why that is a decision rather than
   * a shrug: telling a confirming review from a retracting one by reading this
   * text *"would be text-matching"*, so the model expresses it structurally
   * instead. Nothing branches on these words and nothing should.
   */
  verdict: Prose;
}

// verbatim property list from the journal's Artefact section
export interface ArtefactProps {
  /**
   * `"observations"` or `"analysis-output"` — a real kind, unlike
   * {@link ComputationProps.kind}. Nothing reads it: `report.ts` notes that the
   * `ART_` prefix cannot tell a raw input from an analysis output, and this
   * property could and does not. A promotion candidate for `IndexedString` if
   * a query ever wants it.
   */
  kind: ReadOnlyString;
  logical_name: IndexedString;
  content_hash?: IdentityString;
  uri?: IdentityString;
  external_ref?: IdentityString;
  invalidated?: boolean;
}

// verbatim property list from the journal's Computation section
export interface ComputationProps {
  /**
   * **Classified `ReadOnlyString` alongside {@link ArtefactProps.kind}, and the
   * classification exposes a mismatch rather than settling it.**
   *
   * Every writer passes `input.method` here — the researcher's free-text
   * description of how an analysis was carried out, which is `Prose` by any
   * reading. `Artefact.kind` holds actual kinds. So either this property is
   * misnamed, or the writes are misusing it and `method` wants a `Prose`
   * property of its own. Recorded here rather than guessed at; both are
   * promotion candidates for `IndexedString` if a query ever wants them.
   */
  kind: ReadOnlyString;
  /** Hardcoded `"completed"` by the only writer. A running or failed computation has nowhere to say so yet. */
  status: ReadOnlyString;
  backend?: IdentityString;
  external_run_id?: IdentityString;
  started_at?: Timestamp;
  finished_at?: Timestamp;
  code_revision?: IdentityString;
  environment_ref?: IdentityString;
}

/**
 * **`is_open` was here until 2026-08-28, and it went for the reason
 * {@link DecisionProps}'s did — the same defect, in the neighbouring type.**
 *
 * `planWork` passed `is_open: true` and nothing anywhere read it. That is
 * `DecisionProps.is_open` exactly: written by every writer, consulted by no
 * reader, removed on 2026-08-24 with the note above.
 *
 * Found while deriving the states for `workList` (#66), which is the moment it
 * mattered: a stored flag is the obvious thing for a work-queue filter to read,
 * and it would have been the first place the queue rotted. Whether a task is
 * still open is computed from what the graph holds — a gate that protects it,
 * an analysis that implements it — the same way `gateStatus` computes four
 * states with no value anyone can set to `satisfied`.
 *
 * `outputs` stays, and the contrast is the point: it is also written-and-unread,
 * and it carries a reason that names what is missing. This carried none.
 */
export interface TaskProps {
  objective: Prose;
  /**
   * What the task is permitted to read — a **native agtype array**, not a JSON
   * string.
   *
   * It was `inputs: string` holding `JSON.stringify(mayRead)`, on the stated
   * grounds that serialising kept it from being queried by element. That was
   * not a platform constraint and the repo already disproved it:
   * `CONSUMES.positions` is a `number[]` written and read as an array with no
   * serialisation either way. Storing it honestly deleted the round trip, a
   * try/catch and two runtime type guards on the read side — all of which
   * existed to survive a shape the writer could not produce.
   */
  mayRead: Prose[];
  /** Hardcoded `""` by the only writer. What a task produced has nowhere to be said yet. */
  outputs: ReadOnlyString;
  acceptance: Prose;
}

/**
 * Binds each node label to the property shape it accepts. This is what makes
 * `createNode("Question", …)` reject `Computation` props at compile time —
 * before this map existed, `createNode` took `T extends Record<string, unknown>`
 * and the *Props interfaces above were documentation only.
 */
export interface NodePropsByLabel {
  Question: QuestionProps;
  LineOfEnquiry: LineOfEnquiryProps;
  EvidenceUnit: EvidenceUnitProps;
  Evidence: EvidenceProps;
  Claim: ClaimProps;
  Decision: DecisionProps;
  Criterion: CriterionProps;
  CriterionEvaluation: CriterionEvaluationProps;
  Gate: GateProps;
  Review: ReviewProps;
  Artefact: ArtefactProps;
  Computation: ComputationProps;
  Task: TaskProps;
}

/** Everything the persistence layer needs to know about one node label, in one place. */
interface NodeType<L extends NodeLabel> {
  /**
   * Short display prefix for natural IDs (e.g. `Computation` -> `"COMP_123"`,
   * underscore per PJ-004 decision #4). Scoped globally per entity-type, not
   * per-tenant. Must stay in sync with the per-label `CREATE SEQUENCE`
   * statements in drizzle/0002_natural_ids.sql — nothing here enforces that,
   * it's a cross-file obligation to a migration.
   */
  readonly prefix: string;

  /**
   * Creation-time enforcement of per-label property invariants (PJ-004
   * decision #8). Returns the props to actually write, so a validator can
   * normalize as well as reject.
   *
   * **No label declares one today.** `Decision` was the only user and went with
   * `closeDecision()` on 2026-08-24. The hook is kept rather than culled with
   * it: it is one optional field and one ternary in `createNode`, and it is the
   * seam a per-label invariant attaches to. Deleting and re-adding it would
   * cost more than leaving it.
   */
  readonly validate?: (props: NodePropsByLabel[L]) => NodePropsByLabel[L];
}

/**
 * One entry per node label, replacing what used to be four parallel records
 * (`NODE_LABELS` / `NATURAL_ID_PREFIX` / `NODE_VIEW_COLUMNS` /
 * `NODE_VALIDATORS`) indexed by the same key and kept aligned by comment.
 */
export const NODE_TYPES: { readonly [L in NodeLabel]: NodeType<L> } = {
  Question: { prefix: "Q" },
  LineOfEnquiry: { prefix: "LOE" },
  EvidenceUnit: { prefix: "EU" },
  Evidence: { prefix: "EV" },
  Claim: { prefix: "CLM" },
  Decision: { prefix: "DEC" },
  Criterion: { prefix: "CRIT" },
  CriterionEvaluation: { prefix: "CEVAL" },
  Gate: { prefix: "GATE" },
  Review: { prefix: "REV" },
  Artefact: {
    prefix: "ART",
  },
  Computation: {
    prefix: "COMP",
  },
  Task: { prefix: "TASK" },
};

/** Reverse of `NODE_TYPES[label].prefix` — resolves a node's label from its natural id's prefix, e.g. "EU_17" -> "EvidenceUnit". */
const LABEL_BY_PREFIX: Record<string, NodeLabel> = Object.fromEntries(
  NODE_LABELS.map((label) => [NODE_TYPES[label].prefix, label]),
) as Record<string, NodeLabel>;

export function labelForNaturalId(naturalId: string): NodeLabel {
  const sep = naturalId.indexOf("_");
  const prefix = sep === -1 ? naturalId : naturalId.slice(0, sep);
  const label = LABEL_BY_PREFIX[prefix];
  if (!label) throw new Error(`unrecognized natural id prefix in "${naturalId}"`);
  return label;
}

/**
 * A node as returned to callers outside the persistence layer: AGE's
 * internal graphid (`AgtypeVertex.id`, a large opaque number/bigint — see
 * src/db/agtype.ts) is stripped and replaced with the short, incrementing
 * `natural_id` that's safe to show a user or an AI-agent caller.
 */
export interface PublicNode<L extends NodeLabel> {
  natural_id: string;
  label: L;
  properties: NodePropsByLabel[L];
}
