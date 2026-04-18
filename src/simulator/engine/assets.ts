import { Texture } from "pixi.js";
import type { SkinAssets } from "../../skinLoader";
import { EMBEDDED_EFFECT_FRAME_URLS } from "./embeddedEffects";

type LaneKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";
type LaneAssetMap = Record<LaneKey, string>;

type DefaultRhythmAssets = {
  noteNormal: LaneAssetMap;
  noteNormal16: LaneAssetMap;
  noteSkill: LaneAssetMap;
  noteFlick: LaneAssetMap;
  noteFlickTop: string;
  noteLong: LaneAssetMap;
  noteSlideAmong: string;
  longNoteLine: string;
  longNoteLine2: string;
};

type HabahiroRhythmAssets = {
  noteNormal: Record<string, string>;
  noteNormal16: Record<string, string>;
  noteSkill: Record<string, string>;
  noteFlick: Record<string, string>;
  noteFlickTop: Record<string, string>;
  noteLong: Record<string, string>;
  noteSlideAmong: Record<string, string>;
  longNoteLine: string;
  longNoteLine2: string;
};

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
    noteSlideAmong: Texture | null;
    noteFlickTop: Texture | null;
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
  };
  effects: {
    normal: Texture[];
    flick: Texture[];
    slide: Texture[];
  };
  destroy(): void;
}

const LANE_KEYS: LaneKey[] = ["0", "1", "2", "3", "4", "5", "6"];
const NORMAL_TYPE_SET = new Set([1, 10, 101]);
const LONG_TYPE_SET = new Set([3, 5, 6, 8, 9, 71, 73, 103, 105]);
const SKILL_TYPE_SET = new Set([11, 31, 32, 33, 34, 35, 36, 75, 76, 109]);
const FLICK_TYPE_SET = new Set([2, 12, 13, 26, 74, 102, 106]);
const SLIDE_TYPE_SET = new Set([4, 7, 14, 15, 16, 37, 38, 39, 72, 77, 78, 104, 107, 108]);

function laneIndex(lane: number): number {
  const rounded = Math.round(lane);
  return Math.max(1, Math.min(7, rounded));
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
): Promise<NoteSkinTextureBundle> {
  const trackedTextures: Texture[] = [];
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
  const directionalLeft: Array<Texture | null> = new Array(8).fill(null);
  const directionalRight: Array<Texture | null> = new Array(8).fill(null);

  for (let lane = 1; lane <= 7; lane += 1) {
    noteNormal[lane] = await loadCachedTexture(readLaneAssetUrl(rhythmAssets.noteNormal, lane));
    noteNormal16[lane] = await loadCachedTexture(readLaneAssetUrl(rhythmAssets.noteNormal16, lane));
    noteSkill[lane] = await loadCachedTexture(readLaneAssetUrl(rhythmAssets.noteSkill, lane));
    noteFlick[lane] = await loadCachedTexture(readLaneAssetUrl(rhythmAssets.noteFlick, lane));
    noteLong[lane] = await loadCachedTexture(readLaneAssetUrl(rhythmAssets.noteLong, lane));
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
  const noteFlickTopL = await loadCachedTexture(directionalAssets.noteFlickTopL);
  const noteFlickTopR = await loadCachedTexture(directionalAssets.noteFlickTopR);
  const longNoteLine = await loadCachedTexture(rhythmAssets.longNoteLine);
  const longNoteLine2 = await loadCachedTexture(rhythmAssets.longNoteLine2);

  const loadEffectFrames = async (frameUrls: readonly string[]): Promise<Texture[]> => {
    if (frameUrls.length === 0) {
      return [];
    }
    const output: Texture[] = [];
    for (const frameUrl of frameUrls) {
      const texture = await loadCachedTexture(frameUrl);
      if (texture) {
        output.push(texture);
      }
    }
    return output;
  };

  // Current policy: use simulator-embedded effect frames.
  const effectNormal = await loadEffectFrames(EMBEDDED_EFFECT_FRAME_URLS.normal);
  const effectFlick = await loadEffectFrames(EMBEDDED_EFFECT_FRAME_URLS.flick);
  const effectSlide = await loadEffectFrames(EMBEDDED_EFFECT_FRAME_URLS.slide);

  return {
    rhythm: {
      noteNormal,
      noteNormal16,
      noteSkill,
      noteFlick,
      noteLong,
      noteSlideAmong,
      noteFlickTop,
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
    },
    effects: {
      normal: effectNormal,
      flick: effectFlick,
      slide: effectSlide,
    },
    destroy: () => {
      for (const texture of trackedTextures) {
        texture.destroy(true);
      }
    },
  };
}

export function resolveRhythmNoteTexture(
  bundle: NoteSkinTextureBundle,
  type: number,
  lane: number,
  gray: boolean,
): Texture | null {
  const laneIdx = laneIndex(lane);
  if (gray) {
    return bundle.rhythm.noteNormal16[laneIdx] ?? null;
  }
  if (NORMAL_TYPE_SET.has(type)) {
    return bundle.rhythm.noteNormal[laneIdx] ?? null;
  }
  if (LONG_TYPE_SET.has(type)) {
    return bundle.rhythm.noteLong[laneIdx] ?? null;
  }
  if (SKILL_TYPE_SET.has(type)) {
    return bundle.rhythm.noteSkill[laneIdx] ?? null;
  }
  if (FLICK_TYPE_SET.has(type)) {
    return bundle.rhythm.noteFlick[laneIdx] ?? null;
  }
  if (SLIDE_TYPE_SET.has(type)) {
    return bundle.rhythm.noteSlideAmong ?? null;
  }
  return null;
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

export function resolveFlickTopTexture(bundle: NoteSkinTextureBundle): Texture | null {
  return bundle.rhythm.noteFlickTop ?? null;
}
