import particleCatalogJson from "../engine/skin/currentParticleSemanticCatalog.json";
import renderCatalogJson from "../engine/skin/currentRenderSemanticCatalog.json";
import {
  CURRENT_HABAHIRO_SEMANTIC_PROFILE,
  HABAHIRO_FLASH_SPRITE_NAMES,
} from "../engine/rendering/habahiroFlashAnimation";
import { inspectMp3FirstFrame } from "../assembly/sessionBgmDerivation";
import type { CurrentSkinResourceRole } from "./sourcePackageContracts";
import type { SimulatorResourceLease } from "../platform/resourceContracts";
import { rejected, type SimulatorAssemblyResult } from "../assembly/result";
import { OriginalResourcePackageView } from "./originalResourcePackageView";
import type {
  PreparedSkinSourceFile,
  PreparedSkinSourcePackage,
} from "./sourcePackageContracts";
import type {
  SelectedSkinResourceIdentity,
  SelectedSkinResourceRole,
} from "../assembly/resourceRequirements";

interface RenderSemanticTexture {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly mipCount: number;
  readonly textureSettings: Readonly<Record<string, unknown>>;
}

interface RenderSemanticResource {
  readonly role: CurrentSkinResourceRole;
  readonly textures: readonly RenderSemanticTexture[];
}

interface ParticleSemanticResource {
  readonly role: CurrentSkinResourceRole;
  readonly officialUnityFs: Readonly<{ readonly bytes: number; readonly sha256: string }>;
  readonly serializedAsset: Readonly<{ readonly bytes: number; readonly sha256: string }>;
  readonly systems: readonly unknown[];
  readonly materials: readonly unknown[];
  readonly textures: readonly unknown[];
}

const SHA256_PATTERN = /^[0-9A-F]{64}$/;
const CURRENT_PARTICLE_SOURCE_COMMIT = "e43dded8890260806001fbcb5ab519cfb019a379";
const CURRENT_PARTICLE_RENDERER_CONTRACT_SHA256 = "7F1F19B26F6E8271D1A800645BFD7E1ECD0D5CAF322631E79474E63B3A47B307";

const renderCatalog = parseRenderCatalog(renderCatalogJson);
const particleCatalog = parseParticleCatalog(particleCatalogJson);

export async function prepareSourceAudioPackage(
  logicalResource: string,
  lease: SimulatorResourceLease,
): Promise<SimulatorAssemblyResult<PreparedSkinSourcePackage>> {
  const opened = await OriginalResourcePackageView.open(lease, logicalResource);
  if (opened.status === "rejected") {
    return rejected(opened.failure.code === "resource-platform-unavailable" ? "platform-unavailable" : "resource-integrity", opened.failure.capability, opened.failure.boundary);
  }
  return decodeSourcePackage("tap-se", logicalResource, opened.value);
}

export async function prepareSelectedSkinSourcePackages(
  selected: readonly SelectedSkinResourceIdentity[],
  lease: SimulatorResourceLease,
): Promise<SimulatorAssemblyResult<readonly PreparedSkinSourcePackage[]>> {
  if (!Array.isArray(selected) || selected.length === 0) {
    return invalid("simulator.skin.source-package-empty-selection", "Skin source-package preparation requires the complete non-empty resolved recipe inventory.");
  }
  const views = new Map<string, OriginalResourcePackageView>();
  const output: PreparedSkinSourcePackage[] = [];
  for (const identity of selected) {
    let view = views.get(identity.logicalResource);
    if (view === undefined) {
      const opened = await OriginalResourcePackageView.open(lease, identity.logicalResource);
      if (opened.status === "rejected") {
        return rejected(opened.failure.code === "resource-platform-unavailable" ? "platform-unavailable" : "resource-integrity", opened.failure.capability, opened.failure.boundary);
      }
      view = opened.value;
      views.set(identity.logicalResource, view);
    }
    const decoded = decodeSourcePackage(identity.role, identity.logicalResource, view);
    if (decoded.status === "rejected") return decoded;
    output.push(decoded.value);
  }
  return accepted(Object.freeze(output));
}

