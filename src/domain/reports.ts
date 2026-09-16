/**
 * Report codecs. Zod is the source; the TypeScript type is z.infer.
 * MCP outputSchema and CLI --json both use these objects.
 */

import { z } from "zod";
import type { EdgeLabel, NodeLabel } from "../db/domain";
import type { Command } from "./commands";
import type { DomainEvent, GraphChange } from "./events";
import type { AnyRef, Kind, Ref } from "./ref";
import { GATE_STATES, WORK_STATES } from "./vocab";
/**
 * `Ref<K>` — the natural-id handle the domain passes around, which over the wire is just its
 * id: `"GATE_1"`, not `{"kind":"gate","id":"GATE_1"}`.
 */
const ref = <K extends string>(_kind: K) => z.string() as unknown as z.ZodType<Ref<K>>;

/** A handle of any kind — `why`'s subject, which is whatever the caller named. */
const anyRef = () => z.string() as unknown as z.ZodType<AnyRef>;

/**
 * Free text somebody wrote, as opposed to a handle or a short label.
 *
 * Marked rather than merely typed: `Prose` is a string at runtime, so a view
 * cannot tell a note's 2,000 words from a gate's state without this. Views
 * trim what is marked and name the command that reads the whole.
 */
const prose = () => z.string().meta({ prose: true });

/** An instant. Context for a finding, not the finding. */
const timestamp = () => z.string().meta({ timestamp: true });

/** A digest, a URI, another system's id — matched on, never read. */
const identity = () => z.string().meta({ identity: true });

/** `{claim, asserts}` — the report convention's pair for a claim, in one place. */
const concludedClaim = z.strictObject({
  claim: ref("claim"),
  asserts: prose(),
  // Populated by `recordAnalysis`/`reverify`/`replaceAnalysis`, absent for a
  // claim reached by wording (`claimsAsserting`) or one narrowing several
  // prior findings (`reinterpret`'s `nowClaims`) — see `ConcludedClaim.finding`.
  finding: ref("evidence").optional(),
});

/** `claims_asserting` — an array, wrapped because structuredContent must be an object. */
export const claimsAsserting = z.strictObject({
  claims: z.array(concludedClaim),
});

/**
 * `{handle, wording}` — plain `z.string()` for `handle`, not `ref()`, because
 * one result set spans as many kinds as the string taxonomy has `Prose`
 * labels. `label` on the enclosing group is how a caller tells them apart.
 */
type SearchHandle =
  | Ref<"question">
  | Ref<"enquiry">
  | Ref<"evidence">
  | Ref<"decision">
  | Ref<"criterion">
  | Ref<"evaluation">
  | Ref<"gate">
  | Ref<"review">
  | Ref<"work">
  | Ref<"note">;

const searchMatch = z.strictObject({
  handle: z.string() as unknown as z.ZodType<SearchHandle>,
  wording: prose(),
});

/** `search` — every match, grouped by label. */
const searchGroup = z.strictObject({
  label: z.string(),
  matches: z.array(searchMatch),
});

export const search = z.strictObject({
  groups: z.array(searchGroup),
});

/** `notes` — every note on the record, newest first. */
const listedNote = z.strictObject({
  note: ref("note"),
  says: prose(),
  concerns: z.array(anyRef()),
  prompted: ref("question").optional(),
  supersedes: z.array(ref("note")),
  supersededBy: z.array(ref("note")),
});

export const notes = z.strictObject({
  notes: z.array(listedNote),
});

/**
 * One step on the path that produced a handle's current state. Superseded steps
 * are false starts; `successor` names what stands instead when the graph says.
 */
export const howStep = z.strictObject({
  handle: z.string(),
  /** Kind label, or the record's own prose when it has any. */
  what: prose(),
  superseded: z.boolean(),
  successor: z.string().optional(),
  /** Decision reason when the superseding act carried one. */
  because: prose().optional(),
  /** Minting event seq when the log joins; absent when it does not. */
  seq: z.number().optional(),
});

/** `how` — the ordered acts behind one handle, false starts marked. */
export const how = z.strictObject({
  subject: z.string(),
  steps: z.array(howStep),
});

/**
 * `what_happened` — the acts themselves, which is the one thing the graph does not hold.
 */
export const whatHappened = z.strictObject({
  /**
   * Whether more acts matched than this page holds. A caller filtering `events` — `seq > 52`
   * over a default page of 50 — gets an empty answer from a full page and cannot otherwise tell
   * it from an empty record.
   */
  more: z.boolean(),
  events: z.array(
    z.strictObject({
      /** Absent until the store assigns one, rather than reported as zero. */
      seq: z.number().optional(),
      at: timestamp(),
      operation: z.string(),
      subject: z.string(),
      created: z.array(z.string()),
      /**
       * The whole delta: every node minted, every edge wired, every property
       * set in place. `created` is the node half and nothing else.
       *
       * Loose where `domainEvent.changes` is a union, because a union in an
       * MCP `outputSchema` crashes an SDK client — the reason `command` is a
       * record here and a `Command` there.
       */
      changes: z.array(z.record(z.string(), z.unknown())),
      attribution_label: z.string(),
      attribution_id: identity(),
      // A missing attribution grade is represented as null, not as an absent key.
      attribution_how: z.enum(["observed", "claimed", "unattributed"]).nullable(),
      git_hash: z.string().nullable(),
      /** What the act was read off, or `null` if nobody said. Nullable for the reason above. */
      reconstructed_from: z.string().nullable(),
      command: z.record(z.string(), z.unknown()),
    }),
  ),
});

