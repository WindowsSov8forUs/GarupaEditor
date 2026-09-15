import type {
  ParticleOperationResult,
  ParticlePreparedResourcePack,
  ParticleResourcePreflightAdapter,
  ParticleResourceProvider,
} from "../particleContracts";
import {
  particleAccepted,
  particleRejected,
  validateSelectedSkinParticlePack,
} from "../particleValidation";

const SHA256_PATTERN = /^[0-9A-F]{64}$/;
const preparedByProvider = new WeakMap<ParticleResourceProvider, {
  readonly preflight: ParticleResourcePreflightAdapter;
  readonly result: Promise<ParticleOperationResult<ParticlePreparedResourcePack>>;
}>();

export class ParticlePreparationInvariantError extends Error {
  constructor(readonly capability: string, readonly boundary: string) {
    super(boundary);
  }
}

export async function prepareCurrentParticleResources(
  provider: ParticleResourceProvider,
  preflight: ParticleResourcePreflightAdapter,
): Promise<ParticleOperationResult<ParticlePreparedResourcePack>> {
  const existing = preparedByProvider.get(provider);
  if (existing !== undefined) {
    return existing.preflight === preflight
      ? existing.result
      : particleRejected(
          "particle-resource-integrity",
          "particle.prepare.preflight-identity-changed",
          "One application-leased particle provider may be prepared once by one exact preflight capability; simulation and renderer must share that result.",
        );
  }
  const result = prepareOnce(provider, preflight);
  preparedByProvider.set(provider, Object.freeze({ preflight, result }));
  return result;
}

async function prepareOnce(
  provider: ParticleResourceProvider,
  preflight: ParticleResourcePreflightAdapter,
): Promise<ParticleOperationResult<ParticlePreparedResourcePack>> {
  if (provider.readPreparedSkinPack === undefined) {
    return particleRejected(
      "particle-resource-unavailable",
      "particle.prepare.application-lease-required",
      "Production particles require one prepared selected-Skin pack from application-leased source packages; fixed profile/PNG fallback providers are removed.",
    );
  }
  const selected = await provider.readPreparedSkinPack();
  if (selected.status !== "accepted") return selected;
  const validated = validateSelectedSkinParticlePack(selected.value);
  if (validated.status !== "accepted") return validated;
  const pack = validated.value;
  const bundleKeys = new Set(pack.profile.bundles.map((bundle) => bundle.key));
  if (pack.profile.bundles.length !== 3 || bundleKeys.size !== 3 ||
    !bundleKeys.has("ordinary") || !bundleKeys.has("directional") || !bundleKeys.has("game-clear")) {
    return reject(
      "particle.prepare.game-clear-domain-missing",
      "Production preparation requires ordinary, directional and Game-clear in one native-semantic profile before either backend is created.",
    );
  }
  const source = pack.source;
  if (source === undefined || source.kind !== "application-snapshot" || source.resources.length === 0) {
    return reject("particle.prepare.source-identity-missing", "Prepared particles require one application Snapshot/Lease source identity; a profile self-hash is not an expected digest.");
  }
  const expectedFiles = new Map<string, { readonly byteLength: number; readonly sha256: string }>();
  for (const resource of source.resources) {
    if (typeof resource.logicalResource !== "string" || resource.logicalResource.length === 0 ||
      typeof resource.applicationRevision !== "string" || resource.applicationRevision.length === 0 ||
      resource.files.length === 0) {
      return reject("particle.prepare.source-resource-invalid", "Every prepared particle source resource requires logical identity, application revision and complete file receipts.");
    }
    for (const file of resource.files) {
      if (typeof file.logicalPath !== "string" || file.logicalPath.length === 0 ||
        !Number.isSafeInteger(file.byteLength) || file.byteLength <= 0 ||
        !SHA256_PATTERN.test(file.sha256)) {
        return reject("particle.prepare.source-file-invalid", "Every prepared particle source file requires exact path, byte length and application-receipt SHA-256.");
      }
      const identity = `${file.byteLength}:${file.sha256}`;
      if (!expectedFiles.has(identity)) expectedFiles.set(identity, Object.freeze({ byteLength: file.byteLength, sha256: file.sha256 }));
    }
  }
  for (const entry of pack.textures.entries) {
    if ("aliasOf" in entry) {
      const target = pack.textures.entries.find((candidate) => candidate.logicalAssetId === entry.aliasOf && !("aliasOf" in candidate));
      if (target === undefined) {
        return reject("particle.prepare.texture-alias-target", "A prepared particle texture alias must target one validated encoded PNG entry in the same token.");
      }
      continue;
    }
    const bytes = pack.pngBytes.get(entry.logicalAssetId);
    if (bytes === undefined || bytes.byteLength !== entry.bytes ||
      !expectedFiles.has(`${entry.bytes}:${entry.sha256}`)) {
      return reject("particle.prepare.encoded-source-relation", "Every prepared particle PNG must retain the exact application-receipt byte length/SHA relation before hashing.");
    }
    const digest = await preflight.sha256(Uint8Array.from(bytes));
    if (digest.status !== "accepted") return digest;
    if (digest.value !== entry.sha256) {
      return reject("particle.prepare.encoded-sha256-mismatch", "Particle PNG bytes do not match their independent application-snapshot expected digest.");
    }
    const inspected = await preflight.inspectPng(Uint8Array.from(bytes));
    if (inspected.status !== "accepted") return inspected;
    if (inspected.value.width !== entry.width || inspected.value.height !== entry.height) {
      return reject("particle.prepare.encoded-dimensions-mismatch", "Particle PNG dimensions do not match the source-bound semantic texture relation.");
    }
  }
  return particleAccepted(pack);
}

function reject(capability: string, boundary: string) {
  return particleRejected("particle-resource-integrity", capability, boundary);
}
