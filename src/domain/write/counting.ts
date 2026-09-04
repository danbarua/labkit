/** The conditions a result will be held to, agreed before it exists. */

import { optional, scalar, vertexProps } from "../../db/cypher";
import type { Prose } from "../../db/domain";
import type { TenantGraph } from "../../db/graph";
import type {
  AmendmentReport,
  CriterionRef,
  DeclaredGate,
  DecisionRef,
  EvaluatedCriterion,
  EvidenceRef,
  GateRef,
  PlannedWork,
  StatedCriterion,
} from "../report";
import { ref } from "../report";
import type {
  AmendDesignCommand,
  DeclareGateCommand,
  EvaluateCriterionCommand,
  PlanWorkCommand,
} from "../commands";
import { SessionCore, type ResearchSessionOptions } from "../core";
import type { EmitDelta } from "./index";
import { applyDelta } from "../projection";
import { noFindingBearsOn, UnitOfWork } from "./shared";

export class Counting extends SessionCore {
  constructor(
    graph: TenantGraph,
    options: ResearchSessionOptions,
    private readonly emitDelta: EmitDelta,
  ) {
    super(graph, options);
  }

  /** Records a piece of work whose start a gate may protect. */
  async planWork(input: PlanWorkCommand): Promise<PlannedWork> {
    return this.graph.inTransaction(async () => {
      const unitOfWork = new UnitOfWork(this.graph);
      const work = ref(
        "work",
        await unitOfWork.node("Task", {
          objective: input.objective,
          mayRead: input.mayRead ?? [],
          outputs: "",
          acceptance: input.acceptance,
        }),
      );
      if (input.addressing) unitOfWork.edge(work, "ADDRESSES", input.addressing);

      const events = await this.emitDelta("planWork", work, unitOfWork.delta(), {
        objective: input.objective,
      });

      await applyDelta(this.graph, events[0]!);
      return { work, events };
    });
  }

  /** States a condition that must hold. Stating it is not evaluating it. */
  async stateCriterion(proposition: Prose): Promise<StatedCriterion> {
    return this.graph.inTransaction(async () => {
      const unitOfWork = new UnitOfWork(this.graph);
      const criterion = ref("criterion", await unitOfWork.node("Criterion", { proposition }));

      const events = await this.emitDelta("stateCriterion", criterion, unitOfWork.delta(), {
        proposition,
      });

      await applyDelta(this.graph, events[0]!);
      return { criterion, events };
    });
  }

  /**
   * Declares a gate: a consequence attached to a criterion, protecting some
   * work. **Declaring a gate must not make it satisfied.**
   */
  async declareGate(input: DeclareGateCommand): Promise<DeclaredGate> {
    return this.graph.inTransaction(async () => {
      if (input.governedBy.length === 0)
        throw new Error(
          "a gate needs at least one criterion to govern it: a gate enforces a condition, and one " +
            "governed by nothing could never be satisfied or blocked — name them in governedBy",
        );
      // And a gate protecting nothing is not a gate either: `gateStatus()`
      // would answer "what is blocked?" with `blocked` and an empty `gating`
      // list -- a control-plane object asserting a consequence for work that
      // does not exist. `recordAnalysis({ heldTo })` is how a
      // standard with nothing downstream is recorded now.
      if (input.protecting.length === 0)
        throw new Error(
          "a gate needs at least one piece of work to protect: a gate attaches a consequence to " +
            "work, and one protecting nothing asserts a consequence for work that does not exist " +
            "— name it in protecting, or hold the analysis to the criterion instead if nothing " +
            "downstream depends on it",
        );
      const unitOfWork = new UnitOfWork(this.graph);
      const gate = ref("gate", await unitOfWork.node("Gate", { consequence: input.consequence }));
      for (const criterion of input.governedBy) unitOfWork.edge(criterion, "GOVERNS", gate);
      for (const work of input.protecting) unitOfWork.edge(gate, "GATES", work);

      const events = await this.emitDelta("declareGate", gate, unitOfWork.delta(), {
        governedBy: input.governedBy.map((c) => c),
        protecting: input.protecting.map((w) => w),
      });

      await applyDelta(this.graph, events[0]!);
      return { gate, events };
    });
  }