/**
 * A `DomainEvent` as a write verb hands it back. Every write tool's output includes `events`,
 * and this is the one mirror they share.
 */
const operation = z.string();
const edgeLabel = z.string() as unknown as z.ZodType<EdgeLabel>;

// `NodeCreated` is distributed per-label with per-label props in the domain
// type; an output schema mirrors the shape and casts, the same trick
// `edgeLabel` above uses, rather than repeating that distribution here for a
// value nothing here validates.
const nodeCreated = z.strictObject({
  change: z.literal("NodeCreated"),
  id: z.string(),
  label: z.string(),
  props: z.record(z.string(), z.unknown()),
});
const edgeCreated = z.strictObject({
  change: z.literal("EdgeCreated"),
  from: z.string(),
  label: edgeLabel,
  to: z.string(),
  props: z.record(z.string(), z.unknown()).optional(),
});
const propsChanged = z.strictObject({
  change: z.literal("PropsChanged"),
  id: z.string(),
  props: z.record(z.string(), z.unknown()),
});
const graphChange = z.union([
  nodeCreated,
  edgeCreated,
  propsChanged,
]) as unknown as z.ZodType<GraphChange>;

const changesList = z.array(graphChange) as unknown as z.ZodType<readonly GraphChange[]>;

const command = z.record(z.string(), z.unknown()) as unknown as z.ZodType<Command>;

const recordedAttribution = z.strictObject({
  attribution_label: z.string(),
  attribution_id: identity(),
  attribution_how: z.enum(["observed", "claimed", "unattributed"]).nullable(),
  git_hash: z.string().nullable(),
});

export const domainEvent = z.strictObject({
  seq: z.number().optional(),
  at: timestamp(),
  attribution: recordedAttribution,
  operation,
  subject: z.string(),
  changes: changesList,
  command,
  reconstructedFrom: z.string().nullable(),
});

const questionStanding = z.strictObject({
  question: ref("question"),
  asks: prose(),
});

/** `KnowledgeSurvey.accepted` — `questionStanding` plus what would reopen it. */
const acceptedQuestion = questionStanding.extend({
  reopensIf: prose(),
  acceptedBecause: prose(),
});

/** Every pursuit that supplied an answer remains visible. */
const pursuitAnswer = z.strictObject({
  enquiry: ref("enquiry"),
  claim: ref("claim"),
  answer: z.enum(["yes", "no"]),
});
const answeredQuestion = questionStanding.extend({
  answers: z.array(pursuitAnswer),
  reopensIf: prose().optional(),
  acceptedBecause: prose().optional(),
});
const closedPursuit = z.strictObject({
  enquiry: ref("enquiry"),
  pursuing: prose(),
  question: ref("question"),
  decision: ref("decision"),
  closure: z.enum(["answered", "abandoned"]),
  answered: z.strictObject({ claim: ref("claim"), answer: z.enum(["yes", "no"]) }).optional(),
});

const identifiedArtefact = z.strictObject({
  part: ref("observations"),
  name: z.string(),
  invalidated: z.literal(true).optional(),
});

const citedFinding = z.strictObject({
  evidence: ref("evidence"),
  states: z.string(),
});

const affectedClaim = z.strictObject({
  claim: ref("claim"),
  asserts: prose(),
});
const affectedEnquiry = z.strictObject({
  enquiry: ref("enquiry"),
  pursuing: prose(),
});
const confirmatoryResult = z.strictObject({
  claim: ref("claim"),
  asserts: prose(),
});
const decidedQuestion = z.strictObject({
  question: ref("question"),
  asks: prose(),
});
const replacementClaim = z.strictObject({
  claim: ref("claim"),
  asserts: prose(),
});
const reverification = z.strictObject({
  analysis: ref("analysis"),
  method: prose(),
});

const evaluationRecord = z.strictObject({
  evaluation: ref("evaluation"),
  criterion: ref("criterion"),
  value: prose(),
  outcome: z.enum(["pass", "fail"]),
  at: timestamp(),
  withdrawn: z.literal(true).optional(),
  about: ref("claim").optional(),
  basis: z.array(citedFinding),
});

const bearingFinding = z.strictObject({
  finding: prose(),
  evidence: ref("evidence"),
  method: prose(),
  analysis: ref("analysis"),
});

const gatedWork = z.strictObject({ work: ref("work"), objective: z.string() });
const blockedWork = z.strictObject({
  gate: ref("gate"),
  consequence: prose(),
  gating: z.array(gatedWork),
});

const unmetCheck = z.strictObject({
  criterion: ref("criterion"),
  requires: prose(),
  blocks: z.array(blockedWork),
});

/**
 * `Condition` and `UnmetCheck` are **separate interfaces that shared a shape**, and this was
 * `const condition = unmetCheck` until `UnmetCheck` gained `blocks`.
 */
const condition = z.strictObject({
  criterion: ref("criterion"),
  requires: prose(),
});

/** No `value` — see `DecidingEvaluation`. */
const decidingEvaluation = z.strictObject({
  evaluation: ref("evaluation"),
  outcome: z.enum(["pass", "fail"]),
  at: timestamp(),
  about: ref("claim").optional(),
});

const checkStatus = z.strictObject({
  criterion: ref("criterion"),
  about: ref("claim").optional(),
  proposition: prose(),
  state: z.enum(["passed", "failed", "never-run", "no-standing-verdict"]),
  decidedBy: decidingEvaluation.optional(),
});

