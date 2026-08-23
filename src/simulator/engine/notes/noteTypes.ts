import {
  integrityFailure,
  ok,
  type SimulatorResult,
} from "../evidence";
import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteType,
  type AfterNoteTypeValue,
  type ButtonTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
} from "../chart/types";
import {
  NoteBase,
  NoteState,
  type ManualNoteBeganPlan,
  type ManualNoteContinuationPlan,
  type ManualNoteTouchInput,
} from "./noteBase";
import {
  JudgeTiming,
  NoteResultType,
  getManualScreenDistanceRate,
  getSecondsWithDistance,
  judgeManualNote,
  type JudgeTimingValue,
  type ManualNoteJudgement,
  type NoteResultTypeValue,
} from "../data/manualJudgement";
import type { ManualInputPosition } from "../data/manualInput";
import type { MultipleDirectionalRuntimeGroup } from "../data/autoLiveJudgement";

export class NoteFrontBase extends NoteBase {}

export class NoteAfterBase extends NoteBase {}

export interface FlickForcePerfectTraceEntry {
  readonly kind: "flick-begin" | "flick-synthetic-move";
  readonly syntheticX?: number;
}

export abstract class NoteSingleBase extends NoteFrontBase {
  private missSecondCounterValue = Math.fround(0);

  protected abstract acceptsFrontNoteType(frontNoteType: number): boolean;

  override activate(noteInformation: NoteInformation): SimulatorResult<void> {
    const activationValidation = this.validateCanActivate(noteInformation);
    if (activationValidation.status !== "ok") {
      return activationValidation;
    }
    const ownerValidation = validateConcreteNoteOwner(
      noteInformation,
      this.acceptsFrontNoteType(noteInformation.fireNoteType),
      this.poolObjectId,
    );
    if (ownerValidation.status !== "ok") {
      return ownerValidation;
    }
    const graphValidation = validateAutoLiveActivationGraph(noteInformation);
    return graphValidation.status === "ok"
      ? super.activate(noteInformation)
      : graphValidation;
  }

  protected override moveState(deltaTimeSeconds: number): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    if (noteInformation === null) {
      return integrityFailure(
        "single-without-note-information",
        ["R02", "R04", "D05"],
        "A pooled Single note must be activated before MoveState.",
      );
    }
    const autoRuntime = this.autoLiveRuntime;
    if (autoRuntime.status !== "ok") {
      return autoRuntime;
    }
    const adjustedPosition = autoRuntime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjustedPosition)) {
      return integrityFailure(
        autoRuntime.value.isAutoPlay()
          ? "auto-live.non-finite-adjusted-position"
          : "manual.single-non-finite-adjusted-position",
        ["R02", "R04", "D05", "MJ02"],
        "Single crossing and timeout require a finite adjusted music position.",
      );
    }
    if (adjustedPosition < noteInformation.absolutePos) {
      this.missSecondCounterValue = Math.fround(0);
      return ok(undefined);
    }
    if (autoRuntime.value.isAutoPlay()) {
      return this.forcePerfect();
    }
    this.missSecondCounterValue = Math.fround(
      this.missSecondCounterValue + Math.fround(deltaTimeSeconds),
    );
    if (this.missSecondCounterValue <= float32FromBits(0x3e5dddde)) {
      return ok(undefined);
    }
    const manualRuntime = this.manualRuntime;
    if (manualRuntime.status !== "ok") {
      return manualRuntime;
    }
    const missed = manualRuntime.value.submitJudgement({
      noteInformation,
      noteType: 0,
      rawResult: NoteResultType.Miss,
      rawTiming: JudgeTiming.None,
      absolutePosition: noteInformation.absolutePos,
    });
    if (missed.status !== "ok") {
      return missed;
    }
    return this.changeState(NoteState.Deactive);
  }

  protected forcePerfect(): SimulatorResult<void> {
    return integrityFailure(
      "auto-live.single-base-force-perfect-unrepresented",
      ["R02", "R04"],
      "Only recovered concrete Single/Flick/Directional owners may select an Auto Live judgement note type.",
    );
  }

  protected submitHeadPerfect(noteType: number): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? integrityFailure(
            "auto-live.single-without-note-information",
            ["R02", "R04"],
            "Force Perfect requires the activated NoteInformation.",
          )
        : runtime;
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "head",
      noteType,
      absolutePosition: noteInformation.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    return this.changeState(NoteState.Deactive);
  }

  protected override onUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    return ok(undefined);
  }

  protected override onDeactivated(): void {
    this.missSecondCounterValue = Math.fround(0);
  }
}

export class NoteNormal extends NoteSingleBase {
  protected override acceptsFrontNoteType(frontNoteType: number): boolean {
    return frontNoteType === FrontNoteType.Normal;
  }

  override preflightManualTouchBegan(
    _input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteBeganPlan> {
    const information = this.noteInformation;
    const runtime = this.manualRuntime;
    if (information === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.normal-without-note-information",
            ["D05", "MJ02", "MJ11"],
            "Normal Began judgement requires its activated NoteInformation owner.",
          )
        : runtime;
    }
    const judgement = judgeManualNote(
      0,
      Math.fround(information.absolutePos),
      runtime.value.getAdjustedMusicPosition(),
      runtime.value.getCurrentBpm(),
    );
    if (judgement.status !== "ok") {
      return judgement;
    }
    if (judgement.value.result === NoteResultType.None) {
      return ok(Object.freeze({
        outcome: "none",
        judgementPlan: null,
        familyData: judgement.value,
      }));
    }
    return ok(Object.freeze({
      outcome: "bind",
      judgementPlan: null,
      familyData: judgement.value,
    }));
  }

  override preflightManualTouchBeganCommit(
    input: ManualNoteTouchInput,
    plan: ManualNoteBeganPlan,
  ): SimulatorResult<ManualNoteBeganPlan> {
    const information = this.noteInformation;
    const judgement = plan.familyData as ManualNoteJudgement | null;
    if (
      plan.outcome !== "bind" ||
      information === null ||
      judgement === null ||
      typeof judgement !== "object" ||
      judgement.result === NoteResultType.None
    ) {
      return integrityFailure(
        "manual.normal-invalid-began-plan",
        ["D05", "D14", "D15", "MJ02", "MJ26"],
        "Only the owner-produced non-None Normal timing projection can reserve a manual OneFrame slot.",
      );
    }
    const reserved = input.judgementTransaction.preflight({
      noteInformation: information,
      noteType: 0,
      rawResult: judgement.result,
      rawTiming: judgement.timing,
      absolutePosition: information.absolutePos,
    });
    if (reserved.status !== "ok") {
      return reserved;
    }
    return ok(Object.freeze({
      ...plan,
      judgementPlan: reserved.value,
    }));
  }

  override commitManualTouchBegan(
    input: ManualNoteTouchInput,
    plan: ManualNoteBeganPlan,
  ): void {
    if (plan.outcome !== "bind" || plan.judgementPlan === null) {
      throw new Error("Normal Began commit lost its owner-produced judgement plan");
    }
    input.judgementTransaction.commit(plan.judgementPlan);
    const deactivated = this.changeState(NoteState.Deactive);
    if (deactivated.status !== "ok") {
      throw new Error("Normal Began commit could not deactivate the judged note");
    }
  }

  protected override forcePerfect(): SimulatorResult<void> {
    return this.submitHeadPerfect(0);
  }
}

export class NoteLong extends NoteFrontBase {
  private afterNoteValue: LongAfterRuntime | null = null;
  private longAfterMultipleGroupResolverValue: ((
    information: NoteInformation,
  ) => SimulatorResult<MultipleDirectionalRuntimeGroup | null>) | null = null;
  private longAfterMultipleGroupValue: MultipleDirectionalRuntimeGroup | null = null;
  private manualTouchOriginValue: ManualInputPosition | null = null;
  private manualMoveSucceededValue = false;
  private manualAfterMoveTimeValue = Math.fround(0);
  private readonly autoLiveTraceValue: LongAutoLiveTraceEntry[] = [];

  registerLongAfterMultipleGroupResolver(
    resolver: (
      information: NoteInformation,
    ) => SimulatorResult<MultipleDirectionalRuntimeGroup | null>,
  ): void {
    this.longAfterMultipleGroupResolverValue = resolver;
  }

  get afterNote(): LongAfterRuntime | null {
    return this.afterNoteValue;
  }

  get autoLiveTrace(): readonly LongAutoLiveTraceEntry[] {
    return this.autoLiveTraceValue.map((entry) => ({ ...entry }));
  }

  override activate(noteInformation: NoteInformation): SimulatorResult<void> {
    const activationValidation = this.validateCanActivate(noteInformation);
    if (activationValidation.status !== "ok") {
      return activationValidation;
    }
    const ownerValidation = validateConcreteNoteOwner(
      noteInformation,
      noteInformation.fireNoteType === FrontNoteType.Long,
      this.poolObjectId,
    );
    if (ownerValidation.status !== "ok") {
      return ownerValidation;
    }
    const graphValidation = validateAutoLiveActivationGraph(noteInformation);
    if (graphValidation.status !== "ok") {
      return graphValidation;
    }
    const nextAfterNote = new LongAfterRuntime(
      noteInformation.afterNoteAbsolutePos,
      noteInformation.afterNoteType,
      noteInformation.afterNoteShortRhythmUnder8beat,
    );
    const multipleGroup = this.longAfterMultipleGroupResolverValue?.(noteInformation) ??
      ok<MultipleDirectionalRuntimeGroup | null>(null);
    if (multipleGroup.status !== "ok") {
      return multipleGroup;
    }
    const activated = super.activate(noteInformation);
    if (activated.status !== "ok") {
      return activated;
    }
    this.afterNoteValue = nextAfterNote;
    this.longAfterMultipleGroupValue = multipleGroup.value;
    this.manualTouchOriginValue = null;
    this.manualMoveSucceededValue = false;
    this.manualAfterMoveTimeValue = Math.fround(0);
    this.autoLiveTraceValue.length = 0;
    return ok(undefined);
  }

  override preflightManualTouchBegan(
    _input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteBeganPlan> {
    const information = this.noteInformation;
    const runtime = this.manualRuntime;
    if (information === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.long-without-source",
            ["D05", "D12", "MJ11"],
            "Long Began requires its activated root and manual timing owner.",
          )
        : runtime;
    }
    const judgement = judgeManualNote(
      0,
      Math.fround(information.absolutePos),
      runtime.value.getAdjustedMusicPosition(),
      runtime.value.getCurrentBpm(),
    );
    if (judgement.status !== "ok") {
      return judgement;
    }
    return ok(Object.freeze({
      outcome:
        judgement.value.result <= NoteResultType.Miss || this.state === NoteState.Stop
          ? "none"
          : "bind",
      judgementPlan: null,
      familyData: judgement.value,
    }));
  }

  override preflightManualTouchBeganCommit(
    input: ManualNoteTouchInput,
    plan: ManualNoteBeganPlan,
  ): SimulatorResult<ManualNoteBeganPlan> {
    const information = this.noteInformation;
    const judgement = plan.familyData as ManualNoteJudgement | null;
    if (
      plan.outcome !== "bind" ||
      information === null ||
      judgement === null ||
      judgement.result <= NoteResultType.Miss
    ) {
      return integrityFailure(
        "manual.long-invalid-began-plan",
        ["D05", "D12", "D14", "MJ11", "MJ26"],
        "Only an owner-produced Good-or-better Long head may reserve type4.",
      );
    }
    const reserved = input.judgementTransaction.preflight({
      noteInformation: information,
      phase: "head",
      noteType: 4,
      rawResult: judgement.result as Exclude<typeof judgement.result, -1>,
      rawTiming: judgement.timing,
      absolutePosition: information.absolutePos,
    });
    return reserved.status === "ok"
      ? ok(Object.freeze({ ...plan, judgementPlan: reserved.value }))
      : reserved;
  }

