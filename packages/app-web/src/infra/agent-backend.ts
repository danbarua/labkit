import type { Plugin, ProxyOptions } from "vite";
import { fakeAgent } from "./fake-agent-plugin";

/** What serves `/acp` on the dev server. */
export interface AgentBackend {
  plugins: Plugin[];
  proxy: Record<string, ProxyOptions>;
}

/**
 * `/acp` goes to the real agent when `LABKIT_ACP_AGENT_URL` names one, and to the built-in fake
 * agent otherwise. The agent's HTTP host requires a bearer token and sends no CORS headers, so
 * the proxy adds the token to each request from `LABKIT_ACP_HTTP_TOKEN` and page script never
 * holds it. A URL without a token is refused at startup rather than proxied to answer 401.
 */
export function agentBackend(env: NodeJS.ProcessEnv): AgentBackend {
  const url = env.LABKIT_ACP_AGENT_URL;
  if (url === undefined || url === "") return { plugins: [fakeAgent()], proxy: {} };

  const token = env.LABKIT_ACP_HTTP_TOKEN;
  if (token === undefined || token === "") {
    throw new Error(
      `LABKIT_ACP_AGENT_URL is ${url} but LABKIT_ACP_HTTP_TOKEN is not set: the agent's HTTP host rejects every request without its token`,
    );
  }
  return {
    plugins: [],
    proxy: {
      "/acp": { target: url, changeOrigin: false, headers: { authorization: `Bearer ${token}` } },
    },
  };
}
