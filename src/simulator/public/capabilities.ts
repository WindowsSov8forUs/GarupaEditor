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

export function createSimulatorModuleCapabilitySummary(
  rendering: SimulatorRenderingFidelity | null,
): SimulatorModuleCapabilitySummary {
  return Object.freeze({
    rendering,
    publicAutonomousCore: "closed-portable" as const,
    ordinaryCommandScene: "closed-portable" as const,
    habahiroCurrentExternalComplete: "closed-portable" as const,
    habahiroOriginalParity: "open-evidence-required" as const,
    nonzeroInitialPracticeSeek: "open-evidence-required" as const,
    button07SceneMapping: "open-evidence-required" as const,
    browserDecodeRaster: "open-evidence-required" as const,
    fixedDeviceExact: "open-device-exact" as const,
    characterSkillFeverMultiplayer: "excluded" as const,
    mainProgramIntegration: "unauthorized-stage-9" as const,
    selectedRenderingGate: rendering === null
      ? "open-evidence-required" as const
      : "closed-portable" as const,
  });
}
