import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";
import { openRepository, type Repository } from "es-git";

/** The git repository each workspace serves its files and history from, by workspace slug. */
export type Repositories = ReadonlyMap<string, Repository>;

/** `workspaces.local.json` beside this package's `package.json`, unless `LABKIT_WORKSPACES_FILE` names another. */
export function repositoriesFile(): string {
  return (
    process.env.LABKIT_WORKSPACES_FILE ??
    fileURLToPath(new URL("../../workspaces.local.json", import.meta.url))
  );
}

/**
 * The repositories the JSON object in `file` maps workspace slugs to: `{ "<slug>": "<folder>" }`,
 * where each folder is absolute or starts with `~/` (under `home`), and holds `.git`. A missing file maps no
 * workspace. An entry that is not a string, not absolute, or not a repository is left out with a
 * warning, and its workspace serves no files or history.
 */
export async function openRepositories(
  file: string,
  home: string = homedir(),
): Promise<Map<string, Repository>> {
  const repositories = new Map<string, Repository>();
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      console.info("workspace repositories: no mapping file; no workspace serves files", { file });
      return repositories;
    }
    console.warn("workspace repositories: the mapping file was not read", { file, err });
    return repositories;
  }
  let mapping: unknown;
  try {
    mapping = JSON.parse(text);
  } catch (err) {
    console.warn("workspace repositories: the mapping file is not JSON", { file, err });
    return repositories;
  }
  if (typeof mapping !== "object" || mapping === null || Array.isArray(mapping)) {
    console.warn("workspace repositories: the mapping file is not a JSON object", { file });
    return repositories;
  }
  for (const [slug, value] of Object.entries(mapping)) {
    if (typeof value !== "string") {
      console.warn("workspace repositories: skipped, the folder is not a string", { slug, value });
      continue;
    }
    const folder = value.startsWith("~/") ? join(home, value.slice(2)) : value;
    if (!isAbsolute(folder)) {
      console.warn("workspace repositories: skipped, the folder is not absolute", { slug, value });
      continue;
    }
    try {
      repositories.set(slug, await openRepository(folder, { noSearch: true }));
      console.info("workspace repositories: mapped", { slug, folder });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn("workspace repositories: skipped, not a git repository", {
        slug,
        folder,
        reason,
      });
    }
  }
  return repositories;
}
