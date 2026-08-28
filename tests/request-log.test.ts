/**
 * The failed-request log: what it keeps, what it cuts, and what it must never
 * do to a caller.
 *
 * The subject is a diagnostic, so its own failure modes are the interesting
 * ones — a logger that throws on its input, or hangs on a cyclic object, turns
 * a reported error into an unreported one.
 */

import { describe, expect, test } from "bun:test";
import { logFailedRequest, truncated } from "../src/request-log";

describe("truncated", () => {
  test("a short string is untouched — handles and instants must stay whole", () => {
    expect(truncated("CLM_1")).toBe("CLM_1");
    expect(truncated("2026-08-27T12:00:00.000Z")).toBe("2026-08-27T12:00:00.000Z");
  });

  test("a long string is cut and says how long it was", () => {
    const prose = "x".repeat(500);
    const out = truncated(prose) as string;
    expect(out.length).toBeLessThan(prose.length);
    // The original length is kept, so nothing is elided silently.
    expect(out).toContain("(500 chars)");
  });

  test("structure survives, because the shape names the verb", () => {
    const request = {
      concludes: [{ proposition: "p".repeat(300), finding: "f" }],
      held_to: ["CRIT_1"],
    };
    const out = truncated(request) as typeof request;
    expect(out.held_to).toEqual(["CRIT_1"]);
    expect(out.concludes[0]!.finding).toBe("f");
    expect(out.concludes[0]!.proposition).toContain("(300 chars)");
  });

  test("non-strings are left alone", () => {
    expect(truncated({ n: 4, b: true, z: null })).toEqual({ n: 4, b: true, z: null });
  });

  test("a cycle does not hang it", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(() => truncated(a)).not.toThrow();
    expect((truncated(a) as { self: unknown }).self).toBe("[circular]");
  });

  test("depth is bounded", () => {
    let deep: unknown = "bottom";
    for (let i = 0; i < 30; i++) deep = { down: deep };
    expect(() => truncated(deep)).not.toThrow();
    expect(JSON.stringify(truncated(deep))).toContain("[deep]");
  });
});

describe("logFailedRequest", () => {
  /** Captures stderr for one call. */
  function captured(work: () => void): string {
    const original = process.stderr.write.bind(process.stderr);
    let seen = "";
    process.stderr.write = ((chunk: string) => {
      seen += chunk;
      return true;
    }) as typeof process.stderr.write;
    try {
      work();
    } finally {
      process.stderr.write = original;
    }
    return seen;
  }

  test("writes one line of JSON naming the request and the error", () => {
    const line = captured(() =>
      logFailedRequest({ adapter: "cli", argv: ["why", "CLM_9"] }, new Error("no claim CLM_9")),
    );
    expect(line.trim().split("\n")).toHaveLength(1);
    const parsed = JSON.parse(line) as {
      labkit: string;
      request: { argv: string[] };
      error: { message: string; name: string };
    };
    expect(parsed.labkit).toBe("request-failed");
    expect(parsed.request.argv).toEqual(["why", "CLM_9"]);
    expect(parsed.error.message).toBe("no claim CLM_9");
    expect(parsed.error.name).toBe("Error");
  });

  test("a SQLSTATE survives, which is what unwrapped() exists to preserve", () => {
    const err = Object.assign(new Error("duplicate key"), { code: "23505" });
    const parsed = JSON.parse(captured(() => logFailedRequest({}, err))) as {
      error: { code?: string };
    };
    expect(parsed.error.code).toBe("23505");
  });

  test("a thrown non-Error is still reported rather than swallowed", () => {
    const parsed = JSON.parse(captured(() => logFailedRequest({}, "just a string"))) as {
      error: { message: string };
    };
    expect(parsed.error.message).toBe("just a string");
  });

  test("it writes to stderr and never to stdout", () => {
    const original = process.stdout.write.bind(process.stdout);
    let stdout = "";
    process.stdout.write = ((chunk: string) => {
      stdout += chunk;
      return true;
    }) as typeof process.stdout.write;
    try {
      captured(() => logFailedRequest({ argv: ["x"] }, new Error("boom")));
    } finally {
      process.stdout.write = original;
    }
    // The whole of a write command's stdout is an id the next command consumes.
    expect(stdout).toBe("");
  });
});
