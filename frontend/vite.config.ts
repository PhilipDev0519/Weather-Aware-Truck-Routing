import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The config runs in Node; this is all of `process` it needs.
declare const process: { env: Record<string, string | undefined> };

// In production Django serves the built files under /static/. On Vercel they're
// served from the site root instead, and only /api goes to Django.
export default defineConfig(({ command }) => ({
  base: command === "build" && !process.env.VERCEL ? "/static/" : "/",
  plugins: [react()],
  server: {
    // Bind IPv4 explicitly: on some Windows setups "localhost" resolves to ::1
    // only, and the browser then gets ERR_CONNECTION_REFUSED.
    host: "127.0.0.1",
    port: 5173,
    // Where Django runs; override with API_URL if port 8000 is taken.
    proxy: { "/api": process.env.API_URL || "http://127.0.0.1:8000" },
  },
}));
