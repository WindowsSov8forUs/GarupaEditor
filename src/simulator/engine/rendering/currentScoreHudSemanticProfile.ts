/** Source: pushed Reverse a08fbced, current 10.1.4 Score final visible closure. */
export const CURRENT_SCORE_HUD_FINAL_VISIBLE_SOURCE_COMMIT =
  "a08fbced" as const;

export const CURRENT_SCORE_HUD_NINE_SLICE_BORDERS = Object.freeze({
  gaugeBase: pixiBorderFromUnity(216, 16, 0, 0),
  gaugeCover: pixiBorderFromUnity(8, 8, 8, 8),
  meterBlue: pixiBorderFromUnity(4, 4, 3, 3),
  meterOther: pixiBorderFromUnity(5, 5, 0, 0),
  meterS: pixiBorderFromUnity(0, 0, 0, 0),
  rehearsalTime: pixiBorderFromUnity(6, 6, 6, 6),
  autoLiveCaption: pixiBorderFromUnity(25, 25, 0, 0),
});

export const CURRENT_SCORE_HUD_SCENE_PROFILE = Object.freeze({
  rootLocalPosition: Object.freeze([-411, 309] as const),
  totalScoreLocalPosition: Object.freeze([212, -84] as const),
  totalScoreWidgetWidth: 188,
  totalScorePivot: "right" as const,
  totalScoreFontSize: 28,
  totalScoreAdvancePerFontSize: Math.fround(0.75),
  totalScoreFontLogicalAssetId: "hud/score/rank-label-font",
  totalScoreOverflow: "shrink-content" as const,
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


function pixiBorderFromUnity(
  left: number,
  bottom: number,
  right: number,
  top: number,
) {
  return Object.freeze({ left, top, right, bottom });
}
