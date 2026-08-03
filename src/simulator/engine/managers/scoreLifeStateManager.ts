import {
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  type ChartConstructionResult,
  type NoteInformation,
} from "../chart/types";
import type {
  OneFrameBusinessData,
  OneFrameJudgementBatch,
  OneFrameJudgementData,
} from "../data/oneFrameData";
import {
  SkillActivateEffectType,
  deepFreezeScoreLifeProfile,
  type FestivalRangeRate,
  type ScoreLifeInitializationSnapshot,
  type ScoreLifeModeValue,
  type ScoreLifeStateProfile,
} from "../data/scoreLifeState";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import { FeverTimeManager, type FeverTimeCommandName } from "./feverTimeManager";
import { InGameRecord, type InGameRecordSnapshot } from "./inGameRecord";
import { ScoreUtility } from "./scoreUtility";
import { SituationSkillManager, type SituationSkillSnapshot } from "./situationSkillManager";

export interface ScoreLifeReflectEntry {
  readonly slot: number;
  readonly ordinaryScore: number;
  readonly freeLiveEventBonusScore: number;
  readonly lifeDelta: number;
  readonly comboAfter: number;
  readonly stageEffectLevel: number;
  readonly scoreUpType: number;
  readonly crescendoRate: number;
}

export interface ScoreLifeReflectBatch {
  readonly batchIndex: number;
  readonly entries: readonly ScoreLifeReflectEntry[];
  readonly totalOrdinaryScore: number;
  readonly totalFreeLiveEventBonusScore: number;
  readonly representativeSlot: number;
  readonly representativeRawResult: 0 | 1 | 2 | 3 | 4;
  readonly representativeJudgeTiming: 0 | 1 | 2;
  readonly representativeScoreUpType: number;
  readonly representativeCrescendoRate: number;
}

export interface ScoreLifeReflectPlan {
  readonly batchIndex: number;
  readonly entryCount: number;
  readonly reflect: ScoreLifeReflectBatch;
  readonly record: InGameRecordSnapshot;
  readonly lifeHealAnimation: boolean;
}

interface PendingScoreLifeReflect {
  readonly plan: ScoreLifeReflectPlan;
  readonly stagedRecord: InGameRecord;
}

export interface ScoreLifeStateSnapshot {
  readonly initialization: ScoreLifeInitializationSnapshot;
  readonly record: InGameRecordSnapshot;
  readonly skill: SituationSkillSnapshot;
  readonly fever: ReturnType<FeverTimeManager["snapshot"]>;
  readonly gameFrameCounter: number;
  readonly lastReflectBatch: ScoreLifeReflectBatch | null;
  readonly trace: readonly string[];
}

export class ScoreLifeStateManager {
  readonly profile: ScoreLifeStateProfile;
  readonly record: InGameRecord;
  readonly scoreUtility: ScoreUtility;
  readonly skillManager: SituationSkillManager;
  readonly feverManager: FeverTimeManager;
  private readonly notesByIndex = new Map<number, NoteInformation>();
  private gameFrameCounterValue = 0;
  private lastReflectBatchValue: ScoreLifeReflectBatch | null = null;
  private pendingReflect: PendingScoreLifeReflect | null = null;
  private readonly traceValue: string[] = [];

  private constructor(
    profile: ScoreLifeStateProfile,
    chart: ChartConstructionResult,
    maxNoteCount: number,
  ) {
    this.profile = deepFreezeScoreLifeProfile(profile);
    this.record = new InGameRecord(
      profile.life.initialLife,
      profile.life.playerMaxLife,
      profile.life.lifeUpperLimit,
    );
    this.scoreUtility = new ScoreUtility(
      profile.deckTotalParameter,
      profile.freeLiveEventBonusDeckTotalParameter,
      profile.scoreLevel,
      maxNoteCount,
    );
    this.skillManager = new SituationSkillManager(
      new Map(profile.skills.map((skill) => [skill.skillNoteIndex, skill])),
      this.record,
    );
    this.feverManager = new FeverTimeManager(
      profile.fever.difficulty,
      profile.fever.ownTeamMemberCount,
      profile.mode.kind === "team-live-festival",
    );
    for (const batch of chart.noteBatches) {
      for (const note of batch.informationList) this.registerNote(note);
    }
  }

