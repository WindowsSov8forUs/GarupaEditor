declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { createNoteBatchInformationList } from "../engine/chart/construction";
import type { SimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import { createPortableReplaySimulatorEngine } from "../host/portableReplaySession";
import type { SimulatorEngine } from "../host/contracts";
import { createSimulatorSessionRecipe, RecipeOwnedSessionFactory } from "../assembly/sessionRecipe";
import type { SimulatorModuleLaunchRequest } from "../public/contracts";
import type { SimulatorSessionRecipe } from "../assembly/sessionRecipe";
import { evidenceRequired, type SimulatorResult } from "../engine/evidence";
import { createTestPresentationPackage } from "./startupPresentationTestProfile";
import type { AudioResourceProfileSet } from "../backends/audioContracts";
import { audioAccepted } from "../backends/audioValidation";
import { CURRENT_AUDIO_TEST_PROFILE } from "./audioSessionBgmTestProfile";
import { RecordingStartupDirectionBackend } from "../backends/recordingStartupDirectionBackend";

const TEST_SURFACE = Object.freeze({
  revision: 0, viewportWidth: 1600, viewportHeight: 720,
  safeArea: Object.freeze({ x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) }),
  origin: "bottom-left" as const,
});

const chartText = readFileSync(join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/evidence-integrity",
  "artifacts/investigations/simulator-dynamic-acceptance-oracle-10-1-4/bms/poppin_shuffle_special.bms.txt",
), "utf8");
const chart = requireOk(createNoteBatchInformationList({ musicScoreData: chartText }), "construct full chart");

async function main(): Promise<void> {
  testFourCanonicalModes();
  testLegacyPublicShapesFailClosed();
  await testRehearsalLifeZeroContinuesAndLiveCloses();
  await testTransactionalMoveTimeScoreRestore();
  await testStartupAudioFreshPurposeIsolation();
  console.log("Live/Rehearsal mode tests passed: four identities, Life-zero, ±5 timeline and startup-audio fresh-purpose isolation");
}

function testFourCanonicalModes(): void {
  const rows = [
    ["live", "manual", "single-normal", false, false, false, false],
    ["live", "auto", "single-normal", false, false, true, true],
    ["rehearsal", "manual", "practice", true, false, false, false],
    ["rehearsal", "auto", "practice", true, true, false, true],
  ] as const;
  for (const [sessionMode, inputMode, inGameMode, practice, demo, autoLive, autoPlay] of rows) {
    const mode = createSimulatorModeIdentity(sessionMode, inputMode);
    assert.equal(Object.isFrozen(mode), true);
    assert.deepEqual(mode, {
      sessionMode, inputMode, inGameMode,
      isEnablePractice: practice,
      isDemoPlayMode: demo,
      isAutoLive: autoLive,
      isAutoPlay: autoPlay,
    });
    const engine = requireOk(createModeEngine(mode, `identity:${sessionMode}:${inputMode}`), "identity engine");
    assert.deepEqual(requireOk(engine.snapshot(), "identity snapshot").managers.noteManager.calculatedData, mode);
    requireOk(engine.initialize(), "identity initialize");
    requireOk(engine.dispose(), "identity dispose");
  }
}

function testLegacyPublicShapesFailClosed(): void {
  const current = request("live", "manual");
  const legacy = structuredCloneRequest(current) as any;
  delete legacy.config.sessionMode;
  delete legacy.config.inputMode;
  legacy.config.playMode = "auto-live";
  legacy.config.practice = { enabled: true, startMilliseconds: 5000 };
  const rejected = createSimulatorSessionRecipe(legacy);
  assert.equal(rejected.status, "rejected");
  if (rejected.status === "rejected") {
    assert.equal(rejected.failure.capability, "simulator.recipe.invalid-public-request");
  }
  const extra = structuredCloneRequest(current) as any;
  extra.config.startMilliseconds = 5000;
  assert.equal(createSimulatorSessionRecipe(extra).status, "rejected");
}

