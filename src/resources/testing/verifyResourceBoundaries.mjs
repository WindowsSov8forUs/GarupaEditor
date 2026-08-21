import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeFiles = walk(root).filter((path) =>
  [".ts", ".tsx"].includes(extname(path)) && !path.includes(`${join("resources", "testing")}`),
);
const forbiddenRuntimeTokens = [
  "simulator-static/current-10.1.4",
  "fallbackMaps",
  "current-10.1.4",
];

for (const path of runtimeFiles) {
  const source = readFileSync(path, "utf8");
  for (const token of forbiddenRuntimeTokens) {
    if (source.includes(token)) {
      throw new Error(`${relative(root, path)} contains forbidden resource-lock token: ${token}`);
    }
  }
  if (!path.includes(`${join("resources", "builtin")}`) && /["'`]\b[0-9A-F]{64}\b["'`]/.test(source)) {
    throw new Error(`${relative(root, path)} contains a compiled SHA-256 resource allowlist`);
  }
}

const repositoryRoot = resolve(root, "..", "..");
const sourceRoot = join(repositoryRoot, "src");
const builtinCatalogPaths = new Set([
  join(root, "builtin", "builtinResourceCatalog.ts"),
  join(root, "builtin", "simulatorBuiltinResourceCatalog.ts"),
]);
for (const path of walk(sourceRoot).filter((candidate) => [".ts", ".tsx"].includes(extname(candidate)))) {
  if (builtinCatalogPaths.has(path)) continue;
  const source = readFileSync(path, "utf8");
  if (/from\s+["'][^"']*assets\//.test(source)) {
    throw new Error(`${relative(sourceRoot, path)} imports a physical builtin outside the application catalog`);
  }
}
const productionFiles = walk(sourceRoot).filter((candidate) =>
  [".ts", ".tsx"].includes(extname(candidate)) && !candidate.includes(`${join("simulator", "testing")}`),
);
for (const path of productionFiles) {
  const source = readFileSync(path, "utf8");
  if (source.includes("fetchBestdoriFileBlob") && !path.endsWith(join("resources", "providers", "bestdoriCatalogProvider.ts")) && !path.endsWith(join("services", "bestdori", "api.ts"))) {
    throw new Error(`${relative(sourceRoot, path)} bypasses the main-program network resource provider`);
  }
  if (/invoke(?:<[^>]+>)?\([^\n]*["']resource_/.test(source) && !path.endsWith(join("resources", "providers", "tauriResourceBackend.ts"))) {
    throw new Error(`${relative(sourceRoot, path)} invokes a resource command outside the Tauri resource backend`);
  }
}
for (const relativePath of ["skinLoader.ts", join("skin", "resourceSkinDecoder.ts"), "noteSkinAssetTool.ts"]) {
  const source = readFileSync(join(sourceRoot, relativePath), "utf8");
  for (const token of ["DataURL", "DataUrl", "toDataURL", "prepareBestdori", "localStorage", "getRuntimeSeAssets"]) {
    if (source.includes(token)) throw new Error(`${relativePath} contains forbidden legacy Skin resource token: ${token}`);
  }
}
const skinLoaderSource = readFileSync(join(sourceRoot, "skinLoader.ts"), "utf8");
if (/from\s+["']\.\/data\/.*(?:type-rip|judge-rip)/.test(skinLoaderSource)) {
  throw new Error("skinLoader imports a fixed network candidate map");
}
const chartCoreSource = readFileSync(join(sourceRoot, "chartCore.ts"), "utf8");
for (const token of ["bgmDataUrl", "coverDataUrl", "mvDataUrl"]) {
  if (chartCoreSource.includes(token)) throw new Error(`ChartMetadata still owns legacy URL field ${token}`);
}
const assetsRoot = join(sourceRoot, "assets");
const manifest = JSON.parse(readFileSync(join(root, "builtin", "builtinResourceManifest.json"), "utf8"));
const actualAssets = walk(assetsRoot).filter((path) => statSync(path).isFile());
if (manifest.storageSchema !== 1 || manifest.entries.length !== actualAssets.length) {
  throw new Error("builtin resource manifest does not cover the exact source asset inventory");
}
const byPath = new Map(manifest.entries.map((entry) => [entry.path, entry]));
for (const path of actualAssets) {
  const logicalPath = relative(assetsRoot, path).replaceAll("\\", "/");
  const bytes = readFileSync(path);
  const entry = byPath.get(logicalPath);
  const digest = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if (!entry || entry.byteLength !== bytes.length || entry.sha256 !== digest) {
    throw new Error(`builtin resource manifest mismatch: ${logicalPath}`);
  }
}
const simulatorManifest = JSON.parse(readFileSync(join(root, "builtin", "simulatorBuiltinResourceManifest.json"), "utf8"));
const gameAssets = actualAssets.filter((path) => path.startsWith(join(assetsRoot, "game")));
if (simulatorManifest.schemaVersion !== 1 || simulatorManifest.entries.length !== gameAssets.length) {
  throw new Error("Simulator builtin provenance manifest does not cover the exact game asset inventory");
}
const simulatorByPath = new Map(simulatorManifest.entries.map((entry) => [entry.path, entry]));
const simulatorBuiltinCatalogSource = readFileSync(join(root, "builtin", "simulatorBuiltinResourceCatalog.ts"), "utf8");
for (const path of gameAssets) {
  const logicalPath = relative(assetsRoot, path).replaceAll("\\", "/");
  const bytes = readFileSync(path);
  const digest = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  const entry = simulatorByPath.get(logicalPath);
  if (
    !entry || entry.byteLength !== bytes.length || entry.sha256 !== digest ||
    !/^[0-9a-f]{40}$/.test(entry.sourceReverseCommit) ||
    typeof entry.sourcePath !== "string" || !entry.sourcePath.startsWith("artifacts/investigations/") ||
    !simulatorBuiltinCatalogSource.includes(entry.path)
  ) throw new Error(`Simulator builtin provenance/catalog mismatch: ${logicalPath}`);
}

console.log(`resource boundaries: ok (${runtimeFiles.length} runtime files, ${actualAssets.length} builtins)`);

function walk(directory) {
  const output = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const info = statSync(path);
    if (info.isDirectory()) output.push(...walk(path));
    else output.push(path);
  }
  return output;
}
