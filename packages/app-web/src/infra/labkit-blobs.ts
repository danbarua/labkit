/**
 * labkit-effect's stored files over HTTP, for the page to draw what an agent links to as
 * `blob://<sha256>.<ext>`. `GET /blob/<sha256>.<ext>` returns the bytes the agent stored under that
 * name, read through labkit-effect's own blob store, which checks the bytes against the id. The
 * store reads the brand's blobs folder, which every session shares, then the `blobs/` folder of each
 * session in the sessions folder, where a session kept its blobs before there was a shared folder.
 * The extension sets the Content-Type; a path without one returns `application/octet-stream`.
 */

import { BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import { sessionFolderOf, storedSessions } from "labkit-effect/src/agent-host/directory.ts";
import type { BlobId } from "labkit-effect/src/agent-machine/blob.ts";
import { Blobs, BlobsInFolder, parseBlobUri } from "labkit-effect/src/agent-session/blobs.ts";

/** The path prefix the blob route answers under. */
export const blobPath = "/blob/";

/** Where the agent keeps the files its sessions stored. */
export interface BlobFolders {
  /** The brand's blobs folder (labkit-effect's `blobsFolderOf`), shared by every session. */
  readonly blobs: string;
  /** The sessions folder the agent was started with (`--sessions-dir`). */
  readonly sessions: string;
}

/** The media type for an extension, as Bun serves files; `application/octet-stream` for none or one it does not know. */
const mediaTypeOf = (extension: string): string =>
  extension === "" ? "application/octet-stream" : Bun.file(`blob.${extension}`).type;

/**
 * On every response: the bytes are the agent's and the person's, not this site's, so a browser
 * that opens one as a page runs it sandboxed with nothing allowed, and never guesses a type other
 * than the one sent.
 */
const HEADERS = {
  "Content-Security-Policy": "sandbox; default-src 'none'",
  "X-Content-Type-Options": "nosniff",
};

/** On a 200 only: the id is the SHA-256 of the bytes, so the bytes found for it never change. */
const FOUND = { "Cache-Control": "private, max-age=31536000, immutable" };

const notFound = () => new Response("Not Found", { status: 404, headers: HEADERS });

/** The bytes named `<id>.<extension>` in `folders`, or undefined, with how many sessions' folders were searched. */
const stored = (folders: BlobFolders, id: BlobId, extension: string) =>
  Effect.gen(function* () {
    const sessions = yield* storedSessions(folders.sessions);
    const readAlso = sessions.map(
      ({ sessionId }) => `${sessionFolderOf(folders.sessions, sessionId)}/blobs`,
    );
    const bytes = yield* Effect.gen(function* () {
      return yield* (yield* Blobs).read(id, extension);
    }).pipe(Effect.provide(BlobsInFolder(folders.blobs, readAlso)));
    return { bytes, sessionsSearched: sessions.length };
  });

/**
 * Answers a request under `blobPath`: 200 with the bytes, 404 for a path that names no blob or a
 * blob the folders do not hold, 405 for a method other than GET or HEAD. Each 404 is logged as a
 * warning.
 */
export function labkitBlobs(folders: BlobFolders): (request: Request) => Promise<Response> {
  return (request) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const path = new URL(request.url).pathname;
        if (request.method !== "GET" && request.method !== "HEAD")
          return new Response("Method Not Allowed", {
            status: 405,
            headers: { ...HEADERS, Allow: "GET, HEAD" },
          });
        const pointer = path.startsWith(blobPath)
          ? parseBlobUri(`blob://${path.slice(blobPath.length)}`)
          : undefined;
        if (pointer === undefined) {
          yield* Effect.logWarning("agent-http.blob.not-found", {
            path,
            reason: "the path is not /blob/<sha256>[.<extension>]",
          });
          return notFound();
        }
        const found = yield* stored(folders, pointer.id, pointer.extension);
        if (found.bytes === undefined) {
          yield* Effect.logWarning("agent-http.blob.not-found", {
            path,
            blobsFolder: folders.blobs,
            sessionsFolder: folders.sessions,
            sessionsSearched: found.sessionsSearched,
            reason: "no file with this id and extension in the blobs folder or a session's blobs/",
          });
          return notFound();
        }
        // A copy, so the body is backed by an ArrayBuffer as `Response` requires.
        const body = request.method === "HEAD" ? null : found.bytes.slice();
        return new Response(body, {
          headers: { ...HEADERS, ...FOUND, "Content-Type": mediaTypeOf(pointer.extension) },
        });
      }).pipe(Effect.provide(BunServices.layer)),
    );
}
