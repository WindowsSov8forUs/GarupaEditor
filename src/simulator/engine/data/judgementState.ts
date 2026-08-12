import type { JudgeTimingValue, NoteResultTypeValue } from "./manualJudgement";

export interface JudgementRecordSnapshot {
  readonly currentCombo: number;
  readonly maxCombo: number;
  readonly perfectCombo: number;
  readonly resultCounts: readonly [number, number, number, number, number];
  readonly fastCount: number;
  readonly slowCount: number;
  readonly allPerfect: boolean;
}

export class JudgementRecord {
  private currentComboValue = 0;
  private maxComboValue = 0;
  private perfectComboValue = 0;
  private readonly resultCountsValue = [0, 0, 0, 0, 0] as [number, number, number, number, number];
  private fastCountValue = 0;
  private slowCountValue = 0;
  private allPerfectValue = true;

  get currentCombo(): number { return this.currentComboValue; }

  getClearStatus(maxNoteCount: number): 1 | 2 | 3 {
    const perfectCount = this.resultCountsValue[4];
    if (perfectCount === maxNoteCount) return 3;
    return perfectCount + this.resultCountsValue[3] === maxNoteCount ? 2 : 1;
  }

  addCombo(value: number): void {
    if (value > 0) {
      this.currentComboValue = addInt32(this.currentComboValue, value);
      if (this.currentComboValue > this.maxComboValue) this.maxComboValue = this.currentComboValue;
    } else if (value < 0) {
      this.currentComboValue = 0;
    }
  }

  incrementResult(
    result: Exclude<NoteResultTypeValue, -1>,
    timing: JudgeTimingValue,
  ): void {
    this.resultCountsValue[result] = addInt32(this.resultCountsValue[result], 1);
    if (result === 4) this.perfectComboValue = addInt32(this.perfectComboValue, 1);
    else this.perfectComboValue = 0;
    if (result <= 3) this.allPerfectValue = false;
    if (timing === 1) this.fastCountValue = addInt32(this.fastCountValue, 1);
    if (timing === 2) this.slowCountValue = addInt32(this.slowCountValue, 1);
  }

  cloneForPreflight(): JudgementRecord {
    const clone = new JudgementRecord();
    clone.commitFromPreflight(this);
    return clone;
  }

  commitFromPreflight(staged: JudgementRecord): void {
    this.currentComboValue = staged.currentComboValue;
    this.maxComboValue = staged.maxComboValue;
    this.perfectComboValue = staged.perfectComboValue;
    for (let index = 0; index < this.resultCountsValue.length; index += 1) {
      this.resultCountsValue[index] = staged.resultCountsValue[index]!;
    }
    this.fastCountValue = staged.fastCountValue;
    this.slowCountValue = staged.slowCountValue;
    this.allPerfectValue = staged.allPerfectValue;
  }

  snapshot(): JudgementRecordSnapshot {
    return Object.freeze({
      currentCombo: this.currentComboValue,
      maxCombo: this.maxComboValue,
      perfectCombo: this.perfectComboValue,
      resultCounts: Object.freeze([...this.resultCountsValue]) as JudgementRecordSnapshot["resultCounts"],
      fastCount: this.fastCountValue,
      slowCount: this.slowCountValue,
      allPerfect: this.allPerfectValue,
    });
  }
}

function addInt32(left: number, right: number): number {
  return (left + right) | 0;
}