function decodeSourcePackage(
  selectedRole: SelectedSkinResourceRole,
  logicalResource: string,
  view: OriginalResourcePackageView,
): SimulatorAssemblyResult<PreparedSkinSourcePackage> {
  const role = portableRole(selectedRole);
  const render = renderCatalog.get(logicalResource) ?? null;
  const catalogParticle = particleCatalog.resources.get(logicalResource) ?? null;
  const particle = role === "habahiro-change-flash" ? null : catalogParticle;
  const bundle = validateSourceBundle(view, logicalResource, particle, role);
  if (bundle.status === "rejected") return bundle;
  if (isRenderRole(role) && render === null) {
    return invalid("simulator.skin.source-render-recipe-missing", `No evidence-backed render semantic recipe exists for ${logicalResource}.`);
  }
  if ((role === "tap-effect" || role === "directional-effect") && particle === null) {
    return invalid("simulator.skin.source-particle-recipe-missing", `No evidence-backed particle semantic recipe exists for ${logicalResource}.`);
  }
  const files: PreparedSkinSourceFile[] = [];
  const textureIds = new Map<string, number | string>();
  const unityTextures: Record<string, unknown>[] = [];
  if (render !== null) {
    const pngPaths = view.pathsWithSuffix(".png");
    const renderTextures = role === "habahiro-change-flash"
      ? render.textures.filter((texture) => HABAHIRO_FLASH_SPRITE_NAMES.includes(texture.name as typeof HABAHIRO_FLASH_SPRITE_NAMES[number]))
      : render.textures;
    if (role === "habahiro-change-flash" && renderTextures.length !== HABAHIRO_FLASH_SPRITE_NAMES.length) {
      return invalid("simulator.skin.habahiro-flash-texture-inventory", "The HABAHIRO flash package requires all four exact Root_effect textures.");
    }
    for (let index = 0; index < renderTextures.length; index += 1) {
      const texture = renderTextures[index]!;
      const exact = pngPaths.find((path) => basenameWithoutExtension(path).toLocaleLowerCase("en-US") === texture.name.toLocaleLowerCase("en-US"));
      const path = exact ?? (renderTextures.length === 1 && pngPaths.length === 1 ? pngPaths[0] : undefined);
      if (path === undefined) return invalid("simulator.skin.source-texture-file-missing", `${logicalResource} is missing exact PNG for semantic texture ${texture.name}.`);
      const leasedFile = view.requireFile(path);
      const png = view.inspectPng(path);
      if (leasedFile.status === "rejected") return invalid(leasedFile.failure.capability, leasedFile.failure.boundary);
      if (png.status === "rejected") return invalid(png.failure.capability, png.failure.boundary);
      if (leasedFile.value.mediaType !== "image/png" || typeof leasedFile.value.sha256 !== "string") {
        return invalid("simulator.skin.source-texture-lease-identity", `${logicalResource}/${path} has no application-snapshot PNG identity.`);
      }
      if (png.value.width !== texture.width || png.value.height !== texture.height) {
        return invalid("simulator.skin.source-texture-dimensions", `${logicalResource}/${path} dimensions do not match its semantic texture recipe.`);
      }
      const sourceId = habahiroTexturePathId(logicalResource, texture.name) ?? index + 1;
      textureIds.set(texture.name, sourceId);
      files.push(Object.freeze({
        id: `texture:${typeof sourceId === "string" ? sourceId.slice(6) : sourceId}`,
        logicalPath: leasedFile.value.logicalPath,
        mime: "image/png" as const,
        bytes: png.value.bytes,
        sha256: leasedFile.value.sha256,
        width: png.value.width,
        height: png.value.height,
      }));
      unityTextures.push(Object.freeze({
        source_path_id: sourceId,
        m_Name: texture.name,
        m_Width: texture.width,
        m_Height: texture.height,
        m_MipCount: texture.mipCount,
        m_TextureSettings: texture.textureSettings,
      }));
    }
  }
  const spriteRows = buildSpriteRows(role, view, textureIds);
  if (spriteRows.status === "rejected") return spriteRows;
  const portableAudio: Array<Readonly<Record<string, unknown>>> = [];
  for (const path of view.pathsWithSuffix(".mp3")) {
    const leasedFile = view.requireFile(path);
    const bytes = view.requireBytes(path);
    if (leasedFile.status === "rejected") return invalid(leasedFile.failure.capability, leasedFile.failure.boundary);
    if (bytes.status === "rejected") return invalid(bytes.failure.capability, bytes.failure.boundary);
    if (leasedFile.value.mediaType !== "audio/mpeg" || typeof leasedFile.value.sha256 !== "string") {
      return invalid("simulator.skin.source-audio-lease-identity", `${logicalResource}/${path} has no application-snapshot MP3 identity.`);
    }
    const cue = basenameWithoutExtension(path);
    const mp3 = inspectMp3FirstFrame(bytes.value);
    if (mp3.status === "rejected") {
      return invalid("simulator.skin.source-audio-mp3", `${logicalResource}/${path} is not a structurally valid MP3 resource.`);
    }
    files.push(Object.freeze({
      id: `cue:${cue}`,
      logicalPath: leasedFile.value.logicalPath,
      mime: "audio/mpeg" as const,
      bytes: bytes.value,
      sha256: leasedFile.value.sha256,
      width: null,
      height: null,
    }));
    portableAudio.push(Object.freeze({ cue, loop: cue === "SE_RHYTHM_TAP_LONG" }));
  }
  if (role === "tap-se" && portableAudio.length === 0) {
    return invalid("simulator.skin.source-audio-empty", `${logicalResource} contains no MP3 cue files.`);
  }
  const habahiroSource = habahiroOfficialSource(logicalResource);
  const profile = Object.freeze({
    unity: Object.freeze({
      textures: Object.freeze(unityTextures),
      sprites: spriteRows.value.sprites,
      ngui_atlases: spriteRows.value.ngui,
    }),
    particle: particle === null ? null : Object.freeze({
      source_binding: Object.freeze({
        application_revision: view.revision,
        official_unityfs: particle.officialUnityFs,
        serialized_asset: particle.serializedAsset,
      }),
      systems: particle.systems,
      profiles: particleCatalog.profiles,
      module_profiles: particleCatalog.moduleProfiles,
      renderer_profiles: particleCatalog.rendererProfiles,
      mesh_profiles: particleCatalog.meshProfiles,
      materials: particle.materials,
      textures: particle.textures,
    }),
    habahiroSourceBinding: habahiroSource === null ? null : Object.freeze({
      application_revision: view.revision,
      official_unityfs: habahiroSource,
    }),
    habahiroFlash: role !== "habahiro-change-flash" ? null : Object.freeze({
      source_binding: Object.freeze({
        application_revision: view.revision,
        official_unityfs: CURRENT_HABAHIRO_SEMANTIC_PROFILE.flash.officialUnityFs,
      }),
      semantic: CURRENT_HABAHIRO_SEMANTIC_PROFILE,
    }),
    portableAudio: Object.freeze(portableAudio),
  });
  return accepted(Object.freeze({
    logicalResource,
    revision: view.revision,
    role,
    profile,
    sourceFiles: Object.freeze(view.files.map((file) => Object.freeze({
      logicalPath: file.logicalPath,
      mediaType: file.mediaType,
      byteLength: file.byteLength,
      sha256: file.sha256!,
    }))),
    files: Object.freeze(files),
  }));
}

