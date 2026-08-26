declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { launchSimulatorModule } from "../index";
import { createSimulatorModuleCapabilitySummary } from "../public/capabilities";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { ButtonType } from "../engine/chart/types";
import { AutonomousSimulatorModule } from "../runtime/autonomousSimulatorRuntime";
import {
  createRehearsalControlSceneLayout,
  resolveRehearsalControlTouch,
} from "../scene/rehearsalControlScene";
import { createOriginalSurfaceLayout } from "../scene/originalSurfaceLayout";
import { createPauseControlLayout } from "../scene/pauseControlScene";
import { ManualTouchPhase, type ManualInputFrame } from "../engine/data/manualInput";
import { LIVE_AUTO_MODE, REHEARSAL_AUTO_MODE } from "./modeFixtures";
import { DEFAULT_PUBLIC_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
import {
  createDefaultTestSkinSettings,
  createTestPresentationPackage,
} from "./startupPresentationTestProfile";
import {
  installSimulatorModuleLauncher,
  launchInstalledSimulatorModule,
  uninstallSimulatorModuleLauncher,
} from "../runtime/moduleEntryBinding";
import type {
  SimulatorFrameScheduler,
  SimulatorFrameSubscription,
  SimulatorFrameTick,
  SimulatorOwnedSession,
  SimulatorOwnedSessionFactory,
  SimulatorRuntimeInputBatch,
  SimulatorRuntimeInputSource,
} from "../runtime/contracts";
import {
  ImmutableSharedStaticResourceStore,
  type SharedStaticResourceResult,
} from "./legacySharedStaticResourceStore";
import { selectSimulatorStaticResources as selectStaticResourceInternal } from "./legacyStaticResourceSelector";
import { resolveOriginalSkinRecipe } from "../engine/skin/originalSkinResolver";
import {
  createSimulatorSessionRecipe,
  RecipeOwnedSessionFactory,
} from "../assembly/sessionRecipe";
import { ok } from "../engine/evidence";
import {
  prepareSharedAudioResources,
  prepareSharedOrdinaryRenderResources,
  prepareSharedScoreGaugeSsAnimationResource,
  prepareSharedScoreHudRenderResources,
} from "./legacySharedResourceAdapters";
import { CURRENT_AUDIO_TEST_PROFILE } from "./audioSessionBgmTestProfile";
import { validateConstructedChartCapabilities } from "../assembly/chartCapabilityValidation";
import { createProductionAutonomousSimulatorModule } from "../platform/platformComposition";
import type {
  SimulatorModuleCloseReport,
  SimulatorModuleLaunchRequest,
} from "../public/contracts";
import type { SimulatorAssemblyResult } from "./legacySharedResourceAdapters";
import type { SimulatorTimelineControlState } from "../host/portableReplaySession";

const TEST_SURFACE = Object.freeze({
  revision: 0,
  viewportWidth: 1600,
  viewportHeight: 720,
  safeArea: Object.freeze({ x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) }),
  origin: "bottom-left" as const,
});
const TEST_ORIGINAL_LAYOUT = requireOk(createOriginalSurfaceLayout(TEST_SURFACE, Math.fround(100)));
const TEST_CONTROL_LAYOUT = createRehearsalControlSceneLayout(TEST_ORIGINAL_LAYOUT);
const TEST_PAUSE_LAYOUT = requireOk(createPauseControlLayout(TEST_ORIGINAL_LAYOUT));

async function main(): Promise<void> {
  const beforeInstall = await launchSimulatorModule(request());
  assertPlatformUnavailable(beforeInstall);
  assertPlatformUnavailable(await launchSimulatorModule(null as unknown as SimulatorModuleLaunchRequest));
  assertPlatformUnavailable(await launchInstalledSimulatorModule(request()));

  await testSharedStore();
  await testMissingGayaFailsBeforeStoreRead();
  testSelector();
  await testOrdinaryPack();
  await testScoreHudPack();
  testRecipeOwnership();
  testGarupaProductExtensionRecipeBoundary();
  await testRecipeNaturalCompletion();
  await testProductionCompositionFailureBoundary();
  testConstructedChartEarlyCapabilityGates();
  await testAutonomousLaunchAndClose();
  await testSimulatorOwnedPauseRoute();
  await testSurfaceRevisionFailsBeforeInput();
  await testInvalidTickCloses();
  await testTerminalCleanupFailuresRemainSecondary();
  console.log("autonomous simulator module tests passed: public/store/selector/recipe/runtime/self-close/cleanup-faults");
}

async function testSharedStore(): Promise<void> {
  const caller = new Uint8Array([1, 2, 3]);
  const created = requireAccepted(ImmutableSharedStaticResourceStore.create([
    { resourceKey: "one", bytes: caller },
  ]));
  caller.fill(9);
  const first = requireAccepted(await created.read("one"));
  assert.deepEqual([...first], [1, 2, 3]);
  first.fill(8);
  assert.deepEqual([...requireAccepted(await created.read("one"))], [1, 2, 3]);
  assert.equal((await created.read("missing")).status, "rejected");
}

async function testMissingGayaFailsBeforeStoreRead(): Promise<void> {
  const chart = requireOk(createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#00111:01\n",
  }));
  const selected = selectSimulatorStaticResources(chart);
  let reads = 0;
  const store = {
    async read() {
      reads += 1;
      throw new Error("audio inventory rejection must precede shared-store reads");
    },
  } as any;
  const withoutGaya = selected.audioSe.filter((resource) =>
    resource.profile.cue !== "SE_RHYTHM_GAYA");
  const bgm = CURRENT_AUDIO_TEST_PROFILE.resources.find((resource) => resource.role === "bgm")!;
  const result = await prepareSharedAudioResources(
    { profile: bgm as any, bytes: new Uint8Array(bgm.byteLength) },
    withoutGaya,
    store,
  );
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.capability, "simulator.resources.audio-se-inventory");
  }
  assert.equal(reads, 0);
}