async function testRehearsalLifeZeroContinuesAndLiveCloses(): Promise<void> {
  const rehearsalMode = createSimulatorModeIdentity("rehearsal", "manual");
  const rehearsal = requireOk(createModeEngine(rehearsalMode, "rehearsal-life-zero", -1000), "Rehearsal life engine");
  requireOk(rehearsal.initialize(), "Rehearsal initialize");
  let zeroSnapshot = null;
  for (let frame = 0; frame < 3600; frame += 1) {
    requireOk(rehearsal.step(1 / 30, { touches: [] }), `Rehearsal frame ${frame}`);
    const snapshot = requireOk(rehearsal.snapshot(), "Rehearsal life snapshot");
    if (snapshot.managers.scoreLifeState?.record.singleGameOver) {
      zeroSnapshot = snapshot;
      break;
    }
  }
  assert.notEqual(zeroSnapshot, null, "Rehearsal reaches Life zero from real Manual misses");
  const beforeIndex = zeroSnapshot!.managers.noteManager.nextBatchIndex;
  for (let frame = 0; frame < 60; frame += 1) {
    requireOk(rehearsal.step(1 / 30, { touches: [] }), `Rehearsal post-zero ${frame}`);
  }
  const after = requireOk(rehearsal.snapshot(), "Rehearsal post-zero snapshot");
  assert.equal(after.managers.scoreLifeState?.record.currentLife, 0);
  assert.equal(after.managers.scoreLifeState?.record.singleGameOver, true);
  assert.ok(after.managers.noteManager.nextBatchIndex >= beforeIndex);
  requireOk(rehearsal.dispose(), "Rehearsal dispose");

  const factory = new RecipeOwnedSessionFactory({
    createFreshEngine: async (recipe: SimulatorSessionRecipe) => {
      const mode = createSimulatorModeIdentity(recipe.request.config.sessionMode, recipe.request.config.inputMode);
      const engine = createModeEngine(mode, "live-owned-session", -1000);
      return engine.status === "ok"
        ? accepted({
            engine: engine.value,
            mode,
            chartFidelity: "standard-original-compatible" as const,
            surface: TEST_SURFACE,
            validateSurface: () => accepted(undefined),
          })
        : rejected(engine.capability, engine.boundary);
    },
  });
  const created = await factory.create(request("live", "manual"));
  assert.equal(created.status, "accepted");
  if (created.status !== "accepted") throw new Error(created.failure.capability);
  let closed = null;
  for (let frame = 0; frame < 3600; frame += 1) {
    const stepped = created.value.step(1 / 30, { touches: [] }, TEST_SURFACE.revision);
    if (stepped.status === "closed") {
      closed = stepped.report;
      break;
    }
    if (stepped.status === "rejected") throw new Error(stepped.failure.capability);
  }
  assert.notEqual(closed, null, "Live owned session closes on lethal Manual miss");
  assert.equal(closed!.reason, "game-over");
  assert.equal(closed!.result?.life, 0);
}

