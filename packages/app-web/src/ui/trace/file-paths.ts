import { useEffect, useMemo } from "react";
import { collectionOf, FILE_TYPE, hrefOf, keyOf, linksOf } from "./hal";
import { docOf, requestPath, useDocument } from "./hal-store";

/** Every file's path at HEAD, from the files API's `paths`, and the key of each path's file. */
export interface FilePaths {
  readonly paths: readonly string[];
  /** The key of the file at `path`, from the listing's templated `file` link. */
  readonly keyOf: (path: string) => string | undefined;
  /** How many files the tree holds: more than `paths` when the API cut the list short. */
  readonly total: number;
}

/**
 * `template`, a link of RFC 6570's reserved form `…{+path}`, with `path` in it: each segment
 * percent-encoded and the slashes kept. Undefined when the template has no `{+path}`.
 */
export function expandPath(template: string, path: string): string | undefined {
  if (!template.includes("{+path}")) return undefined;
  return template.replace("{+path}", path.split("/").map(encodeURIComponent).join("/"));
}

/**
 * The paths the file collection at `filesKey` links as `paths`, asked for once `filesKey` is
 * known. A list the API cut short is used as it is, with a warning naming how many files it left
 * out, for `reader`, which says who asked.
 */
export function usePathsOf(filesKey: string | undefined, reader: string): FilePaths | undefined {
  const files = docOf(
    useDocument(filesKey === undefined ? undefined : requestPath(`${filesKey}?limit=1`)),
  );
  const pathsHref = files === undefined ? undefined : hrefOf(files, "paths");
  const listed = docOf(
    useDocument(pathsHref === undefined ? undefined : requestPath(keyOf(pathsHref))),
  );
  const result = useMemo((): FilePaths | undefined => {
    if (listed === undefined || !Array.isArray(listed.paths)) return undefined;
    const paths = listed.paths.filter((p): p is string => typeof p === "string");
    const template = linksOf(listed, "file")[0]?.href;
    return {
      paths,
      keyOf: (path) => {
        const href = template === undefined ? undefined : expandPath(template, path);
        return href === undefined ? undefined : keyOf(href);
      },
      total: typeof listed.total === "number" ? listed.total : paths.length,
    };
  }, [listed]);
  useEffect(() => {
    if (listed?.truncated === true)
      console.warn("file paths: the files API listed only some of the workspace's files", {
        reader,
        filesKey,
        listed: result?.paths.length,
        total: listed.total,
      });
  }, [listed, result, reader, filesKey]);
  return result;
}

/**
 * Every file's path at HEAD in the workspace `slug`: its index names its file collection, whose top
 * links `paths`. Nothing is asked for until `wanted`.
 */
export function useWorkspacePaths(
  slug: string,
  wanted: boolean,
  reader: string,
): FilePaths | undefined {
  const indexKey = `/workspace/${slug}`;
  const index = docOf(useDocument(wanted ? requestPath(indexKey) : undefined));
  const filesKey =
    index === undefined
      ? undefined
      : collectionOf(indexKey, index).items.find((item) => item.data.type === FILE_TYPE)?.key;
  return usePathsOf(filesKey, reader);
}
