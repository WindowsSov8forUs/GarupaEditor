declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");

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
  async inspect(_bytes, resource) {
    return audioAccepted<AudioDecodedResourceMetadata>({
      codec: "mp3",
      sampleRate: resource.sampleRate,
      channels: resource.channels,
      durationSeconds: resource.durationSeconds,
    });
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
  assert.equal(context.decodeCount, 14);
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

  console.log("audio Web Audio tests passed: prepare/decode graph transport context-loss sync-fault dispose");
}

function execute(backend: WebAudioSimulatorBackend, commands: readonly any[]): void {
  const batch = backend.preflight(commands);
  assert.equal(batch.status, "accepted");
  assert.equal(backend.commit((batch as any).value).status, "accepted");
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
  connect(_destination: unknown): void {}
  disconnect(): void {}
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
  disconnect(): void {}
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
  private readonly stateListeners = new Set<() => void>();

  async decodeAudioData(buffer: ArrayBuffer): Promise<any> {
    this.decodeCount += 1;
    const resource = profileByLength.get(buffer.byteLength)!;
    return {
      sampleRate: resource.sampleRate,
      numberOfChannels: resource.channels,
      duration: resource.durationSeconds,
    };
  }
  createGain(): any {
    const gain = new FakeGainNode();
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
