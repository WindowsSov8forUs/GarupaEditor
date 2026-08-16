import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const simulatorRoot = resolve(testingRoot, "..");
const productionFiles = [...walk(simulatorRoot)].filter((path) =>
  !path.includes(`${join("simulator", "testing")}`) && path.endsWith(".ts"));
const joined = productionFiles.map((path) => readFileSync(path, "utf8")).join("\n");
const contracts = read("public/contracts.ts");
const recipe = read("assembly/sessionRecipe.ts");
const controller = read("engine/managers/startupDirectionController.ts");
const platform = read("platform/platformComposition.ts");
const publicBarrel = read("public/index.ts") + read("index.ts");

for (const required of [
  "readonly presentation: SimulatorPresentationPackage;",
  "readonly liveStartVoiceMp3: Uint8Array | null;",
  "readonly schemaVersion: 4;",
  'Object.keys(request).sort().join(\",\") !== \"chartData,config,presentation\"',
  '"move-time-reconstruction"',
]) {
  if (!(contracts + recipe + controller).includes(required)) throw new Error(`startup required boundary missing: ${required}`);
}
for (const state of ["Prepare: 0", "OPFirstAnimStart: 1", "OPFirstAnimEnd: 2", "OPLastAnimStart: 3", "PlayingNone: 4", "PlayingSound: 5"]) {
  if (!read("engine/data/inGameState.ts").includes(state)) throw new Error(`startup state missing: ${state}`);
}
for (const evidence of ["SD03", "SD05", "SD06", "SD07", "SD08", "SD09", "SD11", "SD12", "SD13", "SD14", "SD15", "SD16"]) {
  if (!joined.includes(evidence)) throw new Error(`startup evidence consumption missing: ${evidence}`);
}
for (const required of [
  "deriveSessionPresentation", "getStartupDirectionCommonResources",
  "createPixiStartupDirectionScene", "liveStartVoiceCue", "purpose",
]) if (!platform.includes(required)) throw new Error(`production startup composition missing: ${required}`);

const forbiddenPatterns = [
  /fontFamily\s*:\s*["'](?:Arial|sans-serif|system-ui)["']/,
  /\bMath\.random\s*\(/,
  /\bsetTimeout\s*\(/,
  /\bDate\.now\s*\(/,
  /["'](?:READY|GO)["']/,
  /from\s+["'][^"']*(?:testing|tmp|GirlsBandParty-Reverse)[^"']*["']/,
];
for (const pattern of forbiddenPatterns) {
  if (pattern.test(joined)) throw new Error(`startup forbidden fallback/ambient dependency: ${pattern}`);
}
if (publicBarrel.includes("SimulatorEngineBuildPurpose") || publicBarrel.includes("StartupDirectionPurpose")) {
  throw new Error("simulator-owned startup purpose escaped through Public barrel");
}
const fixture = JSON.parse(readFileSync(join(
  testingRoot, "fixtures/reverse-snapshots/startup-direction/artifacts/investigations/startup-direction-runtime-contract-10-1-4/startup_direction_runtime_contract.json",
), "utf8"));
if (fixture.schema_version !== 2 || fixture.evidence.filter((row) => /^SD/.test(row.id)).length !== 16) {
  throw new Error("startup SD01-SD16 fixture contract changed");
}
console.log(`startup direction static boundary verified: production-files=${productionFiles.length} SD=16 schema=4`);

function read(path) { return readFileSync(join(simulatorRoot, path), "utf8"); }
function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && statSync(path).isFile()) yield path;
  }
}