async function testTransactionalMoveTimeScoreRestore(): Promise<void> {
  const mode = createSimulatorModeIdentity("rehearsal", "auto");
  let generation = 0;
  const purposes: string[] = [];
  const fresh = async (purpose?: "retry" | "move-time-reconstruction"): Promise<SimulatorResult<SimulatorEngine>> => {
    if (purpose !== undefined) purposes.push(purpose);
    return createModeEngine(mode, `move-time:${generation++}`);
  };
  const initial = requireOk(await fresh(), "initial MoveTime engine");
  const replay = requireOk(createPortableReplaySimulatorEngine(initial, {
    mode,
    createFreshEngine: fresh,
  }), "MoveTime owner");

  for (let frame = 0; frame < 732; frame += 1) {
    requireOk(replay.step(1 / 60), `future timeline frame ${frame}`);
  }
  const future = requireOk(replay.snapshot(), "future timeline snapshot").managers.scoreLifeState!;
  const returned = requireOk(await replay.moveTime("return-five"), "return-five transaction");
  assert.equal(returned.targetSeconds, 7);
  assert.equal(returned.replayOriginSeconds, 0);
  assert.equal(returned.timelineRevision, 1);
  assert.equal(returned.moveTimeCount, 1);
  const restored = requireOk(replay.snapshot(), "restored timeline snapshot").managers.scoreLifeState!;
  assert.ok(restored.record.score <= future.record.score);
  assert.ok(restored.initialization.consumedScoringUnitCount <= future.initialization.consumedScoringUnitCount);
  assert.equal(restored.initialization.timelineRevision, 1);
  assert.equal(restored.record.moveTimeCount, 1);

  const reference = requireOk(await fresh(), "seven-second reference");
  requireOk(reference.initialize(), "reference initialize");
  let referenceSeconds = Math.fround(0);
  let referenceFrame = 0;
  while (Math.fround(referenceSeconds + 1 / 60) <= returned.targetSeconds) {
    requireOk(reference.step(1 / 60), `reference frame ${referenceFrame++}`);
    referenceSeconds = Math.fround(referenceSeconds + 1 / 60);
  }
  const remainder = Math.fround(returned.targetSeconds - referenceSeconds);
  if (remainder > 0) requireOk(reference.step(remainder), "reference target remainder");
  const expected = requireOk(reference.snapshot(), "reference snapshot").managers.scoreLifeState!;
  assert.equal(restored.record.score, expected.record.score);
  assert.equal(restored.record.currentLife, expected.record.currentLife);
  assert.equal(restored.record.currentCombo, expected.record.currentCombo);
  assert.deepEqual(restored.record.resultCounts, expected.record.resultCounts);
  assert.equal(restored.initialization.consumedScoringUnitCount, expected.initialization.consumedScoringUnitCount);
  requireOk(reference.dispose(), "reference dispose");

  const advanced = requireOk(await replay.moveTime("advance-five"), "advance-five transaction");
  assert.equal(advanced.targetSeconds, 12);
  assert.equal(advanced.timelineRevision, 1, "forward stays inside the rewind-created revision");
  assert.equal(advanced.moveTimeCount, 2);
  const postAdvance = requireOk(replay.snapshot(), "post-advance snapshot").managers.scoreLifeState!;
  assert.ok(postAdvance.record.score >= restored.record.score);
  assert.equal(postAdvance.initialization.timelineRevision, 1);
  assert.equal(postAdvance.record.moveTimeCount, 2);
  assert.ok(postAdvance.record.score <= postAdvance.initialization.scoreMaximum);
  assert.deepEqual(purposes, ["move-time-reconstruction", "move-time-reconstruction"]);
  requireOk(await replay.retryRehearsal(), "Retry transaction");
  assert.deepEqual(purposes, ["move-time-reconstruction", "move-time-reconstruction", "retry"]);
  assert.equal(requireOk(replay.snapshot(), "Retry snapshot").managers.noteManager.nextBatchIndex, 0);
  requireOk(replay.dispose(), "MoveTime dispose");
}

