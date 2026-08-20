import type {
  ParticleOperationResult,
  ParticlePreparedResourcePack,
  ParticleResourcePreflightAdapter,
  ParticleResourceProvider,
} from "../particleContracts";
import {
  parseAndFreezeParticleProfile,
  parseAndFreezeParticleTextureManifest,
  particleAccepted,
  particleRejected,
  validateParticleProfileTextureRelations,
  validateSelectedSkinParticlePack,
} from "../particleValidation";
import { CURRENT_PARTICLE_RESOURCE_MANIFEST } from "./currentParticleResourceManifest";

export class ParticlePreparationInvariantError extends Error {
  constructor(
    readonly capability: string,
    readonly boundary: string,
  ) {
    super(boundary);
  }
}

export async function prepareCurrentParticleResources(
  provider: ParticleResourceProvider,
  preflight: ParticleResourcePreflightAdapter,
): Promise<ParticleOperationResult<ParticlePreparedResourcePack>> {
  if (provider.readPreparedSkinPack !== undefined) {
    const selected = await provider.readPreparedSkinPack();
    return selected.status === "accepted"
      ? validateSelectedSkinParticlePack(selected.value)
      : selected;
  }
  const loaded = new Map<string, Uint8Array>();
  for (const resource of CURRENT_PARTICLE_RESOURCE_MANIFEST.resources) {
    const read = await provider.read(resource.logicalAssetId);
    if (read.status !== "accepted") return read;
    if (!(read.value instanceof Uint8Array)) {
      throw new ParticlePreparationInvariantError(
        "particle.prepare.invalid-provider-result",
        "The provider returned a non-byte resource capability.",
      );
    }
    loaded.set(resource.logicalAssetId, Uint8Array.from(read.value));
  }
  for (const resource of CURRENT_PARTICLE_RESOURCE_MANIFEST.resources) {
    const bytes = loaded.get(resource.logicalAssetId)!;
    if (bytes.byteLength !== resource.byteLength) {
      return particleRejected(
        "particle-resource-integrity",
        "particle.prepare.byte-length-mismatch",
        "Every current profile, manifest and PNG resource must match its exact byte length.",
      );
    }
    const hash = await preflight.sha256(bytes);
    if (hash.status !== "accepted") return hash;
    if (hash.value !== resource.sha256) {
      return particleRejected(
        "particle-resource-integrity",
        "particle.prepare.sha256-mismatch",
        "Every current profile, manifest and PNG resource must match its exact uppercase SHA-256.",
      );
    }
  }
  for (const resource of CURRENT_PARTICLE_RESOURCE_MANIFEST.resources) {
    if (resource.mime !== "image/png") continue;
    const metadata = await preflight.inspectPng(loaded.get(resource.logicalAssetId)!);
    if (metadata.status !== "accepted") return metadata;
    if (metadata.value.width !== resource.width || metadata.value.height !== resource.height) {
      return particleRejected(
        "particle-resource-decode",
        "particle.prepare.png-metadata-mismatch",
        "Decoded PNG dimensions must match the current texture allowlist before any resource commits.",
      );
    }
  }
  const profile = parseAndFreezeParticleProfile(
    loaded.get(CURRENT_PARTICLE_RESOURCE_MANIFEST.profileAssetId)!,
  );
  if (profile.status !== "accepted") return profile;
  const textures = parseAndFreezeParticleTextureManifest(
    loaded.get(CURRENT_PARTICLE_RESOURCE_MANIFEST.textureManifestAssetId)!,
  );
  if (textures.status !== "accepted") return textures;
  const relations = validateParticleProfileTextureRelations(profile.value, textures.value);
  if (relations.status !== "accepted") return relations;
  const pngBytes = new Map<string, Uint8Array>();
  for (const resource of CURRENT_PARTICLE_RESOURCE_MANIFEST.resources) {
    if (resource.mime === "image/png") {
      pngBytes.set(resource.logicalAssetId, Uint8Array.from(loaded.get(resource.logicalAssetId)!));
    }
  }
  return particleAccepted(Object.freeze({
    profile: profile.value,
    textures: textures.value,
    pngBytes,
  }));
}
