import { Rectangle, Texture } from "pixi.js";
import {
  getLevel3NguiSpriteMetrics,
  getLevel3WidgetMetrics,
  RHYTHM_UI_PATHS,
  type NguiSpriteAdvancedType,
  type NguiSpriteAdvancedTypes,
} from "./uiHudLayout";
import embeddedRhythmGameUiUrl from "../assets/ui/RhythmGameUI.png";
import embeddedUiCommonUrl from "../assets/ui/UICommon.png";
import embeddedScoreFontUrl from "../assets/ui/score.png";

export interface AtlasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NguiSlicedSpriteData extends AtlasRect {
  borderLeft: number;
  borderRight: number;
  borderTop: number;
  borderBottom: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
  centerType: NguiSpriteAdvancedType;
}

export interface NguiAdvancedSpriteData extends NguiSlicedSpriteData {
  advancedTypes: NguiSpriteAdvancedTypes;
}

export interface RenderedHudSpriteDataUrls {
  bgHealth: string | null;
  hpMeter: string | null;
  hpMeterMain: string | null;
  hpMeterSecond: string | null;
  gaugeBaseScore: string | null;
  bgGaugeScoreMulti: string | null;
  levelMark: string | null;
}

export interface BitmapGlyphRect extends AtlasRect {
  xOffset: number;
  yOffset: number;
  xAdvance: number;
}

export const COMBO_NUMBER_DIGIT_WIDTH = 82;
export const COMBO_NUMBER_DIGIT_HEIGHT = 116;
export const COMBO_NUMBER_PADDING = -12;

// Source: HOST________/VSCode/bangdream-apk/reverse/analysis/targets/runtime-ui-binding-report.*
// and IconComboNumber NGUI atlas.
export const ICON_COMBO_NUMBER_NORMAL_DIGIT_RECTS: readonly AtlasRect[] = [
  { x: 336, y: 396, width: 82, height: 116 },
  { x: 168, y: 396, width: 82, height: 116 },
  { x: 84, y: 42, width: 82, height: 116 },
  { x: 84, y: 160, width: 82, height: 116 },
  { x: 84, y: 278, width: 82, height: 116 },
  { x: 84, y: 396, width: 82, height: 116 },
  { x: 0, y: 42, width: 82, height: 116 },
  { x: 0, y: 160, width: 82, height: 116 },
  { x: 0, y: 278, width: 82, height: 116 },
  { x: 252, y: 396, width: 82, height: 116 },
];

export const ICON_COMBO_NUMBER_AP_DIGIT_RECTS: readonly AtlasRect[] = [
  { x: 0, y: 396, width: 82, height: 116 },
  { x: 252, y: 160, width: 82, height: 116 },
  { x: 420, y: 278, width: 82, height: 116 },
  { x: 336, y: 278, width: 82, height: 116 },
  { x: 252, y: 278, width: 82, height: 116 },
  { x: 168, y: 42, width: 82, height: 116 },
  { x: 168, y: 160, width: 82, height: 116 },
  { x: 168, y: 278, width: 82, height: 116 },
  { x: 420, y: 396, width: 82, height: 116 },
  { x: 252, y: 42, width: 82, height: 116 },
];

export const ICON_COMBO_NUMBER_PLUS_RECT: AtlasRect = { x: 336, y: 160, width: 82, height: 116 };

// Source: RhythmGameUI Texture2D 923acbc2709f740bb8f9ccbd6fed5d52 and
// UISpriteData_Fields from reverse/il2cpp/dump/il2cpp.h. Values are
// name, x, y, width, height, borderLeft, borderRight, borderTop, borderBottom,
// paddingLeft, paddingRight, paddingTop, paddingBottom.
export const RHYTHM_GAME_UI_RECTS = {
  buttonPause: { x: 828, y: 319, width: 64, height: 64 },
  bgHealth: { x: 0, y: 329, width: 186, height: 62 },
  hpMeter: { x: 208, y: 124, width: 17, height: 26 },
  effectHealthCautionOutline: { x: 238, y: 417, width: 180, height: 83 },
  effectHealthCautionInside: { x: 802, y: 194, width: 188, height: 27 },
  gaugeBaseScore: { x: 648, y: 449, width: 236, height: 82 },
  scoreMeterBlue: { x: 413, y: 133, width: 40, height: 22 },
  bgGaugeScoreMulti: { x: 277, y: 195, width: 18, height: 18 },
} as const satisfies Record<string, AtlasRect>;

