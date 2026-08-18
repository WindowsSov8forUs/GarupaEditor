import type {
  SimulatorBackgroundFidelity,
  SimulatorChartFidelity,
  SimulatorModuleCapabilitySummary,
  SimulatorModuleLaunchResult,
  SimulatorRenderingFidelity,
} from "./contracts";

export const TOTAL_REVALIDATION_CAPABILITY = "simulator.audit.total-revalidation-open";
export const TOTAL_REVALIDATION_BOUNDARY =
  "The total simulator evidence revalidation gate rejects before the installed launcher, chart parsing, static-resource selection, backend preparation, scheduler start, or scene/domain owner mutation.";
export function isTotalRevalidationOpen(): boolean {
  return false;
}

export function totalRevalidationFailure(): SimulatorModuleLaunchResult {
  return Object.freeze({
    status: "rejected" as const,
    failure: Object.freeze({
      code: "evidence-required" as const,
      capability: TOTAL_REVALIDATION_CAPABILITY,
      boundary: TOTAL_REVALIDATION_BOUNDARY,
    }),
  });
}

export function createSimulatorModuleCapabilitySummary(
  rendering: SimulatorRenderingFidelity | null,
  background: SimulatorBackgroundFidelity | null,
  chart: SimulatorChartFidelity = "standard-original-compatible",
): SimulatorModuleCapabilitySummary {
  return Object.freeze({
    rendering,
    background,
    chart,
    publicAutonomousCore: "closed-portable" as const,
    ordinaryCommandScene: "closed-portable" as const,
    habahiroCurrentExternalComplete: "closed-portable" as const,
    habahiroOriginalParity: "open-evidence-required" as const,
    liveRehearsalFourModeMatrix: "closed-portable" as const,
    startupDirectionPortable: "closed-portable" as const,
    mvLivePortable: "closed-portable" as const,
    standaloneMvView: "excluded" as const,
    star3DLiveView: "excluded" as const,
    rehearsalMoveTimeControls: "closed-portable" as const,
    garupaJsonDirectChartAdapter: "closed-portable" as const,
    garupaSvTimingGroup: "closed-product-extension" as const,
    garupaContinuousLaneOutside: "closed-product-extension" as const,
    garupaExtendedSlideGraph: "closed-product-extension" as const,
    garupaExtendedManualInput: "closed-product-extension" as const,
    nonzeroInitialPracticeSeek: "excluded" as const,
    button07SceneMapping: "closed-original-unreachable" as const,
    browserDecodeRaster: "closed-portable" as const,
    initialAdaptiveLandscapeLayout: "closed-portable" as const,
    dynamicSurfaceResize: "open-evidence-required" as const,
    fixedDeviceExact: "open-objective-environment-blocked" as const,
    characterSkillFeverMultiplayer: "excluded" as const,
    mainProgramIntegration: "unauthorized-stage-9" as const,
    selectedRenderingGate: rendering === null
      ? "open-evidence-required" as const
      : "closed-portable" as const,
    selectedBackgroundGate: background === null
      ? "open-evidence-required" as const
      : "closed-portable" as const,
    selectedChartGate: chart === "garupa-product-extension"
      ? "closed-product-extension" as const
      : "closed-portable" as const,
  });
}
