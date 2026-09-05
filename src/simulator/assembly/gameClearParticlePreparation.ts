import type {
  ParticlePreparedResourcePack,
  ParticlePreparedSourceResourceIdentity,
  ParticleResourceProvider,
  ParticleTextureManifest,
  ParticleTextureManifestEntry,
} from "../backends/particleContracts";
import { particleAccepted } from "../backends/particleValidation";
import {
  buildGameClearParticleBundle,
  type GameClearRuntimeProfile,
} from "../backends/resources/currentGameClearProfile";
import { sha256UpperHex } from "../backends/resources/sha256";
import type { SimulatorResourceLease } from "../platform/resourceContracts";
import { OriginalResourcePackageView } from "../resources/originalResourcePackageView";
import { rejected, type SimulatorAssemblyResult } from "./result";

const LOGICAL_RESOURCE = "prefabs/bms/gameclear";
const SHA256_PATTERN = /^[0-9A-F]{64}$/;

/**
 * Adds the source-bound Game-clear domain to the already selected gameplay
 * particle pack. The returned provider owns one immutable token consumed by
 * both the native semantic simulation and the Pixi primitive executor.
 */
export async function prepareGameClearParticleProvider(
  baseProvider: ParticleResourceProvider,
  profile: GameClearRuntimeProfile,
  lease: SimulatorResourceLease,
): Promise<SimulatorAssemblyResult<ParticleResourceProvider>> {
  if (profile.nativeSemantic === undefined || baseProvider.readPreparedSkinPack === undefined) {
    return invalid(
      "simulator.game-clear.particle-native-source-missing",
      "Game-clear particle preparation requires its validated native semantic profile and one selected gameplay pack.",
    );
  }
  const base = await baseProvider.readPreparedSkinPack();
  if (base.status !== "accepted") {
    return rejected("resource-integrity", base.failure.capability, base.failure.boundary);
  }
  const view = await OriginalResourcePackageView.open(lease, LOGICAL_RESOURCE);
  if (view.status === "rejected") {
    return rejected("resource-unavailable", view.failure.capability, view.failure.boundary);
  }

  let bundle;
  try {
    bundle = buildGameClearParticleBundle(profile);
  } catch (error) {
    return invalid(
      "simulator.game-clear.particle-bundle-build",
      error instanceof Error ? error.message : "Game-clear particle bundle construction failed.",
    );
  }
  const entries: ParticleTextureManifestEntry[] = [];
  const pngBytes = new Map<string, Uint8Array>(base.value.pngBytes);
  for (const texture of bundle.textures) {
    const source = profile.nativeSemantic.assets.find((asset) => asset.logical_key === texture.name);
    if (source === undefined) {
      return invalid(
        "simulator.game-clear.particle-texture-source-missing",
        `Game-clear particle texture ${texture.name} has no native asset identity.`,
      );
    }
    const inspected = view.value.inspectPng(source.file);
    if (inspected.status === "rejected") {
      return rejected("resource-decode", inspected.failure.capability, inspected.failure.boundary);
    }
    const logicalAssetId = `particle-texture:game-clear:${texture.name}`;
    if (
      pngBytes.has(logicalAssetId) || inspected.value.bytes.byteLength !== source.png_bytes ||
      sha256UpperHex(inspected.value.bytes) !== source.png_sha256 ||
      inspected.value.width !== source.width || inspected.value.height !== source.height ||
      texture.rgbaSha256 !== source.rgba_sha256 ||
      texture.rgbaBytes !== source.width * source.height * 4
    ) {
      return invalid(
        "simulator.game-clear.particle-texture-identity",
        `Game-clear particle texture ${texture.name} does not retain its committed encoded/decoded source relation.`,
      );
    }
    entries.push(Object.freeze({
      logicalAssetId,
      bytes: source.png_bytes,
      sha256: source.png_sha256,
      width: source.width,
      height: source.height,
      rgbaBytes: texture.rgbaBytes,
      rgbaSha256: source.rgba_sha256,
    }));
    pngBytes.set(logicalAssetId, Uint8Array.from(inspected.value.bytes));
  }

  const basePack = base.value;
  if (basePack.source === undefined || basePack.profile.bundles.some((candidate) => candidate.key === "game-clear") ||
    basePack.textures.entries.some((entry) => entry.logicalAssetId.startsWith("particle-texture:game-clear:"))) {
    return invalid(
      "simulator.game-clear.particle-base-pack-invalid",
      "The selected gameplay pack must be source-bound and must not already contain a second Game-clear domain.",
    );
  }
  const source = gameClearSourceIdentity(view.value);
  if (source.status === "rejected") return source;
  const bundles = Object.freeze([...basePack.profile.bundles, bundle]);
  const mergedProfile = Object.freeze({
    ...basePack.profile,
    packIdentity: `${basePack.profile.packIdentity}+game-clear@${view.value.revision}`,
    systemCount: bundles.reduce((sum, candidate) => sum + candidate.systems.length, 0),
    profileCount: bundles.reduce((sum, candidate) => sum + Object.keys(candidate.profiles).length, 0),
    bundles,
  });
  const mergedEntries = Object.freeze([...basePack.textures.entries, ...entries]);
  const textures: ParticleTextureManifest = Object.freeze({
    ...basePack.textures,
    logicalTextureCount: mergedEntries.length,
    uniquePngCount: pngBytes.size,
    entries: mergedEntries,
    productionBoundary: `${basePack.textures.productionBoundary} Game-clear encoded PNG identities and serialized component relations are independently pinned by Reverse commit ${profile.nativeSemantic.source.reverseCommit}.`,
  });
  const pack: ParticlePreparedResourcePack = Object.freeze({
    profile: mergedProfile,
    textures,
    pngBytes,
    source: Object.freeze({
      kind: "application-snapshot" as const,
      semanticsSource: "current-official-unityfs-plus-game-clear-native-profile" as const,
      resources: Object.freeze([...basePack.source.resources, source.value]),
    }),
  });
  const provider: ParticleResourceProvider = Object.freeze({
    read: async (logicalAssetId: string) => {
      const bytes = pngBytes.get(logicalAssetId);
      return bytes === undefined
        ? baseProvider.read(logicalAssetId)
        : particleAccepted(Uint8Array.from(bytes));
    },
    readPreparedSkinPack: async () => particleAccepted(pack),
  });
  return accepted(provider);
}

function gameClearSourceIdentity(
  view: OriginalResourcePackageView,
): SimulatorAssemblyResult<ParticlePreparedSourceResourceIdentity> {
  const paths = new Set<string>();
  const files = [];
  for (const file of view.files) {
    if (paths.has(file.logicalPath) || !Number.isSafeInteger(file.byteLength) || file.byteLength <= 0 ||
      typeof file.sha256 !== "string" || !SHA256_PATTERN.test(file.sha256)) {
      return invalid(
        "simulator.game-clear.particle-source-receipt",
        "Game-clear source package receipts require unique paths and exact application SHA-256 identities.",
      );
    }
    paths.add(file.logicalPath);
    files.push(Object.freeze({
      logicalPath: file.logicalPath,
      byteLength: file.byteLength,
      sha256: file.sha256,
    }));
  }
  return accepted(Object.freeze({
    logicalResource: LOGICAL_RESOURCE,
    applicationRevision: view.revision,
    officialUnityFs: null,
    files: Object.freeze(files),
  }));
}

function invalid<T>(capability: string, boundary: string): SimulatorAssemblyResult<T> {
  return rejected("resource-integrity", capability, boundary);
}
function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
