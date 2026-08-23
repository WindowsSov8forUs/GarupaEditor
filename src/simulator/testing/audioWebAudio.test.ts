declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createHash } = require("node:crypto");

import type {
  AudioDecodedResourceMetadata,
  AudioResourcePreflightAdapter,
  AudioResourceProvider,
} from "../backends/audioContracts";
import { audioAccepted } from "../backends/audioValidation";
import { WebAudioSimulatorBackend } from "../backends/audio/webAudioBackend";
import {
  CURRENT_AUDIO_TEST_PROFILE,
  CURRENT_BGM_REGRESSION_RESOURCE,
} from "./audioSessionBgmTestProfile";
import { createAudioSessionResourceProfile } from "./legacyCurrentAudioResourceManifest";
import { resolveOriginalSkinRecipe } from "../engine/skin/originalSkinResolver";
import { LIVE_MANUAL_MODE } from "./modeFixtures";
import { selectResolvedSkinResourceInventory } from "./legacySkinResourceSelector";
import { prepareSelectedSkinPortablePacks } from "./legacySkinPortablePack";
import { ImmutableSharedStaticResourceStore } from "./legacySharedStaticResourceStore";
import { prepareSkinAudioOverlay } from "./legacySkinAudioPreparation";

const profileByLength = new Map(
  CURRENT_AUDIO_TEST_PROFILE.resources.map((resource) => [resource.byteLength, resource]),
);
const provider: AudioResourceProvider = {
  async read(resource) {
    return audioAccepted(new Uint8Array(resource.byteLength));
  },
};
const preflight: AudioResourcePreflightAdapter = {
  async sha256(bytes) {
    return audioAccepted(profileByLength.get(bytes.byteLength)?.sha256 ?? "");
  },
  async inspect(bytes) {
    const resource = profileByLength.get(bytes.byteLength)!;
    return audioAccepted<AudioDecodedResourceMetadata>({
      codec: "mp3",
      sampleRate: resource.sampleRate,
      channels: resource.channels,
      durationSeconds: resource.durationSeconds,
      sampleFrames: resource.sampleFrames,
    });
  },
  getDecodedBuffer(bytes) {
    const resource = profileByLength.get(bytes.byteLength)!;
    return audioAccepted({
      sampleRate: resource.sampleRate,
      numberOfChannels: resource.channels,
      length: resource.sampleFrames,
      duration: resource.durationSeconds,
    } as AudioBuffer);
  },
};

