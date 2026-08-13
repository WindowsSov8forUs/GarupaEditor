import type {
  SimulatorModuleCapabilitySummary,
  SimulatorRenderingFidelity,
} from "./contracts";

export function createSimulatorModuleCapabilitySummary(
  rendering: SimulatorRenderingFidelity | null,
): SimulatorModuleCapabilitySummary {
  return Object.freeze({
    rendering,
    publicAutonomousCore: "closed-portable" as const,
    ordinaryCommandScene: "closed-portable" as const,
    habahiroExternalPreview: "open-evidence-required" as const,
    habahiroOriginalParity: "open-evidence-required" as const,
    nonzeroInitialPracticeSeek: "open-evidence-required" as const,
    button07SceneMapping: "open-evidence-required" as const,
    browserDecodeRaster: "open-evidence-required" as const,
    fixedDeviceExact: "open-device-exact" as const,
    characterSkillFeverMultiplayer: "excluded" as const,
    mainProgramIntegration: "unauthorized-stage-9" as const,
    selectedRenderingGate: rendering === "ordinary-current-portable"
      ? "closed-portable" as const
      : rendering === "habahiro-external-degraded-preview"
      ? "degraded-explicit" as const
      : "open-evidence-required" as const,
  });
}
