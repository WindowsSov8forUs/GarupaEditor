import type { SimulatorModeIdentity } from "./inGameCalculatedData";

export interface NaturalCompletionPresentation {
  readonly clearStatus: 1 | 2 | 3;
}

export function resolveNaturalCompletionPresentation(
  mode: SimulatorModeIdentity,
  recordClearStatus: 1 | 2 | 3,
): NaturalCompletionPresentation {
  // Natural Auto Live completion carries clear status 1 (base clear). The
  // original never upgrades it to Full Combo or All Perfect, although every
  // automatic judgement is Perfect.
  if (mode.isAutoLive) {
    return Object.freeze({
      clearStatus: 1,
    });
  }
  return Object.freeze({ clearStatus: recordClearStatus });
}
