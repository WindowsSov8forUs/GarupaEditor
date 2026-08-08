import type {
  AudioOperationResult,
  AudioResourceProfile,
  AudioResourceProvider,
} from "../audioContracts";
import { audioAccepted, audioRejected } from "../audioValidation";
import { CURRENT_AUDIO_RESOURCE_PROFILE } from "./currentAudioResourceManifest";

export interface LocalAudioResource {
  readonly logicalId: AudioResourceProfile["logicalId"];
  readonly cue: string;
  readonly bytes: Uint8Array;
}

export class ImmutableLocalAudioResourceProvider implements AudioResourceProvider {
  private constructor(private readonly bytesByKey: ReadonlyMap<string, Uint8Array>) {}

  static create(
    resources: readonly LocalAudioResource[],
  ): AudioOperationResult<ImmutableLocalAudioResourceProvider> {
    if (!Array.isArray(resources)) {
      return reject(
        "audio.provider.invalid-input",
        "Local audio resources must be an explicit array; URL aliases and implicit acquisition are forbidden.",
      );
    }
    const bytesByKey = new Map<string, Uint8Array>();
    for (const resource of resources) {
      if (
        resource === null || typeof resource !== "object" || Array.isArray(resource) ||
        Object.keys(resource).sort().join(",") !== "bytes,cue,logicalId" ||
        !(resource.bytes instanceof Uint8Array)
      ) {
        return reject(
          "audio.provider.invalid-resource",
          "Each local resource contains only exact logical ID, cue and bytes.",
        );
      }
      const expected = CURRENT_AUDIO_RESOURCE_PROFILE.resources.find(
        (candidate) => candidate.cue === resource.cue,
      );
      if (expected === undefined || expected.logicalId !== resource.logicalId) {
        return reject(
          "audio.provider.unknown-resource",
          "Local resources must use an exact current cue/logical-ID pair without aliases.",
        );
      }
      const key = resourceKey(resource.logicalId, resource.cue);
      if (bytesByKey.has(key)) {
        return reject(
          "audio.provider.duplicate-resource",
          "Duplicate local resource keys fail before any provider capability is created.",
        );
      }
      bytesByKey.set(key, Uint8Array.from(resource.bytes));
    }
    return audioAccepted(new ImmutableLocalAudioResourceProvider(bytesByKey));
  }

  async read(resource: AudioResourceProfile): Promise<AudioOperationResult<Uint8Array>> {
    const expected = CURRENT_AUDIO_RESOURCE_PROFILE.resources.find(
      (candidate) => candidate.cue === resource.cue,
    );
    if (expected === undefined || expected.logicalId !== resource.logicalId) {
      return reject(
        "audio.provider.foreign-profile-resource",
        "Provider reads reject resources outside the exact current profile before key lookup.",
      );
    }
    const bytes = this.bytesByKey.get(resourceKey(resource.logicalId, resource.cue));
    return bytes === undefined
      ? audioRejected(
          "audio-resource-unavailable",
          "audio.provider.resource-unavailable",
          "The exact local resource is unavailable and no network or fallback provider is consulted.",
        )
      : audioAccepted(Uint8Array.from(bytes));
  }
}

function resourceKey(logicalId: string, cue: string): string {
  return `${logicalId}\u0000${cue}`;
}

function reject(capability: string, boundary: string) {
  return audioRejected("evidence-required", capability, boundary);
}
