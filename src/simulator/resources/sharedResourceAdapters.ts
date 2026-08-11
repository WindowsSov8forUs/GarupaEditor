import type {
  AudioResourceProfileSet,
  AudioSessionBgmResourceProfile,
} from "../backends/audioContracts";
import { createAudioSessionResourceProfile } from "../backends/resources/currentAudioResourceManifest";
import {
  ImmutableLocalAudioResourceProvider,
  type LocalAudioResource,
} from "../backends/resources/localAudioResourceProvider";
import {
  ImmutableLocalParticleResourceProvider,
  type LocalParticleResource,
} from "../backends/resources/localParticleResourceProvider";
import type { HabahiroBestdoriTransport } from "../backends/resources/habahiroBestdoriProvider";
import type { SimulatorChartAudioData, SimulatorModuleFailure } from "../public/contracts";
import type { ParticleResourceProvider } from "../backends/particleContracts";
import type { AudioResourceProvider } from "../backends/audioContracts";
import { evidenceRequired, ok } from "../engine/evidence";
import type {
  SelectedAudioSeResource,
  SelectedHabahiroResource,
  SelectedParticleResource,
} from "./staticResourceSelector";
import type { SharedStaticResourceStore } from "./sharedStaticResourceStore";

export type SimulatorAssemblyResult<T> =
  | { readonly status: "accepted"; readonly value: T }
  | { readonly status: "rejected"; readonly failure: SimulatorModuleFailure };

export interface PreparedSharedAudioResources {
  readonly profile: AudioResourceProfileSet;
  readonly provider: AudioResourceProvider;
}

export async function prepareSharedAudioResources(
  bgm: SimulatorChartAudioData,
  selectedSe: readonly SelectedAudioSeResource[],
  store: SharedStaticResourceStore,
): Promise<SimulatorAssemblyResult<PreparedSharedAudioResources>> {
  const bgmValidation = validateChartAudio(bgm);
  if (bgmValidation.status === "rejected") return bgmValidation;
  const local: LocalAudioResource[] = [{
    logicalId: bgmValidation.value.logicalId,
    cue: bgm.cue,
    bytes: Uint8Array.from(bgm.bytes),
  }];
  for (const selected of selectedSe) {
    const read = await readStatic(store, selected.resourceKey);
    if (read.status === "rejected") return read;
    local.push({
      logicalId: selected.profile.logicalId,
      cue: selected.profile.cue,
      bytes: read.value,
    });
  }
  const provider = ImmutableLocalAudioResourceProvider.create(local);
  if (provider.status !== "accepted") {
    return rejected(
      "launch-failed",
      provider.failure.capability,
      provider.failure.boundary,
    );
  }
  const profile = createAudioSessionResourceProfile(bgmValidation.value);
  return accepted(Object.freeze({ profile, provider: provider.value }));
}

export async function prepareSharedParticleProvider(
  selected: readonly SelectedParticleResource[],
  store: SharedStaticResourceStore,
): Promise<SimulatorAssemblyResult<ParticleResourceProvider>> {
  const local: LocalParticleResource[] = [];
  for (const resource of selected) {
    const read = await readStatic(store, resource.resourceKey);
    if (read.status === "rejected") return read;
    local.push({ logicalAssetId: resource.profile.logicalAssetId, bytes: read.value });
  }
  const provider = ImmutableLocalParticleResourceProvider.create(local);
  return provider.status === "accepted"
    ? accepted(provider.value)
    : rejected(
        mapParticleFailureCode(provider.failure.code),
        provider.failure.capability,
        provider.failure.boundary,
      );
}

