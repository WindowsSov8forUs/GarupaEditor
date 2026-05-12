import { DEFAULT_SETTINGS, SimulatorSettings } from "./types";
import type { SimulatorDisplayPayload } from "../launchPayload";

export const SIMULATOR_TIMING_FPS = 60;

const GBP_SPEED_MIN = 1;
const GBP_SPEED_MAX = 12;
const MIN_TRAVEL_SECONDS = 0.01;

function clampGbpNoteSpeed(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.noteSpeedRaw;
  }
  return Math.max(GBP_SPEED_MIN, Math.min(GBP_SPEED_MAX, value));
}

function gbpNoteSpeedToTravelSeconds(gbpSpeedInput: number): number {
  const gbpSpeed = clampGbpNoteSpeed(gbpSpeedInput);
  // Borrowed from bandori-chart-new/MySongSimulator:
  // noteOnScreenDuration = (12 - simNoteSpeed) / 2
  return Math.max(MIN_TRAVEL_SECONDS, (12 - gbpSpeed) / 2);
}

function createDefaultSettings(): SimulatorSettings {
  const settings: SimulatorSettings = { ...DEFAULT_SETTINGS };
  settings.noteSpeedRaw = clampGbpNoteSpeed(settings.noteSpeedRaw);
  // Effect.Size now follows Display.Notesize and is no longer an independent setting.
  settings.effectSize = Number((settings.noteSize * DEFAULT_SETTINGS.effectSize).toFixed(4));
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

  const fps = Math.floor(Number(source.fps));
  if (fps === 60 || fps === 120) {
    settings.fps = fps;
  }

  if (source.noteSizePercent !== undefined) {
    const percent = Math.round(Number(source.noteSizePercent));
    if (Number.isFinite(percent)) {
      const clampedPercent = Math.max(10, Math.min(200, percent));
      const noteSize = Number((clampedPercent / 100).toFixed(4));
      settings.noteSize = noteSize;
      settings.effectSize = Number((noteSize * DEFAULT_SETTINGS.effectSize).toFixed(4));
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
  if (source.habahiro !== undefined) {
    settings.habahiro = source.habahiro;
  }

  if (source.mvAlphaPercent !== undefined && Number.isFinite(Number(source.mvAlphaPercent))) {
    settings.mvAlpha = Math.max(30, Math.min(100, Number(source.mvAlphaPercent))) / 100;
  }
  if (source.offsetMs !== undefined && Number.isFinite(Number(source.offsetMs))) {
    settings.offsetMs = Math.max(-5000, Math.min(5000, Math.round(Number(source.offsetMs))));
  }

  return settings;
}

export function precomputeLut(settings: SimulatorSettings): void {
  const targetTravelSeconds = gbpNoteSpeedToTravelSeconds(settings.noteSpeedRaw);
  const targetTravelFrames = Math.max(1, Math.round(targetTravelSeconds * SIMULATOR_TIMING_FPS));
  const noteSpeedSeconds = targetTravelFrames / SIMULATOR_TIMING_FPS;
  settings.noteSpeedFrames = targetTravelFrames;
  settings.noteSpeedSeconds = noteSpeedSeconds;
}
