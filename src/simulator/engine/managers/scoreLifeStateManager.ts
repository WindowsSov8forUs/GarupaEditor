import {
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  type ChartConstructionResult,
} from "../chart/types";
import type {
  OneFrameBusinessData,
  OneFrameJudgementBatch,
  OneFrameJudgementData,
} from "../data/oneFrameData";
import {
  deepFreezeScoreLifeProfile,
  type ScoreLifeInitializationSnapshot,
  type ScoreLifeModeValue,
  type ScoreLifeStateProfile,
} from "../data/scoreLifeState";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import type { SinglePlayScoreGaugeSnapshot } from "../data/singlePlayScoreGauge";
import { InGameRecord, type InGameRecordSnapshot } from "./inGameRecord";
import { ScoreUtility } from "./scoreUtility";
import { SinglePlayScoreGauge } from "./singlePlayScoreGauge";

export interface ScoreLifeReflectEntry {
  readonly slot: number;
  readonly score: number;
  readonly lifeDelta: number;
  readonly comboAfter: number;
}

export interface ScoreLifeReflectBatch {
  readonly batchIndex: number;
  readonly entries: readonly ScoreLifeReflectEntry[];
  readonly totalScore: number;
  readonly representativeSlot: number;
  readonly representativeRawResult: 0 | 1 | 2 | 3 | 4;
  readonly representativeJudgeTiming: 0 | 1 | 2;
}

export interface ScoreLifeReflectPlan {
  readonly batchIndex: number;
  readonly entryCount: number;
  readonly reflect: ScoreLifeReflectBatch;
  readonly record: InGameRecordSnapshot;
  readonly scoreGauge: SinglePlayScoreGaugeSnapshot;
}

interface PendingScoreLifeReflect {
  readonly plan: ScoreLifeReflectPlan;
  readonly stagedRecord: InGameRecord;
  readonly stagedScoreGauge: SinglePlayScoreGauge;
}

export interface ScoreLifeStateSnapshot {
  readonly initialization: ScoreLifeInitializationSnapshot;
  readonly record: InGameRecordSnapshot;
  readonly scoreGauge: SinglePlayScoreGaugeSnapshot;
  readonly lastReflectBatch: ScoreLifeReflectBatch | null;
  readonly trace: readonly string[];
}

export class ScoreLifeStateManager {
  readonly profile: ScoreLifeStateProfile;
  readonly record: InGameRecord;
  readonly scoreUtility: ScoreUtility;
  readonly scoreGauge: SinglePlayScoreGauge;
  private lastReflectBatchValue: ScoreLifeReflectBatch | null = null;
  private pendingReflect: PendingScoreLifeReflect | null = null;
  private readonly traceValue: string[] = [];

  private constructor(
    profile: ScoreLifeStateProfile,
    maxNoteCount: number,
    scoreGauge: SinglePlayScoreGauge,
  ) {
    this.profile = deepFreezeScoreLifeProfile(profile);
    this.record = new InGameRecord(
      profile.life.initialLife,
      profile.life.playerMaxLife,
      profile.life.lifeUpperLimit,
    );
    this.scoreUtility = new ScoreUtility(
      profile.totalParameter,
      profile.scoreLevel,
      maxNoteCount,
    );
    this.scoreGauge = scoreGauge;
  }

  static create(
    profile: ScoreLifeStateProfile,
    chart: ChartConstructionResult,
    runtimePlayMode: "manual" | "auto-live",
  ): SimulatorResult<ScoreLifeStateManager> {
    const validation = validateProfile(profile, runtimePlayMode);
    if (validation.status !== "ok") return validation;
    const scoreGauge = SinglePlayScoreGauge.create(validation.value.scoreGaugeMaster);
    if (scoreGauge.status !== "ok") return scoreGauge;
    const initializedGauge = scoreGauge.value.update(0);
    if (initializedGauge.status !== "ok") return initializedGauge;
    const maxNoteCount = countMaximumNotes(chart);
    if (!Number.isInteger(maxNoteCount) || maxNoteCount <= 0) {
      return evidenceRequired(
        "score-life.invalid-chart-max-note-count",
        ["SLS-D03", "BS01", "BS02"],
        "The parent-owned production chart must derive a positive Int32 maxNoteCount before score initialization.",
      );
    }
    return ok(new ScoreLifeStateManager(validation.value, maxNoteCount, scoreGauge.value));
  }

  get mode(): ScoreLifeModeValue { return this.profile.mode.kind; }

