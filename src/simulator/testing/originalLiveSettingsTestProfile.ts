import {
  createOriginalLiveSettings,
  type OriginalLiveSettings,
} from "../engine/data/originalLiveSettings";
import type { SimulatorOriginalLiveSettings } from "../public/contracts";

export const DEFAULT_PUBLIC_ORIGINAL_LIVE_SETTINGS: SimulatorOriginalLiveSettings = Object.freeze({
  judgementAdjustValue: 0,
  judgementAdjustValueB: 0,
  syncLine: true,
  noteColor: true,
  visibleTapLaneEffect: true,
  mvDarkness: 20,
});

const created = createOriginalLiveSettings({
  highFrequencyMode: false,
  ...DEFAULT_PUBLIC_ORIGINAL_LIVE_SETTINGS,
});
if (created.status !== "ok") {
  throw new Error("default original Live settings test profile must be valid");
}

export const DEFAULT_ORIGINAL_LIVE_SETTINGS: OriginalLiveSettings = created.value;

export function originalLiveSettingsForTest(
  overrides: Partial<{
    highFrequencyMode: boolean;
    judgementAdjustValue: number;
    judgementAdjustValueB: number;
    syncLine: boolean;
    noteColor: boolean;
    visibleTapLaneEffect: boolean;
    mvDarkness: number;
  }> = {},
): OriginalLiveSettings {
  const result = createOriginalLiveSettings({
    highFrequencyMode: false,
    ...DEFAULT_PUBLIC_ORIGINAL_LIVE_SETTINGS,
    ...overrides,
  });
  if (result.status !== "ok") throw new Error(result.boundary);
  return result.value;
}
