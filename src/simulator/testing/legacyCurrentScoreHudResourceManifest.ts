import type {
  RenderAtlasRow,
  RenderResourceAssetProfile,
} from "../backends/renderingContracts";

export interface ScoreHudPortableResourceEntry {
  readonly resourceKeySuffix: string;
  readonly profile: RenderResourceAssetProfile;
}

const LINEAR_CLAMP = Object.freeze({
  scaleMode: "linear" as const,
  wrapModeU: "clamp" as const,
  wrapModeV: "clamp" as const,
  mipmap: "off" as const,
  premultiplyAlpha: false,
  blendMode: "normal" as const,
});

export const CURRENT_SCORE_GAUGE_SS_ANIMATION_RESOURCE = Object.freeze({
  logicalAssetId: "hud/score/score-gauge-ss-animation-profile",
  resourceKeySuffix: "score-gauge-ss-animation-profile.json",
  byteLength: 81471,
  sha256: "B567F40836F22A2368E4CDE205269458A037EDE5733573926910991305ADFA05",
});

export const CURRENT_SCORE_HUD_RESOURCE_IDENTITY =
  "score-hud-rank-gauge-current-10.1.4-portable-v1" as const;

export const CURRENT_SCORE_HUD_PORTABLE_RESOURCES: readonly ScoreHudPortableResourceEntry[] = Object.freeze([
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
      scoreAtlas("gauge_base_score", 648, 449, 236, 82, [216, 16, 0, 0]),
      scoreAtlas("bg_gauge_score_multi", 277, 195, 18, 18, [8, 8, 8, 8]),
      scoreAtlas("score_meter_blue", 413, 133, 40, 22, [4, 4, 3, 3]),
      scoreAtlas("score_meter_green", 504, 128, 40, 22, [5, 5, 0, 0]),
      scoreAtlas("score_meter_orange", 586, 151, 40, 22, [5, 5, 0, 0]),
      scoreAtlas("score_meter_pink", 277, 125, 40, 22, [5, 5, 0, 0]),
      scoreAtlas("score_meter_s", 0, 393, 662, 22, [0, 0, 0, 0]),
      atlas("btn_ingame_time_back", 909, 920, 104, 104),
      atlas("btn_ingame_time_forward", 899, 311, 104, 104),
      atlas("bg_base_r6_inside_rhythm", 481, 616, 24, 24, [6, 6, 6, 6]),
      atlas("label_round_white", 302, 245, 60, 40, [25, 25, 0, 0]),
      atlas("bg_health", 0, 329, 186, 62, [39, 143, 0, 0]),
      atlas("bg_no_health", 349, 668, 131, 69, [50, 50, 0, 0]),
      atlas("combo", 592, 175, 150, 42),
      atlas("combo_AP", 837, 205, 150, 42),
      atlas("hp_meter", 208, 124, 17, 26, [4, 4, 0, 0]),
      atlas("icon_number_0", 147, 197, 47, 70, [2, 2, 0, 0]),
      atlas("icon_number_1", 98, 197, 47, 70, [8, 9, 1, 1]),
      atlas("icon_number_2", 0, 197, 47, 70, [1, 1, 0, 0]),
      atlas("icon_number_3", 49, 197, 47, 70, [1, 1, 0, 0]),
      atlas("icon_number_4", 237, 269, 47, 70),
      atlas("icon_number_5", 188, 269, 47, 70, [0, 1, 0, 0]),
      atlas("icon_number_6", 953, 133, 47, 70, [0, 1, 0, 0]),
      atlas("icon_number_7", 228, 137, 47, 70, [1, 1, 0, 0]),
      atlas("icon_number_8", 966, 61, 47, 70, [1, 0, 0, 0]),
      atlas("icon_number_9", 917, 61, 47, 70, [2, 1, 0, 0]),
      atlas("icon_number_plus", 432, 596, 47, 70),
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
    atlasRows: Object.freeze([
      atlas("level_mark", 128, 4, 8, 5),
      atlas("bg_base_jacket_frame", 206, 92, 34, 34, [4, 4, 4, 4]),
      atlas("bg_jacket_frame_rank_1_easy", 206, 70, 20, 20, [1, 1, 1, 1]),
      atlas("bg_jacket_frame_rank_1_expert", 228, 70, 20, 20, [1, 1, 1, 1]),
      atlas("bg_jacket_frame_rank_1_hard", 250, 74, 20, 20, [1, 1, 1, 1]),
      atlas("bg_jacket_frame_rank_1_normal", 244, 144, 20, 20, [1, 1, 1, 1]),
      atlas("bg_jacket_frame_rank_1_special", 128, 11, 20, 20, [1, 1, 1, 1]),
      atlas("icon_fullmusic_gray", 82, 33, 70, 34),
      atlas("jacket_challengeframe", 82, 7, 24, 24, [10, 10, 10, 10]),
      atlas("label_challenge", 82, 69, 122, 23),
      atlas("label_square_white", 150, 5, 12, 12, [4, 4, 4, 4]),
    ]),
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
  fontLogicalAssetId: "hud/score/rank-label-font",
  gaugeLogicalAssetId: "hud/score/rhythm-game-ui-atlas",
  levelMarkLogicalAssetId: "hud/score/ui-common-atlas",
  rankLabelFontLogicalAssetId: "hud/score/rank-label-font",
  highRankKiraLogicalAssetId: "hud/score/high-rank-kira",
  highRankLongStarLogicalAssetId: "hud/score/high-rank-long-star",
  highRankOverlayLogicalAssetId: "hud/score/high-rank-overlay",
});

