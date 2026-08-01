import type { JudgeTimingValue, NoteResultTypeValue } from "../data/manualJudgement";

export interface OneNoteMaxScoreInfo {
  readonly score: number;
  readonly combo: number;
  readonly skillFactor: number;
  readonly isFever: boolean;
}

export interface InGameRecordSnapshot {
  readonly score: number;
  readonly freeLiveEventBonusScore: number;
  readonly reserveTotalScore: number;
  readonly currentLife: number;
  readonly playerMaxLife: number;
  readonly lifeUpperLimit: number;
  readonly currentCombo: number;
  readonly maxCombo: number;
  readonly currentLiveCombo: number;
  readonly currentLiveMaxCombo: number;
  readonly perfectCombo: number;
  readonly resultCounts: readonly [number, number, number, number, number];
  readonly fastCount: number;
  readonly slowCount: number;
  readonly allPerfect: boolean;
  readonly oneNoteMax: OneNoteMaxScoreInfo;
  readonly freeLiveEventBonusOneNoteMax: OneNoteMaxScoreInfo;
  readonly singleGameOver: boolean;
}

const EMPTY_ONE_NOTE: OneNoteMaxScoreInfo = Object.freeze({
  score: 0,
  combo: 0,
  skillFactor: Math.fround(0),
  isFever: false,
});

export class InGameRecord {
  private scoreValue = 0;
  private freeLiveEventBonusScoreValue = 0;
  private reserveTotalScoreValue = 0;
  private currentLifeValue: number;
  private currentComboValue = 0;
  private maxComboValue = 0;
  private currentLiveComboValue = 0;
  private currentLiveMaxComboValue = 0;
  private perfectComboValue = 0;
  private readonly resultCountsValue = [0, 0, 0, 0, 0] as [number, number, number, number, number];
  private fastCountValue = 0;
  private slowCountValue = 0;
  private allPerfectValue = true;
  private oneNoteMaxValue = EMPTY_ONE_NOTE;
  private freeLiveEventBonusOneNoteMaxValue = EMPTY_ONE_NOTE;
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

  addScore(value: number): void {
    this.scoreValue = addInt32(this.scoreValue, value);
    this.reserveTotalScoreValue = addInt32(this.reserveTotalScoreValue, value);
  }

  addFreeLiveEventBonusScore(value: number): void {
    this.freeLiveEventBonusScoreValue = addInt32(this.freeLiveEventBonusScoreValue, value);
    this.reserveTotalScoreValue = addInt32(this.reserveTotalScoreValue, value);
  }

  addCombo(value: number): void {
    if (value > 0) {
      this.currentComboValue = addInt32(this.currentComboValue, value);
      this.currentLiveComboValue = addInt32(this.currentLiveComboValue, value);
      if (this.currentComboValue > this.maxComboValue) this.maxComboValue = this.currentComboValue;
      if (this.currentLiveComboValue > this.currentLiveMaxComboValue) {
        this.currentLiveMaxComboValue = this.currentLiveComboValue;
      }
      return;
    }
    if (value < 0) {
      this.currentComboValue = 0;
      this.currentLiveComboValue = 0;
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

  updateOneNoteMax(
    score: number,
    skillFactor: number,
    isFever: boolean,
  ): void {
    if (this.oneNoteMaxValue.score < score) {
      this.oneNoteMaxValue = Object.freeze({
        score,
        combo: this.currentComboValue,
        skillFactor,
        isFever,
      });
    }
  }

  updateFreeLiveEventBonusOneNoteMax(
    score: number,
    skillFactor: number,
    isFever: boolean,
  ): void {
    if (this.freeLiveEventBonusOneNoteMaxValue.score < score) {
      this.freeLiveEventBonusOneNoteMaxValue = Object.freeze({
        score,
        combo: this.currentComboValue,
        skillFactor,
        isFever,
      });
    }
  }

  cloneForPreflight(): InGameRecord {
    const clone = new InGameRecord(
      this.currentLifeValue,
      this.playerMaxLife,
      this.lifeUpperLimit,
    );
    clone.commitFromPreflight(this);
    return clone;
  }

  commitFromPreflight(staged: InGameRecord): void {
    if (
      staged.playerMaxLife !== this.playerMaxLife ||
      staged.lifeUpperLimit !== this.lifeUpperLimit
    ) {
      throw new Error("InGameRecord preflight profile identity changed");
    }
    this.scoreValue = staged.scoreValue;
    this.freeLiveEventBonusScoreValue = staged.freeLiveEventBonusScoreValue;
    this.reserveTotalScoreValue = staged.reserveTotalScoreValue;
    this.currentLifeValue = staged.currentLifeValue;
    this.currentComboValue = staged.currentComboValue;
    this.maxComboValue = staged.maxComboValue;
    this.currentLiveComboValue = staged.currentLiveComboValue;
    this.currentLiveMaxComboValue = staged.currentLiveMaxComboValue;
    this.perfectComboValue = staged.perfectComboValue;
    for (let index = 0; index < this.resultCountsValue.length; index += 1) {
      this.resultCountsValue[index] = staged.resultCountsValue[index]!;
    }
    this.fastCountValue = staged.fastCountValue;
    this.slowCountValue = staged.slowCountValue;
    this.allPerfectValue = staged.allPerfectValue;
    this.oneNoteMaxValue = Object.freeze({ ...staged.oneNoteMaxValue });
    this.freeLiveEventBonusOneNoteMaxValue = Object.freeze({
      ...staged.freeLiveEventBonusOneNoteMaxValue,
    });
    this.singleGameOverValue = staged.singleGameOverValue;
  }

  snapshot(): InGameRecordSnapshot {
    return {
      score: this.scoreValue,
      freeLiveEventBonusScore: this.freeLiveEventBonusScoreValue,
      reserveTotalScore: this.reserveTotalScoreValue,
      currentLife: this.currentLifeValue,
      playerMaxLife: this.playerMaxLife,
      lifeUpperLimit: this.lifeUpperLimit,
      currentCombo: this.currentComboValue,
      maxCombo: this.maxComboValue,
      currentLiveCombo: this.currentLiveComboValue,
      currentLiveMaxCombo: this.currentLiveMaxComboValue,
      perfectCombo: this.perfectComboValue,
      resultCounts: [...this.resultCountsValue],
      fastCount: this.fastCountValue,
      slowCount: this.slowCountValue,
      allPerfect: this.allPerfectValue,
      oneNoteMax: { ...this.oneNoteMaxValue },
      freeLiveEventBonusOneNoteMax: { ...this.freeLiveEventBonusOneNoteMaxValue },
      singleGameOver: this.singleGameOverValue,
    };
  }
}

function addInt32(left: number, right: number): number {
  return (left + right) | 0;
}
