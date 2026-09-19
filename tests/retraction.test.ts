/**
 * `undo` retracts through the same tenant-scoped role every real session runs as, not through
 * the admin connection the rest of the suite uses.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectDb, type LabKitDBConnection } from "@labkit/core-db/connect";
import { resolveTenantContext } from "@labkit/core-db/tenant";
import { scopeToTenant } from "@labkit/core-db/scoped";
import { NODE_LABELS } from "@labkit/core-db/domain";
import { TenantGraph } from "@labkit/core-db/graph";
import { ResearchSession, inMemoryEventLog } from "@labkit/core-domain";
import { kindOf, ref } from "@labkit/core-domain/report";

let home: string;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "labkit-retraction."));
});
afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

test("undo hides what it retracted from the role every ordinary session runs as", async () => {
  const connection: LabKitDBConnection = await connectDb(home);
  try {
    const ctx = await resolveTenantContext(connection.db, connection.tx, "labkit");
    await scopeToTenant(connection.db, ctx);
    const graph = new TenantGraph(ctx, connection.db, connection.tx);
    const session = new ResearchSession(graph, { events: inMemoryEventLog() });

    const wording = "retraction end-to-end probe: does this hide?";
    const { question, events } = await session.writes.pose({ question: wording });
    await session.writes.undo({
      event: events[0]!.seq!,
      because: "proving the mechanism, not a real question",
    });

    // Unreachable by the wording that used to find it -- not merely absent
    // from one report, but genuinely invisible to a normal read.
    const found = await session.reads.search({ text: wording });
    expect(found.flatMap((g) => g.matches)).toEqual([]);

    // And unreachable as a write target, the same way a handle nobody ever
    // minted would be: `pursue` checks its target exists before wiring
    // anything to it.
    await expect(session.writes.pursue({ question, approach: "try again" })).rejects.toThrow();
  } finally {
    await connection.close();
  }
}, 60_000);

test("every retracted node label is unreachable by lookup and traversal", async () => {
  const connection: LabKitDBConnection = await connectDb(home);
  try {
    const ctx = await resolveTenantContext(connection.db, connection.tx, "labkit");
    await scopeToTenant(connection.db, ctx);
    const graph = new TenantGraph(ctx, connection.db, connection.tx);
    const session = new ResearchSession(graph, { events: inMemoryEventLog() });
    const { note: anchor } = await session.writes.note({ text: "live traversal anchor" });
    const at = "2026-09-11T00:00:00.000Z";
    const nodes = [
      await graph.createNode("Question", { name: "retracted question", posed_at: at }),
      await graph.createNode("LineOfEnquiry", { name: "retracted enquiry" }),
      await graph.createNode("EvidenceUnit", { role: "experiment" }),
      await graph.createNode("Evidence", { statement: "retracted finding" }),
      await graph.createNode("Claim", { name: "retracted claim" }),
      await graph.createNode("Decision", {
        reason: "retracted decision",
        invalidation_check: "reconsider",
        decided_at: at,
      }),
      await graph.createNode("Criterion", { proposition: "retracted condition" }),
      await graph.createNode("CriterionEvaluation", {
        value: "retracted verdict",
        outcome: "pass",
        evaluated_at: at,
      }),
      await graph.createNode("Gate", { consequence: "retracted gate" }),
      await graph.createNode("Review", { verdict: "retracted review" }),
      await graph.createNode("Artefact", {
        kind: "observations",
        logical_name: "retracted observations",
      }),
      await graph.createNode("Computation", { method: "retracted analysis", status: "completed" }),
      await graph.createNode("Task", {
        objective: "retracted work",
        mayRead: [],
        outputs: "",
        acceptance: "retracted acceptance",
      }),
      await graph.createNode("Note", { text: "retracted note" }),
    ];

    expect(new Set(nodes.map((node) => node.label))).toEqual(new Set(NODE_LABELS));
    for (const node of nodes) {
      await graph.createEdge(anchor, "CONCERNS", node.natural_id);
      await graph.setNodeProperty(node.natural_id, "retracted", true);
      const kind = kindOf(node.natural_id);
      if (!kind) throw new Error(`no handle kind for ${node.natural_id}`);
      const handle = ref(kind, node.natural_id);
      expect(await session.reads.reachable({ subject: handle })).toBe(false);
      await expect(session.reads.why({ subject: handle })).rejects.toThrow();
    }

    expect(await session.reads.neighboursOf({ subject: anchor })).toEqual([]);
    expect((await session.reads.why({ subject: anchor })).because).toEqual([]);
  } finally {
    await connection.close();
  }
}, 60_000);