// Source: RankObject Separator UISprite atlas PPtr fileID=16/pathID=1883
// resolves to sharedassets0.assets UIAtlas. That UIAtlas material is UICommon
// pathID=6, whose _MainTex is Texture2D pathID=18. Raw UIAtlas.mSprites entry
// 27 is level_mark: x=128, y=4, width=8, height=5, with zero border/padding.
export const UI_COMMON_ATLAS_RECTS = {
  levelMark: { x: 128, y: 4, width: 8, height: 5 },
} as const satisfies Record<string, AtlasRect>;

const lifeGaugeBackgroundSprite = getLevel3NguiSpriteMetrics(RHYTHM_UI_PATHS.lifeGaugeBackground);
const lifeGaugeFrontSprite = getLevel3NguiSpriteMetrics(RHYTHM_UI_PATHS.lifeGaugeFront);
const lifeGaugeSecondFrontSprite = getLevel3NguiSpriteMetrics(RHYTHM_UI_PATHS.lifeGaugeSecondFront);
const scoreBackgroundSprite = getLevel3NguiSpriteMetrics(RHYTHM_UI_PATHS.scoreBackground);
const scoreForegroundSprite = getLevel3NguiSpriteMetrics(RHYTHM_UI_PATHS.scoreForeground);
const scoreBackgroundCoverSprite = getLevel3NguiSpriteMetrics(RHYTHM_UI_PATHS.scoreBackgroundCover);
const lifeGaugeBackgroundWidget = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.lifeGaugeBackground);
const lifeGaugeFrontWidget = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.lifeGaugeFront);
const lifeGaugeSecondFrontWidget = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.lifeGaugeSecondFront);
const scoreBackgroundWidget = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.scoreBackground);
const scoreBackgroundCoverWidget = getLevel3WidgetMetrics(RHYTHM_UI_PATHS.scoreBackgroundCover);

function requireAdvancedTypes(name: string, advancedTypes: NguiSpriteAdvancedTypes | undefined): NguiSpriteAdvancedTypes {
  if (!advancedTypes) {
    throw new Error(`Missing AdvancedType fields for NGUI sprite: ${name}`);
  }
  return advancedTypes;
}

export const RHYTHM_GAME_UI_SLICED_SPRITES = {
  bgHealth: {
    ...RHYTHM_GAME_UI_RECTS.bgHealth,
    borderLeft: 39,
    borderRight: 143,
    borderTop: 0,
    borderBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    centerType: requireAdvancedTypes("bg_health", lifeGaugeBackgroundSprite.advancedTypes).center,
  },
  hpMeter: {
    ...RHYTHM_GAME_UI_RECTS.hpMeter,
    borderLeft: 4,
    borderRight: 4,
    borderTop: 0,
    borderBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    centerType: requireAdvancedTypes("hp_meter", lifeGaugeFrontSprite.advancedTypes).center,
  },
  scoreMeterBlue: {
    ...RHYTHM_GAME_UI_RECTS.scoreMeterBlue,
    borderLeft: 4,
    borderRight: 4,
    borderTop: 3,
    borderBottom: 3,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    centerType: requireAdvancedTypes("score_meter_blue", scoreForegroundSprite.advancedTypes).center,
  },
} as const satisfies Record<string, NguiSlicedSpriteData>;

export const RHYTHM_GAME_UI_ADVANCED_SPRITES = {
  gaugeBaseScore: {
    ...RHYTHM_GAME_UI_RECTS.gaugeBaseScore,
    borderLeft: 216,
    borderRight: 16,
    borderTop: 0,
    borderBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    centerType: requireAdvancedTypes("gauge_base_score", scoreBackgroundSprite.advancedTypes).center,
    advancedTypes: requireAdvancedTypes("gauge_base_score", scoreBackgroundSprite.advancedTypes),
  },
  bgGaugeScoreMulti: {
    ...RHYTHM_GAME_UI_RECTS.bgGaugeScoreMulti,
    borderLeft: 8,
    borderRight: 8,
    borderTop: 8,
    borderBottom: 8,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    centerType: requireAdvancedTypes("bg_gauge_score_multi", scoreBackgroundCoverSprite.advancedTypes).center,
    advancedTypes: requireAdvancedTypes("bg_gauge_score_multi", scoreBackgroundCoverSprite.advancedTypes),
  },
} as const satisfies Record<string, NguiAdvancedSpriteData>;

