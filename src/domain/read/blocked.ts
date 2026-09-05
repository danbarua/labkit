import { optional, vertexProps } from "../../db/cypher";
import type { Prose } from "../../db/domain";
import type { TenantGraph } from "../../db/graph";
import { SessionCore } from "../core";
import { compose, per, type Row } from "../facts";
import { ref } from "../report";
import type {
  AmendmentRecord,
  BlockedWork,
  CitedFinding,
  CriterionRef,
  DecisionRef,
  DesignHistory,
  EvidenceRef,
  GateRef,
  GateStatus,
  ListedGate,
  ListedWork,
  TaskContract,
  WorkRef,
  WorkState,
} from "../report";
import { checkStatusForGate, type CheckState } from "../survey-facts";
import { dedupeById, type Identified } from "./shared";

/**
 * What each of these criteria is holding up.
 *
 * Walks `GOVERNS` **from the criterion**, which nothing did before — it was
 * written by `stateCriterion`/`declareGate` and read only from the gate's
 * end, so a caller holding a criterion had no way back. See
 * {@link UnmetCheck.blocks}.
 *
 * `OPTIONAL MATCH` on the protected work, because a gate that guards nothing
 * yet is a real state and must not drop the gate from the answer.
 *
 * A plain function rather than a method: `whySupported` (`./story.ts`) needs
 * it too, and a private method on one group class is invisible to a sibling.
 */
export async function blockedBy(
  graph: TenantGraph,
  criteria: readonly CriterionRef[],
): Promise<Map<CriterionRef, BlockedWork[]>> {
  const out = new Map<CriterionRef, BlockedWork[]>();
  if (criteria.length === 0) return out;
  const rows = await graph.query(
    `MATCH (c:Criterion)-[:GOVERNS]->(g:Gate)
       WHERE c.natural_id IN $ids
       OPTIONAL MATCH (g)-[:GATES]->(w)
       RETURN c, g, w`,
    {
      c: vertexProps<Identified>(),
      g: vertexProps<{ consequence?: string } & Identified>(),
      w: optional(vertexProps<{ objective?: string } & Identified>()),
    },
    { ids: [...criteria] },
  );
  for (const row of rows) {
    // `ref()` rather than the raw id: the key is a handle, and
    // `check:no-stringly-typed` is right that a `Map<string, …>` here says
    // nothing about what the string is. It refuses a mismatched prefix too.
    const criterion = ref("criterion", row.c.natural_id);
    const list = out.get(criterion) ?? [];
    const existing = list.find((b) => b.gate === row.g.natural_id);
    const work = row.w
      ? [{ work: ref("work", row.w.natural_id), objective: row.w.objective ?? "" }]
      : [];
    if (existing) existing.gating.push(...work);
    else
      list.push({
        gate: ref("gate", row.g.natural_id),
        consequence: row.g.consequence ?? "",
        gating: work,
      });
    out.set(criterion, list);
  }
  return out;
}

/**
 * A gate's state, from the checks governing it.
 *
 * **Extracted because a second reader arrived.** It was inline in
 * `gateStatus` until `gateList` needed the same answer for every gate at once,
 * and that is the condition this repository already applies to a fact: a
 * computation earns a name when more than one reader has to reach the same
 * answer about the same subject. Two copies of a four-branch precedence chain
 * is the six-occurrence defect shape — written once, forgotten the second time,
 * and silently disagreeing thereafter.
 *
 * Order matters and neither branch is cosmetic. Absence is checked before
 * satisfaction so a gate nobody evaluated can never fall through to
 * `satisfied`; failure is checked before incompleteness because a failure is
 * decisive.
 *
 * **`satisfied` requires positive proof — every check passed — rather than
 * being the branch left over once the others are ruled out.** As an `else` it
 * catches any state the branches above do not name: a criterion whose only
 * evaluations were retracted matches neither `failed` nor `never-run` and
 * would fall through to `satisfied`, disagreeing with the itemised per-check
 * report in the same object. Requiring a positive `passed` means a new
 * `CheckState` lands in `incomplete` by construction, rather than by whoever
 * edits this function next remembering to add a branch for it.
 *
 * **A gate with no criteria at all reports `never-evaluated`.** `every` over an
 * empty list is `true`, which is the right answer for the wrong-looking reason:
 * a gate governing nothing has certainly not been shown to hold. `declareGate`
 * refuses to mint one anyway, so this is a defence rather than a case.
 */
