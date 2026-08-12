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

export interface SimulatorChartDataPackage {
  readonly bmsText: string;
  readonly bgm: SimulatorChartAudioData;
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
  | "user-closed"
  | "terminal-fault";

export interface SimulatorModuleFinalResult {
  readonly adjustedMusicPosition: number;
  readonly combo: number;
  readonly clearStatus: 1 | 2 | 3;
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
}

export interface SimulatorModuleCloseReport {
  readonly reason: SimulatorModuleCloseReason;
  readonly result: SimulatorModuleFinalResult | null;
  readonly failure: SimulatorModuleFailure | null;
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
