import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri desktop frontend. Fixed dev port 1420 (referenced by src-tauri/tauri.conf.json
// devUrl). Vite output goes to ../dist consumed by Tauri as `frontendDist`.
// Docs: doc 05 (Architektur), doc 11 §5 (Desktop macOS/Windows).
export default defineConfig({
  plugins: [react()],
  // Prevent Vite from obscuring Rust errors and keep a stable dev port.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    // Watching src-tauri would trigger needless reloads.
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    outDir: "dist",
    // Tauri supports modern engines; smaller, faster output.
    target: "es2022",
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Keep the interaction libraries cacheable and the app chunk below
        // Vite's warning threshold without changing the eager route contract.
        manualChunks(id) {
          if (id.includes("node_modules/.pnpm/framer-motion") || id.includes("node_modules/.pnpm/motion")) {
            return "motion";
          }
          if (id.includes("node_modules/.pnpm/lucide-react")) return "icons";
          if (id.includes("node_modules/.pnpm/react@") || id.includes("node_modules/.pnpm/react-dom")) {
            return "react";
          }
          return undefined;
        },
      },
    },
  },
});
