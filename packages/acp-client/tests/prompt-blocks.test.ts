/** The blocks a prompt with files is sent as, for each form of file the agent advertises taking. */

import { describe, expect, test } from "bun:test";
import { attachmentUri, FileNotTaken, promptBlocks } from "../prompt-blocks";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

const BOTH = { image: true, embeddedContext: true };

describe("a prompt's files", () => {
  test("an image goes as an image block, its bytes in base64, when the agent takes images", async () => {
    const blocks = await promptBlocks(
      "what is this?",
      [new File([PNG], "a.png", { type: "image/png" })],
      BOTH,
    );
    expect(blocks).toEqual([
      { type: "text", text: "what is this?" },
      { type: "image", data: base64(PNG), mimeType: "image/png", uri: "attachment:///a.png" },
    ]);
  });

  test("a file with no media type whose bytes are text goes as embedded text, with no media type", async () => {
    const blocks = await promptBlocks("", [new File(["run,loss\n1,0.5\n"], "runs.csv")], BOTH);
    expect(blocks).toEqual([
      { type: "resource", resource: { uri: "attachment:///runs.csv", text: "run,loss\n1,0.5\n" } },
    ]);
  });

  test("a file whose bytes are not text goes as an embedded blob in base64, with its media type", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    const blocks = await promptBlocks(
      "",
      [new File([bytes], "paper.pdf", { type: "application/pdf" })],
      BOTH,
    );
    expect(blocks).toEqual([
      {
        type: "resource",
        resource: {
          uri: "attachment:///paper.pdf",
          mimeType: "application/pdf",
          blob: base64(bytes),
        },
      },
    ]);
  });

  test("an image goes as an embedded blob when the agent takes files but not images", async () => {
    const [block] = await promptBlocks("", [new File([PNG], "a.png", { type: "image/png" })], {
      embeddedContext: true,
    });
    expect(block).toEqual({
      type: "resource",
      resource: { uri: "attachment:///a.png", mimeType: "image/png", blob: base64(PNG) },
    });
  });

  test("a file the agent takes in no form rejects with FileNotTaken, naming the file and its type", async () => {
    const sent = promptBlocks("", [new File(["x"], "notes.md", { type: "text/markdown" })], {
      image: true,
    });
    await expect(sent).rejects.toBeInstanceOf(FileNotTaken);
    await expect(sent).rejects.toThrow("notes.md (text/markdown) was not sent");
  });

  test("a prompt of files alone has no text block; a prompt of text alone has one", async () => {
    const files = await promptBlocks("", [new File(["a"], "a.txt", { type: "text/plain" })], BOTH);
    expect(files.map((b) => b.type)).toEqual(["resource"]);
    expect(await promptBlocks("hi", [], {})).toEqual([{ type: "text", text: "hi" }]);
  });

  test("a name with a space and a non-ASCII character is percent-encoded as the URI's last segment", () => {
    const uri = attachmentUri("Δ loss.csv");
    expect(uri).toBe("attachment:///%CE%94%20loss.csv");
    expect(decodeURIComponent(uri.split("/").at(-1) ?? "")).toBe("Δ loss.csv");
  });
});