const amendmentRecord = z.strictObject({
  amendment: ref("decision"),
  replaced: condition,
  nowRequires: condition,
  reason: prose(),
  citing: z.array(citedFinding),
  rerun: z.array(gatedWork),
  nature: z.enum(["mechanical", "scientific", "prespecification"]),
});

const revision = z.strictObject({
  revision: ref("decision"),
  previously: z.array(concludedClaim),
  nowClaims: concludedClaim,
  reason: prose(),
  restingOnTheOldReading: z.array(decidedQuestion),
});

/* -- the seven tools' return shapes -------------------------------------- */

export const knowledgeSurvey = z.strictObject({
  established: z.array(answeredQuestion),
  unresolved: z.array(questionStanding),
  untested: z.array(questionStanding),
  provisional: z.array(answeredQuestion),
  accepted: z.array(acceptedQuestion),
  closedPursuits: z.array(closedPursuit),
});

export const historicalSurvey = z.strictObject({
  at: timestamp(),
  established: z.array(questionStanding),
  provisional: z.array(questionStanding),
  accepted: z.array(questionStanding),
  open: z.array(questionStanding),
});

export const supportExplanation = z.strictObject({
  claim: ref("claim"),
  proposition: prose(),
  verdict: z.enum([
    "supported",
    "undecided",
    "withdrawn",
    "challenged",
    "drawn-across",
    "standard-unmet",
    "unexamined",
  ]),
  standing: z.enum(["exploratory", "confirmatory", "undecided"]),
  promotedBecause: z.string().optional(),
  support: z.array(bearingFinding),
  drawnAcross: z.array(confirmatoryResult),
  reverifiedBy: z.array(reverification),
  standard: z.array(checkStatus),
  unmet: z.array(unmetCheck),
  restingOn: z.array(identifiedArtefact),
  superseded: z.array(
    bearingFinding.extend({
      reason: prose(),
      bearing: z.enum(["supports", "challenges"]),
    }),
  ),
  challenged: z.boolean(),
  against: z.array(bearingFinding),
  withdrawn: z.boolean(),
  replacedBy: replacementClaim.optional(),
});

export const dependencyReport = z.strictObject({
  subject: ref("observations"),
  claims: z.array(affectedClaim),
  enquiries: z.array(affectedEnquiry),
  routesWalked: z.array(z.string()),
  // Literal `false`, not `boolean`. The report is a lower bound and says so in
  // its type; a caller must not be able to read `complete: true` from it.
  complete: z.literal(false),
});

export const enquiryQuestion = z.strictObject({
  question: ref("question"),
  asks: prose(),
  reopensIf: prose().optional(),
  acceptedBecause: prose().optional(),
  acceptedInLightOf: z.array(citedFinding).optional(),
});

export const enquiryStatus = z.strictObject({
  enquiry: ref("enquiry"),
  pursuing: prose(),
  contributed: z.array(citedFinding),
  open: z.boolean(),
  closure: z.enum(["answered", "abandoned"]).nullable(),
  answer: z.enum(["yes", "no"]).nullable(),
  answered: concludedClaim.optional(),
  restsOn: z.enum(["exploratory", "confirmatory"]).optional(),
  evidence: z.array(citedFinding),
  question: enquiryQuestion.nullable(),
});

/**
 * `enquiry_in_context` — `enquiryStatus` alongside where this enquiry's
 * own question sits in the overall survey: one bucket, not the whole survey.
 * See `EnquiryInContext`'s own doc comment.
 */
export const enquiryInContext = z.strictObject({
  enquiry: enquiryStatus,
  standing: questionStanding
    .extend({
      bucket: z.enum(["established", "unresolved", "untested", "provisional", "accepted"]),
    })
    .nullable(),
});

const conditionHistory = z.strictObject({
  originally: condition,
  nowRequires: condition,
  criterion: ref("criterion"),
  amendments: z.array(amendmentRecord),
});

export const designHistory = z.strictObject({
  gate: ref("gate"),
  conditions: z.array(conditionHistory),
});

export const interpretationHistory = z.strictObject({
  originally: z.array(concludedClaim),
  nowClaims: concludedClaim,
  revisions: z.array(revision),
});

export const reproductionReport = z.strictObject({
  verification: ref("analysis"),
  verificationMethod: z.string(),
  of: ref("analysis"),
  ofMethod: z.string(),
  conclusion: z.enum(["agrees", "disagrees"]),
  verificationRead: z.array(identifiedArtefact),
  ofRead: z.array(identifiedArtefact),
  differs: z.array(
    z.strictObject({
      what: identifiedArtefact,
      standing: z.enum(["unrecorded-in-the-original", "changed", "not-used-by-the-re-run"]),
    }),
  ),
  bearing: z.enum(["raises", "lowers"]),
});

/* -- the six reads exposed later than the rest ---------------------------- */

/**
 * `origin_of` — `null` for a question somebody simply asked, which is most of them. Wrapped,
 * because `structuredContent` must be an object and a bare `null` is not one; `origin: null`
 * says "asked outright" rather than "no answer available".
 */
export const questionOrigin = z.strictObject({
  /** Which origin was found. `reason` and `knownAtTheTime` are the sharpened arm's, and empty
   *  on the other — a note records no reason and cites nothing. */
  kind: z.enum(["sharpened", "noted"]),
  from: z.string() as unknown as z.ZodType<Ref<"question"> | Ref<"note">>,
  said: z.string(),
  reason: z.string().nullable(),
  knownAtTheTime: z.array(citedFinding),
});
export const originOf = z.strictObject({
  origin: questionOrigin.nullable(),
});