function validateSourceBundle(
  view: OriginalResourcePackageView,
  logicalResource: string,
  particle: ParticleSemanticResource | null,
  role: CurrentSkinResourceRole,
): SimulatorAssemblyResult<void> {
  const bundles = view.pathsWithSuffix(".bundle");
  if (bundles.length === 0) return invalid("simulator.skin.source-bundle-missing", `${logicalResource} requires its source .bundle manifest.`);
  let matchingContainer: Record<string, unknown> | null = null;
  for (const path of bundles) {
    const parsed = view.requireJson(path);
    if (parsed.status === "rejected") return invalid(parsed.failure.capability, parsed.failure.boundary);
    const base = record(record(parsed.value)?.Base);
    if (base?.m_AssetBundleName === logicalResource) {
      matchingContainer = record(base.m_Container);
      break;
    }
  }
  if (matchingContainer === null) {
    return invalid("simulator.skin.source-bundle-identity", `${logicalResource} has no .bundle manifest with its exact logical Bundle identity.`);
  }
  if (role === "habahiro-change-flash") {
    const containerPaths = new Set(Object.keys(matchingContainer).map((path) => path.toLocaleLowerCase("en-US")));
    if (![...containerPaths].some((path) => path.endsWith("/root_effect.prefab")) ||
      ![...containerPaths].some((path) => path.endsWith("/game_line_flash.anim"))) {
      return invalid("simulator.skin.habahiro-flash-root-missing", "The source package must publish Root_effect and game_line_flash before HABAHIRO assembly.");
    }
  }
  if (particle !== null) {
    const assets = view.pathsWithSuffix(".asset");
    if (assets.length !== 1 || view.requireJson(assets[0]!).status === "rejected") {
      return invalid("simulator.skin.source-particle-asset", `${logicalResource} requires one strict particle renderer .asset derivative.`);
    }
    const containerPaths = new Set(Object.keys(matchingContainer).map((path) => path.toLocaleLowerCase("en-US")));
    const roots = new Set<string>();
    for (const value of particle.systems) {
      const row = record(value);
      if (typeof row?.prefab === "string") roots.add(row.prefab);
    }
    for (const root of roots) {
      const suffix = `/${root.toLocaleLowerCase("en-US")}.prefab`;
      if (![...containerPaths].some((path) => path.endsWith(suffix))) {
        return invalid("simulator.skin.source-particle-root-missing", `${logicalResource} source bundle does not publish required particle root ${root}.`);
      }
    }
  }
  return accepted(undefined);
}