export const CURRENT_SCORE_HUD_NINE_SLICE_BORDERS = Object.freeze({
  gaugeBase: nguiBorder(216, 16, 0, 0),
  gaugeCover: nguiBorder(8, 8, 8, 8),
  meterBlue: nguiBorder(4, 4, 3, 3),
  meterOther: nguiBorder(5, 5, 0, 0),
  meterS: nguiBorder(0, 0, 0, 0),
  rehearsalTime: nguiBorder(6, 6, 6, 6),
  autoLiveCaption: nguiBorder(25, 25, 0, 0),
});

export const CURRENT_SCORE_HUD_SCENE_PROFILE = Object.freeze({
  rootLocalPosition: Object.freeze([-411, 309] as const),
  totalScoreLocalPosition: Object.freeze([212, -84] as const),
  scoreMinimumDigits: 8,
  scoreLeadingColor: 0xbebebe,
  scoreSignificantColor: 0xff3b72,
  totalScoreDepth: 40,
  progressLocalPosition: Object.freeze([25, -45] as const),
  gauge: Object.freeze({
    background: Object.freeze({ position: Object.freeze([0, -23] as const), width: 470, height: 82, depth: 4 }),
    cover: Object.freeze({ position: Object.freeze([38, -1] as const), width: 427, height: 33, depth: 28 }),
    foreground: Object.freeze({ position: Object.freeze([41, -1] as const), width: 421, height: 24, depth: 5 }),
    markerDepth: 29,
    indicatorMaximumX: 422,
    highRankPanel: Object.freeze({
      targetLeftX: 38,
      leftAbsolute: 4,
      bottomY: -25.5,
      topY: 13.5,
      minimumWidth: 2,
      softness: Object.freeze([20, 3] as const),
    }),
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

function atlas(
  exactKey: string,
  x: number,
  y: number,
  width: number,
  height: number,
  border: readonly [number, number, number, number] = [0, 0, 0, 0],
): RenderAtlasRow {
  return Object.freeze({
    exactKey, x, y, width, height, pivotX: 0, pivotY: 0, pixelsPerUnit: 100,
    borderLeft: border[0], borderRight: border[1], borderTop: border[2], borderBottom: border[3],
  });
}

function scoreAtlas(
  exactKey: string,
  x: number,
  y: number,
  width: number,
  height: number,
  nguiLeftRightTopBottom: readonly [number, number, number, number],
): RenderAtlasRow {
  return Object.freeze({
    exactKey, x, y, width, height, pivotX: 0, pivotY: 0, pixelsPerUnit: 100,
    borderLeft: nguiLeftRightTopBottom[0],
    borderRight: nguiLeftRightTopBottom[1],
    borderTop: nguiLeftRightTopBottom[2],
    borderBottom: nguiLeftRightTopBottom[3],
  });
}

function nguiBorder(
  left: number,
  right: number,
  top: number,
  bottom: number,
) {
  return Object.freeze({ left, top, right, bottom });
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
