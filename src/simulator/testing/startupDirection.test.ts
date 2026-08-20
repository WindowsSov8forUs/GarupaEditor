import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
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
import type { AudioResourceProfileSet } from "../backends/audioContracts";
import { audioAccepted } from "../backends/audioValidation";
import { CURRENT_AUDIO_TEST_PROFILE } from "./audioSessionBgmTestProfile";

async function main(): Promise<void> {
  testFourModeStateAndMutationGate();
  testFloat32NoRemainder();
  testVoiceWaitAndDelayedBgm();
  await testFourModeAudioTimeline();
  await testMoveTimeAudioPurpose();
  console.log("startup direction engine tests passed: four modes/state0-5/mutation gate/Float32 audio owners");
}

function testFourModeStateAndMutationGate(): void {
  for (const sessionMode of ["live", "rehearsal"] as const) {
    for (const inputMode of ["manual", "auto"] as const) {
      const chart = requireOk<any>(createNoteBatchInformationList({ musicScoreData: "#BPM 120\n#WAV01 normal.wav\n#00111:01\n" }));
      const mode = createSimulatorModeIdentity(sessionMode, inputMode);
      const scene = new RecordingStartupDirectionBackend();
      const engine = requireOk<any>(createSimulatorEngine({
        chart,
        runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode },
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
  let gayaStarts = 0;
  let gayaFades = 0;
  let voiceReleases = 0;
  let voicePlaying = true;
  const transaction = (commit: () => void) => ({
    status: "ok" as const,
    value: { commit() { commit(); return { status: "ok" as const, value: undefined }; } },
  });
  const audio = {
    preflightStartupOpening(includeGaya: boolean, voiceCue: string | null) {
      return transaction(() => {
        if (includeGaya) gayaStarts += 1;
        if (voiceCue !== null) voiceStarts += 1;
      });
    },
    preflightMoveTimeReconstructionBgm() {
      return transaction(() => { bgmStarts += 1; });
    },
    isLiveStartVoicePlaying() { return { status: "ok" as const, value: voicePlaying }; },
    preflightReleaseLiveStartVoice() {
      return transaction(() => { voiceReleases += 1; });
    },
    preflightEnterStartupPlaying(includeGaya: boolean) {
      return transaction(() => {
        if (includeGaya) gayaFades += 1;
        bgmStarts += 1;
      });
    },
  } as any;
  const live = new StartupDirectionController(
    createSimulatorModeIdentity("live", "manual"),
    new RecordingStartupDirectionBackend(),
    audio,
    "session_live_start_voice_" + "A".repeat(64),
  );
  requireOk(live.initialize());
  assert.equal(voiceStarts, 1);
  assert.equal(gayaStarts, 1);
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
  assert.equal(voiceReleases, 1);
  requireOk(live.step(Math.fround(1)));
  assert.equal(bgmStarts, 0);
  requireOk(live.step(Math.fround(0)));
  assert.equal(bgmStarts, 1);
  assert.equal(gayaFades, 1);
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
  assert.equal(gayaStarts, 1);
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

async function testFourModeAudioTimeline(): Promise<void> {
  for (const sessionMode of ["live", "rehearsal"] as const) {
    for (const inputMode of ["manual", "auto"] as const) {
      const sessionId = `startup-audio:${sessionMode}:${inputMode}`;
      const chart = requireOk<any>(createNoteBatchInformationList({
        musicScoreData: "#BPM 120\n#WAV01 normal.wav\n#00111:01\n",
      }));
      const mode = createSimulatorModeIdentity(sessionMode, inputMode);
      const backends = createRecordingSimulatorBackends();
      const audioCapabilities = virtualAudioCapabilities(CURRENT_AUDIO_TEST_PROFILE);
      assert.equal((await backends.audio.prepare(
        sessionId,
        CURRENT_AUDIO_TEST_PROFILE,
        audioCapabilities.provider,
        audioCapabilities.preflight,
      )).status, "accepted");
      const engine = requireOk<any>(createSimulatorEngine({
        chart,
        runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode },
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
          purpose: "initial",
        },
      }, backends));
      requireOk(engine.initialize());
      assert.deepEqual(
        requireOk<any>(engine.snapshot()).audioBackend.commands.map((row: any) => row.kind),
        sessionMode === "live"
          ? ["session.open", "gain.set", "bgm.load", "bgm.pause", "se.start-owned-loop"]
          : ["session.open", "gain.set", "bgm.load", "bgm.pause"],
      );
      const delta = Math.fround(1 / 60);
      for (let frame = 0; frame < 500 && !requireOk<any>(engine.snapshot()).managers.playable; frame += 1) {
        requireOk(engine.step(delta, { touches: [] }));
      }
      const playable = requireOk<any>(engine.snapshot());
      assert.deepEqual(
        playable.audioBackend.commands.map((row: any) => row.kind),
        sessionMode === "live"
          ? [
              "session.open", "gain.set", "bgm.load", "bgm.pause",
              "se.start-owned-loop", "se.fade-owned-loop", "bgm.resume",
            ]
          : ["session.open", "gain.set", "bgm.load", "bgm.pause", "bgm.resume"],
      );
      assert.deepEqual(
        playable.managers.startupDirection.audio.timeline,
        sessionMode === "live"
          ? ["bgm.prepare-paused", "gaya.start", "gaya.fade-stop-at-zero", "bgm.resume"]
          : ["bgm.prepare-paused", "gaya.fade-null-safe", "bgm.resume"],
      );
      assert.equal(playable.audioBackend.semantic.bgmPaused, false);
      assert.deepEqual(playable.audioBackend.semantic.startupLoops, []);
      requireOk(engine.dispose());
    }
  }
}

async function testMoveTimeAudioPurpose(): Promise<void> {
  const sessionId = "startup-audio:move-time";
  const chart = requireOk<any>(createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#WAV01 normal.wav\n#00111:01\n",
  }));
  const mode = createSimulatorModeIdentity("rehearsal", "manual");
  const backends = createRecordingSimulatorBackends();
  const audioCapabilities = virtualAudioCapabilities(CURRENT_AUDIO_TEST_PROFILE);
  assert.equal((await backends.audio.prepare(
    sessionId,
    CURRENT_AUDIO_TEST_PROFILE,
    audioCapabilities.provider,
    audioCapabilities.preflight,
  )).status, "accepted");
  const engine = requireOk<any>(createSimulatorEngine({
    chart,
    runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode },
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
      purpose: "move-time-reconstruction",
    },
  }, backends));
  requireOk(engine.initialize());
  const snapshot = requireOk<any>(engine.snapshot());
  assert.equal(snapshot.managers.playable, true);
  assert.deepEqual(snapshot.audioBackend.commands.map((row: any) => row.kind), [
    "session.open", "gain.set", "bgm.load", "bgm.pause", "bgm.resume",
  ]);
  assert.deepEqual(snapshot.managers.startupDirection.audio.timeline, [
    "move-time.bgm.prepare-paused", "move-time.bgm.resume",
  ]);
  assert.equal(snapshot.managers.startupDirection.audio.gayaRequired, false);
  requireOk(engine.dispose());
}

function virtualAudioCapabilities(profile: AudioResourceProfileSet): any {
  const resources = profile.resources.map((resource, index) => ({
    resource,
    bytes: Uint8Array.from({ length: resource.byteLength }, (_, byteIndex) =>
      byteIndex === 0 ? index + 1 : 0),
  }));
  const identify = (bytes: Uint8Array) => resources[bytes[0]! - 1]!.resource;
  return {
    provider: {
      async read(resource: any) {
        const row = resources.find((candidate) =>
          candidate.resource.logicalId === resource.logicalId && candidate.resource.cue === resource.cue);
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
          codec: resource.codec,
          sampleRate: resource.sampleRate,
          channels: resource.channels,
          durationSeconds: resource.durationSeconds,
          sampleFrames: resource.sampleFrames,
        });
      },
    },
  };
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

main().catch((error) => { console.error(error); process.exitCode = 1; });
