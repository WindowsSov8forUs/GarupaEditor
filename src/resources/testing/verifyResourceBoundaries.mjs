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
const simulatorRoot = join(sourceRoot, "simulator");
for (const path of walk(simulatorRoot).filter((candidate) => [".ts", ".tsx"].includes(extname(candidate)) && !candidate.includes(`${join("simulator", "testing")}`))) {
  const source = readFileSync(path, "utf8");
  for (const token of ["simulator-static/", "SharedStaticResourceStore", "staticResourceSelector", "skinResourceSelector", "skinPortablePack", "current-10.1.4"]) {
    if (source.includes(token)) throw new Error(`${relative(simulatorRoot, path)} retains removed production resource authority: ${token}`);
  }
  if (/from\s+["'][^"']*resources\/(?:applicationResourceManager|contracts|providers)/.test(source)) {
    throw new Error(`${relative(simulatorRoot, path)} imports the application resource manager instead of the neutral platform capability`);
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
const simulatorWindowSource = readFileSync(join(sourceRoot, "app", "BuiltInSimulatorWindow.tsx"), "utf8");
const browserPlatformSource = readFileSync(join(sourceRoot, "app", "simulator", "browserSimulatorPlatform.ts"), "utf8");
const simulatorTransportSource = readFileSync(join(sourceRoot, "app", "simulator", "transportContracts.ts"), "utf8");
const mobileSafeAreaSource = readFileSync(join(sourceRoot, "app", "simulator", "mobileSafeArea.ts"), "utf8");
for (const marker of [
  "installProductionAutonomousSimulatorPlatform", "launchSimulatorModule", "buildSimulatorLaunchRequest",
  "AudioContext", "mediaSnapshotId", "createSimulatorResourceCapability",
]) if (!simulatorWindowSource.includes(marker)) throw new Error(`Stage 9 desktop window marker missing: ${marker}`);
for (const marker of [
  "canvas.width", "bottom-left", "PointerEvent", "ManualTouchPhase", "requestAnimationFrame",
  "safeAreaPolicy", "resources:",
]) if (!(browserPlatformSource + simulatorWindowSource).includes(marker)) throw new Error(`Stage 9 browser platform marker missing: ${marker}`);
for (const marker of [
  "env(safe-area-inset-left,0px)", "calculateMobileSafeArea", "css-safe-area",
  "orientationchange", "visualViewport", "pagehide", "初始横屏backing store",
]) if (!(mobileSafeAreaSource + browserPlatformSource + simulatorWindowSource).includes(marker)) throw new Error(`Stage 9 mobile platform marker missing: ${marker}`);
for (const forbidden of ["SimulatorAppController", "SimulatorLaunchPayload", "DataURL", "sourceUrl", "sha256", "provider"] ) {
  if ((simulatorWindowSource + simulatorTransportSource).includes(forbidden)) throw new Error(`Stage 9 transport/window contains forbidden legacy/resource field: ${forbidden}`);
}
for (const path of walk(join(sourceRoot, "app")).filter((candidate) => [".ts", ".tsx"].includes(extname(candidate)))) {
  const source = readFileSync(path, "utf8");
  if (/app_data[\\/]|resources[\\/]library|\.join\(["']library/.test(source)) {
    throw new Error(`${relative(sourceRoot, path)} reads a physical resource library path`);
  }
}
const tauriLibrarySource = readFileSync(join(repositoryRoot, "src-tauri", "src", "lib.rs"), "utf8");
for (const marker of ["chart-resources.v5.json", "chart-resources.v4.json", "migrate_chart_resource_refs_v3", "migrate_resource_id_v3", "CHART_RESOURCE_REFS_MIGRATION_REPORT"]) {
  if (!tauriLibrarySource.includes(marker)) throw new Error(`chart resource v4 migration marker missing: ${marker}`);
}
const editorIoSource = readFileSync(join(sourceRoot, "app", "hooks", "useEditorIoAndShortcuts.ts"), "utf8");
const editorCacheSource = readFileSync(join(sourceRoot, "app", "hooks", "useEditorSessionCache.ts"), "utf8");
for (const marker of [
  "importWorkspaceMedia", "materializeNetworkMediaInWorkspace", "reconcileCurrentChartMedia",
]) if (!(editorIoSource + editorCacheSource).includes(marker)) throw new Error(`current-session chart media marker missing: ${marker}`);
for (const forbidden of [".importUserMedia(", "installBestdoriMedia("]) {
  if ((editorIoSource + editorCacheSource).includes(forbidden)) throw new Error(`app chart media retains global legacy import: ${forbidden}`);
}
for (const marker of [
  "WORKSPACE_STORAGE_SCHEMA", "project-media", "resource_commit_workspace_media_import",
  "resource_reconcile_workspace_media", "legacy-user-media-v1", "library/user",
]) if (!tauriLibrarySource.includes(marker) && !readFileSync(join(repositoryRoot, "src-tauri", "src", "resource_manager.rs"), "utf8").includes(marker)) {
  throw new Error(`Tauri workspace/recovery marker missing: ${marker}`);
}
const resourceManagerRust = readFileSync(join(repositoryRoot, "src-tauri", "src", "resource_manager.rs"), "utf8");
if (!resourceManagerRust.includes("chart media cannot be installed as a global network record")) {
  throw new Error("global provider-media installation rejection is missing");
}
for (const token of [
  "pub fn resource_import_user_media", "pub fn resource_begin_user_media_import",
  "pub fn resource_commit_user_media_import",
]) if (resourceManagerRust.includes(token)) throw new Error(`legacy global user-media creation command remains: ${token}`);
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
