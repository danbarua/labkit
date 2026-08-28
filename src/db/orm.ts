/**
 * Drizzle, mounted **on** the seam rather than beside it.
 *
 * `drizzle(client)` takes a client. Hand it a `pg.Client` and its queries never
 * pass through `traced()`, never see whatever the connection was scoped to, and
 * never join the transaction `./transactor.ts` opened — tracing would silently
 * stop covering the ORM, and every decorator added later would miss it too.
 *
 * `drizzle-orm/pg-proxy` takes a **callback** instead:
 *
 * ```ts
 * type RemoteCallback = (sql, params, method) => Promise<{ rows }>
 * ```
 *
 * which is {@link LabKitDB.query} with one more argument. So the ORM sits on
 * top of the same one-method seam as `CypherRunner`, and inherits everything
 * the seam is wrapped in. The name means "proxy to wherever you like"; the
 * transport is ours, and there is **no socket** — verified against a raw
 * in-process PGlite, one callback invocation, zero connections opened.
 *
 * ## `rowMode: "array"` is not optional
 *
 * The proxy driver decodes rows itself, from *positional* values. Hand it
 * objects and it does not fail — measured on both backends, 2026-08-26:
 *
 * | | with objects | with `rowMode: "array"` |
 * | --- | --- | --- |
 * | `select().from(tenants)` | **`[{}, {}]`** | the rows |
 * | `select().where(eq(…))` | throws `value.map` | the rows |
 *
 * One empty object per row, no error, right row count. That is the exact shape
 * of wrong answer this repo goes furthest to avoid, which is why the option
 * lives on the seam (`QueryOptions`) instead of being a thing each call site
 * has to remember. Only `method === "all"` wants arrays; `run`, `get` and
 * `values` do not.
 *
 * ## What it is for
 *
 * The graph side got a typed surface years of decisions ago — `TenantGraph` →
 * `CypherRunner` → seam, with decoders and an `AS`-clause builder that refuses
 * a name it cannot decode. The relational side got nothing, so it grew string
 * concatenation: four call sites building `WHERE` clauses with array-push and
 * `$${params.push(v)}`. This is the surface those four move onto.
 *
 * It also erases a real difference between the backends rather than papering
 * over it. `count(*)` and `bigserial` come back as a *string* from `pg` and a
 * *number* from a raw PGlite; drizzle applies its own column mappers, so
 * `seq` is a number on both. Measured, not assumed.
 */

import { drizzle } from "drizzle-orm/pg-proxy";
import type { LabKitDB } from "./backend";

/**
 * The ORM for one connection.
 *
 * Cheap — it holds no connection of its own, only the callback — so a caller
 * that already has a `LabKitDB` can build one per command without thinking
 * about it. Whatever transaction the seam is currently inside, these queries
 * are inside too, because they are the same connection.
 */
export function ormOver(db: LabKitDB) {
  return drizzle(async (sql, params, method) => {
    const { rows } = await db.query<unknown>(
      sql,
      params,
      // See the table above. `all` is the only method that decodes positionally.
      method === "all" ? { rowMode: "array" } : undefined,
    );
    return { rows: rows as unknown[] };
  });
}

/**
 * Runs ORM work and rethrows the **driver's** error rather than drizzle's
 * wrapper, because the wrapper prints the parameters.
 *
 * A `DrizzleQueryError`'s message is `Failed query: <sql>\nparams: <values>` —
 * measured, and the values are the ones that were bound. LabKit binds
 * propositions, findings, verdicts and event payloads, and an error message
 * goes further than a log: `src/mcp/server.ts` deliberately does not catch, so
 * the SDK ships the message to the agent as `isError: true`. `src/db/trace.ts`
 * already refuses to log parameters for exactly this reason, and moving to an
 * ORM must not quietly undo that.
 *
 * The `cause` carries the real error unchanged — SQLSTATE included, verified —
 * so nothing that switches on a code loses anything. The hand-written SQL this
 * replaced threw the driver error directly; this restores that.
 *
 * Applied per operation rather than per statement, because an operation is the
 * unit a caller already has a function for. A new relational call site has to
 * remember it, which is the honest cost of drizzle not offering a hook.
 */
export async function unwrapped<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    // Recognised by its own properties, not by `err.name` — which is the
    // inherited `"Error"`, because `DrizzleQueryError` sets a class name and
    // not the field. Checked, after the first version of this silently caught
    // nothing and the test that found the leak went on failing.
    if (
      err instanceof Error &&
      err.cause instanceof Error &&
      Object.hasOwn(err, "query") &&
      Object.hasOwn(err, "params")
    ) {
      throw err.cause;
    }
    throw err;
  }
}
