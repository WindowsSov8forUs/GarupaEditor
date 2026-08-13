import type {
  SimulatorModuleCapabilitySummary,
  SimulatorRenderingFidelity,
} from "./contracts";

export function createSimulatorModuleCapabilitySummary(
  rendering: SimulatorRenderingFidelity | null,
): SimulatorModuleCapabilitySummary {
  return Object.freeze({
    rendering,
    browserRaster: "open-not-claimed" as const,
    fixedDeviceExact: "open-not-claimed-fixed-device-limit" as const,
    characterSkillFeverMultiplayer: "excluded-not-implemented" as const,
    mainProgramIntegrationAuthorized: false as const,
  });
}
