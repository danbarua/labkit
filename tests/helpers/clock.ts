/**
 * A clock you can wind, for tests about time.
 *
 * The consumer probes were written against `{ now: () => "2026-08-20T09:00:00.000Z" }`
 * and `docs/consumer-contract/024_vertical_slice_results.md` called that "a
 * pinned clock", concluding the harness *structurally* could not evaluate
 * whether row Z's ordering can be derived from durable state.
 *
 * That was wrong twice. A constant function is not a clock, it is a frozen
 * value with a call signature; and the limitation was the fixture's, not the
 * harness's. Winding is all it takes.
 *
 * It matters more than a fixture usually would, because a frozen clock makes
 * every durable stamp identical — so it hides which stamps exist. Wound, the
 * question becomes answerable by observation: of the six places a verb reads
 * the clock, exactly one reaches the graph (`CriterionEvaluation.evaluated_at`);
 * the other five reach only the event stream, which is not durable state.
 *
 * Three clocks, three jobs, and picking the wrong one quietly weakens a test:
 *
 * - **frozen** — every stamp identical. Right when a read must not be able to
 *   separate two worlds by wall-clock, which is what the paired-world probes
 *   need: a read that distinguishes them only because time passed has
 *   distinguished the test runs, not the research states.
 * - **auto-advancing** (`tick++`, as the PJ-008 scenarios use) — right when a
 *   test needs distinct stamps but does not care what they are.
 * - **windable** (here) — right when the *interval* is the subject: when a test
 *   must place two acts at stated times and ask what the record can recover.
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
