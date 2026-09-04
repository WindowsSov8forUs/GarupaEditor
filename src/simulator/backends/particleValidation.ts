import type {
  ParticleCommand,
  ParticleFailureCode,
  ParticleFrameRequest,
  ParticleInstanceIdentity,
  ParticleOperationResult,
  ParticlePortableProfile,
  ParticlePreparedResourcePack,
  ParticleRootId,
  ParticleTextureManifest,
  ParticleTextureManifestEntry,
} from "./particleContracts";

const SHA256_PATTERN = /^[0-9A-F]{64}$/;
const FLOAT32_BITS_PATTERN = /^0x[0-9A-F]{8}$/;

export const CURRENT_PARTICLE_ROOTS: readonly ParticleRootId[] = Object.freeze([
  "directional:effect_tap_directional_flick_l",
  "directional:effect_tap_directional_flick_l_2",
  "directional:effect_tap_directional_flick_l_3",
  "directional:effect_tap_directional_flick_l_finger",
  "directional:effect_tap_directional_flick_r",
  "directional:effect_tap_directional_flick_r_2",
  "directional:effect_tap_directional_flick_r_3",
  "directional:effect_tap_directional_flick_r_finger",
  "ordinary:effect_TapKeep",
  "ordinary:effect_tap",
  "ordinary:effect_tap_good",
  "ordinary:effect_tap_great",
  "ordinary:effect_tap_perfect",
  "ordinary:effect_tap_skill_good",
  "ordinary:effect_tap_skill_great",
  "ordinary:effect_tap_skill_perfect",
  "ordinary:effect_tap_swipe",
]);

const ROOT_SET: ReadonlySet<string> = new Set(CURRENT_PARTICLE_ROOTS);
const MODULE_TYPES = Object.freeze([
  "InitialModule", "EmissionModule", "ShapeModule", "ColorModule", "SizeModule",
  "RotationModule", "RotationBySpeedModule", "ClampVelocityModule", "VelocityModule",
  "ForceModule", "CustomDataModule", "UVModule",
]);
const MODULE_SET: ReadonlySet<string> = new Set(MODULE_TYPES);

export function particleAccepted<T>(value: T): ParticleOperationResult<T> {
  return Object.freeze({ status: "accepted", value });
}

export function particleRejected(
  code: ParticleFailureCode,
  capability: string,
  boundary: string,
): ParticleOperationResult<never> {
  return Object.freeze({
    status: code,
    failure: Object.freeze({ code, capability, boundary }),
  });
}

// Serialized Reverse fixture identity only; production snapshots expose the scoped portable fidelity below.
const REVERSE_SERIALIZED_PARTICLE_FIDELITY = "current-static-portable-complete";

