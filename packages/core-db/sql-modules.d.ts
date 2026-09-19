/**
 * `.sql` files import as text.
 */
declare module "*.sql" {
  const contents: string;
  export default contents;
}

/**
 * `.tar.gz` files import as a path to the embedded file.
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
