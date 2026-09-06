/**
 * The priority order in `verdictOf`, asserted directly.
 *
 * A claim can be withdrawn *and* challenged, or challenged *and* held to a
 * standard it does not meet, so which arm wins is a decision rather than a
 * consequence. It used to be made twice — once in the CLI's `renderWhy` and
 * once in `explain` — over `supported: boolean` and the fields beside it, and
 * the two orders were not the same set: `explain` had no arm for a synthesis
 * or for a finding that settles nothing, so both came back as "nothing has
 * examined it".
 */

import { describe, expect, test } from "bun:test";
import { verdictOf, type Verdict } from "../src/domain/report";

/** Nothing examined, nothing withdrawn, nothing owed: the empty claim. */
const nothing = {
  support: [] as unknown[],
  withdrawn: false,
  unmet: [] as unknown[],
  undecided: false,
  challenged: false,
  drawnAcross: [] as unknown[],
};
const finding = ["a finding"];
const check = ["a check"];

describe("verdictOf", () => {
  test("each state is reachable, and by the fact that names it", () => {
    const cases: Array<[Verdict, Partial<typeof nothing>]> = [
      ["supported", { support: finding }],
      ["undecided", { support: finding, undecided: true }],
      ["withdrawn", { support: finding, withdrawn: true }],
      ["challenged", { challenged: true }],
      ["drawn-across", { drawnAcross: finding }],
      ["standard-unmet", { support: finding, unmet: check }],
      ["unexamined", {}],
    ];
    for (const [expected, of] of cases) {
      expect(verdictOf({ ...nothing, ...of })).toBe(expected);
    }
  });

  test("supported wins over challenged: evidence against a supported claim is what `against` is for", () => {
    expect(verdictOf({ ...nothing, support: finding, challenged: true })).toBe("supported");
  });

  test("undecided beats withdrawn beats challenged", () => {
    const both = { ...nothing, support: finding, withdrawn: true, challenged: true };
    expect(verdictOf({ ...both, undecided: true })).toBe("undecided");
    expect(verdictOf(both)).toBe("withdrawn");
    // Without support of its own, so `supported` does not claim it first.
    expect(verdictOf({ ...both, withdrawn: false, support: [] })).toBe("challenged");
  });

  test("a synthesis that acquired evidence of its own is judged on it, not on its basis", () => {
    // `drawn-across` declines the verdict because a synthesis measured
    // nothing. One that has support is no longer that case.
    expect(verdictOf({ ...nothing, drawnAcross: finding, support: finding })).toBe("supported");
  });

  test("the two the boolean could not tell apart", () => {
    // Evidence held to a standard it fails is not evidence nobody has looked
    // for, and a single bit cannot say which of the two a claim is.
    expect(verdictOf({ ...nothing, support: finding, unmet: check })).toBe("standard-unmet");
    expect(verdictOf(nothing)).toBe("unexamined");
  });
});