export function parseAndFreezeParticleProfile(
  bytes: Uint8Array,
): ParticleOperationResult<ParticlePortableProfile> {
  const parsed = parseJson(bytes, "particle.profile.invalid-json");
  if (parsed.status !== "accepted") return parsed;
  const value = parsed.value;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion", "sample", "packIdentity", "fidelity", "networkAllowed",
      "automaticFallbackAllowed", "systemCount", "profileCount", "bundles",
    ]) ||
    value.schemaVersion !== 1 ||
    !isNonEmpty(value.packIdentity) ||
    value.fidelity !== REVERSE_SERIALIZED_PARTICLE_FIDELITY ||
    value.networkAllowed !== false ||
    value.automaticFallbackAllowed !== false ||
    value.systemCount !== 120 ||
    value.profileCount !== 100 ||
    !isLockedSample(value.sample) ||
    !Array.isArray(value.bundles) ||
    value.bundles.length !== 2
  ) {
    return reject(
      "particle.profile.invalid-shape",
      "Only the locked offline current-static portable profile with 120 systems and 100 profiles is accepted.",
    );
  }

  const expected = Object.freeze({
    ordinary: Object.freeze({ systems: 66, profiles: 58, renderers: 24, materials: 5, textures: 5 }),
    directional: Object.freeze({ systems: 54, profiles: 42, renderers: 12, materials: 3, textures: 3 }),
  });
  const bundleKeys = new Set<string>();
  const identities = new Set<string>();
  const roots = new Set<string>();
  let profileCount = 0;
  let enabledModuleRelationCount = 0;
  const moduleCombinations = new Set<string>();
  for (const bundle of value.bundles) {
    if (!isRecord(bundle) || !hasExactKeys(bundle, [
      "key", "systems", "profiles", "moduleProfiles", "rendererProfiles", "materials", "textures",
    ]) || (bundle.key !== "ordinary" && bundle.key !== "directional") || bundleKeys.has(bundle.key) ||
      !Array.isArray(bundle.systems) || !isRecord(bundle.profiles) || !isRecord(bundle.moduleProfiles) ||
      !isRecord(bundle.rendererProfiles) || !Array.isArray(bundle.materials) || !Array.isArray(bundle.textures)) {
      return reject("particle.profile.invalid-bundle", "Both exact ordinary and directional bundle inventories must appear once.");
    }
    const bundleKey = bundle.key as "ordinary" | "directional";
    bundleKeys.add(bundleKey);
    const count = expected[bundleKey];
    if (
      bundle.systems.length !== count.systems || Object.keys(bundle.profiles).length !== count.profiles ||
      Object.keys(bundle.rendererProfiles).length !== count.renderers || bundle.materials.length !== count.materials ||
      bundle.textures.length !== count.textures || Object.keys(bundle.moduleProfiles).some((name) => !MODULE_SET.has(name))
    ) {
      return reject("particle.profile.inventory-mismatch", "Current per-bundle system/profile/module/renderer/material/texture counts are exact.");
    }
    profileCount += Object.keys(bundle.profiles).length;
    const materialNames = new Set<string>();
    for (const material of bundle.materials) {
      if (!isRecord(material) || !hasExactKeys(material, ["name", "shader", "texture", "blend"]) ||
        !isNonEmpty(material.name) || materialNames.has(material.name) ||
        !isNonEmpty(material.shader) ||
        !["Legacy Shaders/Particles/Alpha Blended Premultiply", "Mobile/Particles/Additive", "Particles/Standard Unlit"].includes(material.shader) ||
        (material.texture !== null && !isNonEmpty(material.texture)) ||
        (material.blend !== "add" && material.blend !== "normal") ||
        (material.shader === "Mobile/Particles/Additive") !== (material.blend === "add")) {
        return reject("particle.profile.invalid-material", "Materials require stable names, locked current shaders and explicit portable blend mapping.");
      }
      materialNames.add(material.name);
    }
    const textureNames = new Set<string>();
    for (const texture of bundle.textures) {
      if (!isRecord(texture) || !isNonEmpty(texture.name) || textureNames.has(texture.name) ||
        !isPositiveInteger(texture.width) || !isPositiveInteger(texture.height) || !isPositiveInteger(texture.rgbaBytes) ||
        typeof texture.rgbaSha256 !== "string" || !SHA256_PATTERN.test(texture.rgbaSha256)) {
        return reject("particle.profile.invalid-texture", "Texture dimensions, decoded byte count and uppercase current RGBA hash are mandatory.");
      }
      if (texture.filterMode !== 1 || (texture.wrapU !== 0 && texture.wrapU !== 1) ||
        (texture.wrapV !== 0 && texture.wrapV !== 1) || texture.rgbaBytes !== texture.width * texture.height * 4) {
        return reject("particle.profile.invalid-texture-sampling", "Current texture filter, wrap and decoded RGBA size fields are closed and cannot be defaulted.");
      }
      textureNames.add(texture.name);
    }
    for (const material of bundle.materials) {
      if (material.texture !== null && !textureNames.has(material.texture)) {
        return reject("particle.profile.invalid-material-texture", "Every material texture must resolve in its own current bundle.");
      }
    }
    for (const renderer of Object.values(bundle.rendererProfiles)) {
      if (!isRecord(renderer) || !Array.isArray(renderer.m_Materials) ||
        !renderer.m_Materials.every((material: unknown) => material === null ||
          (isRecord(material) && material.type === "Material" && isNonEmpty(material.name) && materialNames.has(material.name))) ||
        (renderer.m_RenderMode !== 0 && renderer.m_RenderMode !== 1) ||
        (renderer.m_RenderAlignment !== 0 && renderer.m_RenderAlignment !== 2) ||
        !Number.isSafeInteger(renderer.m_SortingOrder)) {
        return reject("particle.profile.invalid-renderer", "Renderer modes, alignments, sorting and material references must match the closed current inventory.");
      }
    }
    for (const system of bundle.systems) {
      if (!isRecord(system) || !isNonEmpty(system.identity) || identities.has(system.identity) ||
        !isNonEmpty(system.root) || !ROOT_SET.has(system.root) || !isNonEmpty(system.path) ||
        !isNonEmpty(system.profile) || !owns(bundle.profiles, system.profile) ||
        !Array.isArray(system.randomStateU32) || system.randomStateU32.length !== 4 ||
        !system.randomStateU32.every(isUint32) || !isTransform(system.transform) ||
        !Array.isArray(system.parentTransforms) || !system.parentTransforms.every(isTransform)) {
        return reject("particle.profile.invalid-system", "Every current system requires a unique semantic identity, valid root/profile/TRS and four uint32 random words.");
      }
      identities.add(system.identity);
      roots.add(system.root);
    }
    for (const profile of Object.values(bundle.profiles)) {
      if (!isRecord(profile) || !isRecord(profile.system) || !isRecord(profile.modules) ||
        !isNonEmpty(profile.renderer) || !owns(bundle.rendererProfiles, profile.renderer)) {
        return reject("particle.profile.invalid-profile-reference", "Profile renderer and module references must resolve inside their current bundle.");
      }
      const combination = Object.keys(profile.modules).sort();
      moduleCombinations.add(combination.join("+"));
      for (const [moduleName, moduleId] of Object.entries(profile.modules)) {
        const moduleMap = bundle.moduleProfiles[moduleName];
        if (!MODULE_SET.has(moduleName) || !isNonEmpty(moduleId) || !isRecord(moduleMap) || !owns(moduleMap, moduleId)) {
          return reject("particle.profile.invalid-module-reference", "Every enabled current module reference must resolve exactly once.");
        }
      }
    }
    for (const system of bundle.systems) {
      if (!isRecord(system) || !isNonEmpty(system.profile)) {
        return reject("particle.profile.invalid-count-system", "Current system counting requires one validated profile identity.");
      }
      const countedProfile = bundle.profiles[system.profile];
      if (!isRecord(countedProfile) || !isRecord(countedProfile.modules)) {
        return reject("particle.profile.invalid-count-profile", "Current enabled module counting requires one validated module map.");
      }
      enabledModuleRelationCount += Object.keys(countedProfile.modules).length;
    }
  }
  if (bundleKeys.size !== 2 || identities.size !== 120 || roots.size !== 17 || profileCount !== 100 ||
    enabledModuleRelationCount !== 605 || moduleCombinations.size !== 16) {
    return reject("particle.profile.incomplete-inventory", "The portable profile must close 120 systems, 100 profiles, 17 roots, 605 enabled module relations and 16 combinations.");
  }
  return particleAccepted(deepFreeze({
    ...value,
    fidelity: "current-static-portable",
  }) as unknown as ParticlePortableProfile);
}

