/**
 * A clock you can wind, for tests about time.
 */

import type { Clock } from "../../src/domain";

export interface WindableClock extends Clock {
  /** Move forward by a duration. Negative values are rejected: a clock that can go backwards is a variable. */
  wind(ms: number): void;
  /** Jump to an explicit instant, for a test that reads better with dates than offsets. */
  windTo(iso: string): void;
  /** What it will return next, without advancing. */
  peek(): string;
}

const MINUTE = 60_000;

export function windableClock(start = "2026-01-01T00:00:00.000Z"): WindableClock {
  let t = Date.parse(start);
  if (Number.isNaN(t)) throw new Error(`windableClock: unparseable start "${start}"`);
  return {
    now: () => new Date(t).toISOString(),
    peek: () => new Date(t).toISOString(),
    wind(ms: number) {
      if (!Number.isFinite(ms) || ms < 0)
        throw new Error(`windableClock.wind: expected a non-negative duration, got ${ms}`);
      t += ms;
    },
    windTo(iso: string) {
      const next = Date.parse(iso);
      if (Number.isNaN(next)) throw new Error(`windableClock.windTo: unparseable "${iso}"`);
      if (next < t)
        throw new Error(
          `windableClock.windTo: ${iso} is before the current time ${new Date(t).toISOString()}`,
        );
      t = next;
    },
  };
}

/** Convenience for the common case: wind on a scale a reader can hold in their head. */
export const minutes = (n: number): number => n * MINUTE;
export const days = (n: number): number => n * 24 * 60 * MINUTE;