function testSelector(): void {
  const ordinary = requireOk(createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#00111:01\n",
  }));
  const ordinarySelection = selectSimulatorStaticResources(ordinary);
  assert.equal(ordinarySelection.audioSe.length, 15);
  assert.equal(ordinarySelection.particles.length, 9);
  assert.equal(ordinarySelection.scoreHud.length, 6);
  assert.ok(ordinarySelection.scoreGaugeSsAnimation.resourceKey.endsWith("score-gauge-ss-animation-profile.json"));
  assert.ok(ordinarySelection.scoreHud.every((row) =>
    row.resourceKey.startsWith("simulator-static/current-10.1.4/score-hud/")));
  assert.equal(ordinarySelection.rendering.kind, "ordinary");
  if (ordinarySelection.rendering.kind === "ordinary") {
    assert.equal(ordinarySelection.rendering.status, "selected");
    assert.equal(ordinarySelection.rendering.resources.length, 7);
    assert.equal(ordinarySelection.rendering.profileResource.profile.byteLength, 20287);
  }
  assert.ok(ordinarySelection.audioSe.every((row) =>
    row.resourceKey.startsWith("simulator-static/current-10.1.4/audio-se/")));

  const habBms = readFileSync(join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/chart-construction/fixtures/786_miracle_april_habahiro_special.txt",
  ), "utf8");
  const hab = requireOk(createNoteBatchInformationList({ musicScoreData: habBms }));
  const habSelection = selectSimulatorStaticResources(hab);
  assert.equal(habSelection.scoreHud.length, 6);
  assert.equal(habSelection.rendering.kind, "habahiro");
  if (habSelection.rendering.kind === "habahiro") {
    assert.equal(habSelection.rendering.resources.length, 11);
    assert.ok(habSelection.rendering.resources.every((row) =>
      row.resourceKey.startsWith("simulator-static/current-10.1.4/habahiro/")));
  }
}

async function testOrdinaryPack(): Promise<void> {
  const chart = requireOk(createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#00111:01\n",
  }));
  const selection = selectSimulatorStaticResources(chart).rendering;
  if (selection.kind !== "ordinary") throw new Error("ordinary route expected");
  const fixtureBase = join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/autonomous-module/artifacts/investigations/autonomous-simulator-portable-pack-10-1-4",
  );
  const manifest = JSON.parse(readFileSync(join(fixtureBase, "ordinary_portable_pack_manifest.json"), "utf8"));
  const fileById = new Map(manifest.assets.map((row: any) => [row.logicalAssetId, row.file]));
  const entries = [{
    resourceKey: selection.profileResource.resourceKey,
    bytes: new Uint8Array(readFileSync(join(fixtureBase, "ordinary_portable_profile.json"))),
  }, ...selection.resources.map((resource) => ({
    resourceKey: resource.resourceKey,
    bytes: new Uint8Array(readFileSync(join(fixtureBase, fileById.get(resource.profile.logicalAssetId)))),
  }))];
  const store = requireAccepted(ImmutableSharedStaticResourceStore.create(entries));
  const prepared = requireAccepted(await prepareSharedOrdinaryRenderResources(
    selection.profileResource,
    selection.resources,
    store,
  ));
  assert.equal(prepared.profile.assets.length, 7);
  assert.equal(prepared.profile.assets.reduce((count, asset) => count + asset.atlasRows.length, 0), 60);
  const firstAsset = prepared.profile.assets[0]!;
  assert.equal((await prepared.provider.read(firstAsset.logicalAssetId)).status, "ok");

  entries[1]!.bytes[0] ^= 0xff;
  const tamperedStore = requireAccepted(ImmutableSharedStaticResourceStore.create(entries));
  const tampered = await prepareSharedOrdinaryRenderResources(
    selection.profileResource,
    selection.resources,
    tamperedStore,
  );
  assert.equal(tampered.status, "rejected");
  if (tampered.status === "rejected") {
    assert.equal(tampered.failure.capability, "simulator.resources.ordinary-asset-integrity");
  }
}

async function testScoreHudPack(): Promise<void> {
  const chart = requireOk(createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#00111:01\n",
  }));
  const selection = selectSimulatorStaticResources(chart).scoreHud;
  const fixtureBase = join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/score-hud-rank-gauge/artifacts/investigations/score-hud-rank-gauge-10-1-4/portable-assets",
  );
  const entries = selection.map((resource) => ({
    resourceKey: resource.resourceKey,
    bytes: new Uint8Array(readFileSync(join(fixtureBase, resource.resourceKey.split("/").pop()))),
  }));
  const animation = selectSimulatorStaticResources(chart).scoreGaugeSsAnimation;
  entries.push({
    resourceKey: animation.resourceKey,
    bytes: new Uint8Array(readFileSync(join(
      process.cwd(),
      "src/simulator/testing/fixtures/reverse-snapshots/score-hud-rank-gauge/artifacts/investigations/score-hud-rank-gauge-10-1-4/score_gauge_ss_animation_profile.json",
    ))),
  });
  const store = requireAccepted(ImmutableSharedStaticResourceStore.create(entries));
  const prepared = requireAccepted(await prepareSharedScoreHudRenderResources(selection, store));
  assert.equal(prepared.assets.length, 6);
  assert.equal((await prepared.provider.read("hud/score/font-atlas")).status, "integrity-failure");
  assert.equal((await prepared.provider.read("hud/score/rank-label-font")).status, "ok");
  const animationProfile = requireAccepted(await prepareSharedScoreGaugeSsAnimationResource(animation, store));
  assert.equal(animationProfile.curveCount, 56);
  assert.equal(animationProfile.frames.length, 39);

  entries[0]!.bytes[0] ^= 0xff;
  const tamperedStore = requireAccepted(ImmutableSharedStaticResourceStore.create(entries));
  const tampered = await prepareSharedScoreHudRenderResources(selection, tamperedStore);
  assert.equal(tampered.status, "rejected");
  if (tampered.status === "rejected") {
    assert.equal(tampered.failure.capability, "simulator.resources.score-hud-asset-integrity");
  }
}