  static create(
    profile: ScoreLifeStateProfile,
    chart: ChartConstructionResult,
    runtimePlayMode: "manual" | "auto-live",
  ): SimulatorResult<ScoreLifeStateManager> {
    const validation = validateProfile(profile, runtimePlayMode);
    if (validation.status !== "ok") return validation;
    const maxNoteCount = countMaximumNotes(chart);
    if (!Number.isInteger(maxNoteCount) || maxNoteCount <= 0) {
      return evidenceRequired(
        "score-life.invalid-chart-max-note-count",
        ["SLS-D03", "BS01", "BS02"],
        "The parent-owned production chart must derive a positive Int32 maxNoteCount before ScoreUtility initialization.",
      );
    }
    return ok(new ScoreLifeStateManager(validation.value, chart, maxNoteCount));
  }

  get mode(): ScoreLifeModeValue {
    return this.profile.mode.kind;
  }

  update(deltaTimeSeconds: number): void {
    this.skillManager.update(Math.fround(deltaTimeSeconds));
    this.gameFrameCounterValue = addInt32(this.gameFrameCounterValue, 1);
  }

  freezeOneFrame(judgement: OneFrameJudgementData): OneFrameBusinessData {
    const note = this.notesByIndex.get(judgement.noteIndex);
    if (note === undefined) throw new Error("Score/Life owner lost NoteManager chart identity");
    const rawResult = judgement.rawResult;
    const adjustedResult = this.skillManager.correctResult(rawResult);
    this.consumeSkillOrFever(note, judgement.phase, adjustedResult);
    const skillScore = this.skillManager.projectScore(adjustedResult);
    const baseDamage = adjustedResult === 0
      ? this.profile.life.missDamage
      : adjustedResult === 1
      ? this.profile.life.badDamage
      : 0;
    const damage = this.skillManager.projectDamage(baseDamage);
    const ordinaryBase = this.getRoutedBaseScore(this.scoreUtility.baseScore);
    const bonusBase = this.getRoutedBaseScore(this.scoreUtility.freeLiveEventBonusBaseScore);
    const addScore = this.scoreUtility.calculateCorrectedBaseScore(
      ordinaryBase,
      adjustedResult,
      this.profile.mode,
      skillScore.fixedAddition,
    );
    const bonusAddScore = this.scoreUtility.calculateCorrectedBaseScore(
      bonusBase,
      adjustedResult,
      this.profile.mode,
      skillScore.fixedAddition,
    );
    const feverRate = this.feverManager.scoreRate;
    const scoreUpRate = Math.fround(
      Math.fround(feverRate * skillScore.rate) * skillScore.crescendoRate,
    );
    const business: OneFrameBusinessData = Object.freeze({
      adjustedResult,
      addScore,
      freeLiveEventBonusAppliedAddScore: bonusAddScore,
      addPower: damage.addPower,
      feverScoreUpRate: feverRate,
      skillScoreUpRate: skillScore.rate,
      crescendoSkillScoreUpRate: skillScore.crescendoRate,
      scoreUpRate,
      scoreUpType: skillScore.scoreUpType,
      damageGuardType: damage.damageGuardType,
      neverDie: damage.neverDie,
    });
    this.traceValue.push(`setup:${judgement.noteIndex}:${adjustedResult}`);
    return business;
  }