  override commitManualTouchBegan(
    input: ManualNoteTouchInput,
    plan: ManualNoteBeganPlan,
  ): void {
    if (plan.judgementPlan === null) {
      throw new Error("Long Began commit lost its type4 reservation");
    }
    input.judgementTransaction.commit(plan.judgementPlan);
    this.manualTouchOriginValue = input.currentPosition;
    this.manualMoveSucceededValue = false;
    this.manualAfterMoveTimeValue = Math.fround(0);
    const changed = this.changeState(NoteState.Stop);
    if (changed.status !== "ok") {
      throw new Error("Long Began commit could not enter Stop state");
    }
  }

  override preflightManualTouchMoved(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    return this.preflightManualLongAfter(input, true);
  }

  override commitManualTouchMoved(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
  ): void {
    this.commitManualLongAfter(input, plan);
  }

  override preflightManualTouchEnded(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    return this.preflightManualLongAfter(input, false);
  }

  override commitManualTouchEnded(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
  ): void {
    this.commitManualLongAfter(input, plan);
  }

  private preflightManualLongAfter(
    input: ManualNoteTouchInput,
    moved: boolean,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const information = this.noteInformation;
    const after = this.afterNoteValue;
    const runtime = this.manualRuntime;
    const origin = this.manualTouchOriginValue;
    if (
      information === null || after === null || runtime.status !== "ok" || origin === null ||
      this.state !== NoteState.Stop
    ) {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.long-after-owner-unavailable",
            ["D09", "D10", "D12", "MJ12", "MJ15"],
            "Long continuation requires its Began origin, Stop state and parent-owned after node.",
          )
        : runtime;
    }
    const judgement = judgeManualNote(
      0,
      Math.fround(after.absolutePosition),
      runtime.value.getAdjustedMusicPosition(),
      runtime.value.getCurrentBpm(),
    );
    if (judgement.status !== "ok") {
      return judgement;
    }
    const group = this.longAfterMultipleGroupValue;
    const targetButtons = group?.buttonTypes ?? information.buttonTypesArray;
    if (!moved) {
      const normalAfter = after.afterNoteType === AfterNoteType.Normal;
      let normalInside = false;
      if (normalAfter) {
        const inside = runtime.value.geometry.isInsideTargetButtons(
          input.currentPosition,
          targetButtons,
        );
        if (inside.status !== "ok") {
          return inside;
        }
        normalInside = inside.value;
      }
      const finalResult = normalAfter
        ? normalInside ? judgement.value.result : NoteResultType.Miss
        : this.manualMoveSucceededValue
        ? judgement.value.result
        : NoteResultType.Miss;
      return this.reserveManualLongTail(
        input,
        finalResult === NoteResultType.None ? NoteResultType.Miss : finalResult,
        judgement.value.timing,
        Object.freeze({
          complete: true,
          nextOrigin: origin,
          nextAfterMoveTime: this.manualAfterMoveTimeValue,
          moveSucceeded: this.manualMoveSucceededValue,
          markMultipleUsed: false,
        }),
      );
    }
    if (after.afterNoteType === AfterNoteType.Normal) {
      return ok(Object.freeze({
        judgementPlan: null,
        familyData: Object.freeze({
          complete: false,
          nextOrigin: origin,
          nextAfterMoveTime: this.manualAfterMoveTimeValue,
          moveSucceeded: false,
          markMultipleUsed: false,
        }),
      }));
    }
    if (input.deltaTimeSeconds === null) {
      return integrityFailure(
        "manual.long-owner-delta-unavailable",
        ["D10", "D14", "D15", "MJ14", "MJ26"],
        "Long movement grace requires the host-owned outer-frame Float32 delta.",
      );
    }
    const nextOrigin = judgement.value.result === NoteResultType.None
      ? input.currentPosition
      : origin;
    const inside = runtime.value.geometry.isInsideTargetButtons(
      input.currentPosition,
      targetButtons,
    );
    if (inside.status !== "ok") {
      return inside;
    }
    const nextAfterMoveTime = inside.value
      ? Math.fround(8)
      : Math.fround(this.manualAfterMoveTimeValue - input.deltaTimeSeconds);
    let movementSucceeded = false;
    if (after.afterNoteType === AfterNoteType.Flick) {
      const rate = getManualScreenDistanceRate(runtime.value.geometry, {
        beganPosition: nextOrigin,
        currentPosition: input.currentPosition,
        horizontalOnly: false,
      });
      if (rate.status !== "ok") {
        return rate;
      }
      movementSucceeded = rate.value > float32FromBits(0x3d23d70a);
    } else {
      const correctDirection =
        (after.afterNoteType === AfterNoteType.DirectionalFlickLeft ||
          after.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft)
          ? nextOrigin.x > input.currentPosition.x
          : nextOrigin.x < input.currentPosition.x;
      if (correctDirection) {
        const horizontalRate = getManualScreenDistanceRate(runtime.value.geometry, {
          beganPosition: nextOrigin,
          currentPosition: input.currentPosition,
          horizontalOnly: true,
        });
        if (horizontalRate.status !== "ok") {
          return horizontalRate;
        }
        movementSucceeded = horizontalRate.value > float32FromBits(0x3c23d70a);
        if (
          movementSucceeded &&
          (after.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft ||
            after.afterNoteType === AfterNoteType.MultipleDirectionalFlickRight)
        ) {
          if (group === null || group.isUsed) {
            return integrityFailure(
              "manual.long-multiple-after-group-unavailable",
              ["D08", "D12", "MJ13"],
              "Long Multiple after movement requires its unused chart-owned group.",
            );
          }
          const fullRate = getManualScreenDistanceRate(runtime.value.geometry, {
            beganPosition: nextOrigin,
            currentPosition: input.currentPosition,
            horizontalOnly: false,
          });
          if (fullRate.status !== "ok") {
            return fullRate;
          }
          const unitRate = float32FromBits(0x3c23d70a);
          const threshold = Math.fround(
            Math.fround(Math.fround(group.count - 1) * unitRate) + unitRate,
          );
          movementSucceeded = fullRate.value > threshold;
        }
      }
    }
    const complete = movementSucceeded &&
      judgement.value.result !== NoteResultType.None &&
      nextAfterMoveTime > Math.fround(0);
    const familyData = Object.freeze({
      complete,
      nextOrigin,
      nextAfterMoveTime,
      moveSucceeded: complete,
      markMultipleUsed: complete && group !== null,
    });
    return complete
      ? this.reserveManualLongTail(
          input,
          judgement.value.result as Exclude<typeof judgement.value.result, -1>,
          judgement.value.timing,
          familyData,
        )
      : ok(Object.freeze({ judgementPlan: null, familyData }));
  }

  private reserveManualLongTail(
    input: ManualNoteTouchInput,
    rawResult: Exclude<NoteResultTypeValue, -1>,
    rawTiming: JudgeTimingValue,
    familyData: unknown,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const information = this.noteInformation;
    const after = this.afterNoteValue;
    if (information === null || after === null) {
      return integrityFailure(
        "manual.long-tail-source-unavailable",
        ["D12", "D14", "MJ15"],
        "Long tail reservation requires its root and parent-owned after source.",
      );
    }
    const noteType = manualLongAfterJudgeNoteType(after.afterNoteType);
    if (noteType === null) {
      return integrityFailure(
        "manual.long-after-type-unrepresented",
        ["D12", "MJ15"],
        `Long after type ${after.afterNoteType} has no confirmed manual note type.`,
      );
    }
    const group = this.longAfterMultipleGroupValue;
    const reserved = input.judgementTransaction.preflight({
      noteInformation: information,
      phase: "tail",
      noteType,
      rawResult,
      rawTiming,
      absolutePosition: after.absolutePosition,
      ...(noteType === 7 && group !== null
        ? { multipleDirectionalFlickNoteCount: group.count }
        : {}),
    });
    return reserved.status === "ok"
      ? ok(Object.freeze({ judgementPlan: reserved.value, familyData }))
      : reserved;
  }

  private commitManualLongAfter(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
  ): void {
    const familyData = plan.familyData as {
      readonly complete: boolean;
      readonly nextOrigin: ManualInputPosition;
      readonly nextAfterMoveTime: number;
      readonly moveSucceeded: boolean;
      readonly markMultipleUsed: boolean;
    };
    this.manualTouchOriginValue = familyData.nextOrigin;
    this.manualAfterMoveTimeValue = familyData.nextAfterMoveTime;
    this.manualMoveSucceededValue = familyData.moveSucceeded;
    if (plan.judgementPlan === null) {
      return;
    }
    const group = this.longAfterMultipleGroupValue;
    if (familyData.markMultipleUsed) {
      const used = group?.markUsed();
      if (used?.status !== "ok") {
        throw new Error("Long Multiple after group changed after preflight");
      }
    }
    input.judgementTransaction.commit(plan.judgementPlan);
    const marked = this.afterNoteValue?.markJudged();
    if (marked?.status !== "ok") {
      throw new Error("Long tail after owner changed after preflight");
    }
    const changed = this.changeState(NoteState.Deactive);
    if (changed.status !== "ok") {
      throw new Error("Long tail commit could not deactivate its parent");
    }
  }

  protected override moveState(_deltaTimeSeconds: number): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? integrityFailure(
            "auto-live.long-without-note-information",
            ["R02", "R04"],
            "Long MoveState requires an activated root.",
          )
        : runtime;
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return integrityFailure(
        "auto-live.non-finite-adjusted-position",
        ["R02", "R04"],
        "Long Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < noteInformation.absolutePos) {
      return ok(undefined);
    }
    const stateChange = this.changeState(NoteState.Wait);
    if (!runtime.value.isAutoPlay()) {
      return stateChange;
    }
    if (stateChange.status !== "ok") {
      return stateChange;
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "head",
      noteType: 0,
      absolutePosition: noteInformation.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    });
    if (submitted.status === "ok") {
      this.autoLiveTraceValue.push({ kind: "long-head-perfect" });
    }
    return submitted;
  }

  protected override waitState(_deltaTimeSeconds: number): SimulatorResult<void> {
    const information = this.noteInformation;
    const autoRuntime = this.autoLiveRuntime;
    if (information === null || autoRuntime.status !== "ok") {
      return autoRuntime.status === "ok"
        ? integrityFailure(
            "manual.long-start-timeout-owner-unavailable",
            ["D11", "MJ16"],
            "Long Wait timeout requires its activated root and adjusted-position owner.",
          )
        : autoRuntime;
    }
    if (autoRuntime.value.isAutoPlay()) {
      return ok(undefined);
    }
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") {
      return runtime;
    }
    const over = isManualTimeoutOver(
      information.absolutePos,
      runtime.value.getAdjustedMusicPosition(),
      runtime.value.getCurrentBpm(),
    );
    if (over.status !== "ok" || !over.value) {
      return over.status === "ok" ? ok(undefined) : over;
    }
    const transaction = runtime.value.beginJudgementTransaction();
    const request = Object.freeze({
      noteInformation: information,
      phase: "head" as const,
      noteType: 1,
      rawResult: NoteResultType.Miss,
      rawTiming: JudgeTiming.None,
      absolutePosition: information.absolutePos,
    });
    const first = transaction.preflight(request);
    if (first.status !== "ok") {
      transaction.abort();
      return first;
    }
    const second = transaction.preflight(request);
    if (second.status !== "ok") {
      transaction.abort();
      return second;
    }
    transaction.commit(first.value);
    transaction.commit(second.value);
    transaction.finish();
    return this.changeState(NoteState.Deactive);
  }

  protected override stopState(_deltaTimeSeconds: number): SimulatorResult<void> {
    const after = this.afterNoteValue;
    const information = this.noteInformation;
    const autoRuntime = this.autoLiveRuntime;
    if (after === null || information === null || autoRuntime.status !== "ok") {
      return autoRuntime.status === "ok"
        ? integrityFailure(
            "manual.long-end-timeout-owner-unavailable",
            ["D11", "MJ17"],
            "Long Stop timeout requires its parent-owned tail and adjusted-position owner.",
          )
        : autoRuntime;
    }
    if (autoRuntime.value.isAutoPlay()) {
      return ok(undefined);
    }
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") {
      return runtime;
    }
    const over = isManualTimeoutOver(
      after.absolutePosition,
      runtime.value.getAdjustedMusicPosition(),
      runtime.value.getCurrentBpm(),
    );
    if (over.status !== "ok" || !over.value) {
      return over.status === "ok" ? ok(undefined) : over;
    }
    const noteType = manualLongAfterJudgeNoteType(after.afterNoteType);
    if (noteType === null) {
      return integrityFailure(
        "manual.long-timeout-after-type-unrepresented",
        ["D11", "MJ17"],
        `Long timeout after type ${after.afterNoteType} has no confirmed note type.`,
      );
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation: information,
      phase: "tail",
      noteType,
      rawResult: NoteResultType.Miss,
      rawTiming: JudgeTiming.None,
      absolutePosition: after.absolutePosition,
      ...(noteType === 7 && this.longAfterMultipleGroupValue !== null
        ? { multipleDirectionalFlickNoteCount: this.longAfterMultipleGroupValue.count }
        : {}),
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    const marked = after.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    return this.changeState(NoteState.Deactive);
  }

  protected override onUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    const after = this.afterNoteValue;
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (after === null || noteInformation === null || runtime.status !== "ok") {
      return integrityFailure(
        "auto-live.long-runtime-graph-unavailable",
        ["R02", "R04"],
        "Long OnUpdate requires its parent-owned linked after runtime.",
      );
    }
    this.autoLiveTraceValue.push({ kind: "long-after-update" });
    if (!runtime.value.isAutoPlay() || after.judged) {
      return ok(undefined);
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return integrityFailure(
        "auto-live.non-finite-adjusted-position",
        ["R02", "R04"],
        "Long tail Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted <= after.absolutePosition) {
      return ok(undefined);
    }
    const noteType = longAfterJudgeNoteType(after.afterNoteType);
    if (noteType === null) {
      return integrityFailure(
        "auto-live.invalid-long-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Long root ${noteInformation.index} retained an unconfirmed terminal type.`,
      );
    }
    this.autoLiveTraceValue.push({ kind: "long-linked-after-finish" });
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "tail",
      noteType,
      absolutePosition: after.absolutePosition,
      multipleDirectionalFlickNoteCount: 0,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    const marked = after.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    this.autoLiveTraceValue.push({ kind: "long-tail-perfect" });
    return this.changeState(NoteState.Deactive);
  }

  override executeAfterUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.state === NoteState.Deactive) {
      return ok(undefined);
    }
    this.autoLiveTraceValue.push({ kind: "long-base-after-update" });
    this.autoLiveTraceValue.push({ kind: "long-linked-after-update" });
    return ok(undefined);
  }

  override snapshot() {
    return {
      ...super.snapshot(),
      autoLiveTrace: this.autoLiveTrace,
      linkedAfter: this.afterNoteValue === null
        ? null
        : {
            absolutePosition: this.afterNoteValue.absolutePosition,
            afterNoteType: this.afterNoteValue.afterNoteType,
            judged: this.afterNoteValue.judged,
          },
    };
  }

  protected override onDeactivated(): void {
    this.afterNoteValue?.resetForParentDeactivation();
    this.afterNoteValue = null;
    this.longAfterMultipleGroupValue = null;
    this.manualTouchOriginValue = null;
    this.manualMoveSucceededValue = false;
    this.manualAfterMoveTimeValue = Math.fround(0);
  }

  protected override onResetForDispose(): void {
    this.afterNoteValue = null;
    this.longAfterMultipleGroupValue = null;
    this.manualTouchOriginValue = null;
    this.manualMoveSucceededValue = false;
    this.manualAfterMoveTimeValue = Math.fround(0);
    this.autoLiveTraceValue.length = 0;
  }
}

