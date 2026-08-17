import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repositoryRoot = process.cwd();
const simulatorRoot = resolve(repositoryRoot, "src", "simulator");
const publicContracts = read("public/contracts.ts");
const publicIndex = read("index.ts");
const forbiddenPublicSymbols = [
  "SimulatorSessionGameplayData", "chartData.gameplay", "readonly gameplay:",
  "readonly initialLife:", "readonly playerMaxLife:", "readonly lifeUpperLimit:",
  "readonly missDamage:", "readonly badDamage:",
];
for (const forbidden of forbiddenPublicSymbols) {
  if (publicContracts.includes(forbidden) ||
      (["SimulatorSessionGameplayData", "chartData.gameplay"].includes(forbidden) && publicIndex.includes(forbidden))) {
    throw new Error(`caller-authored Life remains Public: ${forbidden}`);
  }
}
for (const required of [
  "readonly chart: GarupaChartJson;", "readonly bgm: Uint8Array;", "readonly isFullLength: boolean;",
]) if (!publicContracts.includes(required)) throw new Error(`Public chart field missing: ${required}`);
for (const forbidden of ["SimulatorProductLaneCount", "readonly laneCount:"]) {
  if (publicContracts.includes(forbidden)) throw new Error(`invented Public lane field remains: ${forbidden}`);
}

const recipe = read("assembly/sessionRecipe.ts");
for (const required of [
  "readonly schemaVersion: 7;", "schemaVersion: 7 as const",
  '"bgm,chart,isFullLength"', 'typeof request.chartData.isFullLength !== "boolean"',
  "isFullLength: request.chartData.isFullLength",
]) if (!recipe.includes(required)) throw new Error(`recipe full-length boundary missing: ${required}`);
for (const forbidden of ["isGameplayShape", "deepFreezeClone", "invalid-session-gameplay-data"]) {
  if (recipe.includes(forbidden)) throw new Error(`legacy gameplay recipe owner remains: ${forbidden}`);
}

const profile = read("engine/data/currentSinglePlayLifeProfile.ts");
for (const required of [
  "ORDINARY_SINGLE_PLAY_INITIAL_LIFE = 1000",
  "ORDINARY_SINGLE_PLAY_PLAYER_MAX_LIFE = 1000",
  "ORDINARY_SINGLE_PLAY_LIFE_UPPER_LIMIT = 2000",
  "isFullLength ? -50 : -100",
  "isFullLength ? -25 : -50",
  'typeof isFullLength !== "boolean"',
  "PLP-E01/PLP-E02",
  "PLP-E03..PLP-E06",
]) if (!profile.includes(required)) throw new Error(`internal Life owner missing: ${required}`);

const platform = read("platform/platformComposition.ts");
if (!platform.includes("createCurrentSinglePlayLifeProfile(request.chartData.isFullLength)") ||
    platform.includes("request.chartData.gameplay")) {
  throw new Error("production composition does not exclusively consume internal Life profile");
}
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
if (packageJson.scripts?.["simulator:test:public-life-profile"] !==
    "node src/simulator/testing/runPublicLifeProfileTests.mjs") {
  throw new Error("Public Life standalone script is not registered");
}
const totalRunner = read("testing/runTotalRevalidationTests.mjs");
if ((totalRunner.match(/\["public-life-profile", "runPublicLifeProfileTests\.mjs"/g) ?? []).length !== 2) {
  throw new Error("Public Life leaf is not present in both quick and full DAGs");
}
console.log("Public Life profile static boundaries passed");

function read(relative) {
  return readFileSync(join(simulatorRoot, relative), "utf8");
}
