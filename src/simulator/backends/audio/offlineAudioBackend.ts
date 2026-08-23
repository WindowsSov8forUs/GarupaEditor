import type { AudioOperationResult } from "../audioContracts";
import {
  audioAccepted,
  audioFloat32FromBits,
  audioRejected,
} from "../audioValidation";
import type {
  OfflineAudioBackend,
  OfflineAudioMixRequest,
  OfflineAudioMixResult,
  OfflineAudioPcmSource,
  OfflineAudioVoicePlan,
} from "./offlineAudioContracts";

export class DeterministicOfflineAudioBackend implements OfflineAudioBackend {
  readonly id = "deterministic-offline-audio";

  render(request: OfflineAudioMixRequest): AudioOperationResult<OfflineAudioMixResult> {
    const validated = validateRequest(request);
    if (validated.status !== "accepted") return validated;
    const { sampleRate, outputFrames, sources, voices } = validated.value;
    const output = new Uint8Array(outputFrames * 2 * Float32Array.BYTES_PER_ELEMENT);
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

    for (let frame = 0; frame < outputFrames; frame += 1) {
      let left = Math.fround(0);
      let right = Math.fround(0);
      for (const voice of voices) {
        if (frame < voice.startFrame) continue;
        const source = sources.get(voice.sourceId)!;
        const localFrame = frame - voice.startFrame;
        const sourceFrame = resolveSourceFrame(localFrame, source.frameCount, voice);
        if (sourceFrame === null) continue;
        let gain = audioFloat32FromBits(voice.gainBits)!;
        if (voice.fade !== null && frame >= voice.fade.startFrame) {
          const duration = audioFloat32FromBits(voice.fade.durationBits)!;
          const fadeFrames = Math.max(1, Math.ceil(Math.fround(duration) * sampleRate));
          const fadeFrame = frame - voice.fade.startFrame;
          if (fadeFrame > fadeFrames) continue;
          const progress = Math.fround(fadeFrame / fadeFrames);
          const factor = Math.fround(1 - progress);
          gain = Math.fround(gain * factor);
        }
        const sourceOffset = sourceFrame * source.channels;
        const sourceLeft = source.samples[sourceOffset]!;
        const sourceRight = source.channels === 1
          ? sourceLeft
          : source.samples[sourceOffset + 1]!;
        left = Math.fround(left + Math.fround(sourceLeft * gain));
        right = Math.fround(right + Math.fround(sourceRight * gain));
      }
      left = Math.fround(Math.min(1, Math.max(-1, left)));
      right = Math.fround(Math.min(1, Math.max(-1, right)));
      const offset = frame * 8;
      view.setFloat32(offset, left, true);
      view.setFloat32(offset + 4, right, true);
    }

    return audioAccepted(Object.freeze({
      sampleFormat: "f32le-stereo-interleaved",
      sampleRate,
      channelCount: 2,
      frameCount: outputFrames,
      bytes: Uint8Array.from(output),
    }));
  }
}

interface ValidatedOfflineMix {
  readonly sampleRate: number;
  readonly outputFrames: number;
  readonly sources: ReadonlyMap<string, OfflineAudioPcmSource>;
  readonly voices: readonly OfflineAudioVoicePlan[];
}

