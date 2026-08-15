import type { NoteInformation } from "../chart/types";
import type {
  OneFrameBusinessData,
  OneFrameJudgementBatch,
  OneFrameJudgementData,
} from "../data/oneFrameData";
import {
  deepFreezeScoreLifeProfile,
  type ScoreLifeInitializationSnapshot,
  type ScoreLifeStateProfile,
} from "../data/scoreLifeState";
import {
  validateSimulatorModeIdentity,
  type SimulatorModeIdentity,
} from "../data/inGameCalculatedData";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import type { SinglePlayScoreGaugeSnapshot } from "../data/singlePlayScoreGauge";
import { NORMALIZED_SCORE_RULESET_ID, type SimulatorScoringPlan } from "../scoring/contracts";
import { calculateNormalizedScoreContribution } from "../scoring/normalizedScoreRule";
import { InGameRecord, type InGameRecordSnapshot } from "./inGameRecord";
import { SinglePlayScoreGauge } from "./singlePlayScoreGauge";

export interface ScoreLifeReflectEntry {
  readonly slot: number;
  readonly scoringUnitId: string;
  readonly scoringUnitOrdinal: number;
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
  readonly stagedConsumedScoringUnitIds: ReadonlySet<string>;
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
  readonly scoreGauge: SinglePlayScoreGauge;
  private consumedScoringUnitIds = new Set<string>();
  private lastReflectBatchValue: ScoreLifeReflectBatch | null = null;
  private pendingReflect: PendingScoreLifeReflect | null = null;
  private readonly traceValue: string[] = [];
  private timelineRevisionValue = 0;

  private constructor(
    profile: ScoreLifeStateProfile,
    readonly scoringPlan: SimulatorScoringPlan,
    scoreGauge: SinglePlayScoreGauge,
  ) {
    this.profile = deepFreezeScoreLifeProfile(profile);
    this.record = new InGameRecord(
      profile.life.initialLife,
      profile.life.playerMaxLife,
      profile.life.lifeUpperLimit,
    );
    this.scoreGauge = scoreGauge;
  }

  static create(
    profile: ScoreLifeStateProfile,
    scoringPlan: SimulatorScoringPlan,
    runtimeMode: SimulatorModeIdentity,
  ): SimulatorResult<ScoreLifeStateManager> {
    const validation = validateProfile(profile, runtimeMode);
    if (validation.status !== "ok") return validation;
    if (!validScoringPlan(scoringPlan)) {
      return evidenceRequired(
        "score-life.invalid-scoring-plan",
        [],
        "Score/Life initialization requires one immutable CS-V1 plan with a positive chart-owned unit count and exact scoreMaximum.",
      );
    }
    const scoreGauge = SinglePlayScoreGauge.create(scoringPlan.totalScoringUnitCount);
    if (scoreGauge.status !== "ok") return scoreGauge;
    const initializedGauge = scoreGauge.value.update(0);
    if (initializedGauge.status !== "ok") return initializedGauge;
    return ok(new ScoreLifeStateManager(validation.value, scoringPlan, scoreGauge.value));
  }

  get mode(): SimulatorModeIdentity { return this.profile.mode; }

  getClearStatus(): 1 | 2 | 3 {
    return this.record.getClearStatus(this.scoringPlan.totalScoringUnitCount);
  }