function testRecipeOwnership(): void {
  const source = request();
  const recipe = requireAccepted(createSimulatorSessionRecipe(source));
  source.chartData.bgm.fill(0);
  (source.chartData.chart[0] as { value: number }).value = 999;
  (source.chartData as { isFullLength: boolean }).isFullLength = true;
  (source.config.audio as { masterGain: number }).masterGain = 0;
  (source.config.skin as { noteSkin: number }).noteSkin = 6;
  assert.deepEqual([...recipe.request.chartData.bgm], [0xff, 0xfb, 0x90, 0x00]);
  assert.equal((recipe.request.chartData.chart[0] as { readonly value: number }).value, 120);
  assert.ok(Object.isFrozen(recipe.request.chartData.chart));
  assert.ok(Object.isFrozen(recipe.request.chartData.chart[0]));
  assert.equal(recipe.request.chartData.isFullLength, false);
  assert.equal(recipe.request.config.audio.masterGain, 1);
  assert.equal(recipe.request.config.skin.noteSkin, 0);
  assert.ok(Object.isFrozen(recipe.request.config.skin));
  assert.ok(Object.isFrozen(recipe.request.config.skin.special));
  assert.ok(Object.isFrozen(recipe));
  assert.ok(Object.isFrozen(recipe.request));
  assert.notEqual(recipe.request.chartData.bgm, source.chartData.bgm);
  assert.equal(recipe.schemaVersion, 13);
  assert.equal(recipe.request.chartData.isFullLength, false);

  const extra = { ...request(), extra: true } as unknown as SimulatorModuleLaunchRequest;
  const extraRecipe = requireAccepted(createSimulatorSessionRecipe(extra));
  assert.equal("extra" in extraRecipe.request, false);
  const legacyBms: any = request();
  legacyBms.chartData = { bmsText: "#BPM 120", bgm: legacyBms.chartData.bgm, isFullLength: false };
  assert.equal(createSimulatorSessionRecipe(legacyBms).status, "rejected", "required chart remains mandatory");
  const semanticExtras: any[] = [];
  const inventedLaneCount: any = request();
  inventedLaneCount.chartData.laneCount = 7;
  semanticExtras.push(inventedLaneCount);
  const malformedChart: any = request();
  malformedChart.chartData.chart[0].extra = true;
  semanticExtras.push(malformedChart);
  const legacyScore: any = request();
  legacyScore.chartData.gameplay = { score: { level: 27 } };
  semanticExtras.push(legacyScore);
  const callerRuleSet: any = request();
  callerRuleSet.chartData.gameplay = { ruleSet: "garupa-editor-normalized-10m-v1" };
  semanticExtras.push(callerRuleSet);
  const callerCount: any = request();
  callerCount.chartData.gameplay = { totalScoringUnitCount: 1 };
  semanticExtras.push(callerCount);
  const callerLife: any = request();
  callerLife.chartData.gameplay = { life: { initialLife: 1000 } };
  semanticExtras.push(callerLife);
  const legacyModes: any = request();
  legacyModes.config.playMode = "auto-live";
  legacyModes.config.practice = { enabled: true, startMilliseconds: 1 };
  semanticExtras.push(legacyModes);
  const callerDerived: any = request();
  callerDerived.config.isAutoPlay = true;
  semanticExtras.push(callerDerived);
  const callerHighAspect: any = request();
  callerHighAspect.config.visual.highAspectRatio = 1;
  semanticExtras.push(callerHighAspect);
  const independentJudge: any = request();
  independentJudge.config.skin.judgeSkinId = "skin_april2019";
  semanticExtras.push(independentJudge);
  for (const candidate of semanticExtras) {
    const semantic = requireAccepted(createSimulatorSessionRecipe(candidate));
    assert.equal("laneCount" in semantic.request.chartData, false);
    assert.equal("gameplay" in semantic.request.chartData, false);
    assert.equal("playMode" in semantic.request.config, false);
    assert.equal("isAutoPlay" in semantic.request.config, false);
    assert.equal("highAspectRatio" in semantic.request.config.visual, false);
    assert.equal("judgeSkinId" in semantic.request.config.skin, false);
    assert.equal("extra" in semantic.request.chartData.chart[0]!, false);
  }
  const invalidNormalSkin: any = request();
  invalidNormalSkin.config.skin.noteSkin = 7;
  assert.equal(createSimulatorSessionRecipe(invalidNormalSkin).status, "rejected");
  const invalidSpecialId: any = request();
  invalidSpecialId.config.skin.special = {
    kind: "collabo", seasonSpecialId: 37,
    components: specialComponentStates("on"),
  };
  assert.equal(createSimulatorSessionRecipe(invalidSpecialId).status, "rejected");
  const aggregate = request();
  (aggregate.config as any).skin.special = {
    kind: "limited", limitedSkinId: 2,
    components: specialComponentStates("on"),
  };
  const aggregateRecipe = requireAccepted(createSimulatorSessionRecipe(aggregate));
  const aggregateSpecial = aggregateRecipe.request.config.skin.special;
  assert.equal(aggregateSpecial.kind, "limited");
  if (aggregateSpecial.kind === "limited") {
    assert.ok(Object.isFrozen(aggregateSpecial.components));
    ((aggregate.config.skin.special as any).components as any).judge = "off";
    assert.equal(aggregateSpecial.components.judge, "on");
  }
}