/**
 * The line of enquiry (and question) a task exists to advance -- see
 * `Addressing` in `src/domain/report.ts`. Shared rather than inlined per
 * schema, since `taskContract` carries it.
 */
const addressingSchema = z.strictObject({
  enquiry: ref("enquiry"),
  pursuing: prose(),
  question: ref("question"),
  asks: prose(),
});

export const taskContract = z.strictObject({
  work: ref("work"),
  objective: prose(),
  acceptance: prose(),
  mayRead: z.array(z.string()),
  // Literal `false`. The contract records what work may read; nothing stops a
  // computation reading elsewhere, and a caller must not be able to read
  // `enforced: true` from this.
  enforced: z.literal(false),
  // Absent, not null, for ungated work (#91) -- see PlanWorkCommand.addressing.
  addressing: addressingSchema.optional(),
});

/** `criteria_governing` — an array, so it is wrapped like `pursuits_of`. */
export const criteriaGoverning = z.strictObject({
  criteria: z.array(ref("criterion")),
});

export const gateStatus = z.strictObject({
  gate: ref("gate"),
  consequence: prose(),
  state: z.enum(GATE_STATES),
  closure: z
    .strictObject({
      decision: ref("decision"),
      kind: z.enum(["sidestepped", "retired"]),
      because: prose(),
    })
    .optional(),
  checks: z.array(checkStatus),
  unmet: z.array(unmetCheck),
  counts: z.strictObject({
    passed: z.number(),
    failed: z.number(),
    "never-run": z.number(),
    "no-standing-verdict": z.number(),
  }),
  gating: z.array(gatedWork),
  everFailed: z.boolean(),
});

/**
 * `why` — one record's `{handle, wording}` citation, the shape `because` arrays are built from.
 * `handle` spans every {@link Kind}, exactly like `SearchMatch.handle` above -- the same
 * `ref()` cast, since it is an output schema and there is nothing here to validate.
 */
const explanationCause = z.strictObject({
  handle: z.string() as unknown as z.ZodType<Ref<Kind>>,
  wording: prose(),
  when: timestamp().optional(),
});

/** One superseded finding and the one standing in its place. */
const revisedFinding = z.strictObject({
  proposition: prose(),
  was: ref("claim"),
  before: z.string(),
  claim: ref("claim"),
  after: z.string(),
});

/** What an analysis revised — `supersedes` absent when it revises nothing. */
const analysisRevisionSchema = z.strictObject({
  analysis: ref("analysis"),
  supersedes: ref("analysis").optional(),
  because: z.strictObject({ review: ref("review"), verdict: z.string() }).optional(),
  changed: z.array(revisedFinding),
  restated: z.array(concludedClaim),
  kept: z.array(concludedClaim),
  unpaired: z.array(concludedClaim),
});

/**
 * `why` — a discriminated union on `kind`. `report` differs by kind, so a caller that narrows on
 * `kind` gets the right shape without a cast.
 */
const gateGoverned = z.strictObject({
  gate: ref("gate"),
  consequence: prose(),
  protecting: z.array(gatedWork),
});

/** What `why <criterion>` answers — the detail a gate's page no longer carries. */
export const criterionStanding = z.strictObject({
  criterion: ref("criterion"),
  requires: prose(),
  state: z.enum(["passed", "failed", "never-run", "no-standing-verdict"]),
  evaluations: z.array(evaluationRecord),
  governs: z.array(gateGoverned),
});

export const explanation = z.discriminatedUnion("kind", [
  // The kinds answered by walking the record, which carry no `report`: what
  // these kinds are is their edges, and a report type per kind would be an
  // envelope around one hop, invented to satisfy this union rather than to
  // answer a reader.
  z.strictObject({
    kind: z.literal("question"),
    subject: anyRef(),
    is: z.string(),
    because: z.array(explanationCause),
  }),
  z.strictObject({
    kind: z.literal("unit"),
    subject: anyRef(),
    is: z.string(),
    because: z.array(explanationCause),
  }),
  z.strictObject({
    kind: z.literal("evidence"),
    subject: anyRef(),
    is: z.string(),
    because: z.array(explanationCause),
  }),
  z.strictObject({
    kind: z.literal("decision"),
    subject: anyRef(),
    is: z.string(),
    because: z.array(explanationCause),
  }),
  z.strictObject({
    kind: z.literal("evaluation"),
    subject: anyRef(),
    is: z.string(),
    because: z.array(explanationCause),
  }),
  z.strictObject({
    kind: z.literal("review"),
    subject: anyRef(),
    is: z.string(),
    because: z.array(explanationCause),
  }),
  z.strictObject({
    kind: z.literal("observations"),
    subject: anyRef(),
    is: z.string(),
    because: z.array(explanationCause),
  }),
  z.strictObject({
    kind: z.literal("note"),
    subject: anyRef(),
    is: z.string(),
    because: z.array(explanationCause),
  }),
  z.strictObject({
    kind: z.literal("claim"),
    subject: ref("claim"),
    is: z.string(),
    because: z.array(explanationCause),
    report: supportExplanation,
  }),
  z.strictObject({
    kind: z.literal("criterion"),
    subject: ref("criterion"),
    is: z.string(),
    because: z.array(explanationCause),
    report: criterionStanding,
  }),
  z.strictObject({
    kind: z.literal("work"),
    subject: ref("work"),
    is: z.string(),
    because: z.array(explanationCause),
    report: taskContract,
  }),
  z.strictObject({
    kind: z.literal("enquiry"),
    subject: ref("enquiry"),
    is: z.string(),
    because: z.array(explanationCause),
    report: enquiryInContext,
  }),
  z.strictObject({
    kind: z.literal("gate"),
    subject: ref("gate"),
    is: z.string(),
    because: z.array(explanationCause),
    report: gateStatus,
  }),
  z.strictObject({
    kind: z.literal("analysis"),
    subject: ref("analysis"),
    is: z.string(),
    because: z.array(explanationCause),
    report: analysisRevisionSchema,
  }),
]);

