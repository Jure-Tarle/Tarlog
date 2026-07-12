/**
 * Metro config — monorepo aware (doc 05 §2.1 pnpm workspace).
 *
 * `watchFolders` includes the repo root so Metro sees `packages/core`
 * (workspace:*), und `nodeModulesPaths` lässt Metro Abhängigkeiten aus dem
 * App- und dem Root-Verzeichnis auflösen.
 *
 * Hierarchische Auflösung bleibt AKTIV: unter pnpm liegen die eigenen
 * Abhängigkeiten von react-native (`invariant`, `nullthrows`, …) als Symlinks
 * neben RN im `.pnpm`-Store. Nur wenn Metro das Verzeichnis nach oben durchläuft,
 * findet es sie — `disableHierarchicalLookup: true` würde genau das verhindern.
 */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = false;
// pnpm nutzt Symlinks (.pnpm-Store) — Metro muss ihnen folgen.
config.resolver.unstable_enableSymlinks = true;

// BEKANNTE EINSCHRÄNKUNG (Bundler, nicht App-Code):
// Der Metro-Bundler löst `react`/`react-native` aus den Dateien im
// expo-router-Verzeichnis `app/` unter dem pnpm-Standardlayout (isolierte
// Symlinks) nicht auf ("Unable to resolve react from app/_layout.tsx"), obwohl
// `tsc --noEmit` grün ist und 1047 Module bundeln. Der zuverlässige Fix ist ein
// flaches node_modules (`node-linker=hoisted` in einer root-.npmrc); der lokale
// Node 25 hat dafür jedoch kein vorgebautes `better-sqlite3` und bräuchte eine
// node-gyp-Toolchain. Sauber lösbar, aber außerhalb dieses Durchlaufs.

module.exports = config;
