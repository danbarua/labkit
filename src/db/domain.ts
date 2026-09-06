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
  "Note",
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
 * **This is a fact in two places** — the type is for the reader, this is for
 * the machine — which is what the checker is for. Generating it from the types
 * would be the honest upgrade.
 *
 * Non-unique, unlike the natural-id indexes beside them in `provisioning.ts`:
 * two claims may assert the same sentence on purpose, and a unique index here
 * would make that a database error instead of a research finding.
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
 * Every entry must be a property annotated `Prose` or `IndexedString` (not
 * `Prose[]` — see {@link SEARCHABLE_TEXT_ARRAYS}), and every such scalar
 * property must appear here — `bun run check:prop-classes` fails when the two
 * disagree, the same guarantee it already gives {@link INDEXED_PROPS}.
 *
 * **This table has no hand-written exclusions, and that is the point.** It is
 * derived from the taxonomy: a property is here when its written annotation is
 * `Prose` or `IndexedString` — the two classes that hold text a person typed.
 * `Computation.method` was absent until 2026-09-05 because it was annotated
 * `ReadOnlyString` while holding a researcher's free text — the taxonomy
 * reporting a type bug rather than compensating for it, and the bug is fixed
 * rather than the table hand-edited.
 *
 * **`IndexedString` was excluded until 2026-09-03**, on the argument that
 * `claimsAsserting()` is already the exact-match search for a claim's wording
 * and a substring search would be a weaker duplicate of it. That argument was
 * about the two search *modes* and it did not survive a user: `claimsAsserting`
 * needs the whole sentence, nobody retypes one, and `search "unique winner"`
 * therefore answered that nothing on the record contained the text — about a
 * record whose claim asserted it. What a string is *for* internally and whether
 * a person might search for it are different questions; only the second decides
 * this table.
 */
export const SEARCHABLE_TEXT: { readonly [L in NodeLabel]?: readonly string[] } = {
  Question: ["name"],
  LineOfEnquiry: ["name"],
  Claim: ["name"],
  Artefact: ["logical_name"],
  Computation: ["method"],
  Evidence: ["statement"],
  Decision: ["reason", "invalidation_check"],
  Criterion: ["proposition"],
  CriterionEvaluation: ["value"],
  Gate: ["consequence"],
  Review: ["verdict"],
  Task: ["objective", "acceptance"],
  Note: ["text"],
};

/**
 * Which `Prose[]` (array) node properties `search()` scans, per label.
 *
 * Split from {@link SEARCHABLE_TEXT} because AGE's Cypher has no `ANY(x IN
 * list WHERE cond)` form (measured 2026-08-31: syntax error) — an array
 * property needs `size([x IN n.prop WHERE toLower(x) CONTAINS
 * toLower($needle)]) > 0` instead of a plain `toLower(n.prop) CONTAINS …`,
 * so the query layer needs to know which shape it is building before it
 * runs, not just which properties are searchable.
 */
export const SEARCHABLE_TEXT_ARRAYS: { readonly [L in NodeLabel]?: readonly string[] } = {
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
  "GRADES", // Decision -> Claim
  "ABOUT", // CriterionEvaluation -> Claim (which finding this verdict judged)
  "KEEPS", // Decision -> Claim (a conclusion a revision carried forward)
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
  "RESTS_ON", // Claim -> Claim (a synthesis over findings it does not re-run)
  "CONCERNS", // Note -> anything (--on: the one attachment point with no fixed target)
] as const;
export type EdgeLabel = (typeof EDGE_LABELS)[number];

/**
 * One change an act made to the graph.
 *
 * Endpoints and subjects are natural ids rather than `Ref`s: this is the
 * persistence layer, where a handle's brand does not exist and
 * `labelForNaturalId` is how a label is recovered. The domain re-reads them as
 * handles on the way out.
 *
 * Declared here beside {@link NodeLabel} and {@link EdgeLabel} rather than in
 * `src/domain/events.ts` because `src/db` may not import `src/domain`.
 */
