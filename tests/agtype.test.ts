import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { parseAgtype, type AgtypeNumeric, type AgtypeUnknown } from "../src/db/agtype";
import { TenantGraph, type LabKitDB } from "../src/db/graph";
import { resolveTenantContext } from "../src/db/tenant";
import { setupTestDb, type TestDb } from "./helpers/db";

/**
 * Validates parseAgtype's assumptions and uncovers gaps, per the review
 * that motivated rewriting it as a real recursive-descent parser rather
 * than a strip-and-delegate-to-JSON.parse shortcut (see src/db/agtype.ts's
 * file-level comment). Split into pure unit tests against hand-constructed
 * agtype text (no DB needed, exercises the two shapes the original sketch
 * got wrong) and integration tests against live pglite-age (confirms the
 * assumptions those unit tests encode actually match what AGE emits).
 */

describe("parseAgtype — pure parsing", () => {
  test("parses a vertex", () => {
    const v = parseAgtype(`{"id": 1, "label": "Test", "properties": {"x": 1, "name": "a"}}::vertex`);
    expect(v).toEqual({ kind: "vertex", id: 1, label: "Test", properties: { x: 1, name: "a" } });
  });

  test("parses an edge", () => {
    const e = parseAgtype(`{"id": 5, "label": "REL", "start_id": 1, "end_id": 2, "properties": {}}::edge`);
    expect(e).toEqual({ kind: "edge", id: 5, label: "REL", start_id: 1, end_id: 2, properties: {} });
  });

  test("parses a flat vertex-edge-vertex path", () => {
    const raw =
      `[{"id": 1, "label": "A", "properties": {}}::vertex,` +
      `{"id": 2, "label": "REL", "start_id": 1, "end_id": 3, "properties": {}}::edge,` +
      `{"id": 3, "label": "A", "properties": {}}::vertex]::path`;
    const p = parseAgtype(raw);
    expect(p.kind).toBe("path");
    if (p.kind !== "path") throw new Error("unreachable");
    expect(p.elements).toHaveLength(3);
    expect(p.elements[0]!.kind).toBe("vertex");
    expect(p.elements[1]!.kind).toBe("edge");
    expect(p.elements[2]!.kind).toBe("vertex");
  });

  test("parses bare scalars", () => {
    expect(parseAgtype("42")).toEqual({ kind: "scalar", value: 42 });
    expect(parseAgtype('"hello"')).toEqual({ kind: "scalar", value: "hello" });
    expect(parseAgtype("true")).toEqual({ kind: "scalar", value: true });
    expect(parseAgtype("null")).toEqual({ kind: "scalar", value: null });
  });

  test("a string property value containing a literal '::vertex,' is not corrupted", () => {
    const v = parseAgtype(`{"id": 1, "label": "T", "properties": {"name": "a string with \\"::vertex,\\" inside"}}::vertex`);
    expect(v.kind).toBe("vertex");
    if (v.kind !== "vertex") throw new Error("unreachable");
    expect(v.properties).toEqual({ name: 'a string with "::vertex," inside' });
  });

  // Bug in the original sketch: `is_array_path` (age.c) requires an
  // odd-length array alternating vertex/edge/vertex to get an outer
  // ::path tag. A plain `RETURN [n, m]` of two vertices is NOT a path —
  // it's an untagged array whose elements are each still individually
  // tagged ::vertex. A parser that treats "the last annotation in the
  // string" as "the whole thing's tag" misparses this as a single vertex.
  test("an untagged array of two vertices is not misparsed as a path or a vertex", () => {
    const raw =
      `[{"id": 1, "label": "A", "properties": {}}::vertex,` + `{"id": 2, "label": "A", "properties": {}}::vertex]`;
    const result = parseAgtype(raw);
    expect(result.kind).toBe("scalar");
    if (result.kind !== "scalar") throw new Error("unreachable");
    expect(Array.isArray(result.value)).toBe(true);
    const arr = result.value as unknown[];
    expect(arr).toHaveLength(2);
    expect((arr[0] as { kind: string }).kind).toBe("vertex");
    expect((arr[1] as { kind: string }).kind).toBe("vertex");
  });

  // Bug in the original sketch: the `extend` flag that triggers ::tag
  // suffixes propagates into nested serialization (agtype.c calls itself
  // recursively with the same flag), so a numeric property value inside a
  // vertex's properties map is ALSO tagged — not just top-level results.
  test("a ::numeric tag nested inside a vertex's properties doesn't break the outer parse", () => {
    const v = parseAgtype(`{"id": 1, "label": "T", "properties": {"score": 1.5::numeric, "name": "a"}}::vertex`);
    expect(v.kind).toBe("vertex");
    if (v.kind !== "vertex") throw new Error("unreachable");
    expect((v.properties as Record<string, unknown>).name).toBe("a");
    const score = (v.properties as Record<string, unknown>).score as AgtypeNumeric;
    expect(score).toEqual({ kind: "numeric", raw: "1.5" });
  });

  test("::numeric preserves the exact source text, not a re-stringified float", () => {
    // A decimal with more digits than a float64 can round-trip exactly —
    // if the fix routed through `number` at any point this would drift.
    const raw = "123456789012345678901234567890.123456789";
    const v = parseAgtype(`${raw}::numeric`);
    expect(v).toEqual({ kind: "scalar", value: { kind: "numeric", raw } });
  });

  test("Infinity, -Infinity, and NaN parse as their JS equivalents, at any depth", () => {
    expect(parseAgtype("Infinity")).toEqual({ kind: "scalar", value: Infinity });
    expect(parseAgtype("-Infinity")).toEqual({ kind: "scalar", value: -Infinity });
    expect(Number.isNaN((parseAgtype("NaN") as { value: number }).value)).toBe(true);

    const nested = parseAgtype(`{"id": 1, "label": "T", "properties": {"x": Infinity}}::vertex`);
    expect(nested.kind).toBe("vertex");
    if (nested.kind !== "vertex") throw new Error("unreachable");
    expect((nested.properties as Record<string, unknown>).x).toBe(Infinity);
  });

  test("an integer past Number.MAX_SAFE_INTEGER parses as a bigint, not a truncated number", () => {
    const result = parseAgtype("9007199254740993"); // MAX_SAFE_INTEGER + 2
    expect(result).toEqual({ kind: "scalar", value: 9007199254740993n });
  });

  test("a safe integer still parses as a plain number, not bigint", () => {
    const result = parseAgtype("42");
    expect(result).toEqual({ kind: "scalar", value: 42 });
    expect(typeof (result as { value: unknown }).value).toBe("number");
  });

  test("a large integer inside a vertex's id/properties parses correctly", () => {
    const v = parseAgtype(`{"id": 9007199254740993, "label": "T", "properties": {"count": 9007199254740993}}::vertex`);
    expect(v.kind).toBe("vertex");
    if (v.kind !== "vertex") throw new Error("unreachable");
    expect(v.id).toBe(9007199254740993n);
    expect((v.properties as Record<string, unknown>).count).toBe(9007199254740993n);
  });

  // The set of ::tags is closed for the pinned AGE version (confirmed from
  // source — see agtype.ts's file-level comment) but a future AGE upgrade
  // could add one; parsing must degrade, not crash.
  test("an unrecognized tag doesn't throw — degrades to a visible unknown-kind node", () => {
    const result = parseAgtype(`"foo"::somefuturetype`);
    expect(result).toEqual({ kind: "scalar", value: { kind: "unknown", tag: "somefuturetype", value: "foo" } as AgtypeUnknown });
  });

  test("a malformed ::path (even length, non-alternating) throws — a real invariant violation, not an unmodeled feature", () => {
    const raw =
      `[{"id": 1, "label": "A", "properties": {}}::vertex,` + `{"id": 2, "label": "A", "properties": {}}::vertex]::path`;
    expect(() => parseAgtype(raw)).toThrow(/odd length/);
  });

  test("a single-vertex path (length 1) is valid, not malformed", () => {
    const raw = `[{"id": 1, "label": "A", "properties": {}}::vertex]::path`;
    const p = parseAgtype(raw);
    expect(p.kind).toBe("path");
    if (p.kind !== "path") throw new Error("unreachable");
    expect(p.elements).toHaveLength(1);
  });
});

