import { Rectangle, Texture } from "pixi.js";
import type { BGSkin, FieldSkinAssets, JudgeSkin, SkinAssets } from "../../skinLoader";
import type { RuntimeNoteBaseType, RuntimeNoteSemantic } from "./types";
import {
  buildParticleEffectPack,
  type ParticleEffectPack,
} from "./particlePack";
import embeddedParticleManifest from "../assets/particles/bandori1/manifest.json";
import embeddedParticleAtlasUrl from "../assets/particles/bandori1/texture.png";
import embeddedComboLabelUrl from "../assets/ui/combo.png";
import embeddedComboDigitsUrl from "../assets/ui/digits.png";

type LaneKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";
type LaneAssetMap = Record<LaneKey, string>;

type DefaultRhythmAssets = {
  noteNormal: LaneAssetMap;
  noteNormal16: LaneAssetMap;
  noteSkill: LaneAssetMap;
  noteFlick: LaneAssetMap;
  noteFlickTop: string;
  noteLong: LaneAssetMap;
  noteLongFlash: LaneAssetMap;
  noteSlideAmong: string;
  longNoteLine: string;
  longNoteLine2: string;
  simultaneousLine: string;
};

type HabahiroRhythmAssets = {
  noteNormal: Record<string, string>;
  noteNormal16: Record<string, string>;
  noteSkill: Record<string, string>;
  noteFlick: Record<string, string>;
  noteFlickTop: Record<string, string>;
  noteLong: Record<string, string>;
  noteLongFlash: Record<string, string>;
  noteSlideAmong: Record<string, string>;
  longNoteLine: string;
  longNoteLine2: string;
  simultaneousLine: string;
};

type HabahiroNoteAssetKey =
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
type HabahiroFlickTopWidth = 1 | 2 | 3;
type HabahiroTextureMap = Partial<Record<HabahiroNoteAssetKey, Texture | null>>;
type HabahiroWidthTextureMap = Partial<Record<HabahiroWidth, Texture | null>>;
type HabahiroFlickTopTextureMap = Partial<Record<HabahiroFlickTopWidth, Texture | null>>;

interface HabahiroTextureBundle {
  enabled: boolean;
  noteNormal: HabahiroTextureMap;
  noteNormal16: HabahiroTextureMap;
  noteSkill: HabahiroTextureMap;
  noteFlick: HabahiroTextureMap;
  noteLong: HabahiroTextureMap;
  noteLongFlash: HabahiroTextureMap;
  noteSlideAmong: HabahiroWidthTextureMap;
  noteFlickTop: HabahiroFlickTopTextureMap;
}

type DirectionalAssets = {
  noteFlickL: LaneAssetMap;
  noteFlickR: LaneAssetMap;
  noteFlickTopL: string;
  noteFlickTopR: string;
};

export interface NoteSkinTextureBundle {
  rhythm: {
    noteNormal: Array<Texture | null>;
    noteNormal16: Array<Texture | null>;
    noteSkill: Array<Texture | null>;
    noteFlick: Array<Texture | null>;
    noteLong: Array<Texture | null>;
    noteLongFlash: Array<Texture | null>;
    noteSlideAmong: Texture | null;
    noteFlickTop: Texture | null;
    habahiro: HabahiroTextureBundle;
  };
  directional: {
    noteFlickL: Array<Texture | null>;
    noteFlickR: Array<Texture | null>;
    noteFlickTopL: Texture | null;
    noteFlickTopR: Texture | null;
  };
  lines: {
    longNoteLine: Texture | null;
    longNoteLine2: Texture | null;
    simultaneousLine: Texture | null;
  };
  field: {
    bgLineRhythm: Texture | null;
    gamePlayLine: Texture | null;
    gamePlayLineSkillAdjustEffect: Texture | null;
  };
  background: {
    liveBG: Texture | null;
  };
  hud: {
    comboLabel: Texture | null;
    comboDigits: Array<Texture | null>;
  };
  judge: {
    perfect: Texture | null;
    great: Texture | null;
    good: Texture | null;
    bad: Texture | null;
    miss: Texture | null;
    auto: Texture | null;
    fast: Texture | null;
    slow: Texture | null;
  };
  particleEffects: ParticleEffectPack | null;
  destroy(): void;
}