async function testStartupAudioFreshPurposeIsolation(): Promise<void> {
  const mode = createSimulatorModeIdentity("rehearsal", "auto");
  const builds: { purpose: string; backends: ReturnType<typeof createRecordingSimulatorBackends> }[] = [];
  let generation = 0;
  const fresh = async (purpose: "initial" | "retry" | "move-time-reconstruction") => {
    const sessionId = `startup-purpose:${purpose}:${generation++}`;
    const backends = createRecordingSimulatorBackends();
    const capabilities = virtualAudioCapabilities(CURRENT_AUDIO_TEST_PROFILE);
    const prepared = await backends.audio.prepare(
      sessionId,
      CURRENT_AUDIO_TEST_PROFILE,
      capabilities.provider,
      capabilities.preflight,
    );
    if (prepared.status !== "accepted") {
      return evidenceRequired(prepared.failure.capability, [], prepared.failure.boundary);
    }
    const engine = createSimulatorEngine({
      chart,
      runtime: { highFrequencyMode: false, judgeOffsetFrames: 0, mode },
      scoreLifeState: {
        schemaVersion: 3,
        sessionId,
        mode,
        life: {
          initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000,
          missDamage: -100, badDamage: -50,
        },
      },
      audio: {
        sessionId,
        bgmCue: CURRENT_AUDIO_TEST_PROFILE.resources.find((row) => row.role === "bgm")!.cue,
        seekMilliseconds: 0,
        masterGainBits: "0x3F800000",
        bgmGainBits: "0x3F800000",
        seGainBits: "0x3F800000",
      },
      startupDirection: {
        scene: new RecordingStartupDirectionBackend(),
        liveStartVoiceCue: null,
        purpose,
      },
    }, backends);
    if (engine.status === "ok") builds.push({ purpose, backends });
    return engine;
  };
  const initial = requireOk(await fresh("initial"), "startup-audio initial engine");
  const replay = requireOk(createPortableReplaySimulatorEngine(initial, {
    mode,
    createFreshEngine: (purpose) => fresh(purpose),
  }), "startup-audio replay owner");
  await stepUntilPlayable(replay);
  assert.deepEqual(builds[0]!.backends.audio.snapshot().commands.map((row) => row.kind), [
    "session.open", "gain.set", "bgm.load", "bgm.pause", "bgm.resume",
  ]);
  requireOk(await replay.retryRehearsal(), "startup-audio Retry");
  assert.equal(builds[0]!.backends.audio.snapshot().state, "disposed");
  assert.equal(builds[1]!.purpose, "retry");
  let retrySnapshot = requireOk(replay.snapshot(), "Retry opening snapshot");
  assert.equal(retrySnapshot.managers.startupDirection?.audio?.purpose, "retry");
  assert.deepEqual(retrySnapshot.audioBackend.commands.map((row) => row.kind), [
    "session.open", "gain.set", "bgm.load", "bgm.pause",
  ]);
  await stepUntilPlayable(replay);
  requireOk(await replay.moveTime("advance-five"), "startup-audio advance-five");
  assert.equal(builds[1]!.backends.audio.snapshot().state, "disposed");
  assert.equal(builds[2]!.purpose, "move-time-reconstruction");
  const moved = requireOk(replay.snapshot(), "MoveTime audio snapshot");
  assert.deepEqual(moved.managers.startupDirection?.audio?.timeline, [
    "move-time.bgm.prepare-paused", "move-time.bgm.resume",
  ]);
  assert.equal(moved.audioBackend.commands.some((row) => row.kind === "se.start-owned-loop"), false);
  assert.deepEqual(moved.audioBackend.commands.map((row) => row.kind).filter((kind) =>
    kind !== "se.play-one-shot" && !kind.startsWith("hold.")), [
    "session.open", "gain.set", "bgm.load", "bgm.pause", "bgm.resume", "bgm.move-time-load",
  ]);
  requireOk(replay.dispose(), "startup-audio replay dispose");
  assert.equal(builds[2]!.backends.audio.snapshot().state, "disposed");
}

async function stepUntilPlayable(engine: SimulatorEngine): Promise<void> {
  for (let frame = 0; frame < 500; frame += 1) {
    const snapshot = requireOk(engine.snapshot(), "startup playable snapshot");
    if (snapshot.managers.playable) return;
    requireOk(engine.step(Math.fround(1 / 60)), `startup playable frame ${frame}`);
  }
  throw new Error("startup owner did not reach PlayingSound");
}

