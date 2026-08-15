import type { NoteInformation } from "../chart/types";
import type { SimulatorResult } from "../evidence";

export const NORMALIZED_SCORE_RULESET_ID =
  "garupa-editor-normalized-10m-v1" as const;

export type SimulatorScoringPhase = "head" | "intermediate" | "tail";

export interface SimulatorScoringUnit {
  readonly id: string;
  readonly ordinal: number;
  readonly perfectQuota: number;
}

export interface SimulatorScoringPlan {
  readonly ruleSetId: typeof NORMALIZED_SCORE_RULESET_ID;
  readonly totalScoringUnitCount: number;
  readonly scoreMaximum: number;
  readonly units: readonly SimulatorScoringUnit[];
  resolve(
    source: NoteInformation,
    phase: SimulatorScoringPhase,
  ): SimulatorResult<SimulatorScoringUnit>;
  getById(id: string): SimulatorScoringUnit | undefined;
}
