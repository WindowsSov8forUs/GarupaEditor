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

export interface SinglePlayScoreGaugeMasterProfile {
  readonly musicId: number;
  readonly difficulty: string;
  readonly scoreC: number;
  readonly scoreB: number;
  readonly scoreA: number;
  readonly scoreS: number;
  readonly scoreSS: number;
}

export interface SinglePlayScoreGaugeSnapshot {
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

export const SINGLE_PLAY_SCORE_GAUGE_MAX_COEFFICIENT = Object.freeze({
  value: Math.fround(1.111111044883728),
  bits: "3F8E38E3",
});

export function isSinglePlayScoreGaugeMasterProfile(
  value: unknown,
): value is SinglePlayScoreGaugeMasterProfile {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const master = value as Record<string, unknown>;
  if (Object.keys(master).sort().join(",") !==
    "difficulty,musicId,scoreA,scoreB,scoreC,scoreS,scoreSS") return false;
  const musicId = master.musicId;
  const difficulty = master.difficulty;
  const scoreC = master.scoreC;
  const scoreB = master.scoreB;
  const scoreA = master.scoreA;
  const scoreS = master.scoreS;
  const scoreSS = master.scoreSS;
  if (
    !isUInt32(musicId) || musicId === 0 ||
    typeof difficulty !== "string" || difficulty.length === 0 ||
    !isUInt32(scoreC) || !isUInt32(scoreB) || !isUInt32(scoreA) ||
    !isUInt32(scoreS) || !isUInt32(scoreSS) ||
    scoreC === 0 || scoreC >= scoreB || scoreB >= scoreA ||
    scoreA >= scoreS || scoreS >= scoreSS
  ) return false;
  const scoreMax = calculateSinglePlayScoreGaugeMax(scoreSS);
  return scoreMax !== null && scoreMax > scoreSS;
}

export function calculateSinglePlayScoreGaugeMax(scoreSS: number): number | null {
  if (!isUInt32(scoreSS)) return null;
  const scoreMax = Math.trunc(Math.fround(
    Math.fround(scoreSS) * SINGLE_PLAY_SCORE_GAUGE_MAX_COEFFICIENT.value,
  ));
  return isUInt32(scoreMax) ? scoreMax : null;
}

export function deepFreezeSinglePlayScoreGaugeMaster(
  master: SinglePlayScoreGaugeMasterProfile,
): SinglePlayScoreGaugeMasterProfile {
  return Object.freeze({ ...master });
}

function isUInt32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= 0 && value <= 0xffffffff;
}
