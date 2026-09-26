import type { Plugin } from "vite";

/**
 * Mounts the fake ACP agent at `/acp` on the dev server, so the browser app has an agent to talk
 * to without a second process. It applies to `vite` (serve) only, and loads the agent only then:
 * `vite build` reads this config under plain Node, which cannot load the workspace's TypeScript.
 */
export function fakeAgent(): Plugin {
  return {
    name: "labkit-fake-agent",
    apply: "serve",
    async configureServer(server) {
      const [{ createNodeHttpHandler }, { createFakeAcpServer }] = await Promise.all([
        import("@agentclientprotocol/sdk/experimental/node"),
        import("@labkit/acp-fake"),
      ]);
      server.middlewares.use("/acp", createNodeHttpHandler(createFakeAcpServer()));
    },
  };
}