export type GraphChange = NodeCreated | EdgeCreated | PropsChanged;

/**
 * Distributed over the labels, so `label` picks the property shape exactly as
 * `createNode` does. A `Claim` staged with an `Artefact`'s properties is a
 * compile error rather than a row.
 */
export type NodeCreated = {
  [L in NodeLabel]: {
    change: "NodeCreated";
    id: string;
    label: L;
    props: NodePropsByLabel[L];
  };
}[NodeLabel];

export interface EdgeCreated {
  change: "EdgeCreated";
  from: string;
  label: EdgeLabel;
  to: string;
  props?: EdgeProps;
}

/**
 * Properties set in place on something that already exists.
 *
 * `id` is a natural id, which does not say whether it denotes a node, an edge,
 * a row or a blob — so one change record covers all of them.
 */
export interface PropsChanged {
  change: "PropsChanged";
  id: string;
  props: Record<string, unknown>;
}

export type EdgeProps = Record<string, string | number | boolean | number[]>;

/**
 * Single authoritative source of truth for legal edge shapes. `createEdge`
 * validates the resolved `(fromLabel, toLabel)` pair against this table and
 * throws before issuing any Cypher if the pair is not listed.
 *
 * **`GATES`'s source is `Gate`, not `Criterion`**, so that the control chain
 * actually chains: `Criterion -[:EVALUATED_AS]-> CriterionEvaluation
 * -[:TRIGGERS]-> Gate -[:GATES]-> Task/Computation`. With `Criterion` as the
 * source nothing flows out of `Gate` at all, and the criterion does the
 * gating — which is not what a gate is.
 */
