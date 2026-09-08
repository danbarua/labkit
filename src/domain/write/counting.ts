/** The conditions a result will be held to, agreed before it exists. */

import { optional, scalar, vertexProps } from "../../db/cypher";
import { labelForNaturalId, type Prose } from "../../db/domain";
import type { TenantGraph } from "../../db/graph";
import type {
  AmendmentReport,
  ClaimRef,
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
  CitedBasis,
  DeclareGateCommand,
  EvaluateCriterionCommand,
  PlanWorkCommand,
} from "../commands";
import { SessionCore, type ResearchSessionOptions } from "../core";
import type { Handle } from "./index";
import { noFindingBearsOn } from "./shared";
import { compose, per, type Row } from "../facts";
import { criterionDetail, type CheckState } from "../survey-facts";
import type { UnitOfWork } from "../projection";

export class Counting extends SessionCore {
  constructor(
    graph: TenantGraph,
    options: ResearchSessionOptions,
    private readonly handle: Handle,
  ) {
    super(graph, options);
  }

  /** Records a piece of work whose start a gate may protect. */
  async planWork(input: PlanWorkCommand): Promise<PlannedWork> {
    return this.handle("planWork", input, async (unitOfWork) => {
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

      return {
        subject: work,
        result: { work },
      };
    });
  }

  /** States a condition that must hold. Stating it is not evaluating it. */
  async stateCriterion(proposition: Prose): Promise<StatedCriterion> {
    return this.handle("stateCriterion", { proposition }, async (unitOfWork) => {
      const criterion = ref("criterion", await unitOfWork.node("Criterion", { proposition }));

      return {
        subject: criterion,
        result: { criterion },
      };
    });
  }

  /**
   * Declares a gate: a consequence attached to a criterion, protecting some
   * work. **Declaring a gate must not make it satisfied.**
   */
  async declareGate(input: DeclareGateCommand): Promise<DeclaredGate> {
    return this.handle("declareGate", input, async (unitOfWork) => {
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
      const gate = ref("gate", await unitOfWork.node("Gate", { consequence: input.consequence }));
      for (const criterion of input.governedBy) unitOfWork.edge(criterion, "GOVERNS", gate);
      for (const work of input.protecting) unitOfWork.edge(gate, "GATES", work);

      return {
        subject: gate,
        result: { gate },
      };
    });
  }

  /**
   * Records that a criterion was actually evaluated, and what came back.
   */
  async evaluateCriterion(input: EvaluateCriterionCommand): Promise<EvaluatedCriterion> {
    return this.handle("evaluateCriterion", input, async (unitOfWork) => {
      if (input.gate) await this.assertCriterionGovernsGate(input.criterion, input.gate);
      const basis: EvidenceRef[] = [];
      for (const cited of input.citing ?? []) basis.push(await this.evidenceFor(cited));
      const at = this.clock.now();

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
      for (const on of new Set(basis)) unitOfWork.edge(evaluation, "BASED_ON", on);
      // What this verdict judged, when the rule is applied to more than one
      // finding. `BASED_ON` says what it rested on; this says what it is about.
      if (input.about) unitOfWork.edge(evaluation, "ABOUT", input.about);

      return {
        subject: evaluation,
        result: { evaluation },
      };
    });
  }

