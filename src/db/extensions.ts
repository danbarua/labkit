/**
 * Every asset PGlite needs, embedded rather than looked up.
 *
 * **The second half of the same bug**, and the first half was hiding it. Both
 * extension packages locate their tarball with
 * `new URL("./age.tar.gz", import.meta.url)`, which inside a
 * `bun build --compile` bundle is `/$bunfs/root/age.tar.gz` — a path nothing
 * put a file at. PGlite gates on `fs.existsSync(bundlePath)` and throws
 * `Extension bundle not found`.
 *
 * Nobody had seen it because the binary died earlier, in `readMigrationFiles`,
 * for the same underlying reason: `import.meta.url` does not name a directory
 * on disk once the code is inside a bundle. Fixing the migrations moved the
 * failure one step later rather than removing it, which is the useful thing
 * that came out of running the binary rather than reasoning about it.
 *
 * The fix is small because the extension API is small: an extension is
 * `{ name, setup }`, and `setup` answers with the `bundlePath` PGlite should
 * read. So {@link embedded} delegates to the real `setup` and replaces only
 * that field. It spreads rather than reconstructs, so anything else those
 * packages start returning keeps working.
 *
 * **The tarballs are imported by relative path into `node_modules/`**, which is
 * ugly and is the only thing that works: `bun build` embeds a file it can see
 * statically, and `@electric-sql/pglite-age/dist/age.tar.gz` is not an exported
 * subpath. `import.meta.resolve` would answer at runtime, which is too late for
 * a bundler. If the packages ever export their bundle, this becomes a normal
 * specifier.
 *
 * Interpreted runs are unaffected: `bun run dev` and `bun test` get the real
 * on-disk path from the same import, so there is one code path rather than a
 * branch on how the program was started.
 *
 * **It was three assets, not one, and each was hidden behind the last.** The
 * binary died first in `readMigrationFiles`; fixing that revealed the extension
 * tarballs; fixing those revealed `pglite.data`. Same root cause every time —
 * `import.meta.url` does not name a directory on disk once the code is in a
 * bundle — and the only way to find them was to run the binary again after each
 * fix. {@link pgliteAssets} covers the third.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import type { Extension } from "@electric-sql/pglite";
import { age as ageExtension } from "@electric-sql/pglite-age";
import { vector as vectorExtension } from "@electric-sql/pglite-pgvector";

import initdbWasmPath from "../../node_modules/@electric-sql/pglite/dist/initdb.wasm" with {
  type: "file",
};
import fsBundlePath from "../../node_modules/@electric-sql/pglite/dist/pglite.data" with {
  type: "file",
};
import pgliteWasmPath from "../../node_modules/@electric-sql/pglite/dist/pglite.wasm" with {
  type: "file",
};
import agePath from "../../node_modules/@electric-sql/pglite-age/dist/age.tar.gz" with {
  type: "file",
};
import vectorPath from "../../node_modules/@electric-sql/pglite-pgvector/dist/vector.tar.gz" with {
  type: "file",
};

/**
 * Bun's virtual filesystem, where an embedded file lives in a compiled binary.
 *
 * Interpreted, the same import answers with the real `node_modules/` path, so
 * this prefix is the whole of the difference between the two.
 */
const BUNFS = "/$bunfs/";

/**
 * A path PGlite can *stream* from, materialising the file if it cannot.
 *
 * **The one asset that could not stay embedded, and the reason is specific.**
 * PGlite reads an extension bundle with `createReadStream` piped through
 * `zlib` — not `readFileSync` — and `$bunfs` does not implement streaming.
 * `existsSync` returns true and `open` then fails with `ENOENT`, which is a
 * confusing pair to debug and was the last of three layers of this bug.
 *
 * So the bytes are written once to a real temporary file and PGlite reads that.
 * Copied with `readFileSync`, which *does* work against `$bunfs` — checked, not
 * assumed. It is ~140KB per extension, once per process, and only in a compiled
 * binary: an interpreted run's path is already a real file and is used as-is.
 *
 * Yes, this is the runtime-I/O the migrations deliberately avoided. The
 * difference is that there it was avoidable and here it is not: drizzle hands
 * the SQL to the dialect as strings, and PGlite insists on a streamable path.
 */
function streamable(bundle: string): string {
  if (!bundle.startsWith(BUNFS)) return bundle;
  const out = join(tmpdir(), `labkit-${basename(bundle)}`);
  // Idempotent across processes: the contents are fixed at build time, so a
  // file already there is the file we would write.
  if (!existsSync(out)) writeFileSync(out, readFileSync(bundle));
  return out;
}

/**
 * The same extension, reading its bundle from where this build put it.
 */
function embedded(extension: Extension, bundle: string): Extension {
  return {
    ...extension,
    setup: async (pg, emscriptenOpts, clientOnly) => ({
      ...(await extension.setup(pg, emscriptenOpts, clientOnly)),
      bundlePath: new URL(`file://${streamable(bundle)}`),
    }),
  };
}

export const age = embedded(ageExtension, agePath);
export const vector = embedded(vectorExtension, vectorPath);

/**
 * The three core assets PGlite would otherwise locate for itself.
 *
 * `pglite.data` is the one that bit: PGlite opens it by a path derived from
 * `import.meta.url`, so a compiled binary asked for `/$bunfs/root/pglite.data`
 * and got `ENOENT` — surfacing as `Failed query: CREATE SCHEMA IF NOT EXISTS
 * "drizzle"` with the real cause two levels down, which is why this was found
 * by printing `error.cause` rather than by reading the message.
 *
 * `pgliteWasmModule` and `initdbWasmModule` are supplied for the same reason,
 * before they could fail the same way. Passing them is what the options exist
 * for — PGlite offers them precisely so a bundler can hand the bytes over.
 *
 * Read once per process and memoised: `WebAssembly.compile` is not free, and
 * `openPglite()` is called once per process in production and once per file in
 * the suite.
 */
let assets: Promise<{
  pgliteWasmModule: WebAssembly.Module;
  initdbWasmModule: WebAssembly.Module;
  fsBundle: Blob;
}> | null = null;

export function pgliteAssets() {
  assets ??= (async () => {
    const [pglite, initdb, data] = await Promise.all([
      Bun.file(pgliteWasmPath).arrayBuffer(),
      Bun.file(initdbWasmPath).arrayBuffer(),
      Bun.file(fsBundlePath).arrayBuffer(),
    ]);
    return {
      pgliteWasmModule: await WebAssembly.compile(pglite),
      initdbWasmModule: await WebAssembly.compile(initdb),
      fsBundle: new Blob([data]),
    };
  })();
  return assets;
}
