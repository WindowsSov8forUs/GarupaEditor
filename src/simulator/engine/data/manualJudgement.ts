import { evidenceRequired, ok, type SimulatorResult } from "../evidence";

const MUSIC_BAR_DIVISION_COUNT = 192;
const SECONDS_PER_MINUTE_TIMES_FOUR = Math.fround(240);
const FRAME_SECOND = float32FromBits(0x3c888889);

export const NoteResultType = {
  None: -1,
  Miss: 0,
  Bad: 1,
  Good: 2,
  Great: 3,
  Perfect: 4,
} as const;

export type NoteResultTypeValue =
  (typeof NoteResultType)[keyof typeof NoteResultType];

export const JudgeTiming = {
  None: 0,
  Fast: 1,
  Slow: 2,
} as const;

export type JudgeTimingValue =
  (typeof JudgeTiming)[keyof typeof JudgeTiming];

export interface ManualNoteJudgement {
  readonly result: NoteResultTypeValue;
  readonly timing: JudgeTimingValue;
  readonly differenceSeconds: number;
  readonly roundedFrame: number;
}

export function getSecondsWithDistance(
  distance: number,
  bpm: number,
): SimulatorResult<number> {
  if (!isExactFiniteFloat32(distance) || distance < 0 || !isExactFiniteFloat32(bpm) || bpm <= 0) {
    return evidenceRequired(
      "manual.judgement.invalid-distance-or-bpm",
      ["D05", "MJ02"],
      "GetSecWithDistance requires non-negative finite Float32 distance and positive finite Float32 BPM.",
    );
  }
  const secondsPerBar = Math.fround(SECONDS_PER_MINUTE_TIMES_FOUR / bpm);
  const scaledDistance = Math.fround(secondsPerBar * distance);
  const seconds = Math.fround(scaledDistance / MUSIC_BAR_DIVISION_COUNT);
  return Number.isFinite(seconds)
    ? ok(seconds)
    : evidenceRequired(
        "manual.judgement.non-finite-distance-result",
        ["D05", "MJ02"],
        "The recovered Float32 distance conversion must remain finite.",
      );
}

export function getManualNoteResult(
  sweetFrame: number,
  differenceSeconds: number,
): SimulatorResult<{
  readonly result: NoteResultTypeValue;
  readonly roundedFrame: number;
}> {
  if (!Number.isInteger(sweetFrame) || !isInt32(sweetFrame) || !isExactFiniteFloat32(differenceSeconds)) {
    return evidenceRequired(
      "manual.judgement.invalid-result-input",
      ["D05", "MJ02"],
      "GetResult requires an Int32 sweetFrame and a finite exact Float32 second difference.",
    );
  }
  const frameDistance = Math.fround(differenceSeconds / FRAME_SECOND);
  if (!Number.isFinite(frameDistance)) {
    return evidenceRequired(
      "manual.judgement.non-finite-frame-distance",
      ["D05", "MJ02"],
      "The recovered Float32 1/60 conversion must remain finite before rounding.",
    );
  }
  const roundedFrame = roundAwayFromZero(frameDistance);
  let result: NoteResultTypeValue;
  if (roundedFrame < sweetFrame + 3) {
    result = NoteResultType.Perfect;
  } else if (roundedFrame < sweetFrame + 6) {
    result = NoteResultType.Great;
  } else if (roundedFrame < sweetFrame + 7) {
    result = NoteResultType.Good;
  } else if (roundedFrame < sweetFrame + 8) {
    result = NoteResultType.Bad;
  } else {
    result = NoteResultType.None;
  }
  return ok(Object.freeze({ result, roundedFrame }));
}

export function judgeManualNote(
  sweetFrame: number,
  notePosition: number,
  currentPosition: number,
  bpm: number,
): SimulatorResult<ManualNoteJudgement> {
  if (
    !isExactFiniteFloat32(notePosition) ||
    !isExactFiniteFloat32(currentPosition)
  ) {
    return evidenceRequired(
      "manual.judgement.invalid-position",
      ["D05", "MJ02"],
      "JudgeNote requires finite exact Float32 note and adjusted music positions.",
    );
  }
  const distance = Math.fround(Math.abs(Math.fround(notePosition - currentPosition)));
  const difference = getSecondsWithDistance(distance, bpm);
  if (difference.status !== "ok") {
    return difference;
  }
  const result = getManualNoteResult(sweetFrame, difference.value);
  if (result.status !== "ok") {
    return result;
  }
  const timing = result.value.result === NoteResultType.Perfect
    ? JudgeTiming.None
    : Math.fround(notePosition - currentPosition) > 0
    ? JudgeTiming.Fast
    : JudgeTiming.Slow;
  return ok(Object.freeze({
    result: result.value.result,
    timing,
    differenceSeconds: difference.value,
    roundedFrame: result.value.roundedFrame,
  }));
}

function roundAwayFromZero(value: number): number {
  return value < 0
    ? -Math.floor(-value + 0.5)
    : Math.floor(value + 0.5);
}

function isExactFiniteFloat32(value: number): boolean {
  return Number.isFinite(value) && Object.is(value, Math.fround(value));
}

function isInt32(value: number): boolean {
  return value >= -0x80000000 && value <= 0x7fffffff;
}

function float32FromBits(bits: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, bits, true);
  return view.getFloat32(0, true);
}
