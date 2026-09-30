/**
 * A record dumped as SQL and restored into a fresh cluster is the same record.
 */

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectScratch } from "@labkit/core-db/connect";
import { dumpSql, restoreInto } from "@labkit/core-db/dump";
import { TenantGraph } from "@labkit/core-db/graph";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import { scalar } from "@labkit/core-db/cypher";
import { ignoreLabkitDbUrl } from "../helpers/scratch-record";

ignoreLabkitDbUrl();

test("dump then restore gives back the graph, and the restored graph takes a write", async () => {
  const source = mkdtempSync(join(tmpdir(), "labkit-dump-src-"));
  const target = mkdtempSync(join(tmpdir(), "labkit-dump-dst-"));
  try {
    let sql: string;
    const from = await connectScratch(source);
    try {
      const ctx = await resolveTenantContext(from.db, from.tx, "labkit");
      const graph = new TenantGraph(ctx, from.db, from.tx);
      const q = await graph.createNode("Question", {
        name: "does a dump come back?",
        posed_at: "2026-09-22T00:00:00.000Z",
      });
      const loe = await graph.createNode("LineOfEnquiry", { name: "it does" });
      await graph.createEdge(q.natural_id, "MOTIVATES", loe.natural_id);
      sql = await dumpSql(from);
    } finally {
      await from.close();
    }

    // AGE's graphid has no text input and a graph is keyed by its schema's OID:
    // both are rewritten, or nothing below reads.
    expect(sql).toContain("ag_catalog._graphid(");
    expect(sql).toContain("'labkit_t1'::regnamespace::oid");
    expect(sql).not.toMatch(/^INSERT INTO ag_catalog\.ag_graph VALUES \(\d+/m);

    await restoreInto(join(target, "pglite"), sql);

    const to = await connectScratch(target);
    try {
      const ctx = await resolveTenantContext(to.db, to.tx, "labkit");
      const graph = new TenantGraph(ctx, to.db, to.tx);
      const edges = await graph.query(
        `MATCH (:Question)-[e:MOTIVATES]->(:LineOfEnquiry) RETURN count(e)`,
        { count: scalar<number>() },
      );
      expect(edges[0]!.count).toBe(1);

      // Ids keep counting from where the source left off, not from one. A tenant has one
      // sequence across every label, and the source minted two nodes.
      const next = await graph.createNode("Question", {
        name: "a second question",
        posed_at: "2026-09-22T00:00:01.000Z",
      });
      expect(next.natural_id).toBe("Q_3");
    } finally {
      await to.close();
    }
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
}, 60_000);

test("every graph label comes back, including the first vertex and edge label in the dump", async () => {
  // `pg_dump` orders tables by name, so `Artefact` directly follows `_ag_label_vertex` and
  // `ABOUT` directly follows `_ag_label_edge`: the two tables whose rows were left unrewritten.
  const source = mkdtempSync(join(tmpdir(), "labkit-dump-src-"));
  const target = mkdtempSync(join(tmpdir(), "labkit-dump-dst-"));
  try {
    let sql: string;
    const handles: string[] = [];
    const before = new Map<string, unknown>();
    const from = await connectScratch(source);
    try {
      const ctx = await resolveTenantContext(from.db, from.tx, "labkit");
      const graph = new TenantGraph(ctx, from.db, from.tx);
      const artefact = await graph.createNode("Artefact", {
        kind: "observations",
        logical_name: "runs.parquet",
      });
      const claim = await graph.createNode("Claim", { name: "the dump comes back" });
      const verdict = await graph.createNode("CriterionEvaluation", {
        value: "it does",
        outcome: "pass",
        evaluated_at: "2026-09-22T00:00:00.000Z",
      });
      await graph.createEdge(verdict.natural_id, "ABOUT", claim.natural_id);
      handles.push(artefact.natural_id, claim.natural_id, verdict.natural_id);
      for (const id of handles) before.set(id, await graph.entityAsHal(id, 1));
      sql = await dumpSql(from);
    } finally {
      await from.close();
    }

    expect(sql).toContain('INSERT INTO labkit_t1."Artefact" VALUES (ag_catalog._graphid(');
    expect(sql).toContain('INSERT INTO labkit_t1."ABOUT" VALUES (ag_catalog._graphid(');
    expect(sql).not.toMatch(/^INSERT INTO labkit_t1\."[^"]+" VALUES \('\d+'/m);

    await restoreInto(join(target, "pglite"), sql);

    const to = await connectScratch(target);
    try {
      const ctx = await resolveTenantContext(to.db, to.tx, "labkit");
      const graph = new TenantGraph(ctx, to.db, to.tx);
      for (const id of handles) expect(await graph.entityAsHal(id, 1)).toEqual(before.get(id));
    } finally {
      await to.close();
    }
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
}, 60_000);
