export interface OneFrameDataHandle {
  readonly containerId: string;
}

export interface AutoLiveJudgementData {
  readonly noteIndex: number;
  readonly buttonTypes: readonly number[];
  readonly noteType: number;
  readonly phase: "head" | "intermediate" | "tail";
  readonly rawResult: 4;
  readonly adjustedResult: 4;
  readonly addCombo: 1;
  readonly absolutePosition: number;
  readonly judgeTiming: 0;
}

export interface ManualJudgementData {
  readonly noteIndex: number;
  readonly buttonTypes: readonly number[];
  readonly noteType: number;
  readonly phase: "head" | "intermediate" | "tail";
  readonly rawResult: 0 | 1 | 2 | 3 | 4;
  readonly adjustedResult: 0 | 1 | 2 | 3 | 4;
  readonly addCombo: -1 | 1;
  readonly absolutePosition: number;
  readonly judgeTiming: 0 | 1 | 2;
}

export interface OneFrameBusinessData {
  readonly adjustedResult: 0 | 1 | 2 | 3 | 4;
  readonly addScore: number;
  readonly freeLiveEventBonusAppliedAddScore: number;
  readonly addPower: number;
  readonly feverScoreUpRate: number;
  readonly skillScoreUpRate: number;
  readonly crescendoSkillScoreUpRate: number;
  readonly scoreUpRate: number;
  readonly scoreUpType: number;
  readonly damageGuardType: 0 | 1 | 2;
  readonly neverDie: boolean;
}

export type OneFrameJudgementData = AutoLiveJudgementData | ManualJudgementData;
export type OneFrameDataPayload = OneFrameJudgementData & {
  readonly business?: OneFrameBusinessData;
};

export type OneFrameJudgementEntry = OneFrameDataPayload & {
  readonly slot: number;
  readonly containerId: string;
};

export interface OneFrameJudgementBatch {
  readonly batchIndex: number;
  readonly entries: readonly OneFrameJudgementEntry[];
  readonly entryCount: number;
  readonly addCombo: number;
  readonly rawResult: 0 | 1 | 2 | 3 | 4;
  readonly adjustedResult: 0 | 1 | 2 | 3 | 4;
  readonly judgeTiming: 0 | 1 | 2;
}
