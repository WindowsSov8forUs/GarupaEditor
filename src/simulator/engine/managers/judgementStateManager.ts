import {
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  type ChartConstructionResult,
} from "../chart/types";
import type { OneFrameJudgementBatch } from "../data/oneFrameData";
import {
  JudgementRecord,
  type JudgementRecordSnapshot,
} from "../data/judgementState";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";

export interface JudgementReflectEntry {
  readonly slot: number;
  readonly comboAfter: number;
}

export interface JudgementReflectBatch {
  readonly batchIndex: number;
  readonly entries: readonly JudgementReflectEntry[];
  readonly representativeSlot: number;
  readonly representativeRawResult: 0 | 1 | 2 | 3 | 4;
  readonly representativeJudgeTiming: 0 | 1 | 2;
}

export interface JudgementReflectPlan {
  readonly batchIndex: number;
  readonly entryCount: number;
  readonly reflect: JudgementReflectBatch;
  readonly record: JudgementRecordSnapshot;
}

interface PendingJudgementReflect {
  readonly plan: JudgementReflectPlan;
  readonly stagedRecord: JudgementRecord;
}

export interface JudgementStateSnapshot {
  readonly maxNoteCount: number;
  readonly record: JudgementRecordSnapshot;
  readonly lastReflectBatch: JudgementReflectBatch | null;
  readonly trace: readonly string[];
}

export class JudgementStateManager {
  readonly record = new JudgementRecord();
  private lastReflectBatchValue: JudgementReflectBatch | null = null;
  private pendingReflect: PendingJudgementReflect | null = null;
  private readonly traceValue: string[] = [];

  private constructor(readonly maxNoteCount: number) {}

  static create(chart: ChartConstructionResult): SimulatorResult<JudgementStateManager> {
    const maxNoteCount = countMaximumNotes(chart);
    if (!Number.isInteger(maxNoteCount) || maxNoteCount <= 0) {
      return evidenceRequired(
        "judgement-state.invalid-chart-max-note-count",
        ["SLS-D03", "BS01", "BS02"],
        "The parent-owned production chart must derive a positive Int32 maxNoteCount before judgement record initialization.",
      );
    }
    return ok(new JudgementStateManager(maxNoteCount));
  }

  getClearStatus(): 1 | 2 | 3 {
    return this.record.getClearStatus(this.maxNoteCount);
  }

  preflightReflect(batch: OneFrameJudgementBatch): SimulatorResult<JudgementReflectPlan> {
    if (this.pendingReflect !== null || batch.entries.length === 0) {
      return evidenceRequired(
        "judgement-state.reflect-plan-overlap-or-empty",
        ["SLS-D02", "SLS-D20", "BS10", "RPR-D13", "PR33"],
        "Exactly one non-empty judgement Reflect batch may be planned without mutation.",
      );
    }
    const stagedRecord = this.record.cloneForPreflight();
    const projections: JudgementReflectEntry[] = [];
    let representative = batch.entries[0]!;
    for (const entry of batch.entries) {
      stagedRecord.addCombo(entry.addCombo);
      stagedRecord.incrementResult(entry.adjustedResult, entry.judgeTiming);
      if (entry.rawResult > representative.rawResult) representative = entry;
      projections.push(Object.freeze({
        slot: entry.slot,
        comboAfter: stagedRecord.currentCombo,
      }));
    }
    const reflect: JudgementReflectBatch = Object.freeze({
      batchIndex: batch.batchIndex,
      entries: Object.freeze(projections),
      representativeSlot: representative.slot,
      representativeRawResult: representative.rawResult,
      representativeJudgeTiming: representative.judgeTiming,
    });
    const plan: JudgementReflectPlan = Object.freeze({
      batchIndex: batch.batchIndex,
      entryCount: batch.entryCount,
      reflect,
      record: stagedRecord.snapshot(),
    });
    this.pendingReflect = Object.freeze({ plan, stagedRecord });
    return ok(plan);
  }

  commitReflect(plan: JudgementReflectPlan): SimulatorResult<void> {
    if (this.pendingReflect?.plan !== plan) {
      return evidenceRequired(
        "judgement-state.invalid-reflect-plan",
        ["SLS-D20", "BS10", "RPR-D13", "PR33", "PR38"],
        "Only the exact one-use judgement Reflect plan may commit owner state.",
      );
    }
    this.record.commitFromPreflight(this.pendingReflect.stagedRecord);
    this.lastReflectBatchValue = plan.reflect;
    this.traceValue.push(`reflect:${plan.batchIndex}:${plan.entryCount}`);
    this.pendingReflect = null;
    return ok(undefined);
  }

  discardReflect(plan: JudgementReflectPlan): SimulatorResult<void> {
    if (this.pendingReflect?.plan !== plan) {
      return evidenceRequired(
        "judgement-state.invalid-reflect-discard",
        ["SLS-D20", "BS10", "RPR-D13", "PR33", "PR38"],
        "Only the exact pending judgement Reflect plan may be discarded before owner mutation.",
      );
    }
    this.pendingReflect = null;
    return ok(undefined);
  }

  snapshot(): JudgementStateSnapshot {
    return Object.freeze({
      maxNoteCount: this.maxNoteCount,
      record: this.record.snapshot(),
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