export class NoteSlide extends NoteFrontBase {
  private afterNotesValue: readonly SlideAfterRuntime[] = [];
  private currentAfterIndexValue = 0;
  private manualHeadJudgedValue = false;
  private slideAfterMultipleGroupResolverValue: ((
    information: NoteInformation,
  ) => SimulatorResult<MultipleDirectionalRuntimeGroup | null>) | null = null;
  private slideAfterMultipleGroupValue: MultipleDirectionalRuntimeGroup | null = null;
  private manualTouchOriginValue: ManualInputPosition | null = null;
  private manualAfterMoveTimeValue = Math.fround(0);
  private terminalJudgeNoteTypeValue: 5 | 6 | 7 | 8 | null = null;
  private readonly autoLiveTraceValue: SlideAutoLiveTraceEntry[] = [];

  registerSlideAfterMultipleGroupResolver(
    resolver: (
      information: NoteInformation,
    ) => SimulatorResult<MultipleDirectionalRuntimeGroup | null>,
  ): void {
    this.slideAfterMultipleGroupResolverValue = resolver;
  }

  get afterNotes(): readonly SlideAfterRuntime[] {
    return this.afterNotesValue;
  }

  get currentAfterIndex(): number {
    return this.currentAfterIndexValue;
  }

  get autoLiveTrace(): readonly SlideAutoLiveTraceEntry[] {
    return this.autoLiveTraceValue.map((entry) => ({ ...entry }));
  }

  get manualCandidateSource(): NoteInformation | null {
    if (!this.manualHeadJudgedValue) {
      return this.noteInformation;
    }
    return this.afterNotesValue[this.currentAfterIndexValue]?.source ?? null;
  }

  override isContainsButton(buttonType: ButtonTypeValue): boolean {
    return this.manualCandidateSource?.buttonTypes.includes(buttonType) ?? false;
  }

  override activate(noteInformation: NoteInformation): SimulatorResult<void> {
    const activationValidation = this.validateCanActivate(noteInformation);
    if (activationValidation.status !== "ok") {
      return activationValidation;
    }
    const ownerValidation = validateConcreteNoteOwner(
      noteInformation,
      noteInformation.fireNoteType === FrontNoteType.SlideA ||
        noteInformation.fireNoteType === FrontNoteType.SlideB,
      this.poolObjectId,
    );
    if (ownerValidation.status !== "ok") {
      return ownerValidation;
    }
    const graphValidation = validateAutoLiveActivationGraph(noteInformation);
    if (graphValidation.status !== "ok") {
      return graphValidation;
    }
    const seen = new Set<NoteInformation>();
    const afterNotes: SlideAfterRuntime[] = [];
    const terminalSource = noteInformation.slideNoteList[
      noteInformation.slideNoteList.length - 1
    ];
    if (terminalSource === undefined) {
      return integrityFailure(
        "auto-live.invalid-slide-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Slide root ${noteInformation.index} has no terminal source node.`,
      );
    }
    const terminalJudgeNoteType = resolveSlideTerminalJudgeNoteType(
      noteInformation.afterNoteType,
      terminalSource.gameNoteType,
    );
    if (terminalJudgeNoteType.status !== "ok") {
      return terminalJudgeNoteType;
    }
    let previousPosition = noteInformation.absolutePos;
    for (let index = 0; index < noteInformation.slideNoteList.length; index += 1) {
      const source = noteInformation.slideNoteList[index];
      if (
        source === undefined ||
        seen.has(source) ||
        source.absolutePos <= previousPosition
      ) {
        return integrityFailure(
          "auto-live.duplicate-or-missing-slide-node",
          ["R01", "R02", "R04", "U01"],
          `Slide root ${noteInformation.index} contains an invalid shared after-node identity.`,
        );
      }
      seen.add(source);
      previousPosition = source.absolutePos;
      const isTerminal = index === noteInformation.slideNoteList.length - 1;
      afterNotes.push(new SlideAfterRuntime(
        source,
        index,
        isTerminal,
        isTerminal ? terminalJudgeNoteType.value : null,
      ));
    }
    const multipleGroup = this.slideAfterMultipleGroupResolverValue?.(noteInformation) ??
      ok<MultipleDirectionalRuntimeGroup | null>(null);
    if (multipleGroup.status !== "ok") {
      return multipleGroup;
    }
    const activated = super.activate(noteInformation);
    if (activated.status !== "ok") {
      return activated;
    }
    this.afterNotesValue = afterNotes;
    this.currentAfterIndexValue = 0;
    this.manualHeadJudgedValue = false;
    this.slideAfterMultipleGroupValue = multipleGroup.value;
    this.manualTouchOriginValue = null;
    this.manualAfterMoveTimeValue = Math.fround(0);
    this.terminalJudgeNoteTypeValue = terminalJudgeNoteType.value;
    this.autoLiveTraceValue.length = 0;
    return ok(undefined);
  }

  override preflightManualTouchBegan(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteBeganPlan> {
    const source = this.noteInformation;
    const runtime = this.manualRuntime;
    if (source === null || runtime.status !== "ok" || this.manualHeadJudgedValue) {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.slide-head-owner-unavailable",
            ["D10", "D12", "MJ18", "MJ20"],
            "Slide Began requires its unconsumed parent-owned head.",
          )
        : runtime;
    }
    const judgement = judgeManualNote(
      0,
      Math.fround(source.absolutePos),
      runtime.value.getAdjustedMusicPosition(),
      runtime.value.getCurrentBpm(),
    );
    if (judgement.status !== "ok") {
      return judgement;
    }
    if (judgement.value.result === NoteResultType.None) {
      return ok(Object.freeze({
        outcome: "none",
        judgementPlan: null,
        familyData: judgement.value,
      }));
    }
    const reserved = input.judgementTransaction.preflight({
      noteInformation: source,
      phase: "head",
      noteType: 8,
      rawResult: judgement.value.result,
      rawTiming: judgement.value.timing,
      absolutePosition: source.absolutePos,
    });
    return reserved.status === "ok"
      ? ok(Object.freeze({
          outcome: "bind",
          judgementPlan: reserved.value,
          familyData: judgement.value,
        }))
      : reserved;
  }

  override commitManualTouchBegan(
    input: ManualNoteTouchInput,
    plan: ManualNoteBeganPlan,
  ): void {
    if (plan.judgementPlan === null) {
      throw new Error("Slide head commit lost its type8 reservation");
    }
    input.judgementTransaction.commit(plan.judgementPlan);
    this.manualHeadJudgedValue = true;
    this.manualTouchOriginValue = input.currentPosition;
    this.manualAfterMoveTimeValue = Math.fround(0);
    const changed = this.changeState(NoteState.Stop);
    if (changed.status !== "ok") {
      throw new Error("Slide head commit could not enter Stop state");
    }
  }

