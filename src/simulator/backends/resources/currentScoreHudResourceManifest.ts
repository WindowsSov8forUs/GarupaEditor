import type {
  RenderAtlasRow,
  RenderResourceAssetProfile,
} from "../renderingContracts";

export interface ScoreHudPortableResourceEntry {
  readonly resourceKeySuffix: string;
  readonly profile: RenderResourceAssetProfile;
}

const LINEAR_CLAMP = Object.freeze({
  scaleMode: "linear" as const,
  wrapModeU: "clamp" as const,
  wrapModeV: "clamp" as const,
  mipmap: "off" as const,
  premultiplyAlpha: true,
  blendMode: "normal" as const,
});

const digitGlyphs = Object.freeze([
  glyph("0", 92, 40, 40, 28, 2, 0, 36),
  glyph("1", 138, 130, 17, 28, 0, 0, 11),
  glyph("2", 43, 100, 37, 28, 2, 0, 33),
  glyph("3", 82, 100, 37, 28, 2, 0, 33),
  glyph("4", 121, 100, 37, 28, 2, 0, 33),
  glyph("5", 160, 100, 37, 28, 2, 0, 33),
  glyph("6", 199, 100, 37, 28, 2, 0, 33),
  glyph("7", 432, 100, 31, 28, 2, 0, 27),
  glyph("8", 263, 130, 37, 27, 2, 1, 33),
  glyph("9", 238, 100, 37, 28, 2, 0, 33),
]);

export interface ScoreHudBitmapGlyph {
  readonly exactKey: string;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly xAdvance: number;
}

export const CURRENT_SCORE_HUD_BITMAP_GLYPHS: readonly ScoreHudBitmapGlyph[] =
  Object.freeze(digitGlyphs.map((row) => Object.freeze({
    exactKey: row.exactKey,
    xOffset: row.xOffset,
    yOffset: row.yOffset,
    xAdvance: row.xAdvance,
  })));

export const CURRENT_SCORE_GAUGE_SS_ANIMATION_RESOURCE = Object.freeze({
  logicalAssetId: "hud/score/score-gauge-ss-animation-profile",
  resourceKeySuffix: "score-gauge-ss-animation-profile.json",
  byteLength: 81471,
  sha256: "B567F40836F22A2368E4CDE205269458A037EDE5733573926910991305ADFA05",
});

export const CURRENT_SCORE_HUD_RESOURCE_IDENTITY =
  "score-hud-rank-gauge-current-10.1.4-portable-v1" as const;

export const CURRENT_SCORE_HUD_PORTABLE_RESOURCES: readonly ScoreHudPortableResourceEntry[] = Object.freeze([
  entry("score-font.png", {
    logicalAssetId: "hud/score/font-atlas",
    role: "font",
    byteLength: 48359,
    sha256: "3DEEB2AA6E0B1CEDCB76208DEED73F81D7B7BE952A59708B6B9F0851F0CEE0FE",
    mime: "image/png",
    width: 512,
    height: 256,
    textureSettings: LINEAR_CLAMP,
    atlasRows: digitGlyphs.map(({ xOffset: _xOffset, yOffset: _yOffset, xAdvance: _xAdvance, ...row }) => row),
    materialRole: "hud",
    animationRole: "none",
    provenance: "current-apk",
  }),
  entry("rhythm-game-ui.png", {
    logicalAssetId: "hud/score/rhythm-game-ui-atlas",
    role: "hud-atlas",
    byteLength: 641969,
    sha256: "7CFEC4DABC83BC20E79E21D6AEB13CD9FA77ABE499E5E088A60C41014B96F6B6",
    mime: "image/png",
    width: 1024,
    height: 1024,
    textureSettings: LINEAR_CLAMP,
    atlasRows: Object.freeze([
      atlas("gauge_base_score", 648, 493, 236, 82),
      atlas("bg_gauge_score_multi", 277, 811, 18, 18),
      atlas("score_meter_blue", 413, 869, 40, 22),
      atlas("score_meter_green", 504, 874, 40, 22),
      atlas("score_meter_orange", 586, 851, 40, 22),
      atlas("score_meter_pink", 277, 877, 40, 22),
      atlas("score_meter_s", 0, 609, 662, 22),
    ]),
    materialRole: "hud",
    animationRole: "none",
    provenance: "current-apk",
  }),
  entry("rank-label-font.ttf", {
    logicalAssetId: "hud/score/rank-label-font",
    role: "font",
    byteLength: 4304904,
    sha256: "949356BBFEA78FB5BC3BA1610E1C64235FCCB9FD9A6F166A996715706FBFCE56",
    mime: "font/ttf",
    width: null,
    height: null,
    textureSettings: null,
    atlasRows: Object.freeze([]),
    materialRole: "hud",
    animationRole: "none",
    provenance: "current-apk",
  }),
  entry("ui-common.png", {
    logicalAssetId: "hud/score/ui-common-atlas",
    role: "hud-atlas",
    byteLength: 43935,
    sha256: "54659D05FB2902A7BD761D581A7DEFE7816B7D96977DCF960CA18F358B415A88",
    mime: "image/png",
    width: 512,
    height: 256,
    textureSettings: LINEAR_CLAMP,
    atlasRows: Object.freeze([atlas("level_mark", 128, 247, 8, 5)]),
    materialRole: "hud",
    animationRole: "none",
    provenance: "current-apk",
  }),
  entry("high-rank-kira.png", fullTexture(
    "hud/score/high-rank-kira", "high-rank-kira", 2002,
    "F7A2AA384A4187C5BAFC2F9A51E31F181BBB331571B254A8F6307C345A68F54D", 64, 64,
  )),
  entry("high-rank-long-star.png", fullTexture(
    "hud/score/high-rank-long-star", "high-rank-long-star", 5658,
    "2F2BBA614FA19EA9D013D880687AF8F4EFC420A86B45E69412F41331671C2A4E", 420, 24,
  )),
  entry("high-rank-overlay.png", fullTexture(
    "hud/score/high-rank-overlay", "high-rank-overlay", 908,
    "5BB09270C1BE907738A2071444E9866A3A19F493148599CE1F15F361719D6594", 64, 32,
  )),
]);