export function parseAndFreezeParticleTextureManifest(
  bytes: Uint8Array,
): ParticleOperationResult<ParticleTextureManifest> {
  const parsed = parseJson(bytes, "particle.textures.invalid-json");
  if (parsed.status !== "accepted") return parsed;
  const value = parsed.value;
  if (!isRecord(value) || value.schemaVersion !== 1 ||
    value.status !== "eight-logical-textures-seven-unique-png-snapshots" ||
    value.logicalTextureCount !== 8 || value.uniquePngCount !== 7 ||
    !Array.isArray(value.entries) || value.entries.length !== 8 || !isNonEmpty(value.productionBoundary)) {
    return reject("particle.textures.invalid-manifest", "The current texture manifest is fixed at eight logical textures and seven unique PNG resources.");
  }
  const ids = new Set<string>();
  let fileCount = 0;
  for (const entry of value.entries) {
    if (!isRecord(entry) || !isNonEmpty(entry.logicalAssetId) || ids.has(entry.logicalAssetId) ||
      !isPositiveInteger(entry.width) || !isPositiveInteger(entry.height) ||
      !isPositiveInteger(entry.rgbaBytes) || typeof entry.rgbaSha256 !== "string" || !SHA256_PATTERN.test(entry.rgbaSha256)) {
      return reject("particle.textures.invalid-entry", "Texture identities, dimensions and current decoded RGBA hashes are exact.");
    }
    ids.add(entry.logicalAssetId);
    if (typeof entry.aliasOf === "string") {
      if (!hasExactKeys(entry, ["logicalAssetId", "aliasOf", "width", "height", "rgbaBytes", "rgbaSha256"]) ||
        entry.logicalAssetId !== "particle-texture:directional:effect_circle" ||
        entry.aliasOf !== "particle-texture:ordinary:effect_circle") {
        return reject("particle.textures.invalid-alias", "Only the current byte-identical directional effect_circle alias is permitted.");
      }
      continue;
    }
    if (!hasExactKeys(entry, [
      "logicalAssetId", "path", "bytes", "sha256", "width", "height", "rgbaBytes", "rgbaSha256",
    ]) || !isPositiveInteger(entry.bytes) || typeof entry.sha256 !== "string" || !SHA256_PATTERN.test(entry.sha256)) {
      return reject("particle.textures.invalid-observed-file", "Every unique PNG must declare positive observed bytes/SHA and decoded dimensions without consulting a compiled allowlist.");
    }
    fileCount += 1;
  }
  if (ids.size !== 8 || fileCount !== 7) {
    return reject("particle.textures.incomplete", "No current logical texture or unique PNG may be omitted or duplicated.");
  }
  const productionManifest: ParticleTextureManifest = {
    schemaVersion: 1,
    status: "eight-logical-textures-seven-unique-png-snapshots",
    logicalTextureCount: 8,
    uniquePngCount: 7,
    entries: value.entries.map((rawEntry): ParticleTextureManifestEntry => {
      const entry = rawEntry as Record<string, unknown>;
      return typeof entry.aliasOf === "string"
        ? {
            logicalAssetId: entry.logicalAssetId as string,
            aliasOf: entry.aliasOf,
            width: entry.width as number,
            height: entry.height as number,
            rgbaBytes: entry.rgbaBytes as number,
            rgbaSha256: entry.rgbaSha256 as string,
          }
        : {
            logicalAssetId: entry.logicalAssetId as string,
            bytes: entry.bytes as number,
            sha256: entry.sha256 as string,
            width: entry.width as number,
            height: entry.height as number,
            rgbaBytes: entry.rgbaBytes as number,
            rgbaSha256: entry.rgbaSha256 as string,
          };
    }),
    productionBoundary: value.productionBoundary,
  };
  return particleAccepted(deepFreeze(productionManifest));
}

export function validateParticleProfileTextureRelations(
  profile: ParticlePortableProfile,
  textures: ParticleTextureManifest,
): ParticleOperationResult<void> {
  const entries = new Map(textures.entries.map((entry) => [entry.logicalAssetId, entry]));
  for (const bundle of profile.bundles) {
    for (const texture of bundle.textures) {
      const entry = entries.get(`particle-texture:${bundle.key}:${texture.name}`);
      if (entry === undefined || entry.width !== texture.width || entry.height !== texture.height ||
        entry.rgbaBytes !== texture.rgbaBytes || entry.rgbaSha256 !== texture.rgbaSha256) {
        return reject(
          "particle.profile.texture-relation-mismatch",
          "Every current bundle texture must resolve to exact decoded dimensions and RGBA digest in the prepared texture manifest.",
        );
      }
    }
  }
  return entries.size === textures.logicalTextureCount
    ? particleAccepted(undefined)
    : reject("particle.profile.texture-relation-incomplete", "Every selected logical texture relation must close exactly once.");
}

