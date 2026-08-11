import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const simulatorRoot = resolve(testingRoot, "..");
const rootIndex = readFileSync(join(simulatorRoot, "index.ts"), "utf8");
const publicContracts = readFileSync(join(simulatorRoot, "public", "contracts.ts"), "utf8");
const publicIndex = readFileSync(join(simulatorRoot, "public", "index.ts"), "utf8");
const selector = readFileSync(join(simulatorRoot, "resources", "staticResourceSelector.ts"), "utf8");

for (const forbidden of [
  "createSimulatorEngine", "SimulatorEngine", "SimulatorBackends",
  "ResourceProvider", "PreflightAdapter", "SceneInput", "ReplayCheckpoint",
  "WebAudioSimulatorBackend", "PixiRendererBackend",
]) {
  if (rootIndex.includes(forbidden) || publicIndex.includes(forbidden)) {
    throw new Error(`autonomous public barrel leaked internal symbol: ${forbidden}`);
  }
}
for (const forbidden of ["step(", "pause(", "resume(", "dispose(", "returnTime("]) {
  if (publicContracts.includes(forbidden)) {
    throw new Error(`public launch contract leaked lifecycle control: ${forbidden}`);
  }
}
for (const required of [
  "launchSimulatorModule", "SimulatorChartDataPackage", "SimulatorLaunchConfig",
  "SimulatorModuleLaunchRequest", "SimulatorModuleLaunchResult", "SimulatorModuleCloseReport",
]) {
  if (!rootIndex.includes(required) && !publicIndex.includes(required)) {
    throw new Error(`autonomous public barrel missing: ${required}`);
  }
}
for (const required of [
  "CURRENT_AUDIO_SE_RESOURCES", "CURRENT_PARTICLE_RESOURCE_MANIFEST",
  "HABAHIRO_BESTDORI_PINNED_ASSETS", "habahiroChangeAbsolutePos >= 0",
  "CURRENT_ORDINARY_PORTABLE_PROFILE_RESOURCE", "CURRENT_ORDINARY_PORTABLE_RESOURCES",
]) {
  if (!selector.includes(required)) throw new Error(`static selector missing fixed owner: ${required}`);
}

const productionRoots = ["public", "runtime", "assembly", "resources", "scene"].map((name) =>
  join(simulatorRoot, name));
const platformRoot = join(simulatorRoot, "platform");
const forbiddenProduction = [
  [/src[\\/]app|\.\.[\\/]\.\.[\\/]app|chartCore/, "main/editor dependency"],
  [/testing[\\/]fixtures|reverse-snapshots/, "testing fixture dependency"],
  [/GirlsBandParty-Reverse|runtime[\\/]tools/, "Reverse workspace dependency"],
  [/Math\.random\s*\(/, "Math.random"],
  [/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/, "implicit network"],
  [/\b(?:setTimeout|setInterval)\s*\(/, "wall-clock timer"],
  [/\b(?:document|window)\s*\./, "DOM owner outside platform"],
  [/from\s+["'](?:react|pixi\.js|@tauri-apps)/, "UI/platform package outside platform"],
];
for (const root of productionRoots) {
  for (const path of listTypeScript(root)) {
    const source = readFileSync(path, "utf8");
    for (const [pattern, label] of forbiddenProduction) {
      if (pattern.test(source)) throw new Error(`${label}: ${path}`);
    }
  }
}
for (const path of listTypeScript(platformRoot)) {
  const source = readFileSync(path, "utf8");
  for (const [pattern, label] of forbiddenProduction.slice(0, -1)) {
    if (pattern.test(source)) throw new Error(`${label}: ${path}`);
  }
}
console.log("autonomous simulator static boundary verified: single launch, closed-only receipt, internal resources/runtime/replay, no legacy barrel");

function listTypeScript(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? listTypeScript(path)
      : extname(entry.name) === ".ts" ? [path] : [];
  });
}