export const CURRENT_SCORE_HUD_BINDINGS = Object.freeze({
  fontLogicalAssetId: "hud/score/font-atlas",
  gaugeLogicalAssetId: "hud/score/rhythm-game-ui-atlas",
  levelMarkLogicalAssetId: "hud/score/ui-common-atlas",
  rankLabelFontLogicalAssetId: "hud/score/rank-label-font",
  highRankKiraLogicalAssetId: "hud/score/high-rank-kira",
  highRankLongStarLogicalAssetId: "hud/score/high-rank-long-star",
  highRankOverlayLogicalAssetId: "hud/score/high-rank-overlay",
});

export const CURRENT_SCORE_HUD_SCENE_PROFILE = Object.freeze({
  viewportCenter: Object.freeze([800, 360] as const),
  rootLocalPosition: Object.freeze([-411, 309] as const),
  totalScoreLocalPosition: Object.freeze([212, -84] as const),
  scoreFontSize: 28,
  scoreFontSourceSize: 32,
  scoreMinimumDigits: 8,
  scoreLeadingColor: 0xbebebe,
  scoreSignificantColor: 0xff3b72,
  progressLocalPosition: Object.freeze([25, -45] as const),
  gauge: Object.freeze({
    background: Object.freeze({ position: Object.freeze([0, -23] as const), width: 470, height: 82 }),
    cover: Object.freeze({ position: Object.freeze([38, -1] as const), width: 427, height: 33 }),
    foreground: Object.freeze({ position: Object.freeze([41, -1] as const), width: 421, height: 24 }),
    indicatorMaximumX: 422,
  }),
  rankRoots: Object.freeze([
    Object.freeze({ rank: "C", x: 50 }),
    Object.freeze({ rank: "B", x: 100 }),
    Object.freeze({ rank: "A", x: 150 }),
    Object.freeze({ rank: "S", x: 200 }),
    Object.freeze({ rank: "SS", x: 420 }),
  ]),
  highRankEffect: Object.freeze({ clip: "ScoreGaugeSS", durationSeconds: 3, loop: true }),
});

function glyph(
  exactKey: string,
  x: number,
  y: number,
  width: number,
  height: number,
  xOffset: number,
  yOffset: number,
  xAdvance: number,
) {
  return Object.freeze({
    ...atlas(exactKey, x, y, width, height),
    xOffset,
    yOffset,
    xAdvance,
  });
}

function atlas(
  exactKey: string,
  x: number,
  y: number,
  width: number,
  height: number,
): RenderAtlasRow {
  return Object.freeze({ exactKey, x, y, width, height, pivotX: 0, pivotY: 0, pixelsPerUnit: 100 });
}

function fullTexture(
  logicalAssetId: string,
  exactKey: string,
  byteLength: number,
  sha256: string,
  width: number,
  height: number,
): RenderResourceAssetProfile {
  return Object.freeze({
    logicalAssetId,
    role: "hud-atlas" as const,
    byteLength,
    sha256,
    mime: "image/png" as const,
    width,
    height,
    textureSettings: LINEAR_CLAMP,
    atlasRows: Object.freeze([atlas(exactKey, 0, 0, width, height)]),
    materialRole: "hud" as const,
    animationRole: "none" as const,
    provenance: "current-apk" as const,
  });
}

function entry(
  resourceKeySuffix: string,
  profile: RenderResourceAssetProfile,
): ScoreHudPortableResourceEntry {
  return Object.freeze({ resourceKeySuffix, profile: Object.freeze(profile) });
}