const LANE_KEYS: LaneKey[] = ["0", "1", "2", "3", "4", "5", "6"];
const HABAHIRO_WIDTH_VALUES: readonly HabahiroWidth[] = [1, 2, 3, 4, 5, 6, 7];
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

function laneIndex(lane: number): number {
  const rounded = Math.round(lane);
  return Math.max(1, Math.min(7, rounded));
}

function logicalLaneIndex(lane: number): number {
  const rounded = Math.round(Number.isFinite(lane) ? lane : 0);
  return Math.max(1, Math.min(7, rounded + 1));
}

function laneKeyForIndex(lane: number): LaneKey {
  return LANE_KEYS[laneIndex(lane) - 1]!;
}

function isRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null;
}

function isHabahiroRhythmAssets(
  value: DefaultRhythmAssets | HabahiroRhythmAssets,
): value is HabahiroRhythmAssets {
  return isRecord((value as HabahiroRhythmAssets).noteFlickTop);
}

function firstNonEmptyValue(record: Record<string, string>): string | null {
  for (const value of Object.values(record)) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function readLaneAssetUrl(
  laneAssets: LaneAssetMap | Record<string, string>,
  lane: number,
): string | null {
  const key = laneKeyForIndex(lane);
  const value = laneAssets[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (isRecord(laneAssets)) {
    return firstNonEmptyValue(laneAssets);
  }
  return null;
}

function readScalarAssetUrl(
  value: string | Record<string, string>,
  fallbackKey: string,
): string | null {
  if (typeof value === "string") {
    return value.length > 0 ? value : null;
  }
  const direct = value[fallbackKey];
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }
  return firstNonEmptyValue(value);
}

function normalizeHabahiroWidth(value: number): HabahiroWidth {
  const rounded = Math.round(Number.isFinite(value) ? value : 1);
  return Math.max(1, Math.min(7, rounded)) as HabahiroWidth;
}

function habahiroFlickTopWidth(value: number): HabahiroFlickTopWidth {
  const width = normalizeHabahiroWidth(value);
  if (width <= 1) {
    return 1;
  }
  if (width === 2) {
    return 2;
  }
  return 3;
}

function habahiroAssetKeyForCenterLaneAndWidth(centerLaneValue: number, widthValue: number): HabahiroNoteAssetKey {
  const width = normalizeHabahiroWidth(widthValue);
  const rawCenter = Number.isFinite(centerLaneValue) ? centerLaneValue : (width - 1) / 2;
  const minCenter = (width - 1) / 2;
  const maxCenter = 6 - (width - 1) / 2;
  const center = Math.max(minCenter, Math.min(maxCenter, rawCenter));
  const start = Math.max(0, Math.min(7 - width, Math.round(center - (width - 1) / 2)));
  return Array.from({ length: width }, (_, index) => `${start + index}`).join("_") as HabahiroNoteAssetKey;
}

function resolveHabahiroTexture(
  map: HabahiroTextureMap,
  centerLane: number,
  width: number,
): Texture | null {
  return map[habahiroAssetKeyForCenterLaneAndWidth(centerLane, width)] ?? null;
}

async function loadHabahiroTextureMap(
  assets: Record<string, string>,
  loadCachedTexture: (url: string | null | undefined) => Promise<Texture | null>,
): Promise<HabahiroTextureMap> {
  const output: HabahiroTextureMap = {};
  for (const key of HABAHIRO_NOTE_ASSET_KEYS) {
    output[key] = await loadCachedTexture(assets[key] ?? null);
  }
  return output;
}

async function loadHabahiroWidthTextureMap(
  assets: Record<string, string>,
  loadCachedTexture: (url: string | null | undefined) => Promise<Texture | null>,
): Promise<HabahiroWidthTextureMap> {
  const output: HabahiroWidthTextureMap = {};
  for (const width of HABAHIRO_WIDTH_VALUES) {
    output[width] = await loadCachedTexture(assets[String(width)] ?? null);
  }
  return output;
}

async function loadHabahiroFlickTopTextureMap(
  assets: Record<string, string>,
  loadCachedTexture: (url: string | null | undefined) => Promise<Texture | null>,
): Promise<HabahiroFlickTopTextureMap> {
  return {
    1: await loadCachedTexture(assets["1"] ?? null),
    2: await loadCachedTexture(assets["2"] ?? null),
    3: await loadCachedTexture(assets["3"] ?? null),
  };
}

async function loadTextureFromUrl(url: string): Promise<Texture | null> {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`image decode failed: ${url.slice(0, 96)}`));
      element.src = url;
    });
    return Texture.from(image);
  } catch {
    return null;
  }
}

