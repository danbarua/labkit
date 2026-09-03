import { vertexProps } from "../../db/cypher";
import { NODE_LABELS, SEARCHABLE_TEXT, SEARCHABLE_TEXT_ARRAYS } from "../../db/domain";
import type { IndexedString, Prose } from "../../db/domain";
import { SessionCore } from "../core";
import { ref, KIND_BY_LABEL } from "../report";
import type {
  ConcludedClaim,
  EnquiryRef,
  QuestionOrigin,
  QuestionRef,
  SearchGroup,
  SearchMatch,
} from "../report";
import { dedupeById, type Identified } from "./shared";

export class FindingGroup extends SessionCore {
  /** Every line of enquiry pursuing this question. */
  async pursuitsOf(question: QuestionRef): Promise<EnquiryRef[]> {
    const rows = await this.graph.query(
      `MATCH (:Question {natural_id: $id})-[:MOTIVATES]->(loe:LineOfEnquiry) RETURN loe`,
      { loe: vertexProps<{ natural_id: string }>() },
      { id: question },
    );
    return rows.map((r) => ref("enquiry", r.loe.natural_id) as EnquiryRef);
  }

  /**
   * Where a question came from, if it came from sharpening an earlier one.
   *
   * `null` for a question somebody simply asked — most questions have no
   * origin beyond the person who thought of it, and inventing one would be
   * worse than saying so.
   */
  async originOf(question: QuestionRef): Promise<QuestionOrigin | null> {
    const rows = await this.graph.query(
      `MATCH (d:Decision)-[:MOTIVATES]->(:Question {natural_id: $id})
       MATCH (d)-[:NARROWS]->(from:Question)
       RETURN d, from AS origin`,
      {
        d: vertexProps<{ natural_id: string; reason: string }>(),
        origin: vertexProps<{ natural_id: string; name: string }>(),
      },
      { id: question },
    );
    if (rows.length === 0) return null;

    const row = rows[0]!;
    const knew = await this.graph.query(
      `MATCH (:Decision {natural_id: $id})-[:BASED_ON]->(e:Evidence) RETURN e`,
      { e: vertexProps<{ statement: string } & Identified>() },
      { id: row.d.natural_id },
    );

    return {
      from: ref("question", row.origin.natural_id),
      fromAsks: row.origin.name,
      reason: row.d.reason,
      knownAtTheTime: dedupeById(
        knew.map((r) => ({
          evidence: ref("evidence", r.e.natural_id),
          states: r.e.statement,
        })),
        (f) => f.evidence,
      ).sort((a, b) => a.evidence.localeCompare(b.evidence)),
    };
  }

  /**
   * Claims asserting a proposition — the **one** place wording is resolved.
   *
   * Every verb takes a handle; a person types a sentence. This is the seam
   * between the two, and it is a verb of its own rather than a guess buried in
   * each read: it returns *all* matches and lets the caller refuse, instead of
   * picking one and being wrong when a sentence is asserted in two lines of
   * enquiry.
   */
  async claimsAsserting(proposition: IndexedString): Promise<ConcludedClaim[]> {
    const rows = await this.graph.query(
      `MATCH (c:Claim {name: $name}) RETURN c`,
      { c: vertexProps<{ name: string } & Identified>() },
      { name: proposition },
    );
    return rows.map((r) => ({
      claim: ref("claim", r.c.natural_id),
      asserts: r.c.name,
    }));
  }

  /**
   * Every record containing the text, as `{handle, wording}` pairs grouped by
   * label — how a caller holding only wording finds the handle for it.
   *
   * **Returns every match and refuses to pick, exactly as {@link
   * claimsAsserting} does** — this is a second seam where wording is
   * resolved, not the same one widened, because the two answer different
   * questions: `claimsAsserting` finds a claim by its *exact* asserted
   * sentence (its wording behaves like a key); this finds a *substring*
   * across every kind of record that carries free text. A caller wanting
   * one specific claim by its sentence should still use that verb — it is
   * both narrower and cheaper.
   *
   * **Scans every stored string a person typed** — `src/db/domain.ts`'s
   * `SEARCHABLE_TEXT`/`SEARCHABLE_TEXT_ARRAYS`, which is every `Prose` and
   * `IndexedString` property, held to the annotations by
   * `check:prop-classes`. A machine value is not scanned: a timestamp, a
   * content hash, a role nothing reads.
   *
   * Case-insensitive (`toLower` both sides — measured against AGE 2026-08-31:
   * plain `CONTAINS` works, `toLower(...) CONTAINS toLower(...)` also
   * works, `ANY(x IN list WHERE ...)` does not — a list property needs
   * `size([x IN list WHERE ...]) > 0` instead, which is why array and
   * scalar properties are two tables and two query shapes here, not one).
   */
  async search(text: Prose): Promise<SearchGroup[]> {
    const groups: SearchGroup[] = [];
    for (const label of NODE_LABELS) {
      const scalarProps = SEARCHABLE_TEXT[label] ?? [];
      const arrayProps = SEARCHABLE_TEXT_ARRAYS[label] ?? [];
      if (scalarProps.length === 0 && arrayProps.length === 0) continue;
      // Every label reachable here is a key of SEARCHABLE_TEXT or
      // SEARCHABLE_TEXT_ARRAYS, and check:prop-classes holds both to the
      // Prose annotations -- so a label with no research-concept kind would
      // be a finding worth its own sentence, not a runtime case to guard.
      const kind = KIND_BY_LABEL[label];
      if (!kind) throw new Error(`${label} is searchable but names no research-concept kind`);
      // `ref()`'s own kind<->label check is what makes the cast below safe:
      // `kind` is looked up FROM `label`, so the two cannot disagree, and
      // `ref` would throw before an actually-mismatched handle ever reached
      // `SearchMatch`. The cast narrows a dynamically-looked-up `string` to
      // the specific union `KIND_BY_LABEL`'s own type can't express without
      // a label-indexed conditional type -- more machinery than the
      // fact ("this group is one label, hence one kind") needs.
      const matches: SearchMatch[] = [];
      for (const prop of scalarProps) {
        const rows = await this.graph.query(
          `MATCH (n:${label}) WHERE toLower(n.${prop}) CONTAINS toLower($needle) RETURN n`,
          { n: vertexProps<Record<string, unknown> & Identified>() },
          { needle: text },
        );
        for (const row of rows) {
          matches.push({
            handle: ref(kind, row.n.natural_id) as SearchMatch["handle"],
            wording: String(row.n[prop]),
          });
        }
      }
      for (const prop of arrayProps) {
        const rows = await this.graph.query(
          `MATCH (n:${label}) WHERE size([x IN n.${prop} WHERE toLower(x) CONTAINS toLower($needle)]) > 0 RETURN n`,
          { n: vertexProps<Record<string, unknown> & Identified>() },
          { needle: text },
        );
        for (const row of rows) {
          const list = row.n[prop] as string[];
          const needle = text.toLowerCase();
          const wording = list.find((x) => x.toLowerCase().includes(needle)) ?? list.join("; ");
          matches.push({ handle: ref(kind, row.n.natural_id) as SearchMatch["handle"], wording });
        }
      }
      if (matches.length > 0) groups.push({ label, matches });
    }
    return groups;
  }
}
