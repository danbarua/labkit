import { vertexProps } from "@labkit/core-db/cypher";
import { NODE_LABELS, SEARCHABLE_TEXT, SEARCHABLE_TEXT_ARRAYS } from "@labkit/core-db/domain";
import type { ClaimsAssertingQuery, SearchQuery } from "../queries";
import { SessionCore } from "../core";
import { KIND_BY_LABEL, ref } from "../report";
import type { ConcludedClaim, SearchGroup, SearchMatch } from "../report";
import { type Identified } from "./shared";

export class FindingGroup extends SessionCore {
  /**
   * Claims asserting a proposition — the **one** place wording is resolved.
   */
  async claimsAsserting({ proposition }: ClaimsAssertingQuery): Promise<ConcludedClaim[]> {
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
   * Every record containing the text, as `{handle, wording}` pairs grouped by label — how a
   * caller holding only wording finds the handle for it.
   */
  async search({ text }: SearchQuery): Promise<SearchGroup[]> {
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
      // `ref()`'s own kind<->label check is what makes the cast below safe: `kind` is looked up
      // FROM `label`, so the two cannot disagree, and `ref` would throw before an actually-
      // mismatched handle ever reached `SearchMatch`.
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
