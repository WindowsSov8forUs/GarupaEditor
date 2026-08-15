import type { NORMALIZED_SCORE_RULESET_ID } from "../scoring/contracts";

export const LiveClearRank = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  SS: 5,
} as const;

export type LiveClearRankValue =
  (typeof LiveClearRank)[keyof typeof LiveClearRank];

export type SinglePlayScoreGaugeMeterKey =
  | "score_meter_blue"
  | "score_meter_green"
  | "score_meter_orange"
  | "score_meter_pink"
  | "score_meter_s";

export interface SinglePlayScoreGaugeSnapshot {
  readonly ruleSetId: typeof NORMALIZED_SCORE_RULESET_ID;
  readonly totalScoringUnitCount: number;
  readonly scoreMax: number;
  readonly beforeGaugeColorRank: LiveClearRankValue;
  readonly currentGaugeColorRank: LiveClearRankValue;
  readonly meterKey: SinglePlayScoreGaugeMeterKey;
  readonly ratio: number;
  readonly ratioBits: string;
  readonly sliderValue: number;
  readonly sliderValueBits: string;
  readonly foregroundActive: boolean;
  readonly indicatorLocalX: number;
  readonly rankMarkerCLocalX: number;
  readonly rankMarkerBLocalX: number;
  readonly rankMarkerALocalX: number;
  readonly rankMarkerSLocalX: number;
  readonly rankMarkerSSLocalX: number;
  readonly rankChanged: boolean;
  readonly highRankEffect: "none" | "ScoreGaugeSS";
  readonly highRankEffectActive: boolean;
}