export function validateSelectedSkinParticlePack(
  pack: ParticlePreparedResourcePack,
): ParticleOperationResult<ParticlePreparedResourcePack> {
  const profile = pack.profile;
  const textures = pack.textures;
  if (!profile.packIdentity.startsWith("particle-skin-source-bound-v2-") || profile.schemaVersion !== 2 ||
    profile.fidelity !== "current-native-semantic-v2" || profile.networkAllowed !== false ||
    profile.automaticFallbackAllowed !== false || profile.bundles.length !== 2 ||
    profile.systemCount !== profile.bundles.reduce((sum, bundle) => sum + bundle.systems.length, 0) ||
    profile.profileCount !== profile.bundles.reduce((sum, bundle) => sum + Object.keys(bundle.profiles).length, 0) ||
    textures.status !== "selected-skin-portable-textures" ||
    textures.logicalTextureCount !== textures.entries.length ||
    textures.uniquePngCount !== pack.pngBytes.size || pack.source === undefined ||
    pack.source.kind !== "application-snapshot" || pack.source.resources.length === 0) {
    return reject("particle.skin-pack.invalid-root", "Selected Skin particle pack counts, source identity, fidelity, network and whole inventory must remain exact.");
  }
  const sourceResources = new Set<string>();
  for (const resource of pack.source.resources) {
    if (!isNonEmpty(resource.logicalResource) || sourceResources.has(resource.logicalResource) ||
      !isNonEmpty(resource.applicationRevision) || resource.files.length === 0 ||
      resource.files.some((file) => !isNonEmpty(file.logicalPath) || !isPositiveInteger(file.byteLength) ||
        typeof file.sha256 !== "string" || !SHA256_PATTERN.test(file.sha256))) {
      return reject("particle.skin-pack.invalid-source", "Prepared particle source identities require unique resources, application revisions and exact file receipt tuples.");
    }
    sourceResources.add(resource.logicalResource);
    if (resource.officialUnityFs !== null &&
      (!isPositiveInteger(resource.officialUnityFs.bytes) || !SHA256_PATTERN.test(resource.officialUnityFs.sha256))) {
      return reject("particle.skin-pack.invalid-official-source", "Official UnityFS semantic source identities require exact bytes and SHA-256 when present.");
    }
  }
  const bundleKeys = new Set<string>();
  for (const bundle of profile.bundles) {
    if ((bundle.key !== "ordinary" && bundle.key !== "directional") || bundleKeys.has(bundle.key) ||
      bundle.systems.length === 0 || Object.keys(bundle.profiles).length === 0 ||
      Object.keys(bundle.rendererProfiles).length === 0 || bundle.materials.length === 0 ||
      bundle.textures.length === 0) {
      return reject("particle.skin-pack.invalid-bundle", "Selected Skin ordinary/directional particle bundles must each be complete and unique.");
    }
    bundleKeys.add(bundle.key);
    const materialNames = new Set<string>();
    for (const material of bundle.materials) {
      if (!isNonEmpty(material.name) || materialNames.has(material.name) || !isNonEmpty(material.shader) ||
        (material.texture !== null && !isNonEmpty(material.texture)) ||
        (material.blend !== "add" && material.blend !== "normal")) {
        return reject("particle.skin-pack.invalid-material", "Every selected Skin material requires unique identity, resolved current shader, texture relation and explicit blend projection.");
      }
      materialNames.add(material.name);
    }
    const textureNames = new Set(bundle.textures.map((texture) => texture.name));
    if (textureNames.size !== bundle.textures.length ||
      bundle.materials.some((material) => material.texture !== null && !textureNames.has(material.texture))) {
      return reject("particle.skin-pack.invalid-material-texture", "Every selected Skin material texture must resolve exactly once in its own bundle.");
    }
    for (const renderer of Object.values(bundle.rendererProfiles)) {
      if (!isCurrentRendererProfile(renderer, materialNames)) {
        return reject("particle.skin-pack.invalid-renderer", "Every selected Skin renderer must retain its exact current mode, alignment, ordering, size, pivot and complete material slots.");
      }
    }
    for (let sourceOrdinal = 0; sourceOrdinal < bundle.systems.length; sourceOrdinal += 1) {
      const system = bundle.systems[sourceOrdinal]!;
      if (!ROOT_SET.has(system.root) || !owns(bundle.profiles, system.profile) ||
        system.sourceOrdinal !== sourceOrdinal || !isTransform(system.transform) ||
        !Array.isArray(system.parentTransforms) || !system.parentTransforms.every(isTransform) ||
        !Array.isArray(system.parentParticleSystemFlags) ||
        system.parentParticleSystemFlags.length !== system.parentTransforms.length ||
        !system.parentParticleSystemFlags.every((flag) => typeof flag === "boolean")) {
        return reject("particle.skin-pack.invalid-system", "Every selected Skin particle system requires one known root, contiguous source ordinal and source-bound profile/TRS; runtime random state is allocated only for the concrete instance.");
      }
    }
    for (const profile of Object.values(bundle.profiles)) {
      if (!isRecord(profile) || !isRecord(profile.system) || !isRecord(profile.modules) ||
        !isNonEmpty(profile.renderer) || !owns(bundle.rendererProfiles, profile.renderer) ||
        !isCurrentSystemProfile(profile.system)) {
        return reject("particle.skin-pack.invalid-profile", "Every selected Skin profile requires exact current system, module and renderer relations.");
      }
      for (const [moduleName, moduleIdentity] of Object.entries(profile.modules)) {
        const map = bundle.moduleProfiles[moduleName as keyof typeof bundle.moduleProfiles];
        if (!MODULE_SET.has(moduleName) || !isNonEmpty(moduleIdentity) || !isRecord(map) || !owns(map, moduleIdentity) ||
          !isCurrentModuleProfile(moduleName, map[moduleIdentity])) {
          return reject("particle.skin-pack.invalid-module", `Selected Skin module ${moduleName}:${String(moduleIdentity)} does not match its current native-semantic branch contract.`);
        }
      }
    }
  }
  const relations = validateParticleProfileTextureRelations(profile, textures);
  return relations.status === "accepted" ? particleAccepted(deepFreeze(pack)) : relations;
}

