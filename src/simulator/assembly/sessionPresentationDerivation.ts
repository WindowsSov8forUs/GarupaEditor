import type { AudioResourcePreflightAdapter } from "../backends/audioContracts";
import { sha256UpperHex } from "../backends/resources/sha256";
import type { SimulatorPresentationPackage } from "../public/contracts";
import {
  rejected,
  type SimulatorAssemblyResult,
} from "../resources/sharedResourceAdapters";
import { inspectMp3FirstFrame } from "./sessionBgmDerivation";
import {
  inspectStrictRgbaPng,
  STARTUP_JACKET_SIZE,
  STARTUP_STAGE_SIZE,
} from "./startupPresentationContract";

export interface PreparedPresentationImage {
  readonly role: "jacket" | "stage-backdrop" | "sd-character-overlay";
  readonly slot: number | null;
  readonly logicalId: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly mime: "image/png";
  readonly bytes: Uint8Array;
}

export interface PreparedLiveStartVoice {
  readonly role: "voice";
  readonly semanticRole: "live-start-voice";
  readonly logicalId: string;
  readonly cue: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly mime: "audio/mpeg";
  readonly codec: "mp3";
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly sampleFrames: number;
  readonly durationSeconds: number;
  readonly loop: null;
  readonly identity: "session-explicit";
  readonly signal: "host-supplied-portable";
  readonly bytes: Uint8Array;
}

export interface PreparedSessionPresentation {
  readonly song: SimulatorPresentationPackage["song"];
  readonly difficulty: SimulatorPresentationPackage["difficulty"];
  readonly jacket: PreparedPresentationImage;
  readonly stageBackdrop: PreparedPresentationImage;
  readonly sdCharacters: readonly PreparedPresentationImage[];
  readonly liveStartVoice: PreparedLiveStartVoice | null;
}

export async function deriveSessionPresentation(
  presentation: SimulatorPresentationPackage,
  audioPreflight: AudioResourcePreflightAdapter,
  deriveLiveVoice = true,
): Promise<SimulatorAssemblyResult<PreparedSessionPresentation>> {
  const jacket = deriveImage("jacket", null, presentation.jacketPng, STARTUP_JACKET_SIZE.width, STARTUP_JACKET_SIZE.height);
  if (jacket.status === "rejected") return jacket;
  const backdrop = deriveImage("stage-backdrop", null, presentation.stage.backdropPng, STARTUP_STAGE_SIZE.width, STARTUP_STAGE_SIZE.height);
  if (backdrop.status === "rejected") return backdrop;
  const slots: PreparedPresentationImage[] = [];
  for (let index = 0; index < presentation.stage.sdCharacterAtlases.length; index += 1) {
    const derived = deriveImage("sd-character-overlay", index, presentation.stage.sdCharacterAtlases[index]!, STARTUP_STAGE_SIZE.width, STARTUP_STAGE_SIZE.height);
    if (derived.status === "rejected") return derived;
    slots.push(derived.value);
  }
  const voice = presentation.liveStartVoiceMp3 === null || !deriveLiveVoice
    ? accepted<PreparedLiveStartVoice | null>(null)
    : await deriveVoice(presentation.liveStartVoiceMp3, audioPreflight);
  if (voice.status === "rejected") return voice;
  return accepted(Object.freeze({
    song: presentation.song,
    difficulty: presentation.difficulty,
    jacket: jacket.value,
    stageBackdrop: backdrop.value,
    sdCharacters: Object.freeze(slots),
    liveStartVoice: voice.value,
  }));
}

function deriveImage(
  role: PreparedPresentationImage["role"],
  slot: number | null,
  source: Uint8Array,
  width: number,
  height: number,
): SimulatorAssemblyResult<PreparedPresentationImage> {
  const structure = inspectStrictRgbaPng(source, width, height);
  if (structure.status === "rejected") return structure;
  const bytes = Uint8Array.from(source);
  const sha256 = sha256UpperHex(bytes);
  const suffix = slot === null ? role : `${role}/${slot}`;
  return accepted(Object.freeze({
    role,
    slot,
    logicalId: `startup/session/${suffix}/${sha256}`,
    sha256,
    byteLength: bytes.byteLength,
    width,
    height,
    mime: "image/png" as const,
    bytes,
  }));
}

async function deriveVoice(
  source: Uint8Array,
  preflight: AudioResourcePreflightAdapter,
): Promise<SimulatorAssemblyResult<PreparedLiveStartVoice>> {
  const bytes = Uint8Array.from(source);
  const frame = inspectMp3FirstFrame(bytes);
  if (frame.status === "rejected") {
    return rejected(frame.failure.code, "simulator.presentation.invalid-live-start-voice-mp3", frame.failure.boundary);
  }
  let decoded;
  try {
    decoded = await preflight.inspect(bytes);
  } catch {
    return rejected("launch-failed", "simulator.presentation.live-start-voice-inspection-threw", "Voice decode inspection threw before any engine or backend ownership transfer.");
  }
  if (decoded.status !== "accepted") {
    return rejected(mapAudioFailure(decoded.status), decoded.failure.capability, decoded.failure.boundary);
  }
  const metadata = decoded.value;
  const durationSeconds = Number((metadata.sampleFrames / metadata.sampleRate).toFixed(6));
  if (metadata.codec !== "mp3" || metadata.sampleRate !== frame.value.sampleRate ||
    metadata.channels !== frame.value.channels || !Number.isSafeInteger(metadata.sampleFrames) ||
    metadata.sampleFrames <= 0 || metadata.durationSeconds !== durationSeconds ||
    !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return rejected("resource-decode", "simulator.presentation.live-start-voice-metadata-mismatch", "Voice decoded metadata must agree with the validated MPEG Layer III header and exact sample-frame duration.");
  }
  const sha256 = sha256UpperHex(bytes);
  return accepted(Object.freeze({
    role: "voice" as const,
    semanticRole: "live-start-voice" as const,
    logicalId: `startup/session/live-start-voice/${sha256}`,
    cue: `session_live_start_voice_${sha256}`,
    sha256,
    byteLength: bytes.byteLength,
    mime: "audio/mpeg" as const,
    codec: "mp3" as const,
    sampleRate: metadata.sampleRate,
    channels: metadata.channels as 1 | 2,
    sampleFrames: metadata.sampleFrames,
    durationSeconds,
    loop: null,
    identity: "session-explicit" as const,
    signal: "host-supplied-portable" as const,
    bytes,
  }));
}

function mapAudioFailure(status: string): "evidence-required" | "resource-unavailable" | "resource-integrity" | "resource-decode" | "platform-unavailable" | "launch-failed" {
  if (status === "audio-resource-unavailable") return "resource-unavailable";
  if (status === "audio-resource-integrity") return "resource-integrity";
  if (status === "audio-resource-decode") return "resource-decode";
  if (status === "audio-context-unavailable") return "platform-unavailable";
  return status === "evidence-required" ? "evidence-required" : "launch-failed";
}
function accepted<T>(value: T): SimulatorAssemblyResult<T> { return Object.freeze({ status: "accepted" as const, value }); }
