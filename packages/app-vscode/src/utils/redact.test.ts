import { expect, test } from "bun:test";
import { redactDiagnostics } from "./redact";

test("redaction targets credentials and preserves diagnostic details including exact-key echoes", () => {
  const output = redactDiagnostics(
    {
      path: "/workspace/auth/token.ts",
      maxOutputTokens: 4096,
      tokenUsage: { output: 3000 },
      url: "https://example.invalid/messages?api_key=secret-value&model=sonnet",
      body: "Provider rejected key arbitrary-provider-credential: invalid account scope",
      headers: new Headers({ "x-api-key": "secret-value", "request-id": "req-5" }),
      cause: new Error("failure details"),
    },
    ["arbitrary-provider-credential"],
  );
  const serialized = JSON.stringify(output);
  for (const detail of [
    "/workspace/auth/token.ts",
    "4096",
    "3000",
    "model=sonnet",
    "invalid account scope",
    "req-5",
    "failure details",
  ]) {
    expect(serialized).toContain(detail);
  }
  expect(serialized).not.toContain("secret-value");
  expect(serialized).not.toContain("arbitrary-provider-credential");
  const cyclic: Record<string, unknown> = {};
  cyclic.cause = cyclic;
  expect(redactDiagnostics(cyclic)).toEqual({ cause: "[Circular]" });
});
