import { FIXTURES } from "@labkit/acp-scenarios";
import { Conversation } from "@labkit/ui";
import { RECORD_TYPES } from "./record-types";
import "@labkit/ui/ui.css";
import { initialState, reduce, type TranscriptState, type ViewEvent } from "@labkit/view-model";
import { stateOfFixture } from "@labkit/view-model/fixtures";
import { useEffect, useState } from "react";
import { Bar } from "./Bar";

type Theme = "system" | "light" | "dark";

interface Entry {
  readonly id: string;
  readonly title: string;
}

/** `GET /transcripts`: `{id, title, description}` for each recorded session on disk. */
async function transcriptList(signal: AbortSignal): Promise<Entry[]> {
  const res = await fetch("/transcripts", { signal });
  return (await res.json()) as Entry[];
}

/** `GET /transcripts/:id`: the recorded session whole, folded into a state the same way a live one is. */
async function transcriptState(id: string, signal: AbortSignal): Promise<TranscriptState> {
  const res = await fetch(`/transcripts/${id}`, { signal });
  const { events } = (await res.json()) as { events: readonly ViewEvent[] };
  return events.reduce(reduce, initialState);
}

/**
 * Every state in the shared corpus drawn at once: the scripted scenarios in `@labkit/acp-scenarios`
 * (the surface to look at when a component changes, and what the tests assert on), and the real
 * sessions in `@labkit/acp-transcripts` (fetched fresh from disk on every load, so hand-editing one
 * of those files and reloading shows the change with no build). Handlers are wired to nothing, so
 * nothing here sends.
 */
export default function Gallery() {
  const [entries, setEntries] = useState<readonly Entry[]>(FIXTURES);
  const [states, setStates] = useState<Record<string, TranscriptState>>({});
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(FIXTURES.map(async (f) => [f.id, await stateOfFixture(f)] as const)).then(
      (loaded) => {
        if (!controller.signal.aborted)
          setStates((prev) => ({ ...prev, ...Object.fromEntries(loaded) }));
      },
    );
    transcriptList(controller.signal).then((list) => {
      if (controller.signal.aborted) return;
      setEntries([...FIXTURES, ...list]);
      for (const { id } of list) {
        transcriptState(id, controller.signal).then((state) => {
          if (!controller.signal.aborted) setStates((prev) => ({ ...prev, [id]: state }));
        });
      }
    });
    return () => controller.abort();
  }, []);

  return (
    <>
      <Bar>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTheme(t)} disabled={theme === t}>
              {t}
            </button>
          ))}
        </span>
      </Bar>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: 16,
          display: "grid",
          gap: 20,
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 520px), 1fr))",
          alignContent: "start",
        }}
      >
        {entries.map((entry) => {
          const state = states[entry.id];
          return (
            <section key={entry.id} aria-label={entry.title}>
              <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>
                {entry.title} <code style={{ color: "var(--text-dim)" }}>{entry.id}</code>
              </h3>
              <div style={{ height: 480, border: "1px solid var(--panel-border)" }}>
                {state === undefined ? null : (
                  <Conversation
                    state={state}
                    records={{ types: RECORD_TYPES }}
                    {...(theme === "system" ? {} : { theme })}
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
