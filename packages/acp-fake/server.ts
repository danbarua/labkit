import { AcpServer } from "@agentclientprotocol/sdk/experimental/server";
import { createFakeAgent, createFakeWorld, type FakeAgentOptions } from "./fake-agent";

/**
 * The fake agent behind the SDK's own server transport (Streamable HTTP and WebSocket). Route
 * requests to `handleRequest`, as a real agent's server would. Sessions live as long as the
 * server, across connections.
 */
export function createFakeAcpServer(options: FakeAgentOptions = {}): AcpServer {
  const world = createFakeWorld(options);
  return new AcpServer({ createAgent: () => createFakeAgent(world) });
}
