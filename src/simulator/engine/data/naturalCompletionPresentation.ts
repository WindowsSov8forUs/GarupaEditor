import type { SimulatorModeIdentity } from "./inGameCalculatedData";

export interface NaturalCompletionPresentation {
  readonly clearStatus: 1 | 2 | 3;
}

export function resolveNaturalCompletionPresentation(
  mode: SimulatorModeIdentity,
  recordClearStatus: 1 | 2 | 3,
): NaturalCompletionPresentation {
  if (mode.isAutoLive) {
    return Object.freeze({
      clearStatus: 3,
    });
  }
  return Object.freeze({ clearStatus: recordClearStatus });
}