export function validateParticleCommandShape(
  command: ParticleCommand,
): ParticleOperationResult<void> {
  if (!isRecord(command) || typeof command.kind !== "string") {
    return reject("particle.command.invalid-shape", "Particle commands are typed immutable records.");
  }
  switch (command.kind) {
    case "play-root":
      return hasExactKeys(command, ["kind", "ownerKey", "instance", "root", "restartIfActive"]) &&
        isNonEmpty(command.ownerKey) && isParticleInstanceIdentity(command.instance) &&
        ROOT_SET.has(command.root) && isInstanceCompatibleWithRoot(command.instance, command.root) &&
        command.restartIfActive === true
        ? particleAccepted(undefined)
        : reject("particle.command.invalid-play", "Play requires a stable owner, exact route root and explicit restart-if-active semantics.");
    case "move-note-slide-root":
      return hasExactKeys(command, ["kind", "ownerKey", "instance"]) &&
        isNonEmpty(command.ownerKey) && isParticleInstanceIdentity(command.instance) &&
        command.instance.kind === "note-slide"
        ? particleAccepted(undefined)
        : reject("particle.command.invalid-slide-move", "Slide root movement requires the exact active pooled Slide owner and current-node transform identity.");
    case "stop-clear-deactivate-root":
      return hasExactKeys(command, ["kind", "ownerKey", "instance", "root"]) &&
        isNonEmpty(command.ownerKey) && isParticleInstanceIdentity(command.instance) &&
        ROOT_SET.has(command.root) && isInstanceCompatibleWithRoot(command.instance, command.root)
        ? particleAccepted(undefined)
        : reject("particle.command.invalid-stop", "Stop/Clear/deactivate requires the exact active owner and root.");
    case "clear-all":
      return hasExactKeys(command, ["kind", "reason"]) &&
        ["movetime", "game-over", "natural-end", "retry", "reset", "dispose"].includes(command.reason)
        ? particleAccepted(undefined)
        : reject("particle.command.invalid-clear", "Clear-all requires one evidenced lifecycle reason.");
    case "suppress-until-replay":
      return hasExactKeys(command, ["kind", "reason"]) && command.reason === "movetime"
        ? particleAccepted(undefined)
        : reject("particle.command.invalid-suppression", "Only MoveTime enters replay suppression.");
    default:
      return reject("particle.command.unknown-kind", "Unknown particle commands cannot become no-op backend requests.");
  }
}

export function validateParticleFrameRequest(
  request: ParticleFrameRequest,
): ParticleOperationResult<number> {
  if (!isRecord(request) || !hasExactKeys(request, ["frame", "deltaTimeBits", "paused", "commands"]) ||
    !Number.isSafeInteger(request.frame) || request.frame < 0 || typeof request.paused !== "boolean" ||
    !Array.isArray(request.commands)) {
    return reject("particle.frame.invalid-shape", "A particle frame requires exact frame/delta/pause/command fields.");
  }
  const delta = particleFloat32FromBits(request.deltaTimeBits);
  if (delta === null || delta < 0) {
    return reject("particle.frame.invalid-delta", "Particle delta must be a finite non-negative binary32 bit pattern.");
  }
  if (request.paused && request.commands.length !== 0) {
    return reject("particle.frame.paused-command", "The managed pause branch does not issue gameplay particle commands; already-playing native systems continue on the outer particle delta.");
  }
  for (const command of request.commands) {
    const result = validateParticleCommandShape(command);
    if (result.status !== "accepted") return result;
  }
  return particleAccepted(delta);
}

export function freezeParticleCommand(command: ParticleCommand): ParticleCommand {
  return "instance" in command
    ? Object.freeze({ ...command, instance: Object.freeze({ ...command.instance }) }) as ParticleCommand
    : Object.freeze({ ...command }) as ParticleCommand;
}

