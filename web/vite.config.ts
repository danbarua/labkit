import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = "http://127.0.0.1:8899";

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
    port: 5173,
    proxy: {
      "/api": {
        target: api,
        rewrite: (p) => (p === "/api" || p === "/api/" ? "/" : p.replace(/^\/api/, "")),
      },
      ...Object.fromEntries(collections.map((prefix) => [prefix, api])),
    },
  },
});
