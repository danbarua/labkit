/** Closing a pursuit or planned work, or deliberately leaving a question open. */

import { optional, vertexProps } from "@labkit/core-db/cypher";
import type { TenantGraph } from "@labkit/core-db/graph";
import type {
  AcceptedAsUnresolved,
  ClaimRef,
  ClosedEnquiry,
  EnquiryRef,
  EvidenceRef,
  QuestionRef,
  StoppedWork,
} from "../report";
import { ref, stagedRef } from "../report";
import { DomainRefusal } from "../refusal";
import type { AcceptAsUnresolvedCommand, CloseEnquiryCommand, StopWorkCommand } from "../commands";
import { SessionCore, type ResearchSessionOptions } from "../core";
import type { Handle } from "./index";

export class Stopping extends SessionCore {
  constructor(
    graph: TenantGraph,
    options: ResearchSessionOptions,
    private readonly handle: Handle,
  ) {
    super(graph, options);
  }

  /** Close exactly the named enquiry. Its question is derived by readers. */
  async closeEnquiry(input: CloseEnquiryCommand): Promise<ClosedEnquiry> {
    return this.handle("closeEnquiry", input, async (unitOfWork) => {
      const [target] = await this.graph.query(
        `MATCH (loe:LineOfEnquiry {natural_id: $id})
         OPTIONAL MATCH (d:Decision)-[:CLOSES]->(loe)
         RETURN loe, d`,
        {
          loe: vertexProps<{ natural_id: string; name: string }>(),
          d: optional(vertexProps<{ natural_id: string; reason: string }>()),
        },
        { id: input.enquiry },
      );
      if (!target)
        throw new DomainRefusal({
          kind: "not-found",
          message: `${input.enquiry} not found`,
          subject: input.enquiry,
        });
      const question = await this.questionBehind(input.enquiry);
      if (!question)
        throw new DomainRefusal({
          kind: "invariant",
          message: `enquiry ${input.enquiry} has no question. \`pursue\` one before closing.`,
          subject: input.enquiry,
        });
      if (target.d)
        throw new DomainRefusal({
          kind: "invariant",
          message: `${input.enquiry} is already closed by ${target.d.natural_id} (${target.d.reason})`,
          subject: input.enquiry,
        });

      // One answer per named claim, each resting on the findings that bear on it.
      const answers: { claim: ClaimRef; bearing: EvidenceRef[]; asserts: string }[] = [];
      for (const claim of input.answeredBy ?? []) {
        const found = await this.findingOn(claim);
        if (found) {
          answers.push({ claim, bearing: [found.evidence], asserts: found.asserts });
          continue;
        }
        // A synthesis rests on findings rather than producing one, so the closure rests on
        // the findings underneath it — all of them. Citing one would name an arbitrary part
        // as the answer to a question the whole was drawn to settle.
        const parts: { c: { name: string }; e: { natural_id: string } }[] = [];
        for (const bearing of ["SUPPORTS", "CHALLENGES"] as const) {
          parts.push(
            ...(await this.graph.query(
              `MATCH (c:Claim {natural_id: $claim})-[:BASED_ON]->(:Claim)<-[:${bearing}]-(e:Evidence)
               RETURN c, e`,
              {
                c: vertexProps<{ name: string }>(),
                e: vertexProps<{ natural_id: string }>(),
              },
              { claim },
            )),
          );
        }
        // A claim nothing has concluded yet still answers; the closure then rests on nothing.
        const [bare] = await this.graph.query(
          `MATCH (c:Claim {natural_id: $claim}) RETURN c`,
          { c: vertexProps<{ name: string }>() },
          { claim },
        );
        if (!bare)
          throw new DomainRefusal({
            kind: "not-found",
            message: `${claim} not found`,
            subject: claim,
          });
        answers.push({
          claim,
          bearing: [...new Set(parts.map((r) => ref("evidence", r.e.natural_id)))],
          asserts: parts[0]?.c.name ?? bare.c.name,
        });
      }

      const closure = answers.length === 0 ? ("abandoned" as const) : ("answered" as const);
      const decided = stagedRef(
        "decision",
        unitOfWork.node("Decision", {
          decided_at: this.clock.now(),
          reason:
            answers.length === 0
              ? "closed without a cited result"
              : `answered on ${answers.map((a) => `"${a.asserts}"`).join("; ")}`,
          invalidation_check: "new evidence bearing on this enquiry's question",
        }),
      );
      unitOfWork.edge(decided, "CLOSES", input.enquiry);
      for (const answer of answers) unitOfWork.edge(decided, "ANSWERS", answer.claim);
      for (const basis of new Set(answers.flatMap((a) => a.bearing)))
        unitOfWork.edge(decided, "BASED_ON", basis);

      return {
        subject: input.enquiry,
        result: {
          decision: decided,
          enquiry: input.enquiry,
          question,
          closure,
          answered: answers.map((a) => ({ claim: a.claim, asserts: a.asserts })),
        },
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
        throw new DomainRefusal({
          kind: "invariant",
          message: `${input.enquiry} pursues no question`,
          subject: input.enquiry,
        });

      const origin = await this.claimOrigin(input.inLightOf);
      const basis =
        origin === undefined ? [] : origin.kind === "direct" ? [origin.evidence] : origin.evidence;

      const decision = stagedRef(
        "decision",
        unitOfWork.node("Decision", {
          decided_at: at,
          reason: input.because,
          invalidation_check: input.until,
        }),
      );
      unitOfWork.edge(decision, "ACCEPTS", question);
      unitOfWork.edge(decision, "BASED_ON", input.inLightOf);
      // What was known when the call was made, which is what makes
      // `evidence` answerable afterwards rather than only now.
      for (const cited of basis) unitOfWork.edge(decision, "BASED_ON", cited);

      return {
        subject: input.enquiry,
        result: { decision },
      };
    });
  }

  /** Planned work somebody decided not to do. */
  async stopWork(input: StopWorkCommand): Promise<StoppedWork> {
    return this.handle("stopWork", input, async (unitOfWork) => {
      const [task] = await this.graph.query(
        `MATCH (t:Task {natural_id: $id})
         OPTIONAL MATCH (d:Decision)-[:CLOSES]->(t)
         RETURN t, d`,
        {
          t: vertexProps<{ natural_id: string; objective: string }>(),
          d: optional(vertexProps<{ reason: string }>()),
        },
        { id: input.work },
      );
      if (!task)
        throw new DomainRefusal({
          kind: "not-found",
          message: `${input.work} not found`,
          subject: input.work,
        });
      if (task.d)
        throw new DomainRefusal({
          kind: "invariant",
          message: `${input.work} was already stopped: "${task.d.reason}"`,
          subject: input.work,
        });

      const decision = stagedRef(
        "decision",
        unitOfWork.node("Decision", {
          decided_at: this.clock.now(),
          reason: input.because,
          invalidation_check: "a reason to do this work after all",
        }),
      );
      unitOfWork.edge(decision, "CLOSES", input.work);

      return {
        subject: input.work,
        result: { decision, work: input.work, closure: "stopped" },
      };
    });
  }
}