export function gateStateFrom(checks: readonly { state: CheckState }[]): GateStatus["state"] {
  return checks.every((c) => c.state === "never-run")
    ? "never-evaluated"
    : checks.some((c) => c.state === "failed")
      ? "blocked"
      : checks.every((c) => c.state === "passed")
        ? "satisfied"
        : "incomplete";
}

/**
 * A task's state, from the edges that reach it.
 *
 * **`blocked` first, and that is the one real decision in this enum.** A task
 * can be both carried out and protected by a gate that has not been satisfied,
 * and the two readings are both defensible: *the work happened*, or *its result
 * cannot be built on*. This picks the second, on the same rule
 * `GateStatus.state` already applies to `blocked` over `incomplete` — a reader
 * scanning for what needs attention must see the blockage, because a state that
 * hides it is a state nobody can act on.
 *
 * The other reading is real and is why the overlap has a test of its own rather
 * than being left to fall out of the branch order below.
 *
 * **A gate that is merely unevaluated does not block.** Only `blocked` counts —
 * `never-evaluated` and `incomplete` mean nobody has finished checking, which is
 * a fact about the gate rather than an obstruction to the work. Treating them as
 * blocking would report every freshly gated task as blocked on the day it was
 * planned — a queue that can never be emptied, and is therefore never read.
 */
export function workStateFrom(
  task: { gates: Set<string>; implemented: boolean },
  gateStates: ReadonlyMap<string, GateStatus["state"]>,
): WorkState {
  const held = [...task.gates].some((g) => gateStates.get(g) === "blocked");
  if (held) return "blocked";
  return task.implemented ? "carried-out" : "planned";
}

export class BlockedGroup extends SessionCore {
  /** What a planned task is permitted to touch, and whether anyone is enforcing it. */
  async contractFor(work: WorkRef): Promise<TaskContract> {
    const rows = await this.graph.query(
      `MATCH (t:Task {natural_id: $id})
       OPTIONAL MATCH (t)-[:ADDRESSES]->(loe:LineOfEnquiry)
       OPTIONAL MATCH (q:Question)-[:MOTIVATES]->(loe)
       RETURN t, loe, q`,
      {
        t: vertexProps<{
          objective: string;
          acceptance: string;
          mayRead: string[];
        }>(),
        loe: optional(vertexProps<{ natural_id: string; name: string }>()),
        q: optional(vertexProps<{ natural_id: string; name: string }>()),
      },
      { id: work },
    );
    const task = rows[0]?.t;
    if (!task)
      throw new Error(
        `no planned work ${work}; work is planned before it can be read back, and 'search' finds its handle by the objective`,
      );

    // No fallback, and that is checked rather than assumed: `planWork` writes
    // `mayRead: input.mayRead ?? []`, so the property is always present and an
    // empty contract round-trips as a real empty array. A guard here would be
    // guarding a shape the writer cannot produce.
    const loe = rows[0]?.loe;
    const q = rows[0]?.q;
    return {
      work,
      objective: task.objective,
      acceptance: task.acceptance,
      mayRead: task.mayRead,
      enforced: false,
      // `q` is never absent when `loe` is present -- see TaskContract.addressing
      // -- but the report shape still has to be built from what the query
      // returned rather than assumed.
      ...(loe && q
        ? {
            addressing: {
              enquiry: ref("enquiry", loe.natural_id),
              pursuing: loe.name,
              question: ref("question", q.natural_id),
              asks: q.name,
            },
          }
        : {}),
    };
  }

