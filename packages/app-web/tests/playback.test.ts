/** How long a replay waits before each recorded event. */

import { describe, expect, test } from "bun:test";
import type { ViewEvent } from "@labkit/view-model";
import { LONGEST_WAIT_MS, STEADY_WAIT_MS, stepDelay } from "../src/ui/playback";

const events = [{}, {}, {}, {}] as unknown as ViewEvent[];

describe("stepDelay", () => {
  test("waits the recorded gap before an event, divided by the speed", () => {
    const recording = { events, at: [0, 200, 1000, 1100] };
    expect(stepDelay(recording, 0, 1)).toBe(0);
    expect(stepDelay(recording, 1, 1)).toBe(200);
    expect(stepDelay(recording, 3, 4)).toBe(25);
  });

  test("cuts a long idle gap short", () => {
    expect(stepDelay({ events, at: [0, 600_000, 600_001, 600_002] }, 1, 1)).toBe(LONGEST_WAIT_MS);
  });

  test("a recording with no arrival times plays at a steady pace", () => {
    expect(stepDelay({ events }, 0, 1)).toBe(STEADY_WAIT_MS);
    expect(stepDelay({ events }, 2, 16)).toBe(STEADY_WAIT_MS);
  });
});