function buildSpriteRows(
  role: CurrentSkinResourceRole,
  view: OriginalResourcePackageView,
  textureIds: ReadonlyMap<string, number | string>,
): SimulatorAssemblyResult<{
  readonly sprites: readonly Readonly<Record<string, unknown>>[];
  readonly ngui: readonly Readonly<Record<string, unknown>>[];
}> {
  if (role === "habahiro-change-flash") {
    return accepted(Object.freeze({ sprites: Object.freeze([]), ngui: Object.freeze([]) }));
  }
  if (role === "judge") {
    const asset = view.requireSingleSuffix(".asset");
    if (asset.status === "rejected") return invalid(asset.failure.capability, asset.failure.boundary);
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(asset.value)); } catch { return invalid("simulator.skin.source-judge-json", "Judge .asset must be strict UTF-8 JSON."); }
    const base = record(value)?.Base;
    const rows = record(base)?.mSprites;
    return !Array.isArray(rows) || rows.length === 0
      ? invalid("simulator.skin.source-judge-rows", "Judge .asset requires one non-empty mSprites array.")
      : accepted(Object.freeze({ sprites: Object.freeze([]), ngui: Object.freeze([Object.freeze({ sprites: Object.freeze(rows) })]) }));
  }
  if (role !== "notes" && role !== "directional-note" && role !== "field") {
    return accepted(Object.freeze({ sprites: Object.freeze([]), ngui: Object.freeze([]) }));
  }
  const source = view.requireJson(".sprites");
  if (source.status === "rejected") return invalid(source.failure.capability, source.failure.boundary);
  if (!Array.isArray(source.value) || source.value.length === 0) {
    return invalid("simulator.skin.source-sprite-array", `${view.logicalResource} .sprites must be one non-empty array.`);
  }
  const atlasTexture = role === "field"
    ? null
    : Array.from(textureIds.keys()).find((name) => name.toLocaleLowerCase("en-US").includes("sprites")) ?? null;
  const rows: Array<Readonly<Record<string, unknown>>> = [];
  for (const item of source.value) {
    const base = record(record(item)?.Base);
    const rect = record(base?.m_Rect);
    const pivot = record(base?.m_Pivot);
    const name = base?.m_Name;
    const textureName = role === "field" && typeof name === "string" ? name : atlasTexture;
    const textureId = typeof textureName === "string" ? textureIds.get(textureName) : undefined;
    if (typeof name !== "string" || rect === null || pivot === null || textureId === undefined ||
      !positive(rect.width) || !positive(rect.height) || !positive(base?.m_PixelsToUnits)) {
      return invalid("simulator.skin.source-sprite-row", `${view.logicalResource} contains an unbound or malformed Sprite row.`);
    }
    rows.push(Object.freeze({
      name,
      rect: Object.freeze({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }),
      pivot: Object.freeze({ x: pivot.x, y: pivot.y }),
      pixels_per_unit: base!.m_PixelsToUnits,
      texture_path_id: textureId,
    }));
  }
  return accepted(Object.freeze({ sprites: Object.freeze(rows), ngui: Object.freeze([]) }));
}

