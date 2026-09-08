/** Closing a question, or deliberately leaving it open. */

import { optional, scalar, vertexProps } from "../../db/cypher";
import type { TenantGraph } from "../../db/graph";
import type {
  AcceptedAsUnresolved,
  ClosedEnquiry,
  StoppedWork,
  EnquiryRef,
  EvidenceRef,
  QuestionRef,
} from "../report";
import { ref } from "../report";
import type { AcceptAsUnresolvedCommand, CloseEnquiryCommand, StopWorkCommand } from "../commands";
import { SessionCore, type ResearchSessionOptions } from "../core";
import type { Handle } from "./index";
import { noFindingBearsOn } from "./shared";
import type { UnitOfWork } from "../projection";

export class Stopping extends SessionCore {
  constructor(
    graph: TenantGraph,
    options: ResearchSessionOptions,
    private readonly handle: Handle,
  ) {
    super(graph, options);
  }

  /**
   * Closes an enquiry by resolving the question that motivates it.
   */
  async closeEnquiry(input: CloseEnquiryCommand): Promise<ClosedEnquiry> {
    return this.handle("closeEnquiry", input, async (unitOfWork) => {
      // Everything is validated before anything is written. A rejected close
      // must leave no Decision behind, and an analysis from some other enquiry
      // must not become the stated basis for resolving this question.
      const question = await this.questionBehind(input.enquiry);
      if (!question)
        throw new Error(
          `enquiry ${input.enquiry} has no motivating question to resolve; closure attaches to the question an enquiry pursues, so pursue one before closing`,
        );

      // **Closing a closed question is refused, not recorded.** A second close writes a second
      // `RESOLVES`, and `enquiryStatus()` picks between them with `.find()` over rows AGE
      // returns in no defined order — so which close a reader sees is arbitrary.
      const alreadyResolved = await this.graph.query(
        `MATCH (d:Decision)-[:RESOLVES]->(:Question {natural_id: $id}) RETURN d`,
        { d: vertexProps<{ natural_id: string; reason: string }>() },
        { id: question },
      );
      if (alreadyResolved.length > 0) {
        throw new Error(
          `enquiry ${input.enquiry} is already closed by decision ` +
            `${alreadyResolved[0]!.d.natural_id} (${alreadyResolved[0]!.d.reason}); ` +
            `closing it again would leave two decisions resolving one question`,
        );
      }

      let answerBearing: EvidenceRef[] = [];
      let answeredProposition: string | undefined;
      if (input.answeredBy) {
        // The claim identifies itself; what still has to be checked is that it belongs to THIS
        // enquiry. One hop from the claim rather than a search for a proposition. BOTH
        // bearings. A question answered "no" is answered on a finding that CHALLENGES its
        // proposition, so checking only SUPPORTS rejects exactly that closure.
        const addresses: unknown[] = [];
        for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
          addresses.push(
            ...(await this.graph.query(
              `MATCH (:Claim {natural_id: $claim})<-[:${bearing}]-(:Evidence)<-[:PRODUCES]-(:EvidenceUnit)-[:ADDRESSES]->(:LineOfEnquiry {natural_id: $enquiry})
               RETURN 1`,
              { ok: scalar<number>() },
              { claim: input.answeredBy, enquiry: input.enquiry },
            )),
          );
        }
        // A synthesis belongs to the enquiry its parts belong to. It has no
        // evidence of its own -- that is what makes it a synthesis -- so the
        // walk above finds nothing, and one hop through `RESTS_ON` is what the
        // caller already said when they named the findings.
        if (addresses.length === 0) {
          for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
            addresses.push(
              ...(await this.graph.query(
                `MATCH (:Claim {natural_id: $claim})-[:RESTS_ON]->(:Claim)<-[:${bearing}]-(:Evidence)<-[:PRODUCES]-(:EvidenceUnit)-[:ADDRESSES]->(:LineOfEnquiry {natural_id: $enquiry})
                 RETURN 1`,
                { ok: scalar<number>() },
                { claim: input.answeredBy, enquiry: input.enquiry },
              )),
            );
          }
        }
        if (addresses.length === 0) {
          throw new Error(
            `claim ${input.answeredBy} does not belong to enquiry ${input.enquiry}; it cannot answer its question — cite a claim this enquiry concluded, or close the enquiry that concluded this one`,
          );
        }
        const found = await this.findingOn(input.answeredBy);
        if (found) {
          answerBearing = [found.evidence];
          answeredProposition = found.asserts;
        } else {
          // A synthesis rests on findings rather than producing one, so the closure rests on
          // the findings underneath it — all of them. Citing one would name an arbitrary part
          // as the answer to a question the whole was drawn to settle.
          const parts: { c: { name: string }; e: { natural_id: string } }[] = [];
          for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
            parts.push(
              ...(await this.graph.query(
                `MATCH (c:Claim {natural_id: $claim})-[:RESTS_ON]->(:Claim)<-[:${bearing}]-(e:Evidence)
                 RETURN c, e`,
                {
                  c: vertexProps<{ name: string }>(),
                  e: vertexProps<{ natural_id: string }>(),
                },
                { claim: input.answeredBy },
              )),
            );
          }
          if (parts.length === 0) throw new Error(noFindingBearsOn(input.answeredBy));
          answerBearing = [...new Set(parts.map((r) => ref("evidence", r.e.natural_id)))];
          answeredProposition = parts[0]!.c.name;
        }
      }

