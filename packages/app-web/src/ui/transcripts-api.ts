import { initialState, reduce, type TranscriptState, type ViewEvent } from "@labkit/view-model";

export interface TranscriptEntry {
  readonly id: string;
  readonly title: string;
}

/** `GET /transcripts`: `{id, title, description}` for each recorded session on disk. */
export async function transcriptList(signal: AbortSignal): Promise<TranscriptEntry[]> {
  const res = await fetch("/transcripts", { signal });
  return (await res.json()) as TranscriptEntry[];
}

/**
 * `GET /transcripts/:id`: the recorded session whole, folded into a state the same way a live one
 * is. Resolves to `undefined` when no transcript has that id.
 */
export async function transcriptState(
  id: string,
  signal: AbortSignal,
): Promise<TranscriptState | undefined> {
  const res = await fetch(`/transcripts/${encodeURIComponent(id)}`, { signal });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`GET /transcripts/${id} answered ${res.status}`);
  const { events } = (await res.json()) as { events: readonly ViewEvent[] };
  return events.reduce(reduce, initialState);
}
