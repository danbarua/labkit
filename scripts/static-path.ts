#!/usr/bin/env bun
/**
 * Resolves a request path to a file under one root directory, or refuses.
 *
 * It lives in its own file so it can be tested: `serve-explorer.ts` calls
 * `Bun.serve` at import time, so a test importing that module would start a
 * server.
 */

import { normalize, resolve, sep } from "node:path";

/**
 * The file a request path names under `root`, or `undefined` if it escapes.
 *
 * **What stops a traversal is the normalise-then-relativise pair, and the
 * `undefined` branch cannot be reached for any argument.** `normalize` clamps
 * a leading `..` on an absolute path, and prefixing `.` handles what survives
 * that: `.` followed by `..` is `...`, a plain filename, so the first segment
 * handed to `resolve` is never `..` whatever the caller passes. Checked for
 * every shape, not argued.
 *
 * The branch stays as a backstop against a future edit weakening either half
 * — which is also why the test named after this function asserts the resolved
 * path rather than the refusal. A test of the refusal would need an input
 * that does not exist, and would pass against a version with no protection at
 * all.
 */
export function staticFilePath(root: string, pathname: string): string | undefined {
  const requested = normalize(pathname === "/" ? "/index.html" : pathname);
  const filePath = resolve(root, `.${requested}`);
  if (filePath !== root && !filePath.startsWith(root + sep)) return undefined;
  return filePath;
}
