import type {
  ParticleBundleProfile,
  ParticleMaterialProfile,
  ParticleModuleProfileMap,
  ParticlePreparedResourcePack,
  ParticlePreparedSourceResourceIdentity,
  ParticlePortableProfile,
  ParticleProfileDefinition,
  ParticleRendererProfile,
  ParticleResourceProvider,
  ParticleRootId,
  ParticleSystemDefinition,
  ParticleTextureManifest,
  ParticleTextureManifestEntry,
  ParticleTextureProfile,
  ParticleTransformProfile,
} from "../backends/particleContracts";
import { particleAccepted } from "../backends/particleValidation";
import type { ResolvedOriginalSkinRecipe } from "../engine/skin/contracts";
import type { PreparedSkinSourcePackage } from "../resources/sourcePackageContracts";
import { rejected, type SimulatorAssemblyResult } from "./result";

const SHA256_PATTERN = /^[0-9A-F]{64}$/;
const INT64_PATTERN = /^int64:-?[0-9]+$/;
const ORDINARY_ROOTS = Object.freeze([
  "effect_TapKeep", "effect_tap", "effect_tap_good", "effect_tap_great", "effect_tap_perfect",
  "effect_tap_skill_good", "effect_tap_skill_great", "effect_tap_skill_perfect", "effect_tap_swipe",
] as const);
const DIRECTIONAL_ROOTS = Object.freeze([
  "effect_tap_directional_flick_l", "effect_tap_directional_flick_l_2", "effect_tap_directional_flick_l_3",
  "effect_tap_directional_flick_l_finger", "effect_tap_directional_flick_r",
  "effect_tap_directional_flick_r_2", "effect_tap_directional_flick_r_3", "effect_tap_directional_flick_r_finger",
] as const);
const CURRENT_SHADERS = new Set([
  "Legacy Shaders/Particles/Alpha Blended Premultiply",
  "Mobile/Particles/Additive",
  "Mobile/Particles/Alpha Blended",
  "Particles/Standard Unlit",
  "star/Customdata_CurveUVScroll",
]);

export function prepareSkinParticleProvider(
  recipe: ResolvedOriginalSkinRecipe,
  packs: readonly PreparedSkinSourcePackage[],
  defaultExact: ParticleResourceProvider,
): SimulatorAssemblyResult<ParticleResourceProvider> {
  if (usesExactDefaultParticlePack(recipe)) return accepted(defaultExact);
  const ordinary = packs.find((pack) => pack.logicalResource === recipe.tapEffect.logicalResource);
  const directional = packs.find((pack) => pack.logicalResource === recipe.directional.effectLogicalResource);
  if (ordinary === undefined || directional === undefined) {
    return invalid("simulator.skin.particle-pack-inventory", "Selected Skin particles require exact TapEffect and Directional-effect packs.");
  }
  const built = buildPreparedPack(ordinary, directional);
  if (built.status === "rejected") return built;
  return accepted(Object.freeze({
    read: (logicalAssetId: string) => defaultExact.read(logicalAssetId),
    readPreparedSkinPack: async () => particleAccepted(built.value),
  }));
}

export function usesExactDefaultParticlePack(recipe: ResolvedOriginalSkinRecipe): boolean {
  return recipe.tapEffect.route === "normal" &&
    recipe.tapEffect.logicalResource === "ingameskin/tapeffect/skin00" &&
    recipe.directional.route === "normal" &&
    recipe.directional.effectVariant === "normal" &&
    recipe.directional.effectLogicalResource === "ingameskin/tapeffect/directionalflickskin00normal";
}

