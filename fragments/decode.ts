/**
 * Turns one recorded `DomainEvent` back into the `WriteSurface` call that
 * would have produced it — the mechanism `fragments/replay.ts` runs in `seq`
 * order to rebuild a real record's derived state.
 *
 * `detail` alone is not enough for most verbs (`fragments/trace.ts`'s
 * `commandOf` already says why: it carries what a later query needs, not
 * what the CLI took). What it omits is recoverable two other ways: from the
 * act's own `edges` — a `QUALIFIES` edge is `heldTo`, a `BASED_ON` edge run
 * through `claimFor` is `citing` — or, for a value nothing edges to (an
 * evidence unit's `statement`, a task's `acceptance`), from the node's own
 * property, read once from the live record before replay because prose does
 * not change after creation here.
 *
 * **One property is not prose and does change: `Claim.kind`.** `promote`
 * mutates it in place, no new node or edge, so a claim promoted after it was
 * concluded reads back from the live record as `confirmatory` no matter when
 * the conclusion that named it ran. Read that way, a decoder would report the
 * claim as confirmatory from birth — wrong, and invisible to
 * `replayIntoScratch`'s own check, which compares `created`/`edges` and cannot
 * see a property. So every event that records a conclusion carries the
 * `standing` it recorded, and that is what the decoders read.
 *
 * `DECODERS` is exhaustive over `Operation` at compile time
 * (`satisfies Record<Operation, Decoder>`), so a write verb with no decoder
 * fails `tsc` here rather than tripping the runtime refusal in production.
 */

import type { WriteSurface, DomainEvent, Operation, ClaimState } from "../src/domain";
import { ref, kindOf } from "../src/domain/report";
import { labelForNaturalId } from "../src/db/domain";

export interface DecodeContext {
  writes: WriteSurface;
  /** A created node's own property, from the live record. */
  nodeProp(handle: string, key: string): unknown;
  /** The claim a piece of evidence supports or challenges, from every `SUPPORTS`/`CHALLENGES` edge in the history. */
  claimFor(evidence: string): string | undefined;
  /** What an already-replayed analysis consumed, for `keep`/`replaceAnalysis`'s add-only `from`. */
  consumesOf(analysis: string): Promise<string[]>;
}

export type Decoder = (ctx: DecodeContext, event: DomainEvent) => Promise<void>;

function findEdge(event: DomainEvent, label: string) {
  return event.edges.find((e) => e.label === label);
}

function findEdges(event: DomainEvent, label: string) {
  return event.edges.filter((e) => e.label === label);
}

function bearingOf(event: DomainEvent): "supports" | "challenges" {
  return findEdge(event, "CHALLENGES") ? "challenges" : "supports";
}

/** One conclusion as an event records it. */
interface RecordedConclusion {
  claim: string;
  finding: string;
  proposition: string;
  standing?: "exploratory" | "confirmatory";
}

/**
 * The standing an act recorded, read from its own event.
 *
 * **Two shapes, because the stored record has both.** Standing lives on each
 * conclusion; it was briefly a single field beside the array, and events
 * written then are still in the log. Never `Claim.kind`: that is what the claim
 * reads *now*, so a claim promoted afterwards replays as confirmatory from
 * birth.
 */
function standingOf(
  event: DomainEvent,
  conclusion: RecordedConclusion,
): "exploratory" | "confirmatory" | undefined {
  return conclusion.standing ?? (event.detail?.standing as "exploratory" | "confirmatory" | undefined);
}

/** `keep` and `replaceAnalysis` emit the same detail shape and differ only in which verb the caller named (#211). */
async function revisionArgs(ctx: DecodeContext, e: DomainEvent) {
  const method = ctx.nodeProp(e.subject, "kind") as string;
  const supersedes = e.detail?.supersedes as string;
  const because = ref("review", e.detail?.because as string);
  const consumesNow = findEdges(e, "CONSUMES")
    .filter((x) => x.from === e.subject)
    .map((x) => x.to);
  const inherited = new Set(await ctx.consumesOf(supersedes));
  const extra = consumesNow.filter((a) => !inherited.has(a));
  const from = extra.length ? extra.map((a) => ref("observations", a)) : undefined;
  return { because, method, supersedes: ref("analysis", supersedes), from };
}

