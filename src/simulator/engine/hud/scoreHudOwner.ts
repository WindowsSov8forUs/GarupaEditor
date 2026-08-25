import type { RenderFloat32, RenderScoreHudState } from "../../backends/renderingContracts";
import type { SinglePlayScoreGaugeSnapshot } from "../data/singlePlayScoreGauge";
import type { InGameRecordSnapshot } from "../managers/inGameRecord";

export class ScoreHudOwner {
  createState(
    record: InGameRecordSnapshot,
    gauge: SinglePlayScoreGaugeSnapshot,
  ): RenderScoreHudState {
    const thresholds = gauge.thresholdProfile;
    return Object.freeze({
      thresholds: Object.freeze({
        scoreC: thresholds.scoreC,
        scoreB: thresholds.scoreB,
        scoreA: thresholds.scoreA,
        scoreS: thresholds.scoreS,
        scoreSS: thresholds.scoreSS,
      }),
      score: record.score,
      scoreText: zeroFilledScoreText(record.score),
      scoreMax: gauge.scoreMax,
      rank: gauge.currentGaugeColorRank,
      beforeRank: gauge.beforeGaugeColorRank,
      rankChanged: gauge.rankChanged,
      meterKey: gauge.meterKey,
      ratio: float32State(gauge.ratio, gauge.ratioBits),
      sliderValue: float32State(gauge.sliderValue, gauge.sliderValueBits),
      foregroundActive: gauge.foregroundActive,
      indicatorLocalX: gauge.indicatorLocalX,
      rankMarkerCLocalX: float32State(gauge.rankMarkerCLocalX),
      rankMarkerBLocalX: float32State(gauge.rankMarkerBLocalX),
      rankMarkerALocalX: float32State(gauge.rankMarkerALocalX),
      rankMarkerSLocalX: float32State(gauge.rankMarkerSLocalX),
      rankMarkerSSLocalX: float32State(gauge.rankMarkerSSLocalX),
      highRankEffect: gauge.highRankEffect,
      highRankEffectActive: gauge.highRankEffectActive,
    });
  }
}

export function zeroFilledScoreText(score: number): string {
  const digits = String(score);
  const zeroCount = Math.max(8 - Math.max(1, digits.length), 0);
  return `[BEBEBE]${"0".repeat(zeroCount)}[-][FF3B72]${digits}[-]`;
}

function float32State(value: number, knownBits?: string): RenderFloat32 {
  const rounded = Math.fround(value);
  return Object.freeze({ value: rounded, bits: knownBits ?? float32Bits(rounded) });
}

function float32Bits(value: number): string {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, false);
  return view.getUint32(0, false).toString(16).toUpperCase().padStart(8, "0");
}
