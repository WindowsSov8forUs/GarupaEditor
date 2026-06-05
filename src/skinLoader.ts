import directionalTypeRipMapJson from "./data/directional-type-rip-map.json";
import directionalSeTypeRipMapJson from "./data/directional-se-type-rip-map.json";
import bgTypeRipMapJson from "./data/bg-type-rip-map.json";
import fieldTypeRipMapJson from "./data/field-type-rip-map.json";
import judgeRipFilesMapJson from "./data/judge-rip-files-map.json";
import judgeTypeRipMapJson from "./data/judge-type-rip-map.json";
import habahiroTypeRipMapJson from "./data/habahiro-type-rip-map.json";
import rhythmTypeRipMapJson from "./data/rhythm-type-rip-map.json";
import rhythmSeTypeRipMapJson from "./data/rhythm-se-type-rip-map.json";
import {
  extractNamedSpritesFromAsset,
  extractNamedSprites,
  parseAssetJsonOrThrow,
  parseBundleJsonOrThrow,
  parseSpritesJsonOrThrow,
  type AssetManifest,
  type BundleManifest,
  type SpriteManifest,
} from "./noteSkinAssetTool";
import {
  type JudgeSkinFileEntry,
  type BestdoriAssetServer,
  DEFAULT_BESTDORI_ASSET_SERVER,
  prepareBestdoriBgSkinAssets,
  prepareBestdoriCommonSoundAssets,
  prepareBestdoriFieldSkinAssets,
  prepareBestdoriJudgeSkinAssets,
  prepareBestdoriSkinAssets,
  prepareBestdoriTapseskinAssets,
  normalizeBestdoriAssetServer,
  readJudgeSkinTextFile,
  readSkinTextFile,
} from "./services/bestdori/api";
import {
  buildFallbackBestdoriSkinCatalogOptions,
  loadBestdoriSkinCatalogOptions as loadBestdoriSkinCatalogOptionsFromService,
  type BestdoriCatalogKind,
  type BestdoriSkinCatalogOptions,
} from "./services/bestdori/catalog";
export type { BestdoriSkinCatalogOptions } from "./services/bestdori/catalog";
import {
  ensureCommonTapSkillSeDataUrl,
  loadPreparedBgSkinBinaryFilesAsDataUrlMap,
  loadPreparedCommonSoundBinaryFilesAsDataUrlMap,
  loadPreparedFieldSkinBinaryFilesAsDataUrlMap,
  loadPreparedJudgeSkinBinaryFilesAsDataUrlMap,
  loadPreparedSkinBinaryFilesAsDataUrlMap,
  loadPreparedSoundBinaryFilesAsDataUrlMap,
  normalizeLowercaseFileMap,
} from "./services/bestdori/resourceFlows";

const RIP_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

type TypeRipMapEntry = {
  type: string;
  ripName: string;
};

const RHYTHM_TYPE_RIP_ENTRIES = rhythmTypeRipMapJson as TypeRipMapEntry[];
const DIRECTIONAL_TYPE_RIP_ENTRIES = directionalTypeRipMapJson as TypeRipMapEntry[];
const RHYTHM_SE_TYPE_RIP_ENTRIES = rhythmSeTypeRipMapJson as TypeRipMapEntry[];
const DIRECTIONAL_SE_TYPE_RIP_ENTRIES = directionalSeTypeRipMapJson as TypeRipMapEntry[];
const HABAHIRO_TYPE_RIP_ENTRIES = habahiroTypeRipMapJson as TypeRipMapEntry[];
const BG_TYPE_RIP_ENTRIES = bgTypeRipMapJson as TypeRipMapEntry[];
const FIELD_TYPE_RIP_ENTRIES = fieldTypeRipMapJson as TypeRipMapEntry[];
const JUDGE_TYPE_RIP_ENTRIES = judgeTypeRipMapJson as TypeRipMapEntry[];
const JUDGE_SKIN_FILES_BY_RIP = judgeRipFilesMapJson as Record<string, string[]>;

const DEFAULT_HABAHIRO_TYPE = HABAHIRO_TYPE_RIP_ENTRIES[0]?.type ?? "2026\u611A\u4EBA\u8282";
const DEFAULT_HABAHIRO_RIP_NAME = HABAHIRO_TYPE_RIP_ENTRIES[0]?.ripName ?? "habahiro";
export const HABAHIRO_RHYTHM_TYPE = DEFAULT_HABAHIRO_TYPE;
export const HABAHIRO_RHYTHM_RIP_NAME = DEFAULT_HABAHIRO_RIP_NAME;

export const RHYTHM_SKIN_TYPES: readonly string[] = Object.freeze(
  RHYTHM_TYPE_RIP_ENTRIES.map((entry) => entry.type),
);
export const DIRECTIONAL_SKIN_TYPES: readonly string[] = Object.freeze(
  DIRECTIONAL_TYPE_RIP_ENTRIES.map((entry) => entry.type),
);
export const RHYTHM_SE_SKIN_TYPES: readonly string[] = Object.freeze(
  RHYTHM_SE_TYPE_RIP_ENTRIES.map((entry) => entry.type),
);
export const DIRECTIONAL_SE_SKIN_TYPES: readonly string[] = Object.freeze(
  DIRECTIONAL_SE_TYPE_RIP_ENTRIES.map((entry) => entry.type),
);
export const BG_SKIN_TYPES: readonly string[] = Object.freeze(
  BG_TYPE_RIP_ENTRIES.map((entry) => entry.type),
);
export const FIELD_SKIN_TYPES: readonly string[] = Object.freeze(
  FIELD_TYPE_RIP_ENTRIES.map((entry) => entry.type),
);
export const JUDGE_SKIN_TYPES: readonly string[] = Object.freeze(
  JUDGE_TYPE_RIP_ENTRIES.map((entry) => entry.type),
);
export const HABAHIRO_RHYTHM_SKIN_TYPES: readonly string[] = Object.freeze(
  HABAHIRO_TYPE_RIP_ENTRIES.length > 0
    ? HABAHIRO_TYPE_RIP_ENTRIES.map((entry) => entry.type)
    : [DEFAULT_HABAHIRO_TYPE],
);

const DEFAULT_RHYTHM_TYPE = RHYTHM_SKIN_TYPES[0] ?? "TYPE1";
const DEFAULT_DIRECTIONAL_TYPE = DIRECTIONAL_SKIN_TYPES[0] ?? "TYPE1";
const DEFAULT_RHYTHM_SE_TYPE = RHYTHM_SE_SKIN_TYPES[0] ?? "TYPE1";
const DEFAULT_DIRECTIONAL_SE_TYPE = DIRECTIONAL_SE_SKIN_TYPES[0] ?? "TYPE1";
const DEFAULT_BG_TYPE = BG_SKIN_TYPES[0] ?? "TYPE1";
const DEFAULT_FIELD_TYPE = FIELD_SKIN_TYPES[0] ?? "TYPE1";
const DEFAULT_JUDGE_TYPE = JUDGE_SKIN_TYPES[0] ?? "TYPE1";

const RHYTHM_TYPE_TO_RIP_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    RHYTHM_TYPE_RIP_ENTRIES.map((entry) => [entry.type, entry.ripName]),
  ),
);

const DIRECTIONAL_TYPE_TO_RIP_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    DIRECTIONAL_TYPE_RIP_ENTRIES.map((entry) => [entry.type, entry.ripName]),
  ),
);

const RHYTHM_SE_TYPE_TO_RIP_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    RHYTHM_SE_TYPE_RIP_ENTRIES.map((entry) => [entry.type, entry.ripName]),
  ),
);

const DIRECTIONAL_SE_TYPE_TO_RIP_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    DIRECTIONAL_SE_TYPE_RIP_ENTRIES.map((entry) => [entry.type, entry.ripName]),
  ),
);

const BG_TYPE_TO_RIP_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    BG_TYPE_RIP_ENTRIES.map((entry) => [entry.type, entry.ripName]),
  ),
);

const HABAHIRO_TYPE_TO_RIP_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    HABAHIRO_TYPE_RIP_ENTRIES.map((entry) => [entry.type, entry.ripName]),
  ),
);
const FIELD_TYPE_TO_RIP_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    FIELD_TYPE_RIP_ENTRIES.map((entry) => [entry.type, entry.ripName]),
  ),
);
const JUDGE_TYPE_TO_RIP_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    JUDGE_TYPE_RIP_ENTRIES.map((entry) => [entry.type, entry.ripName]),
  ),
);

let activeBestdoriSkinCatalogOptions: BestdoriSkinCatalogOptions = buildFallbackBestdoriSkinCatalogOptions();

export function activateBestdoriSkinCatalogOptions(options: BestdoriSkinCatalogOptions): void {
  activeBestdoriSkinCatalogOptions = options;
}

export async function loadBestdoriSkinCatalogOptions(): Promise<BestdoriSkinCatalogOptions> {
  const options = await loadBestdoriSkinCatalogOptionsFromService();
  activateBestdoriSkinCatalogOptions(options);
  return options;
}

function resolveCatalogResource(kind: BestdoriCatalogKind, value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  return activeBestdoriSkinCatalogOptions.resources[kind]?.[normalized] ?? null;
}

function resolveCatalogResourceId(kind: BestdoriCatalogKind, value: string): string | null {
  return resolveCatalogResource(kind, value)?.id ?? null;
}

