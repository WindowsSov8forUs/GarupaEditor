import type {
  ParticlePreparedResourcePack,
  ParticleResourceProvider,
  ParticleTextureManifest,
  ParticlePortableProfile,
} from "../backends/particleContracts";
import {
  particleAccepted,
  particleRejected,
  validateSelectedSkinParticlePack,
} from "../backends/particleValidation";
import { sha256UpperHex } from "../backends/resources/sha256";
import type { SimulatorResourceLease } from "../platform/resourceContracts";
import { OriginalResourcePackageView } from "../resources/originalResourcePackageView";
import { rejected, type SimulatorAssemblyResult } from "./result";

const LOGICAL_RESOURCE = "portable/profiles/default-particle";

export async function prepareLeasedDefaultParticleProvider(
  lease: SimulatorResourceLease,
): Promise<SimulatorAssemblyResult<ParticleResourceProvider>> {
  const view = await OriginalResourcePackageView.open(lease, LOGICAL_RESOURCE);
  if (view.status === "rejected") {
    return rejected("resource-unavailable", view.failure.capability, view.failure.boundary);
  }
  const rawProfile = view.value.requireJson("profile.json");
  const rawTextures = view.value.requireJson("textures.json");
  if (rawProfile.status === "rejected") {
    return rejected("resource-decode", rawProfile.failure.capability, rawProfile.failure.boundary);
  }
  if (rawTextures.status === "rejected") {
    return rejected("resource-decode", rawTextures.failure.capability, rawTextures.failure.boundary);
  }
  if (!record(rawProfile.value) || !record(rawTextures.value) || !Array.isArray(rawTextures.value.entries)) {
    return invalid("simulator.particle.default-profile-shape");
  }
  const pngBytes = new Map<string, Uint8Array>();
  for (const rawEntry of rawTextures.value.entries) {
    if (!record(rawEntry) || typeof rawEntry.logicalAssetId !== "string") {
      return invalid("simulator.particle.default-texture-entry");
    }
    if (typeof rawEntry.aliasOf === "string") continue;
    if (typeof rawEntry.path !== "string" || typeof rawEntry.sha256 !== "string" ||
      typeof rawEntry.bytes !== "number" || typeof rawEntry.width !== "number" || typeof rawEntry.height !== "number") {
      return invalid("simulator.particle.default-texture-entry");
    }
    const bytes = view.value.requireBytes(rawEntry.path);
    const png = view.value.inspectPng(rawEntry.path);
    if (bytes.status === "rejected") {
      return rejected("resource-decode", bytes.failure.capability, bytes.failure.boundary);
    }
    if (png.status === "rejected") {
      return rejected("resource-decode", png.failure.capability, png.failure.boundary);
    }
    if (bytes.value.byteLength !== rawEntry.bytes || sha256UpperHex(bytes.value) !== rawEntry.sha256 ||
      png.value.width !== rawEntry.width || png.value.height !== rawEntry.height) {
      return invalid("simulator.particle.default-texture-identity");
    }
    pngBytes.set(rawEntry.logicalAssetId, Uint8Array.from(bytes.value));
  }
  const profile = Object.freeze({
    ...rawProfile.value,
    packIdentity: `particle-skin-source-bound-v2-default-current-exact-10.1.4@${view.value.revision}`,
    fidelity: "current-static-portable",
  }) as unknown as ParticlePortableProfile;
  const textures = Object.freeze({
    ...rawTextures.value,
    status: "selected-skin-portable-textures",
    productionBoundary: "Default particle publication consumes only the application-leased exact 10.1.4 encoded PNG and decoded-RGBA identities; provider package names and same-looking rasters are insufficient.",
  }) as unknown as ParticleTextureManifest;
  const pack: ParticlePreparedResourcePack = Object.freeze({
    profile,
    textures,
    pngBytes,
    source: Object.freeze({
      kind: "application-snapshot" as const,
      semanticsSource: "built-in-default-evidence-profile" as const,
      resources: Object.freeze([Object.freeze({
        logicalResource: LOGICAL_RESOURCE,
        applicationRevision: view.value.revision,
        officialUnityFs: null,
        files: Object.freeze(view.value.files.map((file) => Object.freeze({
          logicalPath: file.logicalPath,
          byteLength: file.byteLength,
          sha256: file.sha256!,
        }))),
      })]),
    }),
  });
  const validated = validateSelectedSkinParticlePack(pack);
  if (validated.status !== "accepted") {
    return rejected("resource-integrity", validated.failure.capability, validated.failure.boundary);
  }
  const provider: ParticleResourceProvider = Object.freeze({
    read: async (logicalAssetId: string) => {
      const bytes = pngBytes.get(logicalAssetId);
      return bytes === undefined
        ? particleRejected(
            "particle-resource-unavailable",
            "particle.default-exact-resource-missing",
            "The exact default particle provider has no aliases or generated fallback bytes.",
          )
        : particleAccepted(Uint8Array.from(bytes));
    },
    readPreparedSkinPack: async () => particleAccepted(validated.value),
  });
  return accepted(provider);
}

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function invalid<T>(capability: string): SimulatorAssemblyResult<T> {
  return rejected(
    "resource-integrity",
    capability,
    "The built-in default particle pack must retain its exact 10.1.4 profile, encoded PNG, decoded RGBA and alias relations.",
  );
}
function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