  override preflightManualTouchMoved(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const current = this.afterNotesValue[this.currentAfterIndexValue];
    const runtime = this.manualRuntime;
    if (
      current === undefined ||
      runtime.status !== "ok" ||
      !this.manualHeadJudgedValue ||
      this.state !== NoteState.Stop
    ) {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.slide-current-owner-unavailable",
            ["D10", "D12", "MJ19", "MJ20"],
            "Slide Moved requires its parent-owned current node in Stop state.",
          )
        : runtime;
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!current.isTerminal || current.source.gameNoteType <= 7) {
      if (!current.source.isInvisible) {
        const inside = runtime.value.geometry.isInsideTargetButtons(
          input.currentPosition,
          current.source.buttonTypesArray,
        );
        if (inside.status !== "ok") {
          return inside;
        }
        if (!inside.value) {
          return ok(this.noManualSlideJudgementPlan());
        }
      }
      const slideDecision = runtime.value.judgeSlide(current.source, adjusted);
      if (slideDecision.status !== "ok") {
        return slideDecision;
      }
      const result =
        slideDecision.value.result === NoteResultType.Great &&
          runtime.value.getJudgementAdjustValueB() !== 0
          ? NoteResultType.Perfect
          : slideDecision.value.result;
      if (slideDecision.value.correction > 1 || result !== NoteResultType.Perfect) {
        return ok(this.noManualSlideJudgementPlan());
      }
      return this.reserveManualSlideNode(
        input,
        current,
        8,
        result,
        JudgeTiming.None,
        false,
      );
    }
    if (input.deltaTimeSeconds === null) {
      return integrityFailure(
        "manual.slide-owner-delta-unavailable",
        ["D10", "D14", "D15", "MJ21", "MJ26"],
        "Slide terminal movement grace requires the host-owned outer-frame delta.",
      );
    }
    const judgement = judgeManualNote(
      0,
      Math.fround(current.source.absolutePos),
      adjusted,
      runtime.value.getCurrentBpm(),
    );
    if (judgement.status !== "ok") {
      return judgement;
    }
    const group = this.slideAfterMultipleGroupValue;
    const targetButtons = group?.buttonTypes ?? current.source.buttonTypesArray;
    const inside = runtime.value.geometry.isInsideTargetButtons(
      input.currentPosition,
      targetButtons,
    );
    if (inside.status !== "ok") {
      return inside;
    }
    const nextGrace = inside.value
      ? Math.fround(8)
      : Math.fround(this.manualAfterMoveTimeValue - input.deltaTimeSeconds);
    const origin = judgement.value.result === NoteResultType.None
      ? input.currentPosition
      : this.manualTouchOriginValue;
    if (origin === null) {
      return integrityFailure(
        "manual.slide-touch-origin-unavailable",
        ["D09", "D10", "MJ21"],
        "Slide terminal movement requires its cached Began origin.",
      );
    }
    let movementSucceeded = false;
    const gameNoteType = current.source.gameNoteType;
    if (gameNoteType === 8) {
      const rate = getManualScreenDistanceRate(runtime.value.geometry, {
        beganPosition: origin,
        currentPosition: input.currentPosition,
        horizontalOnly: false,
      });
      if (rate.status !== "ok") {
        return rate;
      }
      movementSucceeded = rate.value > float32FromBits(0x3d23d70a);
    } else {
      const correctDirection = gameNoteType === 9 || gameNoteType === 11
        ? origin.x > input.currentPosition.x
        : origin.x < input.currentPosition.x;
      if (correctDirection) {
        const horizontalRate = getManualScreenDistanceRate(runtime.value.geometry, {
          beganPosition: origin,
          currentPosition: input.currentPosition,
          horizontalOnly: true,
        });
        if (horizontalRate.status !== "ok") {
          return horizontalRate;
        }
        movementSucceeded = horizontalRate.value > float32FromBits(0x3c23d70a);
        if (movementSucceeded && (gameNoteType === 11 || gameNoteType === 12)) {
          if (group === null || group.isUsed) {
            return integrityFailure(
              "manual.slide-multiple-terminal-group-unavailable",
              ["D08", "D12", "MJ21"],
              "Slide Multiple terminal requires its unused chart-owned group.",
            );
          }
          const fullRate = getManualScreenDistanceRate(runtime.value.geometry, {
            beganPosition: origin,
            currentPosition: input.currentPosition,
            horizontalOnly: false,
          });
          if (fullRate.status !== "ok") {
            return fullRate;
          }
          const unitRate = float32FromBits(0x3c23d70a);
          const threshold = Math.fround(
            Math.fround(Math.fround(group.count - 1) * unitRate) + unitRate,
          );
          movementSucceeded = fullRate.value > threshold;
        }
      }
    }
    if (
      !movementSucceeded ||
      judgement.value.result === NoteResultType.None ||
      nextGrace <= Math.fround(0)
    ) {
      return ok(this.noManualSlideJudgementPlan(origin, nextGrace));
    }
    const noteType = gameNoteType === 8 ? 8 : gameNoteType <= 10 ? 9 : 10;
    return this.reserveManualSlideNode(
      input,
      current,
      noteType,
      judgement.value.result as Exclude<typeof judgement.value.result, -1>,
      judgement.value.timing,
      group !== null,
      origin,
      nextGrace,
    );
  }

  override commitManualTouchMoved(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
  ): void {
    this.commitManualSlideNode(input, plan);
  }

  override preflightManualTouchEnded(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const current = this.afterNotesValue[this.currentAfterIndexValue];
    const root = this.noteInformation;
    const runtime = this.manualRuntime;
    if (current === undefined || root === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.slide-ended-owner-unavailable",
            ["D12", "MJ22"],
            "Slide Ended requires its current parent-owned node.",
          )
        : runtime;
    }
    const judgement = judgeManualNote(
      0,
      Math.fround(current.source.absolutePos),
      runtime.value.getAdjustedMusicPosition(),
      runtime.value.getCurrentBpm(),
    );
    if (judgement.status !== "ok") {
      return judgement;
    }
    const noteType = current.isTerminal
      ? manualSlideFinalJudgeNoteType(root.afterNoteType)
      : 8;
    if (noteType === null) {
      return integrityFailure(
        "manual.slide-final-type-unrepresented",
        ["D12", "MJ22"],
        `Slide after type ${root.afterNoteType} has no confirmed final note type.`,
      );
    }
    return this.reserveManualSlideNode(
      input,
      current,
      noteType,
      !current.isTerminal || judgement.value.result === NoteResultType.None
        ? NoteResultType.Miss
        : judgement.value.result,
      judgement.value.timing,
      false,
    );
  }

  override commitManualTouchEnded(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
  ): void {
    this.commitManualSlideNode(input, plan, true);
  }

  private noManualSlideJudgementPlan(
    nextOrigin: ManualInputPosition | null = this.manualTouchOriginValue,
    nextGrace = this.manualAfterMoveTimeValue,
  ): ManualNoteContinuationPlan {
    return Object.freeze({
      judgementPlan: null,
      familyData: Object.freeze({
        currentIndex: this.currentAfterIndexValue,
        markMultipleUsed: false,
        nextOrigin,
        nextGrace,
      }),
    });
  }

  private reserveManualSlideNode(
    input: ManualNoteTouchInput,
    current: SlideAfterRuntime,
    noteType: number,
    rawResult: Exclude<NoteResultTypeValue, -1>,
    rawTiming: JudgeTimingValue,
    markMultipleUsed: boolean,
    nextOrigin: ManualInputPosition | null = this.manualTouchOriginValue,
    nextGrace = this.manualAfterMoveTimeValue,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const reserved = input.judgementTransaction.preflight({
      noteInformation: current.source,
      phase: current.isTerminal ? "tail" : "intermediate",
      noteType,
      rawResult,
      rawTiming,
      absolutePosition: current.source.absolutePos,
    });
    return reserved.status === "ok"
      ? ok(Object.freeze({
          judgementPlan: reserved.value,
          familyData: Object.freeze({
            currentIndex: this.currentAfterIndexValue,
            markMultipleUsed,
            nextOrigin,
            nextGrace,
          }),
        }))
      : reserved;
  }

  private commitManualSlideNode(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
    release = false,
  ): void {
    const data = plan.familyData as {
      readonly currentIndex: number;
      readonly markMultipleUsed: boolean;
      readonly nextOrigin: ManualInputPosition | null;
      readonly nextGrace: number;
    };
    this.manualTouchOriginValue = data.nextOrigin;
    this.manualAfterMoveTimeValue = data.nextGrace;
    if (plan.judgementPlan === null) {
      return;
    }
    if (data.currentIndex !== this.currentAfterIndexValue) {
      throw new Error("Slide current cursor changed after preflight");
    }
    if (data.markMultipleUsed) {
      const used = this.slideAfterMultipleGroupValue?.markUsed();
      if (used?.status !== "ok") {
        throw new Error("Slide Multiple group changed after preflight");
      }
    }
    input.judgementTransaction.commit(plan.judgementPlan);
    const current = this.afterNotesValue[this.currentAfterIndexValue];
    const marked = current?.markJudged();
    if (marked?.status !== "ok") {
      throw new Error("Slide current node changed after preflight");
    }
    this.currentAfterIndexValue += 1;
    if (release || current?.isTerminal) {
      const changed = this.changeState(NoteState.Deactive);
      if (changed.status !== "ok") {
        throw new Error("Slide completion could not deactivate parent");
      }
    }
  }

  protected override moveState(_deltaTimeSeconds: number): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return integrityFailure(
        "auto-live.slide-without-note-information",
        ["R02", "R04"],
        "Slide MoveState requires an activated root and Auto Live runtime.",
      );
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return integrityFailure(
        "auto-live.non-finite-adjusted-position",
        ["R02", "R04"],
        "Slide Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < noteInformation.absolutePos) {
      return ok(undefined);
    }
    if (!runtime.value.isAutoPlay()) {
      return this.changeState(NoteState.Wait);
    }
    const changed = this.changeState(NoteState.Wait);
    if (changed.status !== "ok") {
      return changed;
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "head",
      noteType: 0,
      absolutePosition: noteInformation.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    });
    if (submitted.status === "ok") {
      this.autoLiveTraceValue.push({ kind: "slide-head-perfect" });
    }
    return submitted;
  }

  protected override waitState(_deltaTimeSeconds: number): SimulatorResult<void> {
    const information = this.noteInformation;
    const autoRuntime = this.autoLiveRuntime;
    if (information === null || autoRuntime.status !== "ok") {
      return autoRuntime.status === "ok"
        ? integrityFailure(
            "manual.slide-front-timeout-owner-unavailable",
            ["D11", "MJ23"],
            "Slide Wait timeout requires its root and pending-node graph.",
          )
        : autoRuntime;
    }
    if (autoRuntime.value.isAutoPlay()) {
      return ok(undefined);
    }
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") {
      return runtime;
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    const frontOver = isManualTimeoutOver(
      information.absolutePos,
      adjusted,
      runtime.value.getCurrentBpm(),
    );
    if (frontOver.status !== "ok") {
      return frontOver;
    }
    const nextVisible = this.afterNotesValue.find(
      (after, index) => index >= this.currentAfterIndexValue &&
        !after.judged &&
        !after.source.isInvisible,
    );
    const midpointOver = nextVisible !== undefined &&
      Math.fround(nextVisible.source.absolutePos - adjusted) > Math.fround(0) &&
      Math.fround(adjusted - information.absolutePos) >
        Math.fround(nextVisible.source.absolutePos - adjusted);
    if (!frontOver.value && !midpointOver) {
      return ok(undefined);
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation: information,
      phase: "head",
      noteType: 8,
      rawResult: NoteResultType.Miss,
      rawTiming: JudgeTiming.None,
      absolutePosition: information.absolutePos,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    this.manualHeadJudgedValue = true;
    this.skipManualInvisibleAfterNodes();
    return this.currentAfterIndexValue >= this.afterNotesValue.length
      ? this.changeState(NoteState.Deactive)
      : this.changeState(NoteState.Stop);
  }

  protected override stopState(_deltaTimeSeconds: number): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return integrityFailure(
        "auto-live.slide-stop-runtime-unavailable",
        ["R02", "R04"],
        "Slide StopState requires the activated parent-owned after graph.",
      );
    }
    if (!runtime.value.isAutoPlay()) {
      return this.executeManualSlideCurrentTimeout();
    }
    const selected = this.afterNotesValue.find(
      (after) => !after.source.isInvisible && !after.judged,
    );
    if (selected === undefined) {
      return ok(undefined);
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return integrityFailure(
        "auto-live.non-finite-adjusted-position",
        ["R02", "R04"],
        "Slide Stop Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < selected.source.absolutePos) {
      return ok(undefined);
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation: selected.source,
      phase: "intermediate",
      noteType: 8,
      absolutePosition: selected.source.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    const marked = selected.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    this.autoLiveTraceValue.push({
      kind: "slide-stop-perfect",
      afterIndex: selected.sourceIndex,
    });
    return ok(undefined);
  }

  protected override onUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    for (const after of this.afterNotesValue) {
      if (!after.judged) {
        this.autoLiveTraceValue.push({
          kind: "slide-after-update",
          afterIndex: after.sourceIndex,
        });
      }
    }
    return this.forcePerfectPendingAfter();
  }

  override executeAfterUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.state === NoteState.Deactive) {
      return ok(undefined);
    }
    this.autoLiveTraceValue.push({ kind: "slide-base-after-update" });
    const current = this.afterNotesValue[this.currentAfterIndexValue];
    if (current !== undefined) {
      this.autoLiveTraceValue.push({
        kind: "slide-current-after-update",
        afterIndex: current.sourceIndex,
      });
    }
    return ok(undefined);
  }

  private executeManualSlideCurrentTimeout(): SimulatorResult<void> {
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") {
      return runtime;
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return integrityFailure(
        "manual.slide-timeout-non-finite-adjusted-position",
        ["D11", "MJ23"],
        "Slide current timeout requires a finite adjusted position.",
      );
    }
    this.skipManualInvisibleAfterNodes(adjusted);
    const current = this.afterNotesValue[this.currentAfterIndexValue];
    if (current === undefined) {
      return this.changeState(NoteState.Deactive);
    }
    const over = isManualTimeoutOver(
      current.source.absolutePos,
      adjusted,
      runtime.value.getCurrentBpm(),
    );
    if (over.status !== "ok" || !over.value) {
      return over.status === "ok" ? ok(undefined) : over;
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation: current.source,
      phase: current.isTerminal ? "tail" : "intermediate",
      noteType: 8,
      rawResult: NoteResultType.Miss,
      rawTiming: JudgeTiming.None,
      absolutePosition: current.source.absolutePos,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    const marked = current.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    this.currentAfterIndexValue += 1;
    this.skipManualInvisibleAfterNodes();
    return current.isTerminal || this.currentAfterIndexValue >= this.afterNotesValue.length
      ? this.changeState(NoteState.Deactive)
      : ok(undefined);
  }

  private skipManualInvisibleAfterNodes(
    adjustedMusicPosition?: number,
  ): void {
    while (true) {
      const current = this.afterNotesValue[this.currentAfterIndexValue];
      if (
        current === undefined ||
        !current.source.isInvisible ||
        (adjustedMusicPosition !== undefined &&
          adjustedMusicPosition < current.source.absolutePos)
      ) {
        return;
      }
      const marked = current.markJudged();
      if (marked.status !== "ok") {
        throw new Error("Slide invisible current changed during parent-owned timeout cleanup");
      }
      this.currentAfterIndexValue += 1;
    }
  }

  private forcePerfectPendingAfter(): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return integrityFailure(
        "auto-live.slide-runtime-graph-unavailable",
        ["R02", "R04"],
        "Slide pending-node Force Perfect requires the parent-owned runtime graph.",
      );
    }
    if (!runtime.value.isAutoPlay()) {
      return ok(undefined);
    }
    const current = this.afterNotesValue[this.currentAfterIndexValue];
    if (current === undefined) {
      return integrityFailure(
        "auto-live.slide-current-after-missing",
        ["R02", "R04"],
        "An active Slide must retain one selected pending after node.",
      );
    }
    if (current.judged) {
      this.currentAfterIndexValue += 1;
      return ok(undefined);
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return integrityFailure(
        "auto-live.non-finite-adjusted-position",
        ["R02", "R04"],
        "Slide after Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < current.source.absolutePos) {
      return ok(undefined);
    }
    if (current.source.isInvisible) {
      const marked = current.markJudged();
      if (marked.status !== "ok") {
        return marked;
      }
      this.autoLiveTraceValue.push({
        kind: "slide-invisible-support-skip",
        afterIndex: current.sourceIndex,
      });
      this.currentAfterIndexValue += 1;
      return ok(undefined);
    }
    const phase = current.isTerminal ? "tail" : "intermediate";
    let noteType = 8;
    if (current.isTerminal) {
      if (
        current.terminalJudgeNoteType === null ||
        current.terminalJudgeNoteType !== this.terminalJudgeNoteTypeValue
      ) {
        return integrityFailure(
          "auto-live.invalid-slide-terminal-graph",
          ["R02", "R03", "R04", "U01"],
          "The selected Slide terminal must retain the validated parent-owned judgement mapping.",
        );
      }
      noteType = current.terminalJudgeNoteType;
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation: current.source,
      phase,
      noteType,
      absolutePosition: current.source.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    const marked = current.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    this.autoLiveTraceValue.push({
      kind: current.isTerminal
        ? "slide-tail-perfect"
        : "slide-intermediate-perfect",
      afterIndex: current.sourceIndex,
    });
    this.currentAfterIndexValue += 1;
    return current.isTerminal
      ? this.changeState(NoteState.Deactive)
      : ok(undefined);
  }

  protected override onResetForDispose(): void {
    this.afterNotesValue = [];
    this.currentAfterIndexValue = 0;
    this.manualHeadJudgedValue = false;
    this.slideAfterMultipleGroupValue = null;
    this.manualTouchOriginValue = null;
    this.manualAfterMoveTimeValue = Math.fround(0);
    this.terminalJudgeNoteTypeValue = null;
    this.autoLiveTraceValue.length = 0;
  }

  override snapshot() {
    return {
      ...super.snapshot(),
      currentAfterIndex: this.currentAfterIndexValue,
      terminalJudgeNoteType: this.terminalJudgeNoteTypeValue,
      afterNodes: this.afterNotesValue.map((after) => ({
        sourceIndex: after.sourceIndex,
        noteIndex: after.source.index,
        absolutePosition: after.source.absolutePos,
        isInvisible: after.source.isInvisible,
        isTerminal: after.isTerminal,
        terminalJudgeNoteType: after.terminalJudgeNoteType,
        judged: after.judged,
      })),
    };
  }

  protected override onDeactivated(): void {
    for (const after of this.afterNotesValue) {
      after.resetForParentDeactivation();
    }
    this.afterNotesValue = [];
    this.currentAfterIndexValue = 0;
    this.manualHeadJudgedValue = false;
    this.slideAfterMultipleGroupValue = null;
    this.manualTouchOriginValue = null;
    this.manualAfterMoveTimeValue = Math.fround(0);
    this.terminalJudgeNoteTypeValue = null;
  }
}

