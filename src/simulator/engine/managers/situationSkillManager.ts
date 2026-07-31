import {
  SkillActivateEffectType,
  type SituationSkillProfile,
  type SkillActivateEffectProfile,
} from "../data/scoreLifeState";
import type { NoteResultTypeValue } from "../data/manualJudgement";
import { InGameRecord } from "./inGameRecord";

export const SituationSkillPlayState = {
  None: 0,
  Begin: 1,
  Playing: 2,
  Finishing: 3,
} as const;

export interface SituationSkillSnapshot {
  readonly state: 0 | 1 | 2 | 3;
  readonly queue: readonly number[];
  readonly currentSkillNoteIndex: number | null;
  readonly skillTimer: number;
  readonly finishingTimer: number;
  readonly reservationFrame: number;
  readonly reservationEncore: boolean;
  readonly stockSize: 8;
  readonly continuousWorstResult: Exclude<NoteResultTypeValue, -1>;
  readonly crescendoRate: number;
  readonly trace: readonly string[];
}

export interface SkillScoreProjection {
  readonly rate: number;
  readonly scoreUpType: number;
  readonly crescendoRate: number;
  readonly fixedAddition: number;
}

export interface SkillDamageProjection {
  readonly addPower: number;
  readonly damageGuardType: 0 | 1 | 2;
  readonly neverDie: boolean;
}

export class SituationSkillManager {
  private stateValue: 0 | 1 | 2 | 3 = SituationSkillPlayState.None;
  private readonly queueValue: SituationSkillProfile[] = [];
  private currentValue: SituationSkillProfile | null = null;
  private skillTimerValue = Math.fround(0);
  private finishingTimerValue = Math.fround(0);
  private reservationFrameValue = 0x7fffffff;
  private reservationEncoreValue = false;
  private continuousWorstResultValue: Exclude<NoteResultTypeValue, -1> = 4;
  private crescendoRateValue = Math.fround(1);
  private readonly playedSkillNoteIndices = new Set<number>();
  private readonly traceValue: string[] = [];

  constructor(
    private readonly profiles: ReadonlyMap<number, SituationSkillProfile>,
    private readonly record: InGameRecord,
  ) {}

  enqueue(skillNoteIndex: number, gameFrameCounter: number): boolean {
    const profile = this.profiles.get(skillNoteIndex);
    if (profile === undefined || this.playedSkillNoteIndices.has(skillNoteIndex)) return false;
    this.playedSkillNoteIndices.add(skillNoteIndex);
    this.queueValue.push(profile);
    this.reservationFrameValue = addInt32(gameFrameCounter, 1);
    this.reservationEncoreValue = skillNoteIndex === 6;
    this.traceValue.push(`enqueue:${skillNoteIndex}`);
    if (this.stateValue === SituationSkillPlayState.None) {
      this.stateValue = SituationSkillPlayState.Begin;
    }
    return true;
  }

  fail(skillNoteIndex: number): void {
    this.playedSkillNoteIndices.add(skillNoteIndex);
    this.traceValue.push(`failed:${skillNoteIndex}`);
  }

  update(deltaTimeSeconds: number): void {
    if (this.stateValue === SituationSkillPlayState.Begin) {
      this.beginCurrent();
      return;
    }
    if (this.stateValue === SituationSkillPlayState.Playing) {
      if (this.skillTimerValue <= 0) {
        this.finishCurrent();
        return;
      }
      this.skillTimerValue = Math.fround(this.skillTimerValue - deltaTimeSeconds);
      return;
    }
    if (this.stateValue === SituationSkillPlayState.Finishing) {
      this.finishingTimerValue = Math.fround(this.finishingTimerValue - deltaTimeSeconds);
      if (this.finishingTimerValue <= 0) this.completeCurrent();
    }
  }

  correctResult(
    rawResult: Exclude<NoteResultTypeValue, -1>,
  ): Exclude<NoteResultTypeValue, -1> {
    for (const effect of this.activeEffects()) {
      if (
        effect.type === SkillActivateEffectType.Judge &&
        (effect.conditionResult ?? 0) <= rawResult
      ) return 4;
    }
    return rawResult;
  }