const conflictSide = z.strictObject({
  claim: ref("claim"),
  question: ref("question"),
  proposition: prose(),
  asks: prose(),
  supportedBy: z.array(citedFinding),
  challengedBy: z.array(citedFinding),
});

export const conflictVerdict = z.strictObject({
  conflict: z.boolean(),
  relation: z.enum(["contradiction", "dissociation", "corroboration"]),
  differsBy: z.literal("scope").nullable(),
  sides: z.array(conflictSide),
});

export const reproducibilityReport = z.strictObject({
  analysis: ref("analysis"),
  exact: z.array(identifiedArtefact),
  differing: z.array(identifiedArtefact),
  unverifiable: z.array(identifiedArtefact),
  notRebuilt: z.array(identifiedArtefact),
  reproducible: z.boolean(),
});

/* -- the write tools' return shapes --------------------------------------- */

/**
 * A verb that mints something returns its reference, and over the wire that reference is the
 * only handle the caller gets. `structuredContent` must be an object, so a handle cannot cross
 * on its own — hence this wrapper.
 */
const minted = <K extends string>(kind: K) =>
  z.strictObject({ [kind]: ref(kind) } as { [P in K]: z.ZodType<Ref<K>> });

export const questionRef = minted("question");
export const enquiryRef = minted("enquiry");
export const observationsRef = minted("observations");
export const analysisRef = ref("analysis");

/** What `record_analysis` returns: the analysis, its bound criteria, and the claims it minted. */
export const recordedAnalysis = z.strictObject({
  analysis: analysisRef,
  heldTo: z.array(ref("criterion")),
  claims: z.array(concludedClaim),
  events: z.array(domainEvent),
});
export const reviewRef = minted("review");
export const workRef = minted("work");
export const criterionRef = minted("criterion");
export const gateRef = minted("gate");

/** What `pose` returns. */
export const posed = z.strictObject({
  question: ref("question"),
  events: z.array(domainEvent),
});
/** What `note` returns. */
export const noted = z.strictObject({
  note: ref("note"),
  events: z.array(domainEvent),
});
/** What `pursue` returns. */
export const pursued = z.strictObject({
  enquiry: ref("enquiry"),
  events: z.array(domainEvent),
});
/** What `open_enquiry` returns — #161's audit: the `Question` was withheld. */
export const openedEnquiry = z.strictObject({
  enquiry: ref("enquiry"),
  question: ref("question"),
  events: z.array(domainEvent),
});
/** What `record_observations` returns — #161's audit: withheld entirely. */
export const recordedObservations = z.strictObject({
  observations: ref("observations"),
  events: z.array(domainEvent),
});
/** What `sharpen` returns — #161's audit: the frozen `Decision` was withheld. */
export const sharpenedQuestion = z.strictObject({
  question: ref("question"),
  decision: ref("decision"),
  events: z.array(domainEvent),
});
/** What `synthesise` returns — the claim drawn across the findings it rests on. */
export const synthesised = z.strictObject({
  claim: ref("claim"),
  events: z.array(domainEvent),
});
/** What `record_review` returns. */
export const recordedReview = z.strictObject({
  review: ref("review"),
  events: z.array(domainEvent),
});
/** What `close_enquiry` returns — #161's audit: this verb returned nothing. */
export const closedEnquiry = z.strictObject({
  decision: ref("decision"),
  enquiry: ref("enquiry"),
  question: ref("question"),
  closure: z.enum(["answered", "abandoned"]),
  answered: concludedClaim.optional(),
  events: z.array(domainEvent),
});
/** What stop_work returns. */
export const stoppedWork = z.strictObject({
  decision: ref("decision"),
  work: ref("work"),
  closure: z.literal("stopped"),
  events: z.array(domainEvent),
});
/** What close_gate returns. */
export const closedGate = z.strictObject({
  decision: ref("decision"),
  gate: ref("gate"),
  closure: z.enum(["sidestepped", "retired"]),
  events: z.array(domainEvent),
});
/** What `plan_work` returns. */
export const plannedWork = z.strictObject({
  work: ref("work"),
  events: z.array(domainEvent),
});
/** What `state_criterion` returns. */
export const statedCriterion = z.strictObject({
  criterion: ref("criterion"),
  events: z.array(domainEvent),
});
/** What `declare_gate` returns. */
export const declaredGate = z.strictObject({
  gate: ref("gate"),
  events: z.array(domainEvent),
});
/** What evaluate_criterion returns — the decision (outcome, value) and scope (gates governed unconditionally + optional gate/about/citing + at) decided by the act. */
export const evaluatedCriterion = z.strictObject({
  evaluation: ref("evaluation"),
  criterion: ref("criterion"),
  outcome: z.enum(["pass", "fail"]),
  value: prose(),
  gates: z.array(ref("gate")),
  at: timestamp(),
  gate: ref("gate").optional(),
  about: ref("claim").optional(),
  citing: z.array(z.string()).optional(),
  events: z.array(domainEvent),
});
export const acceptedAsUnresolved = z.strictObject({
  decision: ref("decision"),
  events: z.array(domainEvent),
});

