import {
  ImmutableLocalRenderResourceProvider,
  type LocalRenderResource,
} from "../backends/resources/localResourceProvider";
import type {
  RenderAtlasRow,
  RenderResourceAssetProfile,
  SimulatorResourceProvider,
} from "../backends/renderingContracts";
import type { RenderEngineResourceBindings } from "../engine/rendering/renderCommandProducer";
import type { ResolvedOriginalSkinRecipe } from "../engine/skin/contracts";
import type { PreparedSkinSourcePackage } from "../resources/sourcePackageContracts";
import { rejected, type SimulatorAssemblyResult } from "./result";

export interface PreparedSkinRenderOverlay {
  readonly assets: readonly RenderResourceAssetProfile[];
  readonly provider: SimulatorResourceProvider;
  readonly bindings: RenderEngineResourceBindings;
  readonly fieldBindings: {
    readonly backgroundLineLogicalAssetId: string;
    readonly judgeLineLogicalAssetId: string;
  } | null;
  readonly backgroundLogicalAssetId: string | null;
  readonly backgroundImage: {
    readonly bytes: Uint8Array;
    readonly width: number;
    readonly height: number;
  } | null;
}

export async function prepareSkinRenderOverlay(
  recipe: ResolvedOriginalSkinRecipe,
  packs: readonly PreparedSkinSourcePackage[],
  baseBindings: RenderEngineResourceBindings,
): Promise<SimulatorAssemblyResult<PreparedSkinRenderOverlay | null>> {
  if (packs.length === 0) return accepted(null);
  const selected = new Set([
    recipe.note.logicalResource,
    recipe.field.logicalResource,
    recipe.tapEffect.logicalResource,
    recipe.background.logicalResource,
    recipe.directional.noteLogicalResource,
    recipe.judge.logicalResource,
  ].filter((value): value is string => value !== null));
  const assets: RenderResourceAssetProfile[] = [];
  const local: LocalRenderResource[] = [];
  const assetIdsByResource = new Map<string, Map<string, string>>();
  for (const pack of packs) {
    if (!selected.has(pack.logicalResource)) continue;
    const built = buildAssets(pack);
    if (built.status === "rejected") return built;
    assets.push(...built.value.assets);
    local.push(...built.value.local);
    assetIdsByResource.set(pack.logicalResource, built.value.assetIdsByTextureName);
  }
  if (assets.length === 0) return accepted(null);
  const provider = ImmutableLocalRenderResourceProvider.create(local);
  if (provider.status !== "ok") return rejected("resource-integrity", provider.capability, provider.boundary);
  const bindings = resolveBindings(recipe, baseBindings, assetIdsByResource);
  if (bindings.status === "rejected") return bindings;
  const field = assetIdsByResource.get(recipe.field.logicalResource ?? "");
  const fieldBindings = field === undefined
    ? null
    : field.get("bg_line_rhythm") === undefined || field.get("game_play_line") === undefined
      ? null
      : Object.freeze({
          backgroundLineLogicalAssetId: field.get("bg_line_rhythm")!,
          judgeLineLogicalAssetId: field.get("game_play_line")!,
        });
  if (fieldBindings === null) {
    return invalid("simulator.skin.field-required-bindings");
  }
  const background = assetIdsByResource.get(recipe.background.logicalResource ?? "");
  const backgroundLogicalAssetId = background?.get("liveBG") ?? null;
  const backgroundAsset = backgroundLogicalAssetId === null
    ? null
    : assets.find((asset) => asset.logicalAssetId === backgroundLogicalAssetId) ?? null;
  const backgroundBytes = backgroundLogicalAssetId === null
    ? null
    : local.find((asset) => asset.logicalAssetId === backgroundLogicalAssetId)?.bytes ?? null;
  if ((backgroundAsset === null) !== (backgroundBytes === null) ||
    (backgroundAsset !== null && (backgroundAsset.width === null || backgroundAsset.height === null))) {
    return invalid("simulator.skin.background-portable-image");
  }
  return accepted(Object.freeze({
    assets: Object.freeze(assets),
    provider: provider.value,
    bindings: bindings.value,
    fieldBindings,
    backgroundLogicalAssetId,
    backgroundImage: backgroundAsset === null || backgroundBytes === null
      ? null
      : Object.freeze({
          bytes: Uint8Array.from(backgroundBytes),
          width: backgroundAsset.width!,
          height: backgroundAsset.height!,
        }),
  }));
}