export const EDGE_SCHEMA: Record<EdgeLabel, ReadonlyArray<readonly [NodeLabel, NodeLabel]>> = {
  /**
   * "Gave rise to." A question gives rise to a line of enquiry; a decision
   * gives rise to a question.
   *
   * **`Decision -> Question`**: sharpening records a `Decision` that `NARROWS`
   * the original, and this attaches the *product* of that act to the act.
   * Without it a question created by sharpening has no path back, and
   * `originOf` reports the knowledge that existed before an *earlier*
   * sharpening — populated, plausible, and about a different event.
   *
   * A direct `Question -> Question` lineage edge answers "where did this come
   * from" but not "what did we know when we asked it", since the reason and the
   * frozen evidence set live on the decision.
   *
   * **`Decision -> Claim`**: `CHANGES` records which interpretation was
   * withdrawn; this records which one replaced it. A gate contains its design
   * conditions, so the current one is derivable as the unchanged member — an
   * interpretation has no container, and without this there is no route from a
   * narrowed claim back to the act that narrowed it.
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
  // The `Task` pair says why a piece of planned work exists. It reuses
  // ADDRESSES rather than minting a label because it is the *same* reading one
  // step earlier in time: an EvidenceUnit ADDRESSES the enquiry it was recorded
  // towards, and a Task addresses the same enquiry before any evidence exists.
  //
  // **The test for reusing an edge is whether the two readings can ever meet in
  // a query**, not whether they look alike. Folding qualification into GATES
  // was rejected on exactly that: a control-flow edge would also carry a
  // content judgement, indistinguishable at read time. Here every reader
  // (`whatIsKnown`, `withinScope`, `enquiryStatus`'s `mine` query) binds its
  // source variable to `:EvidenceUnit` explicitly before matching the edge, so
  // the two node types never collide in a traversal despite sharing a label.
  ADDRESSES: [
    ["EvidenceUnit", "LineOfEnquiry"],
    ["Task", "LineOfEnquiry"],
  ],
  SUPPORTS: [["Evidence", "Claim"]],
  CHALLENGES: [["Evidence", "Claim"]],
  USES: [["EvidenceUnit", "Computation"]],
  /**
   * Execution lineage: what a computation read.
   *
   * The alternative route — `ADDRESSES` out to a LineOfEnquiry, then `REQUIRES`
   * to whatever observations that enquiry needs — answers "what observations
   * is this enquiry associated with", not "what did this computation
   * consume", and the two stop being the same answer the moment one enquiry
   * carries two analyses over different inputs — which makes `whySupported()`
   * report a conclusion resting on data it never read.
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
   * evaluated.
   *
   * The control chain — `Criterion -EVALUATED_AS-> CriterionEvaluation
   * -TRIGGERS-> Gate -GATES-> work` — correctly means nothing flows out of a
   * gate no evaluation triggered. But it also leaves the criterion reachable
   * from the gate **only** through an evaluation, so a gate nobody has
   * evaluated is an orphan that gates work while recording no condition at all,
   * and "show me evidence this fails when the artefact is wrong" cannot even be
   * aimed at a criterion.
   *
   * Direction matches the rest of the chain, so the control path reads left to
   * right.
   */
  GOVERNS: [["Criterion", "Gate"]],
  /**
   * The standard a finding is held to, as distinct from the work a condition
   * gates.
   *
   * Without it, prespecified robustness checks can fail against the very
   * analysis they were agreed about and `whySupported()` still reports
   * `supported: true` — "some evidence exists" rather than "the evidence holds
   * up by the standard set for it". Criteria reached only
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
   * "Re-checked that finding, without reproducing the run behind it."
   *
   * Without it the only way to record a re-run is as another analysis
   * concluding the same proposition, which resolves to the same claim — so
   * `whySupported()` reports the
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
   * The act that confers confirmatory standing on a finding.
   *
   * **Not `CHANGES`**, though a promotion is a decision acting on a claim.
   * `withdrawalOf()` reads *any* `Decision -CHANGES-> Claim` as a retraction,
   * so promotion written that way retracts the thing it promotes.
   *
   * Two acts that both "change a claim" are not the same relationship when one
   * means *stop asserting this* and the other means *assert it more strongly*.
   *
   * Direction and endpoint match `CHANGES`: the decision is the act, the claim
   * is what it acts on. Why it was promoted lives on the decision's `reason`,
   * so a reader can ask what justified the promotion and not merely that one
   * happened.
   */
  PROMOTES: [["Decision", "Claim"]],
  /**
   * **A decision put a claim into a state its evidence does not carry.**
   *
   * Distinct from `CHANGES`, and the distinction is load-bearing: `CHANGES`
   * means a claim no longer stands, and `supersededClaim()` reads it that way
   * for every decision carrying it. A claim recorded as `undecided` is not
   * withdrawn — its finding is real and still rests under it — so grading it
   * through `CHANGES` would report a retraction nobody performed.
   *
   * Distinct from `PROMOTES`, which is the edge for `confirmed` and stays
   * that: `is <claim> confirmed` writes it, because it and `promote` are one
   * act spelled two ways and a reader must not be able to tell which was
   * typed. So a state uses its own edge where it has one and this where it
   * does not — the closed set lives in `ClaimProps.kind`, not in the labels.
   */
  GRADES: [["Decision", "Claim"]],
  /**
   * Which finding a verdict judged, when one criterion is applied to several.
   *
   * A criterion is a rule and a rule gets applied more than once — one decision
   * rule against four comparisons is four verdicts, not four rules. Without
   * this the only way to record them was four criteria carrying identical
   * wording, and nothing joining the copies (#133).
   *
   * Distinct from `BASED_ON`, which says what a verdict *rested on*: evidence
   * somebody measured. This says what it was *about*. A check can be measured
   * against one finding and judge another.
   */
  ABOUT: [["CriterionEvaluation", "Claim"]],
  /**
   * A conclusion a revision carried forward unchanged.
   *
   * Written by `keep`, on the same decision that supersedes the rest. A reader
   * of that decision sees the whole act: these findings fell, those were kept,
   * this analysis stands in place of the old one.
   *
   * **The kept claim is not re-parented.** It keeps the evidence that produced
   * it, so `why` on it still rests on the superseded analysis's output — which
   * is the honest answer, because that is where the number came from. This edge
   * says the revision carried it forward, not that the successor derived it.
   *
   * Not inferable as "the ones nothing superseded". That is the same set today
   * and says something weaker: an analysis nobody revised has no kept
   * conclusions, only unmentioned ones, and the difference is whether anyone
   * looked.
   */
  KEEPS: [["Decision", "Claim"]],
  /**
   * What a decision withdrew or replaced: a design condition, an
   * interpretation.
   *
   * **A review is not a retraction.** With only a `Review` recording that an
   * interpretation was criticised, `whySupported()` goes on reporting the
   * retracted sentence as supported — reviews also confirm, and telling the two
   * apart from a free-text verdict would be text-matching.
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
   * The line between this and {@link CHANGES}:
   *
   * - `CHANGES` — the *same evidence read differently*. A reading narrowed, a
   *   condition amended. Nothing is replaced; the record still stands and its
   *   meaning moved.
   * - `SUPERSEDES` — *this stands instead of that*. An amendment over an
   *   amendment, a corrected finding over a defective one, a re-analysis over
   *   the analysis it replaced.
   *
   * > supersedes is a substitution of one record for another; the research
   * > journey follows a different fork in the road. changes = looking back at
   * > the map — same thing, interpreted differently from a perspective further
   * > down the road.
   *
   * That image is the rule for readers. `interpretationHistory` must never see
   * a supersession — it walks the map being looked back at, and a fork taken is
   * not a step along it. Both decisions change exactly one claim and motivate
   * exactly one, so there is no structural discriminator: a reader that wants
   * one of the two readings has to select on the label.
   *
   * Who reads which:
   *
   * - `interpretationHistory` — `CHANGES` only.
   * - `withdrawalOf` — both. A claim no longer stands whether its reading was
   *   narrowed or its finding superseded.
   * - `whySupported` — `SUPERSEDES`, for *instead of*.
   *
   * `reinterpret` does not supersede: the evidence is untouched and only the
   * reading moved.
   *
   * The `Computation` pair is analysis-grain **lineage** — this analysis is a
   * revision of that one. It says nothing about the standing of the old
   * analysis's conclusions, and no reader may infer that they fell from this
   * edge existing. Retraction is one grain lower, per finding.
   */
  SUPERSEDES: [
    ["Decision", "Decision"],
    ["Decision", "Claim"],
    ["Decision", "Computation"],
  ],
  /**
   * `Review -> EvidenceUnit` is how a review of an *analysis* has somewhere to
   * point; without it the subject survives only in the event stream and "why
   * was this replaced?" is unanswerable from the graph.
   *
   * **The endpoint is the EvidenceUnit rather than the Computation.** What a
   * reviewer criticises — *your bootstrap is centred on the observed effect; it
   * is not a null test* — is the inferential procedure, not the execution:
   * nothing ran incorrectly. The EvidenceUnit is the bounded inferential
   * activity; the Computation is how it was executed. `Review -> Computation`
   * would be a different claim and nothing makes it yet.
   */
  EVALUATES: [
    ["Review", "Claim"],
    ["Review", "Decision"],
    ["Review", "Evidence"],
    ["Review", "EvidenceUnit"],
  ],
  /**
   * Which review a retraction actually rested on.
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
   * **Not `EVALUATES`**, which means *this was reviewed*; and not `BASED_ON`,
   * whose sources are judgments (`Decision`, `CriterionEvaluation`) where an
   * `Artefact` is not one.
   *
   * The direction is passive, like `BASED_ON` and `RECORDED_IN`, because a
   * review does not retract anything — a researcher does, on the strength of it.
   *
   * **Two sources, at two grains, and a reader needs to know which it has.**
   * `Artefact -> Review` answers *why was this analysis replaced?* and nothing
   * narrower: one edge covers every finding the analysis produced, so a
   * replacement that revisits some of them has no single answer to it.
   * `Decision -> Review` is written on the per-finding decision a supersession
   * mints, and answers *why is this finding no longer standing?*
   *
   * Both are written and both are read; the artefact edge is the fallback.
   */
  INVALIDATED_BY: [
    ["Artefact", "Review"],
    ["Decision", "Review"],
  ],
  IMPLEMENTS: [["Task", "EvidenceUnit"]],
  /**
   * A claim that synthesises others and computes nothing new.
   *
   * Claim to claim, not evidence to claim: a synthesis produces no finding of
   * its own — that is what makes it a synthesis — so there is no `Evidence` for
   * `SUPPORTS` to come from, and minting one would assert a measurement nobody
   * took. What it rests on is the findings already on the record.
   */
  RESTS_ON: [["Claim", "Claim"]],
  /**
   * Every other pair in this table names two specific labels because the
   * relationship means something specific about both. `CONCERNS` is the one
   * exception, on purpose: attaching a note costs nothing and requiring one
   * is the gate `note` exists to remove, so `--on` takes any handle already
   * on the record. Listing every label
   * individually would need a line added here for every future one; the
   * pairs below are `NODE_LABELS` itself, mapped, so a new label is a valid
   * `CONCERNS` target the moment it exists rather than the moment someone
   * remembers to list it.
   */
  CONCERNS: NODE_LABELS.map((label) => ["Note", label] as const),
};

