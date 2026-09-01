import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
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
const assetsRoot = join(sourceRoot, "assets");
const applicationBuiltinCatalogPath = join(root, "builtin", "builtinResourceCatalog.ts");
const simulatorBuiltinCatalogPath = join(root, "builtin", "simulatorBuiltinResourceCatalog.ts");
const builtinCatalogPaths = new Set([
  applicationBuiltinCatalogPath,
  simulatorBuiltinCatalogPath,
]);
const applicationCatalogAssets = readCatalogAssetSet(applicationBuiltinCatalogPath);
const simulatorCatalogAssets = readCatalogAssetSet(simulatorBuiltinCatalogPath);
const catalogOverlap = intersection(applicationCatalogAssets, simulatorCatalogAssets);
if (catalogOverlap.size > 0) {
  throw new Error(`application and Simulator builtin catalogs overlap: ${formatSet(catalogOverlap)}`);
}
const importedBuiltinAssets = union(applicationCatalogAssets, simulatorCatalogAssets);
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
const audioCapabilitySource = readFileSync(join(sourceRoot, "app", "simulator", "browserAudioContextCapability.ts"), "utf8");
const launchOwnerSource = readFileSync(join(sourceRoot, "app", "simulator", "browserSimulatorLaunchOwner.ts"), "utf8");
const browserPlatformSource = readFileSync(join(sourceRoot, "app", "simulator", "browserSimulatorPlatform.ts"), "utf8");
const simulatorTransportSource = readFileSync(join(sourceRoot, "app", "simulator", "transportContracts.ts"), "utf8");
const mobileSafeAreaSource = readFileSync(join(sourceRoot, "app", "simulator", "mobileSafeArea.ts"), "utf8");
for (const marker of [
  "installProductionAutonomousSimulatorPlatform", "launchSimulatorModule", "buildSimulatorLaunchRequest",
  "createBrowserAudioContextCapability", "BrowserSimulatorLaunchOwner", "mediaSnapshotId",
  "createSimulatorResourceCapability", "awaiting-host-activation", "activateFromPointer",
]) if (!(simulatorWindowSource + launchOwnerSource + audioCapabilitySource).includes(marker)) {
  throw new Error(`Stage 9 automatic desktop window marker missing: ${marker}`);
}
for (const forbidden of [
  "点击开始以解锁音频", "正在解锁音频并验证资源", "setStarted(", "const [started",
  "audioContext.resume()", ">开始</button>", "Simulator运行中", ">关闭</button>",
]) if (simulatorWindowSource.includes(forbidden)) {
  throw new Error(`Stage 9 window retains a non-original ordinary start/running overlay: ${forbidden}`);
}
if (!audioCapabilitySource.includes("pending = this.context.resume()") ||
  !audioCapabilitySource.includes('context.state === "running" ? "running" : "user-activation-required"') ||
  /(?:createOscillator\(|HTMLAudioElement|new Audio\(|dispatchEvent\(|silent\.mp3)/.test(audioCapabilitySource)) {
  throw new Error("AudioContext capability no longer provides the narrow initial-suspended synchronous pointer gate");
}
for (const marker of [
  "canvas.width", "bottom-left", "PointerEvent", "ManualTouchPhase", "requestAnimationFrame",
  "safeAreaPolicy", "backingToPixiX", "app.stage.scale.set", "resources:",
]) if (!(browserPlatformSource + simulatorWindowSource).includes(marker)) throw new Error(`Stage 9 browser platform marker missing: ${marker}`);
for (const marker of [
  "env(safe-area-inset-left,0px)", "calculateMobileSafeArea", "css-safe-area",
  "orientationchange", "visualViewport", "pagehide", "初始横屏backing store",
]) if (!(mobileSafeAreaSource + browserPlatformSource + simulatorWindowSource).includes(marker)) throw new Error(`Stage 9 mobile platform marker missing: ${marker}`);
for (const forbidden of ["SimulatorAppController", "SimulatorLaunchPayload", "DataURL", "sourceUrl", "sha256", "provider"] ) {
  if ((simulatorWindowSource + simulatorTransportSource).includes(forbidden)) throw new Error(`Stage 9 transport/window contains forbidden legacy/resource field: ${forbidden}`);
}
for (const marker of [
  "readonly schemaVersion: 3;", "encodeSimulatorLaunchTransportConfig",
  "decodeSimulatorLaunchTransportConfig", "SimulatorTransportFloat32Bits", "view.getFloat32",
]) if (!simulatorTransportSource.includes(marker)) {
  throw new Error(`Stage 9 Float32-stable transport marker missing: ${marker}`);
}
const decodeTransportStart = simulatorTransportSource.indexOf("export function decodeSimulatorLaunchTransportConfig");
const encodeTransportStart = simulatorTransportSource.indexOf("function encodeFloat32");
if (decodeTransportStart < 0 || encodeTransportStart < decodeTransportStart ||
  simulatorTransportSource.slice(decodeTransportStart, encodeTransportStart).includes("Math.fround")) {
  throw new Error("Stage 9 transport decodes exact Float32 bits without rounding repair");
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
for (const marker of [
  '"skin.rhythm-sample"', '"skin.directional-sample"', "createSnapshotFromRefs",
  "bestdoriNoteskinSampleNativeId(normalized.rhythmRipName)",
  "bestdoriNoteskinSampleNativeId(normalized.directionalRipName)",
]) if (!editorIoSource.includes(marker)) throw new Error(`Skin snapshot is missing an explicit original sample-package binding: ${marker}`);
const skinSnapshotIndex = editorIoSource.indexOf("const snapshot = await resourceManager.createSnapshotFromRefs");
const skinSelectionIndex = editorIoSource.indexOf("const selected = resourceManager.replaceSelection(resourceRefs)");
if (skinSnapshotIndex < 0 || skinSelectionIndex < skinSnapshotIndex) {
  throw new Error("Skin selection mutates before the explicit primary/sample snapshot is decoded");
}
const resourceSkinDecoderSource = readFileSync(join(sourceRoot, "skin", "resourceSkinDecoder.ts"), "utf8");
for (const marker of [
  'openPackage(lease, RHYTHM_SAMPLE_SLOT)', 'openPackage(lease, DIRECTIONAL_SAMPLE_SLOT)',
  "requireText(sampleSource, sampleBundleName)", 'requireUrl(sampleSource, "note_normal_3.png")',
  'requireUrl(sampleSource, "note_flick_l_3.png")',
]) if (!resourceSkinDecoderSource.includes(marker)) throw new Error(`Skin decoder no longer consumes the explicit sample package: ${marker}`);
const bestdoriProviderSource = readFileSync(join(root, "providers", "bestdoriCatalogProvider.ts"), "utf8");
if (bestdoriProviderSource.includes("sources.push(sourceFor")) {
  throw new Error("Bestdori provider silently combines distinct primary/sample logical packages");
}
for (const forbidden of [".importUserMedia(", "installBestdoriMedia("]) {
  if ((editorIoSource + editorCacheSource).includes(forbidden)) throw new Error(`app chart media retains global legacy import: ${forbidden}`);
}
for (const marker of [
  "WORKSPACE_STORAGE_SCHEMA", "project-media", "resource_commit_workspace_media_import",
  "resource_reconcile_workspace_media", "resource_shutdown", "legacy-user-media-v1", "library/user",
]) if (!tauriLibrarySource.includes(marker) && !readFileSync(join(repositoryRoot, "src-tauri", "src", "resource_manager.rs"), "utf8").includes(marker)) {
  throw new Error(`Tauri workspace/recovery marker missing: ${marker}`);
}
const resourceManagerRust = readFileSync(join(repositoryRoot, "src-tauri", "src", "resource_manager.rs"), "utf8");
if (!tauriLibrarySource.includes("tauri::RunEvent::Exit") || !resourceManagerRust.includes("collect_garbage_paths(&root, &workspace)")) {
  throw new Error("graceful resource runtime cleanup is not bound to application exit");
}
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
const manifest = JSON.parse(readFileSync(join(root, "builtin", "builtinResourceManifest.json"), "utf8"));
const simulatorManifest = JSON.parse(readFileSync(join(root, "builtin", "simulatorBuiltinResourceManifest.json"), "utf8"));
if (manifest.storageSchema !== 1 || !Array.isArray(manifest.entries)) {
  throw new Error("builtin resource manifest has an invalid schema");
}
if (simulatorManifest.schemaVersion !== 1 || !Array.isArray(simulatorManifest.entries)) {
  throw new Error("Simulator builtin provenance manifest has an invalid schema");
}
const simulatorSourceRelations = new Set(["byte-identical", "source-derived-projection"]);
const simulatorMetadataTuple = simulatorManifest.entries.map((entry) => ({
  path: entry.path,
  sourceReverseCommit: entry.sourceReverseCommit,
  sourcePath: entry.sourcePath,
  byteLength: entry.byteLength,
  sha256: entry.sha256,
}));
const simulatorPayloadTuple = simulatorManifest.entries.map((entry) => ({
  path: entry.path,
  byteLength: entry.byteLength,
  sha256: entry.sha256,
}));
const simulatorMetadataTupleSha256 = createHash("sha256")
  .update(JSON.stringify(simulatorMetadataTuple)).digest("hex");
const simulatorPayloadTupleSha256 = createHash("sha256")
  .update(JSON.stringify(simulatorPayloadTuple)).digest("hex");
if (
  simulatorManifest.sourceRepository !== "https://github.com/WindowsSov8forUs/GirlsBandParty-Reverse" ||
  simulatorManifest.sourceHead !== "343c09cc06ee97f3f2532518eff6192913de2b19" ||
  simulatorManifest.identity?.legacyMetadataTupleSha256 !== "07a2265ad7c798494a2d3fce405f9ccc7acaf7ae5bbabfd80fdb19a4b0558b82" ||
  simulatorManifest.identity.currentMetadataTupleSha256 !== simulatorMetadataTupleSha256 ||
  simulatorMetadataTupleSha256 !== "c53067e33b78d8c8e8020248116cfb405517bf97516a22cdf9c6fe77e52820e9" ||
  simulatorManifest.identity.payloadTupleSha256 !== simulatorPayloadTupleSha256 ||
  simulatorPayloadTupleSha256 !== "8ae2e167b8c303da535e675e7b3f28a52a0dfd94f6a87f35b3de0274317e4362" ||
  simulatorMetadataTupleSha256 === simulatorManifest.identity.legacyMetadataTupleSha256 ||
  JSON.stringify(simulatorManifest.identity.metadataProjection) !== JSON.stringify([
    "path", "sourceReverseCommit", "sourcePath", "byteLength", "sha256",
  ]) ||
  JSON.stringify(simulatorManifest.identity.payloadProjection) !== JSON.stringify([
    "path", "byteLength", "sha256",
  ]) ||
  simulatorManifest.identity.serialization !== "JSON.stringify(entry-order object projection)"
) {
  throw new Error("Simulator builtin provenance and immutable payload identities are not independently fixed");
}

const actualAssets = new Set(walk(assetsRoot).filter((path) => statSync(path).isFile()).map((path) => resolve(path)));
const gameAssets = new Set([...actualAssets].filter((path) => path.startsWith(`${join(assetsRoot, "game")}${sep}`)));
const manifestAssets = manifestAssetSet(manifest.entries, "application source manifest");
const simulatorManifestAssets = manifestAssetSet(simulatorManifest.entries, "Simulator provenance manifest");
const applicationOnlyManifestAssets = difference(manifestAssets, simulatorManifestAssets);

assertSetEqual(manifestAssets, actualAssets, "application source manifest", "source asset inventory");
assertSetEqual(simulatorManifestAssets, gameAssets, "Simulator provenance manifest", "game asset inventory");
assertSetEqual(applicationCatalogAssets, applicationOnlyManifestAssets, "application catalog", "application-only manifest set");
assertSetEqual(simulatorCatalogAssets, simulatorManifestAssets, "Simulator catalog", "Simulator manifest set");
assertSetEqual(importedBuiltinAssets, manifestAssets, "catalog union", "application source manifest");

const byPath = uniqueEntriesByPath(manifest.entries, "application source manifest");
for (const path of actualAssets) {
  const logicalPath = relative(assetsRoot, path).replaceAll("\\", "/");
  const bytes = readFileSync(path);
  const entry = byPath.get(logicalPath);
  const digest = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if (!entry || entry.byteLength !== bytes.length || entry.sha256 !== digest) {
    throw new Error(`builtin resource manifest mismatch: ${logicalPath}`);
  }
}
const simulatorByPath = uniqueEntriesByPath(simulatorManifest.entries, "Simulator provenance manifest");
for (const path of gameAssets) {
  const logicalPath = relative(assetsRoot, path).replaceAll("\\", "/");
  const bytes = readFileSync(path);
  const digest = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  const entry = simulatorByPath.get(logicalPath);
  if (
    !entry || entry.byteLength !== bytes.length || entry.sha256 !== digest ||
    !/^[0-9a-f]{40}$/.test(entry.sourceReverseCommit) ||
    typeof entry.sourcePath !== "string" || !entry.sourcePath.startsWith("artifacts/investigations/") ||
    !simulatorSourceRelations.has(entry.sourceRelation)
  ) throw new Error(`Simulator builtin provenance mismatch: ${logicalPath}`);
}

console.log(
  `resource boundaries: ok (${runtimeFiles.length} runtime files; ` +
  `application-only=${applicationCatalogAssets.size}, Simulator=${simulatorCatalogAssets.size}, ` +
  `union=${manifestAssets.size})`,
);

function readCatalogAssetSet(catalogPath) {
  const source = readFileSync(catalogPath, "utf8");
  const imports = Array.from(source.matchAll(/^import\s+\w+\s+from\s+["']([^"']*assets\/[^"']+)["'];$/gm));
  if (imports.length === 0) throw new Error(`${relative(root, catalogPath)} imports no physical builtins`);
  const output = new Set();
  for (const match of imports) {
    const specifier = match[1];
    if (specifier === undefined || !specifier.endsWith("?url&no-inline")) {
      throw new Error(`${relative(root, catalogPath)} must force every physical builtin through ?url&no-inline: ${specifier}`);
    }
    const path = resolve(dirname(catalogPath), specifier.slice(0, -"?url&no-inline".length));
    if (!path.startsWith(`${assetsRoot}${sep}`)) {
      throw new Error(`${relative(root, catalogPath)} imports an asset outside src/assets: ${specifier}`);
    }
    if (output.has(path)) throw new Error(`${relative(root, catalogPath)} imports a physical asset twice: ${specifier}`);
    output.add(path);
  }
  return output;
}

function manifestAssetSet(entries, label) {
  const output = new Set();
  for (const entry of entries) {
    if (typeof entry.path !== "string" || entry.path.length === 0) {
      throw new Error(`${label} contains an invalid path`);
    }
    const path = resolve(assetsRoot, entry.path);
    if (!path.startsWith(`${assetsRoot}${sep}`)) throw new Error(`${label} path escapes src/assets: ${entry.path}`);
    if (output.has(path)) throw new Error(`${label} contains a duplicate path: ${entry.path}`);
    output.add(path);
  }
  return output;
}

function uniqueEntriesByPath(entries, label) {
  const output = new Map();
  for (const entry of entries) {
    if (output.has(entry.path)) throw new Error(`${label} contains a duplicate path: ${entry.path}`);
    output.set(entry.path, entry);
  }
  return output;
}

function union(left, right) {
  return new Set([...left, ...right]);
}

function intersection(left, right) {
  return new Set([...left].filter((value) => right.has(value)));
}

function difference(left, right) {
  return new Set([...left].filter((value) => !right.has(value)));
}

function assertSetEqual(actual, expected, actualLabel, expectedLabel) {
  const missing = difference(expected, actual);
  const unexpected = difference(actual, expected);
  if (missing.size > 0 || unexpected.size > 0) {
    throw new Error(
      `${actualLabel} differs from ${expectedLabel}; ` +
      `missing=[${formatSet(missing)}] unexpected=[${formatSet(unexpected)}]`,
    );
  }
}

function formatSet(values) {
  return [...values].map((path) => relative(assetsRoot, path).replaceAll("\\", "/")).sort().join(", ");
}

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
