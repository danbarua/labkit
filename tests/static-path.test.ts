/**
 * `staticFilePath` resolves a request path to a file under one root.
 *
 * The Explorer server builds a filesystem path out of `url.pathname`, so a
 * traversal that got through would read any file the process can. These
 * assertions are on the resolved path rather than on a refusal, because no
 * input reaches the refusal — see the function's own comment. Asserting the
 * refusal instead would pass against a version with no protection at all,
 * which is the shape this repo means by a check that cannot fail.
 */

import { expect, test } from "bun:test";
import { sep } from "node:path";
import { staticFilePath } from "../scripts/static-path";

const ROOT = `${sep}srv${sep}explorer`;

/** What a browser sends, after the URL parser has had it. */
const asPathname = (raw: string) => new URL(`http://localhost${raw}`).pathname;

test("a request path resolves under the root, and / means index.html", () => {
  expect(staticFilePath(ROOT, asPathname("/index.html"))).toBe(`${ROOT}${sep}index.html`);
  expect(staticFilePath(ROOT, asPathname("/"))).toBe(`${ROOT}${sep}index.html`);
  expect(staticFilePath(ROOT, asPathname("/app/main.js"))).toBe(`${ROOT}${sep}app${sep}main.js`);
});

test("staticFilePath keeps a traversing request path under the root", () => {
  // Both halves of what the function relies on, in one list: the leading-slash
  // cases are clamped by `normalize`, and the bare-relative ones survive it
  // and are neutralised by the `.` prefix instead -- `.` + `..` is `...`, a
  // plain filename. Swap the resolution for `join(root, pathname)` and the
  // first group escapes; drop the `.` and the second group does.
  const traversals = [
    "/../../../../etc/passwd",
    "/foo/../../../etc/passwd",
    "/./../../etc/passwd",
    "//etc/passwd",
    "/a/b/../../../../../../etc/passwd",
    "/%2e%2e/%2e%2e/etc/passwd",
    "../etc/passwd",
    "../../etc/passwd",
    "..",
    "./../x",
  ];
  for (const raw of traversals) {
    // A bare relative path is not something a URL parser can produce; it is
    // here because the signature takes a string and a future caller might.
    const resolved = staticFilePath(ROOT, raw.startsWith("/") ? asPathname(raw) : raw);
    expect(resolved).toBeDefined();
    expect(resolved!.startsWith(ROOT + sep)).toBe(true);
  }
});
