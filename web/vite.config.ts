import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = process.env.LABKIT_PORT_WEB ?? "8899";
const uiPort = Number(process.env.LABKIT_PORT_UI ?? "5173");
const api = `http://127.0.0.1:${apiPort}`;

const collections = [
  "/questions",
  "/enquiries",
  "/evidence-units",
  "/evidence",
  "/claims",
  "/decisions",
  "/criteria",
  "/evaluations",
  "/gates",
  "/reviews",
  "/artefacts",
  "/computations",
  "/tasks",
  "/notes",
  "/healthz",
] as const;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: uiPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: api,
        rewrite: (p) => (p === "/api" || p === "/api/" ? "/" : p.replace(/^\/api/, "")),
      },
      ...Object.fromEntries(collections.map((prefix) => [prefix, api])),
    },
  },
});
