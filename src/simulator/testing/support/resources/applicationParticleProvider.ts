import type {
  ParticleResourcePreflightAdapter,
  ParticleResourceProvider,
} from "../../../backends/particleContracts";
import { particleAccepted } from "../../../backends/particleValidation";
import { prepareCurrentParticleResources as prepareLegacyParticleResources } from "./particleResourcePreparation";

export async function applicationLeaseParticleProviderForTesting(
  provider: ParticleResourceProvider,
  preflight: ParticleResourcePreflightAdapter,
): Promise<ParticleResourceProvider> {
  const prepared = await prepareLegacyParticleResources(provider, preflight);
  if (prepared.status !== "accepted") throw new Error(`${prepared.failure.capability}: ${prepared.failure.boundary}`);
  const selected = Object.freeze({
    ...prepared.value,
    profile: Object.freeze({
      ...prepared.value.profile,
      packIdentity: "particle-skin-leased-semantic-v1-testing-legacy-fixture",
    }),
    textures: Object.freeze({
      ...prepared.value.textures,
      status: "selected-skin-portable-textures" as const,
    }),
  });
  return Object.freeze({
    read: provider.read.bind(provider),
    readPreparedSkinPack: async () => particleAccepted(selected),
  });
}