  preflightReflect(
    batch: OneFrameJudgementBatch,
  ): SimulatorResult<ScoreLifeReflectPlan> {
    if (this.pendingReflect !== null || batch.entries.length === 0) {
      return evidenceRequired(
        "score-life.reflect-plan-overlap-or-empty",
        ["SLS-D02", "SLS-D20", "BS10", "RPR-D13", "PR33"],
        "Exactly one non-empty owner Reflect batch may be planned without mutation.",
      );
    }
    const stagedRecord = this.record.cloneForPreflight();
    const projections: ScoreLifeReflectEntry[] = [];
    let totalOrdinaryScore = 0;
    let totalBonusScore = 0;
    let representative = batch.entries[0]!;
    for (const entry of batch.entries) {
      const business = entry.business;
      if (business === undefined) {
        return evidenceRequired(
          "score-life.reflect-entry-without-business-payload",
          ["SLS-D02", "SLS-D20", "BS10"],
          "A configured Score/Life session cannot Reflect an entry that was not frozen by its business owner at Setup.",
        );
      }
      stagedRecord.addCombo(entry.addCombo);
      const comboRate = this.scoreUtility.getComboCorrectionRate(
        stagedRecord.currentCombo,
        this.profile.mode,
        entry.buttonTypes,
      );
      let ordinaryScore = correctedScore(business.addScore, comboRate, business.scoreUpRate);
      const bonusScore = correctedScore(
        business.freeLiveEventBonusAppliedAddScore,
        comboRate,
        business.scoreUpRate,
      );
      const festival = this.getFestivalStageProjection(
        business.adjustedResult,
        stagedRecord.currentCombo,
        stagedRecord.currentLife,
        business.addScore,
      );
      ordinaryScore = Math.trunc(Math.fround(ordinaryScore * festival.rate));
      stagedRecord.addScore(ordinaryScore);
      stagedRecord.addFreeLiveEventBonusScore(bonusScore);
      const lifeDelta = stagedRecord.addLife(business.addPower);
      stagedRecord.incrementResult(business.adjustedResult, entry.judgeTiming);
      stagedRecord.updateOneNoteMax(
        ordinaryScore,
        business.skillScoreUpRate,
        business.feverScoreUpRate > 1,
      );
      stagedRecord.updateFreeLiveEventBonusOneNoteMax(
        bonusScore,
        business.skillScoreUpRate,
        business.feverScoreUpRate > 1,
      );
      totalOrdinaryScore = addInt32(totalOrdinaryScore, ordinaryScore);
      totalBonusScore = addInt32(totalBonusScore, bonusScore);
      if (entry.rawResult > representative.rawResult) representative = entry;
      projections.push(Object.freeze({
        slot: entry.slot,
        ordinaryScore,
        freeLiveEventBonusScore: bonusScore,
        lifeDelta,
        comboAfter: stagedRecord.currentCombo,
        stageEffectLevel: festival.level,
        scoreUpType: business.scoreUpType,
        crescendoRate: business.crescendoSkillScoreUpRate,
      }));
    }
    const reflect = Object.freeze({
      batchIndex: batch.batchIndex,
      entries: Object.freeze(projections),
      totalOrdinaryScore,
      totalFreeLiveEventBonusScore: totalBonusScore,
      representativeSlot: representative.slot,
      representativeRawResult: representative.rawResult,
      representativeJudgeTiming: representative.judgeTiming,
      representativeScoreUpType: representative.business!.scoreUpType,
      representativeCrescendoRate: representative.business!.crescendoSkillScoreUpRate,
    });
    const plan = Object.freeze({
      batchIndex: batch.batchIndex,
      entryCount: batch.entryCount,
      reflect,
      record: freezeRecordSnapshot(stagedRecord.snapshot()),
      lifeHealAnimation: this.skillManager.hasPendingLifeHealAnimation,
    });
    this.pendingReflect = Object.freeze({ plan, stagedRecord });
    return ok(plan);
  }

  commitReflect(plan: ScoreLifeReflectPlan): SimulatorResult<void> {
    if (this.pendingReflect?.plan !== plan) {
      return evidenceRequired(
        "score-life.invalid-reflect-plan",
        ["SLS-D20", "BS10", "RPR-D13", "PR33", "PR38"],
        "Only the exact one-use Score/Life Reflect plan may commit owner state.",
      );
    }
    this.record.commitFromPreflight(this.pendingReflect.stagedRecord);
    this.lastReflectBatchValue = plan.reflect;
    if (plan.lifeHealAnimation) this.skillManager.commitPendingLifeHealAnimation();
    this.traceValue.push(`reflect:${plan.batchIndex}:${plan.entryCount}`);
    this.pendingReflect = null;
    return ok(undefined);
  }

  discardReflect(plan: ScoreLifeReflectPlan): SimulatorResult<void> {
    if (this.pendingReflect?.plan !== plan) {
      return evidenceRequired(
        "score-life.invalid-reflect-discard",
        ["SLS-D20", "BS10", "RPR-D13", "PR33", "PR38"],
        "Only the exact pending Reflect plan may be discarded before owner mutation.",
      );
    }
    this.pendingReflect = null;
    return ok(undefined);
  }

  reflect(batch: OneFrameJudgementBatch): SimulatorResult<void> {
    const planned = this.preflightReflect(batch);
    return planned.status === "ok" ? this.commitReflect(planned.value) : planned;
  }