  /**
   * Records that a criterion was actually evaluated, and what came back.
   *
   * A verdict is reached either *for a gate* or *about a finding held to the
   * criterion*, and one of the two must be true. Named a gate, the criterion
   * must already govern it: otherwise the evaluation attaches to an unrelated
   * gate and `gateStatus()` mostly *hides* the result — its traversal starts
   * from `GOVERNS`, so the malformed evaluation sits in the graph as durable
   * nonsense without producing a visibly wrong report. Named no gate, the
   * criterion must already qualify something (`recordAnalysis({ heldTo })`),
   * for the same reason: an evaluation no reader can reach still looks like a
   * check that was performed.
   *
   * Same invariant class as `assertReviewOf`, and both are checked before
   * anything is written so a rejected command leaves no partial state.
   */
  async evaluateCriterion(input: EvaluateCriterionCommand): Promise<EvaluatedCriterion> {
    return this.graph.inTransaction(async () => {
      if (input.gate) await this.assertCriterionGovernsGate(input.criterion, input.gate);
      // Same invariant class as `assertCriterionGovernsGate`, for the other job
      // a criterion can do: an evaluation that neither triggers a gate nor bears
      // on a finding held to it is durable nonsense no reader would ever surface.
      else await this.assertCriterionQualifiesSomething(input.criterion);
      let basis: EvidenceRef | undefined;
      if (input.citing) {
        const found = await this.findingOn(input.citing);
        if (!found) throw new Error(noFindingBearsOn(input.citing));
        basis = found.evidence;
      }
      const at = this.clock.now();

      const unitOfWork = new UnitOfWork(this.graph);
      const evaluation = ref(
        "evaluation",
        await unitOfWork.node("CriterionEvaluation", {
          value: input.value,
          outcome: input.outcome,
          evaluated_at: at,
        }),
      );
      unitOfWork.edge(input.criterion, "EVALUATED_AS", evaluation);
      if (input.gate) unitOfWork.edge(evaluation, "TRIGGERS", input.gate);
      // What the verdict was reached against. Without it, a condition
      // established by measurement and one asserted by an agent return
      // identical records.
      if (basis) unitOfWork.edge(evaluation, "BASED_ON", basis);

      const events = await this.emitDelta("evaluateCriterion", evaluation, unitOfWork.delta(), {
        criterion: input.criterion,
        ...(input.gate ? { gate: input.gate } : {}),
        outcome: input.outcome,
      });

      await applyDelta(this.graph, events[0]!);
      return { evaluation, events };
    });
  }

