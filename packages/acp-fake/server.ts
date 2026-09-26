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

/**
 * A `fetch` that delivers to `server` in this process, so a client can reach it with no port
 * open. The client still speaks the real transport; only the socket is missing.
 */
export function inProcessFetch(server: AcpServer): typeof fetch {
  const deliver = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    server.handleRequest(
      input instanceof Request ? new Request(input, init) : new Request(String(input), init),
    );
  return Object.assign(deliver, { preconnect: () => {} });
}