// Source: level3 UISprite/UIWidget serialized width/height for the restored HUD sprites.
const RHYTHM_GAME_UI_HUD_RENDER_SIZES = {
  bgHealth: { width: lifeGaugeBackgroundWidget.width, height: lifeGaugeBackgroundWidget.height },
  hpMeter: { width: lifeGaugeFrontWidget.width, height: lifeGaugeFrontWidget.height },
  hpMeterMain: { width: lifeGaugeFrontWidget.width, height: lifeGaugeFrontWidget.height },
  hpMeterSecond: { width: lifeGaugeSecondFrontWidget.width, height: lifeGaugeSecondFrontWidget.height },
  gaugeBaseScore: { width: scoreBackgroundWidget.width, height: scoreBackgroundWidget.height },
  bgGaugeScoreMulti: { width: scoreBackgroundCoverWidget.width, height: scoreBackgroundCoverWidget.height },
} as const;

if (lifeGaugeSecondFrontSprite.spriteName !== lifeGaugeFrontSprite.spriteName) {
  throw new Error(`Unsupported hp_gauge_second sprite binding: ${JSON.stringify(lifeGaugeSecondFrontSprite)}`);
}

// Source: HOST________/VSCode/bangdream-apk/reverse/ghidra/decompilations/
// ghidra-decompile-rhythm-systems/331D8F4__01__b'InGameUtility$$.cctor'.c.
// InGameUtility.NormalGaugeColor is initialized by
// ColorUtility.GetColorWithHex(0x6e, 0xff, 0x69, 0xff), then
// InGameLifeGauge.updateGaugeColor applies it to hp_gauge_round/FrontGauge.
// hpMeterSecond still uses its serialized UISprite f116-128 color from
// HOST________/VSCode/bangdream-apk/reverse/analysis/targets/level3-hud-subtree-report.*.
// RhythmGameUI uses shader "Unlit/Transparent Colored", and
// NGUIAtlas.get_premultipliedAlpha only enables PMA for Premultiplied shaders
// in ghidra-decompile-ngui-atlas-pma. Keep these as straight RGBA tints.
const RHYTHM_GAME_UI_HUD_RENDER_TINTS = {
  hpMeterMain: { red: 0x6e / 0xff, green: 1, blue: 0x69 / 0xff, alpha: 1 },
  hpMeterSecond: { red: 0.365517258644104, green: 1, blue: 0, alpha: 0.39100000262260437 },
} as const;

// Source: TextAsset score 6701cd85a7a5c4385bd4840f2273ed1b BMFont data.
export const SCORE_FONT_GLYPHS = {
  "+": { x: 25, y: 182, width: 20, height: 16, xOffset: 2, yOffset: 7, xAdvance: 16 },
  "0": { x: 92, y: 40, width: 40, height: 28, xOffset: 2, yOffset: 0, xAdvance: 36 },
  "1": { x: 138, y: 130, width: 17, height: 28, xOffset: 0, yOffset: 0, xAdvance: 11 },
  "2": { x: 43, y: 100, width: 37, height: 28, xOffset: 2, yOffset: 0, xAdvance: 33 },
  "3": { x: 82, y: 100, width: 37, height: 28, xOffset: 2, yOffset: 0, xAdvance: 33 },
  "4": { x: 121, y: 100, width: 37, height: 28, xOffset: 2, yOffset: 0, xAdvance: 33 },
  "5": { x: 160, y: 100, width: 37, height: 28, xOffset: 2, yOffset: 0, xAdvance: 33 },
  "6": { x: 199, y: 100, width: 37, height: 28, xOffset: 2, yOffset: 0, xAdvance: 33 },
  "7": { x: 432, y: 100, width: 31, height: 28, xOffset: 2, yOffset: 0, xAdvance: 27 },
  "8": { x: 263, y: 130, width: 37, height: 27, xOffset: 2, yOffset: 1, xAdvance: 33 },
  "9": { x: 238, y: 100, width: 37, height: 28, xOffset: 2, yOffset: 0, xAdvance: 33 },
} as const satisfies Record<string, BitmapGlyphRect>;

export const SCORE_FONT_LINE_HEIGHT = 36;
export const SCORE_FONT_BASELINE = 24;

export function cropPixiAtlasTexture(source: Texture | null, rect: AtlasRect): Texture | null {
  if (!source || rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return new Texture({
    source: source.source,
    frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
  });
}

export function buildPixiAtlasTextureList(
  source: Texture | null,
  rects: readonly AtlasRect[],
): Array<Texture | null> {
  return rects.map((rect) => cropPixiAtlasTexture(source, rect));
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`image decode failed: ${url.slice(0, 96)}`));
    image.src = url;
  });
}

