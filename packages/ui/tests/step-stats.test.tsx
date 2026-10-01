/** One model request's figures, drawn as a line under what it produced. */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { compactCount, StepStats, shortDuration, tokensPerSecond } from "../step-stats";

describe("a step's figures", () => {
  test("counts read as people say them", () => {
    expect([179, 2_200, 487_000, 11_200_000].map(compactCount)).toEqual([
      "179",
      "2.2K",
      "487K",
      "11M",
    ]);
    expect(compactCount(1_000)).toBe("1K");
  });

  test("durations read as people say them", () => {
    expect([400, 58_200, 61_000].map(shortDuration)).toEqual(["0.4s", "58.2s", "1m1s"]);
  });

  test("tokens a second count from the first token", () => {
    expect(
      tokensPerSecond({ startedAt: "", durationMs: 6_000, outputTokens: 100, firstTokenMs: 1_000 }),
    ).toBe(20);
    expect(
      tokensPerSecond({ startedAt: "", durationMs: 6_000, outputTokens: 100 }),
    ).toBeUndefined();
  });

  test("a figure the agent did not report is left out, and each says what it is", () => {
    const html = renderToStaticMarkup(
      <StepStats
        figures={{ startedAt: "2026-10-01T20:59:14Z", durationMs: 4_400, outputTokens: 95 }}
      />,
    );
    expect(html).toContain('title="Took"');
    expect(html).toContain('<span class="lk-sr-only">Tokens out </span>95');
    expect(html).not.toContain("Tokens in");
    expect(html).not.toContain("Tokens a second");
  });
});