  getClearStatus(): 1 | 2 | 3 {
    return this.record.getClearStatus(this.scoreUtility.maxNoteCount);
  }

  freezeOneFrame(judgement: OneFrameJudgementData): OneFrameBusinessData {
    const adjustedResult = judgement.rawResult;
    const addPower = adjustedResult === 0
      ? this.profile.life.missDamage
      : adjustedResult === 1
      ? this.profile.life.badDamage
      : 0;
    const addScore = this.scoreUtility.calculateCorrectedBaseScore(
      adjustedResult,
      this.profile.mode,
    );
    this.traceValue.push(`setup:${judgement.noteIndex}:${adjustedResult}`);
    return Object.freeze({ adjustedResult, addScore, addPower });
  }

  preflightReflect(batch: OneFrameJudgementBatch): SimulatorResult<ScoreLifeReflectPlan> {
    if (this.pendingReflect !== null || batch.entries.length === 0) {
      return evidenceRequired(
        "score-life.reflect-plan-overlap-or-empty",
        ["SLS-D02", "SLS-D20", "BS10", "RPR-D13", "PR33"],
        "Exactly one non-empty score/life Reflect batch may be planned without mutation.",
      );
    }
    const stagedRecord = this.record.cloneForPreflight();
    const stagedScoreGauge = this.scoreGauge.cloneForPreflight();
    const entries: ScoreLifeReflectEntry[] = [];
    let totalScore = 0;
    let representative = batch.entries[0]!;
    for (const entry of batch.entries) {
      const business = entry.business;
      if (business === undefined) {
        return evidenceRequired(
          "score-life.reflect-entry-without-business-payload",
          ["SLS-D02", "SLS-D20", "BS10"],
          "A configured score/life session cannot Reflect an entry without its frozen gameplay projection.",
        );
      }
      stagedRecord.addCombo(entry.addCombo);
      const comboRate = this.scoreUtility.getComboCorrectionRate(
        stagedRecord.currentCombo,
        this.profile.mode,
        entry.buttonTypes,
      );
      const score = correctedScore(business.addScore, comboRate);
      stagedRecord.addScore(score);
      const lifeDelta = stagedRecord.addLife(business.addPower);
      stagedRecord.incrementResult(business.adjustedResult, entry.judgeTiming);
      stagedRecord.updateOneNoteMax(score);
      totalScore = addInt32(totalScore, score);
      if (entry.rawResult > representative.rawResult) representative = entry;
      entries.push(Object.freeze({
        slot: entry.slot,
        score,
        lifeDelta,
        comboAfter: stagedRecord.currentCombo,
      }));
    }
    const gauge = stagedScoreGauge.update(stagedRecord.snapshot().score);
    if (gauge.status !== "ok") return gauge;
    const reflect: ScoreLifeReflectBatch = Object.freeze({
      batchIndex: batch.batchIndex,
      entries: Object.freeze(entries),
      totalScore,
      representativeSlot: representative.slot,
      representativeRawResult: representative.rawResult,
      representativeJudgeTiming: representative.judgeTiming,
    });
    const plan: ScoreLifeReflectPlan = Object.freeze({
      batchIndex: batch.batchIndex,
      entryCount: batch.entryCount,
      reflect,
      record: freezeRecordSnapshot(stagedRecord.snapshot()),
      scoreGauge: freezeScoreGaugeSnapshot(gauge.value),
    });
    this.pendingReflect = Object.freeze({ plan, stagedRecord, stagedScoreGauge });
    return ok(plan);
  }

  commitReflect(plan: ScoreLifeReflectPlan): SimulatorResult<void> {
    if (this.pendingReflect?.plan !== plan) {
      return evidenceRequired(
        "score-life.invalid-reflect-plan",
        ["SLS-D20", "BS10", "RPR-D13", "PR33", "PR38"],
        "Only the exact one-use score/life Reflect plan may commit owner state.",
      );
    }
    this.record.commitFromPreflight(this.pendingReflect.stagedRecord);
    this.scoreGauge.commitFromPreflight(this.pendingReflect.stagedScoreGauge);
    this.lastReflectBatchValue = plan.reflect;
    this.traceValue.push(`reflect:${plan.batchIndex}:${plan.entryCount}`);
    this.pendingReflect = null;
    return ok(undefined);
  }

