import { invoke } from "@tauri-apps/api/core";
import directionalTypeRipMapJson from "./data/directional-type-rip-map.json";
import directionalSeTypeRipMapJson from "./data/directional-se-type-rip-map.json";
import fieldTypeRipMapJson from "./data/field-type-rip-map.json";
import habahiroTypeRipMapJson from "./data/habahiro-type-rip-map.json";
import rhythmTypeRipMapJson from "./data/rhythm-type-rip-map.json";
import rhythmSeTypeRipMapJson from "./data/rhythm-se-type-rip-map.json";
import {
  extractNamedSprites,
  parseBundleJsonOrThrow,
  parseSpritesJsonOrThrow,
  type BundleManifest,
  type SpriteManifest,
} from "./noteSkinAssetTool";

const BESTDORI_ASSET_ROOT = "https://bestdori.com/assets/jp/ingameskin/noteskin";
const BESTDORI_TAPSE_ASSET_ROOT = "https://bestdori.com/assets/jp/sound/tapseskin";
const BESTDORI_TAPSE_EXPLORER_ROOT = "https://bestdori.com/api/explorer/jp/assets/sound/tapseskin";
const BESTDORI_COMMON_SOUND_ROOT = "https://bestdori.com/assets/jp/sound/common_rip";
const BESTDORI_FIELD_SKIN_ASSET_ROOT = "https://bestdori.com/assets/jp/ingameskin/fieldskin";
const BESTDORI_FIELD_SKIN_EXPLORER_ROOT = "https://bestdori.com/api/explorer/jp/assets/ingameskin/fieldskin";
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
const FIELD_TYPE_RIP_ENTRIES = fieldTypeRipMapJson as TypeRipMapEntry[];

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
export const FIELD_SKIN_TYPES: readonly string[] = Object.freeze(
  FIELD_TYPE_RIP_ENTRIES.map((entry) => entry.type),
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
const DEFAULT_FIELD_TYPE = FIELD_SKIN_TYPES[0] ?? "TYPE1";

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

export interface SkinSelection {
  rhythmType: string;
  directionalType: string;
  rhythmSeType: string;
  directionalSeType: string;
  fieldType: string;
  rhythmRipName: string;
  directionalRipName: string;
  rhythmSeRipName: string;
  directionalSeRipName: string;
  fieldSkinRipName: string;
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

interface PreparedBestdoriSkinAssets {
  packageFiles: Record<string, string>;
  samplePackageFiles: Record<string, string>;
}

interface PreparedBestdoriTapseskinAssets {
  packageFiles: Record<string, string>;
}

interface PreparedBestdoriFieldSkinAssets {
  packageFiles: Record<string, string>;
}

type DownloadProgressOptions = {
  operationId?: string;
};

let runtimeSeAssets: SeSkinAssets | null = null;
let runtimeFieldSkinAssets: FieldSkinAssets | null = null;

export function resolveRhythmRipNameFromType(
  typeValue: string,
): string | null {
  const trimmed = typeValue.trim();
  if (trimmed.length === 0) {
    return null;
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
  const mappedRaw = DIRECTIONAL_SE_TYPE_TO_RIP_NAME[trimmed];
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
  const mappedRaw = FIELD_TYPE_TO_RIP_NAME[trimmed];
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
  const mappedRaw = HABAHIRO_TYPE_TO_RIP_NAME[trimmed];
  if (typeof mappedRaw === "string" && mappedRaw.length > 0 && RIP_NAME_PATTERN.test(mappedRaw)) {
    return mappedRaw;
  }
  return null;
}

export function isHabahiroRhythmRipName(ripName: string): boolean {
  return ripName.trim().toLowerCase() === HABAHIRO_RHYTHM_RIP_NAME;
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

function buildBestdoriAssetBase(ripName: string): string {
  return `${BESTDORI_ASSET_ROOT}/${ripName}_rip`;
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
  fieldType: DEFAULT_FIELD_TYPE,
  rhythmRipName: resolveRhythmRipNameFromType(DEFAULT_RHYTHM_TYPE) ?? "skin00",
  directionalRipName: resolveDirectionalRipNameFromType(DEFAULT_DIRECTIONAL_TYPE) ?? "directionalflickskin00",
  rhythmSeRipName: resolveRhythmSeRipNameFromType(DEFAULT_RHYTHM_SE_TYPE) ?? "skin00",
  directionalSeRipName: resolveDirectionalSeRipNameFromType(DEFAULT_DIRECTIONAL_SE_TYPE) ?? "directionalflickskin00",
  fieldSkinRipName: resolveFieldSkinRipNameFromType(DEFAULT_FIELD_TYPE) ?? "skin00",
};

const SKIN_SELECTION_STORAGE_KEY = "chart-editor:bestdori-skin-selection:v1";
const FIELD_SKIN_FILE_NAMES = Object.freeze({
  bgLineRhythm: "bg_line_rhythm.png",
  gamePlayLine: "game_play_line.png",
  gamePlayLineSkillAdjustEffect: "game_play_line_skill_adjust_effect.png",
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

function isTauriEnv(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const tauriWindow = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  if ("__TAURI_INTERNALS__" in tauriWindow || "__TAURI__" in tauriWindow) {
    return true;
  }
  if (typeof window.location?.protocol === "string" && window.location.protocol === "tauri:") {
    return true;
  }
  if (typeof navigator !== "undefined" && /\btauri\b/i.test(navigator.userAgent ?? "")) {
    return true;
  }
  return false;
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

async function fetchTextOrThrow(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  return response.text();
}

async function fetchBlobOrThrow(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  return response.blob();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Blob to DataURL failed."));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Blob to DataURL returned unexpected type."));
      }
    };
    reader.readAsDataURL(blob);
  });
}

function buildBestdoriTapseAssetBase(ripName: string): string {
  return `${BESTDORI_TAPSE_ASSET_ROOT}/${ripName}_rip`;
}

function buildBestdoriFieldSkinAssetBase(ripName: string): string {
  return `${BESTDORI_FIELD_SKIN_ASSET_ROOT}/${ripName}_rip`;
}

function normalizeLowercaseFileMap(fileMap: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(fileMap)) {
    normalized[name.toLowerCase()] = value;
  }
  return normalized;
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
    throw new Error(`SE 资源缺失：${label}`);
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
    throw new Error(`FieldSkin 资源缺失：${label}`);
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

function resolveMimeTypeByFileName(fileName: string): string | undefined {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith(".png")) {
    return "image/png";
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  if (normalized.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (normalized.endsWith(".wav")) {
    return "audio/wav";
  }
  if (normalized.endsWith(".ogg")) {
    return "audio/ogg";
  }
  return undefined;
}

async function loadPreparedBinaryFilesAsDataUrlMap(
  fileMap: Record<string, string>,
  commandName: "read_skin_binary_file" | "read_sound_binary_file" | "read_field_skin_binary_file",
): Promise<Record<string, string>> {
  const entries = Object.entries(fileMap);
  const loaded = await Promise.all(
    entries.map(async ([name, path]) => {
      const base64 = await invoke<string>(commandName, { path });
      const mimeType = resolveMimeTypeByFileName(name);
      const dataUrl = await blobToDataUrl(
        new Blob([decodeBase64ToArrayBuffer(base64)], mimeType ? { type: mimeType } : undefined),
      );
      return [name.toLowerCase(), dataUrl] as const;
    }),
  );
  return Object.fromEntries(loaded);
}

async function downloadWebTapseskinFiles(ripName: string): Promise<Record<string, string>> {
  const manifestText = await fetchTextOrThrow(`${BESTDORI_TAPSE_EXPLORER_ROOT}/${ripName}.json`);
  let names: string[];
  try {
    const parsed = JSON.parse(manifestText);
    if (!Array.isArray(parsed)) {
      throw new Error("manifest is not an array");
    }
    names = parsed
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Parse tapseskin manifest failed (${ripName}): ${detail}`);
  }
  const base = buildBestdoriTapseAssetBase(ripName);
  const loaded = await Promise.all(
    names.map(async (name) => {
      const blob = await fetchBlobOrThrow(`${base}/${name}`);
      const dataUrl = await blobToDataUrl(blob);
      return [name.toLowerCase(), dataUrl] as const;
    }),
  );
  return Object.fromEntries(loaded);
}

async function downloadWebFieldSkinFiles(ripName: string): Promise<Record<string, string>> {
  const manifestText = await fetchTextOrThrow(`${BESTDORI_FIELD_SKIN_EXPLORER_ROOT}/${ripName}.json`);
  let names: string[];
  try {
    const parsed = JSON.parse(manifestText);
    if (!Array.isArray(parsed)) {
      throw new Error("manifest is not an array");
    }
    names = parsed
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Parse fieldskin manifest failed (${ripName}): ${detail}`);
  }
  const nameLookup = new Map<string, string>();
  for (const name of names) {
    nameLookup.set(name.toLowerCase(), name);
  }
  const base = buildBestdoriFieldSkinAssetBase(ripName);
  const loaded = await Promise.all(
    Object.values(FIELD_SKIN_FILE_NAMES).map(async (expectedName) => {
      const actualName = nameLookup.get(expectedName.toLowerCase()) ?? expectedName;
      const blob = await fetchBlobOrThrow(`${base}/${actualName}`);
      const dataUrl = await blobToDataUrl(blob);
      return [expectedName.toLowerCase(), dataUrl] as const;
    }),
  );
  return Object.fromEntries(loaded);
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

export async function ensureCommonTapSkillSeAsset(options?: DownloadProgressOptions): Promise<string> {
  if (isTauriEnv()) {
    const path = await invoke<string>("ensure_common_sound_asset", {
      taskId: options?.operationId ?? null,
    });
    const base64 = await invoke<string>("read_sound_binary_file", { path });
    return blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(base64)], { type: "audio/mpeg" }));
  }
  const blob = await fetchBlobOrThrow(`${BESTDORI_COMMON_SOUND_ROOT}/SE_RHYTHM_TAP_SKILL.mp3`);
  return blobToDataUrl(blob);
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
  return type.trim().length > 0 ? type.trim() : "TYPE?";
}

