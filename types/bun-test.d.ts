/**
 * bun-types declares `expect(x).rejects` and `.resolves` as the synchronous matchers, so each
 * assertion on them returns `void`. At runtime each returns a promise, and a test that does not
 * await it ends before the assertion runs. Typed as promises, `await` on them is correct and a
 * missing `await` is a floating promise that oxlint reports. Remove when bun-types does this.
 */
import type { Matchers } from "bun:test";

/** `Matchers` with each assertion, `.not` included, returning the promise it returns at runtime. */
type AsyncMatchers<T> = {
  [K in keyof Matchers<T>]: K extends "not"
    ? AsyncMatchers<T>
    : Matchers<T>[K] extends (...args: infer A) => void
      ? (...args: A) => Promise<void>
      : Matchers<T>[K];
};

declare module "bun:test" {
  interface Matchers<T> {
    rejects: AsyncMatchers<unknown>;
    resolves: AsyncMatchers<Awaited<T>>;
  }
}