export const restated = z.strictObject({
  decision: ref("decision"),
  events: z.array(domainEvent),
});

/** What `undo` returns — every handle the undone act created, now hidden from the ordinary read surface. */
export const undone = z.strictObject({
  event: z.number(),
  retracted: z.array(z.string() as unknown as z.ZodType<Ref<Kind>>),
  events: z.array(domainEvent),
});

const changedConclusion = z.strictObject({
  proposition: prose(),
  was: ref("claim"),
  before: z.string(),
  claim: ref("claim"),
  after: z.string(),
});

/**
 * A handle to what a run read — observations, or an earlier analysis.
 */
const inputRefSchema = z.union([ref("observations"), ref("analysis")]);

const unaffectedRecord = z.strictObject({
  what: inputRefSchema,
  invalidated: z.literal(true).optional(),
  named: z.string(),
  why: z.string(),
});

export const verificationReport = z.strictObject({
  at: timestamp(),
  verification: analysisRef,
  of: analysisRef,
  claims: z.array(concludedClaim),
  events: z.array(domainEvent),
});

export const amendmentReport = z.strictObject({
  at: timestamp(),
  amendment: ref("decision"),
  replaced: condition,
  nowRequires: condition,
  rerun: z.array(gatedWork),
  confirmatoryAffected: z.array(confirmatoryResult),
  nature: z.enum(["mechanical", "scientific", "prespecification"]),
  events: z.array(domainEvent),
});

export const replacementReport = z.strictObject({
  at: timestamp(),
  replacement: ref("analysis"),
  decision: ref("decision"),
  supersedes: ref("analysis"),
  kept: z.array(ref("claim")),
  superseded: z.array(concludedClaim),
  events: z.array(domainEvent),
});

export const reinterpretationReport = z.strictObject({
  at: timestamp(),
  previously: z.array(concludedClaim),
  nowClaims: concludedClaim,
  evidenceStanding: z.array(citedFinding),
  restingOnTheOldReading: z.array(z.strictObject({ question: ref("question"), asks: z.string() })),
  requiresRecomputation: z.boolean(),
  events: z.array(domainEvent),
});

/** `pursuits_of` — `ReadSurface.pursuitsOf` returns an array, which is not an object. */
export const pursuits = z.strictObject({
  // The bare handle, not `minted("enquiry")` — the wrapper exists only so a
  // tool whose *whole* answer is one handle has an object to return.
  enquiries: z.array(ref("enquiry")),
});

/**
 * What `register_session` recorded.
 */
const registration = z.strictObject({
  id: z.string(),
  label: z.string(),
  /** What this connection's writes were read off, or `null` if nobody said. */
  reconstructed_from: z.string().nullable(),
});

export const registeredSession = z.strictObject({
  registered: registration,
  replaced: registration.optional(),
});

/** One gate in a list of them. */
const listedGate = z.strictObject({
  gate: ref("gate"),
  consequence: prose(),
  state: z.enum(GATE_STATES),
  /** When its state was last decided — absent for a gate no evaluation has ever reached. */
  lastTouched: timestamp().optional(),
  /** The work it holds up, so a reader need not join two lists by hand. */
  gating: z.array(gatedWork),
});

/** `gate_list` — an array, wrapped because `structuredContent` must be an object. */
export const gateList = z.strictObject({
  gates: z.array(listedGate),
});

/** One task in a list of them. */
const listedWork = z.strictObject({
  work: ref("work"),
  objective: prose(),
  state: z.enum(WORK_STATES),
  gates: z.array(ref("gate")),
});

/** `work_list` — the same wrapping, for the same reason. */
export const workList = z.strictObject({
  work: z.array(listedWork),
});

/** How much of the record was read off something. See `Transcription` in the domain. */
export const transcription = z.strictObject({
  transcribed: z.number(),
  acts: z.number(),
});

/**
 * `now` — "what am I blocked on right now, what are my priorities?"
 * `blocked`/`unevaluated`/`untouched` reuse `listedGate`/`listedWork`; `known` reuses
 * `knowledgeSurvey` whole, all five buckets.
 */
export const standing = z.strictObject({
  blocked: z.strictObject({ gates: z.array(listedGate), work: z.array(listedWork) }),
  unevaluated: z.strictObject({ gates: z.array(listedGate), work: z.array(listedWork) }),
  untouched: z.array(listedWork),
  known: knowledgeSurvey,
  transcribed: transcription,
  seq: z.number(),
  since: z.number().optional(),
});