  /**
   * Amends a locked design: replaces one condition with another, recording the act rather than
   * editing the setting.
   */
  async amendDesign(input: AmendDesignCommand): Promise<AmendmentReport> {
    return this.handle("amendDesign", input, async (unitOfWork) => {
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

      // **`never-run`, not "no standing verdicts".** `stateOf` in survey-facts
      // already tells the two apart, and the difference is the whole rule: a
      // criterion whose only evaluation was undone reads `no-standing-verdict`,
      // and a number existed there for somebody to have seen.
      const everEvaluated = (await this.stateOfCriterion(input.criterion)) !== "never-run";
      if (input.citing === undefined && everEvaluated)
        throw new Error(
          `condition ${input.criterion} has been evaluated; an amendment after a result names the finding that prompted it — pass --citing`,
        );

      let diagnosis: EvidenceRef | undefined;
      if (input.citing !== undefined) {
        const cited = await this.findingOn(input.citing);
        if (!cited) throw new Error(noFindingBearsOn(input.citing));
        diagnosis = cited.evidence;
      }

      const gates = await this.gatesGovernedBy(input.criterion);
      if (gates.length === 0) {
        throw new Error(
          `condition ${input.criterion} governs nothing; there is no locked design to amend`,
        );
      }

      // A condition that has already been amended is not the one in force, and
      // amending it forks the design: two replacements stand for one setting
      // with nothing saying which the gate now requires. The message names the
      // condition to amend instead.
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

      const prior = await this.amendmentThatIntroduced(input.criterion);

      const rerun = await this.workGatedBy(gates);
      const confirmatoryAffected = await this.confirmatoryResultsBehind(gates);

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
      unitOfWork.edge(decision, "MOTIVATES", replacement);
      if (diagnosis) unitOfWork.edge(decision, "BASED_ON", diagnosis);
      if (prior) unitOfWork.edge(decision, "SUPERSEDES", prior);

      return {
        subject: decision,
        result: {
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
          // Prespecification is a fact about the condition's history and is
          // decided first; the other two are decided by the blast radius, which
          // is empty for a condition nothing has run against anyway.
          nature: diagnosis
            ? confirmatoryAffected.length > 0
              ? "scientific"
              : "mechanical"
            : "prespecification",
        },
      };
    });
  }

  /**
   * Whether this condition has ever been evaluated, in the words the read side already uses.
   * `never-run` is the only state with no number behind it; `no-standing-verdict` means every
   * verdict was retracted, and somebody saw a result before that happened.
   */
  private async stateOfCriterion(criterion: CriterionRef): Promise<CheckState> {
    const { cypher, decoders } = compose(
      `MATCH (crit:Criterion {natural_id: $id})`,
      criterionDetail,
      { crit: vertexProps<{ natural_id: string; proposition: string }>() },
    );
    const rows = (await this.graph.query(cypher, decoders, { id: criterion })) as unknown as Row[];
    return [...per(criterionDetail, rows).values()][0]?.state ?? "never-run";
  }

  private async gatesGovernedBy(criterion: CriterionRef): Promise<GateRef[]> {
    const rows = await this.graph.query(
      `MATCH (:Criterion {natural_id: $id})-[:GOVERNS]->(g:Gate) RETURN g`,
      { g: vertexProps<{ natural_id: string }>() },
      { id: criterion },
    );
    return [...new Set(rows.map((r) => r.g.natural_id))].map((id) => ref("gate", id));
  }

  /**
   * The amendment that put this condition in force, if an amendment did.
   */
  private async amendmentThatIntroduced(criterion: CriterionRef): Promise<DecisionRef | undefined> {
    const rows = await this.graph.query(
      `MATCH (d:Decision)-[:MOTIVATES]->(:Criterion {natural_id: $id}) RETURN d`,
      { d: vertexProps<{ natural_id: string }>() },
      { id: criterion },
    );
    const row = rows[0];
    return row ? ref("decision", row.d.natural_id) : undefined;
  }

  /**
   * The evidence a citation names, by whichever route the caller held.
   */
  private async evidenceFor(cited: CitedBasis): Promise<EvidenceRef> {
    const label = labelForNaturalId(cited);
    if (label === "Evidence") return cited as EvidenceRef;
    if (label === "Claim") {
      const found = await this.findingOn(cited as ClaimRef);
      if (!found) throw new Error(noFindingBearsOn(cited as ClaimRef));
      return found.evidence;
    }
    const rows = await this.graph.query(
      `MATCH (e:Evidence)-[:RECORDED_IN]->(:Artefact {natural_id: $id}) RETURN e`,
      { e: vertexProps<{ natural_id: string }>() },
      { id: cited },
    );
    const found = rows[0];
    if (!found)
      throw new Error(
        `no finding is recorded in ${cited}; a verdict rests on evidence, and observations ` +
          `produce it when they are recorded — cite the observations a check actually read`,
      );
    return ref("evidence", found.e.natural_id);
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
}