function resolveCatalogResourceServer(kind: BestdoriCatalogKind, value: string): BestdoriAssetServer | null {
  return resolveCatalogResource(kind, value)?.server ?? null;
}

export type SkinNoteType =
  | "single"
  | "single16"
  | "flick"
  | "skill"
  | "directional_flick_left"
  | "directional_flick_right"
  | "slide"
  | "slide_among";

// Lane-keyed note assets: key "0".."6" corresponds to lane 0..6.
type NoteAssetLane = "0" | "1" | "2" | "3" | "4" | "5" | "6";
type NoteAssets = Record<NoteAssetLane, string>;

export type HabahiroNoteAssetKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "0_1"
  | "1_2"
  | "2_3"
  | "3_4"
  | "4_5"
  | "5_6"
  | "0_1_2"
  | "1_2_3"
  | "2_3_4"
  | "3_4_5"
  | "4_5_6"
  | "0_1_2_3"
  | "1_2_3_4"
  | "2_3_4_5"
  | "3_4_5_6"
  | "0_1_2_3_4"
  | "1_2_3_4_5"
  | "2_3_4_5_6"
  | "0_1_2_3_4_5"
  | "1_2_3_4_5_6"
  | "0_1_2_3_4_5_6";

type HabahiroWidth = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type HabahiroWidthKey = `${HabahiroWidth}`;
type HabahiroFlickTopWidth = 1 | 2 | 3;
type HabahiroFlickTopWidthKey = `${HabahiroFlickTopWidth}`;
type HabahiroNoteAssets = Record<HabahiroNoteAssetKey, string>;
type HabahiroNoteFlickTopAssets = Record<HabahiroFlickTopWidthKey, string>;
type HabahiroNoteSlideAmongAssets = Record<HabahiroWidthKey, string>;
type HabahiroWidthRuntimeMap = Record<HabahiroWidth, string>;
type HabahiroFlickTopWidthRuntimeMap = Record<HabahiroFlickTopWidth, string>;

interface RhythmAssets {
  noteNormal: NoteAssets;
  noteNormal16: NoteAssets;
  noteSkill: NoteAssets;
  noteFlick: NoteAssets;
  noteFlickTop: string;
  noteLong: NoteAssets;
  noteLongFlash: NoteAssets;
  noteSlideAmong: string;
  longNoteLine: string;
  longNoteLine2: string;
  simultaneousLine: string;
}

interface HabahiroRhythmAssets {
  noteNormal: HabahiroNoteAssets;
  noteNormal16: HabahiroNoteAssets;
  noteSkill: HabahiroNoteAssets;
  noteFlick: HabahiroNoteAssets;
  noteFlickTop: HabahiroNoteFlickTopAssets;
  noteLong: HabahiroNoteAssets;
  noteLongFlash: HabahiroNoteAssets;
  noteSlideAmong: HabahiroNoteSlideAmongAssets;
  longNoteLine: string;
  longNoteLine2: string;
  simultaneousLine: string;
}

interface RhythmSampleAssets {
  NoteNormal3: string;
  NoteSkill3: string;
  NoteFlick3: string;
  NoteFlickTop: string;
  NoteLong3: string;
  NoteSlideAmong: string;
}

interface DirectionalAssets {
  noteFlickL: NoteAssets;
  noteFlickR: NoteAssets;
  noteFlickTopL: string;
  noteFlickTopR: string;
  flickNoteLineL: string;
  flickNoteLineR: string;
}

interface DirectionalSampleAssets {
  NoteFlickL3: string;
  NoteFlickR3: string;
}

interface NoteSkinAssets<TAssets> {
  sprites: SpriteManifest;
  bundle: BundleManifest;
  assets: TAssets;
}

interface NoteSkinSampleAssets<TSampleAssets> {
  bundle: BundleManifest;
  assets: TSampleAssets;
}

interface NoteSkin<TAssets, TSampleAssets> {
  assets: NoteSkinAssets<TAssets>;
  sample: NoteSkinSampleAssets<TSampleAssets>;
}

export interface RhythmSeSkinAssets {
  perfect: string;
  flick: string;
}

export interface DirectionalSeSkinAssets {
  directionalFL: Record<1 | 2 | 3, string>;
}

export interface SeSkinAssets {
  rhythm: RhythmSeSkinAssets;
  directional: DirectionalSeSkinAssets;
  tapSkill: string;
}

export interface FieldSkinAssets {
  bgLineRhythm: string;
  gamePlayLine: string;
  gamePlayLineSkillAdjustEffect: string;
}

export interface BGSkinAssets {
  liveBG: string;
  liveBGFever?: string;
}

export interface BGSkinPreview {
  previewBG: string;
}

export interface BGSkin {
  assets: BGSkinAssets;
  preview?: BGSkinPreview;
}

export interface JudgeSkinAssets {
  judgePerfect: string;
  judgeGreat: string;
  judgeGood: string;
  judgeBad: string;
  judgeMiss: string;
  judgeAuto: string;
  judgeFast: string;
  judgeSlow: string;
}

export interface JudgeSkin {
  asset: AssetManifest;
  bundle: BundleManifest;
  assets: JudgeSkinAssets;
}

export interface SkinSelection {
  rhythmType: string;
  directionalType: string;
  rhythmSeType: string;
  directionalSeType: string;
  bgType: string;
  fieldType: string;
  judgeType: string;
  rhythmRipName: string;
  directionalRipName: string;
  rhythmSeRipName: string;
  directionalSeRipName: string;
  bgSkinRipName: string;
  fieldSkinRipName: string;
  judgeSkinRipName: string;
  rhythmServer: BestdoriAssetServer;
  directionalServer: BestdoriAssetServer;
  rhythmSeServer: BestdoriAssetServer;
  directionalSeServer: BestdoriAssetServer;
  bgSkinServer: BestdoriAssetServer;
  fieldSkinServer: BestdoriAssetServer;
  judgeSkinServer: BestdoriAssetServer;
}

type AnyRhythmAssets = RhythmAssets | HabahiroRhythmAssets;

export type RhythmSkinAssets<
  TAssets extends AnyRhythmAssets = RhythmAssets,
  TSampleAssets extends RhythmSampleAssets = RhythmSampleAssets,
> = NoteSkin<TAssets, TSampleAssets>;
export type HabahiroRhythmSkinAssets = RhythmSkinAssets<HabahiroRhythmAssets, RhythmSampleAssets>;
export type AnyRhythmSkinAssets = RhythmSkinAssets | HabahiroRhythmSkinAssets;
export type DirectionalSkinAssets<
  TAssets extends DirectionalAssets = DirectionalAssets,
  TSampleAssets extends DirectionalSampleAssets = DirectionalSampleAssets,
> = NoteSkin<TAssets, TSampleAssets>;

export interface SkinAssets<
  TRhythmSkin extends RhythmSkinAssets = RhythmSkinAssets,
  TDirectionalSkin extends DirectionalSkinAssets = DirectionalSkinAssets,
> {
  rhythm: TRhythmSkin;
  directional: TDirectionalSkin;
}

interface NotePaletteRuntimeAssets {
  single: string;
  flick: string;
  skill: string;
  slide: string;
  directionalFlickLeft: string;
  directionalFlickRight: string;
  flickTop: string;
}

interface BasePlayfieldSpriteRuntimeAssets {
  single: string;
  single16: string;
  flick: string;
  skill: string;
  slide: string;
  slideAmong: string;
  directionalFlickLeft: string;
  directionalFlickRight: string;
  flickTop: string;
  directionalFlickLeftTop: string;
  directionalFlickRightTop: string;
}

export interface HabahiroPlayfieldSpriteRuntimeAssets extends BasePlayfieldSpriteRuntimeAssets {
  habahiro: true;
  singleByWidth: HabahiroWidthRuntimeMap;
  single16ByWidth: HabahiroWidthRuntimeMap;
  flickByWidth: HabahiroWidthRuntimeMap;
  skillByWidth: HabahiroWidthRuntimeMap;
  slideByWidth: HabahiroWidthRuntimeMap;
  slideAmongByWidth: HabahiroWidthRuntimeMap;
  flickTopByWidth: HabahiroFlickTopWidthRuntimeMap;
}

interface DefaultPlayfieldSpriteRuntimeAssets extends BasePlayfieldSpriteRuntimeAssets {
  habahiro?: false;
}

type PlayfieldSpriteRuntimeAssets =
  | DefaultPlayfieldSpriteRuntimeAssets
  | HabahiroPlayfieldSpriteRuntimeAssets;

interface PlayfieldLineRuntimeAssets {
  longLine: string;
  longLineSpecial: string;
  simultaneousLine: string;
}

export type CanvasRenderResourceRuntimeAssets = PlayfieldSpriteRuntimeAssets & {
  longLine: string;
  longLineSpecial: string;
  simultaneousLine: string;
};

type DownloadProgressOptions = {
  operationId?: string;
};

let runtimeSeAssets: SeSkinAssets | null = null;
let runtimeFieldSkinAssets: FieldSkinAssets | null = null;
let runtimeBgSkinAssets: BGSkin | null = null;
let runtimeJudgeSkinAssets: JudgeSkin | null = null;