  /**
   * Which criterion governs this gate?
   *
   * Answered via `GOVERNS`, which exists from the moment the gate is declared.
   * A route through `CriterionEvaluation` instead returns nothing for a gate
   * nobody has evaluated — which is exactly the gate the question is usually
   * asked about. See EDGE_SCHEMA.GOVERNS.
   */
  async criteriaGoverning(gate: GateRef): Promise<CriterionRef[]> {
    const rows = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ natural_id: string }>() },
      { id: gate },
    );
    return rows.map((r) => ref("criterion", r.c.natural_id));
  }

  /**
   * A locked design and everything that has happened to it, oldest first.
   *
   * The order comes from the supersession chain alone — no decision carries a
   * timestamp, nothing is read from the event log, and natural-id allocation
   * order is never consulted. It does **not** order two amendments to different
   * designs relative to each other.
   */
  async designHistory(gate: GateRef): Promise<DesignHistory> {
    const conditions = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id})
       OPTIONAL MATCH (d:Decision)-[:CHANGES]->(c)
       RETURN c, d`,
      {
        c: vertexProps<{ natural_id: string; proposition: string }>(),
        d: optional(vertexProps<{ natural_id: string }>()),
      },
      { id: gate },
    );
    if (conditions.length === 0)
      throw new Error(
        `gate ${gate} is governed by no condition; a design history is the record of its conditions being amended, and this gate has none to amend`,
      );

    const changedBy = new Map<DecisionRef, CriterionRef>();
    const propositionOf = new Map<CriterionRef, Prose>();
    const current: CriterionRef[] = [];
    for (const row of conditions) {
      propositionOf.set(ref("criterion", row.c.natural_id), row.c.proposition);
      if (row.d)
        changedBy.set(ref("decision", row.d.natural_id), ref("criterion", row.c.natural_id));
      else current.push(ref("criterion", row.c.natural_id));
    }

    // A design history needs one condition in force. A gate governed by
    // several unamended conditions is a different shape, and guessing which one
    // is "the design" would be a confidently wrong answer.
    const inForce = [...new Set(current)];
    if (inForce.length !== 1) {
      throw new Error(
        `gate ${gate} has ${inForce.length} conditions in force; a design history needs exactly one`,
      );
    }

    const chain = await this.amendmentChain(gate);
    const rerun = await this.workGatedBy([gate]);
    const confirmatory = await this.confirmatoryResultsBehind([gate]);
    const nature = confirmatory.length > 0 ? ("scientific" as const) : ("mechanical" as const);

    const amendments: AmendmentRecord[] = chain.map((step, i) => {
      const wasCriterion = changedBy.get(step.decision);
      const nextCriterion =
        i + 1 < chain.length ? changedBy.get(chain[i + 1]!.decision) : inForce[0];
      return {
        amendment: step.decision,
        replaced: {
          criterion: ref("criterion", wasCriterion ?? ""),
          requires: (wasCriterion && propositionOf.get(wasCriterion)) ?? "",
        },
        nowRequires: {
          criterion: ref("criterion", nextCriterion ?? ""),
          requires: (nextCriterion && propositionOf.get(nextCriterion)) ?? "",
        },
        reason: step.reason,
        citing: step.citing,
        rerun,
        nature,
      };
    });

    const firstReplaced = amendments[0]?.replaced;
    return {
      gate,
      originally: firstReplaced ?? {
        criterion: ref("criterion", inForce[0]!),
        requires: propositionOf.get(inForce[0]!)!,
      },
      nowRequires: {
        criterion: ref("criterion", inForce[0]!),
        requires: propositionOf.get(inForce[0]!)!,
      },
      criterion: ref("criterion", inForce[0]!),
      amendments,
    };
  }

  /** Amendments to one design, ordered oldest-first by following supersession back to its root. */
  private async amendmentChain(
    gate: GateRef,
  ): Promise<Array<{ decision: DecisionRef; reason: Prose; citing: CitedFinding[] }>> {
    const rows = await this.graph.query(
      `MATCH (d:Decision)-[:CHANGES]->(:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id})
       OPTIONAL MATCH (d)-[:SUPERSEDES]->(older:Decision)
       OPTIONAL MATCH (d)-[:BASED_ON]->(e:Evidence)
       RETURN d, older, e`,
      {
        d: vertexProps<{ natural_id: string; reason: string }>(),
        older: optional(vertexProps<{ natural_id: string }>()),
        e: optional(vertexProps<{ statement: string } & Identified>()),
      },
      { id: gate },
    );

    // Handles are minted once, at the row, and everything downstream carries
    // them. Minting at each use instead put four `ref("decision", …)` calls in
    // this loop for one decision, which is the shape that says a conversion is
    // happening in the wrong place.
    const nodes = new Map<
      DecisionRef,
      {
        reason: Prose;
        older: DecisionRef | null;
        citing: Map<EvidenceRef, CitedFinding>;
      }
    >();
    for (const row of rows) {
      const decision = ref("decision", row.d.natural_id);
      const node = nodes.get(decision) ?? {
        reason: row.d.reason,
        older: null,
        citing: new Map<EvidenceRef, CitedFinding>(),
      };
      if (row.older) node.older = ref("decision", row.older.natural_id);
      // By id: two citations can say the same sentence and be two findings.
      if (row.e) {
        const evidence = ref("evidence", row.e.natural_id);
        node.citing.set(evidence, { evidence, states: row.e.statement });
      }
      nodes.set(decision, node);
    }

    const followedBy = new Map<DecisionRef, DecisionRef>();
    let root: DecisionRef | undefined;
    for (const [decision, node] of nodes) {
      if (node.older === null) root = decision;
      else followedBy.set(node.older, decision);
    }

    const ordered: Array<{
      decision: DecisionRef;
      reason: Prose;
      citing: CitedFinding[];
    }> = [];
    let cursor = root;
    while (cursor) {
      const node = nodes.get(cursor)!;
      ordered.push({
        decision: cursor,
        reason: node.reason,
        citing: [...node.citing.values()].sort((a, b) => a.evidence.localeCompare(b.evidence)),
      });
      cursor = followedBy.get(cursor);
    }

    // Every amendment must appear. A second chain root, or a break partway,
    // would otherwise drop amendments out of the history with no error at all
    // -- and an audit trail that quietly omits an entry is worse than one that
    // refuses to render.
    if (ordered.length !== nodes.size) {
      throw new Error(
        `gate ${gate} has ${nodes.size} amendments but only ${ordered.length} form a chain; its history is not a single line`,
      );
    }
    return ordered;
  }

  /**
   * May this gate be relied on, and on what evidence?
   *
   * Every governing condition is itemised, including the ones nobody has
   * evaluated. That is the point: a failed check must be distinguishable from
   * one never run, and an absent list entry cannot carry that difference.
   */
  async gateStatus(gate: GateRef): Promise<GateStatus> {
    const declared = await this.graph.query(
      `MATCH (g:Gate {natural_id: $id}) RETURN g`,
      { g: vertexProps<{ consequence: string }>() },
      { id: gate },
    );
    const found = declared[0];
    if (!found)
      throw new Error(
        `no gate ${gate}; a gate is declared over a criterion and the work it protects, and 'search' finds its handle by the consequence`,
      );

    // Every governing criterion with the evaluations that pertain to THIS
    // gate. Two scopes are deliberately kept apart:
    //
    //   gate-scoped  (here) -- has this condition been checked FOR this gate?
    //   criterion-scoped    -- has this check ever been shown able to fail?
    //
    // One criterion can govern several gates and be evaluated separately
    // against each (the same hash check, run against staging and against
    // release). Collapsing the two scopes made a gate nobody had evaluated
    // report as blocked because its criterion had failed somewhere else.
    //
    // OPTIONAL MATCH is load-bearing twice over: a criterion nobody evaluated
    // must still appear as a check, and `g` is bound from the first MATCH so
    // only evaluations triggering this gate count.
    // Composed from the gate-scoped verdict fact. The scope is the argument
    // rather than a paragraph: `verdictForGate` counts only evaluations
    // reached FOR this gate, where `anyVerdict` counts every evaluation of the
    // criterion. Collapsing the two made a gate nobody had evaluated report as
    // blocked because its criterion had failed somewhere else.
    const { cypher, decoders } = compose(
      `MATCH (crit:Criterion)-[:GOVERNS]->(g:Gate {natural_id: $id})`,
      checkStatusForGate,
      { crit: vertexProps<{ natural_id: string; proposition: string }>() },
    );
    const rows = (await this.graph.query(cypher, decoders, { id: gate })) as unknown as Row[];
    // Flattened: a criterion yields one check per finding it was judged
    // about, so a rule held against four controls is four conditions on this
    // gate rather than one line folding them together (#293).
    const checks = [...per(checkStatusForGate, rows).values()].flat();
    // Every state present, zero included -- see `GateStatus.counts`.
    const counts: GateStatus["counts"] = {
      passed: 0,
      failed: 0,
      "never-run": 0,
      "no-standing-verdict": 0,
    };
    for (const c of checks) counts[c.state] += 1;
    const unmetChecks = checks.filter((c) => c.state !== "passed");
    // The same computation as `whySupported`'s, and not redundant here even
    // though the caller is holding this gate: a criterion may govern several,
    // so an unmet check on GATE_1 can be holding GATE_7 as well, and that is
    // the blast radius a reader of a blocked gate most wants.
    const blocking = await blockedBy(
      this.graph,
      unmetChecks.map((c) => c.criterion),
    );
    const unmet = unmetChecks.map((c) => ({
      criterion: c.criterion,
      requires: c.proposition,
      blocks: blocking.get(c.criterion) ?? [],
    }));

    const state = gateStateFrom(checks);

    // Criterion-scoped, deliberately unfiltered by gate: "has this check ever
    // been shown able to fail" is a question about the check itself.
    const criterionOutcomes = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id})
       MATCH (c)-[:EVALUATED_AS]->(ev:CriterionEvaluation)
       RETURN ev`,
      { ev: vertexProps<{ outcome: "pass" | "fail" }>() },
      { id: gate },
    );

    const gating = await this.graph.query(
      `MATCH (:Gate {natural_id: $id})-[:GATES]->(w) RETURN w`,
      { w: vertexProps<{ objective?: string; kind?: string } & Identified>() },
      { id: gate },
    );

    return {
      gate,
      consequence: found.g.consequence,
      state,
      checks,
      unmet,
      counts,
      gating: gating.map((g) => ({
        work: ref("work", g.w.natural_id),
        objective: g.w.objective ?? "",
      })),
      everFailed: criterionOutcomes.some((r) => r.ev.outcome === "fail"),
    };
  }

  /**
   * Every gate, with the state a reader is filtering on.
   *
   * **The verb that lets an agent start.** Every other gate verb takes a
   * `GateRef`, and until this existed the only way to obtain one was to already
   * hold a claim and ask `whySupported` — so an agent opening a cold record
   * could not answer *"what is blocked?"* at all, and the only thing that could
   * was `whatHappened`, which is the event log and the one place this repo
   * forbids answering a "what is true now" question from.
   *
   * **One query, then folded per gate.** `compose()` takes the anchor, so the
   * gate-scoped check fact `gateStatus` uses composes just as well over every
   * gate as over one. What does not carry is the **grain**: `checkStatusForGate`
   * is grained `byCriterion`, and a criterion may govern several gates — the
   * same hash check against staging and against release — so folding the whole
   * result by criterion would merge two gates' verdicts into one answer.
   *
   * So the rows are bucketed by gate first and `per()` is applied within each
   * bucket. The alternative — a composite grain — would have to change
   * `checkStatusForGate` itself, and grains are compared by reference, so it
   * would silently re-scope `gateStatus` too.
   *
   * The state comes from {@link gateStateFrom}, the same function `gateStatus`
   * calls. Not a matter of tidiness: a reader who lists blocked gates and then
   * opens one must not find it satisfied, and two copies of a four-branch
   * precedence chain is the defect shape this repo has now hit six times.
   */
  async gateList(state?: GateStatus["state"]): Promise<ListedGate[]> {
    const { cypher, decoders } = compose(
      `MATCH (crit:Criterion)-[:GOVERNS]->(g:Gate)`,
      checkStatusForGate,
      {
        crit: vertexProps<{ natural_id: string; proposition: string }>(),
        g: vertexProps<{ natural_id: string; consequence: string }>(),
      },
    );
    const rows = (await this.graph.query(cypher, decoders, {})) as unknown as Row[];

    // Bucketed on the gate the row was reached through, never on the criterion.
    const byGate = new Map<string, { consequence: string; rows: Row[] }>();
    for (const row of rows) {
      const gate = row.g as { natural_id: string; consequence: string } | undefined;
      if (!gate?.natural_id) continue;
      const bucket = byGate.get(gate.natural_id) ?? {
        consequence: gate.consequence,
        rows: [],
      };
      bucket.rows.push(row);
      byGate.set(gate.natural_id, bucket);
    }

    // **Sorted by handle, because Cypher imposes no ordering.** Without it the
    // rows come back in whatever order the query produced them, so two runs of
    // `labkit gates` can print the same record differently and an agent
    // diffing successive `gate_list` calls sees change where nothing changed.
    // `checkStatusOver` already makes this argument about evaluations; the
    // same one applies to the list itself.
    const listed = [...byGate.entries()]
      .map(([id, { consequence, rows: forGate }]) => ({
        gate: ref("gate", id),
        consequence,
        state: gateStateFrom([...per(checkStatusForGate, forGate).values()].flat()),
      }))
      .sort((a, b) => a.gate.localeCompare(b.gate));

    // Filtering here rather than in Cypher, because the state is computed and
    // there is nothing in the graph to filter on -- which is the same reason
    // there is no `Gate.status` column to maintain.
    return state ? listed.filter((g) => g.state === state) : listed;
  }

  /**
   * Every planned piece of work, with the state a reader is filtering on.
   *
   * The other half of what an agent needs to orient, and **not redundant with
   * {@link gateList}**: a gate reaches only the work it protects, and
   * `planWork` requires no gate. Work that is planned and ungated — the
   * commonest thing in a standup — is reachable from nowhere else.
   *
   * **Three states, derived rather than chosen.** `Gate -[:GATES]-> Task` and
   * `Task -[:IMPLEMENTS]-> EvidenceUnit` are everything the record holds about
   * a task, so they are everything a state can be computed from. `observed` and
   * `closed` were candidates and neither survived — see {@link WorkState},
   * which carries the argument and the two that died.
   *
   * **Nothing is stored.** There is no `is_open` flag to set, because a stored
   * flag is the first place a work queue rots.
   *
   * **`OPTIONAL MATCH` twice, and both are load-bearing.** A task with no gate
   * and no analysis is the *most* interesting row here — it is the ready work —
   * so a plain `MATCH` on either edge would silently drop precisely what a
   * standup is asking for.
   */
  async workList(state?: WorkState): Promise<ListedWork[]> {
    const rows = await this.graph.query(
      `MATCH (t:Task)
       OPTIONAL MATCH (g:Gate)-[:GATES]->(t)
       OPTIONAL MATCH (t)-[:IMPLEMENTS]->(u:EvidenceUnit)
       RETURN t, g, u`,
      {
        t: vertexProps<{ natural_id: string; objective: string }>(),
        // Both wrapped, because both MATCHes are OPTIONAL and the row that
        // matters most -- ungated, unimplemented, ready to start -- is exactly
        // the one where both are NULL.
        g: optional(vertexProps<{ natural_id: string }>()),
        u: optional(vertexProps<{ natural_id: string }>()),
      },
      {},
    );

    // One row per (task, gate, unit) combination, so a task with two gates
    // arrives twice. Collected before anything is decided.
    const tasks = new Map<
      string,
      { objective: string; gates: Set<string>; implemented: boolean }
    >();
    for (const row of rows) {
      const id = row.t.natural_id;
      const entry = tasks.get(id) ?? {
        objective: row.t.objective ?? "",
        gates: new Set<string>(),
        implemented: false,
      };
      if (row.g?.natural_id) entry.gates.add(row.g.natural_id);
      if (row.u?.natural_id) entry.implemented = true;
      tasks.set(id, entry);
    }

    // A gate's state is the gate's own answer, asked once for all of them
    // rather than per task: several tasks commonly share one gate.
    const gateStates = new Map((await this.gateList()).map((g) => [g.gate as string, g.state]));

    // Sorted by handle, for the reason given in `gateList`.
    const listed = [...tasks.entries()]
      .map(([id, t]) => ({
        work: ref("work", id),
        objective: t.objective,
        state: workStateFrom(t, gateStates),
        gates: [...t.gates].map((g) => ref("gate", g)),
      }))
      .sort((a, b) => a.work.localeCompare(b.work));

    return state ? listed.filter((w) => w.state === state) : listed;
  }
}
