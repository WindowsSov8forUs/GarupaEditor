import type {
  ParticleCommand,
  ParticleFailureCode,
  ParticleFrameRequest,
  ParticleOperationResult,
  ParticlePortableProfile,
  ParticleRootId,
  ParticleTextureManifest,
} from "./particleContracts";
import { CURRENT_PARTICLE_RESOURCE_MANIFEST } from "./resources/currentParticleResourceManifest";

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
  "RotationModule", "RotationBySpeedModule", "ClampVelocityModule", "UVModule",
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
    value.packIdentity !== "particle-current-10.1.4-portable-v1" ||
    value.fidelity !== "current-static-portable-complete" ||
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
      enabledModuleRelationCount += Object.keys(bundle.profiles[system.profile].modules).length;
    }
  }
  if (bundleKeys.size !== 2 || identities.size !== 120 || roots.size !== 17 || profileCount !== 100 ||
    enabledModuleRelationCount !== 605 || moduleCombinations.size !== 16) {
    return reject("particle.profile.incomplete-inventory", "The portable profile must close 120 systems, 100 profiles, 17 roots, 605 enabled module relations and 16 combinations.");
  }
  return particleAccepted(deepFreeze(value) as unknown as ParticlePortableProfile);
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
  const allowlist = new Map(CURRENT_PARTICLE_RESOURCE_MANIFEST.resources.map((resource) => [resource.logicalAssetId, resource]));
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
    const resource = allowlist.get(entry.logicalAssetId);
    if (!hasExactKeys(entry, [
      "logicalAssetId", "path", "bytes", "sha256", "width", "height", "rgbaBytes", "rgbaSha256",
    ]) || resource === undefined || resource.mime !== "image/png" || entry.bytes !== resource.byteLength ||
      entry.sha256 !== resource.sha256 || entry.width !== resource.width || entry.height !== resource.height) {
      return reject("particle.textures.allowlist-mismatch", "Every unique PNG must match its exact current byte and metadata allowlist entry.");
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
    entries: value.entries.map((entry: Record<string, any>) => typeof entry.aliasOf === "string"
      ? {
          logicalAssetId: entry.logicalAssetId,
          aliasOf: entry.aliasOf,
          width: entry.width,
          height: entry.height,
          rgbaBytes: entry.rgbaBytes,
          rgbaSha256: entry.rgbaSha256,
        }
      : {
          logicalAssetId: entry.logicalAssetId,
          bytes: entry.bytes,
          sha256: entry.sha256,
          width: entry.width,
          height: entry.height,
          rgbaBytes: entry.rgbaBytes,
          rgbaSha256: entry.rgbaSha256,
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
  return entries.size === 8
    ? particleAccepted(undefined)
    : reject("particle.profile.texture-relation-incomplete", "Exactly eight logical current texture relations must close.");
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
    return reject("particle.frame.paused-command", "Portable pause freezes particle samples and consumes no commands or random draws.");
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

function isParticleInstanceIdentity(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "game-play-button") {
    return hasExactKeys(value, ["kind", "buttonType", "rangeLength"]) &&
      Number.isInteger(value.buttonType) && value.buttonType >= 0 && value.buttonType <= 15 &&
      (value.rangeLength === null ||
        (Number.isInteger(value.rangeLength) && value.rangeLength >= 1 && value.rangeLength <= 7));
  }
  return value.kind === "note-slide" &&
    hasExactKeys(value, ["kind", "noteIndex", "absolutePosition", "buttonType", "rangeLength"]) &&
    Number.isSafeInteger(value.noteIndex) && value.noteIndex >= 0 &&
    Number.isSafeInteger(value.absolutePosition) && value.absolutePosition >= 0 &&
    Number.isInteger(value.buttonType) && value.buttonType >= 0 && value.buttonType <= 15 &&
    Number.isInteger(value.rangeLength) && value.rangeLength >= 1 && value.rangeLength <= 7;
}

function isInstanceCompatibleWithRoot(
  instance: Record<string, any>,
  root: string,
): boolean {
  if (instance.kind === "note-slide") return root === "ordinary:effect_TapKeep";
  return root.startsWith("directional:")
    ? instance.rangeLength === null
    : Number.isInteger(instance.rangeLength) && instance.rangeLength >= 1 && instance.rangeLength <= 7;
}

function isLockedSample(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["package", "versionName", "versionCode", "abi", "unityVersion"]) &&
    value.package === "jp.co.craftegg.band" && value.versionName === "10.1.4" && value.versionCode === 230 &&
    value.abi === "arm64-v8a" && value.unityVersion === "2022.3.62f1";
}

function isTransform(value: unknown): boolean {
  return isRecord(value) && isVector3(value.m_LocalPosition) && isVector3(value.m_LocalScale) &&
    isRecord(value.m_LocalRotation) && ["x", "y", "z", "w"].every((key) => isFiniteNumber(value.m_LocalRotation[key]));
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

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function owns(value: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasExactKeys(value: Record<string, any>, expected: readonly string[]): boolean {
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
  return particleRejected("evidence-required", capability, boundary);
}
