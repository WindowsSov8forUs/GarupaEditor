const NOTE_LANE_PERCENT_BASE = 0.05;
const NOTE_LANE_PERCENT_SCALE = 0.95;
const NOTE_LANE_PERCENT_EXPONENT_BASE = 1.1;
const NOTE_LANE_PERCENT_EXPONENT_FACTOR = 50;

export function percentFromFrameRaw(frameRaw: number, noteSpeedFrames: number): number {
  const frames = Math.max(1, noteSpeedFrames);
  const exponent = (NOTE_LANE_PERCENT_EXPONENT_FACTOR * (frameRaw - frames)) / frames;
  return NOTE_LANE_PERCENT_BASE
    + NOTE_LANE_PERCENT_SCALE * Math.pow(NOTE_LANE_PERCENT_EXPONENT_BASE, exponent);
}

export function frameRawFromPercent(percent: number, noteSpeedFrames: number): number {
  const frames = Math.max(1, noteSpeedFrames);
  const normalized = (percent - NOTE_LANE_PERCENT_BASE) / NOTE_LANE_PERCENT_SCALE;
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return Number.NEGATIVE_INFINITY;
  }
  const exponent = Math.log(normalized) / Math.log(NOTE_LANE_PERCENT_EXPONENT_BASE);
  return frames + (frames * exponent) / NOTE_LANE_PERCENT_EXPONENT_FACTOR;
}

export function frameDeltaFromJudgeToPercent(percent: number, noteSpeedFrames: number): number {
  return frameRawFromPercent(percent, noteSpeedFrames) - Math.max(1, noteSpeedFrames);
}