export function resolveRhythmRipNameFromType(
  typeValue: string,
): string | null {
  const trimmed = typeValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const catalogId = resolveCatalogResourceId("rhythm", trimmed) ?? resolveCatalogResourceId("habahiroRhythm", trimmed);
  if (catalogId) {
    return catalogId;
  }
  const mappedRaw = RHYTHM_TYPE_TO_RIP_NAME[trimmed];
  if (typeof mappedRaw === "string" && mappedRaw.length > 0 && RIP_NAME_PATTERN.test(mappedRaw)) {
    return mappedRaw;
  }
  return RIP_NAME_PATTERN.test(trimmed) ? trimmed : null;
}

export function resolveDirectionalRipNameFromType(
  typeValue: string,
): string | null {
  const trimmed = typeValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const catalogId = resolveCatalogResourceId("directional", trimmed);
  if (catalogId) {
    return catalogId;
  }
  const mappedRaw = DIRECTIONAL_TYPE_TO_RIP_NAME[trimmed];
  if (typeof mappedRaw === "string" && mappedRaw.length > 0 && RIP_NAME_PATTERN.test(mappedRaw)) {
    return mappedRaw;
  }
  return RIP_NAME_PATTERN.test(trimmed) ? trimmed : null;
}

export function resolveRhythmSeRipNameFromType(
  typeValue: string,
): string | null {
  const trimmed = typeValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const catalogId = resolveCatalogResourceId("rhythmSe", trimmed);
  if (catalogId) {
    return catalogId;
  }
  const mappedRaw = RHYTHM_SE_TYPE_TO_RIP_NAME[trimmed];
  if (typeof mappedRaw === "string" && mappedRaw.length > 0 && RIP_NAME_PATTERN.test(mappedRaw)) {
    return mappedRaw;
  }
  return RIP_NAME_PATTERN.test(trimmed) ? trimmed : null;
}

export function resolveDirectionalSeRipNameFromType(
  typeValue: string,
): string | null {
  const trimmed = typeValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const catalogId = resolveCatalogResourceId("directionalSe", trimmed);
  if (catalogId) {
    return catalogId;
  }
  const mappedRaw = DIRECTIONAL_SE_TYPE_TO_RIP_NAME[trimmed];
  if (typeof mappedRaw === "string" && mappedRaw.length > 0 && RIP_NAME_PATTERN.test(mappedRaw)) {
    return mappedRaw;
  }
  return RIP_NAME_PATTERN.test(trimmed) ? trimmed : null;
}

export function resolveBgSkinRipNameFromType(
  typeValue: string,
): string | null {
  const trimmed = typeValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const catalogId = resolveCatalogResourceId("bg", trimmed);
  if (catalogId) {
    return catalogId;
  }
  const mappedRaw = BG_TYPE_TO_RIP_NAME[trimmed];
  if (typeof mappedRaw === "string" && mappedRaw.length > 0 && RIP_NAME_PATTERN.test(mappedRaw)) {
    return mappedRaw;
  }
  return RIP_NAME_PATTERN.test(trimmed) ? trimmed : null;
}

export function resolveFieldSkinRipNameFromType(
  typeValue: string,
): string | null {
  const trimmed = typeValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const catalogId = resolveCatalogResourceId("field", trimmed);
  if (catalogId) {
    return catalogId;
  }
  const mappedRaw = FIELD_TYPE_TO_RIP_NAME[trimmed];
  if (typeof mappedRaw === "string" && mappedRaw.length > 0 && RIP_NAME_PATTERN.test(mappedRaw)) {
    return mappedRaw;
  }
  return RIP_NAME_PATTERN.test(trimmed) ? trimmed : null;
}

export function resolveJudgeSkinRipNameFromType(
  typeValue: string,
): string | null {
  const trimmed = typeValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const mappedRaw = JUDGE_TYPE_TO_RIP_NAME[trimmed];
  if (typeof mappedRaw === "string" && mappedRaw.length > 0 && RIP_NAME_PATTERN.test(mappedRaw)) {
    return mappedRaw;
  }
  return RIP_NAME_PATTERN.test(trimmed) ? trimmed : null;
}

export function resolveHabahiroRhythmRipNameFromType(
  typeValue: string,
): string | null {
  const trimmed = typeValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const catalogId = resolveCatalogResourceId("habahiroRhythm", trimmed);
  if (catalogId) {
    return catalogId;
  }
  const mappedRaw = HABAHIRO_TYPE_TO_RIP_NAME[trimmed];
  if (typeof mappedRaw === "string" && mappedRaw.length > 0 && RIP_NAME_PATTERN.test(mappedRaw)) {
    return mappedRaw;
  }
  return null;
}

export function isHabahiroRhythmRipName(ripName: string): boolean {
  return ripName.trim().toLowerCase() === HABAHIRO_RHYTHM_RIP_NAME;
}

export function resolveRhythmServerFromType(typeValue: string): BestdoriAssetServer | null {
  return resolveCatalogResourceServer("rhythm", typeValue) ?? resolveCatalogResourceServer("habahiroRhythm", typeValue);
}

export function resolveDirectionalServerFromType(typeValue: string): BestdoriAssetServer | null {
  return resolveCatalogResourceServer("directional", typeValue);
}

export function resolveRhythmSeServerFromType(typeValue: string): BestdoriAssetServer | null {
  return resolveCatalogResourceServer("rhythmSe", typeValue);
}

export function resolveDirectionalSeServerFromType(typeValue: string): BestdoriAssetServer | null {
  return resolveCatalogResourceServer("directionalSe", typeValue);
}

export function resolveBgSkinServerFromType(typeValue: string): BestdoriAssetServer | null {
  return resolveCatalogResourceServer("bg", typeValue);
}

export function resolveFieldSkinServerFromType(typeValue: string): BestdoriAssetServer | null {
  return resolveCatalogResourceServer("field", typeValue);
}

function resolveRhythmSampleRipName(rhythmRipName: string): string {
  if (isHabahiroRhythmRipName(rhythmRipName)) {
    return `${rhythmRipName}_sample`;
  }
  return `${rhythmRipName}sample`;
}

function buildRhythmSampleBundleFileName(rhythmRipName: string): string {
  return `ingameskin-noteskin-${resolveRhythmSampleRipName(rhythmRipName)}.bundle`;
}

function resolvePreparedFilePath(
  fileMap: Record<string, string>,
  fileName: string,
): string {
  const resolved = fileMap[fileName.toLowerCase()];
  if (!resolved) {
    throw new Error(`prepared skin file missing: ${fileName}`);
  }
  return resolved;
}

export const DEFAULT_SKIN_SELECTION: SkinSelection = {
  rhythmType: DEFAULT_RHYTHM_TYPE,
  directionalType: DEFAULT_DIRECTIONAL_TYPE,
  rhythmSeType: DEFAULT_RHYTHM_SE_TYPE,
  directionalSeType: DEFAULT_DIRECTIONAL_SE_TYPE,
  bgType: DEFAULT_BG_TYPE,
  fieldType: DEFAULT_FIELD_TYPE,
  judgeType: DEFAULT_JUDGE_TYPE,
  rhythmRipName: resolveRhythmRipNameFromType(DEFAULT_RHYTHM_TYPE) ?? "skin00",
  directionalRipName: resolveDirectionalRipNameFromType(DEFAULT_DIRECTIONAL_TYPE) ?? "directionalflickskin00",
  rhythmSeRipName: resolveRhythmSeRipNameFromType(DEFAULT_RHYTHM_SE_TYPE) ?? "skin00",
  directionalSeRipName: resolveDirectionalSeRipNameFromType(DEFAULT_DIRECTIONAL_SE_TYPE) ?? "directionalflickskin00",
  bgSkinRipName: resolveBgSkinRipNameFromType(DEFAULT_BG_TYPE) ?? "skin00",
  fieldSkinRipName: resolveFieldSkinRipNameFromType(DEFAULT_FIELD_TYPE) ?? "skin00",
  judgeSkinRipName: resolveJudgeSkinRipNameFromType(DEFAULT_JUDGE_TYPE) ?? "skin00",
  rhythmServer: DEFAULT_BESTDORI_ASSET_SERVER,
  directionalServer: DEFAULT_BESTDORI_ASSET_SERVER,
  rhythmSeServer: DEFAULT_BESTDORI_ASSET_SERVER,
  directionalSeServer: DEFAULT_BESTDORI_ASSET_SERVER,
  bgSkinServer: DEFAULT_BESTDORI_ASSET_SERVER,
  fieldSkinServer: DEFAULT_BESTDORI_ASSET_SERVER,
  judgeSkinServer: DEFAULT_BESTDORI_ASSET_SERVER,
};

const SKIN_SELECTION_STORAGE_KEY = "garupa-editor:bestdori-skin-selection:v2";
const LEGACY_SKIN_SELECTION_STORAGE_KEY = "garupa-editor:bestdori-skin-selection:v1";
const FIELD_SKIN_FILE_NAMES = Object.freeze({
  bgLineRhythm: "bg_line_rhythm.png",
  gamePlayLine: "game_play_line.png",
  gamePlayLineSkillAdjustEffect: "game_play_line_skill_adjust_effect.png",
});
const BG_SKIN_FILE_NAMES = Object.freeze({
  liveBG: "liveBG.png",
  liveBGNormal: "liveBG_normal.png",
  liveBGFever: "liveBG_fever.png",
  previewBG: "previewBG.png",
});
const JUDGE_SKIN_FILE_NAMES = Object.freeze({
  asset: "judge.asset",
  bundle: "judge.bundle",
  atlas: "judge.png",
  judgePerfect: "judge_perfect",
  judgeGreat: "judge_great",
  judgeGood: "judge_good",
  judgeBad: "judge_bad",
  judgeMiss: "judge_miss",
  judgeAuto: "judge_auto",
  judgeFast: "judge_fast",
  judgeSlow: "judge_slow",
});

