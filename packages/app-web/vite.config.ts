import path from "node:path";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { labkitDev } from "./src/infra/dev-plugin";

const explorerPort = Number(process.env.LABKIT_PORT_EXPLORER ?? "8850");
const apiPort = Number(process.env.LABKIT_PORT_WEB ?? "8899");

// The paths the API server answers. Vite serves the browser app, and everything here goes to the
// API process instead, so a change to the routes in `src/server/handler.ts` is a change here.
const API_PATHS = /^\/(graph|collections|workspace|docs|sitemap\.xml|\.well-known|healthz)(\/|$)/;

const api = { target: `http://127.0.0.1:${apiPort}` };

export default defineConfig(({ command, isPreview }) => ({
  // The browser app is served under /app. Dev keeps Vite's own paths at the root, so only the
  // bundle is built for it, and the preview of that bundle serves it from the same place.
  base: command === "build" || isPreview ? "/app/" : "/",
  // The router plugin writes `src/routeTree.gen.ts` from `src/routes`, and must come before react().
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), labkitDev()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: explorerPort,
    strictPort: true,
    allowedHosts: ["labkit-central.framesift.ai"],
    proxy: {
      [API_PATHS.source]: api,
      // A bare `/` is the API's redirect for a client, and the browser app's for a browser.
      "^/$": {
        ...api,
        bypass: (req) =>
          String(req.headers.accept ?? "").includes("text/html") ? req.url : undefined,
      },
    },
  },
}));