export function particleFloat32ToBits(value: number): string | null {
  const rounded = Math.fround(value);
  if (!Number.isFinite(value) || !Number.isFinite(rounded) || rounded !== value) return null;
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, rounded, false);
  return `0x${view.getUint32(0, false).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function particleFloat32FromBits(bits: string): number | null {
  if (!FLOAT32_BITS_PATTERN.test(bits)) return null;
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, Number.parseInt(bits.slice(2), 16), false);
  const value = view.getFloat32(0, false);
  return Number.isFinite(value) ? value : null;
}

function isCurrentSystemProfile(value: Record<string, unknown>): boolean {
  return isFloat32(value.lengthInSec) && value.lengthInSec > 0 && value.simulationSpeed === 1 &&
    value.stopAction === 0 && (value.cullingMode === 0 || value.cullingMode === 1 || value.cullingMode === 3) &&
    value.ringBufferMode === 0 && isVector2(value.ringBufferLoopRange) && value.emitterVelocityMode === 0 &&
    typeof value.looping === "boolean" && typeof value.prewarm === "boolean" && value.playOnAwake === false &&
    value.useUnscaledTime === false && typeof value.autoRandomSeed === "boolean" && isConstantCurve(value.startDelay) &&
    value.moveWithTransform === 0 && value.moveWithCustomTransform === null &&
    (value.scalingMode === 0 || value.scalingMode === 1) && value.randomSeed === 0;
}

function isCurrentRendererProfile(value: unknown, materialNames: ReadonlySet<string>): boolean {
  if (!isRecord(value) || typeof value.m_Enabled !== "boolean" || !Array.isArray(value.m_Materials) ||
    !value.m_Materials.every((material) => material === null ||
      (isRecord(material) && material.type === "Material" && isNonEmpty(material.name) && materialNames.has(material.name))) ||
    (value.m_RenderMode !== 0 && value.m_RenderMode !== 1 && value.m_RenderMode !== 4) ||
    (value.m_RenderAlignment !== 0 && value.m_RenderAlignment !== 2) || value.m_SortMode !== 0 ||
    !Number.isSafeInteger(value.m_SortingOrder) || !isFloat32(value.m_MinParticleSize) || value.m_MinParticleSize !== 0 ||
    !isFloat32(value.m_MaxParticleSize) || value.m_MaxParticleSize <= 0 || !isFloat32(value.m_VelocityScale) ||
    !isFloat32(value.m_LengthScale) || !isFloat32(value.m_NormalDirection) ||
    typeof value.m_ApplyActiveColorSpace !== "boolean" || value.m_RotateWithStretchDirection !== true ||
    !isVector3(value.m_Pivot)) return false;
  return true;
}

function isCurrentModuleProfile(name: string, value: unknown): boolean {
  if (!isRecord(value) || value.enabled !== true) return false;
  switch (name) {
    case "InitialModule":
      return ["startLifetime", "startSpeed", "startSize", "startSizeY", "startSizeZ",
        "startRotation", "startRotationX", "startRotationY", "gravityModifier"]
        .every((key) => isMinMaxCurve(value[key])) && isConstantCurve(value.gravityModifier) &&
        isMinMaxGradient(value.startColor) && isPositiveInteger(value.maxNumParticles) && typeof value.size3D === "boolean" &&
        typeof value.rotation3D === "boolean" && value.randomizeRotationDirection === 0 &&
        value.gravitySource === 0 && isZeroVector3(value.customEmitterVelocity);
    case "EmissionModule":
      return isCurrentRateCurve(value.rateOverTime) && isZeroCurve(value.rateOverDistance) &&
        typeof value.m_BurstCount === "number" && Number.isSafeInteger(value.m_BurstCount) && value.m_BurstCount >= 0 && Array.isArray(value.m_Bursts) &&
        value.m_BurstCount === value.m_Bursts.length && value.m_Bursts.every((burst) =>
          isRecord(burst) && isFloat32(burst.time) && isCurveInStates(burst.countCurve, [0, 3]) &&
          burst.cycleCount === 1 && isFloat32(burst.repeatInterval) && burst.repeatInterval > 0 && burst.probability === 1);
    case "ShapeModule":
      return [0, 4, 5, 8, 10].includes(value.type as number) && value.placementMode === 0 &&
        isShapeScalar(value.radius, false) && isShapeScalar(value.arc, true) && isFloat32(value.radiusThickness) &&
        value.radiusThickness >= 0 && value.radiusThickness <= 1 && isFloat32(value.angle) && isFloat32(value.length) &&
        isZeroVector3(value.boxThickness) && value.donutRadius === Math.fround(0.2) &&
        value.m_MeshMaterialIndex === 0 && value.m_MeshNormalOffset === 0 && isShapeSpawn(value.m_MeshSpawn) &&
        ["m_Mesh", "m_MeshRenderer", "m_SkinnedMeshRenderer", "m_Sprite", "m_SpriteRenderer", "m_Texture"]
          .every((key) => value[key] === null) && value.m_UseMeshMaterialIndex === false && value.m_UseMeshColors === true &&
        value.m_TextureClipChannel === 3 && value.m_TextureClipThreshold === 0 && value.m_TextureUVChannel === 0 &&
        value.m_TextureColorAffectsParticles === true && value.m_TextureAlphaAffectsParticles === true &&
        value.m_TextureBilinearFiltering === false && isZeroVector3(value.m_Position) && isVector3(value.m_Rotation) &&
        (value.m_Rotation as Record<string, unknown>).y === 0 && (value.m_Rotation as Record<string, unknown>).z === 0 &&
        isVector3(value.m_Scale) && value.alignToDirection === false &&
        (value.randomDirectionAmount === 0 || value.randomDirectionAmount === 1) &&
        value.sphericalDirectionAmount === 0 && value.randomPositionAmount === 0;
    case "ColorModule": return isMinMaxGradient(value.gradient);
    case "SizeModule":
      return isMinMaxCurve(value.curve) && isMinMaxCurve(value.y) && isMinMaxCurve(value.z) &&
        typeof value.separateAxes === "boolean";
    case "RotationModule":
    case "RotationBySpeedModule":
      return isMinMaxCurve(value.curve) && isMinMaxCurve(value.x) && isMinMaxCurve(value.y) &&
        typeof value.separateAxes === "boolean" &&
        (name === "RotationModule" || (value.separateAxes === false && isVector2(value.range)));
    case "ClampVelocityModule":
      return ["x", "y", "z", "magnitude", "drag"].every((key) => isConstantCurve(value[key])) &&
        typeof value.separateAxis === "boolean" && typeof value.inWorldSpace === "boolean" &&
        typeof value.multiplyDragByParticleSize === "boolean" && typeof value.multiplyDragByParticleVelocity === "boolean" &&
        isFloat32(value.dampen) && value.dampen >= 0 && value.dampen <= 1 && isZeroCurve(value.drag);
    case "VelocityModule": {
      if (!["x", "y", "z"].every((key) => isCurveInStates(value[key], [0, 1])) ||
        !["orbitalX", "orbitalY", "orbitalZ", "orbitalOffsetX", "orbitalOffsetY",
          "orbitalOffsetZ", "radial", "speedModifier"].every((key) => isConstantCurve(value[key])) ||
        typeof value.inWorldSpace !== "boolean") return false;
      const orbitalX = constantScalar(value.orbitalX);
      const orbitalY = constantScalar(value.orbitalY);
      const orbitalZ = constantScalar(value.orbitalZ);
      const speedModifier = constantScalar(value.speedModifier);
      const offsetsAndRadial = [value.orbitalOffsetX, value.orbitalOffsetY, value.orbitalOffsetZ, value.radial]
        .every((curve) => constantScalar(curve) === 0);
      return orbitalX === 0 && orbitalY === 0 && offsetsAndRadial &&
        (speedModifier === 1 || speedModifier === 2) &&
        (orbitalZ === 0 || (orbitalZ === -4 && value.inWorldSpace && speedModifier === 1));
    }
    case "ForceModule":
      return ["x", "y", "z"].every((key) => isConstantCurve(value[key])) &&
        typeof value.inWorldSpace === "boolean" && value.randomizePerFrame === false;
    case "CustomDataModule":
      return value.mode0 === 1 && value.mode1 === 0 && value.vectorComponentCount0 === 4 &&
        value.vectorComponentCount1 === 4 && isMinMaxGradient(value.color0) && isMinMaxGradient(value.color1) &&
        ["vector0_0", "vector0_1", "vector0_2", "vector0_3", "vector1_0", "vector1_1", "vector1_2", "vector1_3"]
          .every((key) => isMinMaxCurve(value[key]));
    case "UVModule":
      return isMinMaxCurve(value.frameOverTime) && isMinMaxCurve(value.startFrame) &&
        isPositiveInteger(value.tilesX) && isPositiveInteger(value.tilesY) && value.animationType === 0 &&
        (value.rowMode === 0 || value.rowMode === 1) && value.rowIndex === 0 && value.cycles === 1 &&
        value.timeMode === 0 && value.fps === 30 && value.uvChannelMask === -1 && value.flipU === 0 &&
        value.flipV === 0 && value.mode === 0 && Array.isArray(value.sprites) && isVector2(value.speedRange);
    default: return false;
  }
}

function isShapeScalar(value: unknown, arc: boolean): boolean {
  return isRecord(value) && isFloat32(value.value) && (value.mode === 0 || (arc && value.mode === 3)) &&
    value.spread === 0 && isConstantCurve(value.speed);
}

function isShapeSpawn(value: unknown): boolean {
  return isRecord(value) && value.mode === 0 && value.spread === 0 && isConstantCurve(value.speed);
}

function isMinMaxCurve(value: unknown): boolean {
  return isRecord(value) && [0, 1, 2, 3].includes(value.minMaxState as number) &&
    isFloat32(value.scalar) && isFloat32(value.minScalar) &&
    isAnimationCurve(value.maxCurve) && isAnimationCurve(value.minCurve);
}

function isCurrentRateCurve(value: unknown): boolean {
  return isConstantCurve(value) || (isCurveInStates(value, [3]) &&
    (value as Record<string, unknown>).minScalar === 0 && (value as Record<string, unknown>).scalar === 0);
}

function isCurveInStates(value: unknown, states: readonly number[]): boolean {
  return isMinMaxCurve(value) && states.includes((value as Record<string, unknown>).minMaxState as number);
}

function isConstantCurve(value: unknown): boolean {
  return isCurveInStates(value, [0]);
}

function constantScalar(value: unknown): number | null {
  return isConstantCurve(value) ? (value as Record<string, number>).scalar : null;
}

function isZeroCurve(value: unknown): boolean {
  return isConstantCurve(value) && (value as Record<string, unknown>).scalar === 0;
}

function isAnimationCurve(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.m_Curve) && value.m_PreInfinity === 2 &&
    value.m_PostInfinity === 2 && (value.m_RotationOrder === 0 || value.m_RotationOrder === 4) && value.m_Curve.every((key) =>
      isRecord(key) && ["time", "value", "inWeight", "outWeight"].every((field) => isFloat32(key[field])) &&
      isCurveSlope(key.inSlope) && isCurveSlope(key.outSlope) && key.weightedMode === 0);
}

function isMinMaxGradient(value: unknown): boolean {
  return isRecord(value) && [0, 1, 2, 3, 4].includes(value.minMaxState as number) &&
    isColor(value.minColor) && isColor(value.maxColor) && isGradient(value.minGradient) && isGradient(value.maxGradient);
}

function isGradient(value: unknown): boolean {
  if (!isRecord(value) || (value.m_Mode !== 0 && value.m_Mode !== 1) || value.m_ColorSpace !== -1 ||
    typeof value.m_NumColorKeys !== "number" || typeof value.m_NumAlphaKeys !== "number" ||
    !Number.isSafeInteger(value.m_NumColorKeys) || !Number.isSafeInteger(value.m_NumAlphaKeys) ||
    value.m_NumColorKeys < 1 || value.m_NumColorKeys > 8 || value.m_NumAlphaKeys < 1 || value.m_NumAlphaKeys > 8) return false;
  for (let index = 0; index < 8; index += 1) {
    if (!isColor(value[`key${index}`]) || !isUint16(value[`ctime${index}`]) || !isUint16(value[`atime${index}`])) return false;
  }
  return true;
}

function isColor(value: unknown): boolean {
  return isRecord(value) && ["r", "g", "b", "a"].every((key) => isFloat32(value[key]));
}

function isZeroVector3(value: unknown): boolean {
  return isVector3(value) && (value as Record<string, unknown>).x === 0 &&
    (value as Record<string, unknown>).y === 0 && (value as Record<string, unknown>).z === 0;
}

function isVector2(value: unknown): boolean {
  return isRecord(value) && isFloat32(value.x) && isFloat32(value.y);
}

function isCurveSlope(value: unknown): boolean {
  return isFloat32(value) || value === "number:+infinity" || value === "number:-infinity";
}

function isFloat32(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.fround(value) === value;
}

function isUint16(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffff;
}

function parseJson(bytes: Uint8Array, capability: string): ParticleOperationResult<unknown> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return reject(capability, "JSON resources require non-empty immutable bytes.");
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return particleAccepted(JSON.parse(text) as unknown);
  } catch {
    return reject(capability, "JSON resources must be valid fatal UTF-8 and parse without recovery.");
  }
}

function isParticleInstanceIdentity(value: unknown): value is ParticleInstanceIdentity {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "game-play-button") {
    return hasExactKeys(value, ["kind", "buttonType", "rangeLength"]) &&
      typeof value.buttonType === "number" && Number.isInteger(value.buttonType) &&
      value.buttonType >= 0 && value.buttonType <= 15 &&
      (value.rangeLength === null ||
        (typeof value.rangeLength === "number" && Number.isInteger(value.rangeLength) &&
          value.rangeLength >= 1 && value.rangeLength <= 7));
  }
  if (value.kind !== "note-slide" ||
    !hasExactKeys(value, ["kind", "noteIndex", "absolutePosition", "buttonType", "rangeLength", "rootPositionXBits", "rootPositionYBits", "rootScaleBits"]) ||
    typeof value.noteIndex !== "number" || !Number.isSafeInteger(value.noteIndex) || value.noteIndex < 0 ||
    typeof value.absolutePosition !== "number" || !Number.isSafeInteger(value.absolutePosition) || value.absolutePosition < 0 ||
    typeof value.buttonType !== "number" || !Number.isFinite(value.buttonType) ||
    typeof value.rangeLength !== "number" || !Number.isInteger(value.rangeLength) || value.rangeLength < 1) {
    return false;
  }
  if (value.rootPositionXBits === null || value.rootPositionYBits === null || value.rootScaleBits === null) {
    return value.rootPositionXBits === null && value.rootPositionYBits === null && value.rootScaleBits === null &&
      Number.isInteger(value.buttonType) && value.buttonType >= 0 && value.buttonType <= 15;
  }
  if (typeof value.rootPositionXBits !== "string" || typeof value.rootPositionYBits !== "string" ||
    typeof value.rootScaleBits !== "string") return false;
  const rootX = particleFloat32FromBits(value.rootPositionXBits);
  const rootY = particleFloat32FromBits(value.rootPositionYBits);
  const rootScale = particleFloat32FromBits(value.rootScaleBits);
  return rootX !== null && rootY !== null && rootScale !== null && rootScale > 0;
}

function isInstanceCompatibleWithRoot(
  instance: ParticleInstanceIdentity,
  root: ParticleRootId,
): boolean {
  if (instance.kind === "note-slide") return root === "ordinary:effect_TapKeep";
  return root.startsWith("directional:")
    ? instance.rangeLength === null
    : instance.rangeLength !== null && Number.isInteger(instance.rangeLength) &&
      instance.rangeLength >= 1 && instance.rangeLength <= 7;
}

function isLockedSample(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["package", "versionName", "versionCode", "abi", "unityVersion"]) &&
    value.package === "jp.co.craftegg.band" && value.versionName === "10.1.4" && value.versionCode === 230 &&
    value.abi === "arm64-v8a" && value.unityVersion === "2022.3.62f1";
}

function isTransform(value: unknown): boolean {
  if (!isRecord(value) || !isVector3(value.m_LocalPosition) || !isVector3(value.m_LocalScale) ||
    !isRecord(value.m_LocalRotation)) return false;
  const rotation = value.m_LocalRotation;
  return ["x", "y", "z", "w"].every((key) => isFiniteNumber(rotation[key]));
}

function isVector3(value: unknown): boolean {
  return isRecord(value) && ["x", "y", "z"].every((key) => isFiniteNumber(value[key]));
}

function isUint32(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 0xffffffff;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function owns(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return actual.length === required.length && actual.every((key, index) => key === required[index]);
}

function deepFreeze<T>(value: T): T {
  const pending: object[] = [];
  if (value !== null && typeof value === "object") pending.push(value as object);
  const seen = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === "object") pending.push(child);
    }
    Object.freeze(current);
  }
  return value;
}

function reject(capability: string, boundary: string): ParticleOperationResult<never> {
  return particleRejected("integrity-failure", capability, boundary);
}