export async function loadNoteSkinTextureBundle(
  noteSkin: SkinAssets,
  fieldSkin?: FieldSkinAssets | null,
  bgSkin?: BGSkin | null,
  judgeSkin?: JudgeSkin | null,
): Promise<NoteSkinTextureBundle> {
  const trackedTextures: Texture[] = [];
  const trackedDerivedTextures: Texture[] = [];
  const textureCache = new Map<string, Texture | null>();

  const loadCachedTexture = async (url: string | null | undefined): Promise<Texture | null> => {
    const normalized = typeof url === "string" ? url.trim() : "";
    if (!normalized) {
      return null;
    }
    if (textureCache.has(normalized)) {
      return textureCache.get(normalized) ?? null;
    }
    const texture = await loadTextureFromUrl(normalized);
    textureCache.set(normalized, texture);
    if (texture) {
      trackedTextures.push(texture);
    }
    return texture;
  };

  const rhythmAssets = noteSkin.rhythm.assets.assets as DefaultRhythmAssets | HabahiroRhythmAssets;
  const directionalAssets = noteSkin.directional.assets.assets as DirectionalAssets;
  const isHabahiro = isHabahiroRhythmAssets(rhythmAssets);

  const noteNormal: Array<Texture | null> = new Array(8).fill(null);
  const noteNormal16: Array<Texture | null> = new Array(8).fill(null);
  const noteSkill: Array<Texture | null> = new Array(8).fill(null);
  const noteFlick: Array<Texture | null> = new Array(8).fill(null);
  const noteLong: Array<Texture | null> = new Array(8).fill(null);
  const noteLongFlash: Array<Texture | null> = new Array(8).fill(null);
  const directionalLeft: Array<Texture | null> = new Array(8).fill(null);
  const directionalRight: Array<Texture | null> = new Array(8).fill(null);
  const emptyHabahiroBundle: HabahiroTextureBundle = {
    enabled: false,
    noteNormal: {},
    noteNormal16: {},
    noteSkill: {},
    noteFlick: {},
    noteLong: {},
    noteLongFlash: {},
    noteSlideAmong: {},
    noteFlickTop: {},
  };

  for (let lane = 1; lane <= 7; lane += 1) {
    noteNormal[lane] = await loadCachedTexture(readLaneAssetUrl(rhythmAssets.noteNormal, lane));
    noteNormal16[lane] = await loadCachedTexture(readLaneAssetUrl(rhythmAssets.noteNormal16, lane));
    noteSkill[lane] = await loadCachedTexture(readLaneAssetUrl(rhythmAssets.noteSkill, lane));
    noteFlick[lane] = await loadCachedTexture(readLaneAssetUrl(rhythmAssets.noteFlick, lane));
    noteLong[lane] = await loadCachedTexture(readLaneAssetUrl(rhythmAssets.noteLong, lane));
    noteLongFlash[lane] = await loadCachedTexture(readLaneAssetUrl(rhythmAssets.noteLongFlash, lane));
    directionalLeft[lane] = await loadCachedTexture(readLaneAssetUrl(directionalAssets.noteFlickL, lane));
    directionalRight[lane] = await loadCachedTexture(readLaneAssetUrl(directionalAssets.noteFlickR, lane));
  }

  const noteSlideAmong = await loadCachedTexture(
    isHabahiro
      ? readScalarAssetUrl(rhythmAssets.noteSlideAmong, "1")
      : rhythmAssets.noteSlideAmong,
  );
  const noteFlickTop = await loadCachedTexture(
    isHabahiro
      ? readScalarAssetUrl(rhythmAssets.noteFlickTop, "1")
      : rhythmAssets.noteFlickTop,
  );
  const habahiroBundle: HabahiroTextureBundle = isHabahiro
    ? {
        enabled: true,
        noteNormal: await loadHabahiroTextureMap(rhythmAssets.noteNormal, loadCachedTexture),
        noteNormal16: await loadHabahiroTextureMap(rhythmAssets.noteNormal16, loadCachedTexture),
        noteSkill: await loadHabahiroTextureMap(rhythmAssets.noteSkill, loadCachedTexture),
        noteFlick: await loadHabahiroTextureMap(rhythmAssets.noteFlick, loadCachedTexture),
        noteLong: await loadHabahiroTextureMap(rhythmAssets.noteLong, loadCachedTexture),
        noteLongFlash: await loadHabahiroTextureMap(rhythmAssets.noteLongFlash, loadCachedTexture),
        noteSlideAmong: await loadHabahiroWidthTextureMap(rhythmAssets.noteSlideAmong, loadCachedTexture),
        noteFlickTop: await loadHabahiroFlickTopTextureMap(rhythmAssets.noteFlickTop, loadCachedTexture),
      }
    : emptyHabahiroBundle;
  const noteFlickTopL = await loadCachedTexture(directionalAssets.noteFlickTopL);
  const noteFlickTopR = await loadCachedTexture(directionalAssets.noteFlickTopR);
  const longNoteLine = await loadCachedTexture(rhythmAssets.longNoteLine);
  const longNoteLine2 = await loadCachedTexture(rhythmAssets.longNoteLine2);
  const simultaneousLine = await loadCachedTexture(rhythmAssets.simultaneousLine);
  const fieldBgLineRhythm = await loadCachedTexture(fieldSkin?.bgLineRhythm ?? null);
  const fieldGamePlayLine = await loadCachedTexture(fieldSkin?.gamePlayLine ?? null);
  const fieldGamePlayLineSkillAdjustEffect = await loadCachedTexture(
    fieldSkin?.gamePlayLineSkillAdjustEffect ?? null,
  );
  const liveBgTexture = await loadCachedTexture(bgSkin?.assets.liveBG ?? null);
  const judgePerfectTexture = await loadCachedTexture(judgeSkin?.assets.judgePerfect ?? null);
  const judgeGreatTexture = await loadCachedTexture(judgeSkin?.assets.judgeGreat ?? null);
  const judgeGoodTexture = await loadCachedTexture(judgeSkin?.assets.judgeGood ?? null);
  const judgeBadTexture = await loadCachedTexture(judgeSkin?.assets.judgeBad ?? null);
  const judgeMissTexture = await loadCachedTexture(judgeSkin?.assets.judgeMiss ?? null);
  const judgeAutoTexture = await loadCachedTexture(judgeSkin?.assets.judgeAuto ?? null);
  const judgeFastTexture = await loadCachedTexture(judgeSkin?.assets.judgeFast ?? null);
  const judgeSlowTexture = await loadCachedTexture(judgeSkin?.assets.judgeSlow ?? null);
  const comboLabelTexture = await loadCachedTexture(embeddedComboLabelUrl);
  const comboDigitsAtlasTexture = await loadCachedTexture(embeddedComboDigitsUrl);
  const comboDigitTextures = buildDigitTextures(comboDigitsAtlasTexture);
  for (const texture of comboDigitTextures) {
    if (texture) {
      trackedDerivedTextures.push(texture);
    }
  }

  const particleAtlasTexture = await loadCachedTexture(embeddedParticleAtlasUrl);
  const particleEffects = particleAtlasTexture
    ? buildParticleEffectPack(embeddedParticleManifest, particleAtlasTexture)
    : null;

  return {
    rhythm: {
      noteNormal,
      noteNormal16,
      noteSkill,
      noteFlick,
      noteLong,
      noteLongFlash,
      noteSlideAmong,
      noteFlickTop,
      habahiro: habahiroBundle,
    },
    directional: {
      noteFlickL: directionalLeft,
      noteFlickR: directionalRight,
      noteFlickTopL,
      noteFlickTopR,
    },
    lines: {
      longNoteLine,
      longNoteLine2,
      simultaneousLine,
    },
    field: {
      bgLineRhythm: fieldBgLineRhythm,
      gamePlayLine: fieldGamePlayLine,
      gamePlayLineSkillAdjustEffect: fieldGamePlayLineSkillAdjustEffect,
    },
    background: {
      liveBG: liveBgTexture,
    },
    hud: {
      comboLabel: comboLabelTexture,
      comboDigits: comboDigitTextures,
    },
    judge: {
      perfect: judgePerfectTexture,
      great: judgeGreatTexture,
      good: judgeGoodTexture,
      bad: judgeBadTexture,
      miss: judgeMissTexture,
      auto: judgeAutoTexture,
      fast: judgeFastTexture,
      slow: judgeSlowTexture,
    },
    particleEffects,
    destroy: () => {
      particleEffects?.destroy();
      for (const texture of trackedDerivedTextures) {
        texture.destroy(false);
      }
      for (const texture of trackedTextures) {
        texture.destroy(true);
      }
    },
  };
}