export abstract class NoteFlickBase extends NoteSingleBase {
  protected readonly flickTraceValue: FlickForcePerfectTraceEntry[] = [];
  private frameCounterValue = Math.fround(0);
  private cachedJudgementValue: ManualNoteJudgement | null = null;

  get flickTrace(): readonly FlickForcePerfectTraceEntry[] {
    return this.flickTraceValue.map((entry) => ({ ...entry }));
  }

  protected abstract get forcePerfectSyntheticX(): SimulatorResult<number>;
  protected abstract get forcePerfectJudgeNoteType(): number;

  override preflightManualTouchBegan(
    _input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteBeganPlan> {
    const information = this.noteInformation;
    const runtime = this.manualRuntime;
    if (information === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.flick-without-note-information",
            ["D05", "D07", "MJ02", "MJ08", "MJ09"],
            "Flick Began requires its activated NoteInformation owner.",
          )
        : runtime;
    }
    const judgement = judgeManualNote(
      0,
      Math.fround(information.absolutePos),
      runtime.value.getAdjustedMusicPosition(),
      runtime.value.getCurrentBpm(),
    );
    if (judgement.status !== "ok") {
      return judgement;
    }
    return ok(Object.freeze({
      outcome: judgement.value.result === NoteResultType.None ? "none" : "bind",
      judgementPlan: null,
      familyData: judgement.value,
    }));
  }

  override commitManualTouchBegan(
    _input: ManualNoteTouchInput,
    plan: ManualNoteBeganPlan,
  ): void {
    const judgement = plan.familyData as ManualNoteJudgement | null;
    if (
      plan.outcome !== "bind" ||
      judgement === null ||
      judgement.result === NoteResultType.None
    ) {
      throw new Error("Flick Began commit lost its owner-produced cached judgement");
    }
    this.frameCounterValue = Math.fround(0);
    this.cachedJudgementValue = judgement;
    const changed = this.changeState(NoteState.Wait);
    if (changed.status !== "ok") {
      throw new Error("Flick Began commit could not enter Wait state");
    }
  }

  override preflightManualTouchEnded(
    _input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    return ok(Object.freeze({ judgementPlan: null, familyData: null }));
  }

  override commitManualTouchEnded(
    _input: ManualNoteTouchInput,
    _plan: ManualNoteContinuationPlan,
  ): void {}

  protected override waitState(deltaTimeSeconds: number): SimulatorResult<void> {
    const executeFrame = Math.fround(Math.fround(deltaTimeSeconds) * Math.fround(60));
    const nextFrameCounter = Math.fround(this.frameCounterValue + executeFrame);
    this.frameCounterValue = nextFrameCounter;
    return nextFrameCounter < Math.fround(7)
      ? ok(undefined)
      : this.forcePerfect();
  }

  protected override forcePerfect(): SimulatorResult<void> {
    const synthetic = this.forcePerfectSyntheticX;
    if (synthetic.status !== "ok") {
      return synthetic;
    }
    this.flickTraceValue.push({ kind: "flick-begin" });
    this.flickTraceValue.push({
      kind: "flick-synthetic-move",
      syntheticX: synthetic.value,
    });
    const autoRuntime = this.autoLiveRuntime;
    if (autoRuntime.status !== "ok") {
      return autoRuntime;
    }
    if (autoRuntime.value.isAutoPlay()) {
      return this.submitHeadPerfect(this.forcePerfectJudgeNoteType);
    }
    const information = this.noteInformation;
    const manualRuntime = this.manualRuntime;
    if (information === null || manualRuntime.status !== "ok") {
      return manualRuntime.status === "ok"
        ? integrityFailure(
            "manual.flick-force-perfect-without-source",
            ["R18", "D07", "MJ08", "MJ09"],
            "The seven-frame Flick synthetic chain requires its activated source owner.",
          )
        : manualRuntime;
    }
    const submitted = manualRuntime.value.submitJudgement({
      noteInformation: information,
      noteType: this.forcePerfectJudgeNoteType,
      rawResult: NoteResultType.Perfect,
      rawTiming: JudgeTiming.None,
      absolutePosition: information.absolutePos,
    });
    return submitted.status === "ok"
      ? this.changeState(NoteState.Deactive)
      : submitted;
  }

  protected reserveSuccessfulManualMove(
    input: ManualNoteTouchInput,
    multipleDirectionalFlickNoteCount?: number,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const information = this.noteInformation;
    const judgement = this.cachedJudgementValue;
    if (information === null || judgement === null || this.state !== NoteState.Wait) {
      return integrityFailure(
        "manual.flick-move-without-began-owner",
        ["R18", "D06", "D07", "MJ07", "MJ08", "MJ09"],
        "A Flick movement may consume only the non-None result/timing cached by its Began owner in Wait state.",
      );
    }
    const reserved = input.judgementTransaction.preflight({
      noteInformation: information,
      noteType: this.forcePerfectJudgeNoteType,
      rawResult: judgement.result as Exclude<typeof judgement.result, -1>,
      rawTiming: judgement.timing,
      absolutePosition: information.absolutePos,
      ...(multipleDirectionalFlickNoteCount === undefined
        ? {}
        : { multipleDirectionalFlickNoteCount }),
    });
    if (reserved.status !== "ok") {
      return reserved;
    }
    return ok(Object.freeze({
      judgementPlan: reserved.value,
      familyData: Object.freeze({ complete: true }),
    }));
  }

