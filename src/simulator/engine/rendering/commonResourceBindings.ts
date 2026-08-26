import type { RenderEngineResourceBindings } from "./renderCommandProducer";

export const STARTUP_DIRECTION_RESOURCE_EVIDENCE_IDS = Object.freeze([
  "SD01", "SD02", "SD03", "SD04", "SD05", "SD06", "SD07", "SD08",
  "SD09", "SD10", "SD11", "SD12", "SD13", "SD14", "SD15", "SD16",
] as const);

export const COMMON_SCORE_HUD_BINDINGS = Object.freeze({
  fontLogicalAssetId: "hud/score/rank-label-font",
  gaugeLogicalAssetId: "hud/score/rhythm-game-ui-atlas",
  levelMarkLogicalAssetId: "hud/score/ui-common-atlas",
  rankLabelFontLogicalAssetId: "hud/score/rank-label-font",
  highRankKiraLogicalAssetId: "hud/score/high-rank-kira",
  highRankLongStarLogicalAssetId: "hud/score/high-rank-long-star",
  highRankOverlayLogicalAssetId: "hud/score/high-rank-overlay",
});

export const COMMON_ORDINARY_VISIBLE_BINDINGS = Object.freeze({
  comboNumberLogicalAssetId: "hud/ordinary/combo-number-atlas",
  judgeLogicalAssetId: "hud/ordinary/judge-atlas",
  lifeAdditiveLogicalAssetId: "hud/ordinary/rhythm-game-additive-atlas",
  warningLogicalAssetId: "hud/ordinary/ui-additive-effect-atlas",
  tapLaneEffectLogicalAssetIds: Object.freeze([
    "field/ordinary/tap-lane-effect-1",
    "field/ordinary/tap-lane-effect-2",
    "field/ordinary/tap-lane-effect-3",
    "field/ordinary/tap-lane-effect-4",
  ] as const),
});

export const COMMON_PAUSE_CONTROL_BINDINGS = Object.freeze({
  rhythmGameUiLogicalAssetId: "hud/score/rhythm-game-ui-atlas",
  uiCommonLogicalAssetId: "hud/score/ui-common-atlas",
  fontLogicalAssetId: "hud/score/rank-label-font",
  countdownLogicalAssetIds: Object.freeze([
    "ui/pause/countdown-1",
    "ui/pause/countdown-2",
    "ui/pause/countdown-3",
  ] as const),
});

export const COMMON_STARTUP_DIRECTION_BINDINGS = Object.freeze({
  lineStarLogicalAssetId: "startup/information/line-star",
  uiCommonLogicalAssetId: "hud/score/ui-common-atlas",
  rhythmGameUiLogicalAssetId: "hud/score/rhythm-game-ui-atlas",
  fontLogicalAssetId: "hud/score/rank-label-font",
});

export const BASE_DYNAMIC_RENDER_BINDINGS: RenderEngineResourceBindings = Object.freeze({
  noteAtlasLogicalAssetId: "unbound/skin/note",
  directionalAtlasLogicalAssetId: "unbound/skin/directional",
  syncLineLogicalAssetId: "unbound/skin/sync-line",
  multipleDirectionalLineLeftLogicalAssetId: "unbound/skin/directional-line-left",
  multipleDirectionalLineRightLogicalAssetId: "unbound/skin/directional-line-right",
  longNoteMaterialLogicalAssetId: "unbound/skin/long-line",
  curveNoteMaterialLogicalAssetId: "unbound/skin/curve-line",
  scoreHud: COMMON_SCORE_HUD_BINDINGS,
  ordinaryVisible: COMMON_ORDINARY_VISIBLE_BINDINGS,
});