function buildPreparedPack(
  ordinary: PreparedSkinSourcePackage,
  directional: PreparedSkinSourcePackage,
): SimulatorAssemblyResult<ParticlePreparedResourcePack> {
  const first = convertBundle("ordinary", ordinary);
  if (first.status === "rejected") return first;
  const second = convertBundle("directional", directional);
  if (second.status === "rejected") return second;
  const bundles = Object.freeze([first.value.bundle, second.value.bundle]);
  const entries = Object.freeze([...first.value.entries, ...second.value.entries]);
  const pngBytes = new Map([...first.value.pngBytes, ...second.value.pngBytes]);
  if (pngBytes.size !== first.value.pngBytes.size + second.value.pngBytes.size) {
    return invalid("simulator.skin.particle-texture-identity-collision", "Ordinary and directional selected textures require disjoint logical identities.");
  }
  const profile: ParticlePortableProfile = Object.freeze({
    schemaVersion: 1,
    sample: Object.freeze({
      package: "jp.co.craftegg.band", versionName: "10.1.4", versionCode: 230,
      abi: "arm64-v8a", unityVersion: "2022.3.62f1",
    }),
    packIdentity: `particle-skin-source-bound-v2-${ordinary.logicalResource}@${first.value.source.applicationRevision}+${directional.logicalResource}@${second.value.source.applicationRevision}`,
    fidelity: "current-static-portable",
    networkAllowed: false,
    automaticFallbackAllowed: false,
    systemCount: bundles.reduce((sum, bundle) => sum + bundle.systems.length, 0),
    profileCount: bundles.reduce((sum, bundle) => sum + Object.keys(bundle.profiles).length, 0),
    bundles,
  });
  const textures: ParticleTextureManifest = Object.freeze({
    schemaVersion: 1,
    status: "selected-skin-portable-textures",
    logicalTextureCount: entries.length,
    uniquePngCount: pngBytes.size,
    entries,
    productionBoundary: "Application-snapshot encoded PNG digests are independent expected identities. Official UnityFS owns serialized semantics and original decoded-RGBA identity; Bestdori PNG raster remains separately classified portable input.",
  });
  return accepted(Object.freeze({
    profile,
    textures,
    pngBytes,
    source: Object.freeze({
      kind: "application-snapshot" as const,
      semanticsSource: "current-official-unityfs-profile" as const,
      resources: Object.freeze([first.value.source, second.value.source]),
    }),
  }));
}