const NOTE_ASSET_LANES: NoteAssetLane[] = ["0", "1", "2", "3", "4", "5", "6"];
const HABAHIRO_NOTE_ASSET_KEYS: readonly HabahiroNoteAssetKey[] = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "0_1",
  "1_2",
  "2_3",
  "3_4",
  "4_5",
  "5_6",
  "0_1_2",
  "1_2_3",
  "2_3_4",
  "3_4_5",
  "4_5_6",
  "0_1_2_3",
  "1_2_3_4",
  "2_3_4_5",
  "3_4_5_6",
  "0_1_2_3_4",
  "1_2_3_4_5",
  "2_3_4_5_6",
  "0_1_2_3_4_5",
  "1_2_3_4_5_6",
  "0_1_2_3_4_5_6",
];
const HABAHIRO_WIDTH_VALUES: readonly HabahiroWidth[] = [1, 2, 3, 4, 5, 6, 7];
const HABAHIRO_FLICK_TOP_WIDTH_VALUES: readonly HabahiroFlickTopWidth[] = [1, 2, 3];
const HABAHIRO_WIDTH_TO_NOTE_ASSET_KEY: Readonly<Record<HabahiroWidth, HabahiroNoteAssetKey>> = Object.freeze({
  1: "3",
  2: "2_3",
  3: "2_3_4",
  4: "1_2_3_4",
  5: "1_2_3_4_5",
  6: "0_1_2_3_4_5",
  7: "0_1_2_3_4_5_6",
});

function resolveJudgeSkinFileEntryOrThrow(ripName: string): JudgeSkinFileEntry {
  const rawList = JUDGE_SKIN_FILES_BY_RIP[ripName];
  if (!Array.isArray(rawList)) {
    throw new Error(`JudgeSkin filenames not configured for ripName: ${ripName}`);
  }
  const fileList = rawList
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  const assetCandidates = fileList.filter((value) => value.toLowerCase().endsWith(".asset"));
  const bundleCandidates = fileList.filter((value) => value.toLowerCase().endsWith(".bundle"));
  const atlasCandidates = fileList.filter((value) => value.toLowerCase().endsWith(".png"));
  if (assetCandidates.length !== 1 || bundleCandidates.length !== 1 || atlasCandidates.length !== 1) {
    throw new Error(`JudgeSkin filenames invalid for ripName: ${ripName}`);
  }
  return {
    atlasFile: atlasCandidates[0],
    assetFile: assetCandidates[0],
    bundleFile: bundleCandidates[0],
  };
}

function resolveSeAssetFromFiles(
  files: Record<string, string>,
  candidates: readonly string[],
): string | null {
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    const resolved = files[normalized];
    if (typeof resolved === "string" && resolved.length > 0) {
      return resolved;
    }
  }
  return null;
}

function requireSeAssetFromFiles(
  files: Record<string, string>,
  candidates: readonly string[],
  label: string,
): string {
  const resolved = resolveSeAssetFromFiles(files, candidates);
  if (!resolved) {
    throw new Error(`SE asset missing: ${label}`);
  }
  return resolved;
}

function withRhythmSeAssets(files: Record<string, string>): RhythmSeSkinAssets {
  return {
    perfect: requireSeAssetFromFiles(files, ["perfect.mp3", "perfect.wav", "perfect.ogg"], "perfect"),
    flick: requireSeAssetFromFiles(files, ["flick.mp3", "flick.wav", "flick.ogg"], "flick"),
  };
}

function withDirectionalSeAssets(files: Record<string, string>): DirectionalSeSkinAssets {
  return {
    directionalFL: {
      1: requireSeAssetFromFiles(
        files,
        ["directional_fl.mp3", "directional_fl.wav", "directional_fl.ogg"],
        "directional_fl",
      ),
      2: requireSeAssetFromFiles(
        files,
        ["directional_fl_2.mp3", "directional_fl_2.wav", "directional_fl_2.ogg"],
        "directional_fl_2",
      ),
      3: requireSeAssetFromFiles(
        files,
        ["directional_fl_3.mp3", "directional_fl_3.wav", "directional_fl_3.ogg"],
        "directional_fl_3",
      ),
    },
  };
}

function resolveFieldAssetFromFiles(
  files: Record<string, string>,
  fileName: string,
): string | null {
  const normalized = fileName.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const resolved = files[normalized];
  if (typeof resolved === "string" && resolved.length > 0) {
    return resolved;
  }
  return null;
}

function requireFieldAssetFromFiles(
  files: Record<string, string>,
  fileName: string,
  label: string,
): string {
  const resolved = resolveFieldAssetFromFiles(files, fileName);
  if (!resolved) {
    throw new Error(`FieldSkin asset missing: ${label}`);
  }
  return resolved;
}

function withFieldSkinAssets(files: Record<string, string>): FieldSkinAssets {
  return {
    bgLineRhythm: requireFieldAssetFromFiles(files, FIELD_SKIN_FILE_NAMES.bgLineRhythm, "bgLineRhythm"),
    gamePlayLine: requireFieldAssetFromFiles(files, FIELD_SKIN_FILE_NAMES.gamePlayLine, "gamePlayLine"),
    gamePlayLineSkillAdjustEffect: requireFieldAssetFromFiles(
      files,
      FIELD_SKIN_FILE_NAMES.gamePlayLineSkillAdjustEffect,
      "gamePlayLineSkillAdjustEffect",
    ),
  };
}

function resolveBgAssetFromFiles(
  files: Record<string, string>,
  fileName: string,
): string | null {
  const normalized = fileName.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const resolved = files[normalized];
  if (typeof resolved === "string" && resolved.length > 0) {
    return resolved;
  }
  return null;
}

