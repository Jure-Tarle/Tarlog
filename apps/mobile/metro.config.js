/**
 * Metro config — monorepo aware (doc 05 §2.1 pnpm workspace).
 *
 * `watchFolders` includes the repo root so Metro sees `packages/core`
 * (workspace:*), and `nodeModulesPaths` lets it resolve hoisted deps from both
 * the app and the root store. `disableHierarchicalLookup` keeps resolution
 * deterministic under pnpm's symlinked layout.
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
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
