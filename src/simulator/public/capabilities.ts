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
    // Resource/math audits do not close the final scene-consumption boundary.
    // See rendering-consumption-contract.md (SRC-SCORE-ANCHOR / SRC-PARTICLE-*).
    ordinaryCommandScene: "observational-gap" as const,
    ordinaryHud: "observational-gap" as const,
    habahiroCurrentExternalComplete: "closed-native-algorithm-equivalent" as const,
    habahiroOriginalParity: "observational-gap" as const,
    liveRehearsalFourModeMatrix: "closed-native-algorithm-equivalent" as const,
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
    originalLiveSettings: "observational-gap" as const,
    mainProgramIntegration: "closed-product-integration" as const,
    selectedRenderingGate: "observational-gap" as const,
    selectedHudGate: "observational-gap" as const,
    selectedBackgroundGate: background === null
      ? "observational-gap" as const
      : "closed-portable" as const,
    selectedChartGate: chart === "garupa-product-extension"
      ? "closed-product-extension" as const
      : "closed-portable" as const,
    selectedSkinGate: "observational-gap" as const,
  });
}
