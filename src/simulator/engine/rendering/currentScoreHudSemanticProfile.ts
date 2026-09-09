/** Historical test metadata, not a runtime resource gate or font metric. */
export const CURRENT_SCORE_HUD_FINAL_VISIBLE_SOURCE_COMMIT = "818b8db6" as const;

export const CURRENT_SCORE_HUD_NINE_SLICE_BORDERS = Object.freeze({
  gaugeBase: nguiBorder(216, 16, 0, 0),
  gaugeCover: nguiBorder(8, 8, 8, 8),
  meterBlue: nguiBorder(4, 4, 3, 3),
  meterOther: nguiBorder(5, 5, 0, 0),
  meterS: nguiBorder(0, 0, 0, 0),
  rehearsalTime: nguiBorder(6, 6, 6, 6),
  autoLiveCaption: nguiBorder(25, 25, 0, 0),
});

/** Shared authored panel geometry; runtime and contract checks use the same fields. */
export const CURRENT_SCORE_HUD_SCENE_PROFILE = Object.freeze({
  // Existing historical contract tests read these; rendering measures the host font.
  totalScoreFontLogicalAssetId: "hud/score/rank-label-font",
  totalScoreAdvancePerFontSize: Math.fround(0.75),
  gauge: Object.freeze({
    highRankPanel: Object.freeze({
      targetLeftX: 38,
      leftAbsolute: 4,
      bottomY: -25.5,
      topY: 13.5,
      minimumWidth: 2,
      softness: Object.freeze([20, 3] as const),
    }),
  }),
});

function nguiBorder(
  left: number,
  right: number,
  top: number,
  bottom: number,
) {
  return Object.freeze({ left, right, top, bottom });
}
