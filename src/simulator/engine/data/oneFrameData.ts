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

export interface OneFrameJudgementEntry extends AutoLiveJudgementData {
  readonly slot: number;
  readonly containerId: string;
}

export interface OneFrameJudgementBatch {
  readonly batchIndex: number;
  readonly entries: readonly OneFrameJudgementEntry[];
  readonly entryCount: number;
  readonly addCombo: number;
  readonly rawResult: 4;
  readonly adjustedResult: 4;
  readonly judgeTiming: 0;
}
