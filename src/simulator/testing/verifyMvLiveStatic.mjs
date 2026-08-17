import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testingRoot = dirname(fileURLToPath(import.meta.url));
const simulatorRoot = resolve(testingRoot, "..");
const contracts = read("public/contracts.ts");
const publicIndex = read("public/index.ts") + read("index.ts");
const capabilities = read("public/capabilities.ts");
const recipe = read("assembly/sessionRecipe.ts");
const platform = read("platform/platformComposition.ts");
const startup = read("engine/managers/startupDirectionController.ts");
const startupAudio = read("engine/audio/startupAudioOwner.ts");
const combined = read("backends/pixi/pixiCombinedScene.ts");
const movieFiles = [
  "assembly/sessionMvDerivation.ts",
  "backends/movieContracts.ts",
  "backends/movieValidation.ts",
  "backends/movie/browserMovieResourcePreflightAdapter.ts",
  "backends/pixi/pixiMvLiveBackend.ts",
  "backends/recordingMovieBackend.ts",
  "engine/movie/inGameMovieManager.ts",
  "engine/movie/mvBackgroundModule.ts",
].map(read).join("\n");
const fixtureRoot = join(
  testingRoot,
  "fixtures/reverse-snapshots/mv-live/artifacts/investigations",
);
const closure = JSON.parse(readFileSync(join(
  fixtureRoot,
  "mv-live-runtime-contract-10-1-4/mv_live_closure.json",
), "utf8"));
const portable = JSON.parse(readFileSync(join(
  fixtureRoot,
  "mv-live-portable-media-profile-10-1-4/mv_live_portable_media_profile.json",
), "utf8"));

for (const required of [
  "SimulatorPresentationMvPackage",
  "readonly bytes: Uint8Array;",
  "readonly musicStartDelayMilliseconds: number;",
  "readonly mv: SimulatorPresentationMvPackage | null;",
  "readonly schemaVersion: 5;",
]) if (!(contracts + recipe).includes(required)) throw new Error(`MV Public/schema boundary missing: ${required}`);
for (const required of [
  'mvLivePortable: "closed-portable" as const',
  "simulator.mv-live.unsupported-rehearsal-mode",
  "deriveSessionMvResource",
  "BrowserMovieResourcePreflightAdapter",
  "PixiMvLiveBackend",
]) if (!(capabilities + recipe + platform).includes(required)) throw new Error(`MV gate/composition missing: ${required}`);
for (const required of [
  "GameState.MovieBeforeSound",
  'case "movie-before-sound"',
  "startBeforeSound",
  "startAfterSound",
  "mvBackground !== null",
]) if (!(startup + startupAudio).includes(required)) throw new Error(`MV startup owner missing: ${required}`);
for (const required of [
  "PIXI_MV_LIVE_STAGE_LABEL",
  "mvStageParentIsRoot",
  "movie?.stage",
]) if (!(combined + platform).includes(required)) throw new Error(`MV Pixi hierarchy missing: ${required}`);
for (const forbidden of [
  /\bfetch\s*\(/,
  /\b(?:setTimeout|setInterval)\s*\(/,
  /Math\.random\s*\(/,
  /GirlsBandParty-Reverse|testing[\\/]fixtures|reverse-snapshots/,
  /\.usm(?:\.bytes)?/i,
  /CRI\s*Mana|StarCriMana/i,
  /stageFallback|fallbackToStage|staticFrameFallback/i,
  /hold\.start-loop|se\.play-one-shot|SE_RHYTHM_GAYA/,
]) if (forbidden.test(movieFiles)) throw new Error(`MV production forbidden dependency/fallback: ${forbidden}`);
if (!movieFiles.includes("video.muted = true") || !movieFiles.includes("video.loop = false") ||
  !movieFiles.includes("video.playsInline = true") || !movieFiles.includes("video.autoplay = false") ||
  !movieFiles.includes("URL.revokeObjectURL") || !movieFiles.includes("new VideoSource")) {
  throw new Error("MV production local muted non-looping browser owner is incomplete");
}
if (publicIndex.includes("SimulatorMovieBackend") || publicIndex.includes("HTMLVideoElement") ||
  publicIndex.includes("PixiMvLiveBackend") || publicIndex.includes("MoviePreparedResource")) {
  throw new Error("MV internal backend/media handle escaped through Public barrel");
}
if (movieFiles.includes("publishMoveTimeAudio") || platform.includes("new PixiMvLiveBackend(moveTimeCandidate)")) {
  throw new Error("Excluded Practice MV MoveTime must not manufacture a video candidate route");
}
for (const field of [
  "reachable_unclassified_count", "unknown_mode_predicate_count",
  "unknown_delay_branch_count", "missing_runtime_route_count",
  "missing_lifecycle_edge_count", "missing_resource_or_media_profile_count",
  "portable_mapping_gap_count", "runtime_hook_failure_count",
]) if (closure[field] !== 0) throw new Error(`MV closure is not zero: ${field}`);
if (closure.production_authorization !== true || closure.r2_used !== false ||
  closure.rejected_trace_consumption !== false) throw new Error("MV closure authorization boundary changed");
if (portable.production_authorization !== true || portable.capability.CRI_USM_codec_equivalence_claimed !== false ||
  portable.browser_contract.network_fallback_allowed !== false ||
  portable.browser_contract.stage_fallback_allowed !== false ||
  JSON.stringify(portable.browser_contract.accepted_containers) !== JSON.stringify(["mp4", "webm"])) {
  throw new Error("MV portable media authorization boundary changed");
}
const capabilityClosed = contracts.includes('readonly mvLivePortable: "closed-portable";') ||
  capabilities.includes('mvLivePortable: "closed-portable" as const');
if (capabilityClosed && (capabilities.includes("MV_LIVE_CLOSURE_CAPABILITY") ||
  recipe.includes("isMvLive" + "ClosureOpen"))) {
  throw new Error("MV capability cannot be closed while the temporary production gate remains");
}
console.log(`MV Live static boundary verified: production-files=${countProductionTs()} closure=0 capability=${capabilityClosed ? "closed" : "open-temporary"} MP4/WebM local-only`);

function read(path) { return readFileSync(join(simulatorRoot, path), "utf8"); }
function countProductionTs() {
  return [...walk(simulatorRoot)].filter((path) => !path.includes(`${join("simulator", "testing")}`) && extname(path) === ".ts").length;
}
function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}