// Public report types are inferred from the codecs above.
export type ConcludedClaim = z.infer<typeof concludedClaim>;
export type SearchMatch = z.infer<typeof searchMatch>;
export type SearchGroup = z.infer<typeof searchGroup>;
export type Notes = z.infer<typeof notes>;
export type HowStep = z.infer<typeof howStep>;
export type How = z.infer<typeof how>;
export type ListedNote = z.infer<typeof listedNote>;
export type ChangedConclusion = z.infer<typeof changedConclusion>;
export type UnaffectedRecord = z.infer<typeof unaffectedRecord>;
export type Cause = z.infer<typeof explanationCause>;
export type DomainEventReport = z.infer<typeof domainEvent>;
export type QuestionStanding = z.infer<typeof questionStanding>;
export type AcceptedQuestion = z.infer<typeof acceptedQuestion>;
export type PursuitAnswer = z.infer<typeof pursuitAnswer>;
export type AnsweredQuestion = z.infer<typeof answeredQuestion>;
export type ClosedPursuit = z.infer<typeof closedPursuit>;
export type IdentifiedArtefact = z.infer<typeof identifiedArtefact>;
export type CitedFinding = z.infer<typeof citedFinding>;
export type AffectedClaim = z.infer<typeof affectedClaim>;
export type AffectedEnquiry = z.infer<typeof affectedEnquiry>;
export type ConfirmatoryResult = z.infer<typeof confirmatoryResult>;
export type DecidedQuestion = z.infer<typeof decidedQuestion>;
export type ReplacementClaim = z.infer<typeof replacementClaim>;
export type Reverification = z.infer<typeof reverification>;
export type EvaluationRecord = z.infer<typeof evaluationRecord>;
export type BearingFinding = z.infer<typeof bearingFinding>;
export type GatedWork = z.infer<typeof gatedWork>;
export type BlockedWork = z.infer<typeof blockedWork>;
export type UnmetCheck = z.infer<typeof unmetCheck>;
export type Condition = z.infer<typeof condition>;
export type DecidingEvaluation = z.infer<typeof decidingEvaluation>;
export type CheckStatus = z.infer<typeof checkStatus>;
export type AmendmentRecord = z.infer<typeof amendmentRecord>;
export type Revision = z.infer<typeof revision>;
export type ConditionHistory = z.infer<typeof conditionHistory>;
export type RevisedFinding = z.infer<typeof revisedFinding>;
export type GateGoverned = z.infer<typeof gateGoverned>;
export type AnalysisRevision = z.infer<typeof analysisRevisionSchema>;
export type Registration = z.infer<typeof registration>;
export type ListedGate = z.infer<typeof listedGate>;
export type ListedWork = z.infer<typeof listedWork>;
export type Transcription = z.infer<typeof transcription>;
export type Standing = z.infer<typeof standing>;
export type KnowledgeSurvey = z.infer<typeof knowledgeSurvey>;
export type HistoricalSurvey = z.infer<typeof historicalSurvey>;
export type SupportExplanation = z.infer<typeof supportExplanation>;
export type DependencyReport = z.infer<typeof dependencyReport>;
export type EnquiryQuestion = z.infer<typeof enquiryQuestion>;
export type EnquiryStatus = z.infer<typeof enquiryStatus>;
export type EnquiryInContext = z.infer<typeof enquiryInContext>;
export type DesignHistory = z.infer<typeof designHistory>;
export type InterpretationHistory = z.infer<typeof interpretationHistory>;
export type ReproductionReport = z.infer<typeof reproductionReport>;
export type QuestionOrigin = z.infer<typeof questionOrigin>;
export type OriginOf = z.infer<typeof originOf>;
export type Addressing = z.infer<typeof addressingSchema>;
export type TaskContract = z.infer<typeof taskContract>;
export type CriteriaGoverning = z.infer<typeof criteriaGoverning>;
export type GateStatus = z.infer<typeof gateStatus>;
export type CriterionStanding = z.infer<typeof criterionStanding>;
export type Explanation = z.infer<typeof explanation>;
export type ConflictSide = z.infer<typeof conflictSide>;
export type ConflictVerdict = z.infer<typeof conflictVerdict>;
export type ReproducibilityReport = z.infer<typeof reproducibilityReport>;
export type RecordedAnalysis = z.infer<typeof recordedAnalysis>;
export type Posed = z.infer<typeof posed>;
export type Noted = z.infer<typeof noted>;
export type Pursued = z.infer<typeof pursued>;
export type OpenedEnquiry = z.infer<typeof openedEnquiry>;
export type RecordedObservations = z.infer<typeof recordedObservations>;
export type SharpenedQuestion = z.infer<typeof sharpenedQuestion>;
export type Synthesised = z.infer<typeof synthesised>;
export type RecordedReview = z.infer<typeof recordedReview>;
export type ClosedEnquiry = z.infer<typeof closedEnquiry>;
export type StoppedWork = z.infer<typeof stoppedWork>;
export type ClosedGate = z.infer<typeof closedGate>;
export type PlannedWork = z.infer<typeof plannedWork>;
export type StatedCriterion = z.infer<typeof statedCriterion>;
export type DeclaredGate = z.infer<typeof declaredGate>;
export type EvaluatedCriterion = z.infer<typeof evaluatedCriterion>;
export type AcceptedAsUnresolved = z.infer<typeof acceptedAsUnresolved>;
export type Restated = z.infer<typeof restated>;
export type Undone = z.infer<typeof undone>;
export type VerificationReport = z.infer<typeof verificationReport>;
export type AmendmentReport = z.infer<typeof amendmentReport>;
export type ReplacementReport = z.infer<typeof replacementReport>;
export type ReinterpretationReport = z.infer<typeof reinterpretationReport>;
export type Pursuits = z.infer<typeof pursuits>;
export type RegisteredSession = z.infer<typeof registeredSession>;
export type GateList = z.infer<typeof gateList>;
export type WorkList = z.infer<typeof workList>;

export const listedClaim = z.strictObject({
  claim: ref("claim"),
  asserts: prose(),
  /** Findings resting under it, and findings bearing against it. */
  supports: z.number(),
  challenges: z.number(),
  /** A decision promoted it: others may build on it. */
  confirmed: z.boolean(),
});
export type ListedClaim = z.infer<typeof listedClaim>;

export const listedEnquiry = z.strictObject({
  enquiry: ref("enquiry"),
  approach: prose(),
  question: ref("question").optional(),
  pursuing: prose(),
  /** Evidence units addressing it — how much has actually been run. */
  runs: z.number(),
  closed: z.boolean(),
});
export type ListedEnquiry = z.infer<typeof listedEnquiry>;

