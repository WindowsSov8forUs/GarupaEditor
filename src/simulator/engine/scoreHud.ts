import type { RuntimeStats } from "./types";

export type SimulatorScoreRankLabel = "C" | "B" | "A" | "S" | "SS";

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
  rankMarkers: readonly SimulatorScoreRankMarker[];
}

export const SIMULATOR_SCORE_RANK_THRESHOLDS: readonly SimulatorScoreRankThreshold[] = [
  { label: "C", score: 375_000 },
  { label: "B", score: 2_250_000 },
  { label: "A", score: 4_500_000 },
  { label: "S", score: 6_750_000 },
  { label: "SS", score: 9_000_000 },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function buildScoreHudState(stats: RuntimeStats | null): SimulatorScoreHudState {
  const score = Math.max(0, Math.floor(stats?.score ?? 0));
  const scoreMax = Math.max(1, Math.floor(stats?.scoreMax ?? 1));
  const scoreRatio = stats ? clamp01(score / scoreMax) : 0;
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
    rankMarkers,
  };
}