  updateFeverMemberPoint(
    displayIndex: number,
    point: number,
    isOwnTeam: boolean,
  ): SimulatorResult<void> {
    return this.feverManager.updateMemberPoint(displayIndex, point, isOwnTeam);
  }

  changeFeverCommand(command: FeverTimeCommandName): SimulatorResult<void> {
    return this.feverManager.changeCommand(command, this.gameFrameCounterValue);
  }

  continueLive(): SimulatorResult<void> {
    return evidenceRequired(
      "score-life.continue-excluded",
      ["SLS-D22", "SLS-D24", "BS36"],
      "Premium-currency Continue is outside the portable contract and performs no mutation.",
    );
  }

  snapshot(): ScoreLifeStateSnapshot {
    return {
      initialization: {
        sessionId: this.profile.sessionId,
        mode: this.mode,
        scoreLevel: this.profile.scoreLevel,
        maxNoteCount: this.scoreUtility.maxNoteCount,
        deckTotalParameter: this.profile.deckTotalParameter,
        scoreLevelRate: this.scoreUtility.scoreLevelRate,
        baseScore: this.scoreUtility.baseScore,
        freeLiveEventBonusBaseScore: this.scoreUtility.freeLiveEventBonusBaseScore,
      },
      record: this.record.snapshot(),
      skill: this.skillManager.snapshot(),
      fever: this.feverManager.snapshot(),
      gameFrameCounter: this.gameFrameCounterValue,
      lastReflectBatch: this.lastReflectBatchValue === null
        ? null
        : {
            ...this.lastReflectBatchValue,
            entries: this.lastReflectBatchValue.entries.map((entry) => ({ ...entry })),
          },
      trace: [...this.traceValue],
    };
  }

  private registerNote(note: NoteInformation): void {
    if (!this.notesByIndex.has(note.index)) this.notesByIndex.set(note.index, note);
    for (const child of note.slideNoteList) this.registerNote(child);
  }

  private consumeSkillOrFever(
    note: NoteInformation,
    phase: "head" | "intermediate" | "tail",
    result: 0 | 1 | 2 | 3 | 4,
  ): void {
    const terminal = phase === "tail";
    const additionalType = terminal
      ? note.gameNoteAdditionalTypeLongNoteEnd
      : note.gameNoteAdditionalType;
    if (additionalType === GameNoteAdditionalType.Skill) {
      const skillNoteIndex = terminal ? note.skillAfterNoteIndex : note.skillNoteIndex;
      if (result >= 3) this.skillManager.enqueue(skillNoteIndex, this.gameFrameCounterValue);
      else this.skillManager.fail(skillNoteIndex);
    }
    if (additionalType === GameNoteAdditionalType.Fever) this.feverManager.judge(result);
  }

  private getRoutedBaseScore(baseScore: number): number {
    if (
      this.record.singleGameOver &&
      (this.profile.mode.kind === "practice" || this.profile.mode.kind === "collaboration")
    ) return Math.fround(baseScore * Math.fround(0.1));
    return baseScore;
  }

  private getFestivalStageProjection(
    result: 0 | 1 | 2 | 3 | 4,
    combo: number,
    life: number,
    sourceScore: number,
  ): { readonly rate: number; readonly level: number } {
    if (this.profile.mode.kind !== "team-live-festival" || sourceScore <= 0) {
      return { rate: Math.fround(1), level: 0 };
    }
    const judge = this.profile.mode.judgeRates.find((row) => row.result === result)!;
    const comboRow = firstFestivalRange(this.profile.mode.comboRates, combo);
    const lifeRow = firstFestivalRange(this.profile.mode.lifeRates, life);
    const rate = Math.fround(Math.fround(judge.rate * comboRow.rate) * lifeRow.rate);
    if (rate === 0) return { rate, level: 0 };
    return { rate, level: Math.max(judge.level, comboRow.level, lifeRow.level) };
  }
}

