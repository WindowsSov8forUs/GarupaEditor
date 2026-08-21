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
const startupAudioOwner = read("engine/audio/startupAudioOwner.ts");
const platform = read("platform/platformComposition.ts");
const presentationContract = read("assembly/startupPresentationContract.ts");
const presentationDerivation = read("assembly/sessionPresentationDerivation.ts");
const resourceAssembly = read("assembly/resourceAssembly.ts");
const publicBarrel = read("public/index.ts") + read("index.ts");

for (const required of [
  "readonly presentation: SimulatorPresentationPackage;",
  "readonly schemaVersion: 12;",
  'Object.keys(request).sort().join(\",\") !== \"chartData,config,presentation\"',
  '"move-time-reconstruction"',
]) {
  if (!(contracts + recipe + controller).includes(required)) throw new Error(`startup required boundary missing: ${required}`);
}
for (const state of ["Prepare: 0", "OPFirstAnimStart: 1", "OPFirstAnimEnd: 2", "OPLastAnimStart: 3", "PlayingNone: 4", "PlayingSound: 5"]) {
  if (!read("engine/data/inGameState.ts").includes(state)) throw new Error(`startup state missing: ${state}`);
}
for (const evidence of ["SD03", "SD05", "SD06", "SD07", "SD08", "SD09", "SD11", "SD12", "SD13", "SD14", "SD15", "SD16", "SDN01", "SDN02", "SDN03", "SDN04"]) {
  if (!joined.includes(evidence)) throw new Error(`startup evidence consumption missing: ${evidence}`);
}
for (const required of [
  "deriveSessionPresentation", "getStartupDirectionCommonResources",
  "createPixiStartupDirectionScene", "liveStartVoiceCue: null", "purpose",
]) if (!platform.includes(required)) throw new Error(`production startup composition missing: ${required}`);
for (const required of [
  'isExactObject(value, "difficulty,jacketPng,mv,song,stage")',
  'isExactObject(presentation.stage, "backdropPng")',
  "startup characters and live-start voice are absent simulator-owned resources",
]) if (!presentationContract.includes(required)) throw new Error(`caller-free absent-startup-asset boundary missing: ${required}`);
for (const required of [
  "readonly sdCharacters: readonly [];", "Object.freeze([]) as readonly []",
]) if (!presentationDerivation.includes(required)) throw new Error(`empty SD collection mapping missing: ${required}`);
if (!resourceAssembly.includes("prepareLeasedAudioResources") || /PreparedLiveStartVoice|liveStartVoice/.test(resourceAssembly)) {
  throw new Error("resource assembly must build leased BGM/SE only and keep live-start voice absent");
}
for (const [source, forbidden] of [
  [contracts, ["SimulatorProductLaneCount", "liveStartVoiceMp3", "sdCharacterAtlases"]],
  [presentationContract, ["liveStartVoiceMp3", "sdCharacterAtlases"]],
  [presentationDerivation, ["PreparedLiveStartVoice", "deriveVoice(", "AudioResourcePreflightAdapter", "inspectMp3FirstFrame"]],
  [resourceAssembly, ["PreparedLiveStartVoice", "liveStartVoice.logicalId", "liveStartVoice.bytes"]],
]) for (const symbol of forbidden) if (source.includes(symbol)) {
  throw new Error(`retired caller startup asset path remains: ${symbol}`);
}
for (const required of [
  "preflightStartupOpening", "preflightEnterStartupPlaying",
  '"bgm.prepare-paused"', '"gaya.start"', '"gaya.fade-stop-at-zero"',
  '"gaya.fade-null-safe"', '"bgm.resume"', '"live-voice.release"',
  'purpose !== "move-time-reconstruction"', 'mode.sessionMode === "live"',
]) if (!(startupAudioOwner + joined).includes(required)) throw new Error(`startup audio owner missing: ${required}`);

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
if (publicBarrel.includes("SimulatorEngineBuildPurpose") || publicBarrel.includes("StartupDirectionPurpose") ||
  publicBarrel.includes("StartupAudioPurpose")) {
  throw new Error("simulator-owned startup purpose escaped through Public barrel");
}
const fixture = JSON.parse(readFileSync(join(
  testingRoot, "fixtures/reverse-snapshots/startup-direction/artifacts/investigations/startup-direction-runtime-contract-10-1-4/startup_direction_runtime_contract.json",
), "utf8"));
if (fixture.schema_version !== 2 || fixture.evidence.filter((row) => /^SD/.test(row.id)).length !== 16) {
  throw new Error("startup SD01-SD16 fixture contract changed");
}
const nullAssets = JSON.parse(readFileSync(join(
  testingRoot, "fixtures/reverse-snapshots/startup-direction/artifacts/investigations/startup-direction-null-session-assets-10-1-4/startup_direction_null_session_assets_contract.json",
), "utf8"));
if (nullAssets.status !== "closed-static-portable-null-route" ||
  nullAssets.portable_contract?.sd_character_atlases_public_value !== null ||
  nullAssets.portable_contract?.sd_character_internal_collection !== "owned-frozen-empty-non-null" ||
  nullAssets.portable_contract?.sd_character_visual_count !== 0 ||
  nullAssets.portable_contract?.sd_intro_wait_seconds !== 3 ||
  nullAssets.portable_contract?.live_start_voice_mp3_public_value !== null ||
  nullAssets.portable_contract?.live_start_voice_resource !== null ||
  nullAssets.portable_contract?.stage_backdrop_required !== true ||
  nullAssets.portable_contract?.startup_timing_changed !== false ||
  nullAssets.portable_contract?.placeholder_assets_allowed !== false ||
  nullAssets.closure?.production_authorization !== true ||
  Object.entries(nullAssets.closure ?? {}).some(([key, value]) => key.endsWith("_count") && value !== 0)) {
  throw new Error("startup SDN01-SDN04 literal-null fixture closure changed");
}
const callgraph = JSON.parse(readFileSync(join(
  testingRoot, "fixtures/reverse-snapshots/startup-audio/artifacts/investigations/startup-audio-callgraph-10-1-4/startup_audio_callgraph.json",
), "utf8"));
const closure = callgraph.closure ?? {};
const closed = contracts.includes('readonly startupDirectionPortable: "closed-portable";');
if (closed && (
  closure.reachable_unclassified_count !== 0 || closure.unknown_predicate_count !== 0 ||
  closure.missing_resource_count !== 0 || closure.runtime_hook_failure_count !== 0 ||
  closure.production_authorization !== true
)) throw new Error("startup capability closed without zero-count authorized complete callgraph");
console.log(`startup direction static boundary verified: production-files=${productionFiles.length} SD=16 SDN=4 schema=12 caller-startup-assets=0 callgraph=${closed ? "closed-authorized" : "open"}`);

function read(path) { return readFileSync(join(simulatorRoot, path), "utf8"); }
function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && statSync(path).isFile()) yield path;
  }
}
