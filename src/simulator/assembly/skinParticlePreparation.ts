import type {
  ParticleBundleProfile,
  ParticleMaterialProfile,
  ParticlePreparedResourcePack,
  ParticlePortableProfile,
  ParticleResourceProvider,
  ParticleRootId,
  ParticleSystemDefinition,
  ParticleTextureManifest,
  ParticleTextureProfile,
} from "../backends/particleContracts";
import { particleAccepted } from "../backends/particleValidation";
import type { ResolvedOriginalSkinRecipe } from "../engine/skin/contracts";
import type { PreparedSkinPortablePack } from "../resources/sourcePackageContracts";
import { rejected, type SimulatorAssemblyResult } from "./result";

const ROOTS = new Set<string>([
  "effect_TapKeep", "effect_tap", "effect_tap_good", "effect_tap_great", "effect_tap_perfect",
  "effect_tap_skill_good", "effect_tap_skill_great", "effect_tap_skill_perfect", "effect_tap_swipe",
  "effect_tap_directional_flick_l", "effect_tap_directional_flick_l_2", "effect_tap_directional_flick_l_3",
  "effect_tap_directional_flick_l_finger", "effect_tap_directional_flick_r",
  "effect_tap_directional_flick_r_2", "effect_tap_directional_flick_r_3", "effect_tap_directional_flick_r_finger",
]);

export function prepareSkinParticleProvider(
  recipe: ResolvedOriginalSkinRecipe,
  packs: readonly PreparedSkinPortablePack[],
  base: ParticleResourceProvider,
): SimulatorAssemblyResult<ParticleResourceProvider> {
  if (packs.length === 0) return accepted(base);
  const ordinary = packs.find((pack) => pack.logicalResource === recipe.tapEffect.logicalResource);
  const directional = packs.find((pack) => pack.logicalResource === recipe.directional.effectLogicalResource);
  if (ordinary === undefined || directional === undefined) {
    return invalid("simulator.skin.particle-pack-inventory", "Selected Skin particles require exact TapEffect and Directional-effect packs.");
  }
  const built = buildPreparedPack(ordinary, directional);
  if (built.status === "rejected") return built;
  return accepted(Object.freeze({
    read: (logicalAssetId: string) => base.read(logicalAssetId),
    readPreparedSkinPack: async () => particleAccepted(built.value),
  }));
}

function buildPreparedPack(
  ordinary: PreparedSkinPortablePack,
  directional: PreparedSkinPortablePack,
): SimulatorAssemblyResult<ParticlePreparedResourcePack> {
  const first = convertBundle("ordinary", ordinary);
  if (first.status === "rejected") return first;
  const second = convertBundle("directional", directional);
  if (second.status === "rejected") return second;
  const bundles = Object.freeze([first.value.bundle, second.value.bundle]);
  const entries = Object.freeze([...first.value.entries, ...second.value.entries]);
  const pngBytes = new Map([...first.value.pngBytes, ...second.value.pngBytes]);
  const profile: ParticlePortableProfile = Object.freeze({
    schemaVersion: 1,
    sample: Object.freeze({
      package: "jp.co.craftegg.band", versionName: "10.1.4", versionCode: 230,
      abi: "arm64-v8a", unityVersion: "2022.3.62f1",
    }),
    packIdentity: `particle-skin-leased-semantic-v1-${ordinary.logicalResource}+${directional.logicalResource}`,
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
    productionBoundary: "Selected whole-pack PNG bytes are validated before dynamic particle publication; no alias or network fallback.",
  });
  return accepted(Object.freeze({ profile, textures, pngBytes }));
}

