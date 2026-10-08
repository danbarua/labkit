/**
 * The content blocks a prompt is sent as: its text, then each attached file in the form the agent
 * advertises in `promptCapabilities`. An `image/*` file is an `image` block when the agent takes
 * images. Any other file, and an image the agent takes only as a file, is an embedded `resource`
 * when the agent takes embedded context: `text` when the bytes are text, `blob` otherwise.
 * A browser gives a file's name and no path, so each block's `uri` is `attachment:///<name>`;
 * an agent takes the file's name from the last segment of the URI.
 */

import type * as acp from "@agentclientprotocol/sdk";

/** What a prompt needs of a file: a browser's `File` has all of it. */
export type PromptFile = Pick<File, "name" | "type" | "arrayBuffer">;

/** A file the agent takes in no form: it advertises neither images of its type nor embedded files. */
export class FileNotTaken extends Error {
  constructor(
    readonly file: string,
    readonly mediaType: string,
  ) {
    super(
      `${file} (${mediaType === "" ? "no media type" : mediaType}) was not sent: the agent does not advertise taking it as an image or as an embedded file`,
    );
  }
}

/** The URI a block names an attached file by. */
export const attachmentUri = (name: string): string => `attachment:///${encodeURIComponent(name)}`;

/** Base64 of `bytes`, converted in slices so a large file does not overflow the argument list. */
function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * The bytes as text when they are valid UTF-8 with no NUL byte, as git also tells text from binary.
 * Browsers give an empty media type for many text files (`.csv`, `.md`, `.ts`), so the type
 * cannot decide this.
 */
function textIn(bytes: Uint8Array): string | undefined {
  if (bytes.includes(0)) return undefined;
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return undefined;
  }
}

async function blockFor(
  file: PromptFile,
  takes: acp.PromptCapabilities,
): Promise<acp.ContentBlock> {
  const asImage = takes.image === true && file.type.startsWith("image/");
  if (!asImage && takes.embeddedContext !== true) throw new FileNotTaken(file.name, file.type);
  const uri = attachmentUri(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (asImage) return { type: "image", data: base64Of(bytes), mimeType: file.type, uri };
  // A file whose media type the browser does not know is sent without one; the agent decides.
  const mimeType = file.type === "" ? {} : { mimeType: file.type };
  const text = textIn(bytes);
  return {
    type: "resource",
    resource:
      text === undefined ? { uri, ...mimeType, blob: base64Of(bytes) } : { uri, ...mimeType, text },
  };
}

/**
 * The blocks for `text` and `files`, in that order. A prompt of files alone has no text block.
 * Rejects with `FileNotTaken` for a file the agent takes in no form, so no file is left out.
 */
export async function promptBlocks(
  text: string,
  files: readonly PromptFile[],
  takes: acp.PromptCapabilities,
): Promise<acp.ContentBlock[]> {
  const attached = await Promise.all(files.map((file) => blockFor(file, takes)));
  const said: acp.ContentBlock[] =
    text === "" && attached.length > 0 ? [] : [{ type: "text", text }];
  return [...said, ...attached];
}