// **What LabKit does with a stored string — five names instead of one.**
//
// Every property below is a `string` at runtime; these say nothing about the
// value's shape and everything about the *code's relationship to it*. That is
// the question a reader of `*Props` actually has, and the alternative is
// auditing every Cypher query in `src/domain/` and redoing it the next
// afternoon.
//
// They are plain aliases, so none of them constrains anything at a call site.
// The enforcement is elsewhere and deliberately narrow: `INDEXED_PROPS` below
// is what `provisionTenantGraph()` actually reads, and `bun run
// check:prop-classes` fails when it disagrees with these annotations. A
// classification nobody re-reads is not a mechanism, so exactly one of them has
// a machine consequence and the rest are for the reader.
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
 * them — `CONSUMES`/`PRODUCES` are where an external run tracker would attach,
 * and these are its attachment points. The type is where that reason lives, so
 * the next audit finds an answer rather than an unexplained empty field.
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
  | "observation"
  | "experiment"
  | "feasibility"
  | "verification"
  | "robustness"
  | "ablation"
  | "mechanistic"
  | "analysis"
  | "infrastructure"
  | "confirmatory";

// No `project_id` on any *Props interface below: the graph itself is the tenant
// partition, not a repeated node property.

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
   * What kind of work produced the evidence. Written by two verbs, read by none.
   *
   * `ReadOnlyString<EvidenceUnitRole>` rather than a bare `ReadOnlyString`: the
   * union is what stops a writer inventing a value, and widening it to `string`
   * in the name of classifying it would trade real safety for a label.
   *
   * **`observation` exists because the alternative was writing something
   * false.** `recordObservations` wrote `experiment` — the nearest existing
   * value — because a value naming what it actually is had been declined for
   * having no reader. A measurement taken is not an experiment run, and the
   * moment of the act does not come back.
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
   * two claims can assert the same sentence.
   */
  name: IndexedString;
  /**
   * Whether the finding was prespecified, and whether anyone has promoted it —
   * **two facts under one value**, which is issue #63.
   *
   * **Not `ReadOnlyString`.** That class means *stored, handed back to callers,
   * never decided on*, and three sites decide on this — the first being
   * `whatIsKnown`'s bucketing, where it selects the survey's strongest word.
   *
   * A plain union, then, claiming nothing beyond the values. That is weaker
   * than the taxonomy would like and it is what is true: a taxonomy
   * member asserting something false about the field it annotates is worse
   * than one absent, because the annotation is what a reader trusts instead of
   * grepping.
   *
   * Optional because it is unset until an act sets it, and absence is read as
   * exploratory rather than defaulted at the write.
   *
   * **A closed set, and every value has an act that produces it**: nothing
   * writes `exploratory` (it is what absence means), `confirmatory` comes from
   * `is <claim> confirmed`, and `undecided` from `is <claim> undecided`. A
   * value nothing can write is one a reader cannot interpret.
   *
   * `undecided` is not a weaker `exploratory`. It says the evidence bears on
   * the proposition and settles it neither way — a state a researcher reaches
   * deliberately, and the one thing a two-value bearing cannot record.
   */
  kind?: "exploratory" | "confirmatory" | "undecided";
}

