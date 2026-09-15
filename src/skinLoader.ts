import type {
  AssetManifest,
  BundleManifest,
  SpriteManifest,
} from "./noteSkinAssetTool";
import {
  type BestdoriAssetServer,
  DEFAULT_BESTDORI_ASSET_SERVER,
  normalizeBestdoriAssetServer,
} from "./services/bestdori/api";
export type { BestdoriCatalogKind, BestdoriSkinCatalogOptions } from "./services/bestdori/catalog";
const RIP_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

const DEFAULT_RHYTHM_ID = "skin00";
const DEFAULT_DIRECTIONAL_ID = "directionalflickskin00";
const DEFAULT_RHYTHM_SE_ID = "skin00";
const DEFAULT_DIRECTIONAL_SE_ID = "directionalflickskin00";
const DEFAULT_BG_ID = "skin00";
const DEFAULT_FIELD_ID = "skin00";
const DEFAULT_JUDGE_ID = "skin00";
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
export type NoteAssets = Record<NoteAssetLane, string>;

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

export interface RhythmAssets {
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

export interface HabahiroRhythmAssets {
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

export interface RhythmSampleAssets {
  NoteNormal3: string;
  NoteSkill3: string;
  NoteFlick3: string;
  NoteFlickTop: string;
  NoteLong3: string;
  NoteSlideAmong: string;
}

export interface DirectionalAssets {
  noteFlickL: NoteAssets;
  noteFlickR: NoteAssets;
  noteFlickTopL: string;
  noteFlickTopR: string;
  flickNoteLineL: string;
  flickNoteLineR: string;
}

export interface DirectionalSampleAssets {
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
  TRhythmSkin extends AnyRhythmSkinAssets = RhythmSkinAssets,
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

export function isHabahiroRhythmRipName(ripName: string): boolean {
  return ripName.trim().toLowerCase() === "habahiro";
}

export const DEFAULT_SKIN_SELECTION: SkinSelection = {
  rhythmType: DEFAULT_RHYTHM_ID,
  directionalType: DEFAULT_DIRECTIONAL_ID,
  rhythmSeType: DEFAULT_RHYTHM_SE_ID,
  directionalSeType: DEFAULT_DIRECTIONAL_SE_ID,
  bgType: DEFAULT_BG_ID,
  fieldType: DEFAULT_FIELD_ID,
  judgeType: DEFAULT_JUDGE_ID,
  rhythmRipName: DEFAULT_RHYTHM_ID,
  directionalRipName: DEFAULT_DIRECTIONAL_ID,
  rhythmSeRipName: DEFAULT_RHYTHM_SE_ID,
  directionalSeRipName: DEFAULT_DIRECTIONAL_SE_ID,
  bgSkinRipName: DEFAULT_BG_ID,
  fieldSkinRipName: DEFAULT_FIELD_ID,
  judgeSkinRipName: DEFAULT_JUDGE_ID,
  rhythmServer: DEFAULT_BESTDORI_ASSET_SERVER,
  directionalServer: DEFAULT_BESTDORI_ASSET_SERVER,
  rhythmSeServer: DEFAULT_BESTDORI_ASSET_SERVER,
  directionalSeServer: DEFAULT_BESTDORI_ASSET_SERVER,
  bgSkinServer: DEFAULT_BESTDORI_ASSET_SERVER,
  fieldSkinServer: DEFAULT_BESTDORI_ASSET_SERVER,
  judgeSkinServer: DEFAULT_BESTDORI_ASSET_SERVER,
};

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
  TRhythmSkin extends AnyRhythmSkinAssets = RhythmSkinAssets,
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
  TRhythmSkin extends AnyRhythmSkinAssets = RhythmSkinAssets,
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
  TRhythmSkin extends AnyRhythmSkinAssets = RhythmSkinAssets,
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
  TRhythmSkin extends AnyRhythmSkinAssets = RhythmSkinAssets,
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
  TRhythmSkin extends AnyRhythmSkinAssets = RhythmSkinAssets,
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

  const rhythmFallbackRip = RIP_NAME_PATTERN.test(rhythmType) ? rhythmType : DEFAULT_SKIN_SELECTION.rhythmRipName;
  const directionalFallbackRip = RIP_NAME_PATTERN.test(directionalType) ? directionalType : DEFAULT_SKIN_SELECTION.directionalRipName;
  const rhythmSeFallbackRip = RIP_NAME_PATTERN.test(rhythmSeType) ? rhythmSeType : DEFAULT_SKIN_SELECTION.rhythmSeRipName;
  const directionalSeFallbackRip = RIP_NAME_PATTERN.test(directionalSeType) ? directionalSeType : DEFAULT_SKIN_SELECTION.directionalSeRipName;
  const bgSkinFallbackRip = RIP_NAME_PATTERN.test(bgType) ? bgType : DEFAULT_SKIN_SELECTION.bgSkinRipName;
  const fieldSkinFallbackRip = RIP_NAME_PATTERN.test(fieldType) ? fieldType : DEFAULT_SKIN_SELECTION.fieldSkinRipName;
  const judgeSkinFallbackRip = RIP_NAME_PATTERN.test(judgeType) ? judgeType : DEFAULT_SKIN_SELECTION.judgeSkinRipName;

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
      : null,
  );
  const directionalServer = normalizeBestdoriAssetServer(
    typeof input.directionalServer === "string"
      ? input.directionalServer
      : null,
  );
  const rhythmSeServer = normalizeBestdoriAssetServer(
    typeof input.rhythmSeServer === "string"
      ? input.rhythmSeServer
      : null,
  );
  const directionalSeServer = normalizeBestdoriAssetServer(
    typeof input.directionalSeServer === "string"
      ? input.directionalSeServer
      : null,
  );
  const bgSkinServer = normalizeBestdoriAssetServer(
    typeof input.bgSkinServer === "string"
      ? input.bgSkinServer
      : null,
  );
  const fieldSkinServer = normalizeBestdoriAssetServer(
    typeof input.fieldSkinServer === "string"
      ? input.fieldSkinServer
      : null,
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
  TRhythmSkin extends AnyRhythmSkinAssets,
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
