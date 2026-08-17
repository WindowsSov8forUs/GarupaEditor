import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repositoryRoot = process.cwd();
const root = resolve(repositoryRoot, "src", "simulator");

const legacySimulatorSchema = "Simulator" + "GarupaChart";
const legacyConverter = "chart" + "FormatConverter";
const contracts = read("public/contracts.ts");
for (const required of [
  'import type { GarupaChartJson } from "../../chart";',
  "readonly chart: GarupaChartJson;",
  'readonly garupaJsonSvAndTimingGroup: "ignored-product-extension";',
]) if (!contracts.includes(required)) throw new Error(`Garupa Public contract missing ${required}`);
if (contracts.includes("readonly bmsText:") || contracts.includes(legacySimulatorSchema)) {
  throw new Error("Public contains legacy BMS or duplicated Garupa schema");
}
const sharedSchema = readFileSync(resolve(repositoryRoot, "src", "chart", "garupa.ts"), "utf8");
for (const required of [
  "export type GarupaChartJson = readonly GarupaChartJsonItem[];",
  "export interface GarupaChartJsonSlideItem",
  "export interface GarupaChartJsonDirectionalNote",
]) if (!sharedSchema.includes(required)) throw new Error(`shared Garupa schema missing ${required}`);

const recipe = read("assembly/sessionRecipe.ts");
for (const required of [
  "readonly schemaVersion: 6;", "schemaVersion: 6 as const",
  '"bgm,chart,isFullLength,laneCount"', "copyAndFreezeGarupaChartJson",
]) if (!recipe.includes(required)) throw new Error(`schema-4 recipe missing ${required}`);
if (recipe.includes("chartData.bmsText")) throw new Error("recipe still consumes bmsText");

const composition = read("platform/platformComposition.ts");
if (!composition.includes("constructChartFromGarupaChartJson") ||
    composition.includes("createNoteBatchInformationList") ||
    composition.includes("chartData.bmsText")) {
  throw new Error("production composition is not direct Garupa JSON construction");
}
const adapter = read("assembly/garupaChartConstruction.ts");
for (const required of [
  "GARUPA_JSON_POSITION_UNITS_PER_BEAT = 48",
  "Math.floor(scaled)",
  "registerConstructedChartRuntimeMetadata",
  "registerMultiRangeSourceIdentity",
  "simulator.garupa-json.unsupported-slide-shape",
]) if (!adapter.includes(required)) throw new Error(`direct adapter missing ${required}`);
for (const forbidden of ["Math.round", "EPSILON", "createNoteBatchInformationList", "musicScoreData", "chartCore", legacyConverter]) {
  if (adapter.includes(forbidden)) throw new Error(`direct adapter contains forbidden approximation/dependency: ${forbidden}`);
}
const parser = read("assembly/garupaChartContract.ts");
for (const required of [
  "Simulator-owned validation and freezing for the shared Garupa chart schema.",
  "hasExactOptionalTimingKeys", "svItemCount", "timingGroupFieldCount", "Object.freeze(connections)",
]) if (!parser.includes(required)) throw new Error(`Garupa exact parser missing ${required}`);
for (const forbidden of ["../chartCore", legacyConverter, legacySimulatorSchema, "React", "pixi.js", "@tauri-apps"]) {
  if (parser.includes(forbidden) || adapter.includes(forbidden)) throw new Error(`Garupa assembly dependency escaped: ${forbidden}`);
}

const capability = read("public/capabilities.ts");
for (const required of [
  'garupaJsonDirectChartAdapter: "closed-portable"',
  'garupaJsonSvAndTimingGroup: "ignored-product-extension"',
  'unsupportedExGarupaSlide: "open-evidence-required"',
]) if (!capability.includes(required)) throw new Error(`Garupa capability missing ${required}`);
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
if (packageJson.scripts?.["simulator:test:garupa-json"] !==
    "node src/simulator/testing/runPublicGarupaJsonChartTests.mjs") {
  throw new Error("Garupa JSON standalone script is not registered");
}
const runner = read("testing/runTotalRevalidationTests.mjs");
if ((runner.match(/\["garupa-json-direct-chart", "runPublicGarupaJsonChartTests\.mjs"/g) ?? []).length !== 2) {
  throw new Error("Garupa JSON leaf is not present in both quick and full DAGs");
}
console.log("Garupa JSON static boundaries passed");

function read(relative) {
  return readFileSync(join(root, relative), "utf8");
}
