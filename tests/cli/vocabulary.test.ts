/**
 * The vocabulary is collected from the schemas; how each word reads is a
 * judgement. This is what holds the two together: an enum value added to a
 * report has no meaning to read by until someone gives it one.
 */

import { expect, test } from "bun:test";
import { VOCABULARY } from "@labkit/core-domain/reports";
import { READING } from "@labkit/app-cli/vocabulary";

test("every word the schemas can say has a reading", () => {
  const missing = [...VOCABULARY].filter((word) => !(word in READING)).sort();
  expect(missing).toEqual([]);
});

test("no reading is given for a word no schema can say", () => {
  const stale = Object.keys(READING)
    .filter((word) => !VOCABULARY.has(word))
    .sort();
  expect(stale).toEqual([]);
});
