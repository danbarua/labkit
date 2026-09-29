/** Files attached to the next message: which are taken, and why the rest are not. */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { admit, formatBytes } from "../attachments";
import { Composer } from "../composer";

const file = (name: string, type: string, size: number) => ({ name, type, size });

describe("which files are taken", () => {
  test("a file of a type not accepted is refused, naming what is", () => {
    const { accepted, refused } = admit([], [file("run.csv", "text/csv", 10)], {
      accept: ["image/*", ".pdf"],
    });
    expect(accepted).toEqual([]);
    expect(refused).toEqual(["run.csv is not a type this accepts (image/*, .pdf)"]);
  });

  test("types match by media type, by family, or by extension", () => {
    const limits = { accept: ["image/*", ".csv", "application/pdf"] };
    const { accepted } = admit(
      [],
      [file("a.png", "image/png", 1), file("b.CSV", "", 1), file("c.pdf", "application/pdf", 1)],
      limits,
    );
    expect(accepted.map((f) => f.name)).toEqual(["a.png", "b.CSV", "c.pdf"]);
  });

  test("a file over the size limit is refused with both sizes", () => {
    const { refused } = admit([], [file("big.pdf", "application/pdf", 12 * 1024 * 1024)], {
      maxBytes: 10 * 1024 * 1024,
    });
    expect(refused).toEqual(["big.pdf is 12 MB; the most is 10 MB"]);
  });

  test("past the most files, the rest are left out, counting those already attached", () => {
    const { accepted, refused } = admit(
      [file("one", "", 1)],
      [file("two", "", 1), file("three", "", 1)],
      { maxFiles: 2 },
    );
    expect(accepted.map((f) => f.name)).toEqual(["two"]);
    expect(refused).toEqual(["three was left out: at most 2 files"]);
  });

  test("sizes read in the unit a person uses", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1536 * 1024)).toBe("1.5 MB");
  });
});

describe("the composer's paperclip", () => {
  test("is there only when the composer takes files", () => {
    const without = renderToStaticMarkup(<Composer running={false} onSend={() => {}} />);
    expect(without).not.toContain("Attach files");
    const withFiles = renderToStaticMarkup(
      <Composer running={false} onSend={() => {}} attach={{ accept: ["image/*"], maxFiles: 3 }} />,
    );
    expect(withFiles).toContain('aria-label="Attach files"');
    expect(withFiles).toContain('accept="image/*"');
  });
});
