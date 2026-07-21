import type { NextConfig } from "next";

/**
 * Next.js config, Tarlog Web (doc 05 §1 Nr. 1, §9.1).
 *
 * `output: 'standalone'` erzeugt ein selbst-enthaltenes Server-Bundle für den
 * Self-Host-Betrieb (Docker). Der Custom-Node-Server `server.mjs` startet den
 * Next-Handler UND den WebSocket-Live-Kanal (doc 05 §7). `@tarlog/core`/`@tarlog/db`
 * sind Workspace-Packages und werden von Next transpiliert.
 *
 * `webpack.resolve.extensionAlias` bildet die `.js`-Endung der Quell-Imports auf
 * die TS-Quellen ab (Projekt-Konvention: `moduleResolution: bundler` in tsc,
 * ESM-Imports mit `.js`-Suffix). Ohne dies löst der Client-/Browser-Layer von
 * Next die `.js`→`.ts`/`.tsx`-Imports nicht auf (nur der Server-Layer tut es),
 * was zu „Module not found" in Client-Komponenten (`lib/ui/*`) führt.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@tarlog/core", "@tarlog/db"],
  serverExternalPackages: ["pg", "@node-rs/argon2", "pdfmake"],
  typedRoutes: true,
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".jsx": [".tsx", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
