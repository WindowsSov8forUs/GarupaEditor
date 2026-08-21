import type {
  AudioResourcePreflightAdapter,
  AudioSessionBgmResourceProfile,
} from "../backends/audioContracts";
import { sha256UpperHex } from "../backends/resources/sha256";
import {
  rejected,
  type SimulatorAssemblyResult,
} from "./result";

export interface PreparedSessionBgmResource {
  readonly profile: AudioSessionBgmResourceProfile;
  readonly bytes: Uint8Array;
}

export interface Mp3FirstFrameProfile {
  readonly byteOffset: number;
  readonly mpegVersion: "1" | "2" | "2.5";
  readonly layer: "III";
  readonly sampleRate: number;
  readonly channels: 1 | 2;
}

export async function deriveSessionBgmResource(
  sourceBytes: Uint8Array,
  preflight: AudioResourcePreflightAdapter,
): Promise<SimulatorAssemblyResult<PreparedSessionBgmResource>> {
  if (!(sourceBytes instanceof Uint8Array) || sourceBytes.byteLength === 0 ||
    preflight === null || typeof preflight !== "object" ||
    typeof preflight.inspect !== "function") {
    return rejected(
      "evidence-required",
      "simulator.audio.invalid-bgm-byte-derivation-input",
      "Session BGM derivation requires one non-empty Uint8Array and one explicit audio inspection capability.",
    );
  }
  const bytes = Uint8Array.from(sourceBytes);
  const mp3 = inspectMp3FirstFrame(bytes);
  if (mp3.status === "rejected") return mp3;

  let decoded;
  try {
    decoded = await preflight.inspect(bytes);
  } catch {
    return rejected(
      "launch-failed",
      "simulator.audio.bgm-inspection-threw",
      "A BGM inspection exception fails launch before resource or backend ownership transfers.",
    );
  }
  if (decoded.status !== "accepted") {
    return rejected(
      mapAudioFailure(decoded.status),
      decoded.failure.capability,
      decoded.failure.boundary,
    );
  }
  const metadata = decoded.value;
  if (
    metadata === null || typeof metadata !== "object" ||
    metadata.codec !== "mp3" ||
    metadata.sampleRate !== mp3.value.sampleRate ||
    metadata.channels !== mp3.value.channels ||
    !Number.isSafeInteger(metadata.sampleFrames) || metadata.sampleFrames <= 0
  ) {
    return rejected(
      "resource-decode",
      "simulator.audio.bgm-mp3-decoded-metadata-mismatch",
      "Decoded codec, sample rate, channels and positive sample frames must agree with the validated MPEG Layer III first frame.",
    );
  }
  const durationSeconds = Number((metadata.sampleFrames / metadata.sampleRate).toFixed(6));
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
    metadata.durationSeconds !== durationSeconds) {
    return rejected(
      "resource-decode",
      "simulator.audio.bgm-decoded-duration-mismatch",
      "Session BGM duration is derived only from decoded sample frames divided by sample rate and must match inspection metadata.",
    );
  }

  const sha256 = sha256UpperHex(bytes);
  const cue = `session_bgm_${sha256}`;
  const profile: AudioSessionBgmResourceProfile = Object.freeze({
    role: "bgm",
    logicalId: `chart-bgm/${sha256}`,
    cue,
    byteLength: bytes.byteLength,
    sha256,
    mime: "audio/mpeg",
    codec: "mp3",
    sampleRate: metadata.sampleRate,
    channels: metadata.channels,
    durationSeconds,
    sampleFrames: metadata.sampleFrames,
    loop: null,
    identity: "session-explicit",
    signal: "host-supplied-portable",
  });
  return accepted(Object.freeze({ profile, bytes }));
}

export function inspectMp3FirstFrame(
  bytes: Uint8Array,
): SimulatorAssemblyResult<Mp3FirstFrameProfile> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 4) {
    return invalidMp3("A session BGM must contain at least one complete MPEG audio frame header.");
  }
  let offset = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    if (bytes.byteLength < 10) return invalidMp3("A leading ID3v2 header must be complete.");
    const major = bytes[3]!;
    const revision = bytes[4]!;
    const flags = bytes[5]!;
    if (major < 2 || major > 4 || revision === 0xff ||
      (major === 2 && (flags & 0x3f) !== 0) ||
      (major === 3 && (flags & 0x1f) !== 0) ||
      (major === 4 && (flags & 0x0f) !== 0) ||
      (bytes[6]! | bytes[7]! | bytes[8]! | bytes[9]!) >= 0x80) {
      return invalidMp3("The leading ID3v2 version, flags and synchsafe size must be structurally valid.");
    }
    const size = (bytes[6]! << 21) | (bytes[7]! << 14) |
      (bytes[8]! << 7) | bytes[9]!;
    offset = 10 + size;
    if (offset > bytes.byteLength - 4) {
      return invalidMp3("The leading ID3v2 tag must end before a complete MPEG frame header.");
    }
  }

  const first = bytes[offset]!;
  const second = bytes[offset + 1]!;
  const third = bytes[offset + 2]!;
  const fourth = bytes[offset + 3]!;
  const versionBits = (second >>> 3) & 0x03;
  const layerBits = (second >>> 1) & 0x03;
  const bitrateIndex = third >>> 4;
  const sampleRateIndex = (third >>> 2) & 0x03;
  if (first !== 0xff || (second & 0xe0) !== 0xe0 ||
    versionBits === 1 || layerBits !== 1 ||
    bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return invalidMp3("The first audio payload must begin with a valid MPEG Layer III frame header.");
  }

  const mpegVersion = versionBits === 3 ? "1" : versionBits === 2 ? "2" : "2.5";
  const sampleRates = mpegVersion === "1"
    ? [44100, 48000, 32000]
    : mpegVersion === "2"
      ? [22050, 24000, 16000]
      : [11025, 12000, 8000];
  const channelMode = fourth >>> 6;
  return accepted(Object.freeze({
    byteOffset: offset,
    mpegVersion,
    layer: "III" as const,
    sampleRate: sampleRates[sampleRateIndex]!,
    channels: channelMode === 3 ? 1 as const : 2 as const,
  }));
}

function invalidMp3(boundary: string): SimulatorAssemblyResult<never> {
  return rejected(
    "resource-decode",
    "simulator.audio.invalid-mp3-byte-structure",
    boundary,
  );
}

function mapAudioFailure(
  status: "evidence-required" | "audio-resource-unavailable" |
    "audio-resource-integrity" | "audio-resource-decode" |
    "audio-context-unavailable" | "audio-backend-fault" | "terminal-disposed",
): "evidence-required" | "resource-unavailable" | "resource-integrity" |
  "resource-decode" | "platform-unavailable" | "launch-failed" {
  if (status === "audio-resource-unavailable") return "resource-unavailable";
  if (status === "audio-resource-integrity") return "resource-integrity";
  if (status === "audio-resource-decode") return "resource-decode";
  if (status === "audio-context-unavailable") return "platform-unavailable";
  return status === "evidence-required" ? "evidence-required" : "launch-failed";
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
