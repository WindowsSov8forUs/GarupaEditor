export const LiveClearRank = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  SS: 5,
  SSS: 6,
  SPlus: 7,
  APlus: 8,
  BPlus: 9,
  CPlus: 10,
  DPlus: 11,
  SSPlus: 12,
} as const;

export type LiveClearRankValue =
  (typeof LiveClearRank)[keyof typeof LiveClearRank];

export type SinglePlayScoreGaugeMeterKey =
  | "score_meter_blue"
  | "score_meter_green"
  | "score_meter_orange"
  | "score_meter_pink"
  | "score_meter_s";

export type ScoreGaugeThresholdSource =
  | Readonly<{
      readonly kind: "native-score-rank-data";
      readonly musicId: number;
      readonly difficulty: string;
    }>
  | Readonly<{
      readonly kind: "product-cs-v1";
      readonly rulesetId: "garupa-editor-normalized-10m-v1";
      readonly scoringUnitCount: number;
    }>;

export interface ScoreGaugeThresholdProfile {
  readonly profileIdentity: string;
  /** Optional only so stale test callers remain source-compilable; production validation requires it. */
  readonly source?: ScoreGaugeThresholdSource;
  readonly scoreC: number;
  readonly scoreB: number;
  readonly scoreA: number;
  readonly scoreS: number;
  readonly scoreSS: number;
  readonly scoreMaximum: number;
}

export interface SinglePlayScoreGaugeSnapshot {
  readonly thresholdProfile: ScoreGaugeThresholdProfile;
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
  readonly highRankEffect: "none" | "ScoreGaugeSS" | "ScoreGaugeSSS";
  readonly highRankEffectActive: boolean;
  readonly highRankEffectClip: "none" | "ScoreGaugeSS" | "ScoreGaugeSSS";
  readonly inGameMode: number;
}
