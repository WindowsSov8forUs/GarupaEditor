import type { GarupaChartJson } from "../../chart";

export type SimulatorPublicSessionMode = "live" | "rehearsal";
export type SimulatorPublicInputMode = "manual" | "auto";

export interface SimulatorChartDataPackage {
  readonly chart: GarupaChartJson;
  readonly bgm: Uint8Array;
  readonly isFullLength: boolean;
}

export type SimulatorPresentationPng = Uint8Array;

export interface SimulatorPresentationMvPackage {
  readonly bytes: Uint8Array;
  readonly musicStartDelayMilliseconds: number;
}

export interface SimulatorPresentationPackage {
  readonly song: {
    readonly title: string;
    readonly bandName: string;
    readonly lyricist: string | null;
    readonly composer: string | null;
    readonly arranger: string | null;
  };
  readonly difficulty: {
    readonly type: "EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL";
    readonly level: number;
  };
  readonly jacketPng: SimulatorPresentationPng;
  readonly stage: {
    readonly backdropPng: SimulatorPresentationPng;
  };
  readonly mv: SimulatorPresentationMvPackage | null;
}

export type SimulatorSpecialSkinState = "on" | "off";

export interface SimulatorSpecialSkinComponentStates {
  readonly laneAndLine: SimulatorSpecialSkinState;
  readonly tapEffect: SimulatorSpecialSkinState;
  readonly rhythmIcon: SimulatorSpecialSkinState;
  readonly background: SimulatorSpecialSkinState;
  readonly soundEffect: SimulatorSpecialSkinState;
  readonly judge: SimulatorSpecialSkinState;
  readonly directionalFlickIcon: SimulatorSpecialSkinState;
}

export type SimulatorSpecialSkinSelection =
  | { readonly kind: "none" }
  | {
      readonly kind: "collabo";
      readonly seasonSpecialId: number;
      readonly components: SimulatorSpecialSkinComponentStates;
    }
  | {
      readonly kind: "limited";
      readonly limitedSkinId: number;
      readonly components: SimulatorSpecialSkinComponentStates;
    };

export interface SimulatorOriginalSkinSettings {
  readonly noteSkin: number;
  readonly fieldSkin: number;
  readonly tapEffect: number;
  readonly judgeSE: number;
  readonly directionalFlick: number;
  readonly directionalFlickEffect: number;
  readonly isFixedBG: boolean;
  readonly special: SimulatorSpecialSkinSelection;
}

export interface SimulatorOriginalLiveSettings {
  readonly judgementAdjustValue: number;
  readonly judgementAdjustValueB: number;
  readonly syncLine: boolean;
  readonly noteColor: boolean;
  readonly visibleTapLaneEffect: boolean;
  readonly allPerfectStatusDisplayMode: boolean;
  readonly mvDarkness: number;
}

export interface SimulatorLaunchConfig extends SimulatorOriginalLiveSettings {
  readonly sessionMode: SimulatorPublicSessionMode;
  readonly inputMode: SimulatorPublicInputMode;
  readonly highFrequencyMode: boolean;
  readonly skin: SimulatorOriginalSkinSettings;
  readonly visual: {
    readonly specificSpeed: number;
    readonly noteSize: number;
    readonly habahiroMeshWidthSetting: number;
  };
  readonly audio: {
    readonly masterGain: number;
    readonly bgmGain: number;
    readonly seGain: number;
  };
}

export interface SimulatorModuleLaunchRequest {
  readonly chartData: SimulatorChartDataPackage;
  readonly presentation: SimulatorPresentationPackage;
  readonly config: SimulatorLaunchConfig;
}

export type SimulatorModuleCloseReason =
  | "completed"
  | "game-over"
  | "user-closed"
  | "terminal-fault";

export interface SimulatorModuleFinalResult {
  readonly adjustedMusicPosition: number;
  readonly score: number;
  readonly life: number;
  readonly combo: number;
  readonly clearStatus: 1 | 2 | 3;
}

export interface SimulatorModuleCleanupFailure {
  readonly capability: string;
  readonly boundary: string;
}

export interface SimulatorModuleFailure {
  readonly code:
    | "integrity-failure"
    | "resource-unavailable"
    | "resource-integrity"
    | "resource-decode"
    | "platform-unavailable"
    | "launch-failed";
  readonly capability: string;
  readonly boundary: string;
  readonly cleanupFailures?: readonly SimulatorModuleCleanupFailure[];
}