function testGarupaProductExtensionRecipeBoundary(): void {
  const cases: readonly unknown[] = [
    { type: "SV", beat: 1, value: 2 },
    { type: "Single", beat: 1, lane: 1, width: 1, timingGroup: "#1" },
    { type: "Single", beat: 1, lane: 0.5, width: 1 },
    { type: "Single", beat: 1, lane: 6, width: 2 },
    { type: "Slide", connections: [{ type: "Single", beat: 1, lane: 1, width: 1 }] },
    { type: "Slide", connections: [
      { type: "Hidden", beat: 1, lane: 1, width: 1 },
      { type: "Single", beat: 2, lane: 2, width: 1 },
    ] },
    { type: "Slide", connections: [
      { type: "Single", beat: 1, lane: 1, width: 1 },
      { type: "Flick", beat: 2, lane: 2, width: 1 },
      { type: "Single", beat: 3, lane: 3, width: 1 },
    ] },
    { type: "Slide", connections: [
      { type: "Single", beat: 1, lane: 1, width: 1 },
      { type: "Hidden", beat: 1, lane: 2, width: 1 },
      { type: "Single", beat: 2, lane: 3, width: 1 },
    ] },
  ];
  for (const item of cases) {
    const candidate = request();
    (candidate.chartData.chart as unknown as unknown[]).splice(1, 1, item);
    const result = createSimulatorSessionRecipe(candidate);
    assert.equal(result.status, "accepted");
  }
  const globalOnly = request();
  (globalOnly.chartData.chart[1] as { timingGroup?: string }).timingGroup = "#Global";
  assert.equal(createSimulatorSessionRecipe(globalOnly).status, "accepted");
}

async function testRecipeNaturalCompletion(): Promise<void> {
  let initialized = false;
  let completed = false;
  let disposals = 0;
  const engine = {
    initialize: () => { initialized = true; return ok(undefined); },
    step: () => { completed = true; return ok(undefined); },
    resolveManualInputButton: () => ok(null),
    pause: () => ok(undefined),
    resume: () => ok(undefined),
    completeLiveAudio: () => ok(undefined),
    getNaturalCompletionClearStatus: () => completed ? 2 as const : null,
    getAdjustedMusicPosition: () => ok(1.25),
    snapshot: () => ok({
      adjustedMusicPosition: 1.25,
      director: { awakeComplete: initialized },
      managers: {
        state: initialized ? "initialized" : "created",
        fault: null,
        particle: {},
        scoreLifeState: {
          initialization: { totalScoringUnitCount: 10 },
          record: {
            score: 1234,
            currentLife: 900,
            currentCombo: 7,
            resultCounts: [0, 0, 0, 10, 0],
          },
        },
      },
      particleBackend: { state: "ready" },
    } as any),
    dispose: () => { disposals += 1; return ok(undefined); },
    backends: {} as any,
  };
  const factory = new RecipeOwnedSessionFactory({
    createFreshEngine: async () => accepted(engineBuild(engine as any)),
  });
  const session = requireAccepted(await factory.create(request()));
  const stepped = session.step(1 / 60, null, TEST_SURFACE.revision);
  assert.equal(stepped.status, "closed");
  if (stepped.status !== "closed") throw new Error("natural completion must close");
  assert.equal(stepped.report.reason, "completed");
  assert.equal(stepped.report.result?.clearStatus, 2);
  assert.equal(stepped.report.result?.combo, 7);
  assert.equal(stepped.report.capabilities.rendering, null);
  assert.equal(stepped.report.capabilities.background, "standard-current-portable");
  assert.equal(stepped.report.capabilities.skin, "default-current");
  assert.equal(stepped.report.capabilities.originalSkinSettings, "closed-static-portable");
  assert.equal(stepped.report.capabilities.originalLiveSettings, "closed-portable");
  assert.equal(stepped.report.capabilities.selectedSkinGate, "closed-static-portable");
  assert.equal(stepped.report.capabilities.liveRehearsalFourModeMatrix, "closed-portable");
  assert.equal(stepped.report.capabilities.startupDirectionPortable, "closed-portable");
  assert.equal(stepped.report.capabilities.mvLivePortable, "closed-portable");
  assert.equal(stepped.report.capabilities.standaloneMvView, "excluded");
  assert.equal(stepped.report.capabilities.star3DLiveView, "excluded");
  assert.equal(stepped.report.capabilities.rehearsalMoveTimeControls, "closed-portable");
  assert.equal(stepped.report.capabilities.nonzeroInitialPracticeSeek, "excluded");
  assert.equal(stepped.report.capabilities.button07SceneMapping, "closed-original-unreachable");
  assert.equal(stepped.report.capabilities.browserDecodeRaster, "closed-portable");
  assert.equal(stepped.report.capabilities.fixedDeviceExact, "open-objective-environment-blocked");
  assert.equal(stepped.report.capabilities.characterSkillFeverMultiplayer, "excluded");
  assert.equal(stepped.report.capabilities.mainProgramIntegration, "closed-product-integration");
  const repeatedClose = session.close("user-closed");
  assert.equal(repeatedClose, stepped.report, "repeated close returns the immutable first report");
  assert.equal(disposals, 1);
}

