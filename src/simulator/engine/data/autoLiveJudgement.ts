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
  readonly members: readonly NoteInformation[];
  readonly count: number;
  readonly buttonTypes: readonly ButtonTypeValue[];
  readonly isUsed: boolean;
  /** Reserves the single group judgement within one input transaction. */
  reserveUse(transaction: object): boolean;
  markUsed(): import("../result").SimulatorResult<void>;
}

export interface NoteAutoLiveRuntime {
  readonly isAutoPlay: boolean;
  readonly shouldForcePerfect: () => boolean;
  readonly getAdjustedMusicPosition: () => number;
  readonly submitJudgement: (
    request: AutoLiveJudgementRequest,
  ) => import("../result").SimulatorResult<void>;
}