let rhythmGameUiDataUrlCache: Promise<Record<keyof typeof RHYTHM_GAME_UI_RECTS, string | null>> | null = null;
let rhythmGameUiHudDataUrlCache: Promise<RenderedHudSpriteDataUrls> | null = null;
let rhythmGameUiImageCache: Promise<HTMLImageElement> | null = null;
let uiCommonDataUrlCache: Promise<Record<keyof typeof UI_COMMON_ATLAS_RECTS, string | null>> | null = null;
let scoreFontDataUrlCache: Promise<Record<keyof typeof SCORE_FONT_GLYPHS, string | null>> | null = null;

async function loadAtlasSpriteDataUrls<T extends Record<string, AtlasRect>>(
  imageUrl: string,
  rects: T,
): Promise<Record<keyof T, string | null>> {
  const image = await loadImageElement(imageUrl);
  const output = {} as Record<keyof T, string | null>;
  for (const [key, rect] of Object.entries(rects) as Array<[keyof T, AtlasRect]>) {
    const canvas = document.createElement("canvas");
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      output[key] = null;
      continue;
    }
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.drawImage(
      image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );
    output[key] = canvas.toDataURL("image/png");
  }
  return output;
}

function resolveNguiBorderPair(start: number, end: number, targetSize: number): { start: number; end: number } {
  const clampedStart = Math.max(0, start);
  const clampedEnd = Math.max(0, end);
  const clampedTarget = Math.max(0, targetSize);
  const borderTotal = clampedStart + clampedEnd;
  if (borderTotal <= clampedTarget || borderTotal <= 0) {
    return { start: clampedStart, end: clampedEnd };
  }
  const scale = clampedTarget / borderTotal;
  return {
    start: clampedStart * scale,
    end: clampedEnd * scale,
  };
}

function drawNineSlicedSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  sprite: NguiSlicedSpriteData,
  targetWidth: number,
  targetHeight: number,
  tint?: { red: number; green: number; blue: number; alpha: number },
): void {
  const left = Math.max(0, Math.min(sprite.borderLeft, sprite.width));
  const right = Math.max(0, Math.min(sprite.borderRight, sprite.width - left));
  const top = Math.max(0, Math.min(sprite.borderTop, sprite.height));
  const bottom = Math.max(0, Math.min(sprite.borderBottom, sprite.height - top));
  const centerWidth = Math.max(0, sprite.width - left - right);
  const centerHeight = Math.max(0, sprite.height - top - bottom);
  const targetHorizontalBorders = resolveNguiBorderPair(left, right, targetWidth);
  const targetVerticalBorders = resolveNguiBorderPair(top, bottom, targetHeight);
  const targetLeft = targetHorizontalBorders.start;
  const targetRight = targetHorizontalBorders.end;
  const targetTop = targetVerticalBorders.start;
  const targetBottom = targetVerticalBorders.end;
  const targetCenterWidth = Math.max(0, targetWidth - targetLeft - targetRight);
  const targetCenterHeight = Math.max(0, targetHeight - targetTop - targetBottom);

  const cols = [
    { sx: sprite.x, sw: left, dx: 0, dw: targetLeft },
    { sx: sprite.x + left, sw: centerWidth, dx: targetLeft, dw: targetCenterWidth },
    { sx: sprite.x + sprite.width - right, sw: right, dx: targetWidth - targetRight, dw: targetRight },
  ];
  const rows = [
    { sy: sprite.y, sh: top, dy: 0, dh: targetTop },
    { sy: sprite.y + top, sh: centerHeight, dy: targetTop, dh: targetCenterHeight },
    { sy: sprite.y + sprite.height - bottom, sh: bottom, dy: targetHeight - targetBottom, dh: targetBottom },
  ];

  for (let colIndex = 0; colIndex < cols.length; colIndex += 1) {
    const col = cols[colIndex];
    if (col.sw <= 0 || col.dw <= 0) {
      continue;
    }
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (row.sh <= 0 || row.dh <= 0) {
        continue;
      }
      if (colIndex === 1 && rowIndex === 1 && sprite.centerType.name === "Invisible") {
        continue;
      }
      ctx.drawImage(image, col.sx, row.sy, col.sw, row.sh, col.dx, row.dy, col.dw, row.dh);
    }
  }

  if (!tint) {
    return;
  }
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    data[index] = Math.round(data[index] * tint.red);
    data[index + 1] = Math.round(data[index + 1] * tint.green);
    data[index + 2] = Math.round(data[index + 2] * tint.blue);
    data[index + 3] = Math.round(data[index + 3] * tint.alpha);
  }
  ctx.putImageData(imageData, 0, 0);
}