  protected commitSuccessfulManualMove(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
  ): void {
    if (plan.judgementPlan === null) {
      return;
    }
    input.judgementTransaction.commit(plan.judgementPlan);
    const changed = this.changeState(NoteState.Deactive);
    if (changed.status !== "ok") {
      throw new Error("Flick Moved commit could not deactivate the judged note");
    }
  }

  protected override onDeactivated(): void {
    super.onDeactivated();
    this.frameCounterValue = Math.fround(0);
    this.cachedJudgementValue = null;
  }

  protected override onResetForDispose(): void {
    this.flickTraceValue.length = 0;
    this.frameCounterValue = Math.fround(0);
    this.cachedJudgementValue = null;
  }
}

export class NoteFlick extends NoteFlickBase {
  protected override acceptsFrontNoteType(frontNoteType: number): boolean {
    return frontNoteType === FrontNoteType.Flick;
  }

  protected get forcePerfectSyntheticX(): SimulatorResult<number> {
    return ok(Math.fround(-100));
  }

  protected get forcePerfectJudgeNoteType(): number {
    return 3;
  }

  override preflightManualTouchMoved(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") {
      return runtime;
    }
    const rate = getManualScreenDistanceRate(runtime.value.geometry, {
      beganPosition: input.beganPosition,
      currentPosition: input.currentPosition,
      horizontalOnly: false,
    });
    if (rate.status !== "ok") {
      return rate;
    }
    return rate.value > float32FromBits(0x3d23d70a)
      ? this.reserveSuccessfulManualMove(input)
      : ok(Object.freeze({
          judgementPlan: null,
          familyData: Object.freeze({ complete: false, rate: rate.value }),
        }));
  }

  override commitManualTouchMoved(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
  ): void {
    this.commitSuccessfulManualMove(input, plan);
  }
}

export class NoteDirectionalFlick extends NoteFlickBase {
  protected override acceptsFrontNoteType(frontNoteType: number): boolean {
    return frontNoteType === FrontNoteType.DirectionalFlick;
  }

  protected override get forcePerfectSyntheticX(): SimulatorResult<number> {
    const sourceType = this.noteInformation?.gameNoteType;
    if (sourceType === 10) {
      return ok(Math.fround(-500));
    }
    if (sourceType === 11) {
      return ok(Math.fround(500));
    }
    return integrityFailure(
      "directional-flick-source-type",
      ["R02", "R04", "R05", "D07"],
      `Directional Flick only confirms source note types 10 and 11, received ${String(sourceType)}.`,
    );
  }

  protected override get forcePerfectJudgeNoteType(): number {
    return 9;
  }

  override preflightManualTouchMoved(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const information = this.noteInformation;
    const runtime = this.manualRuntime;
    if (information === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.directional-without-source",
            ["D07", "MJ09"],
            "Directional movement requires its activated source owner.",
          )
        : runtime;
    }
    const fullRate = getManualScreenDistanceRate(runtime.value.geometry, {
      beganPosition: input.beganPosition,
      currentPosition: input.currentPosition,
      horizontalOnly: false,
    });
    if (fullRate.status !== "ok") {
      return fullRate;
    }
    const correctDirection = information.gameNoteType === 10
      ? input.beganPosition.x > input.currentPosition.x
      : information.gameNoteType === 11
      ? input.beganPosition.x < input.currentPosition.x
      : false;
    if (!correctDirection) {
      return ok(Object.freeze({
        judgementPlan: null,
        familyData: Object.freeze({ complete: false, rate: fullRate.value }),
      }));
    }
    const horizontalRate = getManualScreenDistanceRate(runtime.value.geometry, {
      beganPosition: input.beganPosition,
      currentPosition: input.currentPosition,
      horizontalOnly: true,
    });
    if (horizontalRate.status !== "ok") {
      return horizontalRate;
    }
    return horizontalRate.value > float32FromBits(0x3c23d70a)
      ? this.reserveSuccessfulManualMove(input)
      : ok(Object.freeze({
          judgementPlan: null,
          familyData: Object.freeze({ complete: false, rate: horizontalRate.value }),
        }));
  }

  override commitManualTouchMoved(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
  ): void {
    this.commitSuccessfulManualMove(input, plan);
  }
}

export class NoteMultipleDirectionalFlick extends NoteDirectionalFlick {
  private groupResolverValue: ((
    information: NoteInformation,
  ) => SimulatorResult<MultipleDirectionalRuntimeGroup>) | null = null;
  private groupValue: MultipleDirectionalRuntimeGroup | null = null;
  private readonly multipleTraceValue: MultipleDirectionalAutoLiveTraceEntry[] = [];

  registerMultipleDirectionalGroupResolver(
    resolver: (
      information: NoteInformation,
    ) => SimulatorResult<MultipleDirectionalRuntimeGroup>,
  ): void {
    this.groupResolverValue = resolver;
  }

  get multipleTrace(): readonly MultipleDirectionalAutoLiveTraceEntry[] {
    return this.multipleTraceValue.map((entry) => ({ ...entry }));
  }

  protected override acceptsFrontNoteType(frontNoteType: number): boolean {
    return frontNoteType === FrontNoteType.MultipleDirectionalFlick;
  }

  protected override get forcePerfectJudgeNoteType(): number {
    return 10;
  }

  override preflightManualTouchBegan(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteBeganPlan> {
    const group = this.groupValue;
    if (group?.isUsed) {
      return integrityFailure(
        "manual.multiple-directional-group-already-used",
        ["D08", "MJ10"],
        "A consumed Multiple Directional side owner cannot accept another Began.",
      );
    }
    const basePlan = super.preflightManualTouchBegan(input);
    if (basePlan.status !== "ok" || basePlan.value.outcome === "none") {
      return basePlan;
    }
    if (group === null) {
      return integrityFailure(
        "manual.multiple-directional-runtime-unavailable",
        ["D08", "MJ10"],
        "Multiple Directional Began requires its registered group owner.",
      );
    }
    const fingerOwner = group.preflightManualFinger(
      input.judgementTransaction,
      input.fingerId,
    );
    return fingerOwner.status === "ok" ? basePlan : fingerOwner;
  }

  override commitManualTouchBegan(
    input: ManualNoteTouchInput,
    plan: ManualNoteBeganPlan,
  ): void {
    const group = this.groupValue;
    if (group === null) {
      throw new Error("Multiple Directional Began commit lost its group owner");
    }
    group.commitManualFinger(input.judgementTransaction, input.fingerId);
    super.commitManualTouchBegan(input, plan);
  }

  override preflightManualTouchMoved(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const information = this.noteInformation;
    const runtime = this.manualRuntime;
    const group = this.groupValue;
    if (information === null || runtime.status !== "ok" || group === null) {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.multiple-directional-runtime-unavailable",
            ["D07", "D08", "MJ10"],
            "Multiple Directional movement requires its activated source and registered group owner.",
          )
        : runtime;
    }
    if (group.isUsed) {
      return integrityFailure(
        "manual.multiple-directional-group-already-used",
        ["D08", "MJ10"],
        "A consumed Multiple Directional side owner cannot produce a duplicate movement judgement.",
      );
    }
    const fullRate = getManualScreenDistanceRate(runtime.value.geometry, {
      beganPosition: input.beganPosition,
      currentPosition: input.currentPosition,
      horizontalOnly: false,
    });
    if (fullRate.status !== "ok") {
      return fullRate;
    }
    const correctDirection = information.gameNoteType === 10
      ? input.beganPosition.x > input.currentPosition.x
      : information.gameNoteType === 11
      ? input.beganPosition.x < input.currentPosition.x
      : false;
    if (!correctDirection) {
      return ok(Object.freeze({
        judgementPlan: null,
        familyData: Object.freeze({ complete: false, fullRate: fullRate.value }),
      }));
    }
    const horizontalRate = getManualScreenDistanceRate(runtime.value.geometry, {
      beganPosition: input.beganPosition,
      currentPosition: input.currentPosition,
      horizontalOnly: true,
    });
    if (horizontalRate.status !== "ok") {
      return horizontalRate;
    }
    const unitRate = float32FromBits(0x3c23d70a);
    const countThreshold = Math.fround(
      Math.fround(Math.fround(group.count - 1) * unitRate) + unitRate,
    );
    if (
      horizontalRate.value <= unitRate ||
      fullRate.value <= countThreshold
    ) {
      return ok(Object.freeze({
        judgementPlan: null,
        familyData: Object.freeze({
          complete: false,
          fullRate: fullRate.value,
          horizontalRate: horizontalRate.value,
          countThreshold,
        }),
      }));
    }
    return this.reserveSuccessfulManualMove(input, group.count);
  }

  override commitManualTouchMoved(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
  ): void {
    if (plan.judgementPlan === null) {
      return;
    }
    const group = this.groupValue;
    if (group === null || group.isUsed) {
      throw new Error("Multiple Directional commit lost its preflight group owner");
    }
    const used = group.markUsed();
    if (used.status !== "ok") {
      throw new Error("Multiple Directional group use changed after preflight");
    }
    this.commitSuccessfulManualMove(input, plan);
    this.multipleTraceValue.push({ kind: "multiple-head-manual", groupCount: group.count });
    this.multipleTraceValue.push({ kind: "multiple-side-notes-used", groupCount: group.count });
  }

  override activate(noteInformation: NoteInformation): SimulatorResult<void> {
    const activationValidation = this.validateCanActivate(noteInformation);
    if (activationValidation.status !== "ok") {
      return activationValidation;
    }
    const ownerValidation = validateConcreteNoteOwner(
      noteInformation,
      this.acceptsFrontNoteType(noteInformation.fireNoteType),
      this.poolObjectId,
    );
    if (ownerValidation.status !== "ok") {
      return ownerValidation;
    }
    const graphValidation = validateAutoLiveActivationGraph(noteInformation);
    if (graphValidation.status !== "ok") {
      return graphValidation;
    }
    if (this.groupResolverValue === null) {
      return integrityFailure(
        "auto-live.multiple-directional-group-unregistered",
        ["R10", "R13", "R16"],
        "NoteManager must establish the adjacent-button runtime group before activation.",
      );
    }
    const group = this.groupResolverValue(noteInformation);
    if (group.status !== "ok") {
      return group;
    }
    const activated = super.activate(noteInformation);
    if (activated.status !== "ok") {
      return activated;
    }
    this.groupValue = group.value;
    this.multipleTraceValue.length = 0;
    return ok(undefined);
  }

  protected override moveState(deltaTimeSeconds: number): SimulatorResult<void> {
    const group = this.groupValue;
    if (group?.isUsed) {
      this.multipleTraceValue.push({ kind: "multiple-side-used-deactivate", groupCount: group.count });
      return this.changeState(NoteState.Deactive);
    }
    return super.moveState(deltaTimeSeconds);
  }

