/** Putting a question on the record, and opening a line of enquiry against it. */

import { optional, vertexProps } from "../../db/cypher";
import type { Prose } from "../../db/domain";
import type { TenantGraph } from "../../db/graph";
import type {
  EnquiryRef,
  EvidenceRef,
  OpenedEnquiry,
  Noted,
  Posed,
  Pursued,
  QuestionRef,
  SharpenedQuestion,
} from "../report";
import { ref } from "../report";
import type { NoteCommand, PoseCommand, PursueCommand, SharpenCommand } from "../commands";
import { SessionCore, type ResearchSessionOptions } from "../core";
import type { EmitDelta } from "./index";
import { applyDelta } from "../projection";
import { UnitOfWork } from "./shared";

export class Asking extends SessionCore {
  constructor(
    graph: TenantGraph,
    options: ResearchSessionOptions,
    private readonly emitDelta: EmitDelta,
  ) {
    super(graph, options);
  }

  /**
   * Puts a question on the record without pursuing it.
   *
   * This is what makes "untested" a state of the record rather than something a
   * reader invents: a question nobody has written down cannot be reported as
   * untested without manufacturing it. Posing is deliberately cheap — a hunch
   * is allowed on the books before anyone knows what the experiment is.
   *
   * Identity is the returned handle, never the wording. Posing the same words
   * twice gives two questions, because two people can ask the same thing for
   * different reasons and only the asker knows whether they meant one.
   */
  async pose(input: PoseCommand): Promise<Posed> {
    return this.graph.inTransaction(async () => {
      const unitOfWork = new UnitOfWork(this.graph);
      const asked = ref("question", await this.posed(input.question, unitOfWork));

      const events = await this.emitDelta("pose", asked, unitOfWork.delta(), {
        question: input.question,
      });

      await applyDelta(this.graph, events[0]!);
      return { question: asked, events };
    });
  }

  /**
   * Puts a note on the record — a dated, attributed `Prose` record and
   * nothing else required. The one write with no prerequisites besides
   * `pose`, and this one has no shape to satisfy at all: no `kind`, no
   * required attachment.
   *
   * `on` is optional and costs the caller nothing to skip — attaching a note
   * is cheap, requiring one is the gate this verb removes. A note nothing
   * is ever attached to is still exactly what was on the researcher's mind,
   * which is the whole point.
   */
  async note(input: NoteCommand): Promise<Noted> {
    return this.graph.inTransaction(async () => {
      const unitOfWork = new UnitOfWork(this.graph);
      const noted = ref("note", await unitOfWork.node("Note", { text: input.text }));
      if (input.on) unitOfWork.edge(noted, "CONCERNS", input.on);

      const events = await this.emitDelta("note", noted, unitOfWork.delta(), {
        text: input.text,
        ...(input.on ? { on: input.on } : {}),
      });

      await applyDelta(this.graph, events[0]!);
      return { note: noted, events };
    });
  }

  /**
   * The write, without the event. Verbs that compose this one record the
   * action the caller actually took, not the steps it decomposed into — the
   * event stream is a record of research actions, and a researcher who opened
   * an enquiry did one thing, not three.
   */
  private async posed(question: Prose, unitOfWork: UnitOfWork): Promise<QuestionRef> {
    return ref(
      "question",
      await unitOfWork.node("Question", { name: question, posed_at: this.clock.now() }),
    );
  }

  /**
   * Opens a line of enquiry pursuing a question already on the record.
   *
   * One question may be pursued many ways — that is what a `LineOfEnquiry`
   * *is*. `approach` names the pursuit, not the question, and carrying similar
   * words to another pursuit of the same question has no effect on identity
   * either way.
   */
  async pursue(input: PursueCommand): Promise<Pursued> {
    return this.graph.inTransaction(async () => {
      const unitOfWork = new UnitOfWork(this.graph);
      const enquiry = await this.pursued(input, unitOfWork);

      const events = await this.emitDelta("pursue", enquiry, unitOfWork.delta(), {
        question: input.question,
        approach: input.approach,
      });

      await applyDelta(this.graph, events[0]!);
      return { enquiry, events };
    });
  }

  /** The write, without the event — see `posed`. */
  private async pursued(input: PursueCommand, unitOfWork: UnitOfWork): Promise<EnquiryRef> {
    const enquiry = await unitOfWork.node("LineOfEnquiry", { name: input.approach });
    unitOfWork.edge(input.question, "MOTIVATES", enquiry);
    return ref("enquiry", enquiry);
  }

  /**
   * Poses a question and immediately pursues it — the common case.
   *
   * **Both nodes are created**, because they are different things: the question
   * is what is unknown, the enquiry is how it is being pursued. Creating only
   * the enquiry leaves closure with nothing to attach to, since closure is on
   * the question, and a closed enquiry goes on reporting itself open.
   */
  async openEnquiry(question: Prose): Promise<OpenedEnquiry> {
    return this.graph.inTransaction(async () => {
      const unitOfWork = new UnitOfWork(this.graph);
      const asked = await this.posed(question, unitOfWork);
      const enquiry = await this.pursued({ question: asked, approach: question }, unitOfWork);

      const events = await this.emitDelta("openEnquiry", enquiry, unitOfWork.delta(), {
        question,
        asked,
      });

      await applyDelta(this.graph, events[0]!);
      return { enquiry, question: asked, events };
    });
  }

  /**
   * Sharpens a question into a more precise one, recording the act rather than
   * editing the original.
   *
   * The original keeps its words. A vague hunch that later turns out to have
   * been the right instinct is worth being able to read back in the form it
   * was actually held, and rewriting it in place would make every programme
   * look as though it had known its final question from the start.
   *
   * Sharpening is not answering and not closing: the original stays open
   * unless something later resolves it on evidence.
   *
   * `knowing` freezes what the act was taken in light of. It is captured here,
   * at the moment of sharpening, because the alternative — reconstructing it
   * later from what stands *now* — back-dates every subsequent result onto the
   * decision. The question it answers is asked after more evidence arrives,
   * which is what makes the freezing load-bearing.
   */
  async sharpen(input: SharpenCommand): Promise<SharpenedQuestion> {
    return this.graph.inTransaction(async () => {
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

      const unitOfWork = new UnitOfWork(this.graph);
      const decision = await unitOfWork.node("Decision", {
        decided_at: this.clock.now(),
        reason: input.because,
        invalidation_check: "evidence that the sharper question was the wrong one to ask",
      });
      unitOfWork.edge(decision, "NARROWS", input.from);
      for (const finding of standing) unitOfWork.edge(decision, "BASED_ON", finding);

      const sharper = await this.posed(input.into, unitOfWork);
      unitOfWork.edge(decision, "MOTIVATES", sharper);

      const events = await this.emitDelta("sharpen", sharper, unitOfWork.delta(), {
        from: input.from,
        because: input.because,
        via: decision,
      });

      await applyDelta(this.graph, events[0]!);
      return { question: sharper, decision: ref("decision", decision), events };
    });
  }

  /** Every finding currently on the record — what "we knew at the time" means when an act is recorded. */
  private async standingFindings(): Promise<EvidenceRef[]> {
    const rows = await this.graph.query(
      `MATCH (:EvidenceUnit)-[:PRODUCES]->(e:Evidence)
       OPTIONAL MATCH (e)-[:RECORDED_IN]->(a:Artefact)
       RETURN e, a`,
      {
        e: vertexProps<{ natural_id: string }>(),
        a: optional(vertexProps<{ invalidated?: boolean }>()),
      },
    );
    return rows.filter((r) => !r.a?.invalidated).map((r) => ref("evidence", r.e.natural_id));
  }
}
