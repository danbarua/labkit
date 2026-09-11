/** Putting a question on the record, and opening a line of enquiry against it. */

import { optional, vertexProps } from "../../db/cypher";
import { labelForNaturalId, type Prose } from "../../db/domain";
import type { TenantGraph } from "../../db/graph";
import type {
  EnquiryRef,
  EvidenceRef,
  OpenedEnquiry,
  AnyRef,
  Noted,
  NoteRef,
  Posed,
  Pursued,
  QuestionRef,
  SharpenedQuestion,
} from "../report";
import { KIND_BY_LABEL, ref } from "../report";
import type { NoteCommand, PoseCommand, PursueCommand, SharpenCommand } from "../commands";
import { SessionCore, type ResearchSessionOptions } from "../core";
import type { Handle } from "./index";
import type { UnitOfWork } from "../projection";

export class Asking extends SessionCore {
  constructor(
    graph: TenantGraph,
    options: ResearchSessionOptions,
    private readonly handle: Handle,
  ) {
    super(graph, options);
  }

  /**
   * Puts a question on the record without pursuing it.
   */
  async pose(input: PoseCommand): Promise<Posed> {
    return this.handle("pose", input, async (unitOfWork) => {
      if (input.from) await this.noteExists(input.from);
      const asked = ref("question", await this.posed(input.question, unitOfWork));
      if (input.from) unitOfWork.edge(input.from, "MOTIVATES", asked);
      return { subject: asked, result: { question: asked } };
    });
  }

  /**
   * Refuses a note nobody wrote. `UnitOfWork.edge` stages a `CREATE` that returns zero rows and
   * no error for a missing endpoint, so without this the question is minted with its origin
   * silently absent.
   */
  private async noteExists(note: NoteRef): Promise<void> {
    const rows = await this.graph.query(
      `MATCH (n:Note {natural_id: $id}) RETURN n`,
      { n: vertexProps<{ text: string }>() },
      { id: note },
    );
    if (rows.length === 0)
      throw new Error(
        `no note ${note} for this question to come out of; write it with 'note' first, or pose the question without one`,
      );
  }

  /**
   * Puts a note on the record — a dated, attributed `Prose` record and nothing else required.
   * The one write with no prerequisites besides `pose`, and this one has no shape to satisfy at
   * all: no `kind`, no required attachment.
   */
  async note(input: NoteCommand): Promise<Noted> {
    return this.handle("note", input, async (unitOfWork) => {
      if (input.prompted) await this.hasNoOriginYet(input.prompted);
      const noted = ref("note", await unitOfWork.node("Note", { text: input.text }));
      if (input.on) unitOfWork.edge(noted, "CONCERNS", input.on);
      if (input.prompted) unitOfWork.edge(noted, "MOTIVATES", input.prompted);
      return { subject: noted, result: { note: noted } };
    });
  }

  /**
   * Refuses a question that does not exist, and one that already says where it came from. Two
   * origins would leave a reader two answers to *why was this asked* and nothing saying which
   * holds.
   */
  private async hasNoOriginYet(question: QuestionRef): Promise<void> {
    const asked = await this.graph.query(
      `MATCH (q:Question {natural_id: $id}) RETURN q`,
      { q: vertexProps<{ name: string }>() },
      { id: question },
    );
    if (asked.length === 0)
      throw new Error(
        `no question ${question} for this note to have prompted; pose it first, or write the note without --prompted`,
      );

    const origin = await this.originAlready(question);
    if (origin)
      throw new Error(
        `${question} already came from ${origin}; a question has one origin, and a second would leave a reader two answers to why it was asked`,
      );
  }