export function readSkinSelectionFromStorage(): SkinSelection {
  if (typeof window === "undefined") {
    return DEFAULT_SKIN_SELECTION;
  }

  try {
    const raw = window.localStorage.getItem(SKIN_SELECTION_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SKIN_SELECTION;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeSkinSelection({
      rhythmType: parsed.rhythmType,
      directionalType: parsed.directionalType,
      rhythmSeType: parsed.rhythmSeType,
      directionalSeType: parsed.directionalSeType,
      fieldType: parsed.fieldType,
      rhythmRipName: parsed.rhythmRipName,
      directionalRipName: parsed.directionalRipName,
      rhythmSeRipName: parsed.rhythmSeRipName,
      directionalSeRipName: parsed.directionalSeRipName,
      fieldSkinRipName: parsed.fieldSkinRipName,
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
    fieldType: unknown;
    rhythmRipName: unknown;
    directionalRipName: unknown;
    rhythmSeRipName: unknown;
    directionalSeRipName: unknown;
    fieldSkinRipName: unknown;
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
  const fieldType =
    typeof input.fieldType === "string" && input.fieldType.trim().length > 0
      ? input.fieldType.trim()
      : DEFAULT_SKIN_SELECTION.fieldType;

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
  const fieldSkinFallbackRip =
    resolveFieldSkinRipNameFromType(fieldType) ?? DEFAULT_SKIN_SELECTION.fieldSkinRipName;

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
  const fieldSkinRipName =
    typeof input.fieldSkinRipName === "string" &&
      input.fieldSkinRipName.trim().length > 0 &&
      RIP_NAME_PATTERN.test(input.fieldSkinRipName.trim())
      ? input.fieldSkinRipName.trim()
      : fieldSkinFallbackRip;

  return {
    rhythmType,
    directionalType,
    rhythmSeType,
    directionalSeType,
    fieldType,
    rhythmRipName,
    directionalRipName,
    rhythmSeRipName,
    directionalSeRipName,
    fieldSkinRipName,
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
  const rhythmSampleRipName = resolveRhythmSampleRipName(normalized.rhythmRipName);
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

  if (isTauriEnv()) {
    const prepared = await invoke<PreparedBestdoriSkinAssets>("prepare_bestdori_skin_assets", {
      ripName: normalized.rhythmRipName,
      taskId: options?.operationId ?? null,
    });
    const rhythmSpritesPath = resolvePreparedFilePath(prepared.packageFiles, ".sprites");
    const rhythmBundlePath = resolvePreparedFilePath(
      prepared.packageFiles,
      `ingameskin-noteskin-${normalized.rhythmRipName}.bundle`,
    );
    const sampleBundlePath = resolvePreparedFilePath(
      prepared.samplePackageFiles,
      rhythmSampleBundleFileName,
    );
    const longLinePath = resolvePreparedFilePath(prepared.packageFiles, "longNoteLine.png");
    const longLineSpecialPath = resolvePreparedFilePath(prepared.packageFiles, "longNoteLine2.png");
    const simultaneousLinePath = resolvePreparedFilePath(prepared.packageFiles, "simultaneous_line.png");
    const sampleNoteNormal3Path = resolvePreparedFilePath(prepared.samplePackageFiles, "note_normal_3.png");
    const sampleNoteSkill3Path = resolvePreparedFilePath(prepared.samplePackageFiles, "note_skill_3.png");
    const sampleNoteFlick3Path = resolvePreparedFilePath(prepared.samplePackageFiles, "note_flick_3.png");
    const sampleNoteFlickTopPath = resolvePreparedFilePath(prepared.samplePackageFiles, "note_flick_top.png");
    const sampleNoteLong3Path = resolvePreparedFilePath(prepared.samplePackageFiles, "note_long_3.png");
    const sampleNoteSlideAmongPath = resolvePreparedFilePath(prepared.samplePackageFiles, "note_slide_among.png");
    const [
      rhythmSpritesFetchedText,
      rhythmBundleText,
      rhythmSampleBundleText,
      longLineBase64,
      simultaneousLineBase64,
      longLineSpecialBase64,
      sampleNoteNormal3Base64,
      sampleNoteSkill3Base64,
      sampleNoteFlick3Base64,
      sampleNoteFlickTopBase64,
      sampleNoteLong3Base64,
      sampleNoteSlideAmongBase64,
    ] = await Promise.all([
      invoke<string>("read_skin_text_file", { path: rhythmSpritesPath }),
      invoke<string>("read_skin_text_file", { path: rhythmBundlePath }),
      invoke<string>("read_skin_text_file", { path: sampleBundlePath }),
      invoke<string>("read_skin_binary_file", { path: longLinePath }),
      invoke<string>("read_skin_binary_file", { path: simultaneousLinePath }),
      invoke<string>("read_skin_binary_file", { path: longLineSpecialPath }),
      invoke<string>("read_skin_binary_file", { path: sampleNoteNormal3Path }),
      invoke<string>("read_skin_binary_file", { path: sampleNoteSkill3Path }),
      invoke<string>("read_skin_binary_file", { path: sampleNoteFlick3Path }),
      invoke<string>("read_skin_binary_file", { path: sampleNoteFlickTopPath }),
      invoke<string>("read_skin_binary_file", { path: sampleNoteLong3Path }),
      invoke<string>("read_skin_binary_file", { path: sampleNoteSlideAmongPath }),
    ]);

    rhythmSpritesManifest = parseSpritesJsonOrThrow(rhythmSpritesFetchedText, "rhythm .sprites");
    rhythmSpritesJson = rhythmSpritesManifest;
    rhythmBundleJson = parseBundleJsonOrThrow(rhythmBundleText, "rhythm .bundle");
    rhythmSampleBundleJson = parseBundleJsonOrThrow(rhythmSampleBundleText, "rhythm sample .bundle");
    rhythmAtlasFileMap = prepared.packageFiles;
    longLineAssetSrc = await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(longLineBase64)]));
    simultaneousLineAssetSrc = await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(simultaneousLineBase64)]));
    longLineSpecialAssetSrc = await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(longLineSpecialBase64)]));
    sampleAssets = {
      NoteNormal3: await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(sampleNoteNormal3Base64)])),
      NoteSkill3: await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(sampleNoteSkill3Base64)])),
      NoteFlick3: await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(sampleNoteFlick3Base64)])),
      NoteFlickTop: await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(sampleNoteFlickTopBase64)])),
      NoteLong3: await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(sampleNoteLong3Base64)])),
      NoteSlideAmong: await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(sampleNoteSlideAmongBase64)])),
    };
  } else {
    const rhythmBase = buildBestdoriAssetBase(normalized.rhythmRipName);
    const rhythmSampleBase = buildBestdoriAssetBase(rhythmSampleRipName);
    const [
      rhythmAtlasBlob,
      rhythmSpritesFetchedText,
      rhythmBundleText,
      rhythmSampleBundleText,
      longLineBlob,
      longLineSpecialBlob,
      simultaneousLineBlob,
      sampleNoteNormal3Blob,
      sampleNoteSkill3Blob,
      sampleNoteFlick3Blob,
      sampleNoteFlickTopBlob,
      sampleNoteLong3Blob,
      sampleNoteSlideAmongBlob,
    ] = await Promise.all([
      fetchBlobOrThrow(`${rhythmBase}/RhythmGameSprites.png`),
      fetchTextOrThrow(`${rhythmBase}/.sprites`),
      fetchTextOrThrow(`${rhythmBase}/ingameskin-noteskin-${normalized.rhythmRipName}.bundle`),
      fetchTextOrThrow(`${rhythmSampleBase}/${rhythmSampleBundleFileName}`),
      fetchBlobOrThrow(`${rhythmBase}/longNoteLine.png`),
      fetchBlobOrThrow(`${rhythmBase}/longNoteLine2.png`),
      fetchBlobOrThrow(`${rhythmBase}/simultaneous_line.png`),
      fetchBlobOrThrow(`${rhythmSampleBase}/note_normal_3.png`),
      fetchBlobOrThrow(`${rhythmSampleBase}/note_skill_3.png`),
      fetchBlobOrThrow(`${rhythmSampleBase}/note_flick_3.png`),
      fetchBlobOrThrow(`${rhythmSampleBase}/note_flick_top.png`),
      fetchBlobOrThrow(`${rhythmSampleBase}/note_long_3.png`),
      fetchBlobOrThrow(`${rhythmSampleBase}/note_slide_among.png`),
    ]);
    rhythmSpritesManifest = parseSpritesJsonOrThrow(rhythmSpritesFetchedText, "rhythm .sprites");
    rhythmSpritesJson = rhythmSpritesManifest;
    rhythmBundleJson = parseBundleJsonOrThrow(rhythmBundleText, "rhythm .bundle");
    rhythmSampleBundleJson = parseBundleJsonOrThrow(rhythmSampleBundleText, "rhythm sample .bundle");
    rhythmAtlasFileMap = {
      "rhythmgamesprites.png": await blobToDataUrl(rhythmAtlasBlob),
    };
    longLineAssetSrc = await blobToDataUrl(longLineBlob);
    simultaneousLineAssetSrc = await blobToDataUrl(simultaneousLineBlob);
    longLineSpecialAssetSrc = await blobToDataUrl(longLineSpecialBlob);
    sampleAssets = {
      NoteNormal3: await blobToDataUrl(sampleNoteNormal3Blob),
      NoteSkill3: await blobToDataUrl(sampleNoteSkill3Blob),
      NoteFlick3: await blobToDataUrl(sampleNoteFlick3Blob),
      NoteFlickTop: await blobToDataUrl(sampleNoteFlickTopBlob),
      NoteLong3: await blobToDataUrl(sampleNoteLong3Blob),
      NoteSlideAmong: await blobToDataUrl(sampleNoteSlideAmongBlob),
    };
  }

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

  if (isTauriEnv()) {
    const prepared = await invoke<PreparedBestdoriSkinAssets>("prepare_bestdori_skin_assets", {
      ripName: normalized.directionalRipName,
      taskId: options?.operationId ?? null,
    });
    const directionalSpritesPath = resolvePreparedFilePath(prepared.packageFiles, ".sprites");
    const directionalBundlePath = resolvePreparedFilePath(
      prepared.packageFiles,
      `ingameskin-noteskin-${normalized.directionalRipName}.bundle`,
    );
    const sampleBundlePath = resolvePreparedFilePath(
      prepared.samplePackageFiles,
      `ingameskin-noteskin-${normalized.directionalRipName}sample.bundle`,
    );
    const flickNoteLineLPath = resolvePreparedFilePath(prepared.packageFiles, "FlickNoteLine_l.png");
    const flickNoteLineRPath = resolvePreparedFilePath(prepared.packageFiles, "FlickNoteLine_r.png");
    const sampleNoteFlickL3Path = resolvePreparedFilePath(prepared.samplePackageFiles, "note_flick_l_3.png");
    const sampleNoteFlickR3Path = resolvePreparedFilePath(prepared.samplePackageFiles, "note_flick_r_3.png");
    const [
      directionalSpritesFetchedText,
      directionalBundleText,
      directionalSampleBundleText,
      flickNoteLineLBase64,
      flickNoteLineRBase64,
      sampleNoteFlickL3Base64,
      sampleNoteFlickR3Base64,
    ] = await Promise.all([
      invoke<string>("read_skin_text_file", { path: directionalSpritesPath }),
      invoke<string>("read_skin_text_file", { path: directionalBundlePath }),
      invoke<string>("read_skin_text_file", { path: sampleBundlePath }),
      invoke<string>("read_skin_binary_file", { path: flickNoteLineLPath }),
      invoke<string>("read_skin_binary_file", { path: flickNoteLineRPath }),
      invoke<string>("read_skin_binary_file", { path: sampleNoteFlickL3Path }),
      invoke<string>("read_skin_binary_file", { path: sampleNoteFlickR3Path }),
    ]);
    directionalSpritesManifest = parseSpritesJsonOrThrow(directionalSpritesFetchedText, "directional .sprites");
    directionalSpritesJson = directionalSpritesManifest;
    directionalBundleJson = parseBundleJsonOrThrow(directionalBundleText, "directional .bundle");
    directionalSampleBundleJson = parseBundleJsonOrThrow(directionalSampleBundleText, "directional sample .bundle");
    directionalAtlasFileMap = prepared.packageFiles;
    flickNoteLineL = await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(flickNoteLineLBase64)]));
    flickNoteLineR = await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(flickNoteLineRBase64)]));
    sampleAssets = {
      NoteFlickL3: await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(sampleNoteFlickL3Base64)])),
      NoteFlickR3: await blobToDataUrl(new Blob([decodeBase64ToArrayBuffer(sampleNoteFlickR3Base64)])),
    };
  } else {
    const directionalBase = buildBestdoriAssetBase(normalized.directionalRipName);
    const directionalSampleBase = buildBestdoriAssetBase(`${normalized.directionalRipName}sample`);
    const [
      directionalAtlasBlob,
      directionalSpritesFetchedText,
      directionalBundleText,
      directionalSampleBundleText,
      flickNoteLineLBlob,
      flickNoteLineRBlob,
      sampleNoteFlickL3Blob,
      sampleNoteFlickR3Blob,
    ] = await Promise.all([
      fetchBlobOrThrow(`${directionalBase}/DirectionalFlickSprites.png`),
      fetchTextOrThrow(`${directionalBase}/.sprites`),
      fetchTextOrThrow(`${directionalBase}/ingameskin-noteskin-${normalized.directionalRipName}.bundle`),
      fetchTextOrThrow(`${directionalSampleBase}/ingameskin-noteskin-${normalized.directionalRipName}sample.bundle`),
      fetchBlobOrThrow(`${directionalBase}/FlickNoteLine_l.png`),
      fetchBlobOrThrow(`${directionalBase}/FlickNoteLine_r.png`),
      fetchBlobOrThrow(`${directionalSampleBase}/note_flick_l_3.png`),
      fetchBlobOrThrow(`${directionalSampleBase}/note_flick_r_3.png`),
    ]);
    directionalSpritesManifest = parseSpritesJsonOrThrow(directionalSpritesFetchedText, "directional .sprites");
    directionalSpritesJson = directionalSpritesManifest;
    directionalBundleJson = parseBundleJsonOrThrow(directionalBundleText, "directional .bundle");
    directionalSampleBundleJson = parseBundleJsonOrThrow(directionalSampleBundleText, "directional sample .bundle");
    directionalAtlasFileMap = {
      "directionalflicksprites.png": await blobToDataUrl(directionalAtlasBlob),
    };
    flickNoteLineL = await blobToDataUrl(flickNoteLineLBlob);
    flickNoteLineR = await blobToDataUrl(flickNoteLineRBlob);
    sampleAssets = {
      NoteFlickL3: await blobToDataUrl(sampleNoteFlickL3Blob),
      NoteFlickR3: await blobToDataUrl(sampleNoteFlickR3Blob),
    };
  }

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
  if (isTauriEnv()) {
    const prepared = await invoke<PreparedBestdoriTapseskinAssets>("prepare_bestdori_tapseskin_assets", {
      ripName,
      taskId: options?.operationId ?? null,
    });
    const packageFiles = normalizeLowercaseFileMap(prepared.packageFiles);
    const files = await loadPreparedBinaryFilesAsDataUrlMap(packageFiles, "read_sound_binary_file");
    return withRhythmSeAssets(files);
  }
  const files = await downloadWebTapseskinFiles(ripName);
  return withRhythmSeAssets(files);
}

