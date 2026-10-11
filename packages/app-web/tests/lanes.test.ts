import { describe, expect, test } from "bun:test";
import { lanesOf, widthOf } from "../src/ui/trace/lanes";

const c = (id: string, ...parents: string[]) => ({ id, parents });

describe("the timeline's lanes", () => {
  test("a straight history is one lane, each commit joined to the one before", () => {
    const rows = lanesOf([c("c", "b"), c("b", "a"), c("a")]);
    expect(rows.map((r) => [r.lane, r.fromAbove, r.out])).toEqual([
      [0, false, [0]],
      [0, true, [0]],
      [0, true, []],
    ]);
    expect(widthOf(rows)).toBe(1);
  });

  test("a merge opens a second lane for its second parent, which joins the first at their fork", () => {
    // m merges b into a; both branched from base.
    const rows = lanesOf([c("m", "a", "b"), c("a", "base"), c("b", "base"), c("base")]);
    expect(rows.map((r) => [r.lane, r.out, r.through])).toEqual([
      [0, [0, 1], []],
      [0, [0], [1]],
      // b's parent is already expected in lane 0, so b's line joins it there.
      [1, [0], [0]],
      [0, [], []],
    ]);
    expect(widthOf(rows)).toBe(2);
  });

  test("two branch tips forked from one commit take two lanes that meet at it", () => {
    const rows = lanesOf([c("x", "p"), c("y", "p"), c("p")]);
    expect(rows.map((r) => [r.lane, r.fromAbove, r.out])).toEqual([
      [0, false, [0]],
      // y is a tip no child expects: a new lane, joining lane 0's line to p.
      [1, false, [0]],
      [0, true, []],
    ]);
  });

  test("no two lanes run to the same commit, whatever the merges and forks", () => {
    const history = [
      c("m2", "m1", "f"),
      c("f", "a"),
      c("m1", "a", "b"),
      c("b", "base"),
      c("a", "base"),
      c("base"),
    ];
    for (const row of lanesOf(history)) {
      // The lanes running past a row, and the one the commit is in, are all different lanes.
      const occupied = [row.lane, ...row.through];
      expect(new Set(occupied).size).toBe(occupied.length);
    }
  });

  test("a freed lane is reused by the next line that needs one", () => {
    const rows = lanesOf([c("x", "p"), c("y", "p"), c("p", "q"), c("z", "q"), c("q")]);
    // After y joins lane 0, lane 1 is free again; z, a new tip, takes it.
    expect(rows[3]?.lane).toBe(1);
  });
});
