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
    readonly sdCharacterAtlases: readonly [
      SimulatorPresentationPng,
      SimulatorPresentationPng,
      SimulatorPresentationPng,
      SimulatorPresentationPng,
      SimulatorPresentationPng,
    ];
  };
  readonly liveStartVoiceMp3: Uint8Array | null;
  readonly mv: SimulatorPresentationMvPackage | null;
}

export interface SimulatorLaunchConfig {
  readonly sessionMode: SimulatorPublicSessionMode;
  readonly inputMode: SimulatorPublicInputMode;
  readonly highFrequencyMode: boolean;
  readonly judgeOffsetFrames: number;
  readonly visual: {
    readonly specificSpeed: number;
    readonly noteSize: number;
    readonly highAspectRatio: 0 | 1;
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
    | "evidence-required"
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

export type SimulatorCapabilityGateStatus =
  | "closed-portable"
  | "ignored-product-extension"
  | "degraded-explicit"
  | "excluded"
  | "open-evidence-required"
  | "open-device-exact"
  | "open-objective-environment-blocked"
  | "closed-original-unreachable"
  | "unauthorized-stage-9";

export interface SimulatorModuleCapabilitySummary {
  readonly rendering: SimulatorRenderingFidelity | null;
  readonly background: SimulatorBackgroundFidelity | null;
  readonly publicAutonomousCore: "closed-portable";
  readonly ordinaryCommandScene: "closed-portable";
  readonly habahiroCurrentExternalComplete: "closed-portable";
  readonly habahiroOriginalParity: "open-evidence-required";
  readonly liveRehearsalFourModeMatrix: "closed-portable";
  readonly startupDirectionPortable: "closed-portable";
  readonly mvLivePortable: "closed-portable";
  readonly standaloneMvView: "excluded";
  readonly star3DLiveView: "excluded";
  readonly rehearsalMoveTimeControls: "closed-portable";
  readonly garupaJsonDirectChartAdapter: "closed-portable";
  readonly garupaJsonSvAndTimingGroup: "ignored-product-extension";
  readonly unsupportedExGarupaSlide: "open-evidence-required";
  readonly nonzeroInitialPracticeSeek: "excluded";
  readonly button07SceneMapping: "closed-original-unreachable";
  readonly browserDecodeRaster: "closed-portable";
  readonly fixedDeviceExact: "open-objective-environment-blocked";
  readonly characterSkillFeverMultiplayer: "excluded";
  readonly mainProgramIntegration: "unauthorized-stage-9";
  readonly selectedRenderingGate: "closed-portable" | "open-evidence-required";
  readonly selectedBackgroundGate: "closed-portable" | "open-evidence-required";
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
