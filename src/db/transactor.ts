/**
 * The transaction boundary, and who owns it.
 *
 * **Not `TenantGraph`.** The event store writes down the same connection,
 * drizzle mounts on the same seam, and both run inside transactions a graph
 * opened. A transaction is a property of the *connection*:
 * two objects issuing `BEGIN` down one connection are in one transaction
 * whether they know it or not, and a second depth counter is exactly how they
 * stop knowing.
 *
 * So the boundary lives here, one per connection, handed out by
 * `LabKitDBConnection`. `TenantGraph.inTransaction` still exists and still
 * reads the same at its thirty-odd call sites in `src/domain/write.ts`; it
 * delegates, and keeps only the part that is genuinely its own — clearing the
 * minted-id list when the outermost transaction settles.
 *
 * **Not defaulted anywhere, deliberately.** A `TenantGraph` that made its own
 * transactor when none was passed would look identical and be wrong the moment
 * a second graph appeared over the same connection — which is not hypothetical:
 * `tests/helpers/scenario.ts`'s `current()` builds exactly that second graph,
 * and `tests/domain-graph.test.ts` builds two tenants' graphs side by side.
 * They would each count depth privately, both issue `BEGIN`, and the second
 * would fail or silently join. It is the same failure shape as a per-call
 * surface defaulting its own event sink (`src/mcp/server.ts`), which shipped
 * once already.
 */

/**
 * All a transaction boundary needs: something that can issue a statement.
 *
 * Deliberately **not** `LabKitDB`. `backend.ts` holds the seam and also builds
 * the transactors, so importing the seam type from here would put a cycle in a
 * layer whose whole claim is that it is acyclic — and the narrower type is the
 * truer one anyway. A transactor issues three statements and reads no rows.
 */
interface Statements {
  query(sql: string): Promise<unknown>;
}

export interface Transactor {
  /**
   * Runs `work` inside one database transaction: everything it writes commits
   * together, or none of it does. Re-entrant — a nested call joins the
   * transaction already open rather than starting a second one.
   */
  inTransaction<T>(work: () => Promise<T>): Promise<T>;
  /**
   * How many transactions deep the connection currently is. `0` outside one.
   *
   * Exposed because settling the outermost transaction has consequences its
   * owner cannot know about — `TenantGraph` has to clear minted ids exactly
   * then — and a listener registry would be a heavier answer to one caller.
   */
  readonly depth: number;
}

export function transactor(db: Statements): Transactor {
  let depth = 0;

  return {
    get depth() {
      return depth;
    },

    /**
     * Re-entrant by depth count rather than by savepoint. A verb that composes
     * another (`reverify` calls the analysis writer) must not issue a nested
     * `BEGIN`, and partial rollback to a savepoint is not something any caller
     * has needed — the whole point is that these actions are indivisible.
     */
    async inTransaction<T>(work: () => Promise<T>): Promise<T> {
      if (depth > 0) return work();
      await db.query("BEGIN");
      depth += 1;
      try {
        const result = await work();
        await db.query("COMMIT");
        return result;
      } catch (err) {
        // A failed ROLLBACK must not become the error the caller sees. The
        // original is why we are here; the rollback failure is a consequence of
        // it, and reporting the consequence loses the cause.
        try {
          await db.query("ROLLBACK");
        } catch {
          // deliberately swallowed -- see above
        }
        throw err;
      } finally {
        // In `finally`, so it happens exactly once on every path. Decrementing
        // before COMMIT *and* again in a catch leaves `depth` at -1 when COMMIT
        // throws -- and since re-entrancy is keyed on `depth > 0`, the next
        // compound verb runs at an apparent depth of 0 and a verb nested inside
        // it issues a second BEGIN instead of
        // joining. The re-entrancy contract silently inverted, for the life of
        // the object holding it. Never observed firing; found while
        // investigating the suite flake and demonstrated in
        // tests/domain-graph.test.ts.
        depth -= 1;
      }
    },
  };
}
