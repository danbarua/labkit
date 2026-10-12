import { describe, expect, test } from "bun:test";
import { foldersAbove } from "../src/ui/trace/explorers";

describe("the folders File Explorer opens above an open file", () => {
  test("are each directory between the tree's top and the file, top first", () => {
    expect(foldersAbove("/workspace/a/file", "/workspace/a/file/notes/2026/plan.md")).toEqual([
      "/workspace/a/file/notes",
      "/workspace/a/file/notes/2026",
    ]);
  });

  test("are none for a file at the top, or for anything outside the tree", () => {
    expect(foldersAbove("/workspace/a/file", "/workspace/a/file/README.md")).toEqual([]);
    expect(foldersAbove("/workspace/a/file", "/workspace/a/commit/abc/file/notes/x.md")).toEqual(
      [],
    );
    expect(foldersAbove("/workspace/a/file", "/workspace/a/Q_1")).toEqual([]);
  });
});