export function resolveRhythmNoteTexture(
  bundle: NoteSkinTextureBundle,
  note: RuntimeNoteSemantic,
  lane: number,
  gray: boolean,
  centerLane = lane,
): Texture | null {
  const laneIdx = logicalLaneIndex(lane);
  const rhythmWidth = Math.max(1, note.rhythmWidth);
  const habahiro = bundle.rhythm.habahiro.enabled ? bundle.rhythm.habahiro : null;
  if (gray) {
    if (habahiro) {
      return resolveHabahiroTexture(habahiro.noteNormal16, centerLane, rhythmWidth)
        ?? bundle.rhythm.noteNormal16[laneIdx]
        ?? null;
    }
    return bundle.rhythm.noteNormal16[laneIdx] ?? null;
  }
  if (note.baseType === "directional_flick_left" || note.baseType === "directional_flick_right") {
    return null;
  }
  if (note.baseType === "hidden") {
    if (habahiro) {
      return habahiro.noteSlideAmong[normalizeHabahiroWidth(rhythmWidth)]
        ?? bundle.rhythm.noteSlideAmong
        ?? null;
    }
    return bundle.rhythm.noteSlideAmong ?? null;
  }
  if (note.baseType === "skill") {
    if (habahiro) {
      return resolveHabahiroTexture(habahiro.noteSkill, centerLane, rhythmWidth)
        ?? bundle.rhythm.noteSkill[laneIdx]
        ?? null;
    }
    return bundle.rhythm.noteSkill[laneIdx] ?? null;
  }
  if (note.baseType === "flick") {
    if (note.slideRole === "none" || note.slideRole === "end") {
      if (habahiro) {
        return resolveHabahiroTexture(habahiro.noteFlick, centerLane, rhythmWidth)
          ?? bundle.rhythm.noteFlick[laneIdx]
          ?? null;
      }
      return bundle.rhythm.noteFlick[laneIdx] ?? null;
    }
    if (note.slideRole === "start") {
      if (habahiro) {
        return resolveHabahiroTexture(habahiro.noteLong, centerLane, rhythmWidth)
          ?? bundle.rhythm.noteLong[laneIdx]
          ?? null;
      }
      return bundle.rhythm.noteLong[laneIdx] ?? null;
    }
    if (habahiro) {
      return habahiro.noteSlideAmong[normalizeHabahiroWidth(rhythmWidth)]
        ?? bundle.rhythm.noteSlideAmong
        ?? null;
    }
    return bundle.rhythm.noteSlideAmong ?? null;
  }
  if (note.slideRole === "none") {
    if (habahiro) {
      return resolveHabahiroTexture(habahiro.noteNormal, centerLane, rhythmWidth)
        ?? bundle.rhythm.noteNormal[laneIdx]
        ?? null;
    }
    return bundle.rhythm.noteNormal[laneIdx] ?? null;
  }
  if (note.slideRole === "start" || note.slideRole === "end") {
    if (habahiro) {
      return resolveHabahiroTexture(habahiro.noteLong, centerLane, rhythmWidth)
        ?? bundle.rhythm.noteLong[laneIdx]
        ?? null;
    }
    return bundle.rhythm.noteLong[laneIdx] ?? null;
  }
  if (habahiro) {
    return habahiro.noteSlideAmong[normalizeHabahiroWidth(rhythmWidth)]
      ?? bundle.rhythm.noteSlideAmong
      ?? null;
  }
  return bundle.rhythm.noteSlideAmong ?? null;
}

