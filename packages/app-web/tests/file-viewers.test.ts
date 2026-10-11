import { describe, expect, test } from "bun:test";
import { resolveInRepository, viewerOf } from "../src/ui/trace/git-views";

describe("how a file is shown", () => {
  test("is chosen by its media type", () => {
    const shown = [
      "text/markdown",
      "application/json",
      "application/yaml",
      "text/x-python",
      "text/html",
      "image/png",
      "image/svg+xml",
      "application/pdf",
      "application/octet-stream",
      "",
    ].map((type) => [type, viewerOf(type)]);
    expect(shown).toEqual([
      ["text/markdown", "markdown"],
      ["application/json", "code"],
      ["application/yaml", "code"],
      ["text/x-python", "code"],
      ["text/html", "code"],
      ["image/png", "image"],
      ["image/svg+xml", "image"],
      ["application/pdf", "pdf"],
      ["application/octet-stream", "bytes"],
      ["", "bytes"],
    ]);
  });
});

describe("an address in a markdown file", () => {
  const raw = "http://127.0.0.1:8899/workspace/alpha/raw/docs/guide.md";
  const atCommit = "http://127.0.0.1:8899/workspace/alpha/commit/abc/raw/docs/guide.md";

  test("that is relative resolves against the file, on the page's own origin", () => {
    expect(resolveInRepository("../pixel.png", raw, "docs/guide.md")).toBe(
      "/workspace/alpha/raw/pixel.png",
    );
    expect(resolveInRepository("img/a.png", raw, "docs/guide.md")).toBe(
      "/workspace/alpha/raw/docs/img/a.png",
    );
  });

  test("that starts with a slash resolves against the repository's root", () => {
    expect(resolveInRepository("/pixel.png", raw, "docs/guide.md")).toBe(
      "/workspace/alpha/raw/pixel.png",
    );
    expect(resolveInRepository("/pixel.png", atCommit, "docs/guide.md")).toBe(
      "/workspace/alpha/commit/abc/raw/pixel.png",
    );
    expect(resolveInRepository("/b.md", "/workspace/alpha/file/a.md", "a.md")).toBe(
      "/workspace/alpha/file/b.md",
    );
  });
});
