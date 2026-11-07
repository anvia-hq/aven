import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// `/api` goes to the control plane, for the dev server and for `vite preview` (which e2e serves).
const proxy = {
  "/api": {
    target: process.env.API_URL ?? "http://localhost:8000",
    changeOrigin: true,
    // Runtimes connect to /api/runtimes/connect over a WebSocket.
    ws: true,
    rewrite: (path: string) => path.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy,
  },
  preview: {
    port: Number(process.env.WEB_PORT ?? 4173),
    strictPort: true,
    proxy,
  },
});