function drawImageTiled(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) {
    return;
  }
  for (let y = 0; y < dh; y += sh) {
    const tileHeight = Math.min(sh, dh - y);
    for (let x = 0; x < dw; x += sw) {
      const tileWidth = Math.min(sw, dw - x);
      ctx.drawImage(image, sx, sy, tileWidth, tileHeight, dx + x, dy + y, tileWidth, tileHeight);
    }
  }
}

function drawAdvancedRegion(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  mode: NguiSpriteAdvancedType,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  if (mode.name === "Invisible" || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) {
    return;
  }
  if (mode.name === "Tiled") {
    drawImageTiled(ctx, image, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawAdvancedSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  sprite: NguiAdvancedSpriteData,
  targetWidth: number,
  targetHeight: number,
): void {
  const left = Math.max(0, Math.min(sprite.borderLeft, sprite.width));
  const right = Math.max(0, Math.min(sprite.borderRight, sprite.width - left));
  const top = Math.max(0, Math.min(sprite.borderTop, sprite.height));
  const bottom = Math.max(0, Math.min(sprite.borderBottom, sprite.height - top));
  const centerWidth = Math.max(0, sprite.width - left - right);
  const centerHeight = Math.max(0, sprite.height - top - bottom);
  const targetHorizontalBorders = resolveNguiBorderPair(left, right, targetWidth);
  const targetVerticalBorders = resolveNguiBorderPair(top, bottom, targetHeight);
  const targetLeft = targetHorizontalBorders.start;
  const targetRight = targetHorizontalBorders.end;
  const targetTop = targetVerticalBorders.start;
  const targetBottom = targetVerticalBorders.end;
  const targetCenterWidth = Math.max(0, targetWidth - targetLeft - targetRight);
  const targetCenterHeight = Math.max(0, targetHeight - targetTop - targetBottom);

  const cols = [
    { sx: sprite.x, sw: left, dx: 0, dw: targetLeft, mode: sprite.advancedTypes.left },
    { sx: sprite.x + left, sw: centerWidth, dx: targetLeft, dw: targetCenterWidth, mode: sprite.advancedTypes.center },
    { sx: sprite.x + sprite.width - right, sw: right, dx: targetWidth - targetRight, dw: targetRight, mode: sprite.advancedTypes.right },
  ];
  const rows = [
    { sy: sprite.y, sh: top, dy: 0, dh: targetTop, mode: sprite.advancedTypes.top },
    { sy: sprite.y + top, sh: centerHeight, dy: targetTop, dh: targetCenterHeight, mode: null },
    { sy: sprite.y + sprite.height - bottom, sh: bottom, dy: targetHeight - targetBottom, dh: targetBottom, mode: sprite.advancedTypes.bottom },
  ];

  for (let colIndex = 0; colIndex < cols.length; colIndex += 1) {
    const col = cols[colIndex];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const mode = row.mode ?? col.mode;
      drawAdvancedRegion(ctx, image, mode, col.sx, row.sy, col.sw, row.sh, col.dx, row.dy, col.dw, row.dh);
    }
  }
}

async function loadRenderedRhythmGameUiHudSpriteDataUrls(): Promise<RenderedHudSpriteDataUrls> {
  const image = await loadRhythmGameUiImage();
  const output = {} as RenderedHudSpriteDataUrls;
  for (const key of Object.keys(RHYTHM_GAME_UI_HUD_RENDER_SIZES) as Array<keyof typeof RHYTHM_GAME_UI_HUD_RENDER_SIZES>) {
    const size = RHYTHM_GAME_UI_HUD_RENDER_SIZES[key];
    const advancedSprite = RHYTHM_GAME_UI_ADVANCED_SPRITES[key as keyof typeof RHYTHM_GAME_UI_ADVANCED_SPRITES];
    if (advancedSprite) {
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        output[key] = null;
        continue;
      }
      ctx.clearRect(0, 0, size.width, size.height);
      drawAdvancedSprite(ctx, image, advancedSprite, size.width, size.height);
      output[key] = canvas.toDataURL("image/png");
      continue;
    }
    const sourceKey = key === "hpMeterMain" || key === "hpMeterSecond" ? "hpMeter" : key;
    const sprite = RHYTHM_GAME_UI_SLICED_SPRITES[sourceKey as keyof typeof RHYTHM_GAME_UI_SLICED_SPRITES];
    if (!sprite) {
      output[key] = null;
      continue;
    }
    const tint = key === "hpMeterMain"
      ? RHYTHM_GAME_UI_HUD_RENDER_TINTS.hpMeterMain
      : key === "hpMeterSecond"
        ? RHYTHM_GAME_UI_HUD_RENDER_TINTS.hpMeterSecond
        : undefined;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      output[key] = null;
      continue;
    }
    ctx.clearRect(0, 0, size.width, size.height);
    drawNineSlicedSprite(ctx, image, sprite, size.width, size.height, tint);
    output[key] = canvas.toDataURL("image/png");
  }
  const uiCommonSprites = await loadUiCommonSpriteDataUrls();
  output.levelMark = uiCommonSprites.levelMark;
  return output;
}

