import type { GarupaChartJson } from "../../chart";
import type { StageCommandNote } from "../engine/data/stageCommand";
export type { StageCommandNote } from "../engine/data/stageCommand";

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
    /** Optional independent presentation score; not inferred from playable notes. */
    readonly commandNotes?: readonly StageCommandNote[];
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
  readonly maxCombo: number;
  /** Miss, Bad, Good, Great, Perfect, in the committed InGameRecord order. */
  readonly judgementCounts: readonly [number, number, number, number, number];
  readonly fastCount: number;
  readonly slowCount: number;
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
