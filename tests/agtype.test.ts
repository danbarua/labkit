import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  buildAsClause,
  parseAgtype,
  validateIdentifier,
  type AgtypeNumeric,
  type AgtypeUnknown,
} from "../src/db/agtype";
import { TenantGraph } from "../src/db/graph";
import { agtypeValue } from "../src/db/cypher";
import type { LabKitDB } from "../src/db/backend";
import { resolveTenantContext } from "../src/db/tenant";
import { setupTestDb, type TestClient, type TestDb } from "./helpers/db";

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
    const v = parseAgtype(
      `{"id": 1, "label": "Test", "properties": {"x": 1, "name": "a"}}::vertex`,
    );
    expect(v).toEqual({
      kind: "vertex",
      id: 1,
      label: "Test",
      properties: { x: 1, name: "a" },
    });
  });

  test("parses an edge", () => {
    const e = parseAgtype(
      `{"id": 5, "label": "REL", "start_id": 1, "end_id": 2, "properties": {}}::edge`,
    );
    expect(e).toEqual({
      kind: "edge",
      id: 5,
      label: "REL",
      start_id: 1,
      end_id: 2,
      properties: {},
    });
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
    const v = parseAgtype(
      `{"id": 1, "label": "T", "properties": {"name": "a string with \\"::vertex,\\" inside"}}::vertex`,
    );
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
      `[{"id": 1, "label": "A", "properties": {}}::vertex,` +
      `{"id": 2, "label": "A", "properties": {}}::vertex]`;
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
    const v = parseAgtype(
      `{"id": 1, "label": "T", "properties": {"score": 1.5::numeric, "name": "a"}}::vertex`,
    );
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
    expect(parseAgtype("Infinity")).toEqual({
      kind: "scalar",
      value: Infinity,
    });
    expect(parseAgtype("-Infinity")).toEqual({
      kind: "scalar",
      value: -Infinity,
    });
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
    const v = parseAgtype(
      `{"id": 9007199254740993, "label": "T", "properties": {"count": 9007199254740993}}::vertex`,
    );
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
    expect(result).toEqual({
      kind: "scalar",
      value: {
        kind: "unknown",
        tag: "somefuturetype",
        value: "foo",
      } as AgtypeUnknown,
    });
  });

  test("a malformed ::path (even length, non-alternating) throws — a real invariant violation, not an unmodeled feature", () => {
    const raw =
      `[{"id": 1, "label": "A", "properties": {}}::vertex,` +
      `{"id": 2, "label": "A", "properties": {}}::vertex]::path`;
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
  let db: TestClient;

  beforeAll(async () => {
    testDb = await setupTestDb();
  });

  afterAll(async () => {
    await testDb.close();
  });

  // One labelled client per test. This used to be a *fresh connection* per
  // test, containing a pglite-socket defect that could permanently corrupt one;
  // there is no socket any more, so it is now bookkeeping and a trace label
  // rather than containment — see tests/helpers/db.ts's file-level comment.
  beforeEach(async () => {
    db = await testDb.openClient();
  });

  afterEach(async () => {
    await testDb.reset();
    await db.close();
  });

  test("round-trips a real vertex, edge, and path exactly as parseAgtype expects", async () => {
    const ctx = await resolveTenantContext(db, "labkit");
    const graph = new TenantGraph(ctx, db, db.tx);

    const a = await graph.createNode("Question", {
      name: "q",
      posed_at: "2026-01-01T00:00:00.000Z",
    });
    const b = await graph.createNode("LineOfEnquiry", { name: "loe" });
    await graph.createEdge(a.natural_id, "MOTIVATES", b.natural_id);

    const vertexRows = await graph.query(
      `MATCH (n:Question {natural_id: $id}) RETURN n`,
      { n: agtypeValue() },
      {
        id: a.natural_id,
      },
    );
    const parsedVertex = vertexRows[0]!.n;
    expect(parsedVertex.kind).toBe("vertex");

    const edgeRows = await graph.query(
      `MATCH (:Question {natural_id: $id})-[e:MOTIVATES]->(:LineOfEnquiry) RETURN e`,
      { e: agtypeValue() },
      { id: a.natural_id },
    );
    const parsedEdge = edgeRows[0]!.e;
    expect(parsedEdge.kind).toBe("edge");

    const pathRows = await graph.query(
      `MATCH p = (:Question {natural_id: $id})-[:MOTIVATES]->(:LineOfEnquiry) RETURN p`,
      { p: agtypeValue() },
      { id: a.natural_id },
    );
    const parsedPath = pathRows[0]!.p;
    expect(parsedPath.kind).toBe("path");
    if (parsedPath.kind !== "path") throw new Error("unreachable");
    expect(parsedPath.elements.map((el) => el.kind)).toEqual(["vertex", "edge", "vertex"]);
  });

  // The headline case this rewrite exists for. graphid = label_id * 2^48 +
  // entry_id, so the label count is what puts SUPERSEDES — a late edge label in
  // provisioning order — past Number.MAX_SAFE_INTEGER on its very first edge,
  // in every tenant, today, not hypothetically.
  //
  // No counts here. This comment carried "13 node + 19 edge labels" and was
  // wrong by six, because a number in a comment is a maintenance claim nobody
  // agreed to keep (PJ-028).
  //
  // Nor are they asserted, which was the first instinct and is wrong: the
  // property that matters is asserted empirically below — `Number.isSafeInteger`
  // on the real graphid — and that guard tightens as labels are added, where
  // `expect(EDGE_LABELS.length).toBe(n)` would merely break. An assertion that
  // protects nothing an existing assertion does not is a change-detector.
  test("a SUPERSEDES edge's internal id, past Number.MAX_SAFE_INTEGER, round-trips exactly via bigint", async () => {
    const ctx = await resolveTenantContext(db, "labkit");
    const graph = new TenantGraph(ctx, db, db.tx);

    const d1 = await graph.createNode("Decision", {
      reason: "r1",
      invalidation_check: "x",
      decided_at: "2026-01-01T00:00:00.000Z",
    });
    const d2 = await graph.createNode("Decision", {
      reason: "r2",
      invalidation_check: "x",
      decided_at: "2026-01-01T00:00:00.000Z",
    });
    await graph.createEdge(d2.natural_id, "SUPERSEDES", d1.natural_id);

    const rawIdRows = await db.query<{ id: string }>(
      `SELECT id::text FROM "${ctx.graphName}"."SUPERSEDES"`,
    );
    const rawId = rawIdRows.rows[0]!.id;
    expect(Number.isSafeInteger(Number(rawId))).toBe(false); // confirms this test is actually exercising the unsafe case

    const edgeRows = await graph.query(
      `MATCH (:Decision {natural_id: $id})-[e:SUPERSEDES]->(:Decision) RETURN e`,
      { e: agtypeValue() },
      { id: d2.natural_id },
    );
    const parsed = edgeRows[0]!.e;
    expect(parsed.kind).toBe("edge");
    if (parsed.kind !== "edge") throw new Error("unreachable");
    expect(typeof parsed.id).toBe("bigint");
    // The actual assertion that matters: no precision was lost anywhere
    // between the database and this value, not just "it's a bigint."
    expect(String(parsed.id)).toBe(rawId);
  });
});