async function testProductionCompositionFailureBoundary(): Promise<void> {
  assert.equal(createProductionAutonomousSimulatorModule({} as any).status, "rejected");
  let resourceReads = 0;
  let mounts = 0;
  const scheduler = new ControlledScheduler();
  const input = new ControlledInput();
  const platform = {
    resources: {
      acquire: async () => {
        resourceReads += 1;
        return {
          status: "rejected" as const,
          failure: {
            code: "resource-unavailable" as const,
            capability: "test.missing",
            boundary: "missing",
          },
        };
      },
    },
    audioContext: {
      state: "running",
      async decodeAudioData() {
        return { sampleRate: 44100, numberOfChannels: 2, length: 44100, duration: 1 };
      },
    } as unknown as AudioContext,
    graphics: {
      readSurfaceState: () => TEST_SURFACE,
      mount: () => {
        mounts += 1;
        return accepted({ dispose: () => {} });
      },
    },
    scheduler,
    input,
    requestTargetFrameRate: () => {},
    publishLifecycleState: () => {},
  };
  const semanticExtraRequest: any = request();
  semanticExtraRequest.chartData.gameplay = {
    score: { totalParameter: 100000 },
    life: { initialLife: 999999 },
  };
  const semanticExtraModule = requireAccepted(createProductionAutonomousSimulatorModule(platform));
  const semanticExtraLaunch = await semanticExtraModule.launch(semanticExtraRequest);
  assert.equal(semanticExtraLaunch.status, "rejected");
  if (semanticExtraLaunch.status === "rejected") {
    assert.equal(semanticExtraLaunch.failure.capability, "test.missing",
      "unknown caller gameplay metadata is ignored rather than promoted into Simulator behavior");
  }

  const invalidRequests: any[] = [];
  const missingFullRequest: any = request();
  delete missingFullRequest.chartData.isFullLength;
  invalidRequests.push(missingFullRequest);
  const malformedFullRequest: any = request();
  malformedFullRequest.chartData.isFullLength = "false";
  invalidRequests.push(malformedFullRequest);
  for (const invalidRequest of invalidRequests) {
    const invalidModule = requireAccepted(createProductionAutonomousSimulatorModule(platform));
    const invalidLaunch = await invalidModule.launch(invalidRequest);
    assert.equal(invalidLaunch.status, "rejected");
    if (invalidLaunch.status === "rejected") {
      assert.equal(invalidLaunch.failure.capability, "simulator.recipe.invalid-public-request");
    }
  }
  const malformedChartRequest: any = request();
  malformedChartRequest.chartData.chart[1].width = 0;
  const malformedChartModule = requireAccepted(createProductionAutonomousSimulatorModule(platform));
  const malformedChartLaunch = await malformedChartModule.launch(malformedChartRequest);
  assert.equal(malformedChartLaunch.status, "rejected");
  if (malformedChartLaunch.status === "rejected") {
    assert.equal(malformedChartLaunch.failure.capability, "simulator.garupa-json.invalid-chart");
  }
  const malformedBgmRequest: any = request();
  malformedBgmRequest.chartData.bgm = Uint8Array.from([0x52, 0x49, 0x46, 0x46]);
  const malformedBgmModule = requireAccepted(createProductionAutonomousSimulatorModule(platform));
  const malformedBgmLaunch = await malformedBgmModule.launch(malformedBgmRequest);
  assert.equal(malformedBgmLaunch.status, "rejected");
  if (malformedBgmLaunch.status === "rejected") {
    assert.equal(malformedBgmLaunch.failure.capability, "simulator.audio.invalid-mp3-byte-structure");
  }
  assert.equal(resourceReads, 1, "semantic caller extras are ignored and reach the normal resource boundary; malformed required data still rejects earlier");
  assert.equal(mounts, 0);
  resourceReads = 0;

  const missingResourceModule = requireAccepted(createProductionAutonomousSimulatorModule(platform));
  const missingResource = await missingResourceModule.launch(request());
  assert.equal(missingResource.status, "rejected");
  if (missingResource.status === "rejected") {
    assert.equal(missingResource.failure.capability, "test.missing");
  }
  assert.equal(resourceReads, 1, "released portable composition reaches the explicit application resource boundary");
  assert.equal(mounts, 0, "missing resources reject before visual mount");
  assert.equal(scheduler.consumer, null, "missing resources reject before scheduler start");
  resourceReads = 0;

  const module = requireAccepted(createProductionAutonomousSimulatorModule(platform));
  const rehearsalRequest = request();
  (rehearsalRequest.config as { sessionMode: "live" | "rehearsal" }).sessionMode = "rehearsal";
  const launched = await module.launch(rehearsalRequest);
  assert.equal(launched.status, "rejected");
  if (launched.status === "rejected") assert.equal(launched.failure.capability, "test.missing");
  assert.equal(resourceReads, 1, "Rehearsal reaches the same explicit application resource construction boundary");
  assert.equal(mounts, 0);
}

function testConstructedChartEarlyCapabilityGates(): void {
  const habBms = readFileSync(join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/chart-construction/fixtures/786_miracle_april_habahiro_special.txt",
  ), "utf8");
  const hab = requireOk(createNoteBatchInformationList({ musicScoreData: habBms }));
  const source = hab.noteBatches.flatMap((batch) => batch.informationList).find((note) => note.buttonType >= 0)!;
  const sourceBatch = hab.noteBatches.find((batch) => batch.informationList.includes(source))!;
  const button07Chart = {
    ...hab,
    habahiroChangeAbsolutePos: -1,
    noteBatches: Object.freeze([Object.freeze({
      ...sourceBatch,
      informationList: Object.freeze([Object.freeze({
        ...source,
        buttonType: ButtonType.Button_07_BMS_1P_07,
        buttonTypes: Object.freeze([ButtonType.Button_07_BMS_1P_07]),
        buttonTypesArray: Object.freeze([ButtonType.Button_07_BMS_1P_07]),
      })]),
    })]),
  };
  const button07 = validateConstructedChartCapabilities(button07Chart, request());
  assert.equal(button07.status, "rejected");
  if (button07.status === "rejected") {
    assert.equal(button07.failure.code, "launch-failed");
    assert.equal(button07.failure.capability, "simulator.composition.impossible-button-07-invariant");
  }

  const habahiro = validateConstructedChartCapabilities(hab, request());
  assert.equal(habahiro.status, "accepted", "authorized current-external-complete HABAHIRO is not downgraded to an unsupported preview");
}