export function resolveSlideBottomMarkerTexture(
  bundle: NoteSkinTextureBundle,
  lane: number,
  markerSourceBaseType: RuntimeNoteBaseType | null,
  markerSourceIsHead: boolean,
  rhythmWidth = 1,
  centerLane = lane,
): Texture | null {
  const laneIdx = logicalLaneIndex(lane);
  const habahiro = bundle.rhythm.habahiro.enabled ? bundle.rhythm.habahiro : null;
  if (!markerSourceIsHead) {
    if (habahiro) {
      return habahiro.noteSlideAmong[normalizeHabahiroWidth(rhythmWidth)]
        ?? bundle.rhythm.noteSlideAmong
        ?? bundle.rhythm.noteLong[laneIdx]
        ?? null;
    }
    return bundle.rhythm.noteSlideAmong
      ?? bundle.rhythm.noteLong[laneIdx]
      ?? null;
  }
  switch (markerSourceBaseType) {
    case "single":
      if (habahiro) {
        return resolveHabahiroTexture(habahiro.noteLong, centerLane, rhythmWidth)
          ?? bundle.rhythm.noteLong[laneIdx]
          ?? null;
      }
      return bundle.rhythm.noteLong[laneIdx] ?? null;
    case "flick":
      if (habahiro) {
        return resolveHabahiroTexture(habahiro.noteFlick, centerLane, rhythmWidth)
          ?? resolveHabahiroTexture(habahiro.noteLong, centerLane, rhythmWidth)
          ?? bundle.rhythm.noteFlick[laneIdx]
          ?? bundle.rhythm.noteLong[laneIdx]
          ?? null;
      }
      return bundle.rhythm.noteFlick[laneIdx]
        ?? bundle.rhythm.noteLong[laneIdx]
        ?? null;
    case "skill":
      if (habahiro) {
        return resolveHabahiroTexture(habahiro.noteSkill, centerLane, rhythmWidth)
          ?? resolveHabahiroTexture(habahiro.noteLong, centerLane, rhythmWidth)
          ?? bundle.rhythm.noteSkill[laneIdx]
          ?? bundle.rhythm.noteLong[laneIdx]
          ?? null;
      }
      return bundle.rhythm.noteSkill[laneIdx]
        ?? bundle.rhythm.noteLong[laneIdx]
        ?? null;
    case "directional_flick_left":
    case "directional_flick_right":
      if (habahiro) {
        return resolveHabahiroTexture(habahiro.noteLong, centerLane, rhythmWidth)
          ?? bundle.rhythm.noteLong[laneIdx]
          ?? null;
      }
      return bundle.rhythm.noteLong[laneIdx] ?? null;
    default:
      if (habahiro) {
        return resolveHabahiroTexture(habahiro.noteLong, centerLane, rhythmWidth)
          ?? bundle.rhythm.noteLong[laneIdx]
          ?? null;
      }
      return bundle.rhythm.noteLong[laneIdx] ?? null;
  }
}

