import type { NoteInformation } from "../chart/types";

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
  readonly isUsed: boolean;
  markUsed(): import("../evidence").SimulatorResult<void>;
}

export interface NoteAutoLiveRuntime {
  readonly isAutoPlay: () => boolean;
  readonly getAdjustedMusicPosition: () => number;
  readonly submitJudgement: (
    request: AutoLiveJudgementRequest,
  ) => import("../evidence").SimulatorResult<void>;
}