function validateRequest(
  request: OfflineAudioMixRequest,
): AudioOperationResult<ValidatedOfflineMix> {
  if (
    !isRecord(request) ||
    !hasExactKeys(request, ["sampleRate", "outputFrames", "sources", "voices"]) ||
    !Number.isSafeInteger(request.sampleRate) || request.sampleRate <= 0 ||
    !Number.isSafeInteger(request.outputFrames) || request.outputFrames <= 0 ||
    !Array.isArray(request.sources) || request.sources.length === 0 ||
    !Array.isArray(request.voices) || request.voices.length === 0
  ) {
    return reject(
      "audio.offline.invalid-request",
      "Offline rendering requires explicit positive sample rate/frame count and non-empty source/voice lists; empty PCM is not success.",
    );
  }

  const sources = new Map<string, OfflineAudioPcmSource>();
  for (const source of request.sources) {
    if (
      !isRecord(source) ||
      !hasExactKeys(source, ["sourceId", "sampleRate", "channels", "frameCount", "samples"]) ||
      typeof source.sourceId !== "string" || source.sourceId.length === 0 ||
      sources.has(source.sourceId) ||
      source.sampleRate !== request.sampleRate ||
      (source.channels !== 1 && source.channels !== 2) ||
      !Number.isSafeInteger(source.frameCount) || source.frameCount <= 0 ||
      !(source.samples instanceof Float32Array) ||
      source.samples.length !== source.frameCount * source.channels ||
      [...source.samples].some((sample) => !Number.isFinite(sample))
    ) {
      return reject(
        "audio.offline.invalid-source",
        "PCM sources require one identity, matching sample rate, one or two channels, exact frame count and finite binary32 samples; resampling is unsupported.",
      );
    }
    sources.set(source.sourceId, Object.freeze({
      sourceId: source.sourceId,
      sampleRate: source.sampleRate,
      channels: source.channels,
      frameCount: source.frameCount,
      samples: Float32Array.from(source.samples),
    }));
  }

  const voices: OfflineAudioVoicePlan[] = [];
  for (const voice of request.voices) {
    const source = isRecord(voice) && typeof voice.sourceId === "string"
      ? sources.get(voice.sourceId)
      : undefined;
    const gain = isRecord(voice) && typeof voice.gainBits === "string"
      ? audioFloat32FromBits(voice.gainBits)
      : null;
    if (
      !isRecord(voice) ||
      !hasExactKeys(voice, ["sourceId", "startFrame", "gainBits", "loop", "fade"]) ||
      source === undefined ||
      !Number.isSafeInteger(voice.startFrame) || voice.startFrame < 0 ||
      gain === null || gain < 0 || gain > 1
    ) {
      return reject(
        "audio.offline.invalid-voice",
        "Voices require an existing source, non-negative start frame and finite binary32 gain in [0,1].",
      );
    }
    if (voice.loop !== null && (
      !isRecord(voice.loop) || !hasExactKeys(voice.loop, ["startFrame", "endFrame"]) ||
      !Number.isSafeInteger(voice.loop.startFrame) ||
      !Number.isSafeInteger(voice.loop.endFrame) ||
      voice.loop.startFrame < 0 || voice.loop.endFrame <= voice.loop.startFrame ||
      voice.loop.endFrame > source.frameCount
    )) {
      return reject(
        "audio.offline.invalid-loop",
        "Loop intervals are explicit non-empty half-open source-frame ranges.",
      );
    }
    if (voice.fade !== null && (
      !isRecord(voice.fade) ||
      !hasExactKeys(voice.fade, ["startFrame", "durationBits", "targetBits", "stopAtZero"]) ||
      !Number.isSafeInteger(voice.fade.startFrame) || voice.fade.startFrame < voice.startFrame ||
      typeof voice.fade.durationBits !== "string" ||
      audioFloat32FromBits(voice.fade.durationBits) === null ||
      audioFloat32FromBits(voice.fade.durationBits)! <= 0 ||
      voice.fade.targetBits !== "0x00000000" || voice.fade.stopAtZero !== true
    )) {
      return reject(
        "audio.offline.invalid-fade",
        "The portable fade uses a non-negative absolute start, positive binary32 duration, zero target and stop-at-zero.",
      );
    }
    voices.push(Object.freeze({
      sourceId: voice.sourceId,
      startFrame: voice.startFrame,
      gainBits: voice.gainBits,
      loop: voice.loop === null ? null : Object.freeze({ ...voice.loop }),
      fade: voice.fade === null ? null : Object.freeze({ ...voice.fade }),
    }));
  }

  return audioAccepted(Object.freeze({
    sampleRate: request.sampleRate,
    outputFrames: request.outputFrames,
    sources,
    voices: Object.freeze(voices),
  }));
}

function resolveSourceFrame(
  localFrame: number,
  sourceFrames: number,
  voice: OfflineAudioVoicePlan,
): number | null {
  if (voice.loop === null) return localFrame < sourceFrames ? localFrame : null;
  if (localFrame < voice.loop.endFrame) return localFrame;
  return voice.loop.startFrame +
    ((localFrame - voice.loop.endFrame) % (voice.loop.endFrame - voice.loop.startFrame));
}

function reject(capability: string, boundary: string): AudioOperationResult<never> {
  return audioRejected("integrity-failure", capability, boundary);
}

function isRecord(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return actual.length === required.length && actual.every((key, index) => key === required[index]);
}