function convertBundle(
  key: "ordinary" | "directional",
  pack: PreparedSkinSourcePackage,
): SimulatorAssemblyResult<{
  readonly bundle: ParticleBundleProfile;
  readonly entries: readonly ParticleTextureManifestEntry[];
  readonly pngBytes: ReadonlyMap<string, Uint8Array>;
  readonly source: ParticlePreparedSourceResourceIdentity;
}> {
  const raw = record(pack.profile.particle);
  const binding = record(raw?.source_binding);
  const official = record(binding?.official_unityfs);
  const serialized = record(binding?.serialized_asset);
  if (raw === null || binding === null || typeof pack.revision !== "string" || pack.revision.length === 0 ||
    !Array.isArray(pack.sourceFiles) || pack.sourceFiles.length === 0 || binding.application_revision !== pack.revision ||
    official === null || !positiveInteger(official.bytes) || typeof official.sha256 !== "string" || !SHA256_PATTERN.test(official.sha256) ||
    serialized === null || !positiveInteger(serialized.bytes) || typeof serialized.sha256 !== "string" || !SHA256_PATTERN.test(serialized.sha256) ||
    !Array.isArray(raw.systems) || !record(raw.profiles) ||
    !record(raw.module_profiles) || !record(raw.renderer_profiles) ||
    !Array.isArray(raw.materials) || !Array.isArray(raw.textures)) {
    return invalid("simulator.skin.particle-profile-shape", "Selected particle semantics require exact source binding, systems, profiles, modules, renderers, materials and textures.");
  }
  const roots = key === "ordinary" ? ORDINARY_ROOTS : DIRECTIONAL_ROOTS;
  const rootSet = new Set<string>();
  const systems: ParticleSystemDefinition[] = [];
  for (let ordinal = 0; ordinal < raw.systems.length; ordinal += 1) {
    const item = record(raw.systems[ordinal]);
    if (item === null || item.sourceOrdinal !== ordinal ||
      typeof item.semanticIdentity !== "string" || !item.semanticIdentity.startsWith(`${pack.logicalResource}:`) ||
      typeof item.prefab !== "string" || !roots.includes(item.prefab as never) ||
      typeof item.path !== "string" || item.path.length === 0 || typeof item.profile !== "string" ||
      !record(item.sourcePathIds) || !Array.isArray(item.componentHierarchy) ||
      !positiveInteger(item.serializedParticleBytes) || typeof item.serializedParticleSha256 !== "string" ||
      !SHA256_PATTERN.test(item.serializedParticleSha256) || !validTransform(item.transform) ||
      !Array.isArray(item.parent_transforms) || !item.parent_transforms.every(validTransform) ||
      !owns(raw.profiles, item.profile)) {
      return invalid("simulator.skin.particle-system-source-relation", `Selected particle system row ${ordinal} is not a complete source-bound current component.`);
    }
    rootSet.add(item.prefab);
    systems.push(Object.freeze({
      identity: `${key}:${item.path}`,
      root: `${key}:${item.prefab}` as ParticleRootId,
      path: item.path,
      transform: freezeTransform(item.transform),
      parentTransforms: Object.freeze(item.parent_transforms.map(freezeTransform)),
      profile: item.profile,
      // Removed by the native random-owner refactor; retained only until that
      // versioned runtime contract lands in the immediately following batch.
      randomStateU32: randomWords(`${pack.logicalResource}:${item.path}:${item.profile}`),
    }));
  }
  if (rootSet.size !== roots.length || roots.some((root) => !rootSet.has(root))) {
    return invalid("simulator.skin.particle-root-inventory", "Selected Skin particle bundle must retain every exact gameplay root.");
  }

  const profiles = raw.profiles as unknown as Readonly<Record<string, ParticleProfileDefinition>>;
  const modules = raw.module_profiles as unknown as ParticleModuleProfileMap;
  const renderers = raw.renderer_profiles as unknown as Readonly<Record<string, ParticleRendererProfile>>;
  for (const [identity, value] of Object.entries(raw.profiles)) {
    const profile = record(value);
    if (profile === null || !record(profile.system) || !record(profile.modules) ||
      typeof profile.renderer !== "string" || !owns(raw.renderer_profiles, profile.renderer)) {
      return invalid("simulator.skin.particle-profile-reference", `Selected particle profile ${identity} has incomplete system/module/renderer references.`);
    }
    for (const [moduleName, moduleIdentity] of Object.entries(profile.modules)) {
      const moduleMap = record(raw.module_profiles[moduleName]);
      if (typeof moduleIdentity !== "string" || moduleMap === null || !owns(moduleMap, moduleIdentity)) {
        return invalid("simulator.skin.particle-module-reference", `Selected particle profile ${identity} has an unresolved ${moduleName} relation.`);
      }
    }
  }

  const materials: ParticleMaterialProfile[] = [];
  const materialNames = new Set<string>();
  for (let index = 0; index < raw.materials.length; index += 1) {
    const item = record(raw.materials[index]);
    const shader = record(item?.resolvedShader);
    if (item === null || typeof item.m_Name !== "string" || item.m_Name.length === 0 || materialNames.has(item.m_Name) ||
      !INT64_PATTERN.test(item.sourcePathId) || !positiveInteger(item.serializedBytes) ||
      typeof item.serializedSha256 !== "string" || !SHA256_PATTERN.test(item.serializedSha256) ||
      shader === null || typeof shader.name !== "string" || !CURRENT_SHADERS.has(shader.name)) {
      return invalid("simulator.skin.particle-material-source-relation", `Selected particle material row ${index} is incomplete or has an unresolved current shader.`);
    }
    materialNames.add(item.m_Name);
    materials.push(Object.freeze({
      name: item.m_Name,
      shader: shader.name,
      texture: mainTexture(item),
      blend: shader.name === "Mobile/Particles/Additive" ? "add" : "normal",
    }));
  }

  const unity = record(pack.profile.unity);
  if (unity === null || !Array.isArray(unity.textures)) {
    return invalid("simulator.skin.particle-unity-textures", "Selected particle package requires its decoded source texture relation list.");
  }
  const files = new Map<string, PreparedSkinSourcePackage["files"][number]>();
  for (let index = 0; index < unity.textures.length; index += 1) {
    const texture = record(unity.textures[index]);
    if (texture === null || typeof texture.m_Name !== "string" || texture.m_Name.length === 0 || files.has(texture.m_Name)) {
      return invalid("simulator.skin.particle-unity-texture-row", `Selected package texture relation row ${index} is malformed or duplicated.`);
    }
    const id = pathId(texture.source_path_id);
    const file = id === null ? undefined : pack.files.find((candidate) => candidate.mime === "image/png" && candidate.id === `texture:${id}`);
    if (file === undefined) {
      return invalid("simulator.skin.particle-unity-texture-file", `Selected package texture ${texture.m_Name} has no exact application-leased PNG.`);
    }
    files.set(texture.m_Name, file);
  }

  const textureProfiles: ParticleTextureProfile[] = [];
  const entries: ParticleTextureManifestEntry[] = [];
  const pngBytes = new Map<string, Uint8Array>();
  const textureNames = new Set<string>();
  for (let index = 0; index < raw.textures.length; index += 1) {
    const item = record(raw.textures[index]);
    const settings = record(item?.m_TextureSettings);
    if (item === null || settings === null || typeof item.m_Name !== "string" || item.m_Name.length === 0 ||
      textureNames.has(item.m_Name) || !INT64_PATTERN.test(item.sourcePathId) ||
      !positiveInteger(item.serializedBytes) || typeof item.serializedSha256 !== "string" || !SHA256_PATTERN.test(item.serializedSha256) ||
      !positiveInteger(item.rgbaBytes) || typeof item.rgbaSha256 !== "string" || !SHA256_PATTERN.test(item.rgbaSha256) ||
      !positiveInteger(item.m_Width) || !positiveInteger(item.m_Height) || item.rgbaBytes !== item.m_Width * item.m_Height * 4 ||
      settings.m_FilterMode !== 1 || !wrap(settings.m_WrapU) || !wrap(settings.m_WrapV)) {
      return invalid("simulator.skin.particle-texture-source-relation", `Selected particle texture row ${index} is not one complete source-bound current texture.`);
    }
    const file = files.get(item.m_Name);
    if (file === undefined || file.width !== item.m_Width || file.height !== item.m_Height || !SHA256_PATTERN.test(file.sha256)) {
      return invalid("simulator.skin.particle-material-texture", `Selected particle texture ${item.m_Name} does not resolve to its exact leased dimensions and encoded digest.`);
    }
    textureNames.add(item.m_Name);
    const logicalAssetId = `particle-texture:${key}:${item.m_Name}`;
    textureProfiles.push(Object.freeze({
      name: item.m_Name,
      width: item.m_Width,
      height: item.m_Height,
      rgbaBytes: item.rgbaBytes,
      rgbaSha256: item.rgbaSha256,
      filterMode: 1,
      wrapU: settings.m_WrapU,
      wrapV: settings.m_WrapV,
    }));
    entries.push(Object.freeze({
      logicalAssetId,
      bytes: file.bytes.byteLength,
      sha256: file.sha256,
      width: file.width,
      height: file.height,
      rgbaBytes: item.rgbaBytes,
      rgbaSha256: item.rgbaSha256,
    }));
    pngBytes.set(logicalAssetId, Uint8Array.from(file.bytes));
  }
  if (materials.length === 0 || textureProfiles.length === 0 ||
    materials.some((material) => material.texture !== null && !textureNames.has(material.texture))) {
    return invalid("simulator.skin.particle-material-texture", "Every selected particle material texture must resolve in its own source-bound package.");
  }

  const sourceFiles = new Set<string>();
  const preparedFiles: Array<{ readonly logicalPath: string; readonly byteLength: number; readonly sha256: string }> = [];
  for (const file of pack.sourceFiles) {
    if (typeof file.logicalPath !== "string" || file.logicalPath.length === 0 || sourceFiles.has(file.logicalPath) ||
      !positiveInteger(file.byteLength) || !SHA256_PATTERN.test(file.sha256)) {
      return invalid("simulator.skin.particle-source-file-identity", "Prepared source package lost one unique application file receipt identity.");
    }
    sourceFiles.add(file.logicalPath);
    preparedFiles.push(Object.freeze({ logicalPath: file.logicalPath, byteLength: file.byteLength, sha256: file.sha256 }));
  }
  return accepted(Object.freeze({
    bundle: Object.freeze({
      key,
      systems: Object.freeze(systems),
      profiles,
      moduleProfiles: modules,
      rendererProfiles: renderers,
      materials: Object.freeze(materials),
      textures: Object.freeze(textureProfiles),
    }),
    entries: Object.freeze(entries),
    pngBytes,
    source: Object.freeze({
      logicalResource: pack.logicalResource,
      applicationRevision: pack.revision,
      officialUnityFs: Object.freeze({ bytes: official.bytes, sha256: official.sha256 }),
      files: Object.freeze(preparedFiles),
    }),
  }));
}

