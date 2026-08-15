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
  prepareSharedOrdinaryRenderResources,
  prepareSharedScoreGaugeSsAnimationResource,
  prepareSharedScoreHudRenderResources,
} from "../resources/sharedResourceAdapters";
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

function testSelector(): void {
  const ordinary = requireOk(createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#00111:01\n",
  }));
  const ordinarySelection = selectSimulatorStaticResources(ordinary);
  assert.equal(ordinarySelection.audioSe.length, 14);
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
  source.chartData.bgm.bytes.fill(0);
  (source.config.audio as { masterGain: number }).masterGain = 0;
  assert.deepEqual([...recipe.request.chartData.bgm.bytes], [1, 2, 3, 4]);
  assert.equal(recipe.request.config.audio.masterGain, 1);
  assert.ok(Object.isFrozen(recipe));
  assert.ok(Object.isFrozen(recipe.request));
  assert.ok(Object.isFrozen(recipe.request.chartData.bgm));
  assert.ok(Object.isFrozen(recipe.request.chartData.gameplay));
  assert.ok(Object.isFrozen(recipe.request.chartData.gameplay.life));

  const extra = { ...request(), extra: true } as unknown as SimulatorModuleLaunchRequest;
  assert.equal(createSimulatorSessionRecipe(extra).status, "rejected");
  const legacyScore: any = request();
  legacyScore.chartData.gameplay.score = { level: 27 };
  assert.equal(createSimulatorSessionRecipe(legacyScore).status, "rejected");
  const callerRuleSet: any = request();
  callerRuleSet.chartData.gameplay.ruleSet = "garupa-editor-normalized-10m-v1";
  assert.equal(createSimulatorSessionRecipe(callerRuleSet).status, "rejected");
  const callerCount: any = request();
  callerCount.chartData.gameplay.totalScoringUnitCount = 1;
  assert.equal(createSimulatorSessionRecipe(callerCount).status, "rejected");
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
  assert.equal(stepped.report.capabilities.liveRehearsalFourModeMatrix, "closed-portable");
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
    audioContext: {} as AudioContext,
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
  const invalidScoreModule = requireAccepted(createProductionAutonomousSimulatorModule(platform));
  const invalidScoreRequest: any = request();
  invalidScoreRequest.chartData.gameplay.score = { totalParameter: 100000 };
  const invalidScoreLaunch = await invalidScoreModule.launch(invalidScoreRequest);
  assert.equal(invalidScoreLaunch.status, "rejected");
  if (invalidScoreLaunch.status === "rejected") {
    assert.equal(invalidScoreLaunch.failure.capability, "simulator.recipe.invalid-public-request");
  }
  assert.equal(resourceReads, 0, "caller-authored Score data fails before shared resource read");
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
  input.set(0, [
    { kind: "pause" },
    { kind: "resume" },
    { kind: "create-replay-checkpoint" },
    { kind: "return-time" },
  ]);
  input.set(1, [{ kind: "user-close" }]);
  const module = new AutonomousSimulatorModule({
    scheduler,
    input,
    sessions: factory(session),
  });
  assert.equal(installSimulatorModuleLauncher(module.launch).status, "accepted");
  assert.equal(installSimulatorModuleLauncher(module.launch).status, "rejected");
  const launched = await launchSimulatorModule(request());
  assert.equal(launched.status, "accepted");
  if (launched.status !== "accepted") throw new Error(launched.failure.capability);
  assert.deepEqual(Object.keys(launched).sort(), ["closed", "status"]);
  assert.equal("step" in launched, false);
  assert.equal("dispose" in launched, false);
  await scheduler.tick(0, 1 / 60);
  assert.equal(session.steps, 1);
  assert.deepEqual(session.commands, ["pause", "resume", "checkpoint", "return-time"]);
  await scheduler.tick(1, 1 / 60);
  const report = await launched.closed;
  assert.equal(report.reason, "user-closed");
  assert.ok(Object.isFrozen(report));
  assert.deepEqual(report.capabilities, {
    rendering: null,
    publicAutonomousCore: "closed-portable",
    ordinaryCommandScene: "closed-portable",
    habahiroCurrentExternalComplete: "closed-portable",
    habahiroOriginalParity: "open-evidence-required",
    liveRehearsalFourModeMatrix: "closed-portable",
    rehearsalMoveTimeControls: "closed-portable",
    nonzeroInitialPracticeSeek: "excluded",
    button07SceneMapping: "closed-original-unreachable",
    browserDecodeRaster: "closed-portable",
    fixedDeviceExact: "open-objective-environment-blocked",
    characterSkillFeverMultiplayer: "excluded",
    mainProgramIntegration: "unauthorized-stage-9",
    selectedRenderingGate: "open-evidence-required",
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
  createReplayCheckpoint(): SimulatorAssemblyResult<void> { this.commands.push("checkpoint"); return accepted(undefined); }
  async returnTime(): Promise<SimulatorAssemblyResult<void>> { this.commands.push("return-time"); return accepted(undefined); }
  close(reason: "user-closed" | "terminal-fault", failure?: any): SimulatorModuleCloseReport {
    this.closes += 1;
    return Object.freeze({
      reason,
      result: null,
      failure: failure ?? null,
      capabilities: createSimulatorModuleCapabilitySummary(null),
    });
  }
}

function factory(session: SimulatorOwnedSession): SimulatorOwnedSessionFactory {
  return { async create() { return accepted(session); } };
}

function request(): SimulatorModuleLaunchRequest {
  return {
    chartData: {
      bmsText: "#BPM 120\n#00111:01\n",
      bgm: {
        cue: "host-cue",
        bytes: new Uint8Array([1, 2, 3, 4]),
        sha256: "A".repeat(64),
        codec: "mp3",
        sampleRate: 44100,
        channels: 2,
        durationSeconds: 1,
        currentSampleFrames: 44100,
      },
      gameplay: {
        life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
      },
    },
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
  return Object.freeze({ engine });
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