function buildDigitTextures(texture: Texture | null): Array<Texture | null> {
  const digits: Array<Texture | null> = new Array(10).fill(null);
  if (!texture) {
    return digits;
  }
  const digitWidth = Math.floor(texture.width / 10);
  const digitHeight = Math.floor(texture.height);
  if (digitWidth <= 0 || digitHeight <= 0) {
    return digits;
  }
  for (let digit = 0; digit <= 9; digit += 1) {
    digits[digit] = new Texture({
      source: texture.source,
      frame: new Rectangle(digit * digitWidth, 0, digitWidth, digitHeight),
    });
  }
  return digits;
}

export function resolveSlideBottomMarkerFlashTexture(
  bundle: NoteSkinTextureBundle,
  lane: number,
  markerSourceIsHead: boolean,
  rhythmWidth = 1,
  centerLane = lane,
): Texture | null {
  if (markerSourceIsHead) {
    return null;
  }
  const laneIdx = logicalLaneIndex(lane);
  const habahiro = bundle.rhythm.habahiro.enabled ? bundle.rhythm.habahiro : null;
  if (habahiro) {
    return resolveHabahiroTexture(habahiro.noteLongFlash, centerLane, rhythmWidth)
      ?? bundle.rhythm.noteLongFlash[laneIdx]
      ?? null;
  }
  return bundle.rhythm.noteLongFlash[laneIdx] ?? null;
}

