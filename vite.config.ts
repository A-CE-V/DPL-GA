import { defineConfig } from "vite";
import react            from "@vitejs/plugin-react";

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,

  // ═══════════════════════════════════════════════════════════════════════
  // FIX — the white screen bug.
  //
  // Without this, Vite builds index.html referencing your JS bundle with
  // an ABSOLUTE path, e.g.:  <script src="/assets/index-abc123.js">
  //
  // That works fine in `npm run dev` (a real HTTP server sits at the root),
  // but in the PACKAGED Tauri app the webview loads through a custom
  // protocol, not a normal web root — an absolute path like that fails to
  // resolve. The script tag silently fails to load, main.tsx never runs,
  // React never mounts, and the native window's default white background
  // is all that's ever shown — permanently, not just a brief flash.
  //
  // `base: "./"` makes every built asset path RELATIVE instead
  // (./assets/index-abc123.js), which resolves correctly no matter what
  // protocol Tauri is serving the app through. This is a well-known,
  // extremely common gotcha for every Tauri + Vite project — required
  // reading in Tauri's own docs, not something specific to this app.
  // ═══════════════════════════════════════════════════════════════════════
  base: "./",

  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target:    process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify:    !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
