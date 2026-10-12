import { describe, expect, test } from "bun:test";
import { fileUri, mentionedLinks, mentionItems } from "../src/ui/agent/mentions";

const items = mentionItems("/work/bonsai", [
  "README.md",
  "src/a.ts",
  "src/a.ts.bak",
  "notes/my plan.md",
]);

describe("a file mentioned in a message", () => {
  test("is linked by its file: URI in the agent's folder, each segment escaped", () => {
    expect(fileUri("/work/bonsai", "notes/my plan.md")).toBe(
      "file:///work/bonsai/notes/my%20plan.md",
    );
    expect(fileUri("/work/bonsai/", "README.md")).toBe("file:///work/bonsai/README.md");
  });

  test("each mentioned file is linked once, in the order first mentioned", () => {
    expect(mentionedLinks("see @src/a.ts and @README.md, then @src/a.ts again", items)).toEqual([
      { uri: "file:///work/bonsai/src/a.ts", name: "src/a.ts" },
      { uri: "file:///work/bonsai/README.md", name: "README.md" },
    ]);
  });

  test("the longer path wins: @src/a.ts.bak is not @src/a.ts", () => {
    expect(mentionedLinks("@src/a.ts.bak", items).map((l) => l.name)).toEqual(["src/a.ts.bak"]);
  });

  test("a path with a space is found, and a full stop that ends a sentence ends it", () => {
    expect(mentionedLinks("read @notes/my plan.md.", items).map((l) => l.name)).toEqual([
      "notes/my plan.md",
    ]);
  });

  test("an @word that names no file, or an @ inside a word, links nothing", () => {
    expect(mentionedLinks("ask @someone about me@README.md", items)).toEqual([]);
  });
});