export const DECODERS = {
  pose: async (ctx, e) => {
    await ctx.writes.pose(e.detail?.question as string);
  },

  note: async (ctx, e) => {
    const on = e.detail?.on as string | undefined;
    const kind = on ? kindOf(on) : null;
    await ctx.writes.note({
      text: e.detail?.text as string,
      ...(on && kind ? { on: ref(kind, on) } : {}),
    });
  },

  openEnquiry: async (ctx, e) => {
    await ctx.writes.openEnquiry(e.detail?.question as string);
  },

  pursue: async (ctx, e) => {
    await ctx.writes.pursue({
      question: ref("question", e.detail?.question as string),
      approach: e.detail?.approach as string,
    });
  },

  sharpen: async (ctx, e) => {
    const into = ctx.nodeProp(e.subject, "name") as string;
    await ctx.writes.sharpen({
      from: ref("question", e.detail?.from as string),
      into,
      because: e.detail?.because as string,
    });
  },

  recordObservations: async (ctx, e) => {
    const addresses = findEdge(e, "ADDRESSES")!;
    const produces = findEdge(e, "PRODUCES")!;
    const recordedIn = findEdge(e, "RECORDED_IN")!;
    const finding = ctx.nodeProp(produces.to, "statement") as string;
    const contentHash = ctx.nodeProp(recordedIn.to, "content_hash") as string | undefined;
    await ctx.writes.recordObservations({
      enquiry: ref("enquiry", addresses.to),
      name: e.detail?.name as string,
      finding,
      ...(contentHash ? { contentHash } : {}),
    });
  },

  recordAnalysis: async (ctx, e) => {
    const addresses = findEdge(e, "ADDRESSES")!;
    const consumes = findEdges(e, "CONSUMES");
    const qualifies = findEdges(e, "QUALIFIES");
    const implementsEdge = findEdge(e, "IMPLEMENTS");
    await ctx.writes.recordAnalysis({
      enquiry: ref("enquiry", addresses.to),
      method: e.detail?.method as string,
      from: consumes.map((c) => ref("observations", c.to)),
      heldTo: qualifies.map((q) => ref("criterion", q.from)),
      ...(implementsEdge ? { implementing: ref("work", implementsEdge.from) } : {}),
    });
  },

  conclude: async (ctx, e) => {
    const c = (e.detail?.conclusions as RecordedConclusion[])[0]!;
    const bearing = bearingOf(e);
    const standing = standingOf(e, c);
    const finding = ctx.nodeProp(c.finding, "statement") as string;
    const replacing = e.detail?.replacing as string | undefined;
    await ctx.writes.conclude({
      analysis: ref("analysis", e.subject),
      finding,
      proposition: c.proposition,
      bearing,
      ...(standing ? { standing } : {}),
      ...(replacing
        ? { replacing: ref(labelKind(replacing), replacing) as never }
        : {}),
    } as never);
  },

  recordReview: async (ctx, e) => {
    await ctx.writes.recordReview({
      of: ref("analysis", e.detail?.of as string),
      verdict: e.detail?.verdict as string,
    });
  },

  closeEnquiry: async (ctx, e) => {
    const answeredBy = e.detail?.answeredBy as string | undefined;
    await ctx.writes.closeEnquiry({
      enquiry: ref("enquiry", e.subject),
      ...(answeredBy ? { answeredBy: ref("claim", answeredBy) } : {}),
    });
  },

  planWork: async (ctx, e) => {
    const acceptance = ctx.nodeProp(e.subject, "acceptance") as string;
    const mayReadRaw = ctx.nodeProp(e.subject, "mayRead");
    const mayRead = Array.isArray(mayReadRaw)
      ? (mayReadRaw as string[])
      : typeof mayReadRaw === "string" && mayReadRaw.length > 0
        ? (JSON.parse(mayReadRaw) as string[])
        : undefined;
    const addresses = findEdge(e, "ADDRESSES");
    await ctx.writes.planWork({
      objective: e.detail?.objective as string,
      acceptance,
      ...(mayRead && mayRead.length ? { mayRead } : {}),
      ...(addresses ? { addressing: ref("enquiry", addresses.to) } : {}),
    });
  },

  stateCriterion: async (ctx, e) => {
    await ctx.writes.stateCriterion(e.detail?.proposition as string);
  },

  declareGate: async (ctx, e) => {
    const consequence = ctx.nodeProp(e.subject, "consequence") as string;
    await ctx.writes.declareGate({
      governedBy: (e.detail?.governedBy as string[]).map((c) => ref("criterion", c)),
      consequence,
      protecting: (e.detail?.protecting as string[]).map((w) => ref("work", w)),
    });
  },

  evaluateCriterion: async (ctx, e) => {
    const value = ctx.nodeProp(e.subject, "value") as string;
    const gate = e.detail?.gate as string | undefined;
    const basedOn = findEdge(e, "BASED_ON");
    const citing = basedOn ? ctx.claimFor(basedOn.to) : undefined;
    await ctx.writes.evaluateCriterion({
      criterion: ref("criterion", e.detail?.criterion as string),
      ...(gate ? { gate: ref("gate", gate) } : {}),
      value,
      outcome: e.detail?.outcome as "pass" | "fail",
      ...(citing ? { citing: ref("claim", citing) } : {}),
    });
  },

  reverify: async (ctx, e) => {
    const addresses = findEdge(e, "ADDRESSES")!;
    const consumes = findEdges(e, "CONSUMES");
    const method = ctx.nodeProp(e.subject, "kind") as string;
    const c = (e.detail?.conclusions as { claim: string; finding: string; proposition: string }[])[0]!;
    const bearing = bearingOf(e);
    const standing = standingOf(e, c);
    const finding = ctx.nodeProp(c.finding, "statement") as string;
    await ctx.writes.reverify({
      historical: ref("analysis", e.detail?.of as string),
      enquiry: ref("enquiry", addresses.to),
      method,
      under: consumes.map((x) => ref("observations", x.to)),
      concludes: {
        finding,
        proposition: c.proposition,
        bearing,
        ...(standing ? { standing } : {}),
      },
    });
  },

  acceptAsUnresolved: async (ctx, e) => {
    const defers = findEdge(e, "DEFERS")!;
    const basedOn = e.edges.find((x) => x.label === "BASED_ON" && x.from === defers.from)!;
    const claim = ctx.claimFor(basedOn.to)!;
    await ctx.writes.acceptAsUnresolved({
      enquiry: ref("enquiry", e.subject),
      because: e.detail?.because as string,
      until: e.detail?.until as string,
      inLightOf: ref("claim", claim),
    });
  },

  promote: async (ctx, e) => {
    const promotes = findEdge(e, "PROMOTES")!;
    const because = ctx.nodeProp(promotes.from, "reason") as string;
    await ctx.writes.promote({ claim: ref("claim", e.subject), because });
  },

  is: async (ctx, e) => {
    // `because` is a handle the event carries, not a property to look up: the
    // act's whole reason is which finding put the claim in this state.
    await ctx.writes.is({
      claim: ref("claim", e.subject),
      state: e.detail?.to as ClaimState,
      because: ref("evidence", e.detail?.because as string),
    });
  },

  amendDesign: async (ctx, e) => {
    const because = ctx.nodeProp(e.subject, "reason") as string;
    const basedOn = findEdge(e, "BASED_ON")!;
    const claim = ctx.claimFor(basedOn.to)!;
    await ctx.writes.amendDesign({
      criterion: ref("criterion", e.detail?.criterion as string),
      nowRequires: e.detail?.nowRequires as string,
      because,
      citing: ref("claim", claim),
    });
  },

  keep: async (ctx, e) => {
    const { because, method, from } = await revisionArgs(ctx, e);
    const keeping = (e.detail?.keeping as string[]).map((k) => ref("claim", k));
    await ctx.writes.keep({ keeping, because, method, ...(from ? { from } : {}) });
  },

  replaceAnalysis: async (ctx, e) => {
    const { because, method, supersedes, from } = await revisionArgs(ctx, e);
    await ctx.writes.replaceAnalysis({ supersedes, because, method, ...(from ? { from } : {}) });
  },

  reinterpret: async (ctx, e) => {
    const changes = findEdge(e, "CHANGES")!;
    const as = ctx.nodeProp(e.subject, "name") as string;
    await ctx.writes.reinterpret({
      of: ref("claim", changes.to),
      as,
      because: e.detail?.because as string,
    });
  },
} satisfies Record<Operation, Decoder>;

/** `conclude --replacing` names a claim or an evidence handle, told apart the way `ref()` itself does. */
function labelKind(handle: string): "claim" | "evidence" {
  return labelForNaturalId(handle) === "Claim" ? "claim" : "evidence";
}
