import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const simulatorRoot = resolve(testingRoot, "..");
const read = (relative) => readFileSync(join(simulatorRoot, relative), "utf8");

const contracts = read("public/contracts.ts");
const recipe = read("assembly/sessionRecipe.ts");
const skinContracts = read("engine/skin/contracts.ts");
const catalog = read("engine/skin/currentMasterCatalog.ts");
const validation = read("engine/skin/originalSkinValidation.ts");
const resolver = read("engine/skin/originalSkinResolver.ts");
const derivation = read("assembly/sessionSkinDerivation.ts");

for (const symbol of [
  "SimulatorOriginalSkinSettings",
  "SimulatorSpecialSkinSelection",
  "SimulatorSpecialSkinComponentStates",
  'readonly skin: SimulatorOriginalSkinSettings;',
]) if (!contracts.includes(symbol)) throw new Error(`Skin Public symbol missing: ${symbol}`);
for (const required of [
  "readonly schemaVersion: 11;",
  '"audio,highFrequencyMode,inputMode,judgeOffsetFrames,sessionMode,skin,visual"',
  "validateAndFreezeOriginalSkinSettings",
]) if (!recipe.includes(required)) throw new Error(`Schema 11 Skin recipe boundary missing: ${required}`);
for (const forbidden of ["judgeSkinId", "judgeType", "ripName", "Bestdori", "http://", "https://"]) {
  if ((contracts + skinContracts + catalog + validation + resolver + derivation).includes(forbidden)) {
    throw new Error(`forbidden Skin identity/transport entered production: ${forbidden}`);
  }
}
for (const required of [
  "CURRENT_NORMAL_NOTE_SKINS",
  "CURRENT_NORMAL_LANE_SKINS",
  "CURRENT_NORMAL_EFFECT_SKINS",
  "CURRENT_NORMAL_SOUND_SKINS",
  "CURRENT_NORMAL_DIRECTIONAL_SKINS",
  "CURRENT_SPECIAL_SKINS",
  '["collabo",36,false',
]) if (!catalog.includes(required)) throw new Error(`current Skin catalog marker missing: ${required}`);
for (const required of [
  "skin.special-package-unavailable",
  'chartMode === "habahiro"',
  "!mode.value.isAutoLive",
  'seLogicalResource: "sound/tapseskin/directionalflickskin00"',
  'effectSetting === 0 ? "normal" : "light"',
  'backgroundMode === "mv"',
  'component("practice-background"',
  'bundleName: "normal" as const',
  "canonicalIdentity",
]) if (!resolver.includes(required)) throw new Error(`Skin resolver marker missing: ${required}`);

const production = collect(simulatorRoot).filter((path) => !path.includes(`${join("simulator", "testing")}`));
for (const path of production) {
  const text = readFileSync(path, "utf8");
  for (const forbidden of ["../skinLoader", "../../skinLoader", "noteSkinAssetTool", "services/bestdori", "data/judge-type-rip-map"]) {
    if (text.includes(forbidden)) throw new Error(`Skin production dependency escape: ${path}: ${forbidden}`);
  }
}
console.log("Skin settings static boundary verified: Schema 11 aggregate-only catalog/resolver, HAB/MV/mode routes, no transport or independent Judge");

function collect(root) {
  const paths = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stats = statSync(path);
    if (stats.isDirectory()) paths.push(...collect(path));
    else if (path.endsWith(".ts")) paths.push(path);
  }
  return paths;
}
