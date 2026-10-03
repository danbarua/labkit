import { Conversation, ThemeToggle } from "@labkit/ui";
import { RECORD_TYPES } from "./record-types";
import "@labkit/ui/ui.css";
import type { TranscriptState } from "@labkit/view-model";
import { type ReactNode, useMemo, useState } from "react";
import { Bar } from "./Bar";
import { type Recording, usePlayback } from "./playback";
import { useSavedTheme } from "./saved-theme";

// Passing handlers is what makes `Conversation` draw the composer and live config controls. They
// do nothing, so the page looks like a live session and never sends; a setting that is picked is
// shown as picked, as the agent's confirmation would.
const inert = () => {};

const SPEEDS = [1, 4, 16] as const;

export function Page({
  crumb,
  controls,
  children,
}: {
  crumb: string;
  controls: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Bar>
        <code className="crumb">{crumb}</code>
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
export function Replay({ crumb, recording }: { crumb: string; recording: Recording }) {
  // `?from=N` opens the session as it stood after N events, ready to play on from there.
  const from = Number(new URLSearchParams(window.location.search).get("from") ?? Number.NaN);
  const playback = usePlayback(recording, Number.isFinite(from) ? from : undefined);
  const [theme, setTheme] = useSavedTheme();
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
        {recording.at === undefined ? " · no times recorded" : ""}
      </span>
      <ThemeToggle theme={theme} onChange={setTheme} className="theme-toggle" />
    </>
  );

  return (
    <Page crumb={crumb} controls={controls}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Conversation
          state={state}
          records={{ types: RECORD_TYPES }}
          onSend={inert}
          onCancel={inert}
          onAnswer={inert}
          onMessageAction={inert}
          attach={{ maxFiles: 4, maxBytes: 5 * 1024 * 1024 }}
          onSetConfig={(configId, value) => setPicked((prev) => new Map(prev).set(configId, value))}
          theme={theme}
        />
      </div>
    </Page>
  );
}