export function createSharedHabahiroTransport(
  selected: readonly SelectedHabahiroResource[],
  store: SharedStaticResourceStore,
): HabahiroBestdoriTransport {
  const byUrl = new Map(selected.map((resource) => [resource.profile.url, resource.resourceKey]));
  return Object.freeze({
    async read(url: string) {
      const resourceKey = byUrl.get(url);
      if (resourceKey === undefined) {
        return evidenceRequired(
          "render.habahiro.shared-store-url-not-selected",
          ["HAB-A01", "HAB-A02"],
          "The autonomous HAB transport accepts only URLs mapped by the internal pinned selection.",
        );
      }
      let read;
      try {
        read = await store.read(resourceKey);
      } catch {
        return evidenceRequired(
          "render.habahiro.shared-store-threw",
          ["HAB-A01", "HAB-A02"],
          "A shared static store exception fails the explicit HAB read without network fallback.",
        );
      }
      return read.status === "accepted"
        ? ok(Uint8Array.from(read.value))
        : evidenceRequired(
            `render.habahiro.${read.failure.capability}`,
            ["HAB-A01", "HAB-A02"],
            read.failure.boundary,
          );
    },
  });
}

function validateChartAudio(
  bgm: SimulatorChartAudioData,
): SimulatorAssemblyResult<AudioSessionBgmResourceProfile> {
  if (
    bgm === null || typeof bgm !== "object" || Array.isArray(bgm) ||
    Object.keys(bgm).sort().join(",") !==
      "bytes,channels,codec,cue,currentSampleFrames,durationSeconds,sampleRate,sha256" ||
    typeof bgm.cue !== "string" || bgm.cue.length === 0 ||
    !(bgm.bytes instanceof Uint8Array) || bgm.bytes.byteLength === 0 ||
    !/^[0-9A-F]{64}$/.test(bgm.sha256) || bgm.codec !== "mp3" ||
    !Number.isSafeInteger(bgm.sampleRate) || bgm.sampleRate <= 0 ||
    (bgm.channels !== 1 && bgm.channels !== 2) ||
    !Number.isFinite(bgm.durationSeconds) || bgm.durationSeconds <= 0 ||
    !Number.isSafeInteger(bgm.currentSampleFrames) || bgm.currentSampleFrames <= 0
  ) {
    return rejected(
      "evidence-required",
      "simulator.launch.invalid-chart-audio",
      "Chart audio requires explicit cue, non-empty MP3 bytes, uppercase SHA-256 and positive exact metadata; no BMS/default derivation is available.",
    );
  }
  return accepted(Object.freeze({
    role: "bgm" as const,
    logicalId: `chart-bgm/${bgm.sha256}`,
    cue: bgm.cue,
    byteLength: bgm.bytes.byteLength,
    sha256: bgm.sha256,
    mime: "audio/mpeg" as const,
    codec: "mp3" as const,
    sampleRate: bgm.sampleRate,
    channels: bgm.channels,
    durationSeconds: bgm.durationSeconds,
    currentSampleFrames: bgm.currentSampleFrames,
    loop: null,
    identity: "session-explicit" as const,
    signal: "host-supplied-portable" as const,
  }));
}

async function readStatic(
  store: SharedStaticResourceStore,
  resourceKey: string,
): Promise<SimulatorAssemblyResult<Uint8Array>> {
  try {
    const read = await store.read(resourceKey);
    return read.status === "accepted"
      ? accepted(Uint8Array.from(read.value))
      : rejected(
          read.failure.code === "resource-unavailable"
            ? "resource-unavailable"
            : "launch-failed",
          read.failure.capability,
          read.failure.boundary,
        );
  } catch {
    return rejected(
      "launch-failed",
      "simulator.resources.shared-store-threw",
      "A shared static resource store exception fails launch before backend preparation and is never retried through another source.",
    );
  }
}

function mapParticleFailureCode(
  code: "evidence-required" | "particle-resource-unavailable" | "particle-resource-integrity" |
    "particle-resource-decode" | "particle-backend-fault" | "terminal-disposed",
): SimulatorModuleFailure["code"] {
  if (code === "particle-resource-unavailable") return "resource-unavailable";
  if (code === "particle-resource-integrity") return "resource-integrity";
  if (code === "particle-resource-decode") return "resource-decode";
  return code === "evidence-required" ? "evidence-required" : "launch-failed";
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}

export function rejected<T>(
  code: SimulatorModuleFailure["code"],
  capability: string,
  boundary: string,
): SimulatorAssemblyResult<T> {
  return Object.freeze({
    status: "rejected" as const,
    failure: Object.freeze({ code, capability, boundary }),
  });
}
