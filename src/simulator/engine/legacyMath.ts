import { DEFAULT_SETTINGS, PrecomputedLut, SimulatorSettings } from "./types";
import type { SimulatorDisplayPayload } from "../launchPayload";

export const LEGACY_TIMING_FPS = 60;

const GBP_SPEED_MIN = 0.1;
const GBP_SPEED_MAX = 20;
const GBP_SPLIT = 11;
// Derived from the legacy GBP speed estimator in BanG-simulator (object.txt).
const GBP_TIME_SCALE = 0.45 / 0.955;

export function clampGbpNoteSpeed(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.noteSpeedRaw;
  }
  return Math.max(GBP_SPEED_MIN, Math.min(GBP_SPEED_MAX, value));
}

export function gbpNoteSpeedToTravelSeconds(gbpSpeedInput: number): number {
  const gbpSpeed = clampGbpNoteSpeed(gbpSpeedInput);
  if (gbpSpeed <= GBP_SPLIT) {
    return Math.max(0.01, (12 - gbpSpeed) * GBP_TIME_SCALE);
  }
  return Math.max(0.01, GBP_TIME_SCALE / Math.pow(2, gbpSpeed - GBP_SPLIT));
}

export function legacyOffsetToMs(offset: number): number {
  return (offset * LEGACY_TIMING_FPS) / 10;
}

export function legacyMsToOffset(ms: number): number {
  return (ms * 10) / LEGACY_TIMING_FPS;
}

export function applyAdaptiveCoordSettings(settings: SimulatorSettings): void {
  if (!Number.isFinite(settings.topX)) {
    settings.topX = DEFAULT_SETTINGS.topX;
  }
  if (!Number.isFinite(settings.topY)) {
    settings.topY = DEFAULT_SETTINGS.topY;
  }
  if (!Number.isFinite(settings.topDistance)) {
    settings.topDistance = DEFAULT_SETTINGS.topDistance;
  }
  if (!Number.isFinite(settings.bottomX)) {
    settings.bottomX = DEFAULT_SETTINGS.bottomX;
  }
  if (!Number.isFinite(settings.bottomY)) {
    settings.bottomY = DEFAULT_SETTINGS.bottomY;
  }
  if (!Number.isFinite(settings.bottomDistance)) {
    settings.bottomDistance = DEFAULT_SETTINGS.bottomDistance;
  }

  if (settings.bottomY <= settings.topY + 1) {
    settings.bottomY = settings.topY + 1;
  }
  settings.laneHeight = settings.bottomY - settings.topY;
}

function createDefaultSettings(): SimulatorSettings {
  const settings: SimulatorSettings = { ...DEFAULT_SETTINGS };
  settings.noteSpeedRaw = clampGbpNoteSpeed(settings.noteSpeedRaw);
  settings.grayMultiplier = 2;
  settings.displayHiddenSlideAmong = false;
  // Effect.Size now follows Display.Notesize and is no longer an independent setting.
  settings.effectSize = settings.noteSize;
  // Effect.Normalx/y, Flickx/y, Slidex/y are now internal constants.
  settings.effectNormalX = DEFAULT_SETTINGS.effectNormalX;
  settings.effectNormalY = DEFAULT_SETTINGS.effectNormalY;
  settings.effectFlickX = DEFAULT_SETTINGS.effectFlickX;
  settings.effectFlickY = DEFAULT_SETTINGS.effectFlickY;
  settings.effectSlideX = DEFAULT_SETTINGS.effectSlideX;
  settings.effectSlideY = DEFAULT_SETTINGS.effectSlideY;
  return settings;
}

