/** Which agent answers `/acp` on the dev server. */

import { describe, expect, test } from "bun:test";
import { agentBackend } from "../src/infra/agent-backend";

const TOKEN = "t".repeat(40);

describe("agentBackend", () => {
  test("with no agent named, the fake agent is mounted and nothing is proxied", () => {
    const backend = agentBackend({});
    expect(backend.plugins.map((p) => p.name)).toEqual(["labkit-fake-agent"]);
    expect(backend.proxy).toEqual({});
  });

  test("an empty agent URL counts as none", () => {
    expect(agentBackend({ LABKIT_ACP_AGENT_URL: "" }).plugins).toHaveLength(1);
  });

  test("a named agent's /acp and /blob/ are proxied to with the bearer token, and the fake is not mounted", () => {
    const backend = agentBackend({
      LABKIT_ACP_AGENT_URL: "http://127.0.0.1:8951",
      LABKIT_ACP_HTTP_TOKEN: TOKEN,
    });
    expect(backend.plugins).toEqual([]);
    for (const path of ["/acp", "/blob/"])
      expect(backend.proxy[path]).toMatchObject({
        target: "http://127.0.0.1:8951",
        headers: { authorization: `Bearer ${TOKEN}` },
      });
  });

  test("a named agent without a token is refused, and the message names both variables", () => {
    expect(() => agentBackend({ LABKIT_ACP_AGENT_URL: "http://127.0.0.1:8951" })).toThrow(
      /LABKIT_ACP_AGENT_URL.*LABKIT_ACP_HTTP_TOKEN/,
    );
  });
});