  protected override forcePerfect(): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    const group = this.groupValue;
    if (noteInformation === null || runtime.status !== "ok" || group === null) {
      return integrityFailure(
        "multiple-directional-runtime-unavailable",
        ["R10", "R12", "R16", "D08", "MJ10"],
        "Multiple Directional Force Perfect requires its activated adjacent-button runtime group.",
      );
    }
    if (group.isUsed) {
      this.multipleTraceValue.push({ kind: "multiple-side-used-deactivate", groupCount: group.count });
      return this.changeState(NoteState.Deactive);
    }
    const synthetic = this.forcePerfectSyntheticX;
    if (synthetic.status !== "ok") {
      return synthetic;
    }
    this.flickTraceValue.push({ kind: "flick-begin" });
    this.flickTraceValue.push({ kind: "flick-synthetic-move", syntheticX: synthetic.value });
    if (runtime.value.isAutoPlay()) {
      const submitted = runtime.value.submitJudgement({
        noteInformation,
        phase: "head",
        noteType: 10,
        absolutePosition: noteInformation.absolutePos,
        multipleDirectionalFlickNoteCount: group.count,
      });
      if (submitted.status !== "ok") {
        return submitted;
      }
      const used = group.markUsed();
      if (used.status !== "ok") {
        return used;
      }
    } else {
      const manualRuntime = this.manualRuntime;
      if (manualRuntime.status !== "ok") {
        return manualRuntime;
      }
      const transaction = manualRuntime.value.beginJudgementTransaction();
      const reserved = transaction.preflight({
        noteInformation,
        noteType: 10,
        rawResult: NoteResultType.Perfect,
        rawTiming: JudgeTiming.None,
        absolutePosition: noteInformation.absolutePos,
        multipleDirectionalFlickNoteCount: group.count,
      });
      if (reserved.status !== "ok") {
        transaction.abort();
        return reserved;
      }
      const used = group.markUsed();
      if (used.status !== "ok") {
        transaction.abort();
        return used;
      }
      transaction.commit(reserved.value);
      transaction.finish();
    }
    this.multipleTraceValue.push({ kind: "multiple-head-perfect", groupCount: group.count });
    this.multipleTraceValue.push({ kind: "multiple-side-notes-used", groupCount: group.count });
    return this.changeState(NoteState.Deactive);
  }

  override snapshot() {
    return {
      ...super.snapshot(),
      multipleDirectionalGroupCount: this.groupValue?.count ?? null,
      multipleDirectionalGroupUsed: this.groupValue?.isUsed ?? null,
      multipleDirectionalTrace: this.multipleTrace,
    };
  }

  protected override onDeactivated(): void {
    const group = this.groupValue;
    const fingerId = this.fingerId;
    super.onDeactivated();
    group?.clearManualFinger(fingerId);
    this.groupValue = null;
  }

  protected override onResetForDispose(): void {
    super.onResetForDispose();
    this.groupValue = null;
    this.multipleTraceValue.length = 0;
  }
}

export class NoteMultipleDirectionalVisual extends NoteFrontBase {
  private presentationLifecycleEnabled = false;

  registerPresentationLifecycle(enabled: boolean): void {
    this.presentationLifecycleEnabled = enabled;
  }

  override activate(noteInformation: NoteInformation): SimulatorResult<void> {
    const activationValidation = this.validateCanActivate(noteInformation);
    if (activationValidation.status !== "ok") {
      return activationValidation;
    }
    const ownerValidation = validateConcreteNoteOwner(
      noteInformation,
      noteInformation.fireNoteType === FrontNoteType.LongMultipleDirectionalFlickAdd ||
        noteInformation.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd ||
        noteInformation.fireNoteType === FrontNoteType.SlideBMultipleDirectionalFlickAdd,
      this.poolObjectId,
    );
    if (ownerValidation.status !== "ok") {
      return ownerValidation;
    }
    const graphValidation = validateAutoLiveActivationGraph(noteInformation);
    return graphValidation.status === "ok"
      ? super.activate(noteInformation)
      : graphValidation;
  }

  protected override onUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    return ok(undefined);
  }

  protected override moveState(_deltaTimeSeconds: number): SimulatorResult<void> {
    // R7 closes the presentation owner only for the explicitly connected renderer.
    if (!this.presentationLifecycleEnabled) return integrityFailure(
      "auto-live.multiple-directional-visual-presentation",
      ["R10", "R13", "R16.D01", "R16.D03"],
      "AddLong/AddSlide Multiple Directional presentation requires its explicit R7 renderer owner.",
    );
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") return integrityFailure(
      "auto-live.multiple-directional-visual-presentation",
      ["R10", "R13", "R16.D01", "R16.D03", "RPR-R7-009"],
      "The connected Multiple Directional visual requires its activated chart time owner; R7 closes only the registered production presentation path.",
    );
    return runtime.value.getAdjustedMusicPosition() >= noteInformation.absolutePos
      ? this.changeState(NoteState.Deactive)
      : ok(undefined);
  }
}

export class NoteFlickAfter extends NoteAfterBase {}

export class NoteDirectionalFlickAfter extends NoteAfterBase {}

export class NoteMultipleDirectionalFlickAfter extends NoteAfterBase {}

export class NoteSlideAfter extends NoteAfterBase {}

export class NoteSlideFlickAfter extends NoteAfterBase {}

export class NoteSlideDirectionalFlickAfter extends NoteAfterBase {}

export class NoteSlideMultipleDirectionalFlickAfter extends NoteAfterBase {}

export class LongAfterRuntime {
  private judgedValue = false;

  constructor(
    readonly absolutePosition: number,
    readonly afterNoteType: AfterNoteTypeValue,
    readonly shortRhythmUnder8beat: boolean,
  ) {}

  get judged(): boolean {
    return this.judgedValue;
  }

  markJudged(): SimulatorResult<void> {
    if (this.judgedValue) {
      return integrityFailure(
        "auto-live.long-after-already-judged",
        ["R02", "R04"],
        "The linked Long after node cannot produce a second Auto Live result.",
      );
    }
    this.judgedValue = true;
    return ok(undefined);
  }

  resetForParentDeactivation(): void {
    this.judgedValue = false;
  }
}

export class SlideAfterRuntime {
  private judgedValue = false;

  constructor(
    readonly source: NoteInformation,
    readonly sourceIndex: number,
    readonly isTerminal: boolean,
    readonly terminalJudgeNoteType: 5 | 6 | 7 | 8 | null,
  ) {}

  get judged(): boolean {
    return this.judgedValue;
  }

  markJudged(): SimulatorResult<void> {
    if (this.judgedValue) {
      return integrityFailure(
        "auto-live.slide-after-already-judged",
        ["R02", "R04"],
        `Slide after node ${this.sourceIndex} cannot produce a second Auto Live result.`,
      );
    }
    this.judgedValue = true;
    return ok(undefined);
  }

  resetForParentDeactivation(): void {
    this.judgedValue = false;
  }
}

export type LongAutoLiveTraceEntry = {
  readonly kind:
    | "long-head-perfect"
    | "long-after-update"
    | "long-linked-after-finish"
    | "long-tail-perfect"
    | "long-base-after-update"
    | "long-linked-after-update";
};

export type SlideAutoLiveTraceEntry =
  | {
      readonly kind:
        | "slide-head-perfect"
        | "slide-base-after-update";
    }
  | {
      readonly kind:
        | "slide-after-update"
        | "slide-current-after-update"
        | "slide-invisible-support-skip"
        | "slide-intermediate-perfect"
        | "slide-tail-perfect"
        | "slide-stop-perfect";
      readonly afterIndex: number;
    };

export type MultipleDirectionalAutoLiveTraceEntry = {
  readonly kind:
    | "multiple-head-perfect"
    | "multiple-head-manual"
    | "multiple-side-notes-used"
    | "multiple-side-used-deactivate";
  readonly groupCount: number;
};

export function validateAutoLiveActivationGraph(
  noteInformation: NoteInformation,
): SimulatorResult<void> {
  if (noteInformation.isInvisible) {
    return integrityFailure(
      "auto-live.invalid-playable-root-identity",
      ["R02", "R04", "U01"],
      `Playable root ${noteInformation.index} cannot use an invisible support identity.`,
    );
  }
  const buttonValidation = validatePlayableButtonIdentity(noteInformation);
  if (buttonValidation.status !== "ok") {
    return buttonValidation;
  }
  const familyShapeValidation = validateRootFamilyShape(noteInformation);
  if (familyShapeValidation.status !== "ok") {
    return familyShapeValidation;
  }
  if (noteInformation.fireNoteType === FrontNoteType.Long) {
    if (
      !isInt32Position(noteInformation.absolutePos) ||
      !isLongAfterType(noteInformation.afterNoteType) ||
      !isInt32Position(noteInformation.afterNoteAbsolutePos) ||
      noteInformation.afterNoteAbsolutePos <= noteInformation.absolutePos
    ) {
      return integrityFailure(
        "auto-live.invalid-long-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Long root ${noteInformation.index} has no confirmed terminal after node.`,
      );
    }
    return ok(undefined);
  }
  if (
    noteInformation.fireNoteType === FrontNoteType.SlideA ||
    noteInformation.fireNoteType === FrontNoteType.SlideB
  ) {
    if (
      !isInt32Position(noteInformation.absolutePos) ||
      !noteInformation.isSlideNoteHead ||
      noteInformation.slideNoteList.length === 0
    ) {
      return integrityFailure(
        "auto-live.invalid-slide-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Slide root ${noteInformation.index} has no confirmed after-node list.`,
      );
    }
    const terminalSource = noteInformation.slideNoteList[
      noteInformation.slideNoteList.length - 1
    ];
    if (terminalSource === undefined) {
      return integrityFailure(
        "auto-live.invalid-slide-after-graph",
        ["R01", "R02", "R04", "U01"],
        `Slide root ${noteInformation.index} has no terminal source node.`,
      );
    }
    if (terminalSource.isInvisible) {
      return integrityFailure(
        "auto-live.invalid-slide-terminal-graph",
        ["R02", "R03", "R04", "U01"],
        `Slide root ${noteInformation.index} has an invisible terminal outside the confirmed graph.`,
      );
    }
    const terminalValidation = resolveSlideTerminalJudgeNoteType(
      noteInformation.afterNoteType,
      terminalSource.gameNoteType,
    );
    if (terminalValidation.status !== "ok") {
      return terminalValidation;
    }
    const seen = new Set<NoteInformation>();
    let previousPosition = noteInformation.absolutePos;
    for (let index = 0; index < noteInformation.slideNoteList.length; index += 1) {
      const source = noteInformation.slideNoteList[index];
      if (source === undefined) {
        return integrityFailure(
          "auto-live.duplicate-or-missing-slide-node",
          ["R01", "R02", "R04", "U01"],
          `Slide root ${noteInformation.index} contains a missing after-node identity.`,
        );
      }
      const childButtonValidation = validatePlayableButtonIdentity(source);
      if (childButtonValidation.status !== "ok") {
        return childButtonValidation;
      }
      const roleValidation = validateSlideChildRole(
        noteInformation,
        source,
        index === noteInformation.slideNoteList.length - 1,
      );
      if (roleValidation.status !== "ok") {
        return roleValidation;
      }
      if (
        seen.has(source) ||
        !isInt32Position(source.absolutePos) ||
        source.absolutePos <= previousPosition
      ) {
        return integrityFailure(
          "auto-live.duplicate-or-missing-slide-node",
          ["R01", "R02", "R04", "U01"],
          `Slide root ${noteInformation.index} contains an invalid shared after-node identity.`,
        );
      }
      seen.add(source);
      previousPosition = source.absolutePos;
    }
    return ok(undefined);
  }
  if (noteInformation.fireNoteType === FrontNoteType.DirectionalFlick) {
    if (
      noteInformation.gameNoteType !== GameNoteType.DirectionalFlickLeft &&
      noteInformation.gameNoteType !== GameNoteType.DirectionalFlickRight
    ) {
      return integrityFailure(
        "auto-live.directional-flick-source-type",
        ["R02", "R04", "R05"],
        `Directional Force Perfect only confirms source note types 10 and 11, received ${String(noteInformation.gameNoteType)}.`,
      );
    }
    return ok(undefined);
  }
  if (noteInformation.fireNoteType === FrontNoteType.MultipleDirectionalFlick) {
    if (
      noteInformation.gameNoteType !== GameNoteType.DirectionalFlickLeft &&
      noteInformation.gameNoteType !== GameNoteType.DirectionalFlickRight
    ) {
      return integrityFailure(
        "auto-live.invalid-multiple-directional-root",
        ["R10", "R16", "R16.D05", "R16.D08"],
        `Core Multiple Directional requires front type 6 and source game type 10/11 (front=${noteInformation.fireNoteType}, game=${noteInformation.gameNoteType}).`,
      );
    }
  }
  return ok(undefined);
}

