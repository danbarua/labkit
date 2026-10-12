import type { Plugin } from "vite";
import { readWorkspaceDirectories, workspacesFile } from "../server/workspace-directories";

/** Where the browser asks for a workspace's folder: `GET /agent-workspace/<slug>`. */
export const AGENT_WORKSPACE_PATH = "/agent-workspace";

/**
 * Answers `GET /agent-workspace/<slug>` on the dev server with `{ "cwd": "<folder>" }`: the folder
 * the workspaces mapping file (`workspacesFile`) maps the workspace to, which the browser sends to
 * the agent as the session's working folder. A workspace the file does not map is a workspace with
 * no folder, not a missing resource: it is answered `{ "cwd": null, "reason": "…" }`. The file is
 * read on each request, so an edit needs no restart. The agent exists only in the dev server, so
 * this does too.
 */
export function workspaceFolders(): Plugin {
  return {
    name: "labkit-workspace-folders",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(AGENT_WORKSPACE_PATH, async (req, res) => {
        const slug = decodeURIComponent((req.url ?? "").replace(/^\//, "").replace(/[?#].*$/, ""));
        const answer = (status: number, body: object) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "GET" || slug === "" || slug.includes("/")) {
          answer(404, { error: `no workspace named in ${req.method} ${req.originalUrl}` });
          return;
        }
        const file = workspacesFile();
        const cwd = (await readWorkspaceDirectories(file)).get(slug);
        if (cwd === undefined) {
          answer(200, { cwd: null, reason: `${file} maps no folder to the workspace ${slug}` });
          return;
        }
        answer(200, { cwd });
      });
    },
  };
}