describe("parseAgtype — against live pglite-age", () => {
  let testDb: TestDb;
  let db: LabKitDB & { close(): Promise<void> };

  beforeAll(async () => {
    testDb = await setupTestDb();
  });

  afterAll(async () => {
    await testDb.close();
  });

  // A fresh connection per test, not one shared for the whole describe
  // block — see tests/helpers/db.ts's file-level comment: a confirmed
  // pglite-socket bug can permanently corrupt a connection under
  // concurrency/error exposure, so sharing one risks cascading failures
  // unrelated to whatever this file is actually testing.
  beforeEach(async () => {
    db = await testDb.openClient();
  });

  afterEach(async () => {
    await testDb.reset();
    await db.close();
  });

  test("round-trips a real vertex, edge, and path exactly as parseAgtype expects", async () => {
    const ctx = await resolveTenantContext(db, "labkit");
    const graph = new TenantGraph(ctx, db);

    const a = await graph.createNode("Question", { name: "q" });
    const b = await graph.createNode("LineOfEnquiry", { name: "loe" });
    await graph.createEdge(a.natural_id, "MOTIVATES", b.natural_id);

    const vertexRows = await graph.cypher<{ n: string }>(`MATCH (n:Question {natural_id: $id}) RETURN n`, "(n agtype)", {
      id: a.natural_id,
    });
    const parsedVertex = parseAgtype(vertexRows[0]!.n);
    expect(parsedVertex.kind).toBe("vertex");

    const edgeRows = await graph.cypher<{ e: string }>(
      `MATCH (:Question {natural_id: $id})-[e:MOTIVATES]->(:LineOfEnquiry) RETURN e`,
      "(e agtype)",
      { id: a.natural_id },
    );
    const parsedEdge = parseAgtype(edgeRows[0]!.e);
    expect(parsedEdge.kind).toBe("edge");

    const pathRows = await graph.cypher<{ p: string }>(
      `MATCH p = (:Question {natural_id: $id})-[:MOTIVATES]->(:LineOfEnquiry) RETURN p`,
      "(p agtype)",
      { id: a.natural_id },
    );
    const parsedPath = parseAgtype(pathRows[0]!.p);
    expect(parsedPath.kind).toBe("path");
    if (parsedPath.kind !== "path") throw new Error("unreachable");
    expect(parsedPath.elements.map((el) => el.kind)).toEqual(["vertex", "edge", "vertex"]);
  });

  // The headline case this rewrite exists for: LabKit provisions 13 node +
  // 19 edge labels per tenant (src/db/graph.ts's NODE_LABELS/EDGE_LABELS),
  // and graphid = label_id * 2^48 + entry_id — confirmed empirically that
  // SUPERSEDES (a late edge label in provisioning order) already produces
  // a graphid past Number.MAX_SAFE_INTEGER on its very first edge, in
  // every tenant, today — not a hypothetical.
  test("a SUPERSEDES edge's internal id, past Number.MAX_SAFE_INTEGER, round-trips exactly via bigint", async () => {
    const ctx = await resolveTenantContext(db, "labkit");
    const graph = new TenantGraph(ctx, db);

    const d1 = await graph.createNode("Decision", { reason: "r1", invalidation_check: "x" });
    const d2 = await graph.createNode("Decision", { reason: "r2", invalidation_check: "x" });
    await graph.createEdge(d2.natural_id, "SUPERSEDES", d1.natural_id);

    const rawIdRows = await db.query<{ id: string }>(`SELECT id::text FROM "${ctx.graphName}"."SUPERSEDES"`);
    const rawId = rawIdRows.rows[0]!.id;
    expect(Number.isSafeInteger(Number(rawId))).toBe(false); // confirms this test is actually exercising the unsafe case

    const edgeRows = await graph.cypher<{ e: string }>(
      `MATCH (:Decision {natural_id: $id})-[e:SUPERSEDES]->(:Decision) RETURN e`,
      "(e agtype)",
      { id: d2.natural_id },
    );
    const parsed = parseAgtype(edgeRows[0]!.e);
    expect(parsed.kind).toBe("edge");
    if (parsed.kind !== "edge") throw new Error("unreachable");
    expect(typeof parsed.id).toBe("bigint");
    // The actual assertion that matters: no precision was lost anywhere
    // between the database and this value, not just "it's a bigint."
    expect(String(parsed.id)).toBe(rawId);
  });
});
