import {
  LiveClearRank,
  calculateSinglePlayScoreGaugeMax,
  deepFreezeSinglePlayScoreGaugeMaster,
  isSinglePlayScoreGaugeMasterProfile,
  type LiveClearRankValue,
  type SinglePlayScoreGaugeMasterProfile,
  type SinglePlayScoreGaugeMeterKey,
  type SinglePlayScoreGaugeSnapshot,
} from "../data/singlePlayScoreGauge";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";

export class SinglePlayScoreGauge {
  readonly master: SinglePlayScoreGaugeMasterProfile;
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

  private constructor(master: SinglePlayScoreGaugeMasterProfile) {
    this.master = deepFreezeSinglePlayScoreGaugeMaster(master);
    this.scoreMax = calculateSinglePlayScoreGaugeMax(master.scoreSS)!;
  }

  static create(
    master: SinglePlayScoreGaugeMasterProfile,
  ): SimulatorResult<SinglePlayScoreGauge> {
    if (!isSinglePlayScoreGaugeMasterProfile(master)) {
      return evidenceRequired(
        "score-gauge.invalid-master-profile",
        [],
        "SinglePlayScoreGauge requires one exact music/difficulty identity and strictly ordered unsigned C/B/A/S/SS master thresholds; no BMS, scoreLevel or default-chart derivation is allowed.",
      );
    }
    const owner = new SinglePlayScoreGauge(master);
    if (!isUInt32(owner.scoreMax) || owner.scoreMax <= master.scoreSS) {
      return evidenceRequired(
        "score-gauge.invalid-score-max",
        [],
        "The current ordinary scoreMax must be the finite UInt32 result of the recovered Float32 scoreSS multiplier.",
      );
    }
    return ok(owner);
  }

  cloneForPreflight(): SinglePlayScoreGauge {
    const clone = new SinglePlayScoreGauge(this.master);
    clone.commitFromPreflight(this);
    return clone;
  }

  update(score: number): SimulatorResult<SinglePlayScoreGaugeSnapshot> {
    if (!isUInt32(score)) {
      return evidenceRequired(
        "score-gauge.invalid-score",
        [],
        "SinglePlayScoreGauge consumes the original unsigned InGameRecord score without clamp or signed coercion.",
      );
    }
    const nextRank = rankForScore(score, this.master);
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
    if (staged.scoreMax !== this.scoreMax || !sameMaster(staged.master, this.master)) {
      throw new Error("SinglePlayScoreGauge preflight profile identity changed");
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
      rankMarkerCLocalX: rankMarkerLocalX(this.master.scoreC, this.scoreMax),
      rankMarkerBLocalX: rankMarkerLocalX(this.master.scoreB, this.scoreMax),
      rankMarkerALocalX: rankMarkerLocalX(this.master.scoreA, this.scoreMax),
      rankMarkerSLocalX: rankMarkerLocalX(this.master.scoreS, this.scoreMax),
      rankMarkerSSLocalX: rankMarkerLocalX(this.master.scoreSS, this.scoreMax),
      rankChanged: this.rankChangedValue,
      highRankEffect: this.highRankEffectValue,
      highRankEffectActive: this.highRankEffectActiveValue,
    });
  }
}

export function rankForScore(
  score: number,
  master: SinglePlayScoreGaugeMasterProfile,
): LiveClearRankValue {
  if (score < master.scoreC) return LiveClearRank.D;
  if (score < master.scoreB) return LiveClearRank.C;
  if (score < master.scoreA) return LiveClearRank.B;
  if (score < master.scoreS) return LiveClearRank.A;
  if (score < master.scoreSS) return LiveClearRank.S;
  return LiveClearRank.SS;
}

export function meterKeyForRank(
  rank: LiveClearRankValue,
): SinglePlayScoreGaugeMeterKey {
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

function sameMaster(
  left: SinglePlayScoreGaugeMasterProfile,
  right: SinglePlayScoreGaugeMasterProfile,
): boolean {
  return left.musicId === right.musicId && left.difficulty === right.difficulty &&
    left.scoreC === right.scoreC && left.scoreB === right.scoreB &&
    left.scoreA === right.scoreA && left.scoreS === right.scoreS &&
    left.scoreSS === right.scoreSS;
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
