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
import { resolveRehearsalControlTouch } from "../scene/rehearsalControlScene";
import { LIVE_AUTO_MODE, REHEARSAL_AUTO_MODE } from "./modeFixtures";
import { createTestPresentationPackage } from "./startupPresentationTestProfile";
import {
  installSimulatorModuleLauncher,
  launchInstalledSimulatorModule,
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
} from "../resources/sharedStaticResourceStore";
import { selectSimulatorStaticResources } from "../resources/staticResourceSelector";
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
} from "../resources/sharedResourceAdapters";
import { CURRENT_AUDIO_TEST_PROFILE } from "./audioSessionBgmTestProfile";
import { validateConstructedChartCapabilities } from "../assembly/chartCapabilityValidation";
import { createProductionAutonomousSimulatorModule } from "../platform/platformComposition";
import type {
  SimulatorModuleCloseReport,
  SimulatorModuleLaunchRequest,
} from "../public/contracts";
import type { SimulatorAssemblyResult } from "../resources/sharedResourceAdapters";

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
  await testRecipeNaturalCompletion();
  await testProductionCompositionFailureBoundary();
  testConstructedChartEarlyCapabilityGates();
  await testAutonomousLaunchAndClose();
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
  assert.equal(ordinarySelection.scoreHud.length, 7);
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
  assert.equal(habSelection.scoreHud.length, 7);
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
  assert.equal(prepared.assets.length, 7);
  assert.equal((await prepared.provider.read("hud/score/font-atlas")).status, "ok");
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
  assert.deepEqual([...recipe.request.chartData.bgm], [0xff, 0xfb, 0x90, 0x00]);
  assert.equal((recipe.request.chartData.chart[0] as { readonly value: number }).value, 120);
  assert.ok(Object.isFrozen(recipe.request.chartData.chart));
  assert.ok(Object.isFrozen(recipe.request.chartData.chart[0]));
  assert.equal(recipe.request.chartData.isFullLength, false);
  assert.equal(recipe.request.config.audio.masterGain, 1);
  assert.ok(Object.isFrozen(recipe));
  assert.ok(Object.isFrozen(recipe.request));
  assert.notEqual(recipe.request.chartData.bgm, source.chartData.bgm);
  assert.equal(recipe.schemaVersion, 5);
  assert.equal(recipe.request.chartData.isFullLength, false);

  const extra = { ...request(), extra: true } as unknown as SimulatorModuleLaunchRequest;
  assert.equal(createSimulatorSessionRecipe(extra).status, "rejected");
  const legacyBms: any = request();
  legacyBms.chartData = { bmsText: "#BPM 120", bgm: legacyBms.chartData.bgm, isFullLength: false };
  assert.equal(createSimulatorSessionRecipe(legacyBms).status, "rejected");
  const malformedChart: any = request();
  malformedChart.chartData.chart[0].extra = true;
  assert.equal(createSimulatorSessionRecipe(malformedChart).status, "rejected");
  const legacyScore: any = request();
  legacyScore.chartData.gameplay = { score: { level: 27 } };
  assert.equal(createSimulatorSessionRecipe(legacyScore).status, "rejected");
  const callerRuleSet: any = request();
  callerRuleSet.chartData.gameplay = { ruleSet: "garupa-editor-normalized-10m-v1" };
  assert.equal(createSimulatorSessionRecipe(callerRuleSet).status, "rejected");
  const callerCount: any = request();
  callerCount.chartData.gameplay = { totalScoringUnitCount: 1 };
  assert.equal(createSimulatorSessionRecipe(callerCount).status, "rejected");
  const callerLife: any = request();
  callerLife.chartData.gameplay = {
    life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
  };
  assert.equal(createSimulatorSessionRecipe(callerLife).status, "rejected");
  const legacyModes: any = request();
  legacyModes.config.playMode = "auto-live";
  legacyModes.config.practice = { enabled: true, startMilliseconds: 1 };
  assert.equal(createSimulatorSessionRecipe(legacyModes).status, "rejected");
  const callerDerived: any = request();
  callerDerived.config.isAutoPlay = true;
  assert.equal(createSimulatorSessionRecipe(callerDerived).status, "rejected");
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
  const stepped = session.step(1 / 60, null);
  assert.equal(stepped.status, "closed");
  if (stepped.status !== "closed") throw new Error("natural completion must close");
  assert.equal(stepped.report.reason, "completed");
  assert.equal(stepped.report.result?.clearStatus, 2);
  assert.equal(stepped.report.result?.combo, 7);
  assert.equal(stepped.report.capabilities.rendering, null);
  assert.equal(stepped.report.capabilities.background, "standard-current-portable");
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
  assert.equal(stepped.report.capabilities.mainProgramIntegration, "unauthorized-stage-9");
  assert.equal(disposals, 1);
}

