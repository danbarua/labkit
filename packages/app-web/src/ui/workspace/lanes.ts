/**
 * Where each commit of a history goes in a `git log --graph` style drawing: one column, a lane,
 * per line of development, with lines between a commit and its parents. The history is newest
 * first and never lists a parent before its child.
 */

/** How one commit's row is drawn, by lane index. */
export interface LaneRow {
  /** The lane the commit's dot is in. */
  lane: number;
  /** Whether a line runs down into the dot from the row above, from one of its children. */
  fromAbove: boolean;
  /** Lanes the lines to the commit's parents run down in: its first parent's, then the others'. */
  out: number[];
  /** Lanes whose lines pass the row without touching the commit. */
  through: number[];
}

/** The first lane no line is in, or a new one past the last. */
function free(lanes: (string | null)[]): number {
  const i = lanes.indexOf(null);
  return i === -1 ? lanes.length : i;
}

/**
 * The rows for `commits`. A lane holds the id of the commit its line runs down to. A commit no
 * child expects is a branch's tip and starts a line in a free lane. Its first parent continues in
 * its lane, unless another lane already runs to that parent, when the line joins that lane at
 * this row; each other parent, of a merge, runs in the lane that already expects it or in a new
 * one. So no two lanes ever run to the same commit, and only one line enters a dot from above.
 */
export function lanesOf(commits: readonly { id: string; parents: readonly string[] }[]): LaneRow[] {
  const lanes: (string | null)[] = [];
  const rows: LaneRow[] = [];
  for (const commit of commits) {
    const expected = lanes.indexOf(commit.id);
    const lane = expected === -1 ? free(lanes) : expected;
    const through = lanes.flatMap((id, i) => (id !== null && id !== commit.id ? [i] : []));
    if (expected !== -1) lanes[expected] = null;
    const out: number[] = [];
    commit.parents.forEach((parent, k) => {
      const already = lanes.indexOf(parent);
      if (already !== -1) out.push(already);
      else {
        const into = k === 0 ? lane : free(lanes);
        lanes[into] = parent;
        out.push(into);
      }
    });
    rows.push({ lane, fromAbove: expected !== -1, out, through });
    while (lanes.length > 0 && lanes.at(-1) === null) lanes.pop();
  }
  return rows;
}

/** How many lanes any of `rows` reaches: the width the drawing needs. */
export function widthOf(rows: readonly LaneRow[]): number {
  let width = 0;
  for (const row of rows)
    width = Math.max(
      width,
      row.lane + 1,
      ...row.out.map((i) => i + 1),
      ...row.through.map((i) => i + 1),
    );
  return width;
}
