import type {
  SimulatorBackgroundFidelity,
  SimulatorChartFidelity,
  SimulatorModuleCapabilitySummary,
  SimulatorRenderingFidelity,
  SimulatorSkinFidelity,
} from "./contracts";

export function createSimulatorModuleCapabilitySummary(
  rendering: SimulatorRenderingFidelity | null,
  background: SimulatorBackgroundFidelity | null,
  chart: SimulatorChartFidelity = "standard-original-compatible",
  skin: SimulatorSkinFidelity | null = null,
): SimulatorModuleCapabilitySummary {
  return Object.freeze({
    rendering,
    background,
    chart,
    skin,
    publicAutonomousCore: "closed-portable" as const,
    ordinaryCommandScene: "closed-portable" as const,
    ordinaryHud: "closed-evidence-equivalent" as const,
    habahiroCurrentExternalComplete: "closed-portable" as const,
    habahiroOriginalParity: "observational-gap" as const,
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
    dynamicSurfaceResize: "observational-gap" as const,
    fixedDeviceExact: "open-objective-environment-blocked" as const,
    characterSkillFeverMultiplayer: "excluded" as const,
    originalSkinSettings: "closed-static-portable" as const,
    originalLiveSettings: "closed-portable" as const,
    mainProgramIntegration: "closed-product-integration" as const,
    selectedRenderingGate: rendering === null
      ? "observational-gap" as const
      : "closed-portable" as const,
    selectedHudGate: "closed-evidence-equivalent" as const,
    selectedBackgroundGate: background === null
      ? "observational-gap" as const
      : "closed-portable" as const,
    selectedChartGate: chart === "garupa-product-extension"
      ? "closed-product-extension" as const
      : "closed-portable" as const,
    selectedSkinGate: skin === null
      ? "observational-gap" as const
      : "closed-static-portable" as const,
  });
}