async function main(): Promise<void> {
  const context = new FakeAudioContext();
  const backend = new WebAudioSimulatorBackend(context as unknown as AudioContext);
  assert.equal((await backend.prepare(
    "web-session",
    CURRENT_AUDIO_TEST_PROFILE,
    provider,
    preflight,
  )).status, "accepted");
  assert.equal(backend.snapshot().state, "ready");
  assert.equal(context.decodeCount, 0);
  assert.equal(context.gains.length, 2);

  execute(backend, [
    { kind: "session.open", bgm_pool: 8, se_pool: 12, one_shot_pool: 1 },
    { kind: "gain.set", bgm_bits: "0x3E800000", se_bits: "0x3F000000" },
    { kind: "bgm.load", cue: CURRENT_BGM_REGRESSION_RESOURCE.cue, seek_ms: 1234, priority: 255, fade_bits: "0x00000000" },
    { kind: "audio.pause-all", paused: true },
    { kind: "audio.pause-all", paused: false },
  ]);
  assert.equal(context.sources.length, 2);
  assert.equal(context.sources[0]!.startOffset, 1.234);
  assert.equal(context.sources[0]!.stopCount, 1);
  assert.equal(context.sources[1]!.startOffset, 1.234);

  const startupContext = new FakeAudioContext();
  const startupBackend = new WebAudioSimulatorBackend(startupContext as unknown as AudioContext);
  assert.equal((await startupBackend.prepare(
    "web-startup-bgm-resume",
    CURRENT_AUDIO_TEST_PROFILE,
    provider,
    preflight,
  )).status, "accepted");
  execute(startupBackend, [
    { kind: "session.open", bgm_pool: 8, se_pool: 12, one_shot_pool: 1 },
    { kind: "gain.set", bgm_bits: "0x3F800000", se_bits: "0x3F800000" },
    { kind: "bgm.load", cue: CURRENT_BGM_REGRESSION_RESOURCE.cue, seek_ms: 0, priority: 255, fade_bits: "0x00000000" },
    { kind: "bgm.pause" },
  ]);
  const startupBgmVoiceGain = startupContext.gains[2]!.gain;
  assert.deepEqual(startupBgmVoiceGain.events[startupBgmVoiceGain.events.length - 1], ["set", 0, startupContext.currentTime]);
  startupBgmVoiceGain.value = 1;
  execute(startupBackend, [{ kind: "bgm.resume" }]);
  assert.deepEqual(
    startupBgmVoiceGain.events[startupBgmVoiceGain.events.length - 1],
    ["set", 1, startupContext.currentTime],
    "BGM resume must publish gain 1 even when AudioParam.value exposes a stale base value over scheduled zero automation",
  );
  assert.equal(startupBackend.dispose().status, "accepted");

  execute(backend, [{
    kind: "hold.start-loop",
    cue: "SE_RHYTHM_TAP_LONG",
    owner_key: "long:1",
    volume_bits: "0x3F800000",
    fade_in_bits: "0x00000000",
  }]);
  const holdSource = context.sources[context.sources.length - 1]!;
  assert.equal(holdSource.loop, true);
  assert.equal(holdSource.loopStart, 0);
  assert.equal(holdSource.loopEnd, 22997 / 44100);
  context.currentTime += 0.25;
  execute(backend, [
    { kind: "bgm.pause" },
    { kind: "se.pause" },
    { kind: "hold.pause", owner_key: "long:1" },
  ]);
  execute(backend, [
    { kind: "bgm.resume" },
    { kind: "se.resume" },
    { kind: "hold.resume", owner_key: "long:1" },
  ]);
  assert.ok(context.sources.length >= 5);
  execute(backend, [{
    kind: "hold.fade",
    owner_key: "long:1",
    target_bits: "0x00000000",
    duration_bits: "0x3E99999A",
    stop_at_zero: true,
  }]);
  assert.equal(context.sources[context.sources.length - 1]!.scheduledStop, context.currentTime + Math.fround(0.3));

  context.state = "suspended";
  context.dispatchStateChange();
  assert.equal(backend.snapshot().state, "faulted");
  assert.equal(backend.snapshot().fault?.capability, "audio.web.context-lost-after-ready");
  context.state = "running";
  assert.equal(backend.execute({ kind: "unknown" } as any).status, "audio-backend-fault");
  assert.equal(backend.snapshot().fault?.capability, "audio.web.context-lost-after-ready");
  assert.equal(backend.dispose().status, "accepted");
  assert.equal(backend.snapshot().state, "disposed");
  assert.equal(backend.snapshot().fault?.capability, "audio.web.context-lost-after-ready");
  assert.equal(backend.dispose().status, "terminal-disposed");

  const gayaContext = new FakeAudioContext();
  const gaya = new WebAudioSimulatorBackend(gayaContext as unknown as AudioContext);
  assert.equal((await gaya.prepare(
    "gaya-session",
    CURRENT_AUDIO_TEST_PROFILE,
    provider,
    preflight,
  )).status, "accepted");
  execute(gaya, [
    { kind: "session.open", bgm_pool: 8, se_pool: 12, one_shot_pool: 1 },
    { kind: "gain.set", bgm_bits: "0x3F800000", se_bits: "0x3F000000" },
    {
      kind: "se.start-owned-loop",
      cue: "SE_RHYTHM_GAYA",
      owner_key: "startup:gaya",
      volume_bits: "0x3F800000",
      fade_in_bits: "0x3F000000",
    },
  ]);
  const gayaSource = gayaContext.sources[gayaContext.sources.length - 1]!;
  const gayaGain = gayaContext.gains[gayaContext.gains.length - 1]!;
  assert.equal(gayaSource.loop, true);
  assert.equal(gayaSource.loopStart, 0);
  assert.equal(gayaSource.loopEnd, 310191 / 44100);
  assert.deepEqual(gayaGain.gain.events.slice(-3), [
    ["cancel", 0, 10],
    ["set", 0, 10],
    ["ramp", 1, 10.5],
  ]);
  gayaContext.currentTime += 0.25;
  execute(gaya, [{ kind: "se.pause" }]);
  assert.equal(gaya.snapshot().semantic.startupLoops[0]?.paused, true);
  assert.equal(gayaSource.stopCount, 1);
  execute(gaya, [{ kind: "se.resume" }]);
  assert.equal(gaya.snapshot().semantic.startupLoops[0]?.paused, false);
  const resumedGayaSource = gayaContext.sources[gayaContext.sources.length - 1]!;
  gayaContext.currentTime += 0.3;
  execute(gaya, [{
    kind: "se.fade-owned-loop",
    owner_key: "startup:gaya",
    target_bits: "0x00000000",
    duration_bits: "0x3FC00000",
    stop_at_zero: true,
  }]);
  assert.equal(resumedGayaSource.scheduledStop, gayaContext.currentTime + 1.5);
  assert.deepEqual(gaya.snapshot().semantic.startupLoops, []);
  resumedGayaSource.onended?.();
  assert.equal(gaya.dispose().status, "accepted");

  const voiceSha = "D".repeat(64);
  const voiceCue = `session_live_start_voice_${voiceSha}`;
  const voiceProfile = createAudioSessionResourceProfile(
    CURRENT_BGM_REGRESSION_RESOURCE,
    Object.freeze({
      role: "voice" as const,
      logicalId: `startup/session/live-start-voice/${voiceSha}`,
      cue: voiceCue,
      byteLength: 4097,
      sha256: voiceSha,
      mime: "audio/mpeg" as const,
      codec: "mp3" as const,
      sampleRate: 44100,
      channels: 2 as const,
      durationSeconds: 1,
      sampleFrames: 44100,
      loop: null,
      identity: "session-explicit" as const,
      signal: "host-supplied-portable" as const,
    }),
  );
  const voiceByLength = new Map(voiceProfile.resources.map((resource) => [resource.byteLength, resource]));
  const voiceProvider: AudioResourceProvider = {
    async read(resource) { return audioAccepted(new Uint8Array(resource.byteLength)); },
  };
  const voicePreflight: AudioResourcePreflightAdapter = {
    async sha256(bytes) { return audioAccepted(voiceByLength.get(bytes.byteLength)!.sha256); },
    async inspect(bytes) {
      const resource = voiceByLength.get(bytes.byteLength)!;
      return audioAccepted({
        codec: resource.codec, sampleRate: resource.sampleRate, channels: resource.channels,
        durationSeconds: resource.durationSeconds, sampleFrames: resource.sampleFrames,
      });
    },
    getDecodedBuffer(bytes) {
      const resource = voiceByLength.get(bytes.byteLength)!;
      return audioAccepted({
        sampleRate: resource.sampleRate, numberOfChannels: resource.channels,
        length: resource.sampleFrames, duration: resource.durationSeconds,
      } as AudioBuffer);
    },
  };
  const voiceContext = new FakeAudioContext();
  const voice = new WebAudioSimulatorBackend(voiceContext as unknown as AudioContext);
  assert.equal((await voice.prepare(
    "voice-session", voiceProfile, voiceProvider, voicePreflight,
  )).status, "accepted");
  execute(voice, [
    { kind: "session.open", bgm_pool: 8, se_pool: 12, one_shot_pool: 1 },
    { kind: "gain.set", bgm_bits: "0x3F800000", se_bits: "0x3F800000" },
    {
      kind: "se.play-one-shot", cue: voiceCue, voice_key: "live-start",
      volume_bits: "0x3F800000", pitch_bits: "0x00000000",
      pan_distance_bits: "0x00000000", pan_angle_bits: "0x00000000",
    },
  ]);
  assert.equal(voice.getOneShotPlaybackState("live-start").status, "accepted");
  const voiceSource = voiceContext.sources[voiceContext.sources.length - 1]!;
  voiceSource.onended?.();
  const endedVoice = voice.getOneShotPlaybackState("live-start");
  assert.equal(endedVoice.status, "accepted");
  if (endedVoice.status === "accepted") assert.equal(endedVoice.value, "ended");
  execute(voice, [{ kind: "voice.release-live-start", cue: voiceCue, voice_key: "live-start" }]);
  assert.equal(voice.dispose().status, "accepted");

  const moveTimeContext = new FakeAudioContext();
  const moveTime = new WebAudioSimulatorBackend(
    moveTimeContext as unknown as AudioContext,
    true,
  );
  assert.equal((await moveTime.prepare(
    "move-time-session",
    CURRENT_AUDIO_TEST_PROFILE,
    provider,
    preflight,
  )).status, "accepted");
  execute(moveTime, [
    { kind: "session.open", bgm_pool: 8, se_pool: 12, one_shot_pool: 1 },
    { kind: "gain.set", bgm_bits: "0x3E800000", se_bits: "0x3F000000" },
    { kind: "bgm.load", cue: CURRENT_BGM_REGRESSION_RESOURCE.cue, seek_ms: 0, priority: 255, fade_bits: "0x00000000" },
    { kind: "audio.pause-all", paused: true },
    { kind: "audio.pause-all", paused: false },
  ]);
  assert.equal(moveTimeContext.sources.length, 0);
  assert.equal(moveTime.publishMoveTimeOutput(5000).status, "accepted");
  assert.equal(moveTimeContext.sources.length, 1);
  assert.equal(moveTimeContext.sources[0]!.startOffset, 5);
  const moveTimeCommands = moveTime.snapshot().commands;
  assert.equal(moveTimeCommands[moveTimeCommands.length - 1]?.kind, "bgm.move-time-load");
  assert.equal(moveTime.publishMoveTimeOutput(5000).status, "evidence-required");
  assert.equal(moveTime.dispose().status, "accepted");

  const throwingContext = new FakeAudioContext();
  const throwing = new WebAudioSimulatorBackend(throwingContext as unknown as AudioContext);
  assert.equal((await throwing.prepare(
    "throw-session",
    CURRENT_AUDIO_TEST_PROFILE,
    provider,
    preflight,
  )).status, "accepted");
  execute(throwing, [{ kind: "session.open", bgm_pool: 8, se_pool: 12, one_shot_pool: 1 }]);
  throwingContext.throwOnStart = true;
  const thrown = throwing.execute({
    kind: "bgm.load", cue: CURRENT_BGM_REGRESSION_RESOURCE.cue, seek_ms: 0, priority: 255, fade_bits: "0x00000000",
  });
  assert.equal(thrown.status, "audio-backend-fault");
  assert.equal(throwing.snapshot().fault?.capability, "audio.web.command-commit-threw");
  assert.equal(throwing.snapshot().commands[throwing.snapshot().commands.length - 1]?.kind, "bgm.load");
  const later = throwing.recordTerminalFault("replacement", "replacement");
  assert.equal(later.status, "audio-backend-fault");
  assert.equal(throwing.snapshot().fault?.capability, "audio.web.command-commit-threw");
  assert.equal(throwing.dispose().status, "accepted");

  const disposeFaultContext = new FakeAudioContext();
  const disposeFault = new WebAudioSimulatorBackend(disposeFaultContext as unknown as AudioContext);
  assert.equal((await disposeFault.prepare(
    "dispose-fault-session", CURRENT_AUDIO_TEST_PROFILE, provider, preflight,
  )).status, "accepted");
  execute(disposeFault, [
    { kind: "session.open", bgm_pool: 8, se_pool: 12, one_shot_pool: 1 },
    {
      kind: "se.start-owned-loop", cue: "SE_RHYTHM_GAYA", owner_key: "startup:gaya",
      volume_bits: "0x3F800000", fade_in_bits: "0x3F000000",
    },
  ]);
  disposeFaultContext.throwOnDisconnect = true;
  const failedDispose = disposeFault.dispose();
  assert.equal(failedDispose.status, "audio-backend-fault");
  if (failedDispose.status === "audio-backend-fault") {
    assert.equal(failedDispose.failure.capability, "audio.web.dispose-node-threw");
  }
  assert.equal(disposeFault.snapshot().state, "disposed");
  assert.equal(disposeFault.snapshot().resourceCount, 0);
  await testSelectedSkinWebAudio();

  console.log("audio Web Audio tests passed: prepare/decode graph transport MoveTime publication context-loss sync-fault dispose");
}

