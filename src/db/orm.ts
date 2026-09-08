/**
 * Drizzle, mounted **on** the seam rather than beside it.
 */

import { drizzle } from "drizzle-orm/pg-proxy";
import type { LabKitDB } from "./backend";

/**
 * The ORM for one connection.
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
 * Runs ORM work and rethrows the **driver's** error rather than drizzle's wrapper, because the
 * wrapper prints the parameters.
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