function resolveFirstBgAssetFromFiles(
  files: Record<string, string>,
  fileNames: readonly string[],
): string | null {
  for (const fileName of fileNames) {
    const resolved = resolveBgAssetFromFiles(files, fileName);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function withBgSkinAssets(files: Record<string, string>): BGSkinAssets {
  const liveBG = resolveFirstBgAssetFromFiles(
    files,
    [BG_SKIN_FILE_NAMES.liveBG, BG_SKIN_FILE_NAMES.liveBGNormal],
  );
  if (!liveBG) {
    throw new Error("BGSkin asset missing: liveBG");
  }
  const liveBGFever = resolveBgAssetFromFiles(files, BG_SKIN_FILE_NAMES.liveBGFever);
  return {
    liveBG,
    ...(liveBGFever ? { liveBGFever } : {}),
  };
}

function withBgSkinPreview(files: Record<string, string>): BGSkinPreview | undefined {
  const previewBG = resolveBgAssetFromFiles(files, BG_SKIN_FILE_NAMES.previewBG);
  if (!previewBG) {
    return undefined;
  }
  return { previewBG };
}

function withJudgeSkinAssets(sprites: Partial<Record<string, string>>): JudgeSkinAssets {
  return {
    judgePerfect: requireSprite(sprites, JUDGE_SKIN_FILE_NAMES.judgePerfect, "JudgeSkin"),
    judgeGreat: requireSprite(sprites, JUDGE_SKIN_FILE_NAMES.judgeGreat, "JudgeSkin"),
    judgeGood: requireSprite(sprites, JUDGE_SKIN_FILE_NAMES.judgeGood, "JudgeSkin"),
    judgeBad: requireSprite(sprites, JUDGE_SKIN_FILE_NAMES.judgeBad, "JudgeSkin"),
    judgeMiss: requireSprite(sprites, JUDGE_SKIN_FILE_NAMES.judgeMiss, "JudgeSkin"),
    judgeAuto: requireSprite(sprites, JUDGE_SKIN_FILE_NAMES.judgeAuto, "JudgeSkin"),
    judgeFast: requireSprite(sprites, JUDGE_SKIN_FILE_NAMES.judgeFast, "JudgeSkin"),
    judgeSlow: requireSprite(sprites, JUDGE_SKIN_FILE_NAMES.judgeSlow, "JudgeSkin"),
  };
}

export function setRuntimeSeAssets(value: SeSkinAssets | null): void {
  runtimeSeAssets = value;
}

export function getRuntimeSeAssets(): SeSkinAssets | null {
  return runtimeSeAssets;
}

export function setRuntimeFieldSkinAssets(value: FieldSkinAssets | null): void {
  runtimeFieldSkinAssets = value;
}

export function getRuntimeFieldSkinAssets(): FieldSkinAssets | null {
  return runtimeFieldSkinAssets;
}

export function setRuntimeBgSkinAssets(value: BGSkin | null): void {
  runtimeBgSkinAssets = value;
}

export function getRuntimeBgSkinAssets(): BGSkin | null {
  return runtimeBgSkinAssets;
}

export function setRuntimeJudgeSkinAssets(value: JudgeSkin | null): void {
  runtimeJudgeSkinAssets = value;
}

export function getRuntimeJudgeSkinAssets(): JudgeSkin | null {
  return runtimeJudgeSkinAssets;
}

export async function ensureCommonTapSkillSeAsset(
  options?: DownloadProgressOptions & { server?: BestdoriAssetServer | string | null },
): Promise<string> {
  return ensureCommonTapSkillSeDataUrl(options);
}

function buildLaneMappedNoteAssetsByPrefix(
  sprites: Partial<Record<string, string>>,
  prefix: string,
  label: string,
): NoteAssets {
  const output = {} as Record<NoteAssetLane, string>;
  for (const lane of NOTE_ASSET_LANES) {
    output[lane] = requireSprite(sprites, `${prefix}_${lane}`, label);
  }
  return output as NoteAssets;
}

function requireSprite(sprites: Partial<Record<string, string>>, key: string, label: string): string {
  const value = sprites[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`${label} is missing required sprite: ${key}`);
}

function pickNoteAssetByLanePriority(
  assets: NoteAssets,
  preferredLanes: NoteAssetLane[] = ["3", "0", "1", "2", "4", "5", "6"],
): string {
  for (const lane of preferredLanes) {
    const value = assets[lane];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return assets["0"];
}

function buildHabahiroNoteAssetsByPrefix(
  sprites: Partial<Record<string, string>>,
  prefix: string,
  label: string,
): HabahiroNoteAssets {
  const output = {} as Record<HabahiroNoteAssetKey, string>;
  for (const key of HABAHIRO_NOTE_ASSET_KEYS) {
    output[key] = requireSprite(sprites, `${prefix}_${key}`, label);
  }
  return output as HabahiroNoteAssets;
}

function buildHabahiroFlickTopAssets(
  sprites: Partial<Record<string, string>>,
  label: string,
): HabahiroNoteFlickTopAssets {
  return {
    "1": requireSprite(sprites, "note_flick_top", label),
    "2": requireSprite(sprites, "note_flick_top_2", label),
    "3": requireSprite(sprites, "note_flick_top_3", label),
  };
}

function buildHabahiroSlideAmongAssets(
  sprites: Partial<Record<string, string>>,
  label: string,
): HabahiroNoteSlideAmongAssets {
  return {
    "1": requireSprite(sprites, "note_slide_among", label),
    "2": requireSprite(sprites, "note_slide_among_2", label),
    "3": requireSprite(sprites, "note_slide_among_3", label),
    "4": requireSprite(sprites, "note_slide_among_4", label),
    "5": requireSprite(sprites, "note_slide_among_5", label),
    "6": requireSprite(sprites, "note_slide_among_6", label),
    "7": requireSprite(sprites, "note_slide_among_7", label),
  };
}

function createHabahiroWidthRuntimeMap(
  assets: HabahiroNoteAssets,
): HabahiroWidthRuntimeMap {
  const output = {} as Record<HabahiroWidth, string>;
  for (const width of HABAHIRO_WIDTH_VALUES) {
    output[width] = assets[HABAHIRO_WIDTH_TO_NOTE_ASSET_KEY[width]];
  }
  return output as HabahiroWidthRuntimeMap;
}

function createHabahiroSlideAmongWidthRuntimeMap(
  assets: HabahiroNoteSlideAmongAssets,
): HabahiroWidthRuntimeMap {
  const output = {} as Record<HabahiroWidth, string>;
  for (const width of HABAHIRO_WIDTH_VALUES) {
    output[width] = assets[String(width) as HabahiroWidthKey];
  }
  return output as HabahiroWidthRuntimeMap;
}

function createHabahiroFlickTopWidthRuntimeMap(
  assets: HabahiroNoteFlickTopAssets,
): HabahiroFlickTopWidthRuntimeMap {
  const output = {} as Record<HabahiroFlickTopWidth, string>;
  for (const width of HABAHIRO_FLICK_TOP_WIDTH_VALUES) {
    output[width] = assets[String(width) as HabahiroFlickTopWidthKey];
  }
  return output as HabahiroFlickTopWidthRuntimeMap;
}

function isHabahiroRhythmAssets(
  assets: AnyRhythmAssets,
): assets is HabahiroRhythmAssets {
  return typeof (assets as { noteFlickTop?: unknown }).noteFlickTop === "object";
}

function resolveRuntimeAssetBases<
  TRhythmSkin extends RhythmSkinAssets = RhythmSkinAssets,
  TDirectionalSkin extends DirectionalSkinAssets = DirectionalSkinAssets,
>(
  skinAssets: SkinAssets<TRhythmSkin, TDirectionalSkin>,
): {
  rhythmAssets: AnyRhythmAssets;
  directionalAssets: DirectionalAssets;
  rhythmSample: RhythmSampleAssets;
  directionalSample: DirectionalSampleAssets;
} {
  return {
    rhythmAssets: skinAssets.rhythm.assets.assets,
    directionalAssets: skinAssets.directional.assets.assets,
    rhythmSample: skinAssets.rhythm.sample.assets,
    directionalSample: skinAssets.directional.sample.assets,
  };
}

export function projectNotePaletteRuntimeAssets<
  TRhythmSkin extends RhythmSkinAssets = RhythmSkinAssets,
  TDirectionalSkin extends DirectionalSkinAssets = DirectionalSkinAssets,
>(
  skinAssets: SkinAssets<TRhythmSkin, TDirectionalSkin>,
): NotePaletteRuntimeAssets {
  const { rhythmSample, directionalSample } = resolveRuntimeAssetBases(skinAssets);
  return {
    single: rhythmSample.NoteNormal3,
    flick: rhythmSample.NoteFlick3,
    skill: rhythmSample.NoteSkill3,
    slide: rhythmSample.NoteLong3,
    directionalFlickLeft: directionalSample.NoteFlickL3,
    directionalFlickRight: directionalSample.NoteFlickR3,
    flickTop: rhythmSample.NoteFlickTop,
  };
}

export function projectPlayfieldSpriteRuntimeAssets<
  TRhythmSkin extends RhythmSkinAssets = RhythmSkinAssets,
  TDirectionalSkin extends DirectionalSkinAssets = DirectionalSkinAssets,
>(
  skinAssets: SkinAssets<TRhythmSkin, TDirectionalSkin>,
): PlayfieldSpriteRuntimeAssets {
  const { rhythmAssets, directionalAssets } = resolveRuntimeAssetBases(skinAssets);
  if (isHabahiroRhythmAssets(rhythmAssets)) {
    const singleByWidth = createHabahiroWidthRuntimeMap(rhythmAssets.noteNormal);
    const single16ByWidth = createHabahiroWidthRuntimeMap(rhythmAssets.noteNormal16);
    const flickByWidth = createHabahiroWidthRuntimeMap(rhythmAssets.noteFlick);
    const skillByWidth = createHabahiroWidthRuntimeMap(rhythmAssets.noteSkill);
    const slideByWidth = createHabahiroWidthRuntimeMap(rhythmAssets.noteLong);
    const slideAmongByWidth = createHabahiroSlideAmongWidthRuntimeMap(rhythmAssets.noteSlideAmong);
    const flickTopByWidth = createHabahiroFlickTopWidthRuntimeMap(rhythmAssets.noteFlickTop);
    return {
      habahiro: true,
      single: singleByWidth[1],
      single16: single16ByWidth[1],
      flick: flickByWidth[1],
      skill: skillByWidth[1],
      slide: slideByWidth[1],
      slideAmong: slideAmongByWidth[1],
      directionalFlickLeft: pickNoteAssetByLanePriority(directionalAssets.noteFlickL),
      directionalFlickRight: pickNoteAssetByLanePriority(directionalAssets.noteFlickR),
      flickTop: flickTopByWidth[1],
      directionalFlickLeftTop: directionalAssets.noteFlickTopL,
      directionalFlickRightTop: directionalAssets.noteFlickTopR,
      singleByWidth,
      single16ByWidth,
      flickByWidth,
      skillByWidth,
      slideByWidth,
      slideAmongByWidth,
      flickTopByWidth,
    };
  }

  return {
    single: pickNoteAssetByLanePriority(rhythmAssets.noteNormal),
    single16: pickNoteAssetByLanePriority(rhythmAssets.noteNormal16),
    flick: pickNoteAssetByLanePriority(rhythmAssets.noteFlick),
    skill: pickNoteAssetByLanePriority(rhythmAssets.noteSkill),
    slide: pickNoteAssetByLanePriority(rhythmAssets.noteLong),
    slideAmong: rhythmAssets.noteSlideAmong,
    directionalFlickLeft: pickNoteAssetByLanePriority(directionalAssets.noteFlickL),
    directionalFlickRight: pickNoteAssetByLanePriority(directionalAssets.noteFlickR),
    flickTop: rhythmAssets.noteFlickTop,
    directionalFlickLeftTop: directionalAssets.noteFlickTopL,
    directionalFlickRightTop: directionalAssets.noteFlickTopR,
  };
}

export function projectPlayfieldLineRuntimeAssets<
  TRhythmSkin extends RhythmSkinAssets = RhythmSkinAssets,
  TDirectionalSkin extends DirectionalSkinAssets = DirectionalSkinAssets,
>(
  skinAssets: SkinAssets<TRhythmSkin, TDirectionalSkin>,
): PlayfieldLineRuntimeAssets {
  const { rhythmAssets } = resolveRuntimeAssetBases(skinAssets);
  return {
    longLine: rhythmAssets.longNoteLine,
    longLineSpecial: rhythmAssets.longNoteLine2,
    simultaneousLine: rhythmAssets.simultaneousLine,
  };
}

export function projectCanvasRenderResourceRuntimeAssets<
  TRhythmSkin extends RhythmSkinAssets = RhythmSkinAssets,
  TDirectionalSkin extends DirectionalSkinAssets = DirectionalSkinAssets,
>(
  skinAssets: SkinAssets<TRhythmSkin, TDirectionalSkin>,
): CanvasRenderResourceRuntimeAssets {
  const { rhythmAssets } = resolveRuntimeAssetBases(skinAssets);
  const spriteRuntime = projectPlayfieldSpriteRuntimeAssets(skinAssets);
  return {
    ...spriteRuntime,
    longLine: rhythmAssets.longNoteLine,
    longLineSpecial: rhythmAssets.longNoteLine2,
    simultaneousLine: rhythmAssets.simultaneousLine,
  };
}

export function formatTypeLabel(type: string): string {
  const trimmed = type.trim();
  if (!trimmed) {
    return "TYPE?";
  }
  return activeBestdoriSkinCatalogOptions.labels[trimmed] ?? trimmed;
}

export function readSkinSelectionFromStorage(): SkinSelection {
  if (typeof window === "undefined") {
    return DEFAULT_SKIN_SELECTION;
  }

  try {
    const raw =
      window.localStorage.getItem(SKIN_SELECTION_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_SKIN_SELECTION_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SKIN_SELECTION;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeSkinSelection({
      rhythmType: parsed.rhythmType,
      directionalType: parsed.directionalType,
      rhythmSeType: parsed.rhythmSeType,
      directionalSeType: parsed.directionalSeType,
      bgType: parsed.bgType,
      fieldType: parsed.fieldType,
      judgeType: parsed.judgeType,
      rhythmRipName: parsed.rhythmRipName,
      directionalRipName: parsed.directionalRipName,
      rhythmSeRipName: parsed.rhythmSeRipName,
      directionalSeRipName: parsed.directionalSeRipName,
      bgSkinRipName: parsed.bgSkinRipName,
      fieldSkinRipName: parsed.fieldSkinRipName,
      judgeSkinRipName: parsed.judgeSkinRipName,
      rhythmServer: parsed.rhythmServer,
      directionalServer: parsed.directionalServer,
      rhythmSeServer: parsed.rhythmSeServer,
      directionalSeServer: parsed.directionalSeServer,
      bgSkinServer: parsed.bgSkinServer,
      fieldSkinServer: parsed.fieldSkinServer,
      judgeSkinServer: parsed.judgeSkinServer,
    });
  } catch {
    return DEFAULT_SKIN_SELECTION;
  }
}

export function writeSkinSelectionToStorage(selection: SkinSelection): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SKIN_SELECTION_STORAGE_KEY, JSON.stringify(selection));
}

export function normalizeSkinSelection(
  input: Partial<{
    rhythmType: unknown;
    directionalType: unknown;
    rhythmSeType: unknown;
    directionalSeType: unknown;
    bgType: unknown;
    fieldType: unknown;
    judgeType: unknown;
    rhythmRipName: unknown;
    directionalRipName: unknown;
    rhythmSeRipName: unknown;
    directionalSeRipName: unknown;
    bgSkinRipName: unknown;
    fieldSkinRipName: unknown;
    judgeSkinRipName: unknown;
    rhythmServer: unknown;
    directionalServer: unknown;
    rhythmSeServer: unknown;
    directionalSeServer: unknown;
    bgSkinServer: unknown;
    fieldSkinServer: unknown;
    judgeSkinServer: unknown;
  }>,
): SkinSelection {
  const rhythmType =
    typeof input.rhythmType === "string" && input.rhythmType.trim().length > 0
      ? input.rhythmType.trim()
      : DEFAULT_SKIN_SELECTION.rhythmType;
  const directionalType =
    typeof input.directionalType === "string" && input.directionalType.trim().length > 0
      ? input.directionalType.trim()
      : DEFAULT_SKIN_SELECTION.directionalType;
  const rhythmSeType =
    typeof input.rhythmSeType === "string" && input.rhythmSeType.trim().length > 0
      ? input.rhythmSeType.trim()
      : DEFAULT_SKIN_SELECTION.rhythmSeType;
  const directionalSeType =
    typeof input.directionalSeType === "string" && input.directionalSeType.trim().length > 0
      ? input.directionalSeType.trim()
      : DEFAULT_SKIN_SELECTION.directionalSeType;
  const bgType =
    typeof input.bgType === "string" && input.bgType.trim().length > 0
      ? input.bgType.trim()
      : DEFAULT_SKIN_SELECTION.bgType;
  const fieldType =
    typeof input.fieldType === "string" && input.fieldType.trim().length > 0
      ? input.fieldType.trim()
      : DEFAULT_SKIN_SELECTION.fieldType;
  const judgeType =
    typeof input.judgeType === "string" && input.judgeType.trim().length > 0
      ? input.judgeType.trim()
      : DEFAULT_SKIN_SELECTION.judgeType;

  const rhythmFallbackRip =
    resolveHabahiroRhythmRipNameFromType(rhythmType)
    ?? resolveRhythmRipNameFromType(rhythmType)
    ?? DEFAULT_SKIN_SELECTION.rhythmRipName;
  const directionalFallbackRip =
    resolveDirectionalRipNameFromType(directionalType) ?? DEFAULT_SKIN_SELECTION.directionalRipName;
  const rhythmSeFallbackRip =
    resolveRhythmSeRipNameFromType(rhythmSeType) ?? DEFAULT_SKIN_SELECTION.rhythmSeRipName;
  const directionalSeFallbackRip =
    resolveDirectionalSeRipNameFromType(directionalSeType) ?? DEFAULT_SKIN_SELECTION.directionalSeRipName;
  const bgSkinFallbackRip =
    resolveBgSkinRipNameFromType(bgType) ?? DEFAULT_SKIN_SELECTION.bgSkinRipName;
  const fieldSkinFallbackRip =
    resolveFieldSkinRipNameFromType(fieldType) ?? DEFAULT_SKIN_SELECTION.fieldSkinRipName;
  const judgeSkinFallbackRip =
    resolveJudgeSkinRipNameFromType(judgeType) ?? DEFAULT_SKIN_SELECTION.judgeSkinRipName;

  const rhythmRipName =
    typeof input.rhythmRipName === "string" &&
      input.rhythmRipName.trim().length > 0 &&
      RIP_NAME_PATTERN.test(input.rhythmRipName.trim())
      ? input.rhythmRipName.trim()
      : rhythmFallbackRip;
  const directionalRipName =
    typeof input.directionalRipName === "string" &&
      input.directionalRipName.trim().length > 0 &&
      RIP_NAME_PATTERN.test(input.directionalRipName.trim())
      ? input.directionalRipName.trim()
      : directionalFallbackRip;
  const rhythmSeRipName =
    typeof input.rhythmSeRipName === "string" &&
      input.rhythmSeRipName.trim().length > 0 &&
      RIP_NAME_PATTERN.test(input.rhythmSeRipName.trim())
      ? input.rhythmSeRipName.trim()
      : rhythmSeFallbackRip;
  const directionalSeRipName =
    typeof input.directionalSeRipName === "string" &&
      input.directionalSeRipName.trim().length > 0 &&
      RIP_NAME_PATTERN.test(input.directionalSeRipName.trim())
      ? input.directionalSeRipName.trim()
      : directionalSeFallbackRip;
  const bgSkinRipName =
    typeof input.bgSkinRipName === "string" &&
      input.bgSkinRipName.trim().length > 0 &&
      RIP_NAME_PATTERN.test(input.bgSkinRipName.trim())
      ? input.bgSkinRipName.trim()
      : bgSkinFallbackRip;
  const fieldSkinRipName =
    typeof input.fieldSkinRipName === "string" &&
      input.fieldSkinRipName.trim().length > 0 &&
      RIP_NAME_PATTERN.test(input.fieldSkinRipName.trim())
      ? input.fieldSkinRipName.trim()
      : fieldSkinFallbackRip;
  const judgeSkinRipName =
    typeof input.judgeSkinRipName === "string" &&
      input.judgeSkinRipName.trim().length > 0 &&
      RIP_NAME_PATTERN.test(input.judgeSkinRipName.trim())
      ? input.judgeSkinRipName.trim()
      : judgeSkinFallbackRip;

  const rhythmServer = normalizeBestdoriAssetServer(
    typeof input.rhythmServer === "string"
      ? input.rhythmServer
      : resolveRhythmServerFromType(rhythmType),
  );
  const directionalServer = normalizeBestdoriAssetServer(
    typeof input.directionalServer === "string"
      ? input.directionalServer
      : resolveDirectionalServerFromType(directionalType),
  );
  const rhythmSeServer = normalizeBestdoriAssetServer(
    typeof input.rhythmSeServer === "string"
      ? input.rhythmSeServer
      : resolveRhythmSeServerFromType(rhythmSeType),
  );
  const directionalSeServer = normalizeBestdoriAssetServer(
    typeof input.directionalSeServer === "string"
      ? input.directionalSeServer
      : resolveDirectionalSeServerFromType(directionalSeType),
  );
  const bgSkinServer = normalizeBestdoriAssetServer(
    typeof input.bgSkinServer === "string"
      ? input.bgSkinServer
      : resolveBgSkinServerFromType(bgType),
  );
  const fieldSkinServer = normalizeBestdoriAssetServer(
    typeof input.fieldSkinServer === "string"
      ? input.fieldSkinServer
      : resolveFieldSkinServerFromType(fieldType),
  );
  const judgeSkinServer = normalizeBestdoriAssetServer(
    typeof input.judgeSkinServer === "string" ? input.judgeSkinServer : DEFAULT_BESTDORI_ASSET_SERVER,
  );

  return {
    rhythmType: rhythmRipName,
    directionalType: directionalRipName,
    rhythmSeType: rhythmSeRipName,
    directionalSeType: directionalSeRipName,
    bgType: bgSkinRipName,
    fieldType: fieldSkinRipName,
    judgeType,
    rhythmRipName,
    directionalRipName,
    rhythmSeRipName,
    directionalSeRipName,
    bgSkinRipName,
    fieldSkinRipName,
    judgeSkinRipName,
    rhythmServer,
    directionalServer,
    rhythmSeServer,
    directionalSeServer,
    bgSkinServer,
    fieldSkinServer,
    judgeSkinServer,
  };
}

export function combineSkinAssets<
  TRhythmSkin extends RhythmSkinAssets,
  TDirectionalSkin extends DirectionalSkinAssets,
>(
  rhythm: TRhythmSkin,
  directional: TDirectionalSkin,
): SkinAssets<TRhythmSkin, TDirectionalSkin> {
  return {
    rhythm,
    directional,
  };
}

export async function downloadBestdoriRhythmSkinAssets(
  selection: SkinSelection,
  options?: DownloadProgressOptions,
): Promise<AnyRhythmSkinAssets> {
  const normalized = normalizeSkinSelection(selection);
  const rhythmSampleBundleFileName = buildRhythmSampleBundleFileName(normalized.rhythmRipName);

  let rhythmAtlasFileMap: Record<string, string> | null = null;
  let rhythmSpritesManifest: SpriteManifest;
  let rhythmSpritesJson: SpriteManifest;
  let rhythmBundleJson: BundleManifest;
  let rhythmSampleBundleJson: BundleManifest;
  let longLineAssetSrc: string;
  let simultaneousLineAssetSrc: string;
  let longLineSpecialAssetSrc: string;
  let sampleAssets: {
    NoteNormal3: string;
    NoteSkill3: string;
    NoteFlick3: string;
    NoteFlickTop: string;
    NoteLong3: string;
    NoteSlideAmong: string;
  };

  const prepared = await prepareBestdoriSkinAssets(
    normalized.rhythmRipName,
    options?.operationId,
    normalized.rhythmServer,
  );
  const packageFiles = normalizeLowercaseFileMap(prepared.packageFiles);
  const samplePackageFiles = normalizeLowercaseFileMap(prepared.samplePackageFiles);

  const rhythmSpritesPath = resolvePreparedFilePath(packageFiles, ".sprites");
  const rhythmBundlePath = resolvePreparedFilePath(
    packageFiles,
    `ingameskin-noteskin-${normalized.rhythmRipName}.bundle`,
  );
  const sampleBundlePath = resolvePreparedFilePath(samplePackageFiles, rhythmSampleBundleFileName);

  const [rhythmSpritesFetchedText, rhythmBundleText, rhythmSampleBundleText, packageDataUrls, sampleDataUrls] =
    await Promise.all([
      readSkinTextFile(rhythmSpritesPath),
      readSkinTextFile(rhythmBundlePath),
      readSkinTextFile(sampleBundlePath),
      loadPreparedSkinBinaryFilesAsDataUrlMap(packageFiles),
      loadPreparedSkinBinaryFilesAsDataUrlMap(samplePackageFiles),
    ]);

  rhythmSpritesManifest = parseSpritesJsonOrThrow(rhythmSpritesFetchedText, "rhythm .sprites");
  rhythmSpritesJson = rhythmSpritesManifest;
  rhythmBundleJson = parseBundleJsonOrThrow(rhythmBundleText, "rhythm .bundle");
  rhythmSampleBundleJson = parseBundleJsonOrThrow(rhythmSampleBundleText, "rhythm sample .bundle");
  rhythmAtlasFileMap = packageDataUrls;
  longLineAssetSrc = resolvePreparedFilePath(packageDataUrls, "longNoteLine.png");
  longLineSpecialAssetSrc = resolvePreparedFilePath(packageDataUrls, "longNoteLine2.png");
  simultaneousLineAssetSrc = resolvePreparedFilePath(packageDataUrls, "simultaneous_line.png");
  sampleAssets = {
    NoteNormal3: resolvePreparedFilePath(sampleDataUrls, "note_normal_3.png"),
    NoteSkill3: resolvePreparedFilePath(sampleDataUrls, "note_skill_3.png"),
    NoteFlick3: resolvePreparedFilePath(sampleDataUrls, "note_flick_3.png"),
    NoteFlickTop: resolvePreparedFilePath(sampleDataUrls, "note_flick_top.png"),
    NoteLong3: resolvePreparedFilePath(sampleDataUrls, "note_long_3.png"),
    NoteSlideAmong: resolvePreparedFilePath(sampleDataUrls, "note_slide_among.png"),
  };

  if (!rhythmAtlasFileMap) {
    throw new Error("rhythm atlas file map is not prepared");
  }
  const rhythmSprites = await extractNamedSprites({
    filePathByName: rhythmAtlasFileMap,
    sprites: rhythmSpritesManifest,
    bundle: rhythmBundleJson,
  });
  if (isHabahiroRhythmRipName(normalized.rhythmRipName)) {
    const rhythmAssets: HabahiroRhythmAssets = {
      noteNormal: buildHabahiroNoteAssetsByPrefix(rhythmSprites, "note_normal", normalized.rhythmRipName),
      noteNormal16: buildHabahiroNoteAssetsByPrefix(rhythmSprites, "note_normal_16", normalized.rhythmRipName),
      noteSkill: buildHabahiroNoteAssetsByPrefix(rhythmSprites, "note_skill", normalized.rhythmRipName),
      noteFlick: buildHabahiroNoteAssetsByPrefix(rhythmSprites, "note_flick", normalized.rhythmRipName),
      noteFlickTop: buildHabahiroFlickTopAssets(rhythmSprites, normalized.rhythmRipName),
      noteLong: buildHabahiroNoteAssetsByPrefix(rhythmSprites, "note_long", normalized.rhythmRipName),
      noteLongFlash: buildHabahiroNoteAssetsByPrefix(rhythmSprites, "note_long_flash", normalized.rhythmRipName),
      noteSlideAmong: buildHabahiroSlideAmongAssets(rhythmSprites, normalized.rhythmRipName),
      longNoteLine: longLineAssetSrc,
      longNoteLine2: longLineSpecialAssetSrc,
      simultaneousLine: simultaneousLineAssetSrc,
    };
    return {
      assets: {
        sprites: rhythmSpritesJson,
        bundle: rhythmBundleJson,
        assets: rhythmAssets,
      },
      sample: {
        bundle: rhythmSampleBundleJson,
        assets: sampleAssets,
      },
    };
  }

  const rhythmAssets: RhythmAssets = {
    noteNormal: buildLaneMappedNoteAssetsByPrefix(rhythmSprites, "note_normal", normalized.rhythmRipName),
    noteNormal16: buildLaneMappedNoteAssetsByPrefix(rhythmSprites, "note_normal_16", normalized.rhythmRipName),
    noteSkill: buildLaneMappedNoteAssetsByPrefix(rhythmSprites, "note_skill", normalized.rhythmRipName),
    noteFlick: buildLaneMappedNoteAssetsByPrefix(rhythmSprites, "note_flick", normalized.rhythmRipName),
    noteFlickTop: requireSprite(rhythmSprites, "note_flick_top", normalized.rhythmRipName),
    noteLong: buildLaneMappedNoteAssetsByPrefix(rhythmSprites, "note_long", normalized.rhythmRipName),
    noteLongFlash: buildLaneMappedNoteAssetsByPrefix(rhythmSprites, "note_long_flash", normalized.rhythmRipName),
    noteSlideAmong: requireSprite(rhythmSprites, "note_slide_among", normalized.rhythmRipName),
    longNoteLine: longLineAssetSrc,
    longNoteLine2: longLineSpecialAssetSrc,
    simultaneousLine: simultaneousLineAssetSrc,
  };

  return {
    assets: {
      sprites: rhythmSpritesJson,
      bundle: rhythmBundleJson,
      assets: rhythmAssets,
    },
    sample: {
      bundle: rhythmSampleBundleJson,
      assets: sampleAssets,
    },
  };
}

export async function downloadBestdoriDirectionalSkinAssets(
  selection: SkinSelection,
  options?: DownloadProgressOptions,
): Promise<DirectionalSkinAssets> {
  const normalized = normalizeSkinSelection(selection);

  let directionalAtlasFileMap: Record<string, string> | null = null;
  let directionalSpritesManifest: SpriteManifest;
  let directionalSpritesJson: SpriteManifest;
  let directionalBundleJson: BundleManifest;
  let directionalSampleBundleJson: BundleManifest;
  let sampleAssets: {
    NoteFlickL3: string;
    NoteFlickR3: string;
  };
  let flickNoteLineL: string;
  let flickNoteLineR: string;

  const prepared = await prepareBestdoriSkinAssets(
    normalized.directionalRipName,
    options?.operationId,
    normalized.directionalServer,
  );
  const packageFiles = normalizeLowercaseFileMap(prepared.packageFiles);
  const samplePackageFiles = normalizeLowercaseFileMap(prepared.samplePackageFiles);

  const directionalSpritesPath = resolvePreparedFilePath(packageFiles, ".sprites");
  const directionalBundlePath = resolvePreparedFilePath(
    packageFiles,
    `ingameskin-noteskin-${normalized.directionalRipName}.bundle`,
  );
  const sampleBundlePath = resolvePreparedFilePath(
    samplePackageFiles,
    `ingameskin-noteskin-${normalized.directionalRipName}sample.bundle`,
  );
  const [directionalSpritesFetchedText, directionalBundleText, directionalSampleBundleText, packageDataUrls, sampleDataUrls] =
    await Promise.all([
      readSkinTextFile(directionalSpritesPath),
      readSkinTextFile(directionalBundlePath),
      readSkinTextFile(sampleBundlePath),
      loadPreparedSkinBinaryFilesAsDataUrlMap(packageFiles),
      loadPreparedSkinBinaryFilesAsDataUrlMap(samplePackageFiles),
    ]);

  directionalSpritesManifest = parseSpritesJsonOrThrow(directionalSpritesFetchedText, "directional .sprites");
  directionalSpritesJson = directionalSpritesManifest;
  directionalBundleJson = parseBundleJsonOrThrow(directionalBundleText, "directional .bundle");
  directionalSampleBundleJson = parseBundleJsonOrThrow(directionalSampleBundleText, "directional sample .bundle");
  directionalAtlasFileMap = packageDataUrls;
  flickNoteLineL = resolvePreparedFilePath(packageDataUrls, "FlickNoteLine_l.png");
  flickNoteLineR = resolvePreparedFilePath(packageDataUrls, "FlickNoteLine_r.png");
  sampleAssets = {
    NoteFlickL3: resolvePreparedFilePath(sampleDataUrls, "note_flick_l_3.png"),
    NoteFlickR3: resolvePreparedFilePath(sampleDataUrls, "note_flick_r_3.png"),
  };

  if (!directionalAtlasFileMap) {
    throw new Error("directional atlas file map is not prepared");
  }
  const directionalSprites = await extractNamedSprites({
    filePathByName: directionalAtlasFileMap,
    sprites: directionalSpritesManifest,
    bundle: directionalBundleJson,
  });

  return {
    assets: {
      sprites: directionalSpritesJson,
      bundle: directionalBundleJson,
      assets: {
        noteFlickL: buildLaneMappedNoteAssetsByPrefix(directionalSprites, "note_flick_l", normalized.directionalRipName),
        noteFlickR: buildLaneMappedNoteAssetsByPrefix(directionalSprites, "note_flick_r", normalized.directionalRipName),
        noteFlickTopL: requireSprite(directionalSprites, "note_flick_top_l", normalized.directionalRipName),
        noteFlickTopR: requireSprite(directionalSprites, "note_flick_top_r", normalized.directionalRipName),
        flickNoteLineL,
        flickNoteLineR,
      },
    },
    sample: {
      bundle: directionalSampleBundleJson,
      assets: sampleAssets,
    },
  };
}

export async function downloadBestdoriRhythmSeSkinAssets(
  selection: SkinSelection,
  options?: DownloadProgressOptions,
): Promise<RhythmSeSkinAssets> {
  const normalized = normalizeSkinSelection(selection);
  const ripName = normalized.rhythmSeRipName;
  const prepared = await prepareBestdoriTapseskinAssets(ripName, options?.operationId, normalized.rhythmSeServer);
  const packageFiles = normalizeLowercaseFileMap(prepared.packageFiles);
  const commonPrepared = await prepareBestdoriCommonSoundAssets(options?.operationId, normalized.rhythmSeServer);
  const files = {
    ...(await loadPreparedSoundBinaryFilesAsDataUrlMap(packageFiles)),
    ...(await loadPreparedCommonSoundBinaryFilesAsDataUrlMap(normalizeLowercaseFileMap(commonPrepared.packageFiles))),
  };
  return withRhythmSeAssets(files);
}

export async function downloadBestdoriDirectionalSeSkinAssets(
  selection: SkinSelection,
  options?: DownloadProgressOptions,
): Promise<DirectionalSeSkinAssets> {
  const normalized = normalizeSkinSelection(selection);
  const ripName = normalized.directionalSeRipName;
  const prepared = await prepareBestdoriTapseskinAssets(ripName, options?.operationId, normalized.directionalSeServer);
  const packageFiles = normalizeLowercaseFileMap(prepared.packageFiles);
  const files = await loadPreparedSoundBinaryFilesAsDataUrlMap(packageFiles);
  return withDirectionalSeAssets(files);
}

export async function downloadBestdoriFieldSkinAssets(
  ripName: string,
  options?: DownloadProgressOptions,
  server?: BestdoriAssetServer | string | null,
): Promise<FieldSkinAssets> {
  const normalizedRipName = ripName.trim();
  if (!normalizedRipName || !RIP_NAME_PATTERN.test(normalizedRipName)) {
    throw new Error("Invalid fieldskin ripName, only [a-zA-Z0-9_-] is allowed.");
  }
  const prepared = await prepareBestdoriFieldSkinAssets(normalizedRipName, options?.operationId, server);
  const packageFiles = normalizeLowercaseFileMap(prepared.packageFiles);
  const files = await loadPreparedFieldSkinBinaryFilesAsDataUrlMap(packageFiles);
  return withFieldSkinAssets(files);
}

export async function downloadBestdoriBgSkinAssets(
  ripName: string,
  options?: DownloadProgressOptions,
  server?: BestdoriAssetServer | string | null,
): Promise<BGSkin> {
  const normalizedRipName = ripName.trim();
  if (!normalizedRipName || !RIP_NAME_PATTERN.test(normalizedRipName)) {
    throw new Error("Invalid bgskin ripName, only [a-zA-Z0-9_-] is allowed.");
  }

  const prepared = await prepareBestdoriBgSkinAssets(normalizedRipName, options?.operationId, server);
  const packageFiles = normalizeLowercaseFileMap(prepared.packageFiles);
  const mainFiles = await loadPreparedBgSkinBinaryFilesAsDataUrlMap(packageFiles);

  const previewPackageFiles = prepared.previewPackageFiles
    ? normalizeLowercaseFileMap(prepared.previewPackageFiles)
    : null;
  const previewFiles = previewPackageFiles
    ? await loadPreparedBgSkinBinaryFilesAsDataUrlMap(previewPackageFiles)
    : null;
  const preview = previewFiles ? withBgSkinPreview(previewFiles) : undefined;
  return {
    assets: withBgSkinAssets(mainFiles),
    ...(preview ? { preview } : {}),
  };
}

export async function downloadBestdoriJudgeSkinAssets(
  ripName: string,
  options?: DownloadProgressOptions,
  server?: BestdoriAssetServer | string | null,
): Promise<JudgeSkin> {
  const normalizedRipName = ripName.trim();
  if (!normalizedRipName || !RIP_NAME_PATTERN.test(normalizedRipName)) {
    throw new Error("Invalid judgeskin ripName, only [a-zA-Z0-9_-] is allowed.");
  }

  let assetRaw: string;
  let bundleRaw: string;
  let atlasDataUrl: string;
  const fileEntry = resolveJudgeSkinFileEntryOrThrow(normalizedRipName);

  const prepared = await prepareBestdoriJudgeSkinAssets(normalizedRipName, options?.operationId, server);
  const packageFiles = normalizeLowercaseFileMap(prepared.packageFiles);
  const assetPath = resolvePreparedFilePath(packageFiles, fileEntry.assetFile);
  const bundlePath = resolvePreparedFilePath(packageFiles, fileEntry.bundleFile);
  assetRaw = await readJudgeSkinTextFile(assetPath);
  bundleRaw = await readJudgeSkinTextFile(bundlePath);

  const fileDataUrls = await loadPreparedJudgeSkinBinaryFilesAsDataUrlMap(packageFiles);
  atlasDataUrl = resolvePreparedFilePath(fileDataUrls, fileEntry.atlasFile);

  const assetManifest = parseAssetJsonOrThrow(assetRaw, `${normalizedRipName}:judge.asset`);
  const bundleManifest = parseBundleJsonOrThrow(bundleRaw, `${normalizedRipName}:judge.bundle`);
  const atlasKey = fileEntry.atlasFile.toLowerCase();
  const sprites = await extractNamedSpritesFromAsset({
    filePathByName: {
      [atlasKey]: atlasDataUrl,
    },
    asset: assetManifest,
    bundle: bundleManifest,
    atlasFileName: atlasKey,
    coordinateOrigin: "top-left",
  });

  return {
    asset: assetManifest,
    bundle: bundleManifest,
    assets: withJudgeSkinAssets(sprites),
  };
}

