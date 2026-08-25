import type { SimulatorLaunchConfig } from "../../simulator/public/contracts";

export const SIMULATOR_PRE_ADAPTATION_DEFAULTS = Object.freeze({
  isFullLength: false,
  sessionMode: "live" as const,
  inputMode: "auto" as const,
  judgementAdjustValue: 0,
  judgementAdjustValueB: 0,
  noteColor: true,
  visibleTapLaneEffect: true,
  mvDarkness: 20,
  masterGain: Math.fround(1),
  habahiroMeshWidthSetting: Math.fround(1),
  skin: Object.freeze({
    noteSkin: 0,
    fieldSkin: 0,
    tapEffect: 0,
    judgeSE: 0,
    directionalFlick: 0,
    directionalFlickEffect: 0,
    isFixedBG: false,
    special: Object.freeze({ kind: "none" as const }),
  }),
});

export interface SimulatorPreAdaptationInput {
  readonly fps: 60 | 120;
  readonly noteSize: number;
  readonly noteSpeed: number;
  readonly syncLine: boolean;
  readonly allPerfectStatusDisplayMode: boolean;
  readonly bgmGainPercent: number;
  readonly seGainPercent: number;
}

export function buildSimulatorPreAdaptedConfig(
  input: SimulatorPreAdaptationInput,
): SimulatorLaunchConfig {
  const noteSize = exactFloat32(input.noteSize, "note size");
  const specificSpeed = exactFloat32(input.noteSpeed, "note speed");
  if (noteSize < 80 || noteSize > 150) throw new Error("Simulator note size must be within [80,150] without clamping.");
  if (!(specificSpeed > 0)) throw new Error("Simulator note speed must be positive.");
  const bgmGain = exactUnitPercent(input.bgmGainPercent, "BGM gain");
  const seGain = exactUnitPercent(input.seGainPercent, "SE gain");
  if (input.fps !== 60 && input.fps !== 120) throw new Error("Simulator FPS must be exactly 60 or 120.");
  if (typeof input.syncLine !== "boolean") throw new Error("Simulator SyncLine requires one explicit boolean.");
  if (typeof input.allPerfectStatusDisplayMode !== "boolean") {
    throw new Error("Simulator コンボ状態表示 requires one explicit boolean; no cache default is inferred.");
  }
  return Object.freeze({
    sessionMode: SIMULATOR_PRE_ADAPTATION_DEFAULTS.sessionMode,
    inputMode: SIMULATOR_PRE_ADAPTATION_DEFAULTS.inputMode,
    highFrequencyMode: input.fps === 120,
    judgementAdjustValue: SIMULATOR_PRE_ADAPTATION_DEFAULTS.judgementAdjustValue,
    judgementAdjustValueB: SIMULATOR_PRE_ADAPTATION_DEFAULTS.judgementAdjustValueB,
    syncLine: input.syncLine,
    noteColor: SIMULATOR_PRE_ADAPTATION_DEFAULTS.noteColor,
    visibleTapLaneEffect: SIMULATOR_PRE_ADAPTATION_DEFAULTS.visibleTapLaneEffect,
    allPerfectStatusDisplayMode: input.allPerfectStatusDisplayMode,
    mvDarkness: SIMULATOR_PRE_ADAPTATION_DEFAULTS.mvDarkness,
    skin: SIMULATOR_PRE_ADAPTATION_DEFAULTS.skin,
    visual: Object.freeze({
      specificSpeed,
      noteSize,
      habahiroMeshWidthSetting: SIMULATOR_PRE_ADAPTATION_DEFAULTS.habahiroMeshWidthSetting,
    }),
    audio: Object.freeze({
      masterGain: SIMULATOR_PRE_ADAPTATION_DEFAULTS.masterGain,
      bgmGain,
      seGain,
    }),
  });
}

function exactFloat32(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded)) throw new Error(`${label} cannot be represented as Float32.`);
  return rounded;
}

function exactUnitPercent(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} percent must be within [0,100] without clamping.`);
  }
  return Math.fround(value / 100);
}
