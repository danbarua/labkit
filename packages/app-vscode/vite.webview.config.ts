import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Builds the chat webview: @labkit/ui's Conversation, fed by the extension host over
 * postMessage instead of HTTP. Asset names are fixed (no content hash) so the extension can
 * reference them without parsing Vite's own HTML output; the extension writes its own HTML
 * shell with VS Code's required CSP and nonce.
 */
export default defineConfig({
  root: "webview",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist/webview",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
        chunkFileNames: "main.js",
        assetFileNames: "main.[ext]",
      },
    },
  },
});
