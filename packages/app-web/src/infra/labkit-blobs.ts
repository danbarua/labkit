/**
 * labkit-effect's stored files over HTTP, for the page to draw what an agent links to as
 * `blob://<sha256>.<ext>`. `GET /blob/<sha256>.<ext>` answers the bytes with that id that a session
 * in `sessionsDir` stored, read through labkit-effect's own blob store, which checks the bytes
 * against the id. An id names the same bytes in every session, so the newest session that holds it
 * answers. The extension sets the Content-Type; a path without one is answered as bytes.
 */

import { BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import { sessionFolderOf, storedSessions } from "labkit-effect/src/agent-host/directory.ts";
import { Blobs, BlobsInFolder } from "labkit-effect/src/agent-session/blobs.ts";
import { BlobId } from "labkit-effect/src/agent-machine/blob.ts";

/** The path prefix the blob route answers under. */
export const blobPath = "/blob/";

/** `/blob/<64 lowercase hex digits>`, then an optional extension of letters and digits. */
const BLOB_PATH = /^\/blob\/([0-9a-f]{64})(?:\.([A-Za-z0-9]{1,16}))?$/;

/** The media type for a file name's extension, as Bun serves files; `application/octet-stream` for one it does not know. */
const mediaTypeOf = (extension: string | undefined): string =>
  extension === undefined ? "application/octet-stream" : Bun.file(`blob.${extension}`).type;

/**
 * The bytes are the agent's and the person's, not this site's: a browser that opens one as a page
 * runs it sandboxed with nothing allowed, and never guesses a type other than the one sent.
 * The id is the SHA-256 of the bytes, so a response never changes.
 */
const HEADERS = {
  "Content-Security-Policy": "sandbox; default-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, max-age=31536000, immutable",
};

/** The bytes with `id` from the newest session in `sessionsDir` that holds them, or undefined. */
const stored = (sessionsDir: string, id: BlobId) =>
  Effect.gen(function* () {
    const sessions = yield* storedSessions(sessionsDir);
    for (const { sessionId } of sessions) {
      const folder = `${sessionFolderOf(sessionsDir, sessionId)}/blobs`;
      const bytes = yield* Effect.gen(function* () {
        return yield* (yield* Blobs).read(id);
      }).pipe(Effect.provide(BlobsInFolder(folder)));
      if (bytes !== undefined) return { bytes, sessionId, searched: sessions.length };
    }
    return { bytes: undefined, searched: sessions.length };
  });

/**
 * Answers a request under `blobPath`: 200 with the bytes, 404 for a path that names no blob or a
 * blob no session holds, 405 for a method other than GET or HEAD. Each 404 is logged as a warning.
 */
export function labkitBlobs(sessionsDir: string): (request: Request) => Promise<Response> {
  return (request) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const path = new URL(request.url).pathname;
        if (request.method !== "GET" && request.method !== "HEAD")
          return new Response("Method Not Allowed", {
            status: 405,
            headers: { Allow: "GET, HEAD" },
          });
        const named = BLOB_PATH.exec(path);
        if (named?.[1] === undefined) {
          yield* Effect.logWarning("agent-http.blob.not-found", {
            path,
            reason: "the path is not /blob/<sha256>[.<extension>]",
          });
          return new Response("Not Found", { status: 404 });
        }
        const id = BlobId.make(named[1]);
        const found = yield* stored(sessionsDir, id);
        if (found.bytes === undefined) {
          yield* Effect.logWarning("agent-http.blob.not-found", {
            path,
            sessionsDir,
            sessionsSearched: found.searched,
            reason: "no session holds a blob with this id",
          });
          return new Response("Not Found", { status: 404 });
        }
        // A copy, so the body is backed by an ArrayBuffer as `Response` requires.
        const body = request.method === "HEAD" ? null : found.bytes.slice();
        return new Response(body, {
          headers: { ...HEADERS, "Content-Type": mediaTypeOf(named[2]) },
        });
      }).pipe(Effect.provide(BunServices.layer)),
    );
}