export const listedAnalysis = z.strictObject({
  analysis: ref("analysis"),
  method: prose(),
  enquiry: ref("enquiry").optional(),
  findings: z.number(),
});
export type ListedAnalysis = z.infer<typeof listedAnalysis>;

export const listedCriterion = z.strictObject({
  criterion: ref("criterion"),
  requires: prose(),
  governs: z.number(),
  evaluations: z.number(),
  state: z.enum(["passed", "failed", "never-run"]),
  amended: z.boolean(),
});
export type ListedCriterion = z.infer<typeof listedCriterion>;

export const claimList = z.strictObject({ claims: z.array(listedClaim) });
export const enquiryList = z.strictObject({ enquiries: z.array(listedEnquiry) });
export const analysisList = z.strictObject({ analyses: z.array(listedAnalysis) });
export const criterionList = z.strictObject({ criteria: z.array(listedCriterion) });

/** One conclusion, with the finding that reached it. */
export const learnedFinding = z.strictObject({
  claim: ref("claim"),
  asserts: prose(),
  bearing: z.enum(["supports", "challenges"]),
  /** A decision promoted it: others may build on it. */
  confirmed: z.boolean(),
  finding: ref("evidence"),
  states: prose(),
});
export type LearnedFinding = z.infer<typeof learnedFinding>;

export const learnedUnderQuestion = z.strictObject({
  question: ref("question"),
  asks: prose(),
  found: z.array(learnedFinding),
});
export type LearnedUnderQuestion = z.infer<typeof learnedUnderQuestion>;

/** `learned` — what the programme found out, under the question it was asked for. */
export const learned = z.strictObject({
  questions: z.array(learnedUnderQuestion),
  found: z.number(),
});
export type Learned = z.infer<typeof learned>;

/** Every exported schema in this module, so PROSE_FIELDS can walk them all. */
const SCHEMAS = {
  learned,
  learnedUnderQuestion,
  learnedFinding,
  claimList,
  enquiryList,
  analysisList,
  criterionList,
  listedClaim,
  listedEnquiry,
  listedAnalysis,
  listedCriterion,
  claimsAsserting,
  search,
  notes,
  howStep,
  how,
  whatHappened,
  domainEvent,
  knowledgeSurvey,
  historicalSurvey,
  supportExplanation,
  dependencyReport,
  enquiryQuestion,
  enquiryStatus,
  enquiryInContext,
  designHistory,
  interpretationHistory,
  reproductionReport,
  questionOrigin,
  originOf,
  taskContract,
  criteriaGoverning,
  gateStatus,
  criterionStanding,
  explanation,
  conflictVerdict,
  reproducibilityReport,
  recordedAnalysis,
  posed,
  noted,
  pursued,
  openedEnquiry,
  recordedObservations,
  sharpenedQuestion,
  synthesised,
  recordedReview,
  closedEnquiry,
  stoppedWork,
  closedGate,
  plannedWork,
  statedCriterion,
  declaredGate,
  evaluatedCriterion,
  acceptedAsUnresolved,
  restated,
  undone,
  verificationReport,
  amendmentReport,
  replacementReport,
  reinterpretationReport,
  pursuits,
  registeredSession,
  gateList,
  workList,
  transcription,
  standing,
};

/**
 * Every field name the schemas above marked as prose.
 *
 * Collected once from the declarations rather than written out, so a field
 * added as `prose()` is trimmed by every view without anyone listing it.
 */
export const PROSE_FIELDS: ReadonlySet<string> = marked("prose");

/** Fields the schemas marked as an instant. See {@link PROSE_FIELDS}. */
export const TIMESTAMP_FIELDS: ReadonlySet<string> = marked("timestamp");

/** Fields the schemas marked as an outside identity. See {@link PROSE_FIELDS}. */
export const IDENTITY_FIELDS: ReadonlySet<string> = marked("identity");

/**
 * Every value any schema's closed vocabulary can take.
 *
 * These are the strings the code branches on — `IndexedString` in
 * `src/db/domain.ts`. Collected from the declarations, so a value added to an
 * enum shows up here without anyone listing it, and the CLI's own test fails
 * until it has been given a meaning to read by.
 */
export const VOCABULARY: ReadonlySet<string> = (() => {
  const found = new Set<string>();
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.enum))
      for (const value of record.enum) if (typeof value === "string") found.add(value);
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) for (const item of value) walk(item);
      else walk(value);
    }
  };
  for (const schema of Object.values(SCHEMAS)) {
    try {
      walk(z.toJSONSchema(schema, { io: "output" }));
    } catch {
      // A schema JSON Schema cannot express has no vocabulary to find.
    }
  }
  return found;
})();

function marked(mark: "prose" | "timestamp" | "identity"): ReadonlySet<string> {
  return (() => {
    const found = new Set<string>();
    const seen = new Set<unknown>();
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      const record = node as Record<string, unknown>;
      const properties = record.properties as Record<string, Record<string, unknown>> | undefined;
      if (properties)
        for (const [name, field] of Object.entries(properties)) if (field?.[mark]) found.add(name);
      for (const value of Object.values(record)) {
        if (Array.isArray(value)) for (const item of value) walk(item);
        else walk(value);
      }
    };
    for (const schema of Object.values(SCHEMAS)) {
      try {
        walk(z.toJSONSchema(schema, { io: "output" }));
      } catch {
        // A schema JSON Schema cannot express is one with no prose to find.
      }
    }
    return found;
  })();
}