export async function downloadBestdoriDirectionalSeSkinAssets(
  selection: SkinSelection,
  options?: DownloadProgressOptions,
): Promise<DirectionalSeSkinAssets> {
  const normalized = normalizeSkinSelection(selection);
  const ripName = normalized.directionalSeRipName;
  if (isTauriEnv()) {
    const prepared = await invoke<PreparedBestdoriTapseskinAssets>("prepare_bestdori_tapseskin_assets", {
      ripName,
      taskId: options?.operationId ?? null,
    });
    const packageFiles = normalizeLowercaseFileMap(prepared.packageFiles);
    const files = await loadPreparedBinaryFilesAsDataUrlMap(packageFiles, "read_sound_binary_file");
    return withDirectionalSeAssets(files);
  }
  const files = await downloadWebTapseskinFiles(ripName);
  return withDirectionalSeAssets(files);
}

export async function downloadBestdoriFieldSkinAssets(
  ripName: string,
  options?: DownloadProgressOptions,
): Promise<FieldSkinAssets> {
  const normalizedRipName = ripName.trim();
  if (!normalizedRipName || !RIP_NAME_PATTERN.test(normalizedRipName)) {
    throw new Error("ripName 非法，仅允许 [a-zA-Z0-9_-]。");
  }
  if (isTauriEnv()) {
    const prepared = await invoke<PreparedBestdoriFieldSkinAssets>("prepare_bestdori_field_skin_assets", {
      ripName: normalizedRipName,
      taskId: options?.operationId ?? null,
    });
    const packageFiles = normalizeLowercaseFileMap(prepared.packageFiles);
    const files = await loadPreparedBinaryFilesAsDataUrlMap(packageFiles, "read_field_skin_binary_file");
    return withFieldSkinAssets(files);
  }
  const files = await downloadWebFieldSkinFiles(normalizedRipName);
  return withFieldSkinAssets(files);
}