  /**
   * Amends a locked design: replaces one condition with another, recording the
   * act rather than editing the setting.
   *
   * The decision is the whole point: the original setting has to stay readable,
   * the reason and its evidence have to survive, and one amendment has to be
   * orderable against another.
   *
   * The diagnosis is cited **specifically**, not snapshotted. `sharpen()`
   * freezes everything standing because a sharpening genuinely is taken in
   * light of everything known; an amendment is taken on one diagnosis, and
   * recording every finding on the record as its basis would manufacture a
   * rationale the researcher never had. `BASED_ON` carries both senses, and
   * this is the boundary between them.
   *
   * `SUPERSEDES` chains this amendment to the previous one on the same design,
   * found rather than supplied: an ordering that depends on the caller
   * remembering to pass the right handle is not an ordering.
   */
  async amendDesign(input: AmendDesignCommand): Promise<AmendmentReport> {
    return this.graph.inTransaction(async () => {
      const at = this.clock.now();

      // Everything validated before anything is written -- a rejected amendment
      // must not leave a decision recording a change that never happened.
      const existing = await this.graph.query(
        `MATCH (c:Criterion {natural_id: $id}) RETURN c`,
        { c: vertexProps<{ proposition: string }>() },
        { id: input.criterion },
      );
      const replaced = existing[0]?.c.proposition;
      if (!replaced)
        throw new Error(
          `no condition ${input.criterion} to amend; state the criterion first, or name one already on the record`,
        );

      const cited = await this.findingOn(input.citing);
      if (!cited) throw new Error(noFindingBearsOn(input.citing));
      const diagnosis = cited.evidence;

      const gates = await this.gatesGovernedBy(input.criterion);
      if (gates.length === 0) {
        throw new Error(
          `condition ${input.criterion} governs nothing; there is no locked design to amend`,
        );
      }

      // Amending a setting that has already been amended forks the design, and
      // the fork is not readable: two conditions end up in force at once and
      // `designHistory()` can no longer say what the design requires. Rejected
      // at the write rather than thrown at the read -- state that cannot be read
      // back is worse than a command that refuses.
      const alreadyAmended = await this.graph.query(
        `MATCH (:Decision)-[:CHANGES]->(c:Criterion {natural_id: $id}) RETURN c`,
        { c: vertexProps<{ natural_id: string }>() },
        { id: input.criterion },
      );
      if (alreadyAmended.length > 0) {
        throw new Error(
          `condition ${input.criterion} has already been amended; amend the one now in force`,
        );
      }

      const prior = await this.latestAmendmentOn(gates);

      const rerun = await this.workGatedBy(gates);
      const confirmatoryAffected = await this.confirmatoryResultsBehind(gates);

      const unitOfWork = new UnitOfWork(this.graph);
      const replacement = ref(
        "criterion",
        await unitOfWork.node("Criterion", { proposition: input.nowRequires }),
      );
      for (const gate of gates) unitOfWork.edge(replacement, "GOVERNS", gate);

      const decision = ref(
        "decision",
        await unitOfWork.node("Decision", {
          decided_at: this.clock.now(),
          reason: input.because,
          invalidation_check: "evidence that the amended setting was not the constraint after all",
        }),
      );
      unitOfWork.edge(decision, "CHANGES", input.criterion);
      unitOfWork.edge(decision, "BASED_ON", diagnosis);
      if (prior) unitOfWork.edge(decision, "SUPERSEDES", prior);

      const events = await this.emitDelta("amendDesign", decision, unitOfWork.delta(), {
        criterion: input.criterion,
        replaced,
        nowRequires: input.nowRequires,
        supersedes: prior ?? null,
      });

      await applyDelta(this.graph, events[0]!);

      return {
        at,
        amendment: decision,
        // `void replacement;` stood here: the amended criterion was created and
        // its handle thrown away, so the report named both conditions by wording
        // and a caller could reach neither.
        replaced: { criterion: input.criterion, requires: replaced ?? "" },
        nowRequires: { criterion: replacement, requires: input.nowRequires },
        rerun,
        confirmatoryAffected,
        // Derived, never declared. An amendment is scientific exactly when
        // something the confirmatory boundary rests on is in its blast radius --
        // which is the difference between repairing a solver and moving the
        // goalposts, and is not a thing the person amending gets to assert.
        nature: confirmatoryAffected.length > 0 ? "scientific" : "mechanical",
        events,
      };
    });
  }

  private async gatesGovernedBy(criterion: CriterionRef): Promise<GateRef[]> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $id})-[:GOVERNS]->(g:Gate) RETURN g`,
      { g: vertexProps<{ natural_id: string }>() },
      { id: criterion },
    );
    return [...new Set(rows.map((r) => r.g.natural_id))].map((id) => ref("gate", id));
  }

  /** The most recent amendment to this design — the one nothing has superseded yet. */
  private async latestAmendmentOn(gates: GateRef[]): Promise<DecisionRef | undefined> {
    for (const gate of gates) {
      const rows = await this.graph.query(
        `MATCH (d:Decision)-[:CHANGES]->(:Criterion)-[:GOVERNS]->(:Gate {natural_id: $id})
         OPTIONAL MATCH (newer:Decision)-[:SUPERSEDES]->(d)
         RETURN d, newer`,
        {
          d: vertexProps<{ natural_id: string }>(),
          newer: optional(vertexProps<{ natural_id: string }>()),
        },
        { id: gate },
      );
      const superseded = new Set(rows.filter((r) => r.newer).map((r) => r.d.natural_id));
      const latest = rows.map((r) => r.d.natural_id).find((d) => !superseded.has(d));
      if (latest) return ref("decision", latest);
    }
    return undefined;
  }

  private async assertCriterionGovernsGate(criterion: CriterionRef, gate: GateRef): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $criterion})-[:GOVERNS]->(:Gate {natural_id: $gate}) RETURN 1`,
      { ok: scalar<number>() },
      { criterion: criterion, gate: gate },
    );
    if (rows.length === 0) {
      throw new Error(
        `criterion ${criterion} does not govern gate ${gate}; it cannot be evaluated for it`,
      );
    }
  }

  private async assertCriterionQualifiesSomething(criterion: CriterionRef): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $criterion})-[:QUALIFIES]->(:EvidenceUnit) RETURN 1`,
      { ok: scalar<number>() },
      { criterion: criterion },
    );
    if (rows.length === 0) {
      throw new Error(
        `criterion ${criterion} gates no work and qualifies no finding; name the gate it is being evaluated for`,
      );
    }
  }
}
