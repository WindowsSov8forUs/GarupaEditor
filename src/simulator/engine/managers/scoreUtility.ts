import type { ScoreLifeModeProfile } from "../data/scoreLifeState";
import type { NoteResultTypeValue } from "../data/manualJudgement";

const RESULT_RATES = Object.freeze([
  Math.fround(0),
  Math.fround(0),
  Math.fround(0.5),
  float32FromBits(0x3f4ccccd),
  float32FromBits(0x3f8ccccd),
]);

const COMBO_RANGES = Object.freeze([
  Object.freeze({ to: 20, rate: Math.fround(1) }),
  Object.freeze({ to: 50, rate: float32FromBits(0x3f8147ae) }),
  Object.freeze({ to: 100, rate: float32FromBits(0x3f828f5c) }),
  Object.freeze({ to: 150, rate: float32FromBits(0x3f83d70a) }),
  Object.freeze({ to: 200, rate: float32FromBits(0x3f851eb8) }),
  Object.freeze({ to: 250, rate: float32FromBits(0x3f866666) }),
  Object.freeze({ to: 300, rate: float32FromBits(0x3f87ae14) }),
  Object.freeze({ to: 400, rate: float32FromBits(0x3f88f5c3) }),
  Object.freeze({ to: 500, rate: float32FromBits(0x3f8a3d71) }),
  Object.freeze({ to: 600, rate: float32FromBits(0x3f8b851f) }),
  Object.freeze({ to: 700, rate: float32FromBits(0x3f8ccccd) }),
  Object.freeze({ to: Number.POSITIVE_INFINITY, rate: float32FromBits(0x3f8e147b) }),
]);

export class ScoreUtility {
  readonly scoreLevelRate: number;
  readonly baseScore: number;

  constructor(
    readonly totalParameter: number,
    readonly scoreLevel: number,
    readonly maxNoteCount: number,
  ) {
    this.scoreLevelRate = calculateScoreLevelRate(scoreLevel);
    this.baseScore = calculateBaseScore(totalParameter, this.scoreLevelRate, maxNoteCount);
  }

  getResultTypeCorrectionRate(result: Exclude<NoteResultTypeValue, -1>): number {
    return RESULT_RATES[result]!;
  }

  calculateCorrectedBaseScore(
    result: Exclude<NoteResultTypeValue, -1>,
    mode: ScoreLifeModeProfile,
  ): number {
    return mode.kind === "auto-live"
      ? this.baseScore
      : Math.fround(this.baseScore * this.getResultTypeCorrectionRate(result));
  }

  getComboCorrectionRate(
    combo: number,
    mode: ScoreLifeModeProfile,
    buttonTypes: readonly number[],
  ): number {
    if (buttonTypes[0] === -1) return Math.fround(1);
    if (mode.kind === "auto-live") return mode.comboCoefficient;
    return COMBO_RANGES.find((row) => combo <= row.to)!.rate;
  }
}

export function calculateScoreLevelRate(scoreLevel: number): number {
  const offset = Math.fround(scoreLevel - 5);
  const scaled = Math.fround(offset * Math.fround(0.01));
  return Math.fround(scaled + Math.fround(1));
}

export function calculateBaseScore(
  totalParameter: number,
  scoreLevelRate: number,
  maxNoteCount: number,
): number {
  const scaled = Math.fround(Math.fround(totalParameter) * scoreLevelRate);
  const divided = Math.fround(scaled / Math.fround(maxNoteCount));
  return Math.fround(divided * Math.fround(3));
}

function float32FromBits(bits: number): number {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, bits, true);
  return new DataView(buffer).getFloat32(0, true);
}