async function testSelectedSkinWebAudio(): Promise<void> {
  await runSelectedSkinWebAudio("default");
  await runSelectedSkinWebAudio("limited3");
}

async function runSelectedSkinWebAudio(scenario: "default" | "limited3"): Promise<void> {
  const recipeResult = resolveOriginalSkinRecipe({
    noteSkin: 0, fieldSkin: 0, tapEffect: 0, judgeSE: 0,
    directionalFlick: 0, directionalFlickEffect: 0, isFixedBG: false,
    special: scenario === "default"
      ? { kind: "none" }
      : {
          kind: "limited", limitedSkinId: 3,
          components: {
            laneAndLine: "on", tapEffect: "on", rhythmIcon: "on", background: "on",
            soundEffect: "on", judge: "on", directionalFlickIcon: "on",
          },
        },
  }, LIVE_MANUAL_MODE, "ordinary", "standard");
  if (recipeResult.status !== "ok") throw new Error(recipeResult.capability);
  const selected = selectResolvedSkinResourceInventory(recipeResult.value);
  const root = join(process.cwd(), `src/simulator/testing/fixtures/reverse-snapshots/skin-settings/${scenario}`);
  const storeResult = ImmutableSharedStaticResourceStore.create(selected.resources.map((resource) => ({
    resourceKey: resource.resourceKey,
    bytes: new Uint8Array(readFileSync(join(root, `${resource.logicalResource.replace(/\//g, "__")}.json`))),
  })));
  if (storeResult.status !== "accepted") throw new Error(storeResult.failure.capability);
  const packs = await prepareSelectedSkinPortablePacks(selected.resources, storeResult.value);
  if (packs.status !== "accepted") throw new Error(packs.failure.capability);
  const overlay = await prepareSkinAudioOverlay(
    CURRENT_AUDIO_TEST_PROFILE,
    provider,
    packs.value,
    recipeResult.value.tapSE.logicalResource!,
    recipeResult.value.directional.seLogicalResource,
    {
      async sha256() { throw new Error("static Skin audio does not request dynamic SHA preflight"); },
      async inspect() { throw new Error("static Skin audio already carries exact container metadata"); },
    },
  );
  if (overlay.status !== "accepted") throw new Error(overlay.failure.capability);
  const bySha = new Map(overlay.value.profile.resources.map((resource) => [resource.sha256, resource]));
  const resourceForBytes = (bytes: Uint8Array) => {
    const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
    return bySha.get(hash) ?? CURRENT_AUDIO_TEST_PROFILE.resources.find((resource) =>
      resource.byteLength === bytes.byteLength)!;
  };
  const selectedPreflight: AudioResourcePreflightAdapter = {
    async sha256(bytes) {
      return audioAccepted(resourceForBytes(bytes).sha256);
    },
    async inspect(bytes) {
      const resource = resourceForBytes(bytes);
      return audioAccepted({
        codec: "mp3", sampleRate: resource.sampleRate, channels: resource.channels,
        durationSeconds: resource.durationSeconds, sampleFrames: resource.sampleFrames,
      });
    },
    getDecodedBuffer(bytes) {
      const resource = resourceForBytes(bytes);
      return audioAccepted({
        sampleRate: resource.sampleRate, numberOfChannels: resource.channels,
        length: resource.sampleFrames, duration: resource.durationSeconds,
      } as AudioBuffer);
    },
  };
  const context = new FakeAudioContext();
  const backend = new WebAudioSimulatorBackend(context as unknown as AudioContext);
  const prepared = await backend.prepare(
    `selected-skin-web-audio-${scenario}`, overlay.value.profile, overlay.value.provider, selectedPreflight,
  );
  assert.equal(prepared.status, "accepted", JSON.stringify(prepared));
  execute(backend, [
    { kind: "session.open", bgm_pool: 8, se_pool: 12, one_shot_pool: 1 },
    { kind: "hold.start-loop", cue: "SE_RHYTHM_TAP_LONG", owner_key: "skin:hold",
      volume_bits: "0x3F800000", fade_in_bits: "0x00000000" },
    { kind: "se.play-one-shot", cue: "perfect", voice_key: "skin:perfect", volume_bits: "0x3F800000",
      pitch_bits: "0x00000000", pan_distance_bits: "0x00000000", pan_angle_bits: "0x00000000" },
  ]);
  assert.equal(context.sources[context.sources.length - 2]!.loop, true);
  assert.equal(context.sources[context.sources.length - 1]!.loop, false);
  assert.equal(backend.dispose().status, "accepted");
  console.log(`WebAudio selected Skin ${scenario} passed: Tap SE replacement + fixed Directional pack + loop owner cleanup`);
}

