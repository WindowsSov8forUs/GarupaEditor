import { integrityFailure, ok, type SimulatorResult } from "../evidence";

export const JUDGEMENT_ADJUST_VALUE_MIN = -30 as const;
export const JUDGEMENT_ADJUST_VALUE_MAX = 30 as const;
export const JUDGEMENT_ADJUST_VALUE_B_MIN = -5 as const;
export const JUDGEMENT_ADJUST_VALUE_B_MAX = 5 as const;
export const MV_DARKNESS_VALUES = Object.freeze([0, 10, 20, 30, 40, 50, 60, 70] as const);

export interface OriginalLiveCoreSettings {
  readonly highFrequencyMode: boolean;
  readonly judgementAdjustValue: number;
  readonly judgementAdjustValueB: number;
  readonly mvDarkness: number;
}

export interface OriginalLiveSettings {
  readonly core: OriginalLiveCoreSettings;
  readonly syncLine: boolean;
  readonly noteColor: boolean;
  readonly visibleTapLaneEffect: boolean;
}

export interface OriginalLiveSettingsInput {
  readonly highFrequencyMode: boolean;
  readonly judgementAdjustValue: number;
  readonly judgementAdjustValueB: number;
  readonly mvDarkness: number;
  readonly syncLine: boolean;
  readonly noteColor: boolean;
  readonly visibleTapLaneEffect: boolean;
}

export type OriginalLiveSettingsSnapshot = OriginalLiveSettings;

export function createOriginalLiveSettings(
  value: unknown,
): SimulatorResult<OriginalLiveSettings> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid();
  }
  const input = value as Record<string, unknown>;
  if (
    typeof input.highFrequencyMode !== "boolean" ||
    !integerIn(input.judgementAdjustValue, JUDGEMENT_ADJUST_VALUE_MIN, JUDGEMENT_ADJUST_VALUE_MAX) ||
    !integerIn(input.judgementAdjustValueB, JUDGEMENT_ADJUST_VALUE_B_MIN, JUDGEMENT_ADJUST_VALUE_B_MAX) ||
    !MV_DARKNESS_VALUES.includes(input.mvDarkness as typeof MV_DARKNESS_VALUES[number]) ||
    typeof input.syncLine !== "boolean" ||
    typeof input.noteColor !== "boolean" ||
    typeof input.visibleTapLaneEffect !== "boolean"
  ) {
    return invalid();
  }
  return ok(Object.freeze({
    core: Object.freeze({
      highFrequencyMode: input.highFrequencyMode,
      judgementAdjustValue: input.judgementAdjustValue,
      judgementAdjustValueB: input.judgementAdjustValueB,
      mvDarkness: input.mvDarkness as number,
    }),
    syncLine: input.syncLine,
    noteColor: input.noteColor,
    visibleTapLaneEffect: input.visibleTapLaneEffect,
  }));
}

export function validateOriginalLiveSettings(
  value: unknown,
): SimulatorResult<OriginalLiveSettings> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid();
  }
  const settings = value as Record<string, unknown>;
  if (settings.core === null || typeof settings.core !== "object" || Array.isArray(settings.core)) {
    return invalid();
  }
  const core = settings.core as Record<string, unknown>;
  return createOriginalLiveSettings({
    highFrequencyMode: core.highFrequencyMode,
    judgementAdjustValue: core.judgementAdjustValue,
    judgementAdjustValueB: core.judgementAdjustValueB,
    mvDarkness: core.mvDarkness,
    syncLine: settings.syncLine,
    noteColor: settings.noteColor,
    visibleTapLaneEffect: settings.visibleTapLaneEffect,
  });
}

export function originalLiveSettingsIdentity(value: OriginalLiveSettings): string {
  return [
    value.core.highFrequencyMode ? "120" : "60",
    value.core.judgementAdjustValue,
    value.core.judgementAdjustValueB,
    value.core.mvDarkness,
    value.syncLine ? 1 : 0,
    value.noteColor ? 1 : 0,
    value.visibleTapLaneEffect ? 1 : 0,
  ].join(":");
}

export function snapshotOriginalLiveSettings(
  value: OriginalLiveSettings,
): OriginalLiveSettingsSnapshot {
  return Object.freeze({
    core: Object.freeze({ ...value.core }),
    syncLine: value.syncLine,
    noteColor: value.noteColor,
    visibleTapLaneEffect: value.visibleTapLaneEffect,
  });
}

function integerIn(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function invalid(): ReturnType<typeof integrityFailure> {
  return integrityFailure(
    "runtime.invalid-original-live-settings",
    ["OLS-R01", "OLS-R03", "OLS-R04", "OLS-R05", "OLS-R06"],
    "Original Live settings require exact booleans, Primary -30..30, Secondary -5..5 and one persisted MV darkness value 0..70 in steps of ten; aliases, defaults, clamp and rounding are forbidden.",
  );
}