export function validateAutoLiveChartOwnership(
  batches: readonly NoteBatchInformation[],
): SimulatorResult<void> {
  const playableRoots = new WeakSet<NoteInformation>();
  const roots: NoteInformation[] = [];
  for (const batch of batches) {
    for (const information of batch.informationList) {
      if (information.buttonType === ButtonType.None) {
        continue;
      }
      if (playableRoots.has(information)) {
        return integrityFailure(
          "auto-live.duplicate-runtime-note-identity",
          ["R02", "R04", "U01"],
          `Playable root ${information.index} is bound more than once in the runtime chart.`,
        );
      }
      playableRoots.add(information);
      roots.push(information);
    }
  }

  const childOwners = new WeakMap<NoteInformation, NoteInformation>();
  for (const root of roots) {
    if (
      root.fireNoteType !== FrontNoteType.SlideA &&
      root.fireNoteType !== FrontNoteType.SlideB
    ) {
      continue;
    }
    for (const child of root.slideNoteList) {
      const existingOwner = childOwners.get(child);
      if (playableRoots.has(child) || existingOwner !== undefined) {
        return integrityFailure(
          "auto-live.shared-slide-child-owner",
          ["R02", "R04", "U01"],
          `Slide child ${child.index} must be owned by exactly one parent and remain outside the playable root list.`,
        );
      }
      childOwners.set(child, root);
    }
  }
  return ok(undefined);
}

function validatePlayableButtonIdentity(
  noteInformation: NoteInformation,
): SimulatorResult<void> {
  const buttons = noteInformation.buttonTypesArray;
  if (
    !Number.isInteger(noteInformation.index) ||
    noteInformation.index < 0 ||
    noteInformation.index > 0x7fffffff ||
    !Number.isInteger(noteInformation.buttonType) ||
    noteInformation.buttonType < ButtonType.Button_00_BMS_1P_SC ||
    noteInformation.buttonType > ButtonType.Button_15_BMS_2P_SC ||
    !Array.isArray(noteInformation.buttonTypes) ||
    !Array.isArray(buttons) ||
    buttons.length === 0 ||
    !buttons.includes(noteInformation.buttonType) ||
    new Set(buttons).size !== buttons.length ||
    noteInformation.buttonTypes.length !== buttons.length ||
    noteInformation.buttonTypes.some((button, index) => button !== buttons[index]) ||
    buttons.some((button) =>
      !Number.isInteger(button) ||
      button < ButtonType.Button_00_BMS_1P_SC ||
      button > ButtonType.Button_15_BMS_2P_SC)
  ) {
    return integrityFailure(
      "auto-live.invalid-note-button-identity",
      ["R02", "R04", "U01"],
      `Playable root ${noteInformation.index} has an unconfirmed primary/button-array identity.`,
    );
  }
  return ok(undefined);
}

function validateRootFamilyShape(
  noteInformation: NoteInformation,
): SimulatorResult<void> {
  let valid = true;
  switch (noteInformation.fireNoteType) {
    case FrontNoteType.Normal:
      valid = noteInformation.gameNoteType === GameNoteType.Normal &&
        noteInformation.afterNoteType === AfterNoteType.None;
      break;
    case FrontNoteType.Long:
      valid = noteInformation.gameNoteType === GameNoteType.Long;
      break;
    case FrontNoteType.Flick:
      valid = noteInformation.gameNoteType === GameNoteType.Flick &&
        noteInformation.afterNoteType === AfterNoteType.None;
      break;
    case FrontNoteType.SlideA:
      valid = noteInformation.gameNoteType === GameNoteType.SlideA;
      break;
    case FrontNoteType.SlideB:
      valid = noteInformation.gameNoteType === GameNoteType.SlideB;
      break;
    case FrontNoteType.DirectionalFlick:
    case FrontNoteType.MultipleDirectionalFlick:
      valid = noteInformation.afterNoteType === AfterNoteType.None;
      break;
    case FrontNoteType.LongMultipleDirectionalFlickAdd:
      valid = noteInformation.gameNoteType === GameNoteType.LongAddDirectionFlick &&
        noteInformation.afterNoteType === AfterNoteType.None;
      break;
    case FrontNoteType.SlideAMultipleDirectionalFlickAdd:
    case FrontNoteType.SlideBMultipleDirectionalFlickAdd:
      valid = noteInformation.gameNoteType === GameNoteType.SlideAddDirectionalFlick &&
        noteInformation.afterNoteType === AfterNoteType.None;
      break;
    default:
      return integrityFailure(
        "auto-live.invalid-note-family-shape",
        ["R02", "R04", "R10", "U01"],
        `Playable root ${noteInformation.index} has an unconfirmed front family ${noteInformation.fireNoteType}.`,
      );
  }
  return valid
    ? ok(undefined)
    : integrityFailure(
        "auto-live.invalid-note-family-shape",
        ["R02", "R04", "R10", "U01"],
        `Playable root ${noteInformation.index} has an unconfirmed front/game/after combination (${noteInformation.fireNoteType}/${noteInformation.gameNoteType}/${noteInformation.afterNoteType}).`,
      );
}

function validateSlideChildRole(
  root: NoteInformation,
  source: NoteInformation,
  isTerminal: boolean,
): SimulatorResult<void> {
  const validRole = !source.isSlideNoteHead &&
    source.afterNoteType === AfterNoteType.None &&
    (isTerminal
      ? source.fireNoteType === FrontNoteType.None
      : source.fireNoteType === root.fireNoteType &&
        source.gameNoteType === root.gameNoteType);
  return validRole
    ? ok(undefined)
    : integrityFailure(
        "auto-live.invalid-slide-child-role",
        ["R02", "R04", "U01"],
        `Slide child ${source.index} does not match its parent-owned ${isTerminal ? "terminal" : "intermediate"} role.`,
      );
}

function validateConcreteNoteOwner(
  noteInformation: NoteInformation,
  accepted: boolean,
  poolObjectId: string,
): SimulatorResult<void> {
  return accepted
    ? ok(undefined)
    : integrityFailure(
        "auto-live.note-family-owner-mismatch",
        ["R02", "R04", "U01"],
        `Pool object ${poolObjectId} cannot bind front family ${noteInformation.fireNoteType}.`,
      );
}

function isInt32Position(value: number): boolean {
  return Number.isInteger(value) &&
    value >= -0x80000000 &&
    value <= 0x7fffffff;
}

function isManualTimeoutOver(
  absolutePosition: number,
  adjustedMusicPosition: number,
  bpm: number,
): SimulatorResult<boolean> {
  if (
    !Number.isFinite(absolutePosition) ||
    !Number.isFinite(adjustedMusicPosition) ||
    !Number.isFinite(bpm) ||
    bpm <= 0
  ) {
    return integrityFailure(
      "manual.timeout-owner-value-invalid",
      ["D11", "MJ16", "MJ17", "MJ23"],
      "Manual timeout requires finite production positions and a positive finite BPM.",
    );
  }
  const distance = Math.fround(
    Math.fround(adjustedMusicPosition) - Math.fround(absolutePosition),
  );
  const seconds = getSecondsWithDistance(distance, bpm);
  return seconds.status === "ok"
    ? ok(seconds.value > float32FromBits(0x3e5dddde))
    : seconds;
}

function manualSlideFinalJudgeNoteType(
  afterNoteType: AfterNoteTypeValue,
): 5 | 6 | 7 | 8 | null {
  switch (afterNoteType) {
    case AfterNoteType.SlideAfter:
    case AfterNoteType.SlideEnd:
      return 5;
    case AfterNoteType.SlideFlickEnd:
      return 6;
    case AfterNoteType.SlideDirectionalFlickEndLeft:
    case AfterNoteType.SlideDirectionalFlickEndRight:
      return 7;
    case AfterNoteType.SlideMultipleDirectionalFlickLeft:
    case AfterNoteType.SlideMultipleDirectionalFlickRight:
      return 8;
    default:
      return null;
  }
}

function manualLongAfterJudgeNoteType(
  afterNoteType: AfterNoteTypeValue,
): 2 | 5 | 6 | 7 | null {
  switch (afterNoteType) {
    case AfterNoteType.Normal:
      return 2;
    case AfterNoteType.Flick:
      return 5;
    case AfterNoteType.DirectionalFlickLeft:
    case AfterNoteType.DirectionalFlickRight:
      return 6;
    case AfterNoteType.MultipleDirectionalFlickLeft:
    case AfterNoteType.MultipleDirectionalFlickRight:
      return 7;
    default:
      return null;
  }
}

function longAfterJudgeNoteType(afterNoteType: AfterNoteTypeValue): 1 | 3 | 9 | null {
  switch (afterNoteType) {
    case AfterNoteType.Normal:
      return 1;
    case AfterNoteType.Flick:
      return 3;
    case AfterNoteType.DirectionalFlickLeft:
    case AfterNoteType.DirectionalFlickRight:
    case AfterNoteType.MultipleDirectionalFlickLeft:
    case AfterNoteType.MultipleDirectionalFlickRight:
      return 9;
    default:
      return null;
  }
}

function float32FromBits(bits: number): number {
  const bytes = new ArrayBuffer(4);
  const view = new DataView(bytes);
  view.setUint32(0, bits, true);
  return view.getFloat32(0, true);
}

function isLongAfterType(afterNoteType: AfterNoteTypeValue): boolean {
  return afterNoteType >= AfterNoteType.Normal
    && afterNoteType <= AfterNoteType.MultipleDirectionalFlickRight;
}

function resolveSlideTerminalJudgeNoteType(
  afterNoteType: AfterNoteTypeValue,
  terminalGameNoteType: NoteInformation["gameNoteType"],
): SimulatorResult<5 | 6 | 7 | 8> {
  if (
    afterNoteType === AfterNoteType.None &&
    (terminalGameNoteType === GameNoteType.SlideEndA ||
      terminalGameNoteType === GameNoteType.SlideEndB)
  ) {
    return ok(8);
  }
  if (
    afterNoteType === AfterNoteType.SlideFlickEnd &&
    (terminalGameNoteType === GameNoteType.SlideEndFlickA ||
      terminalGameNoteType === GameNoteType.SlideEndFlickB)
  ) {
    return ok(5);
  }
  if (
    afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft &&
    (terminalGameNoteType === GameNoteType.SlideADirectionalFlickLeft ||
      terminalGameNoteType === GameNoteType.SlideBDirectionalFlickLeft)
  ) {
    return ok(6);
  }
  if (
    afterNoteType === AfterNoteType.SlideDirectionalFlickEndRight &&
    (terminalGameNoteType === GameNoteType.SlideADirectionalFlickRight ||
      terminalGameNoteType === GameNoteType.SlideBDirectionalFlickRight)
  ) {
    return ok(6);
  }
  if (
    afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft &&
    (terminalGameNoteType === GameNoteType.SlideADirectionalFlickLeftAdd ||
      terminalGameNoteType === GameNoteType.SlideBDirectionalFlickLeftAdd)
  ) {
    return ok(7);
  }
  if (
    afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight &&
    (terminalGameNoteType === GameNoteType.SlideADirectionalFlickRightAdd ||
      terminalGameNoteType === GameNoteType.SlideBDirectionalFlickRightAdd)
  ) {
    return ok(7);
  }
  return integrityFailure(
    "auto-live.invalid-slide-terminal-graph",
    ["R02", "R03", "R04", "U01"],
    `Slide terminal mapping is not confirmed (afterNoteType=${afterNoteType}, terminalGameNoteType=${terminalGameNoteType}).`,
  );
}