async function testProductionCompositionFailureBoundary(): Promise<void> {
  assert.equal(createProductionAutonomousSimulatorModule({} as any).status, "rejected");
  let resourceReads = 0;
  let mounts = 0;
  const scheduler = new ControlledScheduler();
  const input = new ControlledInput();
  const platform = {
    staticResources: {
      read: async () => {
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
      viewportWidth: 1600 as const,
      viewportHeight: 720 as const,
      inputOrigin: "bottom-left" as const,
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
  const invalidRequests: any[] = [];
  const invalidScoreRequest: any = request();
  invalidScoreRequest.chartData.gameplay = { score: { totalParameter: 100000 } };
  invalidRequests.push(invalidScoreRequest);
  const callerLifeRequest: any = request();
  callerLifeRequest.chartData.gameplay = {
    life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
  };
  invalidRequests.push(callerLifeRequest);
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
  malformedChartRequest.chartData.chart[1].lane = 1.5;
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
  assert.equal(resourceReads, 0, "caller fields, full classification, Garupa JSON and MP3 bytes fail before shared resource reads");
  assert.equal(mounts, 0);

  const missingResourceModule = requireAccepted(createProductionAutonomousSimulatorModule(platform));
  const missingResource = await missingResourceModule.launch(request());
  assert.equal(missingResource.status, "rejected");
  if (missingResource.status === "rejected") {
    assert.equal(missingResource.failure.capability, "test.missing");
  }
  assert.equal(resourceReads, 1, "released portable composition reaches the explicit shared-resource boundary");
  assert.equal(mounts, 0, "missing resources reject before visual mount");
  assert.equal(scheduler.consumer, null, "missing resources reject before scheduler start");
  resourceReads = 0;

  const module = requireAccepted(createProductionAutonomousSimulatorModule(platform));
  const rehearsalRequest = request();
  (rehearsalRequest.config as { sessionMode: "live" | "rehearsal" }).sessionMode = "rehearsal";
  const launched = await module.launch(rehearsalRequest);
  assert.equal(launched.status, "rejected");
  if (launched.status === "rejected") assert.equal(launched.failure.capability, "test.missing");
  assert.equal(resourceReads, 1, "Rehearsal reaches the same explicit resource construction boundary");
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
  const controlState = Object.freeze({ timelineSeconds: 8, paused: false, moveTimeInProgress: false });
  const returnCommand = requireOk(resolveRehearsalControlTouch(
    REHEARSAL_AUTO_MODE, "began", { x: 142, y: 360 }, controlState,
  ));
  const advanceCommand = requireOk(resolveRehearsalControlTouch(
    REHEARSAL_AUTO_MODE, "began", { x: 1457.5, y: 360 }, controlState,
  ));
  input.set(0, [
    returnCommand,
    advanceCommand,
    { kind: "retry" },
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
  assert.deepEqual(session.commands, ["return-five", "advance-five", "retry"]);
  await scheduler.tick(1, 1 / 60);
  const report = await launched.closed;
  assert.equal(report.reason, "user-closed");
  assert.ok(Object.isFrozen(report));
  assert.deepEqual(report.capabilities, {
    rendering: null,
    background: "standard-current-portable",
    publicAutonomousCore: "closed-portable",
    ordinaryCommandScene: "closed-portable",
    habahiroCurrentExternalComplete: "closed-portable",
    habahiroOriginalParity: "open-evidence-required",
    liveRehearsalFourModeMatrix: "closed-portable",
    startupDirectionPortable: "closed-portable",
    mvLivePortable: "closed-portable",
    standaloneMvView: "excluded",
    star3DLiveView: "excluded",
    rehearsalMoveTimeControls: "closed-portable",
    garupaJsonDirectChartAdapter: "closed-portable",
    garupaJsonSvAndTimingGroup: "ignored-product-extension",
    unsupportedExGarupaSlide: "open-evidence-required",
    nonzeroInitialPracticeSeek: "excluded",
    button07SceneMapping: "closed-original-unreachable",
    browserDecodeRaster: "closed-portable",
    fixedDeviceExact: "open-objective-environment-blocked",
    characterSkillFeverMultiplayer: "excluded",
    mainProgramIntegration: "unauthorized-stage-9",
    selectedRenderingGate: "open-evidence-required",
    selectedBackgroundGate: "closed-portable",
  }, "close receipt publishes each capability gate without an aggregate complete claim");
  assert.equal(session.steps, 1, "user-close owns frame before engine step");
  assert.equal(session.closes, 1);
  assert.equal(scheduler.stops, 1);
  assert.equal(input.disposes, 1);
}

function assertPlatformUnavailable(result: Awaited<ReturnType<typeof launchSimulatorModule>>): void {
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.code, "platform-unavailable");
    assert.equal(result.failure.capability, "simulator.entry.platform-not-installed");
    assert.match(result.failure.boundary, /must be installed before the main entry transfers chart\/config ownership/);
  }
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
  disposes = 0;

  set(sequence: number, commands: readonly any[]): void {
    this.commands.set(sequence, Object.freeze([...commands]));
  }

  consume(sequence: number): SimulatorAssemblyResult<SimulatorRuntimeInputBatch> {
    return accepted(Object.freeze({
      manualFrame: null,
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
  getControlState() {
    return accepted(Object.freeze({
      mode: REHEARSAL_AUTO_MODE,
      timelineSeconds: 8,
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

function factory(session: SimulatorOwnedSession): SimulatorOwnedSessionFactory {
  return { async create() { return accepted(session); } };
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
      judgeOffsetFrames: 0,
      visual: {
        specificSpeed: Math.fround(11),
        noteSize: Math.fround(100),
        highAspectRatio: 1,
        habahiroMeshWidthSetting: Math.fround(1),
      },
      audio: { masterGain: 1, bgmGain: 1, seGain: 1 },
    },
  };
}

function engineBuild(engine: any) {
  return Object.freeze({ engine, mode: LIVE_AUTO_MODE });
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
function requireAccepted<T>(result: SharedStaticResourceResult<T> | SimulatorAssemblyResult<T>): T {
  if (result.status !== "accepted") throw new Error(result.failure.capability);
  return result.value;
}
function requireOk<T>(result: { status: "ok"; value: T } | { status: "evidence-required"; capability: string }): T {
  if (result.status !== "ok") throw new Error(result.capability);
  return result.value;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