export function resolveDirectionalLaneTexture(
  bundle: NoteSkinTextureBundle,
  isLeft: boolean,
  lane: number,
): Texture | null {
  const laneIdx = laneIndex(lane);
  return isLeft
    ? (bundle.directional.noteFlickL[laneIdx] ?? null)
    : (bundle.directional.noteFlickR[laneIdx] ?? null);
}

export function resolveDirectionalArrowTexture(
  bundle: NoteSkinTextureBundle,
  isLeft: boolean,
): Texture | null {
  return isLeft
    ? (bundle.directional.noteFlickTopL ?? null)
    : (bundle.directional.noteFlickTopR ?? null);
}

export function resolveFlickTopTexture(bundle: NoteSkinTextureBundle, rhythmWidth = 1): Texture | null {
  const habahiro = bundle.rhythm.habahiro.enabled ? bundle.rhythm.habahiro : null;
  if (habahiro) {
    return habahiro.noteFlickTop[habahiroFlickTopWidth(rhythmWidth)]
      ?? bundle.rhythm.noteFlickTop
      ?? null;
  }
  return bundle.rhythm.noteFlickTop ?? null;
}

export function resolveJudgeTexture(
  bundle: NoteSkinTextureBundle,
  kind: "perfect" | "great" | "good" | "bad" | "miss" | "auto" | "fast" | "slow",
): Texture | null {
  switch (kind) {
    case "perfect":
      return bundle.judge.perfect ?? bundle.judge.auto ?? null;
    case "great":
      return bundle.judge.great ?? bundle.judge.auto ?? null;
    case "good":
      return bundle.judge.good ?? bundle.judge.auto ?? null;
    case "bad":
      return bundle.judge.bad ?? bundle.judge.auto ?? null;
    case "miss":
      return bundle.judge.miss ?? bundle.judge.auto ?? null;
    case "fast":
      return bundle.judge.fast ?? bundle.judge.auto ?? null;
    case "slow":
      return bundle.judge.slow ?? bundle.judge.auto ?? null;
    default:
      return bundle.judge.auto ?? null;
  }
}
