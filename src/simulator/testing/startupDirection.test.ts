declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");

import { createNoteBatchInformationList } from "../engine/chart/construction";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { GameState } from "../engine/data/inGameState";
import { StartupDirectionController } from "../engine/managers/startupDirectionController";
import { RecordingStartupDirectionBackend } from "../backends/recordingStartupDirectionBackend";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { createSimulatorEngine } from "../host/createSimulatorEngine";

function main(): void {
  testFourModeStateAndMutationGate();
  testFloat32NoRemainder();
  testVoiceWaitAndDelayedBgm();
  console.log("startup direction engine tests passed: four modes/state0-5/mutation gate/Float32 owners");
}

function testFourModeStateAndMutationGate(): void {
  for (const sessionMode of ["live", "rehearsal"] as const) {
    for (const inputMode of ["manual", "auto"] as const) {
      const chart = requireOk<any>(createNoteBatchInformationList({ musicScoreData: "#BPM 120\n#WAV01 normal.wav\n#00111:01\n" }));
      const mode = createSimulatorModeIdentity(sessionMode, inputMode);
      const scene = new RecordingStartupDirectionBackend();
      const engine = requireOk<any>(createSimulatorEngine({
        chart,
        runtime: { highFrequencyMode: false, judgeOffsetFrames: 0, mode },
        scoreLifeState: {
          schemaVersion: 3,
          sessionId: `startup:${sessionMode}:${inputMode}`,
          life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
          mode,
        },
        startupDirection: { scene, liveStartVoiceCue: null, purpose: "initial" },
      }, createRecordingSimulatorBackends()));
      requireOk(engine.initialize());
      const initial = requireOk<any>(engine.snapshot());
      assert.equal(initial.managers.currentGameState, GameState.Prepare);
      assert.equal(initial.managers.playable, false);
      const baseline = businessDigest(initial);
      const observed: number[] = [initial.managers.currentGameState];
      const delta = Math.fround(1 / 60);
      for (let frame = 0; frame < 500 && !requireOk<any>(engine.snapshot()).managers.playable; frame += 1) {
        requireOk(engine.step(delta, { touches: [] }));
        const snapshot = requireOk<any>(engine.snapshot());
        if (observed[observed.length - 1] !== snapshot.managers.currentGameState) observed.push(snapshot.managers.currentGameState);
        if (snapshot.managers.currentGameState < GameState.PlayingSound) {
          assert.deepEqual(businessDigest(snapshot), baseline);
        }
      }
      const playable = requireOk<any>(engine.snapshot());
      assert.deepEqual(observed, [0, 1, 2, 3, 4, 5]);
      assert.equal(playable.managers.playable, true);
      assert.equal(playable.managers.startupDirection?.scene.linePhase, "fading");
      assert.ok((playable.managers.startupDirection?.scene.lineAlpha ?? 0) > 0);
      assert.ok((playable.managers.startupDirection?.scene.lineAlpha ?? 1) < 1);
      assert.equal(playable.managers.startupDirection?.scene.rehearsalControlsVisible, sessionMode === "rehearsal");
      assert.equal(scene.snapshot().states.length > 100, true);
      requireOk(engine.dispose());
      assert.equal(scene.snapshot().disposed, true);
    }
  }
}

function testFloat32NoRemainder(): void {
  const backend = new RecordingStartupDirectionBackend();
  const controller = new StartupDirectionController(createSimulatorModeIdentity("live", "manual"), backend);
  requireOk(controller.initialize());
  requireOk(controller.step(Math.fround(1)));
  assert.equal(controller.snapshot().currentGameState, GameState.Prepare);
  assert.equal(controller.snapshot().phase, "first-view");
  assert.equal(controller.snapshot().scene.informationAlpha, 1);
  requireOk(controller.step(Math.fround(0)));
  assert.equal(controller.snapshot().currentGameState, GameState.OPFirstAnimStart);
  assert.equal(controller.snapshot().phase, "information-hold");
  assert.equal(controller.snapshot().phaseElapsed, 0);
  controller.dispose();
}

function testVoiceWaitAndDelayedBgm(): void {
  let voiceStarts = 0;
  let bgmStarts = 0;
  let voicePlaying = true;
  const transaction = (commit: () => void) => ({
    status: "ok" as const,
    value: { commit() { commit(); return { status: "ok" as const, value: undefined }; } },
  });
  const audio = {
    preflightStartLiveVoice() { return transaction(() => { voiceStarts += 1; }); },
    isLiveStartVoicePlaying() { return { status: "ok" as const, value: voicePlaying }; },
    preflightStartBgm() { return transaction(() => { bgmStarts += 1; }); },
  } as any;
  const live = new StartupDirectionController(
    createSimulatorModeIdentity("live", "manual"),
    new RecordingStartupDirectionBackend(),
    audio,
    "session_live_start_voice_" + "A".repeat(64),
  );
  requireOk(live.initialize());
  assert.equal(voiceStarts, 1);
  for (let index = 0; index < 30 && live.snapshot().phase !== "voice-wait"; index += 1) {
    requireOk(live.step(Math.fround(1)));
  }
  assert.equal(live.snapshot().phase, "voice-wait");
  for (let index = 0; index < 3; index += 1) requireOk(live.step(Math.fround(1)));
  assert.equal(live.snapshot().phase, "voice-wait");
  assert.equal(bgmStarts, 0);
  voicePlaying = false;
  requireOk(live.step(Math.fround(1)));
  assert.equal(live.snapshot().phase, "music-wait");
  requireOk(live.step(Math.fround(1)));
  assert.equal(bgmStarts, 0);
  requireOk(live.step(Math.fround(0)));
  assert.equal(bgmStarts, 1);
  assert.equal(live.snapshot().currentGameState, GameState.PlayingNone);
  live.dispose();

  voiceStarts = 0;
  const practice = new StartupDirectionController(
    createSimulatorModeIdentity("rehearsal", "auto"),
    null,
    audio,
    "session_live_start_voice_" + "B".repeat(64),
  );
  requireOk(practice.initialize());
  assert.equal(voiceStarts, 0);
  practice.dispose();

  bgmStarts = 0;
  const reconstruction = new StartupDirectionController(
    createSimulatorModeIdentity("rehearsal", "auto"),
    null,
    audio,
    null,
    "move-time-reconstruction",
  );
  requireOk(reconstruction.initialize());
  assert.equal(reconstruction.snapshot().currentGameState, GameState.PlayingSound);
  assert.equal(reconstruction.snapshot().playable, true);
  assert.equal(reconstruction.snapshot().scene.informationPhase, "complete");
  assert.equal(bgmStarts, 1);
  reconstruction.dispose();
}

function businessDigest(snapshot: any): unknown {
  return {
    adjustedMusicPosition: snapshot.adjustedMusicPosition,
    nextBatchIndex: snapshot.managers.noteManager.nextBatchIndex,
    input: snapshot.managers.inputManager,
    oneFrame: snapshot.managers.oneFrame,
    scoreLife: snapshot.managers.scoreLifeState,
    particle: snapshot.managers.particle,
  };
}
function requireOk<T>(result: any): T {
  if (result.status !== "ok") throw new Error(`${result.capability}: ${result.boundary}`);
  return result.value as T;
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