export function buildSettingsFromPayload(payloadSettings: SimulatorDisplayPayload | null | undefined): SimulatorSettings {
  const settings = createDefaultSettings();
  const source = payloadSettings ?? {};

  if (source.windowWidth !== undefined) {
    const width = Math.floor(Number(source.windowWidth));
    if (Number.isFinite(width) && width >= 320 && width <= 7680) {
      settings.windowX = width;
    }
  }
  if (source.windowHeight !== undefined) {
    const height = Math.floor(Number(source.windowHeight));
    if (Number.isFinite(height) && height >= 180 && height <= 4320) {
      settings.windowY = height;
    }
  }
  if (source.topX !== undefined && Number.isFinite(Number(source.topX))) {
    settings.topX = Number(source.topX);
  }
  if (source.topY !== undefined && Number.isFinite(Number(source.topY))) {
    settings.topY = Number(source.topY);
  }
  if (source.topDistance !== undefined && Number.isFinite(Number(source.topDistance))) {
    settings.topDistance = Number(source.topDistance);
  }
  if (source.bottomX !== undefined && Number.isFinite(Number(source.bottomX))) {
    settings.bottomX = Number(source.bottomX);
  }
  if (source.bottomY !== undefined && Number.isFinite(Number(source.bottomY))) {
    settings.bottomY = Number(source.bottomY);
  }
  if (source.bottomDistance !== undefined && Number.isFinite(Number(source.bottomDistance))) {
    settings.bottomDistance = Number(source.bottomDistance);
  }

  const fps = Math.floor(Number(source.fps));
  if (fps === 60 || fps === 120) {
    settings.fps = fps;
  }

  if (source.noteSizePercent !== undefined) {
    const noteSize = Number(source.noteSizePercent) / 100;
    if (Number.isFinite(noteSize) && noteSize >= 0.1 && noteSize <= 2) {
      settings.noteSize = noteSize;
      settings.effectSize = noteSize;
    }
  }

  if (source.noteSpeed !== undefined && Number.isFinite(Number(source.noteSpeed))) {
    settings.noteSpeedRaw = Number(Math.max(1, Math.min(12, Number(source.noteSpeed))).toFixed(2));
  }

  if (source.sameline !== undefined) {
    settings.sameline = source.sameline;
  }
  if (source.colorAssist !== undefined) {
    settings.grayEnabled = source.colorAssist;
  }
  if (source.mirror !== undefined) {
    settings.mirror = source.mirror;
  }
  if (source.effectEnable !== undefined) {
    settings.effectEnable = source.effectEnable;
  }
  if (source.mvMode !== undefined) {
    settings.mvmode = source.mvMode;
  }

  if (source.mvAlphaPercent !== undefined && Number.isFinite(Number(source.mvAlphaPercent))) {
    settings.mvAlpha = Math.max(30, Math.min(100, Number(source.mvAlphaPercent))) / 100;
  }
  if (source.offsetMs !== undefined && Number.isFinite(Number(source.offsetMs))) {
    settings.offset = legacyMsToOffset(
      Math.max(-5000, Math.min(5000, Math.round(Number(source.offsetMs)))),
    );
  }

  applyAdaptiveCoordSettings(settings);
  return settings;
}

export function precomputeLut(settings: SimulatorSettings): PrecomputedLut {
  const targetTravelSeconds = gbpNoteSpeedToTravelSeconds(settings.noteSpeedRaw);
  const targetTravelFrames = Math.max(1, targetTravelSeconds * LEGACY_TIMING_FPS);
  settings.noteSpeed = (2 * settings.laneHeight) / (targetTravelFrames * targetTravelFrames * targetTravelFrames);

  const flickFps = Math.max(1, Math.floor(settings.fps / 3));

  const yList: number[] = [];
  const percentList: number[] = [];
  const sizeList: number[] = [];
  const widthList: number[] = [];

  const xList: number[] = [];
  const flickList: number[] = [];

  let t = 0;
  let h = 0;
  while (h < settings.bottomY) {
    h = settings.topY + 0.5 * settings.noteSpeed * t * t * t;
    const percent = (h - settings.topY) / settings.laneHeight;
    const realSize = (percent * 0.92 + 0.04) * settings.noteSize;
    const width = realSize;

    yList.push(h);
    percentList.push(percent);
    sizeList.push(realSize);
    widthList.push(width);

    for (let lane = 0; lane <= 8; lane += 1) {
      const tx = settings.topX + settings.topDistance * (lane - 1);
      const bx = settings.bottomX + settings.bottomDistance * (lane - 1);
      xList.push(tx + (bx - tx) * percent);
    }

    for (let i = 0; i < flickFps; i += 1) {
      const flickY = h - realSize * 0.3 - (i * realSize * 0.3) / flickFps;
      flickList.push(flickY);
    }
    t += 1;
  }

  const maxT = Math.max(1, yList.length);
  const noteSpeedFrames = maxT;
  const noteSpeedSeconds = noteSpeedFrames / LEGACY_TIMING_FPS;
  settings.noteSpeedFrames = noteSpeedFrames;
  settings.noteSpeedSeconds = noteSpeedSeconds;

  return {
    y: Float32Array.from(yList),
    noteMovePercent: Float32Array.from(percentList),
    realNoteSize: Float32Array.from(sizeList),
    widthPercent: Float32Array.from(widthList),
    x: Float32Array.from(xList),
    flickArrowMove: Float32Array.from(flickList),
    flickFps,
    maxT
  };
}

export function xAt(lut: PrecomputedLut, lane: number, t: number): number {
  const clampedT = Math.max(0, Math.min(lut.maxT - 1, t));
  const laneClamped = Math.max(0, Math.min(8, lane));
  const laneLower = Math.floor(laneClamped);
  const laneUpper = Math.min(8, laneLower + 1);
  const laneMix = laneClamped - laneLower;
  const rowOffset = clampedT * 9;
  const lowerX = lut.x[rowOffset + laneLower];
  const upperX = lut.x[rowOffset + laneUpper];
  return lowerX + (upperX - lowerX) * laneMix;
}

export function flickYAt(lut: PrecomputedLut, t: number, frame: number): number {
  const clampedT = Math.max(0, Math.min(lut.maxT - 1, t));
  const clampedF = Math.max(0, Math.min(lut.flickFps - 1, frame));
  return lut.flickArrowMove[clampedT * lut.flickFps + clampedF];
}