function habahiroTexturePathId(logicalResource: string, textureName: string): string | null {
  if (logicalResource === CURRENT_HABAHIRO_SEMANTIC_PROFILE.flash.logicalResource) {
    return CURRENT_HABAHIRO_SEMANTIC_PROFILE.flash.sprites.find(
      (sprite) => sprite.textureName === textureName,
    )?.texturePathId ?? null;
  }
  const field = logicalResource === CURRENT_HABAHIRO_SEMANTIC_PROFILE.fieldBefore.logicalResource
    ? CURRENT_HABAHIRO_SEMANTIC_PROFILE.fieldBefore
    : logicalResource === CURRENT_HABAHIRO_SEMANTIC_PROFILE.fieldAfter.logicalResource
      ? CURRENT_HABAHIRO_SEMANTIC_PROFILE.fieldAfter
      : null;
  return field?.assets.find((asset) => asset.name === textureName)?.pathId ?? null;
}

function habahiroOfficialSource(
  logicalResource: string,
): Readonly<{ readonly bytes: number; readonly sha256: string }> | null {
  if (logicalResource === CURRENT_HABAHIRO_SEMANTIC_PROFILE.flash.logicalResource) {
    return CURRENT_HABAHIRO_SEMANTIC_PROFILE.flash.officialUnityFs;
  }
  if (logicalResource === CURRENT_HABAHIRO_SEMANTIC_PROFILE.fieldBefore.logicalResource) {
    return CURRENT_HABAHIRO_SEMANTIC_PROFILE.fieldBefore.officialUnityFs;
  }
  if (logicalResource === CURRENT_HABAHIRO_SEMANTIC_PROFILE.fieldAfter.logicalResource) {
    return CURRENT_HABAHIRO_SEMANTIC_PROFILE.fieldAfter.officialUnityFs;
  }
  return null;
}

function portableRole(role: SelectedSkinResourceRole): CurrentSkinResourceRole {
  if (role === "note") return "notes";
  if (role === "habahiro-before-field") return "field";
  if (role === "habahiro-change-flash") return "habahiro-change-flash";
  if (role === "background") return "special-background";
  if (role === "tap-se" || role === "directional-se") return "tap-se";
  return role;
}

function isRenderRole(role: CurrentSkinResourceRole): boolean {
  return role !== "tap-se";
}

function parseRenderCatalog(value: unknown): ReadonlyMap<string, RenderSemanticResource> {
  const root = record(value);
  const resources = record(root?.resources);
  if (root?.schemaVersion !== 1 || resources === null) throw new Error("invalid Skin render semantic catalog");
  const output = new Map<string, RenderSemanticResource>();
  for (const [logicalResource, raw] of Object.entries(resources)) {
    const row = record(raw);
    if (row === null || !Array.isArray(row.textures) || typeof row.role !== "string") throw new Error("invalid Skin render semantic row");
    output.set(logicalResource, Object.freeze({
      role: row.role as CurrentSkinResourceRole,
      textures: Object.freeze(row.textures.map((texture) => {
        const item = record(texture);
        const settings = record(item?.textureSettings);
        if (typeof item?.name !== "string" || !positive(item.width) || !positive(item.height) || !positive(item.mipCount) || settings === null) throw new Error("invalid Skin render semantic texture");
        return Object.freeze({ name: item.name, width: item.width as number, height: item.height as number, mipCount: item.mipCount as number, textureSettings: Object.freeze(settings) });
      })),
    }));
  }
  return output;
}