async function testAutonomousLaunchAndClose(): Promise<void> {
  const scheduler = new ControlledScheduler();
  const input = new ControlledInput();
  const session = new FakeSession();
  const controlState = Object.freeze({ timelineSeconds: 8, playable: true, paused: false, moveTimeInProgress: false });
  const returnCommand = requireOk(resolveRehearsalControlTouch(
    REHEARSAL_AUTO_MODE, "began", { x: 142, y: 360 }, controlState,
    TEST_CONTROL_LAYOUT,
  ));
  const advanceCommand = requireOk(resolveRehearsalControlTouch(
    REHEARSAL_AUTO_MODE, "began", { x: 1457.5, y: 360 }, controlState,
    TEST_CONTROL_LAYOUT,
  ));
  input.set(0, [
    returnCommand,
    advanceCommand,
  ]);
  input.set(1, [{ kind: "user-close" }]);
  const module = new AutonomousSimulatorModule({
    scheduler,
    input,
    sessions: factory(session),
  });
  assert.equal(installSimulatorModuleLauncher(module.launch).status, "accepted");
  assert.equal(installSimulatorModuleLauncher(module.launch).status, "rejected");
  const launchRequest = request();
  (launchRequest.config as { sessionMode: "live" | "rehearsal" }).sessionMode = "rehearsal";
  const launched = await launchSimulatorModule(launchRequest);
  assert.equal(launched.status, "accepted");
  if (launched.status !== "accepted") throw new Error(launched.failure.capability);
  assert.deepEqual(Object.keys(launched).sort(), ["closed", "status"]);
  assert.equal("step" in launched, false);
  assert.equal("dispose" in launched, false);
  await scheduler.tick(0, 1 / 60);
  assert.equal(session.steps, 1);
  assert.deepEqual(session.commands, ["return-five", "advance-five"]);
  await scheduler.tick(1, 1 / 60);
  const report = await launched.closed;
  assert.equal(report.reason, "user-closed");
  assert.ok(Object.isFrozen(report));
  assert.deepEqual(report.capabilities, {
    rendering: null,
    background: "standard-current-portable",
    chart: "standard-original-compatible",
    skin: null,
    publicAutonomousCore: "closed-portable",
    ordinaryCommandScene: "closed-portable",
    ordinaryHud: "closed-evidence-equivalent",
    habahiroCurrentExternalComplete: "closed-portable",
    habahiroOriginalParity: "observational-gap",
    liveRehearsalFourModeMatrix: "closed-portable",
    startupDirectionPortable: "closed-portable",
    mvLivePortable: "closed-portable",
    standaloneMvView: "excluded",
    star3DLiveView: "excluded",
    rehearsalMoveTimeControls: "closed-portable",
    garupaJsonDirectChartAdapter: "closed-portable",
    garupaSvTimingGroup: "closed-product-extension",
    garupaContinuousLaneOutside: "closed-product-extension",
    garupaExtendedSlideGraph: "closed-product-extension",
    garupaExtendedManualInput: "closed-product-extension",
    nonzeroInitialPracticeSeek: "excluded",
    button07SceneMapping: "closed-original-unreachable",
    browserDecodeRaster: "closed-portable",
    initialAdaptiveLandscapeLayout: "closed-portable",
    dynamicSurfaceResize: "observational-gap",
    fixedDeviceExact: "open-objective-environment-blocked",
    characterSkillFeverMultiplayer: "excluded",
    originalSkinSettings: "closed-static-portable",
    originalLiveSettings: "closed-portable",
    mainProgramIntegration: "closed-product-integration",
    selectedRenderingGate: "observational-gap",
    selectedHudGate: "closed-evidence-equivalent",
    selectedBackgroundGate: "closed-portable",
    selectedChartGate: "closed-portable",
    selectedSkinGate: "observational-gap",
  }, "close receipt publishes each capability gate without an aggregate complete claim");
  assert.equal(session.steps, 1, "user-close owns frame before engine step");
  assert.equal(session.closes, 1);
  assert.equal(scheduler.stops, 1);
  assert.equal(input.disposes, 1);
  assert.equal(uninstallSimulatorModuleLauncher(module.launch).status, "accepted");
  assert.equal(uninstallSimulatorModuleLauncher(module.launch).status, "rejected");
}

async function testSimulatorOwnedPauseRoute(): Promise<void> {
  const scheduler = new ControlledScheduler();
  const input = new ControlledInput();
  const session = new StatefulPauseSession();
  const pause = TEST_PAUSE_LAYOUT.pause.centerBottomLeft;
  const resumeBounds = TEST_PAUSE_LAYOUT.pauseMenu.resumeBoundsTopLeft;
  const resumeX = Math.fround(resumeBounds.x + resumeBounds.width / 2);
  const resumeY = Math.fround(TEST_SURFACE.viewportHeight - (resumeBounds.y + resumeBounds.height / 2));
  input.setFrame(0, touchFrame(0, ManualTouchPhase.Began, pause[0], pause[1]));
  input.setFrame(1, touchFrame(0, ManualTouchPhase.Began, resumeX, resumeY));
  input.setFrame(2, touchFrame(0, ManualTouchPhase.Ended, resumeX, resumeY));
  const module = new AutonomousSimulatorModule({ scheduler, input, sessions: factory(session) });
  const launched = await module.launch(request());
  assert.equal(launched.status, "accepted");
  if (launched.status !== "accepted") throw new Error(launched.failure.capability);
  await scheduler.tick(0, 1 / 60);
  assert.deepEqual(session.commands, ["pause"]);
  assert.equal(session.pausedState, true);
  await scheduler.tick(1, 1 / 60);
  await scheduler.tick(2, 1 / 60);
  assert.deepEqual(session.commands, ["pause"], "Resume waits for original countdown callback");
  await scheduler.tick(3, 1);
  await scheduler.tick(4, 1);
  await scheduler.tick(5, 1);
  assert.deepEqual(session.commands, ["pause", "resume"]);
  assert.equal(session.pausedState, false);
  input.set(6, [{ kind: "user-close" }]);
  await scheduler.tick(6, 1 / 60);
  assert.equal((await launched.closed).reason, "user-closed");
}