      const decided = ref(
        "decision",
        await unitOfWork.node("Decision", {
          decided_at: this.clock.now(),
          reason: answeredProposition
            ? `answered on "${answeredProposition}"`
            : "closed without a cited result",
          invalidation_check: "new evidence bearing on the question",
        }),
      );
      unitOfWork.edge(decided, "RESOLVES", question);
      for (const basis of answerBearing) unitOfWork.edge(decided, "BASED_ON", basis);

      return {
        subject: input.enquiry,
        result: { decision: decided },
      };
    });
  }

  private async questionBehind(enquiry: EnquiryRef): Promise<QuestionRef | undefined> {
    const rows = await this.graph.query(
      `MATCH (q:Question)-[:MOTIVATES]->(:LineOfEnquiry {natural_id: $id}) RETURN q`,
      { q: vertexProps<{ natural_id: string }>() },
      { id: enquiry },
    );
    const q = rows[0]?.q.natural_id;
    return q ? ref("question", q) : undefined;
  }

  /**
   * Records that a question is being left open on purpose.
   */
  async acceptAsUnresolved(input: AcceptAsUnresolvedCommand): Promise<AcceptedAsUnresolved> {
    return this.handle("acceptAsUnresolved", input, async (unitOfWork) => {
      const at = this.clock.now();

      const question = await this.questionBehind(input.enquiry);
      if (!question)
        throw new Error(
          `enquiry ${input.enquiry} pursues no question; an enquiry is opened against a question, and accepting it as unresolved leaves that question open on purpose`,
        );

      const found = await this.findingOn(input.inLightOf);
      if (!found) throw new Error(noFindingBearsOn(input.inLightOf));
      const basis = found.evidence;

      const decision = ref(
        "decision",
        await unitOfWork.node("Decision", {
          decided_at: at,
          reason: input.because,
          invalidation_check: input.until,
        }),
      );
      unitOfWork.edge(decision, "DEFERS", question);
      // What was known when the call was made, which is what makes
      // `evidence` answerable afterwards rather than only now.
      unitOfWork.edge(decision, "BASED_ON", basis);

      return {
        subject: input.enquiry,
        result: { decision },
      };
    });
  }

  /**
   * Planned work somebody decided not to do.
   */
  async stopWork(input: StopWorkCommand): Promise<StoppedWork> {
    return this.handle("stopWork", input, async (unitOfWork) => {
      const [task] = await this.graph.query(
        `MATCH (t:Task {natural_id: $id})
         OPTIONAL MATCH (d:Decision)-[:RESOLVES]->(t)
         RETURN t, d`,
        {
          t: vertexProps<{ natural_id: string; objective: string }>(),
          d: optional(vertexProps<{ reason: string }>()),
        },
        { id: input.work },
      );
      if (!task)
        throw new Error(
          `no work ${input.work}; a task exists once \`plan\` records one, and its handle comes back from that act`,
        );
      if (task.d)
        throw new Error(
          `work ${input.work} was already stopped, because "${task.d.reason}"; a piece of work is ` +
            `stopped once, and nothing re-opens one yet`,
        );

      const decision = ref(
        "decision",
        await unitOfWork.node("Decision", {
          decided_at: this.clock.now(),
          reason: input.because,
          invalidation_check: "a reason to do this work after all",
        }),
      );
      unitOfWork.edge(decision, "RESOLVES", input.work);

      return {
        subject: input.work,
        result: { decision },
      };
    });
  }
}
