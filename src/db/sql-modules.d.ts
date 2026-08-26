/**
 * `.sql` files import as text.
 *
 * Bun resolves `import x from "./m.sql" with { type: "text" }` at build time and
 * embeds the contents; `tsc` needs telling separately, because the import
 * attribute is a runtime instruction and carries no type. Without this,
 * `bun run typecheck` fails on `src/db/migrations.ts` with TS2307 while the
 * code runs correctly — a disagreement between the two that says nothing about
 * the program.
 */
declare module "*.sql" {
  const contents: string;
  export default contents;
}

/**
 * `.tar.gz` files import as a path to the embedded file.
 *
 * `with { type: "file" }` asks Bun to carry the bytes into the bundle and hand
 * back a path that `node:fs` can read — `/$bunfs/root/…` in a compiled binary,
 * the real path when interpreted. See `src/db/extensions.ts`.
 */
declare module "*.tar.gz" {
  const path: string;
  export default path;
}

/** `.wasm` and `.data` import as paths, same as `.tar.gz`. */
declare module "*.wasm" {
  const path: string;
  export default path;
}

declare module "*.data" {
  const path: string;
  export default path;
}