export function countMaximumNotes(chart: ChartConstructionResult): number {
  let count = 0;
  const directionalGroups = new Set<string>();
  for (const batch of chart.noteBatches) {
    for (const note of batch.informationList) {
      if (
        note.gameNoteType === GameNoteType.None ||
        note.gameNoteAdditionalType === GameNoteAdditionalType.LaneChange ||
        (note.fireNoteType >= FrontNoteType.LongMultipleDirectionalFlickAdd &&
          note.fireNoteType <= FrontNoteType.SlideBMultipleDirectionalFlickAdd)
      ) continue;
      const directionalGroup =
        (note.gameNoteType === GameNoteType.DirectionalFlickLeft ||
          note.gameNoteType === GameNoteType.DirectionalFlickRight) &&
        note.fireNoteType === FrontNoteType.MultipleDirectionalFlick
          ? `${note.absolutePos}:${note.gameNoteType}`
          : null;
      if (directionalGroup === null || !directionalGroups.has(directionalGroup)) {
        count += 1;
        if (directionalGroup !== null) directionalGroups.add(directionalGroup);
      }
      if (note.gameNoteType === GameNoteType.Long) count += 1;
      count += note.slideNoteList.filter((child) => !child.isInvisible).length;
    }
  }
  return count;
}

function validateProfile(
  profile: ScoreLifeStateProfile,
  runtimePlayMode: "manual" | "auto-live",
): SimulatorResult<ScoreLifeStateProfile> {
  if (
    profile === null || typeof profile !== "object" || profile.schemaVersion !== 1 ||
    typeof profile.sessionId !== "string" || profile.sessionId.length === 0 ||
    !isInt32(profile.scoreLevel) || profile.scoreLevel < 5 ||
    !isFiniteFloat32(profile.deckTotalParameter) || profile.deckTotalParameter <= 0 ||
    !isFiniteFloat32(profile.freeLiveEventBonusDeckTotalParameter) ||
    profile.freeLiveEventBonusDeckTotalParameter < 0 ||
    (profile.freeLiveEventBonusDeckTotalParameter > 0 && profile.freeLiveEventBonusDeckTotalParameter < 1) ||
    !validLife(profile.life) || !validMode(profile.mode) ||
    !Array.isArray(profile.skills) || !validSkills(profile.skills) ||
    !validFever(profile.fever) ||
    (runtimePlayMode === "auto-live") !== (profile.mode.kind === "auto-live")
  ) {
    return evidenceRequired(
      "score-life.invalid-profile",
      ["SLS-D04", "SLS-D17", "SLS-D21", "SLS-D23", "SLS-D24", "BS36"],
      "The complete owner/session-bound numeric profile must validate before any Score/Life/Skill/Fever domain object is created.",
    );
  }
  return ok(deepFreezeScoreLifeProfile(profile));
}

function validLife(life: ScoreLifeStateProfile["life"]): boolean {
  return life !== null && typeof life === "object" &&
    [life.initialLife, life.playerMaxLife, life.lifeUpperLimit, life.missDamage, life.badDamage]
      .every(isInt32) &&
    life.initialLife >= 0 && life.playerMaxLife > 0 &&
    life.lifeUpperLimit >= life.initialLife && life.missDamage <= 0 && life.badDamage <= 0;
}

function validSkills(skills: readonly ScoreLifeStateProfile["skills"][number][]): boolean {
  const indices = new Set<number>();
  for (const skill of skills) {
    if (!isInt32(skill.skillNoteIndex) || skill.skillNoteIndex < 1 || skill.skillNoteIndex > 6 ||
      indices.has(skill.skillNoteIndex) || !isFiniteFloat32(skill.durationSeconds) ||
      skill.durationSeconds <= 0 || !Array.isArray(skill.activeEffects)) return false;
    indices.add(skill.skillNoteIndex);
    if (skill.onceEffect !== undefined &&
      ((skill.onceEffect.valueType !== "real-value" && skill.onceEffect.valueType !== "rate") ||
        !isFiniteFloat32(skill.onceEffect.value) || skill.onceEffect.value < 0 ||
        (skill.onceEffect.conditionLife !== undefined && !isInt32(skill.onceEffect.conditionLife)))) return false;
    for (const effect of skill.activeEffects) {
      if (!isInt32(effect.type) || effect.type < 0 || effect.type > 10 ||
        effect.type === SkillActivateEffectType.Heal ||
        (effect.valueType !== "real-value" && effect.valueType !== "rate") ||
        !isFiniteFloat32(effect.value) ||
        (effect.conditionResult !== undefined && (!isInt32(effect.conditionResult) || effect.conditionResult < 0 || effect.conditionResult > 4)) ||
        (effect.conditionLife !== undefined && !isInt32(effect.conditionLife)) ||
        (effect.maxValue !== undefined && !isFiniteFloat32(effect.maxValue)) ||
        (effect.type >= SkillActivateEffectType.ScoreOverLife &&
          effect.type !== SkillActivateEffectType.NeverDie && effect.valueType !== "rate") ||
        ((effect.type === SkillActivateEffectType.ScoreOverLife ||
          effect.type === SkillActivateEffectType.ScoreUnderLife) && effect.conditionLife === undefined) ||
        (effect.type === SkillActivateEffectType.ScoreContinuedNoteJudge && effect.conditionResult === undefined) ||
        (effect.type === SkillActivateEffectType.ScoreRateUpWithPerfect && effect.maxValue === undefined)) return false;
    }
  }
  return true;
}