function convertBundle(
  key: "ordinary" | "directional",
  pack: PreparedSkinPortablePack,
): SimulatorAssemblyResult<{
  readonly bundle: ParticleBundleProfile;
  readonly entries: ParticleTextureManifest["entries"];
  readonly pngBytes: ReadonlyMap<string, Uint8Array>;
}> {
  const raw = record(pack.profile.particle);
  if (raw === null || !Array.isArray(raw.systems) || !record(raw.profiles) ||
    !record(raw.module_profiles) || !record(raw.renderer_profiles) ||
    !Array.isArray(raw.materials) || !Array.isArray(raw.textures)) {
    return invalid("simulator.skin.particle-profile-shape", "Selected particle profile fragments must retain systems/profiles/modules/renderers/materials/textures.");
  }
  const systems: ParticleSystemDefinition[] = [];
  for (const item of raw.systems) {
    if (!record(item) || typeof item.prefab !== "string" || !ROOTS.has(item.prefab) ||
      typeof item.path !== "string" || typeof item.profile !== "string" ||
      !record(item.transform) || !Array.isArray(item.parent_transforms)) continue;
    systems.push(Object.freeze({
      identity: `${key}:${item.path}`,
      root: `${key}:${item.prefab}` as ParticleRootId,
      path: item.path,
      transform: item.transform as any,
      parentTransforms: item.parent_transforms as any,
      profile: item.profile,
      randomStateU32: randomWords(`${pack.logicalResource}:${item.path}:${item.profile}`),
    }));
  }
  const rootSet = new Set(systems.map((system) => system.root));
  const expectedRootCount = key === "ordinary" ? 9 : 8;
  if (rootSet.size !== expectedRootCount) {
    return invalid("simulator.skin.particle-root-inventory", "Selected Skin particle bundle must retain every semantic gameplay root exactly once or more.");
  }
  const materials: ParticleMaterialProfile[] = [];
  for (const item of raw.materials) {
    if (!record(item) || typeof item.m_Name !== "string" || !record(item.m_Shader)) continue;
    const shader = item.m_Shader.name ??
      (item.m_Shader.file_id === 1 && item.m_Shader.path_id === 10720
        ? "Mobile/Particles/Additive"
        : null);
    if (shader !== "Legacy Shaders/Particles/Alpha Blended Premultiply" &&
      shader !== "Mobile/Particles/Additive" && shader !== "Particles/Standard Unlit") continue;
    materials.push(Object.freeze({
      name: item.m_Name,
      shader,
      texture: mainTexture(item),
      blend: shader === "Mobile/Particles/Additive" ? "add" : "normal",
    }));
  }
  const unity = record(pack.profile.unity);
  const unityTextures = unity !== null && Array.isArray(unity.textures)
    ? unity.textures.filter((value): value is Record<string, any> => record(value) !== null)
    : [];
  const files = new Map<string, PreparedSkinPortablePack["files"][number]>();
  for (const texture of unityTextures) {
    if (typeof texture.m_Name !== "string") continue;
    const id = pathId(texture.source_path_id);
    const file = id === null ? undefined : pack.files.find((candidate) => candidate.mime === "image/png" && candidate.id === `texture:${id}`);
    if (file !== undefined) files.set(texture.m_Name, file);
  }
  const textureProfiles: ParticleTextureProfile[] = [];
  const entries: Array<any> = [];
  const pngBytes = new Map<string, Uint8Array>();
  for (const item of raw.textures) {
    if (!record(item) || typeof item.m_Name !== "string" || !record(item.m_TextureSettings)) continue;
    const file = files.get(item.m_Name);
    if (file === undefined || file.width === null || file.height === null ||
      file.width !== item.m_Width || file.height !== item.m_Height) continue;
    const logicalAssetId = `particle-texture:${key}:${item.m_Name}`;
    const rgbaSha256 = file.sha256;
    const rgbaBytes = file.width * file.height * 4;
    textureProfiles.push(Object.freeze({
      name: item.m_Name, width: file.width, height: file.height,
      rgbaBytes, rgbaSha256,
      filterMode: 1,
      wrapU: item.m_TextureSettings.m_WrapU === 0 ? 0 : 1,
      wrapV: item.m_TextureSettings.m_WrapV === 0 ? 0 : 1,
    }));
    entries.push(Object.freeze({
      logicalAssetId, bytes: file.bytes.byteLength, sha256: file.sha256,
      width: file.width, height: file.height, rgbaBytes, rgbaSha256,
    }));
    pngBytes.set(logicalAssetId, file.bytes);
  }
  if (materials.length === 0 || textureProfiles.length === 0 ||
    materials.some((material) => material.texture !== null && !textureProfiles.some((texture) => texture.name === material.texture))) {
    return invalid("simulator.skin.particle-material-texture", "Every selected particle material texture must resolve in its own whole pack.");
  }
  return accepted(Object.freeze({
    bundle: Object.freeze({
      key,
      systems: Object.freeze(systems),
      profiles: raw.profiles as any,
      moduleProfiles: raw.module_profiles as any,
      rendererProfiles: raw.renderer_profiles as any,
      materials: Object.freeze(materials),
      textures: Object.freeze(textureProfiles),
    }),
    entries: Object.freeze(entries),
    pngBytes,
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
