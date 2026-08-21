import type {
  ParticleOperationResult,
  ParticlePreparedResourcePack,
  ParticleResourcePreflightAdapter,
  ParticleResourceProvider,
} from "../particleContracts";
import {
  particleRejected,
  validateSelectedSkinParticlePack,
} from "../particleValidation";

export class ParticlePreparationInvariantError extends Error {
  constructor(readonly capability: string, readonly boundary: string) {
    super(boundary);
  }
}

export async function prepareCurrentParticleResources(
  provider: ParticleResourceProvider,
  _preflight: ParticleResourcePreflightAdapter,
): Promise<ParticleOperationResult<ParticlePreparedResourcePack>> {
  if (provider.readPreparedSkinPack === undefined) {
    return particleRejected(
      "particle-resource-unavailable",
      "particle.prepare.application-lease-required",
      "Production particles require one prepared selected-Skin pack from application-leased TapEffect source packages; fixed profile/PNG manifests and fallback providers are removed.",
    );
  }
  const selected = await provider.readPreparedSkinPack();
  return selected.status === "accepted"
    ? validateSelectedSkinParticlePack(selected.value)
    : selected;
}