function loadRhythmGameUiImage(): Promise<HTMLImageElement> {
  if (!rhythmGameUiImageCache) {
    rhythmGameUiImageCache = loadImageElement(embeddedRhythmGameUiUrl);
  }
  return rhythmGameUiImageCache;
}

export async function loadRhythmGameUiSpriteDataUrls(): Promise<Record<keyof typeof RHYTHM_GAME_UI_RECTS, string | null>> {
  if (!rhythmGameUiDataUrlCache) {
    rhythmGameUiDataUrlCache = loadAtlasSpriteDataUrls(embeddedRhythmGameUiUrl, RHYTHM_GAME_UI_RECTS)
      .catch(() => {
        const output = {} as Record<keyof typeof RHYTHM_GAME_UI_RECTS, string | null>;
        for (const key of Object.keys(RHYTHM_GAME_UI_RECTS) as Array<keyof typeof RHYTHM_GAME_UI_RECTS>) {
          output[key] = null;
        }
        return output;
      });
  }
  return rhythmGameUiDataUrlCache;
}

export async function loadUiCommonSpriteDataUrls(): Promise<Record<keyof typeof UI_COMMON_ATLAS_RECTS, string | null>> {
  if (!uiCommonDataUrlCache) {
    uiCommonDataUrlCache = loadAtlasSpriteDataUrls(embeddedUiCommonUrl, UI_COMMON_ATLAS_RECTS)
      .catch(() => {
        const output = {} as Record<keyof typeof UI_COMMON_ATLAS_RECTS, string | null>;
        for (const key of Object.keys(UI_COMMON_ATLAS_RECTS) as Array<keyof typeof UI_COMMON_ATLAS_RECTS>) {
          output[key] = null;
        }
        return output;
      });
  }
  return uiCommonDataUrlCache;
}

export async function loadRhythmGameUiHudSpriteDataUrls(): Promise<RenderedHudSpriteDataUrls> {
  if (!rhythmGameUiHudDataUrlCache) {
    rhythmGameUiHudDataUrlCache = loadRenderedRhythmGameUiHudSpriteDataUrls()
      .catch(() => ({
        bgHealth: null,
        hpMeter: null,
        hpMeterMain: null,
        hpMeterSecond: null,
        gaugeBaseScore: null,
        bgGaugeScoreMulti: null,
        levelMark: null,
      }));
  }
  return rhythmGameUiHudDataUrlCache;
}

export async function loadScoreFontGlyphDataUrls(): Promise<Record<keyof typeof SCORE_FONT_GLYPHS, string | null>> {
  if (!scoreFontDataUrlCache) {
    scoreFontDataUrlCache = loadAtlasSpriteDataUrls(embeddedScoreFontUrl, SCORE_FONT_GLYPHS)
      .then((image) => {
        return image;
      })
      .catch(() => {
        const output = {} as Record<keyof typeof SCORE_FONT_GLYPHS, string | null>;
        for (const key of Object.keys(SCORE_FONT_GLYPHS) as Array<keyof typeof SCORE_FONT_GLYPHS>) {
          output[key] = null;
        }
        return output;
      });
  }
  return scoreFontDataUrlCache;
}

export async function loadPauseButtonImageDataUrl(): Promise<string | null> {
  const sprites = await loadRhythmGameUiSpriteDataUrls();
  return sprites.buttonPause;
}
