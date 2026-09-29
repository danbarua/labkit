import { Conversation } from "@labkit/ui";
import { RECORD_TYPES } from "./record-types";
import "@labkit/ui/ui.css";
import type { TranscriptState } from "@labkit/view-model";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Bar } from "./Bar";
import { type Recording, usePlayback } from "./playback";
import { transcriptRecording } from "./transcripts-api";

type Theme = "system" | "light" | "dark";
type Loaded = { kind: "loading" } | { kind: "missing" } | { kind: "failed"; message: string };

// Passing handlers is what makes `Conversation` draw the composer and live config controls. They
// do nothing, so the page looks like a live session and never sends; a setting that is picked is
// shown as picked, as the agent's confirmation would.
const inert = () => {};

const SPEEDS = [1, 4, 16] as const;

function Page({
  slug,
  controls,
  children,
}: {
  slug: string;
  controls: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Bar>
        <code className="crumb">{slug}</code>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {controls}
        </span>
      </Bar>
      {children}
    </>
  );
}

/**
 * The session shown whole, or played back an event at a time at its recorded pace (idle gaps cut
 * short), through the same reducer a live client uses.
 */
function Replay({ slug, recording }: { slug: string; recording: Recording }) {
  // `?from=N` opens the session as it stood after N events, ready to play on from there.
  const from = Number(new URLSearchParams(window.location.search).get("from") ?? Number.NaN);
  const playback = usePlayback(recording, Number.isFinite(from) ? from : undefined);
  const [theme, setTheme] = useState<Theme>("system");
  const [picked, setPicked] = useState<ReadonlyMap<string, string | boolean>>(new Map());
  const state: TranscriptState = useMemo(
    () => ({
      ...playback.state,
      configOptions: playback.state.configOptions?.map((o) =>
        picked.has(o.id) ? ({ ...o, currentValue: picked.get(o.id) } as typeof o) : o,
      ),
    }),
    [playback.state, picked],
  );

  const controls = (
    <>
      <button type="button" onClick={playback.playing ? playback.pause : playback.play}>
        {playback.playing ? "pause" : playback.applied < playback.total ? "play" : "replay"}
      </button>
      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => playback.setSpeed(s)}
          disabled={playback.speed === s}
        >
          {s}×
        </button>
      ))}
      <button
        type="button"
        onClick={playback.showAll}
        disabled={playback.applied === playback.total}
      >
        end
      </button>
      <span className="dim" style={{ fontVariantNumeric: "tabular-nums", minWidth: 90 }}>
        {playback.applied} / {playback.total}
        {recording.at === undefined ? " · untimed" : ""}
      </span>
      {(["system", "light", "dark"] as const).map((t) => (
        <button key={t} type="button" onClick={() => setTheme(t)} disabled={theme === t}>
          {t}
        </button>
      ))}
    </>
  );

  return (
    <Page slug={slug} controls={controls}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Conversation
          state={state}
          records={{ types: RECORD_TYPES }}
          onSend={inert}
          onCancel={inert}
          onAnswer={inert}
          onMessageAction={inert}
          onSetConfig={(configId, value) => setPicked((prev) => new Map(prev).set(configId, value))}
          {...(theme === "system" ? {} : { theme })}
        />
      </div>
    </Page>
  );
}

/**
 * One recorded session from `@labkit/acp-transcripts`, full screen, drawn as a person using the
 * agent sees it: composer included, connected to nothing. Fetched fresh on every load, so a
 * hand-edited transcript shows on reload.
 */
export default function TranscriptMockup({ slug }: { slug: string }) {
  const [loaded, setLoaded] = useState<Recording | Loaded>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setLoaded({ kind: "loading" });
    transcriptRecording(slug, controller.signal).then(
      (recording) => {
        if (!controller.signal.aborted) setLoaded(recording ?? { kind: "missing" });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => controller.abort();
  }, [slug]);

  if (!("kind" in loaded)) return <Replay key={slug} slug={slug} recording={loaded} />;
  return (
    <Page slug={slug} controls={null}>
      <div className="page">
        {loaded.kind === "loading" ? null : loaded.kind === "missing" ? (
          <p>
            No transcript named <code>{slug}</code>. <Link to="/gallery">Back to the gallery</Link>
          </p>
        ) : (
          <p>{loaded.message}</p>
        )}
      </div>
    </Page>
  );
}
