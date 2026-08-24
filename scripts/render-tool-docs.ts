#!/usr/bin/env bun
/**
 * Writes `docs/mcp-tools.md` from the server's own tool declarations.
 *
 * The document is checked in for one reason: it is the only place the domain's
 * API is reviewable as a single file, and its **diff** is the useful part —
 * a changed line means the API changed.
 *
 * It is kept fresh by an assertion in `tests/mcp.test.ts`, not by a hook and
 * not by a `check:*` script. `.githooks/` regenerating a document inside
 * someone else's commit was tried for the dependency graph and removed on
 * 2026-08-21; a second script would be a second thing to remember. The test
 * already renders this document for other reasons, so the freshness check is
 * one more assertion in a file that was going to run anyway.
 *
 * When that assertion fails, run this. It takes milliseconds and is a pure
 * function of `TOOLS`.
 */

import { writeFileSync } from "node:fs";
import { renderToolDocs } from "../src/mcp/docs";
import { DOCS_FILE } from "../src/mcp/docs";

const rendered = renderToolDocs();
writeFileSync(DOCS_FILE, rendered);
console.error(`wrote ${DOCS_FILE} (${rendered.split("\n").length} lines)`);
