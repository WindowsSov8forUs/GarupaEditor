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
import type { SimulatorResult } from "../engine/evidence";
import { createTestPresentationPackage } from "./startupPresentationTestProfile";

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
  console.log("Live/Rehearsal mode tests passed: four identities, exact Public rejection, Life-zero split, ±5 timeline restore");
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
        ? accepted({ engine: engine.value, mode })
        : rejected(engine.capability, engine.boundary);
    },
  });
  const created = await factory.create(request("live", "manual"));
  assert.equal(created.status, "accepted");
  if (created.status !== "accepted") throw new Error(created.failure.capability);
  let closed = null;
  for (let frame = 0; frame < 3600; frame += 1) {
    const stepped = created.value.step(1 / 30, { touches: [] });
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
        highAspectRatio: 1,
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
        sdCharacterAtlases: value.presentation.stage.sdCharacterAtlases.map((bytes) => Uint8Array.from(bytes)) as unknown as SimulatorModuleLaunchRequest["presentation"]["stage"]["sdCharacterAtlases"],
      },
      liveStartVoiceMp3: value.presentation.liveStartVoiceMp3 === null ? null : Uint8Array.from(value.presentation.liveStartVoiceMp3),
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
