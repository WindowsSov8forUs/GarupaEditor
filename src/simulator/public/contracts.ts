export type SimulatorPublicPlayMode = "manual" | "auto-live";

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

export interface SimulatorSessionGameplayData {
  readonly score: {
    readonly level: number;
    readonly totalParameter: number;
    readonly autoLiveComboCoefficient: number;
    readonly master: {
      readonly musicId: number;
      readonly difficulty: string;
      readonly scoreC: number;
      readonly scoreB: number;
      readonly scoreA: number;
      readonly scoreS: number;
      readonly scoreSS: number;
    };
  };
  readonly life: {
    readonly initialLife: number;
    readonly playerMaxLife: number;
    readonly lifeUpperLimit: number;
    readonly missDamage: number;
    readonly badDamage: number;
  };
}

export interface SimulatorChartDataPackage {
  readonly bmsText: string;
  readonly bgm: SimulatorChartAudioData;
  readonly gameplay: SimulatorSessionGameplayData;
}

export interface SimulatorLaunchConfig {
  readonly playMode: SimulatorPublicPlayMode;
  readonly highFrequencyMode: boolean;
  readonly judgeOffsetFrames: number;
  readonly practice: {
    readonly enabled: boolean;
    readonly startMilliseconds: number;
  };
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
  | "reopened-audit"
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
  readonly nonzeroInitialPracticeSeek: "closed-portable";
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