function buildAssets(pack: PreparedSkinSourcePackage): SimulatorAssemblyResult<{
  readonly assets: readonly RenderResourceAssetProfile[];
  readonly local: readonly LocalRenderResource[];
  readonly assetIdsByTextureName: Map<string, string>;
}> {
  const unity = valueRecord(pack.profile.unity);
  if (unity === null || !Array.isArray(unity.textures) || !Array.isArray(unity.sprites) ||
    !Array.isArray(unity.ngui_atlases)) return invalid("simulator.skin.render-profile-shape");
  const sprites = unity.sprites.filter(isRecord);
  const ngui = unity.ngui_atlases.filter(isRecord);
  const fileById = new Map(pack.files.filter((file) => file.mime === "image/png").map((file) => [file.id, file]));
  const assets: RenderResourceAssetProfile[] = [];
  const local: LocalRenderResource[] = [];
  const ids = new Map<string, string>();
  for (const value of unity.textures) {
    if (!isRecord(value) || typeof value.m_Name !== "string" ||
      typeof value.m_Width !== "number" || typeof value.m_Height !== "number") {
      return invalid("simulator.skin.render-texture-shape");
    }
    const sourcePathId = pathId(value.source_path_id);
    if (sourcePathId === null) return invalid("simulator.skin.render-texture-shape");
    const file = fileById.get(`texture:${sourcePathId}`);
    if (file === undefined || file.width !== value.m_Width || file.height !== value.m_Height) {
      return invalid("simulator.skin.render-texture-file");
    }
    const logicalAssetId = `skin/${encodeURIComponent(pack.logicalResource)}/texture/${sourcePathId}`;
    const atlasRows = buildAtlasRows(value, sprites, ngui, file.height!);
    if (atlasRows.status === "rejected") return atlasRows;
    const textureSettings = valueRecord(value.m_TextureSettings);
    if (textureSettings === null) return invalid("simulator.skin.render-texture-settings");
    assets.push(Object.freeze({
      logicalAssetId,
      role: role(pack.role, value.m_Name),
      byteLength: file.bytes.byteLength,
      sha256: file.sha256,
      mime: "image/png" as const,
      width: file.width,
      height: file.height,
      textureSettings: Object.freeze({
        scaleMode: textureSettings.m_FilterMode === 0 ? "nearest" as const : "linear" as const,
        wrapModeU: textureSettings.m_WrapU === 0 ? "repeat" as const : "clamp" as const,
        wrapModeV: textureSettings.m_WrapV === 0 ? "repeat" as const : "clamp" as const,
        mipmap: number(value.m_MipCount) > 1 ? "on" as const : "off" as const,
        premultiplyAlpha: true,
        blendMode: "normal" as const,
      }),
      atlasRows: atlasRows.value,
      materialRole: materialRole(pack.role, value.m_Name),
      animationRole: "none" as const,
      provenance: "current-official-portable" as const,
    }));
    local.push(Object.freeze({ logicalAssetId, bytes: file.bytes }));
    ids.set(value.m_Name, logicalAssetId);
  }
  return accepted(Object.freeze({ assets: Object.freeze(assets), local: Object.freeze(local), assetIdsByTextureName: ids }));
}

function buildAtlasRows(
  texture: Record<string, unknown>,
  sprites: readonly Record<string, unknown>[],
  ngui: readonly Record<string, unknown>[],
  textureHeight: number,
): SimulatorAssemblyResult<readonly RenderAtlasRow[]> {
  const rows: RenderAtlasRow[] = [];
  for (const sprite of sprites) {
    if (pathId(sprite.texture_path_id) !== pathId(texture.source_path_id)) continue;
    const rect = valueRecord(sprite.rect);
    const pivot = valueRecord(sprite.pivot);
    if (typeof sprite.name !== "string" || rect === null || pivot === null) return invalid("simulator.skin.render-sprite-row");
    const row = atlasRow(sprite.name, rect, pivot, sprite.pixels_per_unit, textureHeight);
    if (row === null) return invalid("simulator.skin.render-sprite-row");
    rows.push(row);
  }
  if (rows.length === 0 && ngui.length === 1 && Array.isArray(ngui[0]!.sprites)) {
    for (const value of ngui[0]!.sprites as unknown[]) {
      if (!isRecord(value)) return invalid("simulator.skin.render-ngui-row");
      const row = atlasRow(value.name, value, { x: 0.5, y: 0.5 }, 100, textureHeight);
      if (row === null) return invalid("simulator.skin.render-ngui-row");
      rows.push(Object.freeze({
        ...row,
        borderLeft: number(value.borderLeft), borderRight: number(value.borderRight),
        borderTop: number(value.borderTop), borderBottom: number(value.borderBottom),
      }));
    }
  }
  if (rows.length === 0 && typeof texture.m_Name === "string") {
    const width = number(texture.m_Width);
    if (width <= 0 || textureHeight <= 0) return invalid("simulator.skin.render-full-texture-row");
    rows.push(Object.freeze({
      exactKey: texture.m_Name,
      x: 0,
      y: 0,
      width,
      height: textureHeight,
      pivotX: 0.5,
      pivotY: 0.5,
      pixelsPerUnit: 100,
    }));
  }
  rows.sort((left, right) => left.exactKey.localeCompare(right.exactKey));
  if (new Set(rows.map((row) => row.exactKey)).size !== rows.length) return invalid("simulator.skin.render-duplicate-atlas-key");
  return accepted(Object.freeze(rows));
}

