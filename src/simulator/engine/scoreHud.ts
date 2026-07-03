import type { RuntimeStats } from "./types";

export type SimulatorScoreRankLabel = "C" | "B" | "A" | "S" | "SS";
export type SimulatorScoreGaugeRank = "D" | SimulatorScoreRankLabel;
export type SimulatorScoreGaugeSpriteKey =
  | "scoreMeterBlue"
  | "scoreMeterGreen"
  | "scoreMeterOrange"
  | "scoreMeterPink"
  | "scoreMeterS";

export interface SimulatorScoreRankThreshold {
  label: SimulatorScoreRankLabel;
  score: number;
}

export interface SimulatorScoreRankMarker {
  rank: SimulatorScoreRankLabel;
  ratio: number;
}

export interface SimulatorScoreHudState {
  score: number;
  scoreMax: number;
  scoreRatio: number;
  gaugeRank: SimulatorScoreGaugeRank;
  gaugeSpriteKey: SimulatorScoreGaugeSpriteKey;
  rankMarkers: readonly SimulatorScoreRankMarker[];
}

const SIMULATOR_SCORE_RANK_SCORE = {
  C: 375_000,
  B: 2_250_000,
  A: 4_500_000,
  S: 6_750_000,
  SS: 9_000_000,
} as const satisfies Record<SimulatorScoreRankLabel, number>;

export const SIMULATOR_SCORE_RANK_THRESHOLDS: readonly SimulatorScoreRankThreshold[] = [
  { label: "C", score: SIMULATOR_SCORE_RANK_SCORE.C },
  { label: "B", score: SIMULATOR_SCORE_RANK_SCORE.B },
  { label: "A", score: SIMULATOR_SCORE_RANK_SCORE.A },
  { label: "S", score: SIMULATOR_SCORE_RANK_SCORE.S },
  { label: "SS", score: SIMULATOR_SCORE_RANK_SCORE.SS },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function resolveSimulatorScoreGaugeRank(score: number): SimulatorScoreGaugeRank {
  if (score >= SIMULATOR_SCORE_RANK_SCORE.SS) {
    return "SS";
  }
  if (score >= SIMULATOR_SCORE_RANK_SCORE.S) {
    return "S";
  }
  if (score >= SIMULATOR_SCORE_RANK_SCORE.A) {
    return "A";
  }
  if (score >= SIMULATOR_SCORE_RANK_SCORE.B) {
    return "B";
  }
  if (score >= SIMULATOR_SCORE_RANK_SCORE.C) {
    return "C";
  }
  return "D";
}

// Source: HOST________/VSCode/bangdream-apk/reverse/analysis/targets/
// score-gauge-color-current.md. SinglePlayScoreGauge.updateScoreRank maps
// D/C/B/A/S/SS to score_meter_blue/green/orange/pink/s/s through
// UISprite.set_spriteName. The threshold values remain GarupaEditor simulator
// logic restored from the simulator's old HUD behavior.
export const SIMULATOR_SCORE_GAUGE_SPRITE_BY_RANK: Record<
  SimulatorScoreGaugeRank,
  SimulatorScoreGaugeSpriteKey
> = {
  D: "scoreMeterBlue",
  C: "scoreMeterGreen",
  B: "scoreMeterOrange",
  A: "scoreMeterPink",
  S: "scoreMeterS",
  SS: "scoreMeterS",
};

export function buildScoreHudState(stats: RuntimeStats | null): SimulatorScoreHudState {
  const score = Math.max(0, Math.floor(stats?.score ?? 0));
  const scoreMax = Math.max(1, Math.floor(stats?.scoreMax ?? 1));
  const scoreRatio = stats ? clamp01(score / scoreMax) : 0;
  const gaugeRank = stats ? resolveSimulatorScoreGaugeRank(score) : "D";
  const gaugeSpriteKey = SIMULATOR_SCORE_GAUGE_SPRITE_BY_RANK[gaugeRank];
  const rankMarkers = stats
    ? SIMULATOR_SCORE_RANK_THRESHOLDS.map((threshold) => ({
        rank: threshold.label,
        ratio: clamp01(threshold.score / scoreMax),
      }))
    : [];

  return {
    score,
    scoreMax,
    scoreRatio,
    gaugeRank,
    gaugeSpriteKey,
    rankMarkers,
  };
}
