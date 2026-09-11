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
  Condition,
  ConditionHistory,
  CriterionRef,
  DesignHistory,
  EvidenceRef,
  GateRef,
  GateStatus,
  ListedGate,
  ListedWork,
  TaskContract,
  StoppedReason,
  WorkRef,
  WorkState,
} from "../report";
import {
  checkStatusForGate,
  gateConditionsAnchor as anchorInForce,
  inForce,
  type CheckState,
} from "../survey-facts";
import { dedupeById, type Identified } from "./shared";

/**
 * What each of these criteria is holding up.
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
       OPTIONAL MATCH (closing:Decision)-[:RESOLVES]->(g)
       OPTIONAL MATCH (stopping:Decision)-[:RESOLVES]->(w)
       RETURN c, g, w, closing, stopping`,
    {
      c: vertexProps<Identified>(),
      g: vertexProps<{ consequence?: string } & Identified>(),
      w: optional(vertexProps<{ objective?: string } & Identified>()),
      closing: optional(vertexProps<Identified>()),
      stopping: optional(vertexProps<Identified>()),
    },
    { ids: [...criteria] },
  );
  for (const row of rows) {
    if (row.closing || row.stopping) continue;
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
 */
export function workStateFrom(
  task: { gates: Set<string>; implemented: boolean; stopped: boolean },
  gateStates: ReadonlyMap<string, GateStatus["state"]>,
): WorkState {
  if (task.stopped) return "abandoned";
  const states = [...task.gates].map((g) => gateStates.get(g));
  if (states.includes("blocked")) return "blocked";
  if (task.implemented) return "carried-out";
  const cleared = new Set<GateStatus["state"]>(["satisfied", "sidestepped", "retired"]);
  return states.every((state) => state !== undefined && cleared.has(state)) ? "planned" : "waiting";
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
   */
  async designHistory(gate: GateRef): Promise<DesignHistory> {
    const governing = await this.graph.query(
      `MATCH (c:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id}) RETURN c`,
      {
        c: vertexProps<{ natural_id: string; proposition: string }>(),
      },
      { id: gate },
    );
    if (governing.length === 0)
      throw new Error(
        `gate ${gate} is governed by no condition; a design history is the record of its conditions being amended, and this gate has none to amend`,
      );

    // A condition an amendment withdrew still `GOVERNS` the gate -- that is how
    // the original stays readable. What is in force is what nothing changed.
    const withdrawn = await this.graph.query(
      `MATCH (:Decision)-[:CHANGES]->(c:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id}) RETURN c`,
      { c: vertexProps<{ natural_id: string }>() },
      { id: gate },
    );
    const gone = new Set(withdrawn.map((r) => r.c.natural_id));

    const rerun = await this.workGatedBy([gate]);
    const confirmatory = await this.confirmatoryResultsBehind([gate]);
    const nature = confirmatory.length > 0 ? ("scientific" as const) : ("mechanical" as const);

    const conditions: ConditionHistory[] = [];
    for (const row of governing) {
      if (gone.has(row.c.natural_id)) continue;
      const criterion = ref("criterion", row.c.natural_id);
      const inForce: Condition = { criterion, requires: row.c.proposition };
      const chain = await this.amendmentChain(inForce);
      conditions.push({
        originally: chain[0]?.replaced ?? inForce,
        nowRequires: inForce,
        criterion,
        amendments: chain.map((step) => ({ ...step, rerun, nature })),
      });
    }
    return { gate, conditions };
  }

  /**
   * The amendments that led to one condition, oldest first.
   */
  private async amendmentChain(
    condition: Condition,
  ): Promise<Array<Omit<AmendmentRecord, "rerun" | "nature">>> {
    const steps: Array<Omit<AmendmentRecord, "rerun" | "nature">> = [];
    let nowRequires = condition;
    for (;;) {
      const rows = await this.graph.query(
        `MATCH (d:Decision)-[:MOTIVATES]->(:Criterion {natural_id: $id})
         MATCH (d)-[:CHANGES]->(was:Criterion)
         OPTIONAL MATCH (d)-[:BASED_ON]->(e:Evidence)
         RETURN d, was, e`,
        {
          d: vertexProps<{ natural_id: string; reason: string }>(),
          was: vertexProps<{ natural_id: string; proposition: string }>(),
          e: optional(vertexProps<{ statement: string } & Identified>()),
        },
        { id: nowRequires.criterion },
      );
      const first = rows[0];
      if (!first) break;

      // By id: two citations can say the same sentence and be two findings.
      const citing = new Map<EvidenceRef, CitedFinding>();
      for (const row of rows) {
        if (!row.e) continue;
        const evidence = ref("evidence", row.e.natural_id);
        citing.set(evidence, { evidence, states: row.e.statement });
      }
      const replaced: Condition = {
        criterion: ref("criterion", first.was.natural_id),
        requires: first.was.proposition,
      };
      steps.push({
        amendment: ref("decision", first.d.natural_id),
        replaced,
        nowRequires,
        reason: first.d.reason,
        citing: [...citing.values()].sort((a, b) => a.evidence.localeCompare(b.evidence)),
      });
      nowRequires = replaced;
    }
    return steps.reverse();
  }

  /**
   * May this gate be relied on, and on what evidence?
   */
  async gateStatus(gate: GateRef): Promise<GateStatus> {
    const declared = await this.graph.query(
      `MATCH (g:Gate {natural_id: $id})
       OPTIONAL MATCH (closing:Decision)-[:RESOLVES]->(g)
       RETURN g, closing`,
      {
        g: vertexProps<{ consequence: string }>(),
        closing: optional(
          vertexProps<{ natural_id: string; reason: string; resolution_kind?: string }>(),
        ),
      },
      { id: gate },
    );
    const found = declared[0];
    if (!found)
      throw new Error(
        `no gate ${gate}; a gate is declared over a criterion and the work it protects, and 'search' finds its handle by the consequence`,
      );

    // Every governing criterion with the evaluations that pertain to THIS gate. Two scopes are
    // deliberately kept apart:  gate-scoped  (here) -- has this condition been checked FOR this
    // gate? criterion-scoped    -- has this check ever been shown able to fail?
    const { cypher, decoders } = compose(anchorInForce("one"), checkStatusForGate, {
      crit: vertexProps<{ natural_id: string; proposition: string }>(),
      amended: optional(vertexProps<{ natural_id: string }>()),
    });
    // Conditions an `amend` retired still `GOVERNS` this gate — that is what
    // keeps the original readable — and they are not live conditions. Counting
    // one made Bonsai's Stage 2B ladder read `blocked` after its amended gate
    // passed and the stage ran to completion.
    const rows = inForce(
      (await this.graph.query(cypher, decoders, { id: gate })) as unknown as Row[],
    );
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

    const kind = found.closing?.resolution_kind;
    if (kind !== undefined && kind !== "sidestepped" && kind !== "retired")
      throw new Error(
        `decision ${found.closing!.natural_id} resolves gate ${gate} with invalid resolution kind ${kind}`,
      );
    const state = kind ?? gateStateFrom(checks);

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
      `MATCH (:Gate {natural_id: $id})-[:GATES]->(w)
       OPTIONAL MATCH (stopping:Decision)-[:RESOLVES]->(w)
       RETURN w, stopping`,
      {
        w: vertexProps<{ objective?: string; kind?: string } & Identified>(),
        stopping: optional(vertexProps<Identified>()),
      },
      { id: gate },
    );

    return {
      gate,
      consequence: found.g.consequence,
      state,
      ...(kind
        ? {
            closure: {
              decision: ref("decision", found.closing!.natural_id),
              kind,
              because: found.closing!.reason,
            },
          }
        : {}),
      checks,
      unmet,
      counts,
      gating: gating.filter((g) => !g.stopping).map((g) => ({
        work: ref("work", g.w.natural_id),
        objective: g.w.objective ?? "",
      })),
      everFailed: criterionOutcomes.some((r) => r.ev.outcome === "fail"),
    };
  }

  /**
   * Every gate, with the state a reader is filtering on.
   */
  async gateList(state?: GateStatus["state"]): Promise<ListedGate[]> {
    const { cypher, decoders } = compose(anchorInForce("every"), checkStatusForGate, {
      crit: vertexProps<{ natural_id: string; proposition: string }>(),
      g: vertexProps<{ natural_id: string; consequence: string }>(),
      amended: optional(vertexProps<{ natural_id: string }>()),
    });
    // Same exclusion `gateStatus` makes, from the same named clause.
    const rows = inForce((await this.graph.query(cypher, decoders, {})) as unknown as Row[]);

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

    const closedRows = await this.graph.query(
      `MATCH (closing:Decision)-[:RESOLVES]->(g:Gate) RETURN closing, g`,
      {
        closing: vertexProps<{ natural_id: string; resolution_kind?: string }>(),
        g: vertexProps<{ natural_id: string }>(),
      },
      {},
    );
    const closed = new Map<string, "sidestepped" | "retired">();
    for (const row of closedRows) {
      const kind = row.closing.resolution_kind;
      if (kind !== "sidestepped" && kind !== "retired")
        throw new Error(
          `decision ${row.closing.natural_id} resolves gate ${row.g.natural_id} with invalid resolution kind ${kind ?? "absent"}`,
        );
      closed.set(row.g.natural_id, kind);
    }

    const listed = [...byGate.entries()]
      .map(([id, { consequence, rows: forGate }]) => ({
        gate: ref("gate", id),
        consequence,
        state:
          closed.get(id) ?? gateStateFrom([...per(checkStatusForGate, forGate).values()].flat()),
      }))
      .sort((a, b) => a.gate.localeCompare(b.gate));

    // Filtering here rather than in Cypher, because the state is computed and
    // there is nothing in the graph to filter on -- which is the same reason
    // there is no `Gate.status` column to maintain.
    return state ? listed.filter((g) => g.state === state) : listed;
  }

  /**
   * The act that stopped a piece of work, if one did.
   */
  async stoppedWork(work: WorkRef): Promise<StoppedReason | undefined> {
    const [row] = await this.graph.query(
      `MATCH (d:Decision)-[:RESOLVES]->(:Task {natural_id: $id}) RETURN d`,
      { d: vertexProps<{ natural_id: string; reason: string; decided_at: string }>() },
      { id: work },
    );
    if (!row) return undefined;
    return {
      decision: ref("decision", row.d.natural_id),
      because: row.d.reason,
      at: row.d.decided_at,
    };
  }

  /**
   * Every planned piece of work, with the state a reader is filtering on.
   */
  async workList(state?: WorkState): Promise<ListedWork[]> {
    const rows = await this.graph.query(
      `MATCH (t:Task)
       OPTIONAL MATCH (g:Gate)-[:GATES]->(t)
       OPTIONAL MATCH (t)-[:IMPLEMENTS]->(u:EvidenceUnit)
       OPTIONAL MATCH (stop:Decision)-[:RESOLVES]->(t)
       RETURN t, g, u, stop`,
      {
        t: vertexProps<{ natural_id: string; objective: string }>(),
        // All three wrapped, because every MATCH but the first is OPTIONAL and
        // the row that matters most -- ungated, unimplemented, ready to start
        // -- is exactly the one where they are all NULL.
        g: optional(vertexProps<{ natural_id: string }>()),
        u: optional(vertexProps<{ natural_id: string }>()),
        stop: optional(vertexProps<{ natural_id: string }>()),
      },
      {},
    );

    // One row per (task, gate, unit) combination, so a task with two gates
    // arrives twice. Collected before anything is decided.
    const tasks = new Map<
      string,
      { objective: string; gates: Set<string>; implemented: boolean; stopped: boolean }
    >();
    for (const row of rows) {
      const id = row.t.natural_id;
      const entry = tasks.get(id) ?? {
        objective: row.t.objective ?? "",
        gates: new Set<string>(),
        implemented: false,
        stopped: false,
      };
      entry.stopped ||= row.stop !== null;
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