function atlasRow(
  name: unknown,
  rect: Record<string, unknown>,
  pivot: Record<string, unknown>,
  pixelsPerUnit: unknown,
  textureHeight: number,
): RenderAtlasRow | null {
  const x = number(rect.x); const y = number(rect.y); const width = number(rect.width); const height = number(rect.height);
  const pivotX = number(pivot.x); const pivotY = number(pivot.y); const ppu = number(pixelsPerUnit);
  if (typeof name !== "string" || width <= 0 || height <= 0 || ppu <= 0) return null;
  return Object.freeze({ exactKey: name, x, y: textureHeight - y - height, width, height, pivotX, pivotY, pixelsPerUnit: ppu });
}

function resolveBindings(
  recipe: ResolvedOriginalSkinRecipe,
  base: RenderEngineResourceBindings,
  assets: ReadonlyMap<string, Map<string, string>>,
): SimulatorAssemblyResult<RenderEngineResourceBindings> {
  let note = base.noteAtlasLogicalAssetId;
  let sync = base.syncLineLogicalAssetId;
  let long = base.longNoteMaterialLogicalAssetId;
  let curve = base.curveNoteMaterialLogicalAssetId;
  let directional = base.directionalAtlasLogicalAssetId;
  let left = base.multipleDirectionalLineLeftLogicalAssetId;
  let right = base.multipleDirectionalLineRightLogicalAssetId;
  if (base.ordinaryVisible === undefined) return invalid("simulator.skin.render-visible-bindings");
  let ordinaryVisible: NonNullable<RenderEngineResourceBindings["ordinaryVisible"]> = base.ordinaryVisible;
  const effectAssets = assets.get(recipe.tapEffect.logicalResource ?? "");
  const productJudgementEffectLogicalAssetId = effectAssets === undefined
    ? undefined
    : effectAssets.get("effect_circle") ?? effectAssets.get("Default-Particle") ??
      effectAssets.get("Default-ParticleSystem") ?? effectAssets.values().next().value;
  if (effectAssets !== undefined &&
    (typeof productJudgementEffectLogicalAssetId !== "string" || productJudgementEffectLogicalAssetId.length === 0)) {
    return invalid("simulator.skin.product-effect-binding");
  }
  const noteAssets = assets.get(recipe.note.logicalResource!);
  const directionalAssets = assets.get(recipe.directional.noteLogicalResource);
  const judgeAssets = assets.get(recipe.judge.logicalResource!);
  if (recipe.chartMode === "ordinary") {
    note = noteAssets?.get("RhythmGameSprites") ?? "";
    sync = noteAssets?.get("simultaneous_line") ?? "";
    long = noteAssets?.get("longNoteLine") ?? "";
    curve = noteAssets?.get("longNoteLine2") ?? "";
    directional = directionalAssets?.get("DirectionalFlickSprites") ?? "";
    left = directionalAssets?.get("FlickNoteLine_l") ?? "";
    right = directionalAssets?.get("FlickNoteLine_r") ?? "";
    const judge = judgeAssets?.get("Judge") ?? "";
    if ([note, sync, long, curve, directional, left, right, judge].some((value) => value.length === 0)) {
      return invalid("simulator.skin.render-required-binding");
    }
    ordinaryVisible = Object.freeze({
      comboNumberLogicalAssetId: base.ordinaryVisible.comboNumberLogicalAssetId,
      judgeLogicalAssetId: judge,
      lifeAdditiveLogicalAssetId: base.ordinaryVisible.lifeAdditiveLogicalAssetId,
      warningLogicalAssetId: base.ordinaryVisible.warningLogicalAssetId,
      tapLaneEffectLogicalAssetIds: base.ordinaryVisible.tapLaneEffectLogicalAssetIds,
    });
  } else {
    note = noteAssets?.get("RhythmGameSprites1") ?? "";
    sync = noteAssets?.get("simultaneous_line") ?? "";
    long = noteAssets?.get("longNoteLine") ?? "";
    curve = noteAssets?.get("longNoteLine2") ?? "";
    directional = directionalAssets?.get("DirectionalFlickSprites") ?? "";
    left = directionalAssets?.get("FlickNoteLine_l") ?? "";
    right = directionalAssets?.get("FlickNoteLine_r") ?? "";
    const judge = judgeAssets?.get("Judge") ?? "";
    const habahiro = {
      normal: noteAssets?.get("RhythmGameSprites1") ?? "",
      normal16: noteAssets?.get("RhythmGameSprites16") ?? "",
      skill: noteAssets?.get("RhythmGameSprites2") ?? "",
      flick: noteAssets?.get("RhythmGameSprites3") ?? "",
      long: noteAssets?.get("RhythmGameSprites4") ?? "",
      longFlash: noteAssets?.get("RhythmGameSprites5") ?? "",
      slideAmong: noteAssets?.get("RhythmGameSprites1") ?? "",
    };
    if ([note, sync, long, curve, directional, left, right, judge, ...Object.values(habahiro)].some((value) => value.length === 0)) {
      return invalid("simulator.skin.render-habahiro-required-binding");
    }
    ordinaryVisible = Object.freeze({ ...base.ordinaryVisible, judgeLogicalAssetId: judge });
    return accepted(Object.freeze({
      ...base,
      noteAtlasLogicalAssetId: note,
      syncLineLogicalAssetId: sync,
      longNoteMaterialLogicalAssetId: long,
      curveNoteMaterialLogicalAssetId: curve,
      directionalAtlasLogicalAssetId: directional,
      multipleDirectionalLineLeftLogicalAssetId: left,
      multipleDirectionalLineRightLogicalAssetId: right,
      ordinaryVisible,
      habahiroAtlasLogicalAssetIds: Object.freeze(habahiro),
      ...(productJudgementEffectLogicalAssetId === undefined ? {} : { productJudgementEffectLogicalAssetId }),
    }));
  }
  return accepted(Object.freeze({
    ...base,
    noteAtlasLogicalAssetId: note,
    syncLineLogicalAssetId: sync,
    longNoteMaterialLogicalAssetId: long,
    curveNoteMaterialLogicalAssetId: curve,
    directionalAtlasLogicalAssetId: directional,
    multipleDirectionalLineLeftLogicalAssetId: left,
    multipleDirectionalLineRightLogicalAssetId: right,
    ordinaryVisible,
    ...(productJudgementEffectLogicalAssetId === undefined
      ? {}
      : { productJudgementEffectLogicalAssetId }),
  }));
}

