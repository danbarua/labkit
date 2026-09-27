import { Conversation } from "@labkit/ui";
import { RECORD_TYPES } from "./record-types";
import "@labkit/ui/ui.css";
import type { TranscriptState } from "@labkit/view-model";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bar } from "./Bar";
import { transcriptState } from "./transcripts-api";

type Theme = "system" | "light" | "dark";
type Loaded = { kind: "loading" } | { kind: "missing" } | { kind: "failed"; message: string };

// Passing handlers is what makes `Conversation` draw the composer and live config controls. They
// do nothing, so the page looks like a live session and never sends.
const inert = () => {};

/**
 * One recorded session from `@labkit/acp-transcripts`, full screen, drawn as a person using the
 * agent sees it: composer included, connected to nothing. Fetched fresh on every load, so a
 * hand-edited transcript shows on reload.
 */
export default function TranscriptMockup({ slug }: { slug: string }) {
  const [state, setState] = useState<TranscriptState | Loaded>({ kind: "loading" });
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    transcriptState(slug, controller.signal).then(
      (loaded) => {
        if (!controller.signal.aborted) setState(loaded ?? { kind: "missing" });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => controller.abort();
  }, [slug]);

  return (
    <>
      <Bar>
        <Link to="/gallery" className="crumb">
          gallery
        </Link>
        <code className="crumb">{slug}</code>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTheme(t)} disabled={theme === t}>
              {t}
            </button>
          ))}
        </span>
      </Bar>
      {"kind" in state ? (
        <div className="page">
          {state.kind === "loading" ? null : state.kind === "missing" ? (
            <p>
              No transcript named <code>{slug}</code>.{" "}
              <Link to="/gallery">Back to the gallery</Link>
            </p>
          ) : (
            <p>{state.message}</p>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <Conversation
            state={state}
            records={{ types: RECORD_TYPES }}
            onSend={inert}
            onCancel={inert}
            onAnswer={inert}
            onSetConfig={inert}
            {...(theme === "system" ? {} : { theme })}
          />
        </div>
      )}
    </>
  );
}
