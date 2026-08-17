import type {
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

export const MV_LIVE_CLOSURE_CAPABILITY = "simulator.mv-live.complete-closure-open";
export const MV_LIVE_CLOSURE_BOUNDARY =
  "The MV Live request is rejected before chart parsing, shared-static-resource reads, backend preparation, graphics mount, scheduler start, or scene/domain owner mutation until the current ARM64 callgraph, runtime routes, portable media mapping, semantic and WebView2 gates are all closed.";

export function isMvLiveClosureOpen(): boolean {
  return true;
}

export function mvLiveClosureFailure(): SimulatorModuleLaunchResult {
  return Object.freeze({
    status: "rejected" as const,
    failure: Object.freeze({
      code: "evidence-required" as const,
      capability: MV_LIVE_CLOSURE_CAPABILITY,
      boundary: MV_LIVE_CLOSURE_BOUNDARY,
    }),
  });
}

export function createSimulatorModuleCapabilitySummary(
  rendering: SimulatorRenderingFidelity | null,
): SimulatorModuleCapabilitySummary {
  return Object.freeze({
    rendering,
    publicAutonomousCore: "closed-portable" as const,
    ordinaryCommandScene: "closed-portable" as const,
    habahiroCurrentExternalComplete: "closed-portable" as const,
    habahiroOriginalParity: "open-evidence-required" as const,
    liveRehearsalFourModeMatrix: "closed-portable" as const,
    startupDirectionPortable: "closed-portable" as const,
    mvLivePortable: "open-evidence-required" as const,
    standaloneMvView: "excluded" as const,
    star3DLiveView: "excluded" as const,
    rehearsalMoveTimeControls: "closed-portable" as const,
    garupaJsonDirectChartAdapter: "closed-portable" as const,
    garupaJsonSvAndTimingGroup: "ignored-product-extension" as const,
    unsupportedExGarupaSlide: "open-evidence-required" as const,
    nonzeroInitialPracticeSeek: "excluded" as const,
    button07SceneMapping: "closed-original-unreachable" as const,
    browserDecodeRaster: "closed-portable" as const,
    fixedDeviceExact: "open-objective-environment-blocked" as const,
    characterSkillFeverMultiplayer: "excluded" as const,
    mainProgramIntegration: "unauthorized-stage-9" as const,
    selectedRenderingGate: rendering === null
      ? "open-evidence-required" as const
      : "closed-portable" as const,
  });
}