function role(packRole: PreparedSkinSourcePackage["role"], name: string): RenderResourceAssetProfile["role"] {
  if (packRole === "notes") return name === "RhythmGameSprites" ? "note-atlas" : "material-texture";
  if (packRole === "directional-note") return name === "DirectionalFlickSprites" ? "directional-atlas" : "material-texture";
  if (packRole === "judge") return "judge-atlas";
  if (packRole === "field") return "field-atlas";
  return "material-texture";
}

function materialRole(
  packRole: PreparedSkinSourcePackage["role"],
  name: string,
): RenderResourceAssetProfile["materialRole"] {
  if (packRole === "tap-effect" || packRole === "directional-effect") return "curve-note";
  if (name === "longNoteLine") return "long-note";
  if (name === "longNoteLine2") return "curve-note";
  if (name === "simultaneous_line") return "sync-line";
  if (name.startsWith("FlickNoteLine_")) return "multiple-directional-line";
  return "sprite";
}

function pathId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "string" && /^int64:-?[0-9]+$/.test(value)) return value.slice(6);
  return null;
}

function valueRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}
function invalid<T>(capability: string): SimulatorAssemblyResult<T> {
  return rejected("resource-integrity", capability, "Selected Skin render packs must preserve every texture, atlas row, Float32 geometry and required binding without fallback.");
}
function accepted<T>(value: T): SimulatorAssemblyResult<T> {
  return Object.freeze({ status: "accepted" as const, value });
}