  /** What a question already says it came from — a note, or the decision that sharpened it. */
  private async originAlready(question: QuestionRef): Promise<AnyRef | undefined> {
    // Two MATCHes: AGE has no edge alternation, and the sharpening arm arrives
    // through the decision that recorded why rather than directly.
    for (const pattern of [
      `MATCH (n:Note)-[:MOTIVATES]->(:Question {natural_id: $id}) RETURN n AS found`,
      `MATCH (d:Decision)-[:MOTIVATES]->(:Question {natural_id: $id})
       MATCH (d)-[:NARROWS]->(:Question) RETURN d AS found`,
    ]) {
      const rows = await this.graph.query(
        pattern,
        { found: vertexProps<{ natural_id: string }>() },
        { id: question },
      );
      // The kind differs by arm -- a Note on the first, the Decision that
      // recorded the sharpening on the second -- and the caller only prints it.
      const found = rows[0]?.found.natural_id;
      if (found) return ref(KIND_BY_LABEL[labelForNaturalId(found)]!, found);
    }
    return undefined;
  }

  /**
   * The write, without the event. Verbs that compose this one record the action the caller
   * actually took, not the steps it decomposed into — the event stream is a record of research
   * actions, and a researcher who opened an enquiry did one thing, not three.
   */
  private async posed(question: Prose, unitOfWork: UnitOfWork): Promise<QuestionRef> {
    return ref(
      "question",
      await unitOfWork.node("Question", { name: question, posed_at: this.clock.now() }),
    );
  }

  /**
   * Opens a line of enquiry pursuing a question already on the record.
   */
  async pursue(input: PursueCommand): Promise<Pursued> {
    return this.handle("pursue", input, async (unitOfWork) => {
      const enquiry = await this.pursued(input, unitOfWork);
      return { subject: enquiry, result: { enquiry } };
    });
  }

  /** The write, without the event — see `posed`. */
  private async pursued(input: PursueCommand, unitOfWork: UnitOfWork): Promise<EnquiryRef> {
    const enquiry = await unitOfWork.node("LineOfEnquiry", {
      name: input.approach,
      started_at: this.clock.now(),
    });
    unitOfWork.edge(input.question, "MOTIVATES", enquiry);
    return ref("enquiry", enquiry);
  }

  /**
   * Poses a question and immediately pursues it — the common case.
   */
  async openEnquiry(question: Prose, from?: NoteRef): Promise<OpenedEnquiry> {
    return this.handle(
      "openEnquiry",
      { question, ...(from ? { from } : {}) },
      async (unitOfWork) => {
        if (from) await this.noteExists(from);
        const asked = await this.posed(question, unitOfWork);
        if (from) unitOfWork.edge(from, "MOTIVATES", asked);
        const enquiry = await this.pursued({ question: asked, approach: question }, unitOfWork);
        return { subject: enquiry, result: { enquiry, question: asked } };
      },
    );
  }

  /**
   * Sharpens a question into a more precise one, recording the act rather than editing the
   * original.
   */
  async sharpen(input: SharpenCommand): Promise<SharpenedQuestion> {
    return this.handle("sharpen", input, async (unitOfWork) => {
      const original = await this.graph.query(
        `MATCH (q:Question {natural_id: $id}) RETURN q`,
        { q: vertexProps<{ name: string }>() },
        { id: input.from },
      );
      if (original.length === 0)
        throw new Error(
          `no question ${input.from} to sharpen; pose it first, or name a question already on the record`,
        );

      const standing = await this.standingFindings();

      const decision = await unitOfWork.node("Decision", {
        decided_at: this.clock.now(),
        reason: input.because,
        invalidation_check: "evidence that the sharper question was the wrong one to ask",
      });
      unitOfWork.edge(decision, "NARROWS", input.from);
      for (const finding of standing) unitOfWork.edge(decision, "BASED_ON", finding);

      const sharper = await this.posed(input.into, unitOfWork);
      unitOfWork.edge(decision, "MOTIVATES", sharper);

      return {
        subject: sharper,
        result: { question: sharper, decision: ref("decision", decision) },
      };
    });
  }

  /** Every finding currently on the record — what "we knew at the time" means when an act is recorded. */
  private async standingFindings(): Promise<EvidenceRef[]> {
    const rows = await this.graph.query(
      `MATCH (:EvidenceUnit)-[:PRODUCES]->(e:Evidence) RETURN e`,
      { e: vertexProps<{ natural_id: string }>() },
    );
    return rows.map((r) => ref("evidence", r.e.natural_id));
  }
}
