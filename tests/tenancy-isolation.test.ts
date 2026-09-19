/**
 * Row-level security, asserted rather than described.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectDb, type LabKitDBConnection } from "@labkit/core-db/connect";
import { resolveTenantContext, type TenantContext } from "@labkit/core-db/tenant";
import { scopeToTenant } from "@labkit/core-db/scoped";
import { pgEventLog } from "@labkit/core-domain/event-store";
import { domainEvent, type DomainEvent } from "@labkit/core-domain/events";

let home: string;

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "labkit-rls."));
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

const anEvent = (subject: string): DomainEvent =>
  domainEvent({
    at: "2026-01-01T00:00:00.000Z",
    operation: "pose",
    subject,
    command: { question: "does it hold?" },
    changes: [
      {
        change: "NodeCreated",
        id: subject,
        label: "Question",
        props: { name: "does it hold?", posed_at: "2026-01-01T00:00:00.000Z" },
      },
    ],
    attribution: {
      attribution_label: "rls-probe",
      attribution_id: "rls",
      attribution_how: "claimed",
      git_hash: "0000000",
    },
  });

/**
 * One connection, resolved and stepped down, for the duration of `work`.
 */
async function asTenant<T>(
  slug: string,
  work: (c: LabKitDBConnection, ctx: TenantContext) => Promise<T>,
): Promise<T> {
  const connection = await connectDb(home);
  try {
    const ctx = await resolveTenantContext(connection.db, connection.tx, slug);
    await scopeToTenant(connection.db, ctx);
    return await work(connection, ctx);
  } finally {
    await connection.close();
  }
}

describe("a scoped session is confined to its tenant", () => {
  let a: TenantContext;
  let b: TenantContext;

  test("two tenants each record an event", async () => {
    a = await asTenant("rls-a", async (c, ctx) => {
      await pgEventLog(c.db, ctx).record(anEvent("Q_A"));
      return ctx;
    });
    b = await asTenant("rls-b", async (c, ctx) => {
      await pgEventLog(c.db, ctx).record(anEvent("Q_B"));
      return ctx;
    });
    expect(a.tenantId).not.toBe(b.tenantId);
  }, 60_000);

  test("each sees only its own, through the ordinary read path", async () => {
    const seenByA = await asTenant("rls-a", (c, ctx) => pgEventLog(c.db, ctx).all());
    const seenByB = await asTenant("rls-b", (c, ctx) => pgEventLog(c.db, ctx).all());
    expect(seenByA.map((e) => e.subject)).toEqual(["Q_A"]);
    expect(seenByB.map((e) => e.subject)).toEqual(["Q_B"]);
  }, 60_000);

  test("the tenant filter is the policy's, not the query's", async () => {
    // The event store always filters by tenant, so its answer above cannot
    // distinguish "the policy works" from "the WHERE clause works". This is
    // the query the policy has to catch: no filter at all, one tenant scoped,
    // reading the OTHER tenant's table directly. `labkit_app` is granted
    // SELECT on every workspace schema, so nothing but the policy is between
    // this session and B's rows. Without RLS it returns Q_B.
    const rows = await asTenant("rls-a", async (c) => {
      const own = await c.db.query<{ subject: string }>(
        `select subject from "${a.graphName}".labkit_event order by subject`,
      );
      const theirs = await c.db.query<{ subject: string }>(
        `select subject from "${b.graphName}".labkit_event order by subject`,
      );
      return { own: own.rows.map((x) => x.subject), theirs: theirs.rows.map((x) => x.subject) };
    });
    expect(rows).toEqual({ own: ["Q_A"], theirs: [] });
  }, 60_000);

  test("writing another tenant's row is refused", async () => {
    const refusal = await asTenant("rls-a", (c) =>
      pgEventLog(c.db, b)
        .record(anEvent("Q_SMUGGLED"))
        .then(
          () => "it was allowed",
          (err: Error) => err.message,
        ),
    );
    expect(refusal).toMatch(/row-level security policy/);

    // And nothing landed: the refusal is not a partial write.
    const stillOnlyB = await asTenant("rls-b", (c, ctx) => pgEventLog(c.db, ctx).all());
    expect(stillOnlyB.map((e) => e.subject)).toEqual(["Q_B"]);
  }, 60_000);

  test("the session really is the unprivileged role", async () => {
    // Otherwise everything above would pass against a superuser session with
    // no policy in force at all — a superuser bypasses RLS unconditionally,
    // which is the trap the whole step-down exists past.
    const who = await asTenant("rls-a", async (c) => {
      const r = await c.db.query<{ current_user: string; rolsuper: boolean }>(
        `select current_user, (select rolsuper from pg_roles where rolname = current_user) as rolsuper`,
      );
      return r.rows[0]!;
    });
    expect(who.current_user).toBe("labkit_app");
    expect(who.rolsuper).toBe(false);
  }, 60_000);

  /**
   * The point of the move: a workspace's stream is numbered in the workspace.
   *
   * Asserted as a gap, not a value — three events into A must not move B's numbering. A
   * shared counter, which a `LIKE`-copied `bigserial` default leaves behind, makes B's step
   * 4. Absolute numbers would depend on what the tests above wrote, including the insert RLS
   * refused after the sequence had handed out its number.
   */
  test("each workspace numbers its own stream", async () => {
    const write = (slug: string, subject: string) =>
      asTenant(slug, (c, ctx) =>
        pgEventLog(c.db, ctx)
          .record(anEvent(subject))
          .then((e) => e.seq),
      );

    const first = await write("rls-b", "Q_B_FIRST");
    for (const n of [1, 2, 3]) await write("rls-a", `Q_A_${n}`);
    const second = await write("rls-b", "Q_B_SECOND");

    expect(second - first).toBe(1);
  }, 60_000);
});
