import {
  LiveClearRank,
  type LiveClearRankValue,
  type SinglePlayScoreGaugeMeterKey,
  type SinglePlayScoreGaugeSnapshot,
} from "../data/singlePlayScoreGauge";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";
import { NORMALIZED_SCORE_RULESET_ID } from "../scoring/contracts";
import {
  calculateNormalizedScoreMaximum,
  NORMALIZED_SCORE_RANK_THRESHOLDS,
} from "../scoring/normalizedScoreRule";

export class SinglePlayScoreGauge {
  readonly ruleSetId = NORMALIZED_SCORE_RULESET_ID;
  readonly scoreMax: number;
  private beforeRankValue: LiveClearRankValue = LiveClearRank.D;
  private currentRankValue: LiveClearRankValue = LiveClearRank.D;
  private meterKeyValue: SinglePlayScoreGaugeMeterKey = "score_meter_blue";
  private ratioValue = Math.fround(0);
  private sliderValue = Math.fround(0);
  private foregroundActiveValue = false;
  private indicatorLocalXValue = 0;
  private rankChangedValue = false;
  private highRankEffectValue: "none" | "ScoreGaugeSS" = "none";
  private highRankEffectActiveValue = false;

  private constructor(readonly totalScoringUnitCount: number, scoreMax: number) {
    this.scoreMax = scoreMax;
  }

  static create(totalScoringUnitCount: number): SimulatorResult<SinglePlayScoreGauge> {
    const scoreMax = calculateNormalizedScoreMaximum(totalScoringUnitCount);
    return scoreMax === null || scoreMax <= NORMALIZED_SCORE_RANK_THRESHOLDS.scoreSS
      ? integrityFailure(
          "score-gauge.invalid-scoring-unit-count",
          [],
          "CS-V1 Score Gauge requires a positive chart-owned Int32 scoring-unit count and a UInt32 maximum above the fixed SS threshold.",
        )
      : ok(new SinglePlayScoreGauge(totalScoringUnitCount, scoreMax));
  }

  cloneForPreflight(): SinglePlayScoreGauge {
    const clone = new SinglePlayScoreGauge(this.totalScoringUnitCount, this.scoreMax);
    clone.commitFromPreflight(this);
    return clone;
  }

  update(score: number): SimulatorResult<SinglePlayScoreGaugeSnapshot> {
    if (!isUInt32(score) || score > this.scoreMax) {
      return integrityFailure(
        "score-gauge.invalid-score",
        [],
        "CS-V1 Score Gauge accepts one unsigned score no greater than its chart-derived scoreMaximum.",
      );
    }
    const nextRank = rankForScore(score);
    this.beforeRankValue = this.currentRankValue;
    this.currentRankValue = nextRank;
    this.rankChangedValue = this.beforeRankValue !== this.currentRankValue;
    this.meterKeyValue = meterKeyForRank(nextRank);
    this.highRankEffectValue = this.rankChangedValue && nextRank === LiveClearRank.SS
      ? "ScoreGaugeSS"
      : "none";
    if (this.highRankEffectValue === "ScoreGaugeSS") this.highRankEffectActiveValue = true;
    this.ratioValue = Math.fround(Math.fround(score) / Math.fround(this.scoreMax));
    this.sliderValue = Math.fround(Math.min(Math.max(this.ratioValue, 0), 1));
    this.foregroundActiveValue = this.ratioValue > 0;
    this.indicatorLocalXValue = this.ratioValue >= 1
      ? 422
      : Math.trunc(Math.fround(this.ratioValue * Math.fround(422)));
    return ok(this.snapshot());
  }

