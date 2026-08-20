import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const contracts = read("src/simulator/public/contracts.ts");
const recipe = read("src/simulator/assembly/sessionRecipe.ts");
const settings = read("src/simulator/engine/data/originalLiveSettings.ts");
const primary = read("src/simulator/engine/managers/primaryJudgementAdjustmentOwner.ts");
const manager = read("src/simulator/engine/managers/inGameManager.ts");
const noteManager = read("src/simulator/engine/managers/noteManager.ts");
const render = read("src/simulator/engine/rendering/renderCommandProducer.ts");
const tap = read("src/simulator/engine/managers/tapLaneEffectOwner.ts");
const visibleManifest = read("src/simulator/backends/resources/currentOrdinaryVisibleResourceManifest.ts");
const productProfile = read("src/simulator/engine/garupa/productChartProfile.ts");
const productRender = read("src/simulator/engine/garupa/productRenderProducer.ts");
const movie = read("src/simulator/engine/movie/inGameMovieManager.ts");
const pixiMovie = read("src/simulator/backends/pixi/pixiMvLiveBackend.ts");
const platform = read("src/simulator/platform/platformComposition.ts");

for (const required of [
  "readonly judgementAdjustValue: number;", "readonly judgementAdjustValueB: number;",
  "readonly syncLine: boolean;", "readonly noteColor: boolean;",
  "readonly visibleTapLaneEffect: boolean;", "readonly mvDarkness: number;",
]) if (!contracts.includes(required)) throw new Error(`Schema 12 Public setting missing: ${required}`);
for (const required of [
  "readonly schemaVersion: 12;", "schemaVersion: 12 as const",
  '"audio,highFrequencyMode,inputMode,judgementAdjustValue,judgementAdjustValueB,mvDarkness,noteColor,sessionMode,skin,syncLine,visibleTapLaneEffect,visual"',
  "originalLiveSettingsIdentity === initial.value.originalLiveSettingsIdentity",
]) if (!recipe.includes(required)) throw new Error(`Schema 12 recipe gate missing: ${required}`);
for (const forbidden of ["judgeOffsetFrames", "offsetMs", "effectEnable", "mvAlphaPercent"]) {
  if ((contracts + recipe).includes(forbidden)) throw new Error(`legacy Public alias remains: ${forbidden}`);
}
for (const required of [
  "JUDGEMENT_ADJUST_VALUE_MIN = -30", "JUDGEMENT_ADJUST_VALUE_MAX = 30",
  "JUDGEMENT_ADJUST_VALUE_B_MIN = -5", "JUDGEMENT_ADJUST_VALUE_B_MAX = 5",
  "[0, 10, 20, 30, 40, 50, 60, 70]", "originalLiveSettingsIdentity",
]) if (!settings.includes(required)) throw new Error(`current domain/identity missing: ${required}`);
for (const required of [
  '"waiting-music"', '"waiting-gameplay"', '"move-time-bypassed"',
  "this.fastCounterValue += 1", "this.slowCounterValue += 1", "OLS-R02",
]) if (!primary.includes(required)) throw new Error(`Primary owner missing: ${required}`);
if (!manager.includes("consumeGameplayGate") || !manager.includes("stepPlayableMovie")) {
  throw new Error("Primary/gameplay and post-start movie ordering are not explicit");
}
for (const required of [
  "!this.inGameCalculatedData.isSyncLineEnabled", "suppressedOrdinarySyncLinePairCountValue",
  "this.inGameCalculatedData.noteColor",
]) if (!noteManager.includes(required)) throw new Error(`Note setting consumer missing: ${required}`);
for (const required of [
  "noteColor && information.shortRhythmUnder8beat", "note_normal_16",
  "preflightTapLaneEffectSetup", "preflightTapLaneEffectUpdate", "tap-lane-effect",
]) if (!render.includes(required)) throw new Error(`render setting consumer missing: ${required}`);
for (const required of [
  "const SLOT_COUNT = 13", "const OFF_RESERVE_UPDATES = 2", "const FADE_FRAMES = 10",
  "[0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 0]", "preflightInputEvents", "preflightJudgement", "preflightAllOff",
]) if (!tap.includes(required)) throw new Error(`tap lane owner missing: ${required}`);
for (const hash of [
  "14AA04909EB54FAF55A479B512D8AF5E8745AEAC7F330CA9F2EE2B7353B09F3D",
  "0683902F48E0CE8662B716227FDCA5DDFFECC979DCB1BC1C70AB2A5BB21CE113",
  "D53F90B1F97D5ACFB461A46E3BF2250B07191A6E5BFACED6166A3A27E53FD0CA",
  "5710C5079FCCDE25C2638074AFDD8FFE5A3B8305FF5BCAD1986DE82F4EF43B48",
]) if (!visibleManifest.includes(hash)) throw new Error(`tap lane resource hash missing: ${hash}`);
for (const required of ["syncPairs", "freezeProductSyncPairs", "shortRhythmUnder8beat"]) {
  if (!productProfile.includes(required)) throw new Error(`product sidecar identity missing: ${required}`);
}
for (const required of [
  "garupa-product-sync-line", "garupa-product-tap-lane-effect", "NoteLaneEffect_4",
  "this.visibleTapLaneEffect", "this.syncLine", "note_normal_16",
]) if (!productRender.includes(required)) throw new Error(`product narrow projection missing: ${required}`);
for (const required of [
  "Math.fround(0.8)", "Math.fround(this.mvDarkness / 100)", "fadeInDarkCover",
  "advanceDarkCover", "hideDarkCover",
]) if (!movie.includes(required)) throw new Error(`MV darkness owner missing: ${required}`);
for (const required of [
  "GarupaSimulatorMvLiveDarkCover", "sprite.alpha = 1", "setDarkCover", "movieSpriteAlpha",
]) if (!pixiMovie.includes(required)) throw new Error(`Pixi dark-cover separation missing: ${required}`);
const skinAssembly = platform.indexOf("const assembly = await assembleSimulatorResources");
const movieConstruct = platform.indexOf("new PixiMvLiveBackend");
if (skinAssembly < 0 || movieConstruct < 0 || skinAssembly >= movieConstruct) {
  throw new Error("selected resources must remain assembled before Movie backend construction");
}
console.log("original Live settings static boundary verified: Schema12/A+B/SyncLine/NoteColor/TapLane/MvDarkness/product projection/atomic order");