  freezeOneFrame(
    judgement: OneFrameJudgementData,
    source: NoteInformation,
  ): SimulatorResult<OneFrameBusinessData> {
    const unit = this.scoringPlan.resolve(source, judgement.phase);
    if (unit.status !== "ok") return unit;
    const adjustedResult = judgement.rawResult;
    const contribution = calculateNormalizedScoreContribution(
      unit.value,
      adjustedResult,
      this.profile.mode.isAutoPlay,
    );
    if (contribution.status !== "ok") return contribution;
    const addPower = adjustedResult === 0
      ? this.profile.life.missDamage
      : adjustedResult === 1
      ? this.profile.life.badDamage
      : 0;
    return ok(Object.freeze({
      scoringUnitId: unit.value.id,
      scoringUnitOrdinal: unit.value.ordinal,
      adjustedResult,
      addScore: contribution.value,
      addPower,
    }));
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
    const stagedConsumed = new Set(this.consumedScoringUnitIds);
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
      const unit = this.scoringPlan.getById(business.scoringUnitId);
      if (unit === undefined || unit.ordinal !== business.scoringUnitOrdinal ||
          stagedConsumed.has(unit.id)) {
        return evidenceRequired(
          "score-life.foreign-or-duplicate-scoring-unit",
          [],
          `Every CS-V1 scoring unit must belong to this plan, preserve its ordinal and be consumed exactly once (id=${business.scoringUnitId}, ordinal=${business.scoringUnitOrdinal}).`,
        );
      }
      const expected = calculateNormalizedScoreContribution(
        unit,
        business.adjustedResult,
        this.profile.mode.isAutoPlay,
      );
      if (expected.status !== "ok" || expected.value !== business.addScore) {
        return evidenceRequired(
          "score-life.scoring-contribution-identity-mismatch",
          [],
          "The frozen CS-V1 contribution must match the plan-owned quota, judgement and session mode.",
        );
      }
      const scoreBefore = stagedRecord.snapshot().score;
      const scoreAfter = scoreBefore + business.addScore;
      if (!isUInt32(scoreAfter) || scoreAfter > this.scoringPlan.scoreMaximum) {
        return evidenceRequired(
          "score-life.score-maximum-exceeded",
          [],
          "CS-V1 score accumulation is monotonic UInt32 and cannot exceed the chart-derived scoreMaximum.",
        );
      }
      stagedConsumed.add(unit.id);
      stagedRecord.addCombo(entry.addCombo);
      stagedRecord.addScore(business.addScore);
      const lifeDelta = stagedRecord.addLife(business.addPower);
      stagedRecord.incrementResult(business.adjustedResult, entry.judgeTiming);
      stagedRecord.updateOneNoteMax(business.addScore);
      totalScore = addInt32(totalScore, business.addScore);
      if (entry.rawResult > representative.rawResult) representative = entry;
      entries.push(Object.freeze({
        slot: entry.slot,
        scoringUnitId: unit.id,
        scoringUnitOrdinal: unit.ordinal,
        score: business.addScore,
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
    this.pendingReflect = Object.freeze({
      plan,
      stagedRecord,
      stagedScoreGauge,
      stagedConsumedScoringUnitIds: stagedConsumed,
    });
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
    this.consumedScoringUnitIds = new Set(this.pendingReflect.stagedConsumedScoringUnitIds);
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
        mode: Object.freeze({ ...this.mode }),
        ruleSetId: this.scoringPlan.ruleSetId,
        totalScoringUnitCount: this.scoringPlan.totalScoringUnitCount,
        scoreMaximum: this.scoringPlan.scoreMaximum,
        consumedScoringUnitCount: this.consumedScoringUnitIds.size,
        timelineRevision: this.timelineRevisionValue,
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

function validateProfile(
  profile: ScoreLifeStateProfile,
  runtimeMode: SimulatorModeIdentity,
): SimulatorResult<ScoreLifeStateProfile> {
  const validatedRuntime = validateSimulatorModeIdentity(runtimeMode);
  const validatedProfile = validateSimulatorModeIdentity(profile?.mode);
  const modeMatches = validatedRuntime.status === "ok" && validatedProfile.status === "ok" &&
    Object.keys(validatedRuntime.value).every((key) =>
      validatedRuntime.value[key as keyof SimulatorModeIdentity] ===
        validatedProfile.value[key as keyof SimulatorModeIdentity]
    );
  if (
    profile === null || typeof profile !== "object" ||
    Object.keys(profile).sort().join(",") !== "life,mode,schemaVersion,sessionId" ||
    profile.schemaVersion !== 3 ||
    typeof profile.sessionId !== "string" || profile.sessionId.length === 0 ||
    !validLife(profile.life) || !modeMatches
  ) {
    return evidenceRequired(
      "score-life.invalid-profile",
      ["SLS-D01", "SLS-D03", "SLS-D24", "BS01", "BS36", "LR-C01"],
      "The CS-V1 score/life profile requires exact life bounds and the same canonical orthogonal mode identity as the runtime.",
    );
  }
  return ok(deepFreezeScoreLifeProfile(profile));
}

function validScoringPlan(plan: SimulatorScoringPlan): boolean {
  return plan !== null && typeof plan === "object" && Object.isFrozen(plan) &&
    plan.ruleSetId === NORMALIZED_SCORE_RULESET_ID && Object.isFrozen(plan.units) &&
    Number.isInteger(plan.totalScoringUnitCount) && plan.totalScoringUnitCount > 0 &&
    plan.units.length === plan.totalScoringUnitCount &&
    isUInt32(plan.scoreMaximum) && plan.scoreMaximum === 10_000_000 + plan.totalScoringUnitCount &&
    typeof plan.resolve === "function" && typeof plan.getById === "function";
}

function validLife(life: ScoreLifeStateProfile["life"]): boolean {
  return life !== null && typeof life === "object" &&
    Object.keys(life).sort().join(",") ===
      "badDamage,initialLife,lifeUpperLimit,missDamage,playerMaxLife" &&
    [life.initialLife, life.playerMaxLife, life.lifeUpperLimit, life.missDamage, life.badDamage]
      .every(isInt32) &&
    life.initialLife >= 0 && life.playerMaxLife > 0 &&
    life.lifeUpperLimit >= life.initialLife &&
    life.missDamage <= 0 && life.badDamage <= 0;
}

function freezeRecordSnapshot(snapshot: InGameRecordSnapshot): InGameRecordSnapshot {
  return Object.freeze({
    ...snapshot,
    resultCounts: Object.freeze([...snapshot.resultCounts]) as InGameRecordSnapshot["resultCounts"],
    oneNoteMax: Object.freeze({ ...snapshot.oneNoteMax }),
  });
}

function freezeScoreGaugeSnapshot(snapshot: SinglePlayScoreGaugeSnapshot): SinglePlayScoreGaugeSnapshot {
  return Object.freeze({ ...snapshot });
}

function isInt32(value: number): boolean {
  return Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
}

function isUInt32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function addInt32(left: number, right: number): number {
  return (left + right) | 0;
}
