/** Closing a question, or deliberately leaving it open. */

import { scalar, vertexProps } from "../../db/cypher";
import type { TenantGraph } from "../../db/graph";
import type {
  AcceptedAsUnresolved,
  ClosedEnquiry,
  EnquiryRef,
  EvidenceRef,
  QuestionRef,
} from "../report";
import { ref } from "../report";
import type { AcceptAsUnresolvedCommand, CloseEnquiryCommand } from "../commands";
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
   *
   * `answeredBy` is what makes this an answer rather than an abandonment:
   * closing with nothing cited is a real and different act, and the two must
   * not read alike.
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

      // **Closing a closed question is refused, not recorded.** A second close
      // writes a second `RESOLVES`, and `enquiryStatus()` picks between them with
      // `.find()` over rows AGE returns in no defined order — so which close a
      // reader sees is arbitrary. Demonstrated through the public API with no
      // interruption at all: abandon an enquiry, later find a result and close it
      // citing the evidence, and the record still reports `abandoned`,
      // `answer: null`, `evidence: []`. The answer is erased, and `abandoned` is
      // a positive classification rather than an empty result. Two clean calls
      // are enough; nothing has to fail halfway.
      //
      // **Refused rather than resolved in the reader**, and the choice is not
      // arbitrary: `closeEnquiry` is the only writer of `RESOLVES`, so with this
      // guard two resolving decisions cannot exist, and a reader-side tie-break
      // would be a branch nothing can reach, and an unreachable branch is not
      // merely dead but usually wrong.
      //
      // The refusal has something real to refuse: a caller closing a question
      // that is already closed. Re-opening a settled question on new evidence is
      // a *different research act* and has no verb; it gets built when something
      // needs it, rather than being smuggled in as a second close.
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
        // The claim identifies itself; what still has to be checked is that it
        // belongs to THIS enquiry. One hop from the claim rather than a search
        // for a proposition.
        // BOTH bearings. A question answered "no" is answered on a finding that
        // CHALLENGES its proposition, so checking only SUPPORTS rejects exactly
        // that closure.
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
          // A synthesis rests on findings rather than producing one, so the
          // closure rests on the findings underneath it — all of them. Citing
          // one would name an arbitrary part as the answer to a question the
          // whole was drawn to settle.
          //
          // **Both bearings, and AGE has no edge alternation.** Naming only
          // `SUPPORTS` is silent: the rows are simply absent, and a synthesis
          // drawn across findings that all *challenge* their propositions —
          // which is what a negative result looks like, and what Bonsai's
          // Stage 1D headline is — reads as a claim nothing bears on. Shipped
          // that way in #276 and found by running the transcript.
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
   *
   * Not closing it. `closeEnquiry()` with nothing cited reports the question
   * **abandoned** — nobody worked on it, no result behind it — which reads a
   * deliberate decision as neglect.
   *
   * `until` is the condition that would reopen it, landing on the decision's
   * `invalidation_check`: what would make this decision wrong. The condition
   * should be about the world — new design, new data — rather than "run the
   * analysis again", and nothing here can enforce that. What the model
   * guarantees is that a condition was named at all, which is the difference
   * between deciding to stop and drifting to a halt.
   *
   * **No `Task` is created.** A to-do item nobody intends to action, minted so
   * a survey can report it, is ceremony.
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
}
