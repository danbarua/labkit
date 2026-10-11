/**
 * The media type a committed file is served as, from its extension. The API owns this table; a
 * page picks how to show a file from the `media_type` the file's resource carries, never from its
 * extension.
 */
const BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  html: "text/html",
  htm: "text/html",
  pdf: "application/pdf",
  yaml: "application/yaml",
  yml: "application/yaml",
  toml: "application/toml",
  txt: "text/plain",
  py: "text/x-python",
  js: "text/javascript",
  ts: "text/x-typescript",
};

/**
 * The media type of the file at `path`: by its extension, or, for an extension the table does not
 * name, `text/plain` for a text file and `application/octet-stream` for a binary one, by git's own
 * test of its content.
 */
export function mediaTypeOf(path: string, binary: boolean): string {
  const extension = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase();
  const known = extension === undefined ? undefined : BY_EXTENSION[extension];
  return known ?? (binary ? "application/octet-stream" : "text/plain");
}
