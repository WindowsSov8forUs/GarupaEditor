import type { NoteResultTypeValue } from "../data/manualJudgement";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";
import type { SimulatorScoringUnit } from "./contracts";

export const NORMALIZED_SCORE_BASE = 10_000_000;

export const NORMALIZED_SCORE_RANK_THRESHOLDS = Object.freeze({
  scoreC: 375_000,
  scoreB: 2_250_000,
  scoreA: 4_500_000,
  scoreS: 6_750_000,
  scoreSS: 9_000_000,
});

const RESULT_RATES = Object.freeze([
  Math.fround(0),
  Math.fround(0),
  Math.fround(0.5),
  float32FromBits(0x3f4ccccd),
  float32FromBits(0x3f8ccccd),
]);

const PERFECT_RATE = RESULT_RATES[4]!;
const NORMALIZED_RESULT_RATES = Object.freeze(
  RESULT_RATES.map((rate) => Math.fround(rate / PERFECT_RATE)),
);

export function calculateNormalizedScoreMaximum(
  totalScoringUnitCount: number,
): number | null {
  if (!isPositiveInt32(totalScoringUnitCount)) return null;
  const value = NORMALIZED_SCORE_BASE + totalScoringUnitCount;
  return isUInt32(value) ? value : null;
}

export function calculatePerfectQuota(
  ordinal: number,
  totalScoringUnitCount: number,
): number | null {
  const scoreMaximum = calculateNormalizedScoreMaximum(totalScoringUnitCount);
  if (scoreMaximum === null || !Number.isInteger(ordinal) ||
      ordinal < 1 || ordinal > totalScoringUnitCount) return null;
  const maximum = BigInt(scoreMaximum);
  const count = BigInt(totalScoringUnitCount);
  const current = BigInt(ordinal);
  const value = current * maximum / count - (current - 1n) * maximum / count;
  const output = Number(value);
  return Number.isSafeInteger(output) && output > 0 ? output : null;
}

export function normalizedResultRate(
  result: Exclude<NoteResultTypeValue, -1>,
): number {
  return NORMALIZED_RESULT_RATES[result]!;
}

export function calculateNormalizedScoreContribution(
  unit: SimulatorScoringUnit,
  result: Exclude<NoteResultTypeValue, -1>,
  autoLive: boolean,
): SimulatorResult<number> {
  if (!validUnit(unit) || !Number.isInteger(result) || result < 0 || result > 4) {
    return integrityFailure(
      "score.normalized.invalid-contribution-input",
      [],
      "CS-V1 contribution requires one plan-owned positive quota, ordinal and represented judgement result.",
    );
  }
  if (autoLive) return ok(unit.perfectQuota);
  const contribution = Math.trunc(Math.fround(
    Math.fround(unit.perfectQuota) * normalizedResultRate(result),
  ));
  return isUInt32(contribution) && contribution <= unit.perfectQuota
    ? ok(contribution)
    : integrityFailure(
        "score.normalized.contribution-out-of-range",
        [],
        "CS-V1 normalized judgement contribution must remain an unsigned integer no greater than its plan-owned Perfect quota.",
      );
}

function validUnit(unit: SimulatorScoringUnit): boolean {
  return unit !== null && typeof unit === "object" &&
    typeof unit.id === "string" && unit.id.length > 0 &&
    Number.isInteger(unit.ordinal) && unit.ordinal > 0 &&
    Number.isSafeInteger(unit.perfectQuota) && unit.perfectQuota > 0;
}

function isPositiveInt32(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 0x7fffffff;
}

function isUInt32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function float32FromBits(bits: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, bits, true);
  return view.getFloat32(0, true);
}
