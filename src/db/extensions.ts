/**
 * Every asset PGlite needs, embedded rather than looked up.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import type { Extension } from "@electric-sql/pglite";
import { age as ageExtension } from "@electric-sql/pglite-age";

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

/**
 * Bun's virtual filesystem, where an embedded file lives in a compiled binary.
 */
const BUNFS = "/$bunfs/";

/**
 * A path PGlite can *stream* from, materialising the file if it cannot.
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

/**
 * The three core assets PGlite would otherwise locate for itself.
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
