import { axisAtMs, type TimingGroupDef } from "../chart";

const ZERO_BEAT_RENDER_OFFSET_PX = 4;
const MIN_PIXELS_PER_SECOND = 1e-6;

type DisplayAxisOptions = {
  enabled: boolean;
  totalDurationSec: number;
  pixelsPerSecond: number;
  previewTimeSec: number;
  mainGroup: TimingGroupDef | null | undefined;
};

export type EditorDisplayAxis = {
  contentHeight: number;
  timeToY: (timeSec: number) => number;
  yToTime: (y: number) => number;
  distanceAtTime: (timeSec: number, group?: TimingGroupDef | null) => number;
  timeToGroupY: (timeSec: number, group?: TimingGroupDef | null) => number;
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function distanceAtMs(
  group: TimingGroupDef | null | undefined,
  elapsedMs: number,
  pixelsPerSecond: number,
): number {
  return axisAtMs(group, elapsedMs) * pixelsPerSecond / 1000;
}

export function createEditorDisplayAxis(options: DisplayAxisOptions): EditorDisplayAxis {
  const totalDurationSec = Math.max(0, finiteOrZero(options.totalDurationSec));
  const pixelsPerSecond = Math.max(MIN_PIXELS_PER_SECOND, finiteOrZero(options.pixelsPerSecond));
  const baseHeight = Math.max(1, totalDurationSec * pixelsPerSecond);
  const previewTimeSec = clamp(finiteOrZero(options.previewTimeSec), 0, totalDurationSec);
  const group = options.enabled ? options.mainGroup : null;
  const contentHeight = Math.max(1, Math.ceil(baseHeight));

  const distanceAtTime = (timeSec: number, targetGroup: TimingGroupDef | null | undefined = group): number => {
    if (!options.enabled) {
      return clamp(finiteOrZero(timeSec), 0, totalDurationSec) * pixelsPerSecond;
    }
    return distanceAtMs(targetGroup, clamp(finiteOrZero(timeSec), 0, totalDurationSec) * 1000, pixelsPerSecond);
  };

  const timeToY = (timeSec: number): number => (
    baseHeight - clamp(finiteOrZero(timeSec), 0, totalDurationSec) * pixelsPerSecond - 1
  );

  const yToTime = (y: number): number => {
    const rawSec = (baseHeight - finiteOrZero(y) - 1) / pixelsPerSecond;
    const zeroBeatOffsetSec = ZERO_BEAT_RENDER_OFFSET_PX / pixelsPerSecond;
    return clamp(rawSec <= zeroBeatOffsetSec ? 0 : rawSec, 0, totalDurationSec);
  };

  const timeToGroupY = (timeSec: number, targetGroup: TimingGroupDef | null | undefined = group): number => {
    if (!options.enabled) {
      return timeToY(timeSec);
    }
    const previewY = timeToY(previewTimeSec);
    return previewY - (distanceAtTime(timeSec, targetGroup) - distanceAtTime(previewTimeSec, targetGroup));
  };

  return {
    contentHeight,
    timeToY,
    yToTime,
    distanceAtTime,
    timeToGroupY,
  };
}
