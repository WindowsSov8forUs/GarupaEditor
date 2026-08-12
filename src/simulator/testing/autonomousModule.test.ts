declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { launchSimulatorModule } from "../index";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { AutonomousSimulatorModule } from "../runtime/autonomousSimulatorRuntime";
import { installSimulatorModuleLauncher } from "../runtime/moduleEntryBinding";
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
import { createProductionAutonomousSimulatorModule } from "../platform/platformComposition";
import type {
  SimulatorModuleCloseReport,
  SimulatorModuleLaunchRequest,
} from "../public/contracts";
import type { SimulatorAssemblyResult } from "../resources/sharedResourceAdapters";

async function main(): Promise<void> {
  const beforeInstall = await launchSimulatorModule(request());
  assert.equal(beforeInstall.status, "rejected");
  if (beforeInstall.status === "rejected") {
    assert.equal(beforeInstall.failure.capability, "simulator.entry.platform-not-installed");
  }

  await testSharedStore();
  testSelector();
  await testOrdinaryPack();
  await testScoreHudPack();
  testRecipeOwnership();
  await testRecipeNaturalCompletion();
  await testProductionCompositionFailureBoundary();
  await testAutonomousLaunchAndClose();
  await testInvalidTickCloses();
  console.log("autonomous simulator module tests passed: public/store/selector/recipe/runtime/self-close");
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
  assert.ok(Object.isFrozen(recipe.request.chartData.gameplay.score));
  assert.ok(Object.isFrozen(recipe.request.chartData.gameplay.score.master));

  const extra = { ...request(), extra: true } as unknown as SimulatorModuleLaunchRequest;
  assert.equal(createSimulatorSessionRecipe(extra).status, "rejected");
  const missingMaster: any = request();
  delete missingMaster.chartData.gameplay.score.master;
  assert.equal(createSimulatorSessionRecipe(missingMaster).status, "rejected");
  const unorderedMaster: any = request();
  unorderedMaster.chartData.gameplay.score.master.scoreB = 36000;
  assert.equal(createSimulatorSessionRecipe(unorderedMaster).status, "rejected");
  const overflowingMaster: any = request();
  overflowingMaster.chartData.gameplay.score.master.scoreSS = 0xffffffff;
  assert.equal(createSimulatorSessionRecipe(overflowingMaster).status, "rejected");
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
          initialization: { maxNoteCount: 10 },
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
    createFreshEngine: async () => accepted(engine as any),
  });
  const session = requireAccepted(await factory.create(request()));
  const stepped = session.step(1 / 60, null);
  assert.equal(stepped.status, "closed");
  if (stepped.status !== "closed") throw new Error("natural completion must close");
  assert.equal(stepped.report.reason, "completed");
  assert.equal(stepped.report.result?.clearStatus, 2);
  assert.equal(stepped.report.result?.combo, 7);
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
  const invalidMasterModule = requireAccepted(createProductionAutonomousSimulatorModule(platform));
  const invalidMasterRequest: any = request();
  invalidMasterRequest.chartData.gameplay.score.master.scoreB = 36000;
  const invalidMasterLaunch = await invalidMasterModule.launch(invalidMasterRequest);
  assert.equal(invalidMasterLaunch.status, "rejected");
  if (invalidMasterLaunch.status === "rejected") {
    assert.equal(invalidMasterLaunch.failure.capability, "simulator.recipe.invalid-public-request");
  }
  assert.equal(resourceReads, 0, "invalid Score Gauge master fails before shared resource read");
  assert.equal(mounts, 0);

  const module = requireAccepted(createProductionAutonomousSimulatorModule(platform));
  const seekRequest: any = request();
  seekRequest.config.practice.enabled = true;
  seekRequest.config.practice.startMilliseconds = 1;
  seekRequest.config.playMode = "manual";
  const launched = await module.launch(seekRequest);
  assert.equal(launched.status, "rejected");
  if (launched.status === "rejected") {
    assert.equal(launched.failure.capability, "simulator.composition.nonzero-initial-practice-seek");
  }
  assert.equal(resourceReads, 0);
  assert.equal(mounts, 0);
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
  assert.equal(session.steps, 1, "user-close owns frame before engine step");
  assert.equal(session.closes, 1);
  assert.equal(scheduler.stops, 1);
  assert.equal(input.disposes, 1);
  assert.equal((await launchSimulatorModule(request())).status, "rejected");
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
    return Object.freeze({ reason, result: null, failure: failure ?? null });
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
        score: {
          level: 27,
          totalParameter: Math.fround(100000),
          autoLiveComboCoefficient: Math.fround(1),
          master: {
            musicId: 786,
            difficulty: "special",
            scoreC: 36000,
            scoreB: 216000,
            scoreA: 432000,
            scoreS: 648000,
            scoreSS: 864000,
          },
        },
        life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
      },
    },
    config: {
      playMode: "auto-live",
      highFrequencyMode: false,
      judgeOffsetFrames: 0,
      practice: { enabled: false, startMilliseconds: 0 },
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
