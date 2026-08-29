import type { SimulatorModeIdentity } from "./inGameCalculatedData";

export const AUTO_LIVE_ALL_PERFECT_TERMINAL_PRODUCT_SEMANTICS_ID =
  "simulator.auto-live-all-perfect-terminal-presentation-v1" as const;

export interface NaturalCompletionPresentation {
  readonly clearStatus: 1 | 2 | 3;
  readonly productSemanticsId: typeof AUTO_LIVE_ALL_PERFECT_TERMINAL_PRODUCT_SEMANTICS_ID | null;
}

export function resolveNaturalCompletionPresentation(
  mode: SimulatorModeIdentity,
  recordClearStatus: 1 | 2 | 3,
): NaturalCompletionPresentation {
  if (mode.isAutoLive) {
    return Object.freeze({
      clearStatus: 3,
      productSemanticsId: AUTO_LIVE_ALL_PERFECT_TERMINAL_PRODUCT_SEMANTICS_ID,
    });
  }
  return Object.freeze({ clearStatus: recordClearStatus, productSemanticsId: null });
}