function mainTexture(material: Record<string, unknown>): string | null {
  const saved = record(material.m_SavedProperties);
  if (saved === null || !Array.isArray(saved.m_TexEnvs)) return null;
  for (const row of saved.m_TexEnvs) {
    if (!Array.isArray(row) || row[0] !== "_MainTex" || !record(row[1])) continue;
    const texture = record(row[1].m_Texture);
    return texture !== null && typeof texture.name === "string" ? texture.name : null;
  }
  return null;
}

function validTransform(value: unknown): boolean {
  const transform = record(value);
  return transform !== null && vector3(transform.m_LocalPosition) && vector3(transform.m_LocalScale) && quaternion(transform.m_LocalRotation);
}

function freezeTransform(value: unknown): ParticleTransformProfile {
  const transform = value as ParticleTransformProfile;
  return Object.freeze({
    m_LocalPosition: Object.freeze({ ...transform.m_LocalPosition }),
    m_LocalRotation: Object.freeze({ ...transform.m_LocalRotation }),
    m_LocalScale: Object.freeze({ ...transform.m_LocalScale }),
  });
}

function vector3(value: unknown): boolean {
  const item = record(value);
  return item !== null && finite(item.x) && finite(item.y) && finite(item.z);
}

function quaternion(value: unknown): boolean {
  const item = record(value);
  return item !== null && finite(item.x) && finite(item.y) && finite(item.z) && finite(item.w);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function wrap(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

function owns(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function randomWords(value: string): readonly [number, number, number, number] {
  const words: number[] = [];
  let seed = 2166136261;
  for (let lane = 0; lane < 4; lane += 1) {
    let hash = (seed ^ lane) >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    if (hash === 0) hash = (0x9E3779B9 ^ lane) >>> 0;
    words.push(hash);
    seed = hash;
  }
  return Object.freeze(words) as unknown as readonly [number, number, number, number];
}

function pathId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "string" && /^int64:-?[0-9]+$/.test(value)) return value.slice(6);
  return null;
}

function record(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function invalid<T>(capability: string, boundary: string): SimulatorAssemblyResult<T> {
  return rejected("resource-integrity", capability, boundary);
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
