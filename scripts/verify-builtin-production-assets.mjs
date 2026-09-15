import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distAssetsRoot = join(repositoryRoot, "dist", "assets");
const manifestPath = join(
  repositoryRoot,
  "src",
  "resources",
  "builtin",
  "builtinResourceManifest.json",
);

if (!existsSync(distAssetsRoot)) {
  throw new Error("production builtin verification requires dist/assets from one completed Vite build");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.storageSchema !== 1 || !Array.isArray(manifest.entries) || manifest.entries.length === 0) {
  throw new Error("production builtin verification received an invalid source manifest");
}

const emittedByIntegrity = new Map();
for (const path of walk(distAssetsRoot)) {
  const bytes = readFileSync(path);
  const integrity = observe(bytes);
  const key = integrityKey(integrity);
  const paths = emittedByIntegrity.get(key) ?? [];
  paths.push(path);
  emittedByIntegrity.set(key, paths);
}

const expectedKeys = new Set();
const matches = new Map();
for (const entry of manifest.entries) {
  if (
    typeof entry.path !== "string" || !Number.isSafeInteger(entry.byteLength) || entry.byteLength <= 0 ||
    typeof entry.sha256 !== "string" || !/^[0-9A-F]{64}$/.test(entry.sha256)
  ) {
    throw new Error(`production builtin verification received an invalid manifest entry: ${JSON.stringify(entry)}`);
  }
  const key = integrityKey(entry);
  expectedKeys.add(key);
  const emitted = emittedByIntegrity.get(key);
  if (emitted === undefined || emitted.length === 0) {
    throw new Error(
      `production builtin payload is missing or transformed: ${entry.path} ` +
      `(${entry.byteLength} bytes / SHA-256 ${entry.sha256})`,
    );
  }
  matches.set(entry.path, emitted);
}

const applyAction = manifest.entries.find((entry) => entry.path === "icons/apply-action.svg");
if (applyAction === undefined) throw new Error("apply-action source manifest entry is missing");
const applyActionOutputs = matches.get(applyAction.path);
if (applyActionOutputs === undefined || applyAction.byteLength !== 552 || applyAction.sha256 !== "E3EC9859FF144CC23D022434C666B5AB7F412F5E0C91B3E8F6F93619A2BCF1FD") {
  throw new Error("apply-action production byte regression is not closed");
}

console.log(
  `production builtin assets: ok (${manifest.entries.length} logical entries, ` +
  `${expectedKeys.size} unique payloads, apply-action ${applyAction.byteLength} bytes)`,
);

function observe(bytes) {
  return {
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
  };
}

function integrityKey(integrity) {
  return `${integrity.byteLength}:${integrity.sha256}`;
}

function walk(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(path));
    else if (entry.isFile() && statSync(path).isFile()) output.push(path);
  }
  return output;
}
