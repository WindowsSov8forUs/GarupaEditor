import {
  LiveClearRank,
  type LiveClearRankValue,
  type ScoreGaugeThresholdProfile,
  type SinglePlayScoreGaugeMeterKey,
  type SinglePlayScoreGaugeSnapshot,
} from "../data/singlePlayScoreGauge";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";

export class SinglePlayScoreGauge {
  readonly thresholdProfile: ScoreGaugeThresholdProfile;
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

  private constructor(profile: ScoreGaugeThresholdProfile) {
    this.thresholdProfile = freezeThresholdProfile(profile);
    this.scoreMax = profile.scoreMaximum;
  }

  static create(profile: ScoreGaugeThresholdProfile): SimulatorResult<SinglePlayScoreGauge> {
    if (!validThresholdProfile(profile)) {
      return integrityFailure(
        "score-gauge.invalid-threshold-profile",
        [],
        "Score Gauge requires one immutable identity, strictly ordered UInt32 C/B/A/S/SS thresholds and a greater UInt32 maximum; no display-layer scoring formula or fallback is allowed.",
      );
    }
    return ok(new SinglePlayScoreGauge(profile));
  }

  cloneForPreflight(): SinglePlayScoreGauge {
    const clone = new SinglePlayScoreGauge(this.thresholdProfile);
    clone.commitFromPreflight(this);
    return clone;
  }

  update(score: number): SimulatorResult<SinglePlayScoreGaugeSnapshot> {
    if (!isUInt32(score) || score > this.scoreMax) {
      return integrityFailure(
        "score-gauge.invalid-score",
        [],
        "Score Gauge accepts one unsigned score no greater than its supplied threshold profile maximum.",
      );
    }
    const nextRank = rankForScore(score, this.thresholdProfile);
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
    if (!sameThresholdProfile(staged.thresholdProfile, this.thresholdProfile)) {
      throw new Error("SinglePlayScoreGauge preflight threshold profile identity changed");
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
    const thresholds = this.thresholdProfile;
    return Object.freeze({
      thresholdProfile: thresholds,
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
      rankMarkerCLocalX: rankMarkerLocalX(thresholds.scoreC, this.scoreMax),
      rankMarkerBLocalX: rankMarkerLocalX(thresholds.scoreB, this.scoreMax),
      rankMarkerALocalX: rankMarkerLocalX(thresholds.scoreA, this.scoreMax),
      rankMarkerSLocalX: rankMarkerLocalX(thresholds.scoreS, this.scoreMax),
      rankMarkerSSLocalX: rankMarkerLocalX(thresholds.scoreSS, this.scoreMax),
      rankChanged: this.rankChangedValue,
      highRankEffect: this.highRankEffectValue,
      highRankEffectActive: this.highRankEffectActiveValue,
    });
  }
}

export function rankForScore(
  score: number,
  thresholds: ScoreGaugeThresholdProfile,
): LiveClearRankValue {
  if (score < thresholds.scoreC) return LiveClearRank.D;
  if (score < thresholds.scoreB) return LiveClearRank.C;
  if (score < thresholds.scoreA) return LiveClearRank.B;
  if (score < thresholds.scoreS) return LiveClearRank.A;
  if (score < thresholds.scoreSS) return LiveClearRank.S;
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

function validThresholdProfile(value: ScoreGaugeThresholdProfile): boolean {
  return typeof value === "object" && value !== null &&
    typeof value.profileIdentity === "string" && value.profileIdentity.length > 0 &&
    [value.scoreC, value.scoreB, value.scoreA, value.scoreS, value.scoreSS, value.scoreMaximum].every(isUInt32) &&
    value.scoreC < value.scoreB && value.scoreB < value.scoreA && value.scoreA < value.scoreS &&
    value.scoreS < value.scoreSS && value.scoreSS < value.scoreMaximum;
}

function freezeThresholdProfile(value: ScoreGaugeThresholdProfile): ScoreGaugeThresholdProfile {
  return Object.freeze({ ...value });
}

function sameThresholdProfile(left: ScoreGaugeThresholdProfile, right: ScoreGaugeThresholdProfile): boolean {
  return left.profileIdentity === right.profileIdentity && left.scoreC === right.scoreC &&
    left.scoreB === right.scoreB && left.scoreA === right.scoreA && left.scoreS === right.scoreS &&
    left.scoreSS === right.scoreSS && left.scoreMaximum === right.scoreMaximum;
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
