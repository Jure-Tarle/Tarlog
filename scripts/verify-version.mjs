import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

const manifests = [
  ["package.json", (value) => value.version],
  ["apps/desktop/package.json", (value) => value.version],
  ["apps/mobile/package.json", (value) => value.version],
  ["apps/web/package.json", (value) => value.version],
  ["packages/core/package.json", (value) => value.version],
  ["packages/db/package.json", (value) => value.version],
  ["apps/mobile/app.json", (value) => value.expo.version],
  ["apps/desktop/src-tauri/tauri.conf.json", (value) => value.version],
];

const versions = new Map();
for (const [path, select] of manifests) {
  versions.set(path, select(await json(path)));
}

const cargoToml = await readFile(resolve(root, "apps/desktop/src-tauri/Cargo.toml"), "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
versions.set("apps/desktop/src-tauri/Cargo.toml", cargoVersion);

const cargoLock = await readFile(resolve(root, "apps/desktop/src-tauri/Cargo.lock"), "utf8");
const cargoLockVersion = cargoLock.match(/\[\[package\]\]\nname = "ptl-desktop"\nversion = "([^"]+)"/)?.[1];
versions.set("apps/desktop/src-tauri/Cargo.lock", cargoLockVersion);

const expected = versions.get("package.json");
const mismatches = [...versions].filter(([, version]) => version !== expected);
if (mismatches.length > 0) {
  for (const [path, version] of mismatches) {
    console.error(`${path}: ${version ?? "keine Version"}; erwartet ${expected}`);
  }
  process.exit(1);
}

const requestedTag = process.argv[2] || (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "");
if (requestedTag) {
  const tagVersion = requestedTag.replace(/^v/, "");
  if (tagVersion !== expected) {
    console.error(`Release-Tag ${requestedTag} passt nicht zu Manifest-Version ${expected}.`);
    process.exit(1);
  }
}

console.log(`Alle Tarlog-Manifeste verwenden ${expected}${requestedTag ? ` (${requestedTag})` : ""}.`);