function execute(backend: WebAudioSimulatorBackend, commands: readonly any[]): void {
  const batch = backend.preflight(commands);
  assert.equal(batch.status, "accepted", JSON.stringify(batch));
  const committed = backend.commit((batch as any).value);
  assert.equal(committed.status, "accepted", JSON.stringify(committed));
}

class FakeAudioParam {
  value = 1;
  readonly events: [string, number, number][] = [];
  cancelScheduledValues(time: number): void { this.events.push(["cancel", this.value, time]); }
  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push(["set", value, time]);
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push(["ramp", value, time]);
  }
}

class FakeGainNode {
  readonly gain = new FakeAudioParam();
  constructor(private readonly context: FakeAudioContext) {}
  connect(_destination: unknown): void {}
  disconnect(): void {
    if (this.context.throwOnDisconnect) throw new Error("disconnect fault");
  }
}

class FakeBufferSource {
  buffer: any = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  startOffset = -1;
  stopCount = 0;
  scheduledStop: number | null = null;
  constructor(private readonly context: FakeAudioContext) {}
  connect(_destination: unknown): void {}
  disconnect(): void {
    if (this.context.throwOnDisconnect) throw new Error("disconnect fault");
  }
  start(_when: number, offset: number): void {
    if (this.context.throwOnStart) throw new Error("start fault");
    this.startOffset = offset;
  }
  stop(when: number): void {
    this.stopCount += 1;
    this.scheduledStop = when;
  }
}