  discardReflect(plan: ScoreLifeReflectPlan): SimulatorResult<void> {
    if (this.pendingReflect?.plan !== plan) {
      return evidenceRequired(
        "score-life.invalid-reflect-discard",
        ["SLS-D20", "BS10", "RPR-D13", "PR33", "PR38"],
        "Only the exact pending score/life Reflect plan may be discarded before owner mutation.",
      );
    }
    this.pendingReflect = null;
    return ok(undefined);
  }

  continueLive(): SimulatorResult<void> {
    return evidenceRequired(
      "score-life.continue-excluded",
      ["SLS-D22", "SLS-D24", "BS36"],
      "Premium-currency Continue remains outside the portable contract and performs no mutation.",
    );
  }

  snapshot(): ScoreLifeStateSnapshot {
    return Object.freeze({
      initialization: Object.freeze({
        sessionId: this.profile.sessionId,
        mode: this.mode,
        scoreLevel: this.profile.scoreLevel,
        maxNoteCount: this.scoreUtility.maxNoteCount,
        totalParameter: this.profile.totalParameter,
        scoreLevelRate: this.scoreUtility.scoreLevelRate,
        baseScore: this.scoreUtility.baseScore,
      }),
      record: this.record.snapshot(),
      scoreGauge: this.scoreGauge.snapshot(),
      lastReflectBatch: this.lastReflectBatchValue === null
        ? null
        : Object.freeze({
            ...this.lastReflectBatchValue,
            entries: Object.freeze(this.lastReflectBatchValue.entries.map((entry) => Object.freeze({ ...entry }))),
          }),
      trace: Object.freeze([...this.traceValue]),
    });
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
  const modeMatches = runtimePlayMode === "auto-live"
    ? profile?.mode?.kind === "auto-live"
    : profile?.mode?.kind === "ordinary" || profile?.mode?.kind === "practice";
  if (
    profile === null || typeof profile !== "object" || profile.schemaVersion !== 1 ||
    typeof profile.sessionId !== "string" || profile.sessionId.length === 0 ||
    !isInt32(profile.scoreLevel) || profile.scoreLevel < 5 ||
    !isFiniteFloat32(profile.totalParameter) || profile.totalParameter < 0 ||
    profile.scoreGaugeMaster === null || typeof profile.scoreGaugeMaster !== "object" ||
    !validLife(profile.life) || !validMode(profile.mode) || !modeMatches
  ) {
    return evidenceRequired(
      "score-life.invalid-profile",
      ["SLS-D01", "SLS-D03", "SLS-D24", "BS01", "BS36"],
      "The generic score/life profile requires exact scalar score inputs, life bounds and a runtime-matching ordinary, practice or Auto Live mode.",
    );
  }
  return ok(deepFreezeScoreLifeProfile(profile));
}

function validLife(life: ScoreLifeStateProfile["life"]): boolean {
  return life !== null && typeof life === "object" &&
    [life.initialLife, life.playerMaxLife, life.lifeUpperLimit, life.missDamage, life.badDamage]
      .every(isInt32) &&
    life.initialLife >= 0 && life.playerMaxLife > 0 &&
    life.lifeUpperLimit >= life.initialLife &&
    life.missDamage <= 0 && life.badDamage <= 0;
}

function validMode(mode: ScoreLifeStateProfile["mode"]): boolean {
  if (mode === null || typeof mode !== "object") return false;
  if (mode.kind === "ordinary" || mode.kind === "practice") return true;
  return mode.kind === "auto-live" &&
    isFiniteFloat32(mode.comboCoefficient) && mode.comboCoefficient >= 0;
}

function freezeRecordSnapshot(snapshot: InGameRecordSnapshot): InGameRecordSnapshot {
  return Object.freeze({
    ...snapshot,
    resultCounts: Object.freeze([...snapshot.resultCounts]) as InGameRecordSnapshot["resultCounts"],
    oneNoteMax: Object.freeze({ ...snapshot.oneNoteMax }),
  });
}

function freezeScoreGaugeSnapshot(
  snapshot: SinglePlayScoreGaugeSnapshot,
): SinglePlayScoreGaugeSnapshot {
  return Object.freeze({ ...snapshot });
}

function correctedScore(source: number, comboRate: number): number {
  return Math.trunc(Math.fround(Math.fround(source) * comboRate));
}

function isFiniteFloat32(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && Math.fround(value) === value;
}

function isInt32(value: number): boolean {
  return Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
}

function addInt32(left: number, right: number): number {
  return (left + right) | 0;
}
