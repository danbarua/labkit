/**
 * Row-level security, asserted rather than described.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectDb, type LabKitDBConnection } from "../src/db/connect";
import { resolveTenantContext, type TenantContext } from "../src/db/tenant";
import { scopeToTenant } from "../src/db/scoped";
import { pgEventLog } from "../src/domain/event-store";
import { domainEvent, type DomainEvent } from "../src/domain/events";

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
      await pgEventLog(c.db, ctx.tenantId).record(anEvent("Q_A"));
      return ctx;
    });
    b = await asTenant("rls-b", async (c, ctx) => {
      await pgEventLog(c.db, ctx.tenantId).record(anEvent("Q_B"));
      return ctx;
    });
    expect(a.tenantId).not.toBe(b.tenantId);
  }, 60_000);

  test("each sees only its own, through the ordinary read path", async () => {
    const seenByA = await asTenant("rls-a", (c, ctx) => pgEventLog(c.db, ctx.tenantId).all());
    const seenByB = await asTenant("rls-b", (c, ctx) => pgEventLog(c.db, ctx.tenantId).all());
    expect(seenByA.map((e) => e.subject)).toEqual(["Q_A"]);
    expect(seenByB.map((e) => e.subject)).toEqual(["Q_B"]);
  }, 60_000);

  test("the tenant filter is the policy's, not the query's", async () => {
    // The event store always filters by tenant, so its answer above cannot
    // distinguish "the policy works" from "the WHERE clause works". This is
    // the query the policy has to catch: no filter at all, one tenant scoped.
    // Without RLS it returns both rows.
    const rows = await asTenant("rls-a", async (c) => {
      const r = await c.db.query<{ subject: string }>(
        `select subject from public.labkit_event order by subject`,
      );
      return r.rows.map((x) => x.subject);
    });
    expect(rows).toEqual(["Q_A"]);
  }, 60_000);

  test("writing another tenant's row is refused", async () => {
    const refusal = await asTenant("rls-a", (c) =>
      pgEventLog(c.db, b.tenantId)
        .record(anEvent("Q_SMUGGLED"))
        .then(
          () => "it was allowed",
          (err: Error) => err.message,
        ),
    );
    expect(refusal).toMatch(/row-level security policy/);

    // And nothing landed: the refusal is not a partial write.
    const stillOnlyB = await asTenant("rls-b", (c, ctx) => pgEventLog(c.db, ctx.tenantId).all());
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
});