/**
 * **No `evidence` string shadow**, and no `is_open`/`closed_at`.
 *
 * The first duplicates `Decision -[:BASED_ON]-> Evidence`. The second is
 * operational state nothing reads: every verb that mints a Decision passes
 * exactly the three properties below, so a stored open-flag would be written by
 * every writer and consulted by no
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

// No `evidence_ref`: what a verdict was reached against is
// `CriterionEvaluation -[:BASED_ON]-> Evidence`, not a string shadow of it.
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
   * `"observations"` or `"analysis-output"` — a real kind, which is what
   * {@link ComputationProps.method} was renamed for not being. Nothing reads it: `report.ts` notes that the
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
   * How the analysis was carried out, in the researcher's own words.
   *
   * **Named `kind` until 2026-09-05**, beside `Artefact.kind`, which holds
   * actual kinds — while every writer passed `input.method` into this one and
   * every reader called it `method` on the way out. The independent Rust port
   * named it `method` without being told to, and Bonsai's transcripts pass
   * paragraphs into `--method`; the name was the only thing disagreeing (#64).
   *
   * `Prose`, so `search` scans it: a researcher looking for *"paired
   * comparison"* is looking for the runs that did one, and until 2026-09-05
   * the record answered that nothing contained the text. That is #155's defect
   * exactly — what a string is *for* internally and whether a person might
   * search for it are different questions, and only the second decides
   * {@link SEARCHABLE_TEXT}.
   */
  method: Prose;
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
 * **No `is_open`**, for the reason {@link DecisionProps} gives: a flag every
 * writer sets and no reader consults.
 *
 * It matters most where it looks most useful — a stored flag is the obvious
 * thing for a work-queue filter to read,
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
 * `note`'s whole node: one property, and it stops there.
 *
 * No `kind`, no status, no required attachment — the record already has a
 * timestamp and an attributed author for every act, on the event that
 * created it (`DomainEvent.at`/`attribution`), so a second copy on the node
 * itself would be exactly the kind of field a caller doesn't supply but the
 * schema pretends is structure. `LineOfEnquiryProps`/`EvidenceProps` are the
 * same shape for the same reason — this is not the first node whose whole
 * job is to hold one sentence.
 */
export interface NoteProps {
  text: Prose;
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
  Note: NoteProps;
}

/** Everything the persistence layer needs to know about one node label, in one place. */
interface NodeType<L extends NodeLabel> {
  /**
   * Short display prefix for natural IDs — `Computation` -> `"COMP_123"`.
   * Scoped globally per entity-type, not per-tenant. Must stay in sync with the
   * per-label `CREATE SEQUENCE`
   * statements in drizzle/0002_natural_ids.sql — nothing here enforces that,
   * it's a cross-file obligation to a migration.
   */
  readonly prefix: string;

  /**
   * Creation-time enforcement of per-label property invariants. Returns the
   * props to actually write, so a validator can normalise as well as reject.
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
 * One entry per node label — everything the persistence layer knows about a
 * label in one record, rather than parallel tables indexed by the same key and
 * kept aligned by hand.
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
  Note: { prefix: "NOTE" },
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