  projectDamage(baseDamage: number): SkillDamageProjection {
    let addPower = baseDamage | 0;
    let damageGuardType: 0 | 1 | 2 = 0;
    let neverDie = false;
    for (const effect of this.activeEffects()) {
      if (effect.type === SkillActivateEffectType.NeverDie) {
        damageGuardType = 2;
        neverDie = true;
        continue;
      }
      if (effect.type !== SkillActivateEffectType.Damage) continue;
      if (effect.valueType === "real-value") {
        addPower = addInt32(addPower, Math.trunc(effect.value));
      } else if (addPower < 0) {
        addPower = Math.trunc(
          Math.fround(Math.fround(effect.value * addPower) / Math.fround(100)),
        ) | 0;
        if (effect.value === 0 && this.record.currentLife >= 1) damageGuardType = 1;
      }
    }
    if (neverDie && -addPower >= this.record.currentLife) {
      addPower = addInt32(5, -this.record.currentLife);
    }
    return Object.freeze({ addPower, damageGuardType, neverDie });
  }

  projectScore(
    result: Exclude<NoteResultTypeValue, -1>,
  ): SkillScoreProjection {
    let rate = Math.fround(1);
    let scoreUpType = 0;
    let fixedAddition = Math.fround(0);
    for (const effect of this.activeEffects()) {
      if (effect.type === SkillActivateEffectType.Score && effect.valueType === "real-value") {
        if ((effect.conditionResult ?? 0) <= result) {
          fixedAddition = Math.fround(fixedAddition + Math.trunc(effect.value));
        }
        continue;
      }
      if (effect.valueType !== "rate") continue;
      const projected = this.projectRateEffect(effect, result);
      if (projected === null) continue;
      if (projected.returnImmediately) {
        return Object.freeze({
          rate: projected.rate,
          scoreUpType: projected.scoreUpType,
          crescendoRate: this.crescendoRateValue,
          fixedAddition,
        });
      }
      rate = Math.fround(rate * projected.rate);
      scoreUpType = projected.scoreUpType;
    }
    return Object.freeze({
      rate,
      scoreUpType,
      crescendoRate: this.crescendoRateValue,
      fixedAddition,
    });
  }

  stop(): void {
    this.stateValue = SituationSkillPlayState.None;
    while (this.queueValue.length > 0 || this.currentValue !== null) {
      this.traceValue.push(`stop-finish:${this.currentValue?.skillNoteIndex ?? this.queueValue[0]!.skillNoteIndex}`);
      if (this.currentValue !== null) this.queueValue.shift();
      else this.queueValue.shift();
      this.currentValue = null;
    }
    this.skillTimerValue = Math.fround(0);
    this.finishingTimerValue = Math.fround(0);
    this.traceValue.push("stop");
  }

  snapshot(): SituationSkillSnapshot {
    return {
      state: this.stateValue,
      queue: this.queueValue.map((profile) => profile.skillNoteIndex),
      currentSkillNoteIndex: this.currentValue?.skillNoteIndex ?? null,
      skillTimer: this.skillTimerValue,
      finishingTimer: this.finishingTimerValue,
      reservationFrame: this.reservationFrameValue,
      reservationEncore: this.reservationEncoreValue,
      stockSize: 8,
      continuousWorstResult: this.continuousWorstResultValue,
      crescendoRate: this.crescendoRateValue,
      trace: [...this.traceValue],
    };
  }

  private activeEffects(): readonly SkillActivateEffectProfile[] {
    return this.stateValue === SituationSkillPlayState.Playing && this.currentValue !== null
      ? this.currentValue.activeEffects
      : [];
  }

  private beginCurrent(): void {
    const profile = this.queueValue[0];
    if (profile === undefined) {
      this.stateValue = SituationSkillPlayState.None;
      return;
    }
    this.currentValue = profile;
    this.skillTimerValue = profile.durationSeconds;
    this.finishingTimerValue = Math.fround(0);
    this.continuousWorstResultValue = 4;
    this.crescendoRateValue = Math.fround(1);
    this.stateValue = SituationSkillPlayState.Playing;
    this.traceValue.push(`trigger:${profile.skillNoteIndex}`);
    this.playOnceEffect(profile);
  }

