/**
 * How File Explorer draws a listed file: an icon, and a kind its colour is chosen by
 * (`--f-<kind>` in workspace.css), by the media type the listing names. The page never reads a
 * file's extension; a listed file whose extension the API's table does not name has no media type
 * and gets the plain file icon.
 */

import {
  FileCodeIcon,
  FileCsvIcon,
  FileHtmlIcon,
  FileIcon,
  FileImageIcon,
  FileIniIcon,
  FileJpgIcon,
  FileJsIcon,
  FileMdIcon,
  FilePdfIcon,
  FilePngIcon,
  FilePyIcon,
  FileSvgIcon,
  FileTsIcon,
  FileTxtIcon,
  type Icon,
} from "@phosphor-icons/react";

export type FileKind =
  | "markdown"
  | "json"
  | "config"
  | "python"
  | "javascript"
  | "typescript"
  | "table"
  | "html"
  | "image"
  | "pdf"
  | "text"
  | "other";

export interface FileLook {
  icon: Icon;
  kind: FileKind;
}

const BY_MEDIA_TYPE: Readonly<Record<string, FileLook>> = {
  "text/markdown": { icon: FileMdIcon, kind: "markdown" },
  "application/json": { icon: FileCodeIcon, kind: "json" },
  "application/yaml": { icon: FileIniIcon, kind: "config" },
  "application/toml": { icon: FileIniIcon, kind: "config" },
  "text/x-python": { icon: FilePyIcon, kind: "python" },
  "text/javascript": { icon: FileJsIcon, kind: "javascript" },
  "text/x-typescript": { icon: FileTsIcon, kind: "typescript" },
  "text/csv": { icon: FileCsvIcon, kind: "table" },
  "text/tab-separated-values": { icon: FileCsvIcon, kind: "table" },
  "text/html": { icon: FileHtmlIcon, kind: "html" },
  "image/png": { icon: FilePngIcon, kind: "image" },
  "image/jpeg": { icon: FileJpgIcon, kind: "image" },
  "image/svg+xml": { icon: FileSvgIcon, kind: "image" },
  "application/pdf": { icon: FilePdfIcon, kind: "pdf" },
  "text/plain": { icon: FileTxtIcon, kind: "text" },
};

const IMAGE: FileLook = { icon: FileImageIcon, kind: "image" };
const OTHER: FileLook = { icon: FileIcon, kind: "other" };

/** The look of a file of `mediaType`, or of one the listing names no media type for. */
export function fileLook(mediaType: string | undefined): FileLook {
  if (mediaType === undefined) return OTHER;
  return BY_MEDIA_TYPE[mediaType] ?? (mediaType.startsWith("image/") ? IMAGE : OTHER);
}
