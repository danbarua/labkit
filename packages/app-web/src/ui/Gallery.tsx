import { FIXTURES } from "@labkit/acp-scenarios";
import { Conversation, type Theme, ThemeToggle } from "@labkit/ui";
import { RECORD_TYPES } from "./record-types";
import "@labkit/ui/ui.css";
import type { TranscriptState } from "@labkit/view-model";
import { stateOfFixture } from "@labkit/view-model/fixtures";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bar } from "./Bar";
import { BuildingBlocks } from "./BuildingBlocks";
import { type TranscriptEntry, transcriptList, transcriptState } from "./transcripts-api";

/**
 * Every state in the shared corpus drawn at once: the scripted scenarios in `@labkit/acp-scenarios`
 * (the surface to look at when a component changes, and what the tests assert on), and the real
 * sessions in `@labkit/acp-transcripts` (fetched fresh from disk on every load, so hand-editing one
 * of those files and reloading shows the change with no build). Handlers are wired to nothing, so
 * nothing here sends. A real session's title links to it full screen, composer included. The
 * shared overlay pieces and the composer come first, each live in a tile of its own.
 */
export default function Gallery() {
  const [entries, setEntries] = useState<readonly TranscriptEntry[]>(FIXTURES);
  const [states, setStates] = useState<Record<string, TranscriptState>>({});
  const [theme, setTheme] = useState<Theme>("system");
  const [recorded, setRecorded] = useState<ReadonlySet<string>>(new Set());
  // Why a card, or the list of recorded transcripts, could not be loaded, by id ("" for the list).
  const [failures, setFailures] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    const controller = new AbortController();
    // A request this page gave up on, leaving or remounting, is not a failure to show.
    const failed = (id: string) => (error: unknown) => {
      if (controller.signal.aborted) return;
      const reason = error instanceof Error ? error.message : String(error);
      setFailures((prev) => ({ ...prev, [id]: reason }));
    };
    for (const fixture of FIXTURES) {
      stateOfFixture(fixture).then((state) => {
        if (!controller.signal.aborted) setStates((prev) => ({ ...prev, [fixture.id]: state }));
      }, failed(fixture.id));
    }
    transcriptList(controller.signal).then((list) => {
      if (controller.signal.aborted) return;
      setEntries([...FIXTURES, ...list]);
      setRecorded(new Set(list.map(({ id }) => id)));
      for (const { id } of list) {
        transcriptState(id, controller.signal).then((state) => {
          if (controller.signal.aborted) return;
          if (state === undefined) failed(id)(new Error(`no transcript named ${id}`));
          else setStates((prev) => ({ ...prev, [id]: state }));
        }, failed(id));
      }
    }, failed(""));
    return () => controller.abort();
  }, []);

  return (
    <>
      <Bar>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <ThemeToggle theme={theme} onChange={setTheme} className="theme-toggle" />
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
        <BuildingBlocks theme={theme} />
        {failures[""] === undefined ? null : (
          <p role="alert" style={{ margin: 0, color: "var(--lk-danger)" }}>
            The recorded transcripts could not be listed: {failures[""]}
          </p>
        )}
        {entries.map((entry) => {
          const state = states[entry.id];
          return (
            <section key={entry.id} aria-label={entry.title}>
              <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>
                {recorded.has(entry.id) ? (
                  <Link to="/gallery/$slug" params={{ slug: entry.id }}>
                    {entry.title}
                  </Link>
                ) : (
                  entry.title
                )}{" "}
                <code style={{ color: "var(--text-dim)" }}>{entry.id}</code>
              </h3>
              <div style={{ height: 480, border: "1px solid var(--panel-border)" }}>
                {state === undefined ? (
                  failures[entry.id] === undefined ? null : (
                    <p role="alert" style={{ margin: 16, color: "var(--lk-danger)" }}>
                      Could not load this transcript: {failures[entry.id]}
                    </p>
                  )
                ) : (
                  <Conversation state={state} records={{ types: RECORD_TYPES }} theme={theme} />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
