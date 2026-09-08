/**
 * The transaction boundary, and who owns it.
 */

/**
 * All a transaction boundary needs: something that can issue a statement.
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
     * Re-entrant by depth count rather than by savepoint.
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
        // In `finally`, so it happens exactly once on every path. Decrementing before COMMIT
        // *and* again in a catch leaves `depth` at -1 when COMMIT throws -- and since re-
        // entrancy is keyed on `depth > 0`, the next compound verb runs at an apparent depth of
        // 0 and a verb nested inside it issues a second BEGIN instead of joining.
        depth -= 1;
      }
    },
  };
}