function virtualAudioCapabilities(profile: AudioResourceProfileSet): any {
  const rows = profile.resources.map((resource, index) => ({
    resource,
    bytes: Uint8Array.from({ length: resource.byteLength }, (_, byteIndex) => byteIndex === 0 ? index + 1 : 0),
  }));
  const identify = (bytes: Uint8Array) => rows[bytes[0]! - 1]!.resource;
  return {
    provider: {
      async read(resource: any) {
        const row = rows.find((candidate) => candidate.resource.cue === resource.cue && candidate.resource.logicalId === resource.logicalId);
        return row === undefined
          ? { status: "audio-resource-unavailable" as const, failure: { code: "audio-resource-unavailable", capability: "test.missing", boundary: "missing" } }
          : audioAccepted(Uint8Array.from(row.bytes));
      },
    },
    preflight: {
      async sha256(bytes: Uint8Array) { return audioAccepted(identify(bytes).sha256); },
      async inspect(bytes: Uint8Array) {
        const resource = identify(bytes);
        return audioAccepted({
          codec: resource.codec, sampleRate: resource.sampleRate, channels: resource.channels,
          durationSeconds: resource.durationSeconds, sampleFrames: resource.sampleFrames,
        });
      },
    },
  };
}

function createModeEngine(
  mode: SimulatorModeIdentity,
  sessionId: string,
  missDamage = -100,
): SimulatorResult<SimulatorEngine> {
  return createSimulatorEngine({
    chart,
    runtime: {
      highFrequencyMode: false,
      judgeOffsetFrames: 0,
      mode,
    },
    scoreLifeState: {
      schemaVersion: 3,
      sessionId,
      mode,
      life: {
        initialLife: 1000,
        playerMaxLife: 1000,
        lifeUpperLimit: 2000,
        missDamage,
        badDamage: -50,
      },
    },
  }, createRecordingSimulatorBackends());
}

function request(
  sessionMode: "live" | "rehearsal",
  inputMode: "manual" | "auto",
): SimulatorModuleLaunchRequest {
  return {
    chartData: {
      chart: [
        { type: "BPM", beat: 0, value: 120 },
        { type: "Single", beat: 4, lane: 1, width: 1 },
      ],
      bgm: new Uint8Array([1, 2, 3]),
      isFullLength: false,
    },
    presentation: createTestPresentationPackage(),
    config: {
      sessionMode,
      inputMode,
      highFrequencyMode: false,
      judgeOffsetFrames: 0,
      visual: {
        specificSpeed: Math.fround(11),
        noteSize: Math.fround(100),
        habahiroMeshWidthSetting: Math.fround(1),
      },
      audio: { masterGain: 1, bgmGain: 1, seGain: 1 },
    },
  };
}

function structuredCloneRequest(value: SimulatorModuleLaunchRequest): SimulatorModuleLaunchRequest {
  return {
    chartData: {
      ...value.chartData,
      bgm: Uint8Array.from(value.chartData.bgm),
      isFullLength: value.chartData.isFullLength,
    },
    presentation: {
      ...value.presentation,
      song: { ...value.presentation.song },
      difficulty: { ...value.presentation.difficulty },
      jacketPng: Uint8Array.from(value.presentation.jacketPng),
      stage: {
        backdropPng: Uint8Array.from(value.presentation.stage.backdropPng),
      },
      mv: value.presentation.mv === null ? null : {
        bytes: Uint8Array.from(value.presentation.mv.bytes),
        musicStartDelayMilliseconds: value.presentation.mv.musicStartDelayMilliseconds,
      },
    },
    config: {
      ...value.config,
      visual: { ...value.config.visual },
      audio: { ...value.config.audio },
    },
  };
}

function accepted<T>(value: T): any {
  return Object.freeze({ status: "accepted", value });
}
function rejected(capability: string, boundary: string): any {
  return Object.freeze({ status: "rejected", failure: { code: "evidence-required", capability, boundary } });
}
function requireOk<T>(result: { status: string; value?: T; capability?: string }, message: string): T {
  if (result.status !== "ok") throw new Error(`${message}: ${result.capability ?? result.status}`);
  return result.value as T;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
