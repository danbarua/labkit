/** Files attached to the next message: which are taken, and why the rest are not. */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { admit, formatBytes, MessageAttachments } from "../attachments";
import { UserMessage } from "../blocks";
import { Composer } from "../composer";
import { LinksContext } from "../links";

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

describe("a sent message's files", () => {
  const png = {
    type: "image" as const,
    data: "iVBORw0K",
    mimeType: "image/png",
    uri: "attachment:///a%20b.png",
  };
  const csv = {
    type: "resource" as const,
    resource: { uri: "attachment:///runs.csv", text: "run,loss\n" },
  };

  test("an image is drawn from its bytes, named by the end of its URI", () => {
    const html = renderToStaticMarkup(<MessageAttachments content={[png]} />);
    expect(html).toContain('src="data:image/png;base64,iVBORw0K"');
    expect(html).toContain('alt="a b.png"');
  });

  test("an embedded file is its name and size", () => {
    const html = renderToStaticMarkup(<MessageAttachments content={[csv]} />);
    expect(html).toContain("runs.csv");
    expect(html).toContain("9 B");
  });

  test("an image that only links to its bytes is its name until the host resolves the link", () => {
    const linked = { ...png, data: "", uri: "blob://abc.png" };
    expect(renderToStaticMarkup(<MessageAttachments content={[linked]} />)).not.toContain("<img");
    const resolved = renderToStaticMarkup(
      <LinksContext.Provider value={(uri) => uri.replace("blob://", "/blob/")}>
        <MessageAttachments content={[linked]} />
      </LinksContext.Provider>,
    );
    expect(resolved).toContain('src="/blob/abc.png"');
  });

  test("a message of files alone has no empty text box", () => {
    const html = renderToStaticMarkup(
      <UserMessage block={{ kind: "user", id: "user:0", content: [csv] }} />,
    );
    expect(html).not.toContain("lk-user");
    expect(html).toContain("runs.csv");
  });
});
