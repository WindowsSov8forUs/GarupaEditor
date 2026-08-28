export const CURRENT_TAP_LANE_EFFECT_SPRITE_MASK = Object.freeze({
  interaction: "visible-outside" as const,
  alphaCutoff: Math.fround(0.20000000298023224),
  worldBounds: Object.freeze([
    -3.5062605530564497,
    -0.7779093277398701,
    3.5062605530564497,
    1.19371612133299,
  ] as const),
});

export const CURRENT_SCORE_GAUGE_SS_SIBLING_ORDER = Object.freeze([
  "Flash", "BigStar_1", "BigStar_2",
  "kira_1", "kira_2", "kira_3", "kira_4", "kira_5", "kira_6", "kira_7", "kira_8",
] as const);

export interface CurrentScoreGaugeSsWidgetProfile {
  readonly textureKey: "high-rank-kira" | "high-rank-long-star" | "high-rank-overlay";
  readonly width: number;
  readonly height: number;
  readonly pivot: "center" | "left";
  readonly colorF32Bits: readonly [string, string, string, string];
  readonly blendMode: "normal";
}

export const CURRENT_SCORE_GAUGE_SS_WIDGETS: Readonly<Record<string, CurrentScoreGaugeSsWidgetProfile>> =
  Object.freeze({
    kira_1: widget("high-rank-kira", 20, 20, "center", ["0000803F", "7E0E693F", "41187C3F", "DDDC5C3F"]),
    kira_2: widget("high-rank-kira", 12, 12, "center", ["A426583F", "8FDB7B3F", "0000803F", "0000803F"]),
    kira_3: widget("high-rank-kira", 8, 8, "center", ["209B6C3F", "0000803F", "1D52533F", "0000803F"]),
    kira_4: widget("high-rank-kira", 28, 28, "center", ["0000803F", "0000803F", "0000803F", "DDDC5C3F"]),
    kira_5: widget("high-rank-kira", 12, 12, "center", ["45077E3F", "F639643F", "0000803F", "0000803F"]),
    kira_6: widget("high-rank-kira", 15, 15, "center", ["3AA4663F", "5DE1763F", "0000803F", "0000803F"]),
    kira_7: widget("high-rank-kira", 22, 22, "center", ["20A6713F", "0000803F", "3AA4663F", "DDDC5C3F"]),
    kira_8: widget("high-rank-kira", 12, 12, "center", ["0000803F", "6A2E6F3F", "A426583F", "0000803F"]),
    BigStar_1: widget("high-rank-long-star", 420, 24, "center", ["0000803F", "0000803F", "0000803F", "C9C8483F"]),
    BigStar_2: widget("high-rank-long-star", 420, 24, "center", ["0000803F", "0000803F", "0000803F", "C9C8483F"]),
    Flash: widget("high-rank-overlay", 467, 24, "left", ["0000803F", "DEDD5D3F", "EEED6D3F", "0000803F"]),
  });

function widget(
  textureKey: CurrentScoreGaugeSsWidgetProfile["textureKey"],
  width: number,
  height: number,
  pivot: CurrentScoreGaugeSsWidgetProfile["pivot"],
  colorF32Bits: CurrentScoreGaugeSsWidgetProfile["colorF32Bits"],
): CurrentScoreGaugeSsWidgetProfile {
  return Object.freeze({
    textureKey,
    width,
    height,
    pivot,
    colorF32Bits: Object.freeze([...colorF32Bits]) as CurrentScoreGaugeSsWidgetProfile["colorF32Bits"],
    blendMode: "normal",
  });
}
