import { FileIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

/** What a composer accepts as attachments. Without these a composer takes no files. */
export interface AttachLimits {
  /** Media types or extensions, as a file input's `accept`: `image/*`, `.csv`. Every type if unset. */
  readonly accept?: readonly string[];
  readonly maxFiles?: number;
  readonly maxBytes?: number;
}

/** A size in the unit a person reads it in. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

const accepts = (file: { name: string; type: string }, accept: readonly string[]): boolean =>
  accept.some((pattern) =>
    pattern.startsWith(".")
      ? file.name.toLowerCase().endsWith(pattern.toLowerCase())
      : pattern.endsWith("/*")
        ? file.type.startsWith(pattern.slice(0, -1))
        : file.type === pattern,
  );

/**
 * Which of `adding` join the `current` attachments under `limits`, and why each of the rest does
 * not: the wrong type, too large, or past the most allowed, in the words the composer shows.
 */
export function admit<F extends { name: string; type: string; size: number }>(
  current: readonly F[],
  adding: readonly F[],
  limits: AttachLimits,
): { accepted: F[]; refused: string[] } {
  const accepted: F[] = [];
  const refused: string[] = [];
  for (const file of adding) {
    if (limits.accept && !accepts(file, limits.accept))
      refused.push(`${file.name} is not a type this accepts (${limits.accept.join(", ")})`);
    else if (limits.maxBytes !== undefined && file.size > limits.maxBytes)
      refused.push(
        `${file.name} is ${formatBytes(file.size)}; the most is ${formatBytes(limits.maxBytes)}`,
      );
    else if (limits.maxFiles !== undefined && current.length + accepted.length >= limits.maxFiles)
      refused.push(`${file.name} was left out: at most ${limits.maxFiles} files`);
    else accepted.push(file);
  }
  return { accepted, refused };
}

/** The files chosen for the next message, and what was refused when some were added. */
export function useAttachments(limits: AttachLimits | undefined) {
  const [files, setFiles] = useState<readonly File[]>([]);
  const [refused, setRefused] = useState<readonly string[]>([]);
  return {
    files,
    refused,
    add: (adding: readonly File[]) => {
      if (limits === undefined || adding.length === 0) return;
      const result = admit(files, adding, limits);
      setFiles([...files, ...result.accepted]);
      setRefused(result.refused);
    },
    remove: (index: number) => {
      setFiles(files.filter((_, i) => i !== index));
      setRefused([]);
    },
    clear: () => {
      setFiles([]);
      setRefused([]);
    },
  };
}

function Preview({ file }: { file: File }) {
  const url = useMemo(
    () => (file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined),
    [file],
  );
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return url ? (
    <img className="lk-attachment-thumb" src={url} alt="" />
  ) : (
    <FileIcon className="lk-attachment-icon" aria-hidden="true" />
  );
}

/** The files waiting to go with the next message, each with a way to take it out. */
export function AttachmentChips({
  files,
  refused,
  onRemove,
}: {
  files: readonly File[];
  refused: readonly string[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0 && refused.length === 0) return null;
  return (
    <div className="lk-attachments">
      {files.length === 0 ? null : (
        <ul aria-label="Attachments">
          {files.map((file, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the same file can be added twice
            <li key={i} className="lk-attachment">
              <Preview file={file} />
              <span className="lk-attachment-name">{file.name}</span>
              <span className="lk-attachment-size">{formatBytes(file.size)}</span>
              <button
                type="button"
                className="lk-icon-btn"
                aria-label={`Remove ${file.name}`}
                title="Remove"
                onClick={() => onRemove(i)}
              >
                <XIcon aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {refused.map((reason) => (
        <p key={reason} className="lk-attachment-refused" role="alert">
          {reason}
        </p>
      ))}
    </div>
  );
}
