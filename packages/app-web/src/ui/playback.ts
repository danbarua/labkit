import { initialState, reduce, type TranscriptState, type ViewEvent } from "@labkit/view-model";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

/** A recorded session: its events, and when each arrived in ms from the first, when recorded. */
export interface Recording {
  readonly events: readonly ViewEvent[];
  readonly at?: readonly number[];
}

/** The longest a replay waits between two events, so a session's idle minutes play in a moment. */
export const LONGEST_WAIT_MS = 1500;
/** The wait between events of a recording with no arrival times. */
export const STEADY_WAIT_MS = 40;

/** How long to wait before applying event `index`, at `speed` times the recorded pace. */
export function stepDelay(recording: Recording, index: number, speed: number): number {
  const { at } = recording;
  if (at === undefined || index === 0) return at === undefined ? STEADY_WAIT_MS : 0;
  const gap = (at[index] ?? 0) - (at[index - 1] ?? 0);
  return Math.min(Math.max(0, gap) / speed, LONGEST_WAIT_MS);
}

type Step = { readonly state: TranscriptState; readonly applied: number };
type Action =
  | { type: "apply"; event: ViewEvent }
  | { type: "reset" }
  | { type: "all"; events: readonly ViewEvent[] };

function step(current: Step, action: Action): Step {
  if (action.type === "reset") return { state: initialState, applied: 0 };
  if (action.type === "all")
    return { state: action.events.reduce(reduce, initialState), applied: action.events.length };
  return { state: reduce(current.state, action.event), applied: current.applied + 1 };
}

/**
 * A recording shown whole, or played back an event at a time through the same reducer a live
 * client uses, at its recorded pace times `speed`.
 */
export function usePlayback(recording: Recording) {
  const [{ state, applied }, dispatch] = useReducer(step, recording, (r) =>
    step({ state: initialState, applied: 0 }, { type: "all", events: r.events }),
  );
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!playing) return;
    if (applied >= recording.events.length) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(
      () => dispatch({ type: "apply", event: recording.events[applied] as ViewEvent }),
      stepDelay(recording, applied, speed),
    );
    return () => clearTimeout(timer.current);
  }, [playing, applied, recording, speed]);

  const play = useCallback(() => {
    if (applied >= recording.events.length) dispatch({ type: "reset" });
    setPlaying(true);
  }, [applied, recording.events.length]);
  const pause = useCallback(() => setPlaying(false), []);
  const showAll = useCallback(() => {
    setPlaying(false);
    dispatch({ type: "all", events: recording.events });
  }, [recording.events]);

  return {
    state,
    applied,
    total: recording.events.length,
    playing,
    speed,
    setSpeed,
    play,
    pause,
    showAll,
  };
}