  commitFromPreflight(staged: SinglePlayScoreGauge): void {
    if (staged.scoreMax !== this.scoreMax ||
        staged.totalScoringUnitCount !== this.totalScoringUnitCount ||
        staged.ruleSetId !== this.ruleSetId) {
      throw new Error("SinglePlayScoreGauge preflight CS-V1 identity changed");
    }
    this.beforeRankValue = staged.beforeRankValue;
    this.currentRankValue = staged.currentRankValue;
    this.meterKeyValue = staged.meterKeyValue;
    this.ratioValue = staged.ratioValue;
    this.sliderValue = staged.sliderValue;
    this.foregroundActiveValue = staged.foregroundActiveValue;
    this.indicatorLocalXValue = staged.indicatorLocalXValue;
    this.rankChangedValue = staged.rankChangedValue;
    this.highRankEffectValue = staged.highRankEffectValue;
    this.highRankEffectActiveValue = staged.highRankEffectActiveValue;
  }

  snapshot(): SinglePlayScoreGaugeSnapshot {
    return Object.freeze({
      ruleSetId: this.ruleSetId,
      totalScoringUnitCount: this.totalScoringUnitCount,
      scoreMax: this.scoreMax,
      beforeGaugeColorRank: this.beforeRankValue,
      currentGaugeColorRank: this.currentRankValue,
      meterKey: this.meterKeyValue,
      ratio: this.ratioValue,
      ratioBits: float32Bits(this.ratioValue),
      sliderValue: this.sliderValue,
      sliderValueBits: float32Bits(this.sliderValue),
      foregroundActive: this.foregroundActiveValue,
      indicatorLocalX: this.indicatorLocalXValue,
      rankMarkerCLocalX: rankMarkerLocalX(NORMALIZED_SCORE_RANK_THRESHOLDS.scoreC, this.scoreMax),
      rankMarkerBLocalX: rankMarkerLocalX(NORMALIZED_SCORE_RANK_THRESHOLDS.scoreB, this.scoreMax),
      rankMarkerALocalX: rankMarkerLocalX(NORMALIZED_SCORE_RANK_THRESHOLDS.scoreA, this.scoreMax),
      rankMarkerSLocalX: rankMarkerLocalX(NORMALIZED_SCORE_RANK_THRESHOLDS.scoreS, this.scoreMax),
      rankMarkerSSLocalX: rankMarkerLocalX(NORMALIZED_SCORE_RANK_THRESHOLDS.scoreSS, this.scoreMax),
      rankChanged: this.rankChangedValue,
      highRankEffect: this.highRankEffectValue,
      highRankEffectActive: this.highRankEffectActiveValue,
    });
  }
}

export function rankForScore(score: number): LiveClearRankValue {
  if (score < NORMALIZED_SCORE_RANK_THRESHOLDS.scoreC) return LiveClearRank.D;
  if (score < NORMALIZED_SCORE_RANK_THRESHOLDS.scoreB) return LiveClearRank.C;
  if (score < NORMALIZED_SCORE_RANK_THRESHOLDS.scoreA) return LiveClearRank.B;
  if (score < NORMALIZED_SCORE_RANK_THRESHOLDS.scoreS) return LiveClearRank.A;
  if (score < NORMALIZED_SCORE_RANK_THRESHOLDS.scoreSS) return LiveClearRank.S;
  return LiveClearRank.SS;
}

export function meterKeyForRank(rank: LiveClearRankValue): SinglePlayScoreGaugeMeterKey {
  switch (rank) {
    case LiveClearRank.D: return "score_meter_blue";
    case LiveClearRank.C: return "score_meter_green";
    case LiveClearRank.B: return "score_meter_orange";
    case LiveClearRank.A: return "score_meter_pink";
    case LiveClearRank.S:
    case LiveClearRank.SS: return "score_meter_s";
  }
}

function rankMarkerLocalX(score: number, scoreMax: number): number {
  return Math.fround(
    Math.fround(41) + Math.fround(
      Math.fround(Math.fround(score) * Math.fround(421)) / Math.fround(scoreMax),
    ),
  );
}

function isUInt32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function float32Bits(value: number): string {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, false);
  return view.getUint32(0, false).toString(16).toUpperCase().padStart(8, "0");
}
