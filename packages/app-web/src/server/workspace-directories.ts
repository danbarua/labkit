import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The folder on this machine each workspace is, by workspace slug: the folder whose files and git
 * history the web app shows, and the folder the agent opens a session in.
 */
export type WorkspaceDirectories = ReadonlyMap<string, string>;

/** `workspaces.local.json` beside this package's `package.json`, unless `LABKIT_WORKSPACES_FILE` names another. */
export function workspacesFile(): string {
  return (
    process.env.LABKIT_WORKSPACES_FILE ??
    fileURLToPath(new URL("../../workspaces.local.json", import.meta.url))
  );
}

/**
 * The folders the JSON object in `file` maps workspace slugs to: `{ "<slug>": "<folder>" }`, where
 * each folder is absolute or starts with `~/` (under `home`). A missing file maps no workspace. An
 * entry that is not a string or not absolute is left out with a warning, and its workspace has no
 * folder.
 */
export async function readWorkspaceDirectories(
  file: string,
  home: string = homedir(),
): Promise<Map<string, string>> {
  const directories = new Map<string, string>();
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      console.info("workspace directories: no mapping file; no workspace has a folder", { file });
      return directories;
    }
    console.warn("workspace directories: the mapping file was not read", { file, err });
    return directories;
  }
  let mapping: unknown;
  try {
    mapping = JSON.parse(text);
  } catch (err) {
    console.warn("workspace directories: the mapping file is not JSON", { file, err });
    return directories;
  }
  if (typeof mapping !== "object" || mapping === null || Array.isArray(mapping)) {
    console.warn("workspace directories: the mapping file is not a JSON object", { file });
    return directories;
  }
  for (const [slug, value] of Object.entries(mapping)) {
    if (typeof value !== "string") {
      console.warn("workspace directories: skipped, the folder is not a string", { slug, value });
      continue;
    }
    const folder = value.startsWith("~/") ? join(home, value.slice(2)) : value;
    if (!isAbsolute(folder)) {
      console.warn("workspace directories: skipped, the folder is not absolute", { slug, value });
      continue;
    }
    directories.set(slug, folder);
  }
  return directories;
}