function assertPlatformUnavailable(result: Awaited<ReturnType<typeof launchSimulatorModule>>): void {
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.code, "platform-unavailable");
    assert.equal(result.failure.capability, "simulator.entry.platform-not-installed");
    assert.match(result.failure.boundary, /must be installed before the main entry transfers chart\/config ownership/);
  }
}

async function testSurfaceRevisionFailsBeforeInput(): Promise<void> {
  const scheduler = new ControlledScheduler();
  const input = new ControlledInput();
  const session = new SurfaceRejectingSession();
  const module = new AutonomousSimulatorModule({ scheduler, input, sessions: factory(session) });
  const launched = await module.launch(request());
  assert.equal(launched.status, "accepted");
  if (launched.status !== "accepted") throw new Error(launched.failure.capability);
  await scheduler.tick(0, 1 / 60);
  const report = await launched.closed;
  assert.equal(report.reason, "terminal-fault");
  assert.equal(report.failure?.capability, "surface.dynamic-revision-unsupported");
  assert.equal(input.consumes, 0, "surface revision fails before input consumption");
  assert.equal(session.steps, 0, "surface revision fails before engine step");
  assert.deepEqual(session.commands, [], "surface revision fails before command mutation");
}

async function testInvalidTickCloses(): Promise<void> {
  const scheduler = new ControlledScheduler();
  const input = new ControlledInput();
  const session = new FakeSession();
  const module = new AutonomousSimulatorModule({ scheduler, input, sessions: factory(session) });
  const launched = await module.launch(request());
  assert.equal(launched.status, "accepted");
  if (launched.status !== "accepted") throw new Error(launched.failure.capability);
  await scheduler.tick(1, 1 / 60);
  const report = await launched.closed;
  assert.equal(report.reason, "terminal-fault");
  assert.equal(report.failure?.capability, "simulator.runtime.invalid-frame-tick");
  assert.equal(session.steps, 0);
  assert.equal(session.closes, 1);
}

async function testTerminalCleanupFailuresRemainSecondary(): Promise<void> {
  const scheduler = new ThrowingStopScheduler();
  const input = new ThrowingDisposeInput();
  const session = new FakeSession();
  const module = new AutonomousSimulatorModule({ scheduler, input, sessions: factory(session) });
  const launched = await module.launch(request());
  assert.equal(launched.status, "accepted");
  if (launched.status !== "accepted") throw new Error(launched.failure.capability);
  await scheduler.tick(1, 1 / 60);
  const report = await launched.closed;
  assert.equal(report.failure?.capability, "simulator.runtime.invalid-frame-tick", "primary failure remains stable");
  assert.deepEqual(
    report.failure?.cleanupFailures?.map((failure) => failure.capability),
    ["simulator.runtime.scheduler-stop-threw", "simulator.runtime.input-dispose-threw"],
    "both independently failing cleanup owners are reported in execution order",
  );
  assert.equal(scheduler.stops, 1, "scheduler stop was attempted");
  assert.equal(input.disposes, 1, "input dispose still ran after scheduler stop failure");
  assert.ok(Object.isFrozen(report.failure?.cleanupFailures), "cleanup failure receipt is frozen");
}

class ControlledScheduler implements SimulatorFrameScheduler {
  consumer: ((tick: SimulatorFrameTick) => Promise<void>) | null = null;
  stops = 0;

  start(consumer: (tick: SimulatorFrameTick) => Promise<void>): SimulatorAssemblyResult<SimulatorFrameSubscription> {
    this.consumer = consumer;
    return accepted({ stop: () => { this.stops += 1; this.consumer = null; } });
  }

  async tick(sequence: number, deltaTimeSeconds: number): Promise<void> {
    if (this.consumer === null) throw new Error("scheduler stopped");
    await this.consumer(Object.freeze({ sequence, deltaTimeSeconds }));
  }
}

class ThrowingStopScheduler extends ControlledScheduler {
  override start(consumer: (tick: SimulatorFrameTick) => Promise<void>): SimulatorAssemblyResult<SimulatorFrameSubscription> {
    this.consumer = consumer;
    return accepted({
      stop: () => {
        this.stops += 1;
        this.consumer = null;
        throw new Error("injected scheduler stop failure");
      },
    });
  }
}

class ControlledInput implements SimulatorRuntimeInputSource {
  private readonly commands = new Map<number, readonly any[]>();
  private readonly frames = new Map<number, ManualInputFrame>();
  consumes = 0;
  disposes = 0;

  set(sequence: number, commands: readonly any[]): void {
    this.commands.set(sequence, Object.freeze([...commands]));
  }
  setFrame(sequence: number, frame: ManualInputFrame): void { this.frames.set(sequence, frame); }

  consume(sequence: number): SimulatorAssemblyResult<SimulatorRuntimeInputBatch> {
    this.consumes += 1;
    return accepted(Object.freeze({
      surfaceRevision: TEST_SURFACE.revision,
      manualFrame: this.frames.get(sequence) ?? null,
      hardwareBack: false,
      commands: this.commands.get(sequence) ?? Object.freeze([]),
    }));
  }