class FakeAudioContext {
  state: "running" | "suspended" | "closed" = "running";
  currentTime = 10;
  readonly destination = {};
  readonly gains: FakeGainNode[] = [];
  readonly sources: FakeBufferSource[] = [];
  decodeCount = 0;
  throwOnStart = false;
  throwOnDisconnect = false;
  private readonly stateListeners = new Set<() => void>();

  async decodeAudioData(buffer: ArrayBuffer): Promise<any> {
    this.decodeCount += 1;
    const resource = profileByLength.get(buffer.byteLength)!;
    return {
      sampleRate: resource.sampleRate,
      numberOfChannels: resource.channels,
      length: resource.sampleFrames,
      duration: resource.durationSeconds,
    };
  }
  createGain(): any {
    const gain = new FakeGainNode(this);
    this.gains.push(gain);
    return gain;
  }
  createBufferSource(): any {
    const source = new FakeBufferSource(this);
    this.sources.push(source);
    return source;
  }
  addEventListener(name: string, listener: () => void): void {
    if (name === "statechange") this.stateListeners.add(listener);
  }
  removeEventListener(name: string, listener: () => void): void {
    if (name === "statechange") this.stateListeners.delete(listener);
  }
  dispatchStateChange(): void {
    for (const listener of this.stateListeners) listener();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
