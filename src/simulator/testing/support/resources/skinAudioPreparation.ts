import type {
  AudioFixedSeResourceProfile,
  AudioResourcePreflightAdapter,
  AudioResourceProfile,
  AudioResourceProfileSet,
  AudioResourceProvider,
} from "../../../backends/audioContracts";
import { audioAccepted } from "../../../backends/audioValidation";
import type { PreparedSkinPortablePack } from "./skinPortablePack";
import { rejected, type SimulatorAssemblyResult } from "../../../assembly/result";

export interface PreparedSkinAudioOverlay {
  readonly profile: AudioResourceProfileSet;
  readonly provider: AudioResourceProvider;
}

export async function prepareSkinAudioOverlay(
  baseProfile: AudioResourceProfileSet,
  baseProvider: AudioResourceProvider,
  packs: readonly PreparedSkinPortablePack[],
  tapSeLogicalResource: string,
  directionalSeLogicalResource: string,
  preflight: AudioResourcePreflightAdapter,
): Promise<SimulatorAssemblyResult<PreparedSkinAudioOverlay>> {
  if (packs.length === 0) return accepted(Object.freeze({ profile: baseProfile, provider: baseProvider }));
  const selectedPacks = packs.filter((pack) =>
    pack.logicalResource === tapSeLogicalResource || pack.logicalResource === directionalSeLogicalResource);
  if (selectedPacks.length !== 2) {
    return invalid("simulator.skin.audio-pack-inventory", "Selected Skin audio requires one exact Tap SE pack and the fixed Directional SE pack.");
  }
  const dynamic: AudioFixedSeResourceProfile[] = [];
  const bytesByKey = new Map<string, Uint8Array>();
  for (const pack of selectedPacks) {
    const portableAudio = pack.profile.portableAudio;
    if (!Array.isArray(portableAudio)) return invalid("simulator.skin.audio-profile-shape", "Selected Skin portableAudio must be one explicit array.");
    for (const item of portableAudio) {
      if (!record(item) || typeof item.cue !== "string" || typeof item.loop !== "boolean") {
        return invalid("simulator.skin.audio-cue-shape", "Every selected Skin cue requires one exact cue identity and explicit loop state.");
      }
      const file = pack.files.find((candidate) =>
        candidate.mime === "audio/mpeg" && candidate.id === `cue:${item.cue}`);
      if (file === undefined) {
        return invalid("simulator.skin.audio-cue-file", "Every selected Skin cue must bind its exact source-package MP3 file.");
      }
      const container = record(item.container) ? item.container : null;
      const inspected = container === null ? await preflight.inspect(file.bytes) : null;
      if (inspected !== null && inspected.status !== "accepted") {
        return invalid(inspected.failure.capability, inspected.failure.boundary);
      }
      const sampleRate = container === null
        ? inspected!.value.sampleRate
        : integer(container.sample_rate);
      const channels = container === null
        ? inspected!.value.channels
        : integer(container.channels);
      const durationSeconds = container === null
        ? inspected!.value.durationSeconds
        : finiteNumber(container.duration ?? container.format_duration);
      const sampleFrames = container === null
        ? inspected!.value.sampleFrames
        : Math.round(durationSeconds * sampleRate);
      if (![8000, 44100, 48000].includes(sampleRate) || (channels !== 1 && channels !== 2) ||
        durationSeconds <= 0 || sampleFrames <= 0) {
        return invalid("simulator.skin.audio-container", "Selected Skin MP3 metadata must map to supported exact sample rate/channels and positive frames.");
      }
      const profile: AudioFixedSeResourceProfile = Object.freeze({
        role: "se" as const,
        logicalId: pack.logicalResource as `sound/tapseskin/${string}`,
        cue: item.cue,
        byteLength: file.bytes.byteLength,
        sha256: file.sha256,
        mime: "audio/mpeg" as const,
        codec: "mp3" as const,
        sampleRate: sampleRate as 8000 | 44100 | 48000,
        channels: channels as 1 | 2,
        durationSeconds,
        sampleFrames,
        loop: item.loop ? Object.freeze({ start: 0, end: sampleFrames }) : null,
        identity: "semantic-exact" as const,
        signal: "portable-equivalent-lossy" as const,
      });
      dynamic.push(profile);
      bytesByKey.set(key(profile), file.bytes);
    }
  }
  const replacement = new Map(dynamic.map((resource) => [resource.cue, resource]));
  const resources: AudioResourceProfile[] = baseProfile.resources.map((resource) =>
    resource.role === "se" && replacement.has(resource.cue)
      ? replacement.get(resource.cue)!
      : resource);
  if (replacement.size !== 9 || resources.length !== baseProfile.resources.length) {
    return invalid("simulator.skin.audio-cue-inventory", "Selected Tap and fixed Directional packs must replace exactly nine existing semantic cues.");
  }
  const profile: AudioResourceProfileSet = Object.freeze({
    ...baseProfile,
    resources: Object.freeze(resources),
  });
  const provider: AudioResourceProvider = Object.freeze({
    read(resource: AudioResourceProfile) {
      const bytes = bytesByKey.get(key(resource));
      return bytes === undefined ? baseProvider.read(resource) : Promise.resolve(audioAccepted(Uint8Array.from(bytes)));
    },
  });
  return accepted(Object.freeze({ profile, provider }));
}

function key(resource: Pick<AudioResourceProfile, "logicalId" | "cue">): string {
  return `${resource.logicalId}\u0000${resource.cue}`;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : -1;
}
function finiteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
function invalid<T>(capability: string, boundary: string): SimulatorAssemblyResult<T> {
  return rejected("resource-integrity", capability, boundary);
}
function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