function parseParticleCatalog(value: unknown): {
  readonly resources: ReadonlyMap<string, ParticleSemanticResource>;
  readonly profiles: Readonly<Record<string, unknown>>;
  readonly moduleProfiles: Readonly<Record<string, unknown>>;
  readonly rendererProfiles: Readonly<Record<string, unknown>>;
  readonly meshProfiles: Readonly<Record<string, unknown>>;
} {
  const root = record(reviveNonFinite(value));
  const source = record(root?.source);
  const resources = record(root?.resources);
  const profiles = record(root?.profiles);
  const modules = record(root?.moduleProfiles);
  const renderers = record(root?.rendererProfiles);
  const meshes = record(root?.meshProfiles);
  if (root?.schemaVersion !== 2 ||
    root.status !== "current-source-bound-particle-renderer-semantics-provider-raster-separate" ||
    source?.reverseCommit !== CURRENT_PARTICLE_SOURCE_COMMIT ||
    source.rendererDomainContractSha256 !== CURRENT_PARTICLE_RENDERER_CONTRACT_SHA256 ||
    typeof source.resourceProfileSha256 !== "string" || !SHA256_PATTERN.test(source.resourceProfileSha256) ||
    typeof source.currentDomainContractSha256 !== "string" || !SHA256_PATTERN.test(source.currentDomainContractSha256) ||
    typeof source.boundary !== "string" || source.boundary.length === 0 ||
    resources === null || profiles === null || modules === null || renderers === null || meshes === null) {
    throw new Error("invalid source-bound Skin particle semantic catalog");
  }
  const output = new Map<string, ParticleSemanticResource>();
  const referencedRenderers = new Set<string>();
  const referencedMeshes = new Set<string>();
  for (const [logicalResource, raw] of Object.entries(resources)) {
    const row = record(raw);
    const official = record(row?.officialUnityFs);
    const serialized = record(row?.serializedAsset);
    if (row === null || (row.role !== "tap-effect" && row.role !== "directional-effect") ||
      official === null || !positive(official.bytes) || typeof official.sha256 !== "string" || !SHA256_PATTERN.test(official.sha256) ||
      serialized === null || !positive(serialized.bytes) || typeof serialized.sha256 !== "string" || !SHA256_PATTERN.test(serialized.sha256) ||
      !Array.isArray(row.systems) || !Array.isArray(row.materials) || !Array.isArray(row.textures) ||
      row.systems.length === 0 || row.materials.length === 0 || row.textures.length === 0) {
      throw new Error(`invalid source-bound Skin particle semantic row: ${logicalResource}`);
    }
    for (const system of row.systems) {
      const item = record(system);
      if (item === null || !Number.isSafeInteger(item.sourceOrdinal) || item.sourceOrdinal < 0 ||
        typeof item.semanticIdentity !== "string" || item.semanticIdentity.length === 0 ||
        !record(item.sourcePathIds) || !Array.isArray(item.componentHierarchy) ||
        typeof item.rendererProfile !== "string" || !Object.prototype.hasOwnProperty.call(renderers, item.rendererProfile) ||
        !(item.meshProfile === null || typeof item.meshProfile === "string" && Object.prototype.hasOwnProperty.call(meshes, item.meshProfile)) ||
        typeof item.rendererSourcePathId !== "string" || !/^int64:-?[0-9]+$/.test(item.rendererSourcePathId) ||
        !positive(item.rendererSerializedBytes) || typeof item.rendererSerializedSha256 !== "string" ||
        !SHA256_PATTERN.test(item.rendererSerializedSha256) ||
        !positive(item.serializedParticleBytes) || typeof item.serializedParticleSha256 !== "string" ||
        !SHA256_PATTERN.test(item.serializedParticleSha256)) {
        throw new Error(`invalid source-bound ParticleSystem row: ${logicalResource}`);
      }
      referencedRenderers.add(item.rendererProfile);
      if (typeof item.meshProfile === "string") referencedMeshes.add(item.meshProfile);
    }
    for (const material of row.materials) {
      const item = record(material);
      const shader = record(item?.resolvedShader);
      const semantics = record(item?.rendererSemantics);
      if (item === null || typeof item.sourcePathId !== "string" || !/^int64:-?[0-9]+$/.test(item.sourcePathId) ||
        !positive(item.serializedBytes) || typeof item.serializedSha256 !== "string" || !SHA256_PATTERN.test(item.serializedSha256) ||
        shader === null || typeof shader.name !== "string" || shader.name.length === 0 ||
        semantics === null || semantics.sourcePathId !== item.sourcePathId ||
        semantics.serializedBytes !== item.serializedBytes || semantics.serializedSha256 !== item.serializedSha256 ||
        semantics.name !== item.m_Name || semantics.shader !== shader.name ||
        !positive(semantics.renderQueue) || !record(semantics.mainTextureScale) || !record(semantics.mainTextureOffset)) {
        throw new Error(`invalid source-bound particle material row: ${logicalResource}`);
      }
    }
    for (const texture of row.textures) {
      const item = record(texture);
      if (item === null || typeof item.sourcePathId !== "string" || !/^int64:-?[0-9]+$/.test(item.sourcePathId) ||
        !positive(item.serializedBytes) || typeof item.serializedSha256 !== "string" || !SHA256_PATTERN.test(item.serializedSha256) ||
        !positive(item.rgbaBytes) || typeof item.rgbaSha256 !== "string" || !SHA256_PATTERN.test(item.rgbaSha256) ||
        !positive(item.m_Width) || !positive(item.m_Height)) {
        throw new Error(`invalid source-bound particle texture row: ${logicalResource}`);
      }
    }
    output.set(logicalResource, Object.freeze({
      role: row.role as CurrentSkinResourceRole,
      officialUnityFs: Object.freeze({ bytes: official.bytes as number, sha256: official.sha256 as string }),
      serializedAsset: Object.freeze({ bytes: serialized.bytes as number, sha256: serialized.sha256 as string }),
      systems: Object.freeze(row.systems),
      materials: Object.freeze(row.materials),
      textures: Object.freeze(row.textures),
    }));
  }
  const rendererKeys = Object.keys(renderers);
  const meshKeys = Object.keys(meshes);
  if (output.size !== Object.keys(resources).length || output.size === 0 ||
    referencedRenderers.size !== rendererKeys.length || rendererKeys.some((identity) => !referencedRenderers.has(identity)) ||
    referencedMeshes.size !== meshKeys.length || meshKeys.some((identity) => !referencedMeshes.has(identity))) {
    throw new Error("The source-bound particle catalog must derive a non-empty complete renderer/mesh set from its exact system relations.");
  }
  return Object.freeze({
    resources: output,
    profiles: Object.freeze(profiles),
    moduleProfiles: Object.freeze(modules),
    rendererProfiles: Object.freeze(renderers),
    meshProfiles: Object.freeze(meshes),
  });
}

function reviveNonFinite(value: unknown): unknown {
  if (value === "number:+infinity") return Number.POSITIVE_INFINITY;
  if (value === "number:-infinity") return Number.NEGATIVE_INFINITY;
  if (value === "number:nan") return Number.NaN;
  if (Array.isArray(value)) return Object.freeze(value.map(reviveNonFinite));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveNonFinite(item)])));
  }
  return value;
}

function basenameWithoutExtension(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}

function record(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function invalid<T>(capability: string, boundary: string): SimulatorAssemblyResult<T> {
  return rejected("resource-integrity", capability, boundary);
}

function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