  dispose(): void { this.disposes += 1; }
}

class ThrowingDisposeInput extends ControlledInput {
  override dispose(): void {
    this.disposes += 1;
    throw new Error("injected input dispose failure");
  }
}

class FakeSession implements SimulatorOwnedSession {
  steps = 0;
  closes = 0;
  readonly commands: string[] = [];

  step(): { readonly status: "running" } {
    this.steps += 1;
    return Object.freeze({ status: "running" as const });
  }
  getSurfaceState() { return accepted(TEST_SURFACE); }
  getControlLayout() { return accepted(TEST_ORIGINAL_LAYOUT); }
  publishPauseControlState(): SimulatorAssemblyResult<void> { return accepted(undefined); }
  pause(): SimulatorAssemblyResult<void> { this.commands.push("pause"); return accepted(undefined); }
  resume(): SimulatorAssemblyResult<void> { this.commands.push("resume"); return accepted(undefined); }
  async moveTime(direction: "return-five" | "advance-five"): Promise<SimulatorAssemblyResult<void>> {
    this.commands.push(direction);
    return accepted(undefined);
  }
  async retry(): Promise<SimulatorAssemblyResult<void>> {
    this.commands.push("retry");
    return accepted(undefined);
  }
  getControlState(): SimulatorAssemblyResult<SimulatorTimelineControlState> {
    return accepted(Object.freeze({
      mode: REHEARSAL_AUTO_MODE,
      timelineSeconds: 8,
      playable: true,
      paused: false,
      moveTimeInProgress: false,
    }));
  }
  close(reason: "user-closed" | "terminal-fault", failure?: any): SimulatorModuleCloseReport {
    this.closes += 1;
    return Object.freeze({
      reason,
      result: null,
      failure: failure ?? null,
      capabilities: createSimulatorModuleCapabilitySummary(null, "standard-current-portable"),
    });
  }
}

class StatefulPauseSession extends FakeSession {
  pausedState = false;
  override pause(): SimulatorAssemblyResult<void> { this.pausedState = true; this.commands.push("pause"); return accepted(undefined); }
  override resume(): SimulatorAssemblyResult<void> { this.pausedState = false; this.commands.push("resume"); return accepted(undefined); }
  override getControlState() {
    return accepted(Object.freeze({
      mode: REHEARSAL_AUTO_MODE,
      timelineSeconds: 8,
      playable: true,
      paused: this.pausedState,
      moveTimeInProgress: false,
    }));
  }
}

class SurfaceRejectingSession extends FakeSession {
  override getSurfaceState(): SimulatorAssemblyResult<any> {
    return Object.freeze({
      status: "rejected" as const,
      failure: Object.freeze({
        code: "integrity-failure" as const,
        capability: "surface.dynamic-revision-unsupported",
        boundary: "injected post-initial revision",
      }),
    });
  }
}

function factory(session: SimulatorOwnedSession): SimulatorOwnedSessionFactory {
  return { async create() { return accepted(session); } };
}

function touchFrame(fingerId: number, phase: 0 | 1 | 2 | 3, x: number, y: number): ManualInputFrame {
  return Object.freeze({ touches: Object.freeze([Object.freeze({
    fingerId, phase, position: Object.freeze({ x: Math.fround(x), y: Math.fround(y) }), buttonResolution: null,
  })]) });
}

function selectSimulatorStaticResources(chart: any) {
  const skin = requireOk(resolveOriginalSkinRecipe(
    request().config.skin,
    LIVE_AUTO_MODE,
    chart.habahiroChangeAbsolutePos >= 0 ? "habahiro" : "ordinary",
    "standard",
  ));
  return selectStaticResourceInternal(chart, skin);
}

function specialComponentStates(state: "on" | "off") {
  return {
    laneAndLine: state,
    tapEffect: state,
    rhythmIcon: state,
    background: state,
    soundEffect: state,
    judge: state,
    directionalFlickIcon: state,
  } as const;
}

function request(): SimulatorModuleLaunchRequest {
  return {
    chartData: {
      chart: [
        { type: "BPM", beat: 0, value: 120 },
        { type: "Single", beat: 4, lane: 1, width: 1 },
      ],
      bgm: new Uint8Array([0xff, 0xfb, 0x90, 0x00]),
      isFullLength: false,
    },
    presentation: createTestPresentationPackage(),
    config: {
      sessionMode: "live",
      inputMode: "auto",
      highFrequencyMode: false,
      ...DEFAULT_PUBLIC_ORIGINAL_LIVE_SETTINGS,
      skin: createDefaultTestSkinSettings(),
      visual: {
        specificSpeed: Math.fround(11),
        noteSize: Math.fround(100),
        habahiroMeshWidthSetting: Math.fround(1),
      },
      audio: { masterGain: 1, bgmGain: 1, seGain: 1 },
    },
  };
}

function engineBuild(engine: any) {
  return Object.freeze({
    engine,
    mode: LIVE_AUTO_MODE,
    chartFidelity: "standard-original-compatible" as const,
    originalLiveSettingsIdentity: "60:0:0:20:1:1:1:1",
    skinRecipeIdentity: "skin-recipe-v1|default-current|test",
    skinFidelity: "default-current" as const,
    surface: TEST_SURFACE,
    controlLayout: TEST_ORIGINAL_LAYOUT,
    validateSurface: () => accepted(undefined),
  });
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
function requireAccepted<T>(result: SharedStaticResourceResult<T> | SimulatorAssemblyResult<T>): T {
  if (result.status !== "accepted") throw new Error(result.failure.capability);
  return result.value;
}
function requireOk<T>(result: { status: "ok"; value: T } | { status: "integrity-failure"; capability: string }): T {
  if (result.status !== "ok") throw new Error(result.capability);
  return result.value;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
