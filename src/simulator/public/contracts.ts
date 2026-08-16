export type SimulatorPublicSessionMode = "live" | "rehearsal";
export type SimulatorPublicInputMode = "manual" | "auto";

export interface SimulatorChartAudioData {
  readonly cue: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly codec: "mp3";
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly durationSeconds: number;
  readonly currentSampleFrames: number;
}

export type SimulatorGarupaChartDirection = "Left" | "Right";
export type SimulatorGarupaChartSimpleType = "Single" | "Flick" | "Skill" | "Hidden";

export interface SimulatorGarupaChartSimpleNote {
  readonly type: SimulatorGarupaChartSimpleType;
  readonly beat: number;
  readonly lane: number;
  readonly width: number;
  readonly timingGroup?: string;
}

export interface SimulatorGarupaChartDirectionalNote {
  readonly type: "Directional";
  readonly beat: number;
  readonly lane: number;
  readonly width: number;
  readonly direction: SimulatorGarupaChartDirection;
  readonly timingGroup?: string;
}

export type SimulatorGarupaChartSlideConnection =
  | SimulatorGarupaChartSimpleNote
  | SimulatorGarupaChartDirectionalNote;

export interface SimulatorGarupaChartSlideItem {
  readonly type: "Slide";
  readonly connections: readonly SimulatorGarupaChartSlideConnection[];
  readonly timingGroup?: string;
}

export interface SimulatorGarupaChartBpmItem {
  readonly type: "BPM";
  readonly beat: number;
  readonly value: number;
}

export interface SimulatorGarupaChartSvItem {
  readonly type: "SV";
  readonly beat: number;
  readonly value: number;
  readonly timingGroup?: string;
}

export type SimulatorGarupaChartTopLevelNote =
  | Omit<SimulatorGarupaChartSimpleNote, "type"> & {
      readonly type: Exclude<SimulatorGarupaChartSimpleType, "Hidden">;
    }
  | SimulatorGarupaChartDirectionalNote;

export type SimulatorGarupaChartItem =
  | SimulatorGarupaChartTopLevelNote
  | SimulatorGarupaChartSlideItem
  | SimulatorGarupaChartBpmItem
  | SimulatorGarupaChartSvItem;

export type SimulatorGarupaChartJson = readonly SimulatorGarupaChartItem[];

export interface SimulatorChartDataPackage {
  readonly chart: SimulatorGarupaChartJson;
  readonly bgm: SimulatorChartAudioData;
  readonly isFullLength: boolean;
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
  readonly publicAutonomousCore: "closed-portable";
  readonly ordinaryCommandScene: "closed-portable";
  readonly habahiroCurrentExternalComplete: "closed-portable";
  readonly habahiroOriginalParity: "open-evidence-required";
  readonly liveRehearsalFourModeMatrix: "closed-portable";
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
