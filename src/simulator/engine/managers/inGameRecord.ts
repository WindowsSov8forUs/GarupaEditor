import type { JudgeTimingValue, NoteResultTypeValue } from "../data/manualJudgement";

export interface OneNoteMaxScoreInfo {
  readonly score: number;
  readonly combo: number;
}

export interface InGameRecordSnapshot {
  readonly score: number;
  readonly reserveTotalScore: number;
  readonly currentLife: number;
  readonly playerMaxLife: number;
  readonly lifeUpperLimit: number;
  readonly currentCombo: number;
  readonly maxCombo: number;
  readonly perfectCombo: number;
  readonly resultCounts: readonly [number, number, number, number, number];
  readonly fastCount: number;
  readonly slowCount: number;
  readonly allPerfect: boolean;
  readonly oneNoteMax: OneNoteMaxScoreInfo;
  readonly singleGameOver: boolean;
}

const EMPTY_ONE_NOTE: OneNoteMaxScoreInfo = Object.freeze({ score: 0, combo: 0 });

export class InGameRecord {
  private scoreValue = 0;
  private reserveTotalScoreValue = 0;
  private currentLifeValue: number;
  private currentComboValue = 0;
  private maxComboValue = 0;
  private perfectComboValue = 0;
  private readonly resultCountsValue = [0, 0, 0, 0, 0] as [number, number, number, number, number];
  private fastCountValue = 0;
  private slowCountValue = 0;
  private allPerfectValue = true;
  private oneNoteMaxValue = EMPTY_ONE_NOTE;
  private singleGameOverValue = false;

  constructor(
    initialLife: number,
    readonly playerMaxLife: number,
    readonly lifeUpperLimit: number,
  ) {
    this.currentLifeValue = initialLife;
  }

  get currentLife(): number { return this.currentLifeValue; }
  get currentCombo(): number { return this.currentComboValue; }
  get singleGameOver(): boolean { return this.singleGameOverValue; }

  getClearStatus(maxNoteCount: number): 1 | 2 | 3 {
    const perfectCount = this.resultCountsValue[4];
    if (perfectCount === maxNoteCount) return 3;
    return perfectCount + this.resultCountsValue[3] === maxNoteCount ? 2 : 1;
  }

  addScore(value: number): void {
    this.scoreValue = addInt32(this.scoreValue, value);
    this.reserveTotalScoreValue = addInt32(this.reserveTotalScoreValue, value);
  }

  addCombo(value: number): void {
    if (value > 0) {
      this.currentComboValue = addInt32(this.currentComboValue, value);
      if (this.currentComboValue > this.maxComboValue) this.maxComboValue = this.currentComboValue;
    } else if (value < 0) {
      this.currentComboValue = 0;
    }
  }

  addLife(value: number): number {
    if (this.singleGameOverValue && value > 0) return 0;
    const before = this.currentLifeValue;
    const sum = addInt32(before, value);
    this.currentLifeValue = Math.min(this.lifeUpperLimit, Math.max(0, sum));
    if (this.currentLifeValue <= 0) this.singleGameOverValue = true;
    return this.currentLifeValue - before;
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

  updateOneNoteMax(score: number): void {
    if (this.oneNoteMaxValue.score < score) {
      this.oneNoteMaxValue = Object.freeze({ score, combo: this.currentComboValue });
    }
  }

  cloneForPreflight(): InGameRecord {
    const clone = new InGameRecord(this.currentLifeValue, this.playerMaxLife, this.lifeUpperLimit);
    clone.commitFromPreflight(this);
    return clone;
  }

  commitFromPreflight(staged: InGameRecord): void {
    if (staged.playerMaxLife !== this.playerMaxLife || staged.lifeUpperLimit !== this.lifeUpperLimit) {
      throw new Error("InGameRecord preflight profile identity changed");
    }
    this.scoreValue = staged.scoreValue;
    this.reserveTotalScoreValue = staged.reserveTotalScoreValue;
    this.currentLifeValue = staged.currentLifeValue;
    this.currentComboValue = staged.currentComboValue;
    this.maxComboValue = staged.maxComboValue;
    this.perfectComboValue = staged.perfectComboValue;
    for (let index = 0; index < this.resultCountsValue.length; index += 1) {
      this.resultCountsValue[index] = staged.resultCountsValue[index]!;
    }
    this.fastCountValue = staged.fastCountValue;
    this.slowCountValue = staged.slowCountValue;
    this.allPerfectValue = staged.allPerfectValue;
    this.oneNoteMaxValue = Object.freeze({ ...staged.oneNoteMaxValue });
    this.singleGameOverValue = staged.singleGameOverValue;
  }

  snapshot(): InGameRecordSnapshot {
    return Object.freeze({
      score: this.scoreValue,
      reserveTotalScore: this.reserveTotalScoreValue,
      currentLife: this.currentLifeValue,
      playerMaxLife: this.playerMaxLife,
      lifeUpperLimit: this.lifeUpperLimit,
      currentCombo: this.currentComboValue,
      maxCombo: this.maxComboValue,
      perfectCombo: this.perfectComboValue,
      resultCounts: Object.freeze([...this.resultCountsValue]) as InGameRecordSnapshot["resultCounts"],
      fastCount: this.fastCountValue,
      slowCount: this.slowCountValue,
      allPerfect: this.allPerfectValue,
      oneNoteMax: Object.freeze({ ...this.oneNoteMaxValue }),
      singleGameOver: this.singleGameOverValue,
    });
  }
}

function addInt32(left: number, right: number): number {
  return (left + right) | 0;
}