function validMode(mode: ScoreLifeStateProfile["mode"]): boolean {
  if (mode === null || typeof mode !== "object") return false;
  if (mode.kind === "ordinary" || mode.kind === "practice" || mode.kind === "collaboration") return true;
  if (mode.kind === "auto-live") return isFiniteFloat32(mode.comboCoefficient) && mode.comboCoefficient >= 0;
  if (mode.kind === "single-medley" || mode.kind === "garupa-cup-first-qualification") {
    return validRanges(mode.comboRates);
  }
  if (mode.kind === "team-live-festival") {
    return mode.judgeRates.length === 5 && new Set(mode.judgeRates.map((row) => row.result)).size === 5 &&
      mode.judgeRates.every((row) => isFiniteFloat32(row.rate) && row.rate >= 0 && isInt32(row.level)) &&
      validFestivalRanges(mode.comboRates) && validFestivalRanges(mode.lifeRates);
  }
  return false;
}

function validFestivalRanges(
  ranges: readonly { readonly from: number; readonly to: number; readonly rate: number }[],
): boolean {
  return validRanges(ranges) && ranges[0]!.from <= 0 &&
    ranges[ranges.length - 1]!.to === 0x7fffffff &&
    ranges.every((row, index) => index === 0 || ranges[index - 1]!.to + 1 === row.from);
}

function validRanges(ranges: readonly { readonly from: number; readonly to: number; readonly rate: number }[]): boolean {
  if (!Array.isArray(ranges) || ranges.length === 0) return false;
  for (let index = 0; index < ranges.length; index += 1) {
    const row = ranges[index]!;
    if (!isInt32(row.from) || !isInt32(row.to) || row.from > row.to || !isFiniteFloat32(row.rate) || row.rate < 0) return false;
    if (index > 0 && ranges[index - 1]!.to >= row.from) return false;
  }
  return true;
}

function validFever(fever: ScoreLifeStateProfile["fever"]): boolean {
  return fever !== null && typeof fever === "object" &&
    ["easy", "normal", "hard", "expert", "special"].includes(fever.difficulty) &&
    isInt32(fever.ownTeamMemberCount) && fever.ownTeamMemberCount > 0;
}

function freezeRecordSnapshot(
  snapshot: InGameRecordSnapshot,
): InGameRecordSnapshot {
  return Object.freeze({
    ...snapshot,
    resultCounts: Object.freeze([...snapshot.resultCounts]) as InGameRecordSnapshot["resultCounts"],
    oneNoteMax: Object.freeze({ ...snapshot.oneNoteMax }),
    freeLiveEventBonusOneNoteMax: Object.freeze({
      ...snapshot.freeLiveEventBonusOneNoteMax,
    }),
  });
}

function correctedScore(source: number, comboRate: number, scoreUpRate: number): number {
  const comboCorrected = Math.trunc(Math.fround(source * comboRate));
  return Math.trunc(Math.fround(Math.fround(comboCorrected) * scoreUpRate));
}

function firstFestivalRange(
  ranges: readonly FestivalRangeRate[],
  value: number,
): FestivalRangeRate {
  return ranges.find((row) => row.from <= value && value <= row.to)!;
}

function isFiniteFloat32(value: number): boolean {
  return Number.isFinite(value) && Math.fround(value) === value;
}

function isInt32(value: number): boolean {
  return Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
}

function addInt32(left: number, right: number): number {
  return (left + right) | 0;
}
