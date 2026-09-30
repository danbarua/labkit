import { defineTool } from "@labkit/core-agent";
import type { Tool } from "@labkit/core-agent/host";
import { surfacesOver, type WithSurfaces } from "@labkit/app-mcp/server";
import { TOOLS, WRITE_TOOLS } from "@labkit/app-mcp/tools";
import { type SessionRegistry, sessionRegistry } from "@labkit/core-domain/context";
import { z } from "zod";

/** The prefix a research verb carries in the agent's tool list, so it cannot collide with a workspace tool. */
export const LABKIT_TOOL_PREFIX = "labkit_";

/**
 * The research verbs as tools the agent calls directly, built from the same declarations the MCP
 * server registers: the names, descriptions and input schemas are those. Reads are offered as
 * `read` tools; every write is `other`, which the session's permission policy asks about.
 *
 * The session is the ACP session, whose id the runtime supplies with each call, so the writes are
 * attributed to it without a `register_session` call, and that tool is not offered. Build one set
 * per session: the attribution is held in a registry the set owns. `surfaces` defaults to the
 * record of `tenant`; a test passes its own.
 */
export function labkitTools(options: {
  /** The labkit workspace (tenant slug) the tools read and write. */
  readonly tenant: string;
  /** Builds the scope each call runs in, given the registry that names the session. */
  readonly surfaces?: (session: SessionRegistry) => WithSurfaces;
}): ReadonlyMap<string, Tool> {
  const registry = sessionRegistry();
  const withSurfaces =
    options.surfaces?.(registry) ?? surfacesOver({ tenant: options.tenant }, registry);

  /** Names the ACP session as the author of whatever this call writes. */
  const attribute = (sessionId: string | undefined, tool: string): void => {
    if (sessionId === undefined) {
      throw new Error(`${tool} was called without an ACP session id, so it cannot be attributed`);
    }
    if (registry.registered()?.id !== sessionId) {
      registry.register(`agent session ${sessionId}`, sessionId);
    }
  };

  const tools = new Map<string, Tool>();
  for (const definition of TOOLS) {
    tools.set(
      LABKIT_TOOL_PREFIX + definition.name,
      defineTool({
        input: z.object(definition.inputSchema),
        description: definition.description,
        kind: "read",
        run: async (args) => withSurfaces(({ read }) => definition.handler(read, args)),
      }),
    );
  }
  for (const definition of WRITE_TOOLS) {
    tools.set(
      LABKIT_TOOL_PREFIX + definition.name,
      defineTool({
        input: z.object(definition.inputSchema),
        description: definition.description,
        kind: "other",
        run: async (args, _signal, context) => {
          attribute(context?.sessionId, definition.name);
          return withSurfaces(({ write }) => definition.handler(write, args));
        },
      }),
    );
  }
  return tools;
}