/**
 * The AS clause AGE requires is unquoted SQL, so Postgres case-folds it while
 * AGE keys its result rows by the name the Cypher RETURN used. A camelCase
 * column therefore comes back present and NULL for every row -- no error, and
 * a decoder reads it as "nothing matched". S-3c lost a debugging cycle to
 * exactly this, and blamed AGE's OPTIONAL MATCH for it.
 */
describe("buildAsClause rejects names that would decode as null", () => {
  test("a camelCase column name is refused, with the alias to use instead", () => {
    expect(() => buildAsClause([{ name: "basisOut" }])).toThrow(/must be lower-case/);
    expect(() => buildAsClause([{ name: "basisOut" }])).toThrow(/AS basisout/);
  });

  test("lower-case and snake_case names are unaffected", () => {
    expect(buildAsClause([{ name: "c" }, { name: "basis_out" }])).toBe(
      "c agtype, basis_out agtype",
    );
  });

  /**
   * The rule is about result-column names only. Labels and property keys are
   * quoted where they are used, and LabKit's are camelCase and PascalCase
   * throughout -- a shared rule here would have rejected `CriterionEvaluation`.
   */
  test("labels and property keys keep their case", () => {
    expect(() => validateIdentifier("CriterionEvaluation", "vertex label")).not.toThrow();
    expect(() => validateIdentifier("natural_id", "property key")).not.toThrow();
  });
});
