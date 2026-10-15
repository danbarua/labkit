import {
  ClockIcon,
  DatabaseIcon,
  GaugeIcon,
  HourglassMediumIcon,
  type Icon,
  SignInIcon,
  SignOutIcon,
  TimerIcon,
} from "@phosphor-icons/react";
import { compactCount, shortDuration } from "../base/format";

/**
 * What one model request in a turn cost and how fast it ran, as the agent reports it. Every
 * figure but the start and the duration is optional: a provider may not report it.
 */
export interface StepFigures {
  /** When the request was sent, as an ISO 8601 date-time. */
  readonly startedAt: string;
  /** From sending the request to its last token. */
  readonly durationMs: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  /** Input tokens read from the provider's prompt cache. */
  readonly cacheReadTokens?: number;
  /** From sending the request to its first token. */
  readonly firstTokenMs?: number;
}

/**
 * Output tokens a second, counted from the first token: the speed of the stream itself, apart
 * from the wait before it. `undefined` without the figures to work it out.
 */
export function tokensPerSecond(figures: StepFigures): number | undefined {
  const { outputTokens, firstTokenMs, durationMs } = figures;
  if (outputTokens === undefined || firstTokenMs === undefined) return undefined;
  const streaming = (durationMs - firstTokenMs) / 1000;
  return streaming > 0 ? outputTokens / streaming : undefined;
}

/**
 * One model request's figures as a single muted line: when it started, how long it took, tokens
 * in, out and from the cache, time to the first token, and tokens a second. Each figure is an
 * icon and a number, with its name as the hover text and for screen readers. A figure the agent
 * did not report is left out.
 */
export function StepStats({ figures }: { figures: StepFigures }) {
  const rate = tokensPerSecond(figures);
  const count = (n: number | undefined) => (n === undefined ? undefined : compactCount(n));
  const items: [Icon, string, string | undefined][] = [
    [ClockIcon, "Started", new Date(figures.startedAt).toLocaleTimeString([], { hour12: false })],
    [TimerIcon, "Took", shortDuration(figures.durationMs)],
    [SignInIcon, "Tokens in", count(figures.inputTokens)],
    [SignOutIcon, "Tokens out", count(figures.outputTokens)],
    [DatabaseIcon, "From the cache", count(figures.cacheReadTokens)],
    [
      HourglassMediumIcon,
      "First token after",
      figures.firstTokenMs === undefined ? undefined : shortDuration(figures.firstTokenMs),
    ],
    [GaugeIcon, "Tokens a second", rate === undefined ? undefined : `${rate.toFixed(1)}/s`],
  ];
  return (
    <p className="lk-step-stats">
      {items.map(([Glyph, name, value]) =>
        value === undefined ? null : (
          <span key={name} title={name}>
            <Glyph aria-hidden="true" />
            <span className="lk-sr-only">{name} </span>
            {value}
          </span>
        ),
      )}
    </p>
  );
}
