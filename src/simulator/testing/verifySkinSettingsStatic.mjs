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
const selector = read("resources/skinResourceSelector.ts") + read("resources/staticResourceSelector.ts");
const resourceAssembly = read("assembly/resourceAssembly.ts");
const assembly = resourceAssembly + read("assembly/skinRenderPreparation.ts") + read("assembly/skinAudioPreparation.ts") + read("assembly/skinParticlePreparation.ts") + read("backends/resources/particleResourcePreparation.ts");
const composition = read("platform/platformComposition.ts");
const fieldOwner = read("engine/managers/inGameManager.ts");
const skinManifest = read("backends/resources/currentSkinResourceManifest.ts");
const lifecycle = read("assembly/sessionRecipe.ts") + read("public/capabilities.ts");
const actualAcceptance = read("testing/renderPixi.test.ts") + read("testing/skinSettingsWebView2.test.ts") +
  read("testing/skinProductionComposition.test.ts") + read("testing/runSkinSettingsWebView2Tests.mjs");

for (const symbol of [
  "SimulatorOriginalSkinSettings",
  "SimulatorSpecialSkinSelection",
  "SimulatorSpecialSkinComponentStates",
  'readonly skin: SimulatorOriginalSkinSettings;',
]) if (!contracts.includes(symbol)) throw new Error(`Skin Public symbol missing: ${symbol}`);
for (const required of [
  "readonly schemaVersion: 12;",
  '"audio,highFrequencyMode,inputMode,judgementAdjustValue,judgementAdjustValueB,mvDarkness,noteColor,sessionMode,skin,syncLine,visibleTapLaneEffect,visual"',
  "validateAndFreezeOriginalSkinSettings",
]) if (!recipe.includes(required)) throw new Error(`Schema 12 Skin recipe boundary missing: ${required}`);
for (const forbidden of ["judgeSkinId", "judgeType", "ripName", "http://", "https://"]) {
  if ((contracts + skinContracts + catalog + validation + resolver + derivation + selector + assembly + composition).includes(forbidden)) {
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
  "canonicalIdentity",
]) if (!resolver.includes(required)) throw new Error(`Skin resolver marker missing: ${required}`);
if ((skinContracts + resolver + selector + skinManifest).includes("structuralStage") ||
  (skinContracts + resolver + selector + skinManifest).includes("ingameskin/stageskin/") ||
  skinContracts.includes('"mode-stage"')) {
  throw new Error("Live2D-only structural stage leaked into current Standard/MV Skin contracts, recipe or manifest");
}
const assemblyCallIndex = composition.indexOf("const assembly = await assembleSimulatorResources(");
const movieConstructionIndex = composition.indexOf("new PixiMvLiveBackend(");
const moviePrepareIndex = composition.indexOf("await movie.prepare(");
if (assemblyCallIndex < 0 || movieConstructionIndex <= assemblyCallIndex || moviePrepareIndex <= movieConstructionIndex) {
  throw new Error("MV Movie backend construction/prepare must follow selected Skin resource assembly");
}
const assemblyFailureIndex = composition.indexOf('if (assembly.status === "rejected")', assemblyCallIndex);
const assemblyFailureBlock = composition.slice(assemblyFailureIndex, movieConstructionIndex);
if (assemblyFailureIndex < 0 || !assemblyFailureBlock.includes("releasePendingMovie()") ||
  assemblyFailureBlock.includes("movie.dispose")) {
  throw new Error("Selected Skin assembly failure must release only the pending movie resource before any Movie backend exists");
}
const moviePrepareFailureEnd = composition.indexOf("pendingMovieOwned = false", moviePrepareIndex);
const moviePrepareFailureBlock = composition.slice(moviePrepareIndex, moviePrepareFailureEnd);
if (moviePrepareFailureEnd < 0 ||
  !moviePrepareFailureBlock.includes("disposeAssembly(assembly.value, movie)") ||
  !moviePrepareFailureBlock.includes("releasePendingMovie()")) {
  throw new Error("MV Movie prepare failure must release assembly backends and the still-pending movie resource");
}
const selectedSkinPackIndex = resourceAssembly.indexOf("const skinPortablePacks = await prepareSelectedSkinPortablePacks(");
for (const backendPrepare of [
  "const renderReady = await targets.rendering.backend.prepare(",
  "const audioReady = await targets.audio.backend.prepare(",
  "const particleReady = await targets.particles.backend.prepare(",
  "const particleRendererReady = await targets.particles.renderer.prepare(",
]) {
  const backendPrepareIndex = resourceAssembly.indexOf(backendPrepare);
  if (selectedSkinPackIndex < 0 || backendPrepareIndex <= selectedSkinPackIndex) {
    throw new Error(`selected Skin pack validation must precede backend mutation: ${backendPrepare}`);
  }
}
for (const required of [
  "selectResolvedSkinResourceInventory",
  "skinPortableResourceKey",
  "habahiro-change-flash",
  "skin: selectResolvedSkinResourceInventory(skinRecipe)",
  "validateSkinResourceSelection",
  "deriveSessionSkinRecipe",
  "selectSimulatorStaticResources(chart.value, skin.value)",
  "prepareSelectedSkinPortablePacks",
  "prepareSkinRenderOverlay",
  "current-official-portable",
  "syncLineEdgeMargin: selection.skin.resolved.note.noteSyncEdgeMargin",
  "prepareSkinAudioOverlay",
  "replacement.size !== 9",
  "skinByRecipe",
  "skinRecipeIdentity: assembly.value.skinRecipeIdentity",
  "fresh.value.skinRecipeIdentity === initial.value.skinRecipeIdentity",
  "selectedSkinGate",
  "prepareSkinParticleProvider",
  "readPreparedSkinPack",
  "validateSelectedSkinParticlePack",
  "selected-skin-portable-textures",
]) if (!(selector + assembly + composition + lifecycle).includes(required)) throw new Error(`Skin selection/assembly marker missing: ${required}`);
for (const required of [
  "this.renderScene?.field !== undefined",
  "this.renderProducer?.preflightFieldSetup(",
  "this.renderScene.field.objects",
  "this.renderScene.field.masks",
  "fieldSetup.value.commit()",
]) if (!fieldOwner.includes(required)) throw new Error(`selected Field runtime owner missing: ${required}`);
for (const required of [
  'roles=note/field/judge/background',
  'producer.preflightFieldSetup(field.objects, field.masks)',
  'app.renderer.extract.pixels',
  'backgroundExpected ? ["note", "field", "judge", "background"]',
  'fieldCleanup',
  'rgbaSha256',
  'runComposition("default")',
  'runComposition("limited3")',
  'resources=${entries.length}',
]) if (!actualAcceptance.includes(required)) throw new Error(`selected Skin actual acceptance missing: ${required}`);
for (const forbidden of ["value.fieldBindings !== true", "value.background !== true"]) {
  if (actualAcceptance.includes(forbidden)) throw new Error(`boolean-only Skin acceptance survived: ${forbidden}`);
}

const production = collect(simulatorRoot).filter((path) => !path.includes(`${join("simulator", "testing")}`));
for (const path of production) {
  const text = readFileSync(path, "utf8");
  for (const forbidden of ["../skinLoader", "../../skinLoader", "noteSkinAssetTool", "services/bestdori", "data/judge-type-rip-map"]) {
    if (text.includes(forbidden)) throw new Error(`Skin production dependency escape: ${path}: ${forbidden}`);
  }
}
console.log("Skin settings static boundary verified: Schema 12 aggregate-only catalog/resolver, HAB/MV/mode routes, no transport or independent Judge");

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