  private finishCurrent(): void {
    if (this.currentValue === null) return;
    this.finishingTimerValue = Math.fround(0.75);
    this.stateValue = SituationSkillPlayState.Finishing;
    this.traceValue.push(`finish:${this.currentValue.skillNoteIndex}`);
  }

  private completeCurrent(): void {
    const completed = this.currentValue;
    if (completed !== null) this.traceValue.push(`complete:${completed.skillNoteIndex}`);
    this.queueValue.shift();
    this.currentValue = null;
    this.skillTimerValue = Math.fround(0);
    this.finishingTimerValue = Math.fround(0);
    this.stateValue = this.queueValue.length > 0
      ? SituationSkillPlayState.Begin
      : SituationSkillPlayState.None;
  }

  private playOnceEffect(profile: SituationSkillProfile): void {
    const effect = profile.onceEffect;
    if (effect === undefined) return;
    if (effect.conditionLife !== undefined && this.record.currentLife >= effect.conditionLife) return;
    const amount = effect.valueType === "real-value"
      ? Math.trunc(effect.value)
      : Math.trunc((this.record.playerMaxLife * Math.trunc(effect.value)) / 100);
    this.record.addLife(amount);
    this.traceValue.push(`heal:${amount}`);
  }

  private projectRateEffect(
    effect: SkillActivateEffectProfile,
    result: Exclude<NoteResultTypeValue, -1>,
  ): { readonly rate: number; readonly scoreUpType: number; readonly returnImmediately: boolean } | null {
    const percentRate = Math.fround(Math.fround(effect.value / Math.fround(100)) + Math.fround(1));
    switch (effect.type) {
      case SkillActivateEffectType.Score:
        if ((effect.conditionResult ?? 0) > result) return null;
        return { rate: percentRate, scoreUpType: result === 4 ? 2 : 1, returnImmediately: false };
      case SkillActivateEffectType.ScoreOverLife:
        if (this.record.currentLife < (effect.conditionLife ?? 0)) return null;
        return { rate: percentRate, scoreUpType: 1, returnImmediately: false };
      case SkillActivateEffectType.ScoreUnderLife:
        if (this.record.currentLife >= (effect.conditionLife ?? 0)) return null;
        return { rate: percentRate, scoreUpType: 1, returnImmediately: false };
      case SkillActivateEffectType.ScoreContinuedNoteJudge:
        if (result < this.continuousWorstResultValue) this.continuousWorstResultValue = result;
        if ((effect.conditionResult ?? 0) > this.continuousWorstResultValue) return null;
        return { rate: percentRate, scoreUpType: 2, returnImmediately: true };
      case SkillActivateEffectType.ScoreRateUpWithPerfect:
        if (result === 4) {
          const maxRate = Math.fround(Math.fround((effect.maxValue ?? effect.value) / 100) + 1);
          this.crescendoRateValue = Math.min(
            maxRate,
            Math.fround(this.crescendoRateValue + Math.fround(effect.value / 100)),
          );
        }
        return { rate: Math.fround(1), scoreUpType: 5, returnImmediately: true };
      case SkillActivateEffectType.ScoreOnlyPerfect:
        if (result === 4) return { rate: percentRate, scoreUpType: 2, returnImmediately: false };
        return { rate: Math.fround(0), scoreUpType: result >= 2 ? 3 : 0, returnImmediately: true };
      case SkillActivateEffectType.ScoreUnderGreatHalf:
        if (result === 4) return { rate: percentRate, scoreUpType: 2, returnImmediately: false };
        return {
          rate: result >= 2 ? Math.fround(0.5) : Math.fround(0),
          scoreUpType: result >= 2 ? 4 : 0,
          returnImmediately: true,
        };
      default:
        return null;
    }
  }
}

function addInt32(left: number, right: number): number {
  return (left + right) | 0;
}
