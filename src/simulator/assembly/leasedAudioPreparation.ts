import type {
  AudioFixedSeResourceProfile,
  AudioResourcePreflightAdapter,
  AudioResourceProfile,
  AudioResourceProfileSet,
  AudioResourceProvider,
} from "../backends/audioContracts";
import { audioAccepted } from "../backends/audioValidation";
import type { PreparedSkinSourcePackage } from "../resources/sourcePackageContracts";
import { rejected, type SimulatorAssemblyResult } from "./result";
import type { PreparedSessionBgmResource } from "./sessionBgmDerivation";

const EXPECTED_CUES = new Set([
  "directional_fl", "directional_fl_2", "directional_fl_3",
  "SE_RHYTHM_CLEAR", "SE_RHYTHM_FULLCOMBO", "SE_RHYTHM_GAYA", "SE_RHYTHM_TAP_SKILL", "bad", "miss",
  "SE_RHYTHM_TAP_LONG", "flick", "game_button", "good", "great", "perfect",
]);

export interface PreparedLeasedAudioResources {
  readonly profile: AudioResourceProfileSet;
  readonly provider: AudioResourceProvider;
}

export async function prepareLeasedAudioResources(
  chartAudio: PreparedSessionBgmResource,
  packs: readonly PreparedSkinSourcePackage[],
  preflight: AudioResourcePreflightAdapter,
): Promise<SimulatorAssemblyResult<PreparedLeasedAudioResources>> {
  const dynamic: AudioFixedSeResourceProfile[] = [];
  const bytesByKey = new Map<string, Uint8Array>();
  const cues = new Set<string>();
  for (const pack of packs) {
    const portableAudio = pack.profile.portableAudio;
    if (!Array.isArray(portableAudio)) continue;
    for (const value of portableAudio) {
      if (!record(value) || typeof value.cue !== "string" || typeof value.loop !== "boolean") {
        return invalid("simulator.audio.leased-cue-identity");
      }
      if (!EXPECTED_CUES.has(value.cue)) continue;
      if (cues.has(value.cue)) return invalid("simulator.audio.leased-cue-identity");
      const file = pack.files.find((candidate) => candidate.mime === "audio/mpeg" && candidate.id === `cue:${value.cue}`);
      if (file === undefined) return invalid("simulator.audio.leased-cue-file");
      const inspected = await preflight.inspect(file.bytes);
      if (inspected.status !== "accepted") {
        return rejected("resource-decode", inspected.failure.capability, inspected.failure.boundary);
      }
      const metadata = inspected.value;
      if (metadata.codec !== "mp3" || ![8000, 44100, 48000].includes(metadata.sampleRate) ||
        (metadata.channels !== 1 && metadata.channels !== 2) || metadata.sampleFrames <= 0 || metadata.durationSeconds <= 0) {
        return invalid("simulator.audio.leased-cue-metadata");
      }
      const loop = value.cue === "SE_RHYTHM_TAP_LONG"
        ? Object.freeze({ start: 0, end: metadata.sampleFrames })
        : value.cue === "SE_RHYTHM_GAYA"
          ? Object.freeze({ start: 0, end: metadata.sampleFrames })
          : null;
      if ((value.cue === "SE_RHYTHM_TAP_LONG" || value.cue === "SE_RHYTHM_GAYA") && loop === null) {
        return invalid("simulator.audio.leased-loop-range");
      }
      const profile: AudioFixedSeResourceProfile = Object.freeze({
        role: "se" as const,
        logicalId: pack.logicalResource as AudioFixedSeResourceProfile["logicalId"],
        cue: value.cue,
        byteLength: file.bytes.byteLength,
        sha256: file.sha256,
        mime: "audio/mpeg" as const,
        codec: "mp3" as const,
        sampleRate: metadata.sampleRate as 8000 | 44100 | 48000,
        channels: metadata.channels,
        durationSeconds: metadata.durationSeconds,
        sampleFrames: metadata.sampleFrames,
        loop,
        identity: "semantic-exact" as const,
        signal: value.cue === "bad" || value.cue === "miss"
          ? "semantic-exact-silence" as const
          : "portable-equivalent-lossy" as const,
      });
      dynamic.push(profile);
      cues.add(value.cue);
      bytesByKey.set(key(profile), file.bytes);
    }
  }
  if (cues.size !== EXPECTED_CUES.size || [...EXPECTED_CUES].some((cue) => !cues.has(cue))) {
    return invalid("simulator.audio.leased-cue-inventory");
  }
  const resources: readonly AudioResourceProfile[] = Object.freeze([
    chartAudio.profile,
    ...dynamic.sort((left, right) => left.cue.localeCompare(right.cue)),
  ]);
  const profile: AudioResourceProfileSet = Object.freeze({
    schemaVersion: 1,
    profileId: "session-external-portable-v1",
    sample: Object.freeze({
      package: "jp.co.craftegg.band",
      versionName: "10.1.4",
      versionCode: 230,
      abi: "arm64-v8a",
      libil2cppSha256: "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F",
      globalMetadataSha256: "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F",
    }),
    sourceClass: "external-reference-only-no-redistribution",
    fidelity: "semantic-exact-portable-equivalent-lossy",
    networkAllowed: false,
    automaticFallbackAllowed: false,
    pools: Object.freeze({ bgm: 8, se: 12, oneShot: 1, exhaustion: "evidence-required" }),
    resources,
  });
  const provider: AudioResourceProvider = Object.freeze({
    read(resource: AudioResourceProfile) {
      if (resource.role === "bgm") return Promise.resolve(audioAccepted(Uint8Array.from(chartAudio.bytes)));
      const bytes = bytesByKey.get(key(resource));
      return bytes === undefined
        ? Promise.resolve({
            status: "audio-resource-unavailable" as const,
            failure: Object.freeze({
              code: "audio-resource-unavailable" as const,
              capability: "simulator.audio.leased-cue-unavailable",
              boundary: "The exact leased cue is unavailable; no fixed package or silence fallback is consulted.",
            }),
          })
        : Promise.resolve(audioAccepted(Uint8Array.from(bytes)));
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
function invalid<T>(capability: string): SimulatorAssemblyResult<T> {
  return rejected("resource-integrity", capability, "Leased common and selected Skin audio must publish exactly 15 evidenced cues with decoded metadata and explicit loop ownership; no fixed hash allowlist, alias or silent replacement is allowed.");
}
function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
