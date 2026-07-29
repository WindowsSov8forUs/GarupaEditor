import type { ButtonTypeValue, NoteInformation } from "../chart/types";

export type AutoLiveJudgementPhase = "head" | "intermediate" | "tail";

export interface AutoLiveJudgementRequest {
  readonly noteInformation: NoteInformation;
  readonly phase: AutoLiveJudgementPhase;
  readonly noteType: number;
  readonly absolutePosition: number;
  readonly multipleDirectionalFlickNoteCount: number;
}

export interface AutoLiveJudgementOwnership {
  readonly multipleDirectionalFlickNoteCount: number | null;
}

export interface MultipleDirectionalRuntimeGroup {
  readonly count: number;
  readonly buttonTypes: readonly ButtonTypeValue[];
  readonly isUsed: boolean;
  preflightManualFinger(transaction: object, fingerId: number): import("../evidence").SimulatorResult<void>;
  commitManualFinger(transaction: object, fingerId: number): void;
  clearManualFinger(fingerId: number): void;
  markUsed(): import("../evidence").SimulatorResult<void>;
}

export interface NoteAutoLiveRuntime {
  readonly isAutoPlay: () => boolean;
  readonly getAdjustedMusicPosition: () => number;
  readonly submitJudgement: (
    request: AutoLiveJudgementRequest,
  ) => import("../evidence").SimulatorResult<void>;
}
