import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

const emittedIntegrities = new Set();
for (const path of walk(distAssetsRoot)) {
  const bytes = readFileSync(path);
  const integrity = observe(bytes);
  const key = integrityKey(integrity);
  emittedIntegrities.add(key);
}

const expectedKeys = new Set();
for (const entry of manifest.entries) {
  if (
    typeof entry.path !== "string" || !Number.isSafeInteger(entry.byteLength) || entry.byteLength <= 0 ||
    typeof entry.sha256 !== "string" || !/^[0-9A-F]{64}$/.test(entry.sha256)
  ) {
    throw new Error(`production builtin verification received an invalid manifest entry: ${JSON.stringify(entry)}`);
  }
  const key = integrityKey(entry);
  expectedKeys.add(key);
  if (!emittedIntegrities.has(key)) {
    throw new Error(
      `production builtin payload is missing or transformed: ${entry.path} ` +
      `(${entry.byteLength} bytes / SHA-256 ${entry.sha256})`,
    );
  }
}

console.log(
  `production builtin assets: ok (${manifest.entries.length} logical entries, ` +
  `${expectedKeys.size} unique payloads)`,
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
    else if (entry.isFile()) output.push(path);
  }
  return output;
}