export type SimulatorRenderingFidelity =
  | "ordinary-current-portable"
  | "habahiro-current-external-complete";

export type SimulatorBackgroundFidelity =
  | "standard-current-portable"
  | "mv-live-host-supplied-portable";

export type SimulatorChartFidelity =
  | "standard-original-compatible"
  | "garupa-product-extension";

export type SimulatorSkinFidelity =
  | "default-current"
  | "normal-current-static-portable"
  | "special-current-static-portable";

export type SimulatorCapabilityGateStatus =
  | "closed-portable"
  | "closed-static-portable"
  | "closed-product-extension"
  | "degraded-explicit"
  | "excluded"
  | "observational-gap"
  | "open-device-exact"
  | "open-objective-environment-blocked"
  | "closed-original-unreachable"
  | "closed-evidence-equivalent"
  | "closed-native-algorithm-equivalent"
  | "authorized-in-progress"
  | "closed-product-integration"
  | "unauthorized-stage-9";

export interface SimulatorModuleCapabilitySummary {
  readonly rendering: SimulatorRenderingFidelity | null;
  readonly background: SimulatorBackgroundFidelity | null;
  readonly chart: SimulatorChartFidelity;
  readonly skin: SimulatorSkinFidelity | null;
  readonly publicAutonomousCore: "closed-portable";
  readonly ordinaryCommandScene: "closed-native-algorithm-equivalent" | "observational-gap";
  readonly ordinaryHud: "closed-native-algorithm-equivalent" | "closed-product-extension" | "observational-gap";
  readonly habahiroCurrentExternalComplete: "closed-native-algorithm-equivalent" | "degraded-explicit";
  readonly habahiroOriginalParity: "observational-gap";
  readonly liveRehearsalFourModeMatrix: "closed-portable";
  readonly startupDirectionPortable: "closed-portable";
  readonly mvLivePortable: "closed-portable";
  readonly standaloneMvView: "excluded";
  readonly star3DLiveView: "excluded";
  readonly rehearsalMoveTimeControls: "closed-portable";
  readonly garupaJsonDirectChartAdapter: "closed-portable";
  readonly garupaSvTimingGroup: "closed-product-extension";
  readonly garupaContinuousLaneOutside: "closed-product-extension";
  readonly garupaExtendedSlideGraph: "closed-product-extension";
  readonly garupaExtendedManualInput: "closed-product-extension";
  readonly nonzeroInitialPracticeSeek: "excluded";
  readonly button07SceneMapping: "closed-original-unreachable";
  readonly browserDecodeRaster: "closed-portable";
  readonly initialAdaptiveLandscapeLayout: "closed-portable";
  readonly dynamicSurfaceResize: "observational-gap";
  readonly fixedDeviceExact: "open-objective-environment-blocked";
  readonly characterSkillFeverMultiplayer: "excluded";
  readonly originalSkinSettings: "closed-static-portable";
  readonly originalLiveSettings: "closed-native-algorithm-equivalent" | "observational-gap";
  readonly mainProgramIntegration: "authorized-in-progress" | "closed-product-integration";
  readonly selectedRenderingGate: "closed-native-algorithm-equivalent" | "degraded-explicit" | "observational-gap";
  readonly selectedHudGate: "closed-native-algorithm-equivalent" | "closed-product-extension" | "observational-gap";
  readonly selectedBackgroundGate: "closed-portable" | "observational-gap";
  readonly selectedChartGate: "closed-portable" | "closed-product-extension";
  readonly selectedSkinGate: "closed-static-portable" | "observational-gap";
}

export interface SimulatorModuleCloseReport {
  readonly reason: SimulatorModuleCloseReason;
  readonly result: SimulatorModuleFinalResult | null;
  readonly failure: SimulatorModuleFailure | null;
  readonly capabilities: SimulatorModuleCapabilitySummary;
}

export type SimulatorModuleLaunchResult =
  | {
      readonly status: "accepted";
      readonly closed: Promise<SimulatorModuleCloseReport>;
    }
  | {
      readonly status: "rejected";
      readonly failure: SimulatorModuleFailure;
    };

export type LaunchSimulatorModule = (
  request: SimulatorModuleLaunchRequest,
) => Promise<SimulatorModuleLaunchResult>;
