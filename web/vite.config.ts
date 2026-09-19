import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { labkitDev } from "./src/infra/dev-plugin";

const explorerPort = Number(process.env.LABKIT_PORT_EXPLORER ?? "8850");

export default defineConfig({
  plugins: [react(), labkitDev()],
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
  },
});
