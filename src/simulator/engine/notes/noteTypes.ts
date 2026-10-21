import { SlideFeedbackState } from "./slideFeedbackState";
import {
  integrityFailure,
  ok,
  type SimulatorResult,
} from "../result";
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
  cachedTailMovement,
  hasFlickMovement,
  judgeManualNote,
  isManualTimeoutOver,
  MANUAL_MISS_SECONDS,
  type JudgeTimingValue,
  type ManualNoteJudgement,
  type NoteResultTypeValue,
} from "../data/manualJudgement";
import { ManualTouchPhase, type ManualInputPosition } from "../data/manualInput";
import type { MultipleDirectionalRuntimeGroup } from "../data/autoLiveJudgement";
import { hasContinuousNoteGeometry } from "../chart/noteGeometry";
import { isSlideGestureNode, slideEndGameFamily, slideFlickDirection, slideFlickJudgeNoteType, slideGestureAfterType, slideGestureButtonTypes, slideGestureWidth } from "../chart/slideFlickNodes";
import { advanceSlideStopWait, queueSlideRenderHideBefore } from "../rendering/ordinarySlideChildLifecycle";
import { advanceSlideGestureContact, slideHeldNodeResult, slideHeadTimeoutDue, slideAfterTimeoutDue } from "../managers/slideNoteManager";

export class NoteFrontBase extends NoteBase {}

export class NoteAfterBase extends NoteBase {}

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
        autoRuntime.value.shouldForcePerfect()
          ? "auto-live.non-finite-adjusted-position"
          : "manual.single-non-finite-adjusted-position",
        "Single crossing and timeout require a finite adjusted music position.",
      );
    }
    if (adjustedPosition < noteInformation.absolutePos) {
      this.missSecondCounterValue = Math.fround(0);
      return ok(undefined);
    }
    if (autoRuntime.value.shouldForcePerfect()) {
      return this.forcePerfect();
    }
    this.missSecondCounterValue = Math.fround(
      this.missSecondCounterValue + Math.fround(deltaTimeSeconds),
    );
    if (this.missSecondCounterValue <= MANUAL_MISS_SECONDS) {
      return ok(undefined);
    }
    return this.onTimeoutMiss(noteInformation);
  }

  /** NoteSingleBase.onMiss: one GameNoteType 0 Miss, then Deactivate. */
  protected onTimeoutMiss(noteInformation: NoteInformation): SimulatorResult<void> {
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
    this.pulseAutoFrontTapLane(this.effectButtonLane());
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
            "Normal Began judgement requires its activated NoteInformation owner.",
          )
        : runtime;
    }
    const judgement = judgeManualNote(
      0,
      information.absolutePos,
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
  onTouchKeepSound: ((noteIndex: number, action: "start" | "fade") => void) | null = null;
  flashAnimationRevision: number | null = null;
  private flashRestartSequence = 0;
  private afterNoteValue: LongAfterRuntime | null = null;
  private longAfterMultipleGroupResolverValue: ((
    information: NoteInformation,
  ) => SimulatorResult<MultipleDirectionalRuntimeGroup | null>) | null = null;
  private longAfterMultipleGroupValue: MultipleDirectionalRuntimeGroup | null = null;
  private manualTouchOriginValue: ManualInputPosition | null = null;
  private manualMoveSucceededValue = false;
  private manualAfterMoveTimeValue = Math.fround(0);

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
    this.flashAnimationRevision = null;
    this.flashRestartSequence = 0;
    this.longAfterMultipleGroupValue = multipleGroup.value;
    this.manualTouchOriginValue = null;
    this.manualMoveSucceededValue = false;
    this.manualAfterMoveTimeValue = Math.fround(0);
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
            "Long Began requires its activated root and manual timing owner.",
          )
        : runtime;
    }
    const judgement = judgeManualNote(
      0,
      information.absolutePos,
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
    this.flashAnimationRevision = ++this.flashRestartSequence;
    this.onTouchKeepSound?.(this.noteInformation!.index, "start");
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
    this.pulseTapLane(this.targetButtonLane());
    this.onTouchKeepSound?.(this.noteInformation!.index, "fade");
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
            "Long continuation requires its Began origin, Stop state and parent-owned after node.",
          )
        : runtime;
    }
    const judgement = judgeManualNote(
      1,
      after.absolutePosition,
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
        const inside = runtime.value.isInsideSource(
          input.currentPosition, information,
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
    const nextOrigin = judgement.value.result === NoteResultType.None
      ? input.currentPosition
      : origin;
    const inside = runtime.value.isInsideSource(
      input.currentPosition, information,
      targetButtons,
    );
    if (inside.status !== "ok") {
      return inside;
    }
    const nextAfterMoveTime = inside.value
      ? Math.fround(8)
      : Math.fround(this.manualAfterMoveTimeValue - runtime.value.getExecuteFrame());
    const direction = after.afterNoteType === AfterNoteType.Flick ? null
      : after.afterNoteType === AfterNoteType.DirectionalFlickLeft || after.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft
        ? "Left" : "Right";
    const multiple = after.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft ||
      after.afterNoteType === AfterNoteType.MultipleDirectionalFlickRight;
    const movement = hasFlickMovement(runtime.value.geometry, nextOrigin, input.currentPosition, direction);
    if (movement.status !== "ok") return movement;
    let movementSucceeded = movement.value;
    if (movementSucceeded && multiple) {
      if (group === null || group.isUsed) return integrityFailure("manual.long-multiple-after-group-unavailable", "Long Multiple after movement requires its unused chart-owned group.");
      const grouped = hasFlickMovement(runtime.value.geometry, nextOrigin, input.currentPosition, direction, group.count);
      if (grouped.status !== "ok") return grouped;
      movementSucceeded = grouped.value;
    }
    // NoteLong.ExecTouchMoved: ordinary and directional tails also require a
    // valid end judgement and positive remaining grace; the Multiple branch
    // sets isFlicked and calls the button end without either gate.
    const complete = movementSucceeded && (multiple ||
      judgement.value.result !== NoteResultType.None &&
      nextAfterMoveTime > Math.fround(0));
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
          judgement.value.result === NoteResultType.None ? NoteResultType.Miss : judgement.value.result,
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
        "Long tail reservation requires its root and parent-owned after source.",
      );
    }
    const afterNoteType = longAfterJudgeNoteType(after.afterNoteType);
    if (afterNoteType === null) {
      return integrityFailure(
        "manual.long-after-type-unrepresented",
        `Long after type ${after.afterNoteType} has no confirmed manual note type.`,
      );
    }
    // judgeAfterNote replaces the after-note GameNoteType with 1 for a Miss.
    const noteType = rawResult === NoteResultType.Miss ? 1 : afterNoteType;
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
            "Long MoveState requires an activated root.",
          )
        : runtime;
    }
    if (!runtime.value.shouldForcePerfect()) {
      const manual = this.manualRuntime;
      if (manual.status !== "ok") return manual;
      const crossed = manual.value.hasCrossedMotionLine();
      if (crossed.status !== "ok") return crossed;
      return crossed.value ? this.changeState(NoteState.Wait) : ok(undefined);
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return integrityFailure(
        "auto-live.non-finite-adjusted-position",
        "Long Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < noteInformation.absolutePos) {
      return ok(undefined);
    }
    const stateChange = this.changeState(NoteState.Wait);
    if (stateChange.status !== "ok") {
      return stateChange;
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "head",
      noteType: 4,
      absolutePosition: noteInformation.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    });
    if (submitted.status === "ok") {
      this.pulseAutoFrontTapLane(this.effectButtonLane());
      this.flashAnimationRevision = ++this.flashRestartSequence;
      this.onTouchKeepSound?.(noteInformation.index, "start");
      return this.changeState(NoteState.Stop);
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
            "Long Wait timeout requires its activated root and adjusted-position owner.",
          )
        : autoRuntime;
    }
    if (autoRuntime.value.shouldForcePerfect()) {
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
    // execOverWaitState splits one Miss damage into two onMiss frames; the two
    // frames account for the head and tail of the Long note.
    const transaction = runtime.value.beginJudgementTransaction();
    const request = Object.freeze({
      noteInformation: information,
      phase: "head" as const,
      noteType: 1,
      rawResult: NoteResultType.Miss,
      rawTiming: JudgeTiming.None,
      absolutePosition: information.absolutePos,
      damageDivisor: 2 as const,
    });
    const first = transaction.preflight(request);
    if (first.status !== "ok") {
      transaction.abort();
      return first;
    }
    const second = transaction.preflight({
      ...request,
      phase: "tail",
      absolutePosition: information.afterNoteAbsolutePos,
    });
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
            "Long Stop timeout requires its parent-owned tail and adjusted-position owner.",
          )
        : autoRuntime;
    }
    if (autoRuntime.value.shouldForcePerfect()) {
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
    // execOverStopState emits its Miss with GameNoteType 1.
    const submitted = runtime.value.submitJudgement({
      noteInformation: information,
      phase: "tail",
      noteType: 1,
      rawResult: NoteResultType.Miss,
      rawTiming: JudgeTiming.None,
      absolutePosition: after.absolutePosition,
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
        "Long OnUpdate requires its parent-owned linked after runtime.",
      );
    }
    if (!runtime.value.shouldForcePerfect() || after.judged) {
      return ok(undefined);
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return integrityFailure(
        "auto-live.non-finite-adjusted-position",
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
        `Long root ${noteInformation.index} retained an unconfirmed terminal type.`,
      );
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "tail",
      noteType,
      absolutePosition: after.absolutePosition,
      multipleDirectionalFlickNoteCount: noteType === 7 ? this.longAfterMultipleGroupValue!.count : 0,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    this.pulseTapLane(this.targetButtonLane());
    const marked = after.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    return this.changeState(NoteState.Deactive);
  }

  override snapshot() {
    return {
      ...super.snapshot(),
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
    this.flashAnimationRevision = null;
    this.afterNoteValue?.resetForParentDeactivation();
    this.afterNoteValue = null;
    this.longAfterMultipleGroupValue = null;
    this.manualTouchOriginValue = null;
    this.manualMoveSucceededValue = false;
    this.manualAfterMoveTimeValue = Math.fround(0);
  }

  protected override onResetForDispose(): void {
    this.flashAnimationRevision = null;
    this.afterNoteValue = null;
    this.longAfterMultipleGroupValue = null;
    this.manualTouchOriginValue = null;
    this.manualMoveSucceededValue = false;
    this.manualAfterMoveTimeValue = Math.fround(0);
  }
}

export interface SlideNodeHideRequest {
  readonly forceKillMesh: boolean;
  readonly afterUpdate: boolean;
}

/** Extension: detection state of the current gesture head or intermediate node. It is
 * separate from the original shared tail origin/grace and tail cache. */
interface SlideGestureState {
  readonly index: number;
  readonly origin: ManualInputPosition;
  readonly grace: number;
  /** Touch-down cache of this node only, as ExecTouchBegan caches a flick tail. */
  readonly cache: {
    readonly result: Exclude<NoteResultTypeValue, -1>;
    readonly timing: JudgeTimingValue;
    readonly origin: ManualInputPosition;
  } | null;
}

function cachedSlideGestureState(
  node: SlideAfterRuntime,
  position: ManualInputPosition,
  result: NoteResultTypeValue,
  timing: JudgeTimingValue,
): SlideGestureState {
  return Object.freeze({ index: node.sourceIndex, origin: position, grace: Math.fround(0),
    cache: Object.freeze({ result: result as Exclude<NoteResultTypeValue, -1>, timing, origin: position }) });
}

export class NoteSlide extends NoteFrontBase {
  onTouchKeepSound: ((noteIndex: number, action: "start" | "fade") => void) | null = null;
  private readonly feedback = new SlideFeedbackState(action => {
    if (this.noteInformation !== null) this.onTouchKeepSound?.(this.noteInformation.index, action);
  });
  get flashAnimationRevision(): number | null { return this.feedback.revision; }
  private readonly pendingSpriteHides = new Map<number, SlideNodeHideRequest>();
  private readonly pendingGestureCloseIndices = new Set<number>();
  private beganPlacementPending = false;
  private headGestureNode: SlideAfterRuntime | null = null;
  private gestureStateValue: SlideGestureState | null = null;
  get headJudged(): boolean { return this.manualHeadJudgedValue; }
  /** Extension: whether a gesture head (-1) or intermediate node still shows its gesture
   * (flick icon, arrow, Add members). A touch-down that caches its result keeps it; it
   * closes when the node is judged or missed, and the node then looks like a plain node. */
  gesturePresentationShown(index: number): boolean {
    const node = index === -1 ? this.manualHeadJudgedValue ? null : this.headGestureNode : this.afterNotesValue[index];
    return node !== null && node !== undefined && node.isGesture && !node.judged;
  }
  private get manualCurrentNode(): SlideAfterRuntime | undefined {
    return !this.manualHeadJudgedValue && this.headGestureNode !== null ? this.headGestureNode
      : this.afterNotesValue[this.currentAfterIndexValue];
  }
  private afterNotesValue: readonly SlideAfterRuntime[] = [];
  private currentAfterIndexValue = 0;
  private laneEffectTarget: number | null = null;

  private replaceTapLaneTarget(source: NoteInformation | null): void {
    if (this.laneEffectTarget === null) return;
    this.tapLane("off", this.laneEffectTarget);
    this.laneEffectTarget = this.targetButtonLane(source);
    this.tapLane("on", this.laneEffectTarget);
  }

  private advanceHeldTapLane(current: SlideAfterRuntime): void {
    // ExecTouchMoved's beam branch runs for every successful visible intermediate node.
    if (current.isTerminal || current.source.isInvisible) return;
    this.replaceTapLaneTarget(current.source);
    this.tapLane("off-reserve", this.laneEffectTarget);
  }

  /** Auto Live head handling for the first visible node of a Hidden head. */
  private beginAutoHiddenHead(first: SlideAfterRuntime): void {
    this.laneEffectTarget = this.targetButtonLane(first.source);
    if (!first.isTerminal) {
      this.feedback.restartFlash();
      this.feedback.setSound("start");
    }
  }

  private reflectAutoAfterTapLane(current: SlideAfterRuntime): void {
    if (current === this.hiddenHeadNode) this.beginAutoHiddenHead(current);
    if (!current.isTerminal) {
      this.advanceHeldTapLane(current);
      return;
    }
    // forcePerfectOnUpdate dispatches the same Ended wrapper as manual release.
    this.replaceTapLaneTarget(current.source);
    // Native gesture terminals also join 0x321E848 -> OffReserve at 0x321E884.
    this.tapLane("off-reserve", this.laneEffectTarget);
  }

  private manualHeadJudgedValue = false;
  /** NoteSlide.cachedResult/cachedJudgeTiming; Activate writes -1/0. */
  private manualTailCacheValue: { readonly result: Exclude<NoteResultTypeValue, -1>; readonly timing: JudgeTimingValue } | null = null;
  private allHiddenValue = false;
  private firstVisibleAfterIndexValue = -1;
  private lastVisibleAfterIndexValue = -1;
  private trailingGeometryValue = false;
  /** Drops every finger reference once the last visible node has taken tail handling. */
  onManualOwnershipReleased: ((note: NoteSlide) => void) | null = null;
  get isGeometryOnly(): boolean { return this.allHiddenValue || this.trailingGeometryValue; }
  private get hiddenEndpoints(): boolean { return this.noteInformation?.hiddenSlideEndpoints === true; }
  /** First visible node of a Hidden-head Slide; it takes head handling and intermediate judgement. */
  private get hiddenHeadNode(): SlideAfterRuntime | null {
    return this.hiddenEndpoints && this.noteInformation?.isInvisible === true && !this.allHiddenValue
      ? this.afterNotesValue[this.firstVisibleAfterIndexValue] ?? null : null;
  }
  get awaitsHiddenHeadRegistration(): boolean {
    const first = this.hiddenHeadNode;
    return first !== null && !first.judged && this.fingerId < 0 &&
      this.state !== NoteState.Deactive && !this.trailingGeometryValue;
  }
  /** The last visible node of a Hidden-tail Slide has been judged. */
  private get visibleRangeFinished(): boolean {
    if (!this.hiddenEndpoints || this.allHiddenValue) return false;
    const last = this.afterNotesValue[this.afterNotesValue.length - 1];
    if (last === undefined || !last.source.isInvisible) return false;
    return this.lastVisibleAfterIndexValue < 0 ? this.manualHeadJudgedValue
      : this.afterNotesValue[this.lastVisibleAfterIndexValue]!.judged;
  }

  private slideAfterMultipleGroupResolverValue: ((
    information: NoteInformation,
  ) => SimulatorResult<MultipleDirectionalRuntimeGroup | null>) | null = null;
  private slideAfterMultipleGroupValue: MultipleDirectionalRuntimeGroup | null = null;
  private manualTouchOriginValue: ManualInputPosition | null = null;
  private manualAfterMoveTimeValue = Math.fround(0);
  private terminalJudgeNoteTypeValue: 5 | 6 | 7 | 8 | null = null;

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

  get pendingRenderHides(): ReadonlyMap<number, SlideNodeHideRequest> {
    return this.pendingSpriteHides;
  }

  /** Gesture presentations closed since the last render reflection (-1 is the head). */
  get pendingGestureCloses(): ReadonlySet<number> {
    return this.pendingGestureCloseIndices;
  }

  get pendingBeganPlacement(): boolean {
    return this.beganPlacementPending;
  }

  commitBeganPlacement(): void {
    this.beganPlacementPending = false;
  }

  commitRenderHides(): void {
    this.pendingSpriteHides.clear();
    this.pendingGestureCloseIndices.clear();
  }

  private closeGesturePresentation(index: number): void {
    const node = index === -1 ? this.headGestureNode : this.afterNotesValue[index];
    if (node?.isGesture === true) this.pendingGestureCloseIndices.add(index);
  }

  /** The gesture state of a node starts fresh when it becomes current. */
  private gestureStateFor(node: SlideAfterRuntime, position: ManualInputPosition): SlideGestureState {
    const state = this.gestureStateValue;
    return state !== null && state.index === node.sourceIndex ? state
      : Object.freeze({ index: node.sourceIndex, origin: position, grace: Math.fround(0), cache: null });
  }

  private clearGestureState(index: number): void {
    if (this.gestureStateValue?.index === index) this.gestureStateValue = null;
  }

  /** A gesture node that has just become current starts at the finger with no grace. */
  private beginGestureStateIfCurrent(position: ManualInputPosition): void {
    const current = this.manualCurrentNode;
    if (current?.isGesture === true && this.gestureStateValue?.index !== current.sourceIndex)
      this.gestureStateValue = Object.freeze({ index: current.sourceIndex, origin: position, grace: Math.fround(0), cache: null });
  }

  private hideSlideNode(index: number, forceKillMesh: boolean, afterUpdate = false): void {
    const previous = this.pendingSpriteHides.get(index);
    this.pendingSpriteHides.set(index, Object.freeze({
      forceKillMesh: forceKillMesh || previous?.forceKillMesh === true,
      afterUpdate: afterUpdate || previous?.afterUpdate === true,
    }));
  }

  private hideBeforeSlideNode(index: number, forceKillMesh: boolean, afterUpdate = false): void {
    queueSlideRenderHideBefore(this.pendingSpriteHides, index,
      this.afterNotesValue.map((after) => after.source), forceKillMesh, afterUpdate);
  }

  refreshAfterMoveTime(): void {
    if (!this.manualHeadJudgedValue) return;
    this.feedback.setSound("fade");
    this.feedback.hideFlash();
    this.hideSlideNode(-1, true);
    this.hideBeforeSlideNode(this.currentAfterIndexValue, true);
    this.skipManualInvisibleAfterNodes();
  }

  get currentAfterIndex(): number {
    return this.currentAfterIndexValue;
  }

  get manualCandidateSource(): NoteInformation | null {
    // The first visible node of a Hidden head registers through hidden-head
    // registration only; ordinary Began arbitration never selects it.
    if (this.isGeometryOnly || this.awaitsHiddenHeadRegistration) return null;
    if (!this.manualHeadJudgedValue && this.noteInformation?.isInvisible) return null;
    return !this.manualHeadJudgedValue ? this.noteInformation
      : this.afterNotesValue[this.currentAfterIndexValue]?.source ?? null;
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
    for (let index = 0; index < noteInformation.slideNoteList.length; index += 1) {
      const source = noteInformation.slideNoteList[index];
      if (
        source === undefined ||
        seen.has(source)
      ) {
        return integrityFailure(
          "auto-live.duplicate-or-missing-slide-node",
          `Slide root ${noteInformation.index} contains an invalid shared after-node identity.`,
        );
      }
      seen.add(source);
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
    this.headGestureNode = isSlideGestureNode(noteInformation) ? new SlideAfterRuntime(noteInformation, -1, false, null) : null;
    this.feedback.reset();
    this.firstVisibleAfterIndexValue = afterNotes.findIndex(after => !after.source.isInvisible);
    let lastVisible = afterNotes.length - 1;
    while (lastVisible >= 0 && afterNotes[lastVisible]!.source.isInvisible) lastVisible -= 1;
    this.lastVisibleAfterIndexValue = lastVisible;
    this.trailingGeometryValue = false;
    this.allHiddenValue = noteInformation.isInvisible && this.firstVisibleAfterIndexValue < 0;
    this.afterNotesValue = afterNotes;
    this.currentAfterIndexValue = 0;
    this.laneEffectTarget = null;
    this.manualHeadJudgedValue = false;
    this.manualTailCacheValue = null;
    this.slideAfterMultipleGroupValue = multipleGroup.value;
    this.gestureStateValue = null;
    this.pendingGestureCloseIndices.clear();
    this.manualTouchOriginValue = null;
    this.manualAfterMoveTimeValue = Math.fround(0);
    this.terminalJudgeNoteTypeValue = terminalJudgeNoteType.value;
    return ok(undefined);
  }

  override preflightManualTouchBegan(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteBeganPlan> {
    const source = this.manualCandidateSource;
    const runtime = this.manualRuntime;
    if (source === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.slide-head-owner-unavailable",
            "Slide Began requires its current unconsumed source.",
          )
        : runtime;
    }
    const judgement = runtime.value.judgeSlide(
      source,
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
    const timing = judgement.value.result === NoteResultType.Perfect || judgement.value.correction <= 0
      ? JudgeTiming.None : JudgeTiming.Fast;
    // A gesture head or intermediate node takes the flick tail's touch-down: like
    // ExecTouchBegan it caches this touch's result and timing, and the node judges
    // on the following movement.
    const gestureNode = !this.manualHeadJudgedValue ? this.headGestureNode
      : this.afterNotesValue[this.currentAfterIndexValue]?.isGesture === true ? this.afterNotesValue[this.currentAfterIndexValue]! : null;
    if (gestureNode !== null) {
      const unbound = this.noManualSlideJudgementPlan(input.currentPosition, Math.fround(0));
      return ok(Object.freeze({ outcome: "bind", judgementPlan: null, familyData: Object.freeze({ ...unbound.familyData as object,
        gesture: cachedSlideGestureState(gestureNode, input.currentPosition, judgement.value.result, timing) }) }));
    }
    if (this.manualHeadJudgedValue) {
      const current = this.afterNotesValue[this.currentAfterIndexValue]!;
      // A flick tail binds on Began and judges on movement/release. On the
      // last node of a flick-tailed root, ExecTouchBegan caches the result.
      const afterType = this.noteInformation!.afterNoteType;
      const tailCache = current.isTerminal &&
        afterType >= AfterNoteType.SlideFlickEnd && afterType <= AfterNoteType.SlideMultipleDirectionalFlickRight
        ? Object.freeze({ result: judgement.value.result, timing }) : null;
      const unbound = this.noManualSlideJudgementPlan(input.currentPosition, Math.fround(0));
      const continuation = current.judgeNoteType !== 8
        ? ok(tailCache === null ? unbound : Object.freeze({ ...unbound,
          familyData: Object.freeze({ ...unbound.familyData as object, tailCache }) }))
        : this.reserveManualSlideNode(
            input, current, 8, judgement.value.result, timing,
            false, input.currentPosition, Math.fround(0),
          );
      return continuation.status === "ok"
        ? ok(Object.freeze({ outcome: "bind", ...continuation.value }))
        : continuation;
    }
    const reserved = input.judgementTransaction.preflight({
      noteInformation: source,
      phase: "head",
      noteType: 8,
      rawResult: judgement.value.result,
      rawTiming: timing,
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
    this.laneEffectTarget = this.targetButtonLane(this.manualCandidateSource);
    if (this.manualHeadJudgedValue) {
      if (plan.judgementPlan === null && this.afterNotesValue[this.currentAfterIndexValue]?.isTerminal)
        this.hideSlideNode(this.currentAfterIndexValue, false);
      const tailCache = (plan.familyData as { tailCache?: NoteSlide["manualTailCacheValue"] }).tailCache;
      if (tailCache !== undefined) this.manualTailCacheValue = tailCache;
      this.commitManualSlideNode(input, plan);
      if (this.state !== NoteState.Deactive) {
        this.feedback.restartFlash();
        this.feedback.setSound("start");
      }
      this.enterTrailingGeometryIfFinished();
      return;
    }
    if (plan.judgementPlan === null && this.headGestureNode === null)
      throw new Error("Slide head commit lost its reservation");
    if (plan.judgementPlan !== null) input.judgementTransaction.commit(plan.judgementPlan);
    this.beganPlacementPending = true;
    this.manualHeadJudgedValue = plan.judgementPlan !== null;
    this.manualTouchOriginValue = input.currentPosition;
    this.manualAfterMoveTimeValue = Math.fround(0);
    const gesture = (plan.familyData as { gesture?: SlideGestureState }).gesture;
    if (gesture !== undefined) this.gestureStateValue = gesture;
    if (this.manualHeadJudgedValue) this.beginGestureStateIfCurrent(input.currentPosition);
    const changed = this.changeState(NoteState.Stop);
    if (changed.status !== "ok") {
      throw new Error("Slide head commit could not enter Stop state");
    }
    this.feedback.restartFlash();
    this.feedback.setSound("start");
    this.enterTrailingGeometryIfFinished();
  }

  override preflightManualTouchMoved(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    if (this.isGeometryOnly) return ok(this.noManualSlideJudgementPlan());
    const plans: ManualNoteContinuationPlan[] = [];
    let current = this.manualCurrentNode;
    // The original shared tail origin/grace; gesture nodes keep their own state.
    let origin = this.manualTouchOriginValue;
    const grace = this.manualAfterMoveTimeValue;
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") return runtime;
    while (true) {
      const planned = current?.isGesture === true
        ? this.preflightManualGestureMovedNode(input, current, origin, grace)
        : this.preflightManualSlideMovedNode(input, current, origin, grace);
      if (planned.status !== "ok") return planned;
      plans.push(planned.value);
      const data = planned.value.familyData as { advanceHidden?: boolean };
      if (current === undefined || current.isTerminal || current.sourceIndex < 0) break;
      const advanced = planned.value.judgementPlan !== null || data.advanceHidden === true;
      const next = advanced ? this.afterNotesValue[current.sourceIndex + 1] : current;
      if (next === undefined) break;
      // ExecTouchMoved 0x321CB48..0x321CB78 re-enters only after successful
      // intermediate progression with B != 0. Otherwise it reaches the tail
      // gesture block, including when another intermediate remains current.
      // A gesture intermediate takes both paths like any other intermediate.
      if (!advanced || runtime.value.getJudgementAdjustValueB() === 0) {
        const tail = this.afterNotesValue[this.afterNotesValue.length - 1];
        if (tail !== undefined && tail.judgeNoteType !== 8) {
          if (tail.judgeNoteType === 6 || tail.judgeNoteType === 7) origin = input.currentPosition;
          const terminal = this.preflightManualSlideMovedNode(input, next, origin, grace, tail);
          if (terminal.status !== "ok") return terminal;
          plans.push(terminal.value);
        }
        break;
      }
      current = next;
    }
    return ok({ ...plans[0]!, familyData: { ...plans[0]!.familyData as object,
      continuations: plans.slice(1) } });
  }

  private preflightManualSlideMovedNode(
    input: ManualNoteTouchInput,
    current: SlideAfterRuntime | undefined,
    origin: ManualInputPosition | null,
    grace: number,
    terminalTarget?: SlideAfterRuntime,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const runtime = this.manualRuntime;
    if (
      current === undefined ||
      runtime.status !== "ok" ||
      this.state !== NoteState.Stop
    ) {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.slide-current-owner-unavailable",
            "Slide Moved requires its parent-owned current node in Stop state.",
          )
        : runtime;
    }
    if (terminalTarget === undefined && current.judgeNoteType === 8) {
      if (current.isTerminal) return ok(this.noManualSlideJudgementPlan(origin, grace));
      if (!current.source.isInvisible) {
        const inside = runtime.value.isInsideSource(
          input.currentPosition, current.source,
          current.source.buttonTypesArray,
        );
        if (inside.status !== "ok") {
          return inside;
        }
        if (!inside.value) {
          return ok(this.noManualSlideJudgementPlan(origin, grace));
        }
      }
      const slideDecision = runtime.value.judgeSlide(current.source);
      if (slideDecision.status !== "ok") {
        return slideDecision;
      }
      const result = slideHeldNodeResult(slideDecision.value, runtime.value.getJudgementAdjustValueB());
      if (result === NoteResultType.None) {
        return ok(this.noManualSlideJudgementPlan(origin, grace));
      }
      return this.reserveManualSlideNode(
        input,
        current,
        8,
        result,
        JudgeTiming.None,
        false,
        origin,
        grace,
      );
    }
    const target = terminalTarget ?? current;
    // Folded targets follow the connection cursor: a later node is not examined
    // while an earlier visible node is pending.
    if (runtime.value.usesFoldedTime && (target.judged ||
        target.sourceIndex > current.sourceIndex && this.afterNotesValue.slice(current.sourceIndex, target.sourceIndex)
          .some(after => !after.judged && !after.source.isInvisible)))
      return ok(this.noManualSlideJudgementPlan(origin, grace));
    const judgement = runtime.value.judgeSlide(target.source);
    if (judgement.status !== "ok") {
      return judgement;
    }
    const group = target.isTerminal ? this.slideAfterMultipleGroupValue : null;
    const targetButtons = group?.buttonTypes ?? target.source.buttonTypesArray;
    const inside = runtime.value.isInsideSource(
      input.currentPosition, target.source,
      targetButtons,
    );
    if (inside.status !== "ok") {
      return inside;
    }
    const contact = advanceSlideGestureContact(judgement.value, inside.value,
      grace, runtime.value.getExecuteFrame(), origin, input.currentPosition);
    const nextGrace = contact.grace;
    const nextOrigin = contact.origin;
    if (nextOrigin === null) {
      return integrityFailure(
        "manual.slide-touch-origin-unavailable",
        "Slide terminal movement requires its cached Began origin.",
      );
    }
    const afterNoteType = this.noteInformation!.afterNoteType;
    const direction = slideFlickDirection(afterNoteType);
    const multiple = afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft ||
      afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight;
    const cache = target.isTerminal ? this.manualTailCacheValue : null;
    if (cache !== null && origin !== null) {
      // ExecTouchMoved with cachedResult != -1 rechecks only the distance from
      // cachedBeganPos, then consumes the cached result without direction,
      // grace or tail-position gates.
      if (multiple && (group === null || group.isUsed)) return integrityFailure("manual.slide-multiple-terminal-group-unavailable", "Slide Multiple terminal requires its unused chart-owned group.");
      const passed = cachedTailMovement(runtime.value.geometry, origin, input.currentPosition, afterNoteType,
        group?.count ?? 1);
      if (passed.status !== "ok") return passed;
      if (!passed.value) return ok(this.noManualSlideJudgementPlan(origin, grace));
      const forcedPerfect = runtime.value.getJudgementAdjustValueB() >= 1;
      const cachedReleased = this.reserveManualSlideNode(input, current, target.judgeNoteType,
        forcedPerfect ? NoteResultType.Perfect : cache.result, forcedPerfect ? JudgeTiming.None : cache.timing,
        group !== null, origin, grace, true);
      return cachedReleased.status === "ok" ? ok({ ...cachedReleased.value,
        familyData: { ...cachedReleased.value.familyData as object, release: true } }) : cachedReleased;
    }
    const movement = hasFlickMovement(runtime.value.geometry, nextOrigin, input.currentPosition, direction);
    if (movement.status !== "ok") return movement;
    let movementSucceeded = movement.value;
    if (movementSucceeded && multiple) {
      if (group === null || group.isUsed) return integrityFailure("manual.slide-multiple-terminal-group-unavailable", "Slide Multiple terminal requires its unused chart-owned group.");
      const grouped = hasFlickMovement(runtime.value.geometry, nextOrigin, input.currentPosition, direction, group.count);
      if (grouped.status !== "ok") return grouped;
      movementSucceeded = grouped.value;
    }
    if (
      !movementSucceeded ||
      !contact.ready || judgement.value.result === NoteResultType.None
    ) {
      return ok(this.noManualSlideJudgementPlan(nextOrigin, nextGrace));
    }
    const releasedCurrent = terminalTarget === undefined ? current
      : this.afterNotesValue.find(after => after.sourceIndex >= current.sourceIndex && !after.source.isInvisible) ?? current;
    if (terminalTarget !== undefined && releasedCurrent !== terminalTarget) {
      // The native tail gesture calls Ended; checkEndNote still examines the
      // actual current node. An earlier intermediate therefore takes its Miss
      // path (onMiss, type 8), a gesture intermediate included.
      const released = this.reserveManualSlideNode(input, releasedCurrent, 8,
        NoteResultType.Miss, JudgeTiming.None, false, null, 0);
      return released.status === "ok" ? ok({ ...released.value,
        familyData: { ...released.value.familyData as object, release: true } }) : released;
    }
    const noteType = target.judgeNoteType;
    const released = this.reserveManualSlideNode(
      input,
      releasedCurrent,
      noteType,
      runtime.value.getJudgementAdjustValueB() >= 1 ? NoteResultType.Perfect : judgement.value.result,
      JudgeTiming.None,
      group !== null,
      nextOrigin,
      nextGrace,
      target.isTerminal,
    );
    // A successful terminal gesture reaches NoteSlide.Ended through its button.
    return released.status === "ok" && target.isTerminal ? ok({ ...released.value,
      familyData: { ...released.value.familyData as object, release: true } }) : released;
  }

  /**
   * Extension: the own judgement of a gesture head or intermediate node follows the
   * original flick-tail family (contact grace, origin, virtual perfect line, flick
   * distance, touch-down cache) with its own state. The shared tail origin/grace pass
   * through unchanged; a success judges the node with type 5/6/7 and the Slide continues.
   */
  private preflightManualGestureMovedNode(
    input: ManualNoteTouchInput,
    current: SlideAfterRuntime,
    origin: ManualInputPosition | null,
    grace: number,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok" || this.state !== NoteState.Stop) {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.slide-current-owner-unavailable",
            "Slide Moved requires its parent-owned current node in Stop state.",
          )
        : runtime;
    }
    const state = this.gestureStateFor(current, input.currentPosition);
    const afterNoteType = current.gestureAfterType;
    const width = slideGestureWidth(current.source);
    const forcedPerfect = runtime.value.getJudgementAdjustValueB() >= 1;
    const pending = (gesture: SlideGestureState): ManualNoteContinuationPlan => {
      const unbound = this.noManualSlideJudgementPlan(origin, grace);
      return Object.freeze({ ...unbound, familyData: Object.freeze({ ...unbound.familyData as object, gesture }) });
    };
    if (state.cache !== null) {
      // As the cached tail: only the distance from the touch-down position is checked.
      const passed = cachedTailMovement(runtime.value.geometry, state.cache.origin, input.currentPosition,
        afterNoteType, width);
      if (passed.status !== "ok") return passed;
      if (!passed.value) return ok(pending(state));
      return this.reserveManualSlideNode(input, current, current.judgeNoteType,
        forcedPerfect ? NoteResultType.Perfect : state.cache.result, forcedPerfect ? JudgeTiming.None : state.cache.timing,
        false, origin, grace);
    }
    const judgement = runtime.value.judgeSlide(current.source);
    if (judgement.status !== "ok") return judgement;
    const inside = runtime.value.isInsideSource(input.currentPosition, current.source,
      slideGestureButtonTypes(current.source));
    if (inside.status !== "ok") return inside;
    const contact = advanceSlideGestureContact(judgement.value, inside.value,
      state.grace, runtime.value.getExecuteFrame(), state.origin, input.currentPosition);
    const nextOrigin = contact.origin ?? input.currentPosition;
    const next: SlideGestureState = Object.freeze({ index: current.sourceIndex, origin: nextOrigin, grace: contact.grace, cache: null });
    const direction = slideFlickDirection(afterNoteType);
    const movement = hasFlickMovement(runtime.value.geometry, nextOrigin, input.currentPosition, direction);
    if (movement.status !== "ok") return movement;
    let movementSucceeded = movement.value;
    if (movementSucceeded && (afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft ||
      afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight)) {
      const grouped = hasFlickMovement(runtime.value.geometry, nextOrigin, input.currentPosition, direction, width);
      if (grouped.status !== "ok") return grouped;
      movementSucceeded = grouped.value;
    }
    if (!movementSucceeded || !contact.ready || judgement.value.result === NoteResultType.None) return ok(pending(next));
    return this.reserveManualSlideNode(input, current, current.judgeNoteType,
      forcedPerfect ? NoteResultType.Perfect : judgement.value.result, JudgeTiming.None, false, origin, grace);
  }

  override commitManualTouchMoved(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
    afterUpdate = false,
  ): void {
    const continuations = (plan.familyData as { continuations?: readonly ManualNoteContinuationPlan[] }).continuations ?? [];
    for (const step of [plan, ...continuations]) {
      if ((step.familyData as { release?: boolean }).release) {
        this.commitManualTouchEnded(input, step, afterUpdate);
        continue;
      }
      if (step.judgementPlan !== null) {
        const current = this.manualCurrentNode;
        if (current !== undefined && current.sourceIndex >= 0) {
          this.advanceHeldTapLane(current);
          this.hideBeforeSlideNode(this.currentAfterIndexValue, false, afterUpdate);
        }
      }
      this.commitManualSlideNode(input, step, afterUpdate);
      if (this.isGeometryOnly) break;
    }
    this.enterTrailingGeometryIfFinished();
  }

  override preflightManualTouchEnded(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    if (this.isGeometryOnly) return ok({ judgementPlan: null, familyData: { geometryOnly: true } });
    const current = !this.manualHeadJudgedValue && this.headGestureNode !== null ? this.headGestureNode : this.afterNotesValue.find((after, index) =>
      index >= this.currentAfterIndexValue && !after.source.isInvisible && !after.judged);
    const root = this.noteInformation;
    const runtime = this.manualRuntime;
    if (current === undefined || root === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.slide-ended-owner-unavailable",
            "Slide Ended requires its current parent-owned node.",
          )
        : runtime;
    }
    // A release before the last node is onMiss with type 8, a gesture head or
    // intermediate node included; only the last node keeps its tail type.
    const noteType = current.isTerminal ? current.judgeNoteType : 8;
    let result: Exclude<NoteResultTypeValue, -1> = NoteResultType.Miss;
    let timing: JudgeTimingValue = JudgeTiming.None;
    // Gesture terminals share Ended's OffReserve even when an unflicked manual
    // release judges Miss; only nonterminal/outside endings take immediate Off.
    let reserveLaneOff = current.isTerminal && noteType !== 8;
    if (current.isTerminal && noteType === 8) {
      const inside = runtime.value.isInsideSource(
        input.currentPosition, current.source,
        current.source.buttonTypesArray, true,
      );
      if (inside.status !== "ok") return inside;
      reserveLaneOff = inside.value;
      if (inside.value) {
        const decision = runtime.value.judgeSlide(
          current.source,
        );
        if (decision.status !== "ok") return decision;
        result = decision.value.result === NoteResultType.None ? NoteResultType.Miss : decision.value.result;
        timing = decision.value.result === NoteResultType.Perfect || decision.value.correction <= 0
          ? JudgeTiming.None : JudgeTiming.Fast;
      }
    }
    // Flick movement already commits/deactivates a successful owner. An active
    // flick tail on real Ended has isFlicked=false. Its incoming timing is None:
    // the original bound Slide root clamps virtual Y to VirtualPerfectLine.
    return this.reserveManualSlideNode(
      input, current, noteType, result, timing, false, null, Math.fround(0), reserveLaneOff,
    );
  }

  override commitManualTouchEnded(
    input: ManualNoteTouchInput,
    plan: ManualNoteContinuationPlan,
    afterUpdate = false,
  ): void {
    const data = plan.familyData as { readonly currentIndex: number; readonly reserveLaneOff: boolean; readonly geometryOnly?: boolean };
    if (data.geometryOnly) return;
    this.replaceTapLaneTarget(this.afterNotesValue[this.currentAfterIndexValue]?.source ?? null);
    const laneTarget = this.laneEffectTarget;
    this.feedback.setSound("fade");
    this.hideBeforeSlideNode(data.currentIndex, true, afterUpdate);
    this.hideSlideNode(data.currentIndex, true, afterUpdate);
    this.commitManualSlideNode(input, plan, afterUpdate);
    this.skipManualInvisibleAfterNodes();
    this.tapLane(data.reserveLaneOff ? "off-reserve" : "off", laneTarget);
    this.setFingerId(-1);
    this.enterTrailingGeometryIfFinished();
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
    reserveLaneOff = false,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    if (current.source.isInvisible) return ok({ judgementPlan: null, familyData: {
      currentIndex: current.sourceIndex, advanceHidden: true, nextOrigin, nextGrace,
    } });
    const phase = current.sourceIndex === -1 ? "head" : current.isTerminal ? "tail" : "intermediate";
    const reserved = input.judgementTransaction.preflight({
      noteInformation: current.source,
      phase,
      noteType,
      rawResult,
      rawTiming,
      absolutePosition: current.source.absolutePos,
      // A non-end after node can only Miss through NoteSlide.onMiss.
      ...(phase === "intermediate" && rawResult === NoteResultType.Miss ? { damageDivisor: 5 as const } : {}),
    });
    return reserved.status === "ok"
      ? ok(Object.freeze({
          judgementPlan: reserved.value,
          familyData: Object.freeze({
            reserveLaneOff,
            stopFlash: rawResult === NoteResultType.Miss && !current.source.isInvisible,
            currentIndex: current.sourceIndex,
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
    afterUpdate = false,
  ): void {
    const data = plan.familyData as {
      readonly stopFlash: boolean;
      readonly advanceHidden?: boolean;
      readonly currentIndex: number;
      readonly markMultipleUsed: boolean;
      readonly nextOrigin: ManualInputPosition | null;
      readonly nextGrace: number;
      readonly gesture?: SlideGestureState;
    };
    this.manualTouchOriginValue = data.nextOrigin;
    this.manualAfterMoveTimeValue = data.nextGrace;
    if (data.gesture !== undefined) this.gestureStateValue = data.gesture;
    if (data.advanceHidden) {
      const current = this.afterNotesValue[data.currentIndex];
      if (data.currentIndex !== this.currentAfterIndexValue || current === undefined || !current.source.isInvisible)
        throw new Error("Slide hidden node changed after preflight");
      const completed = this.completeHiddenAfter(current, !afterUpdate);
      if (completed.status !== "ok") throw new Error("Slide hidden completion failed");
      return;
    }
    if (plan.judgementPlan === null) return;
    if (data.currentIndex === -1) {
      input.judgementTransaction.commit(plan.judgementPlan);
      this.manualHeadJudgedValue = true;
      this.closeGesturePresentation(-1);
      this.clearGestureState(-1);
      this.beginGestureStateIfCurrent(input.currentPosition);
      if (data.stopFlash) { this.feedback.hideFlash(); this.feedback.setSound("fade"); }
      return;
    }
    if (data.currentIndex < this.currentAfterIndexValue ||
      this.afterNotesValue.slice(this.currentAfterIndexValue, data.currentIndex)
        .some((after) => !after.source.isInvisible)) {
      throw new Error("Slide current cursor changed after preflight");
    }
    if (data.markMultipleUsed) {
      const used = this.slideAfterMultipleGroupValue?.markUsed();
      if (used?.status !== "ok") {
        throw new Error("Slide Multiple group changed after preflight");
      }
    }
    input.judgementTransaction.commit(plan.judgementPlan);
    if (data.stopFlash) this.feedback.hideFlash();
    while (this.currentAfterIndexValue < data.currentIndex) {
      this.afterNotesValue[this.currentAfterIndexValue]!.markJudged();
      this.currentAfterIndexValue += 1;
    }
    const current = this.afterNotesValue[this.currentAfterIndexValue];
    const marked = current?.markJudged();
    if (marked?.status !== "ok") {
      throw new Error("Slide current node changed after preflight");
    }
    // A judged gesture node stays on the line as a plain intermediate node.
    this.closeGesturePresentation(this.currentAfterIndexValue);
    this.clearGestureState(this.currentAfterIndexValue);
    this.currentAfterIndexValue += 1;
    this.beginGestureStateIfCurrent(input.currentPosition);
    if (current?.isTerminal) {
      const changed = this.changeState(NoteState.Deactive);
      if (changed.status !== "ok") {
        throw new Error("Slide completion could not deactivate parent");
      }
    }
  }

  protected override moveState(_deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.noteInformation?.isInvisible) {
      // A Hidden head has no judgement; it only stops on the original head timing.
      const auto = this.autoLiveRuntime;
      if (auto.status !== "ok") return auto;
      if (!this.allHiddenValue && auto.value.shouldForcePerfect()) {
        if (auto.value.getAdjustedMusicPosition() < this.noteInformation.absolutePos) return ok(undefined);
      } else {
        const manual = this.manualRuntime;
        if (manual.status !== "ok") return manual;
        const stopped = manual.value.stopSlideHeadAtJudgeLine();
        if (stopped.status !== "ok" || !stopped.value) return stopped.status !== "ok" ? stopped : ok(undefined);
      }
      if (!this.allHiddenValue) this.manualHeadJudgedValue = true;
      return this.changeState(NoteState.Stop);
    }
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return integrityFailure(
        "auto-live.slide-without-note-information",
        "Slide MoveState requires an activated root and Auto Live runtime.",
      );
    }
    if (!runtime.value.shouldForcePerfect()) {
      const manual = this.manualRuntime;
      if (manual.status !== "ok") return manual;
      const stopped = manual.value.stopSlideHeadAtJudgeLine();
      if (stopped.status !== "ok") return stopped;
      return stopped.value ? this.changeState(NoteState.Wait) : ok(undefined);
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return integrityFailure(
        "auto-live.non-finite-adjusted-position",
        "Slide Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < noteInformation.absolutePos) {
      return ok(undefined);
    }
    const changed = this.changeState(NoteState.Wait);
    if (changed.status !== "ok") {
      return changed;
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation,
      phase: "head",
      noteType: slideFlickJudgeNoteType(slideGestureAfterType(this.noteInformation!)),
      absolutePosition: noteInformation.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    });
    if (submitted.status === "ok") {
      // A gesture head pulses the lanes like any Slide head.
      this.pulseAutoFrontTapLane(this.effectButtonLane(noteInformation));
      this.laneEffectTarget = this.targetButtonLane(noteInformation);
      // forcePerfectMoveState invokes Began, which advances currentNote, then pulses that target.
      this.pulseTapLane(this.targetButtonLane(this.afterNotesValue[0]?.source ?? noteInformation));
      const manual = this.manualRuntime;
      if (manual.status !== "ok") return manual;
      const origin = manual.value.geometry.getTargetCenterScreenPosition?.(noteInformation);
      if (origin?.status !== "ok") return origin ?? integrityFailure("auto-live.slide-target-center-unavailable",
        "Force Perfect Began requires the root target center in input coordinates.");
      this.manualTouchOriginValue = origin.value;
      this.manualHeadJudgedValue = true;
      this.closeGesturePresentation(-1);
      this.feedback.restartFlash();
      this.feedback.setSound("start");
      return this.changeState(NoteState.Stop);
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
            "Slide Wait timeout requires its root and pending-node graph.",
          )
        : autoRuntime;
    }
    if (autoRuntime.value.shouldForcePerfect()) {
      return ok(undefined);
    }
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") {
      return runtime;
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (runtime.value.usesFoldedTime && adjusted < information.absolutePos) return ok(undefined);
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
    if (!slideHeadTimeoutDue(frontOver.value, adjusted, information.absolutePos, nextVisible?.source.absolutePos)) {
      return ok(undefined);
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation: information,
      phase: "head",
      // Slide Miss and timeout use type 8 for every flick family.
      noteType: 8,
      rawResult: NoteResultType.Miss,
      rawTiming: JudgeTiming.None,
      absolutePosition: information.absolutePos,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    this.manualHeadJudgedValue = true;
    this.clearGestureState(-1);
    if (isSlideGestureNode(information)) { this.feedback.hideFlash(); this.feedback.setSound("fade"); }
    this.hideSlideNode(-1, true);
    this.skipManualInvisibleAfterNodes();
    return this.currentAfterIndexValue >= this.afterNotesValue.length
      ? this.changeState(NoteState.Deactive)
      : this.changeState(NoteState.Stop);
  }

  protected override stopState(_deltaTimeSeconds: number): SimulatorResult<void> {
    // Leading Hidden nodes are consumed by geometry time before the first visible node.
    if (this.isGeometryOnly || this.hiddenHeadNode !== null &&
        this.currentAfterIndexValue < this.firstVisibleAfterIndexValue) return ok(undefined);
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return integrityFailure(
        "auto-live.slide-stop-runtime-unavailable",
        "Slide StopState requires the activated parent-owned after graph.",
      );
    }
    if (!runtime.value.shouldForcePerfect()) {
      return ok(undefined);
    }
    // Folded targets must follow the connection cursor. The after-update path
    // drains due nodes in order instead of scoring a later visible node early.
    if (this.noteInformation?.foldedTiming === true) return ok(undefined);
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
        "Slide Stop Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < selected.source.absolutePos) {
      return ok(undefined);
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation: selected.source,
      phase: selected.isTerminal ? "tail" : "intermediate",
      noteType: selected.judgeNoteType,
      absolutePosition: selected.source.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    this.reflectAutoAfterTapLane(selected);
    const marked = selected.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    this.hideBeforeSlideNode(selected.sourceIndex, false);
    this.closeGesturePresentation(selected.sourceIndex);
    return selected.isTerminal ? this.changeState(NoteState.Deactive) : ok(undefined);
  }

  protected override onUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    const runtime = this.autoLiveRuntime;
    if (runtime.status !== "ok") return runtime;
    if (this.isGeometryOnly) {
      const manual = this.manualRuntime;
      if (manual.status !== "ok") return manual;
      const tailIndex = this.afterNotesValue.length - 1;
      const phase = manual.value.getSlideChildPhase(tailIndex);
      if (phase.status !== "ok") return phase;
      // Geometry completion only: no judge, timeout, result, or synthetic input.
      return phase.value === "stop" && runtime.value.getAdjustedMusicPosition() >= this.afterNotesValue[tailIndex]!.source.absolutePos
        ? this.changeState(NoteState.Deactive) : ok(undefined);
    }
    if (!this.manualHeadJudgedValue && this.headGestureNode !== null && this.state === NoteState.Stop) {
      const timed = this.waitState(_deltaTimeSeconds);
      if (timed.status !== "ok" || !this.manualHeadJudgedValue) return timed;
    }
    const leading = this.advanceLeadingHiddenNodes();
    if (leading.status !== "ok") return leading;
    if (this.manualHeadJudgedValue) {
      for (const after of this.afterNotesValue) {
        if (this.state === NoteState.Deactive || this.isGeometryOnly) break;
        after.stopAdjustmentWaited = false;
        const timeout = this.executeManualSlideAfterTimeout(after,
          !runtime.value.shouldForcePerfect() && !after.source.isInvisible);
        if (timeout.status !== "ok") return timeout;
        this.enterTrailingGeometryIfFinished();
      }
      if (this.state === NoteState.Deactive) return ok(undefined);
    }
    this.enterTrailingGeometryIfFinished();
    return ok(undefined);
  }

  /** NoteSlide.OnUpdate runs forcePerfectOnUpdate after every child ExecuteUpdate. */
  executeAfterChildrenUpdate(): SimulatorResult<void> {
    if (this.state === NoteState.Deactive || this.isGeometryOnly) return ok(undefined);
    // A folded successor can already be due while its head is still travelling.
    // It remains owned by the head, just like every later connection.
    if (!this.manualHeadJudgedValue) return ok(undefined);
    if (this.noteInformation?.foldedTiming !== true) {
      const advanced = this.forcePerfectPendingAfter();
      if (advanced.status === "ok") this.enterTrailingGeometryIfFinished();
      return advanced;
    }
    // A fold can make hundreds of hidden successors due together. Advance the
    // existing state machine until its cursor stops, without adding frame delay.
    while ((this.state as NoteState) !== NoteState.Deactive && !this.isGeometryOnly) {
      const before = this.currentAfterIndexValue;
      const advanced = this.forcePerfectPendingAfter();
      if (advanced.status !== "ok") return advanced;
      this.enterTrailingGeometryIfFinished();
      if (this.currentAfterIndexValue === before) break;
    }
    return ok(undefined);
  }

  private executeManualSlideAfterTimeout(current: SlideAfterRuntime, canJudge: boolean): SimulatorResult<void> {
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") {
      return runtime;
    }
    if (runtime.value.usesFoldedTime && this.afterNotesValue.some(after =>
      after.sourceIndex < current.sourceIndex && !after.judged && !after.source.isInvisible)) return ok(undefined);
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return integrityFailure(
        "manual.slide-timeout-non-finite-adjusted-position",
        "Slide current timeout requires a finite adjusted position.",
      );
    }
    if (runtime.value.usesFoldedTime && adjusted < current.source.absolutePos) return ok(undefined);
    const phase = runtime.value.getSlideChildPhase(current.sourceIndex);
    if (phase.status !== "ok") return phase;
    if (phase.value !== "stop") return ok(undefined);
    const nextVisible = this.afterNotesValue.find((after) =>
      after.sourceIndex > current.sourceIndex && !after.source.isInvisible);
    const adjustment = runtime.value.getJudgementAdjustValueB();
    const stopWait = advanceSlideStopWait(current.stopAdjustmentCounter, nextVisible !== undefined, adjustment);
    if (stopWait.waited) {
      current.stopAdjustmentCounter = stopWait.counter;
      current.stopAdjustmentWaited = true;
      return ok(undefined);
    }
    if (current.judged || !canJudge) return ok(undefined);
    if (current.isTerminal && this.noteInformation!.afterNoteType === AfterNoteType.SlideFlickEnd) {
      current.timeoutFrameCounter = Math.fround(current.timeoutFrameCounter + runtime.value.getExecuteFrame());
      if (current.timeoutFrameCounter < 7) return ok(undefined);
    } else {
      const over = isManualTimeoutOver(current.source.absolutePos, adjusted, runtime.value.getCurrentBpm());
      if (over.status !== "ok") return over;
      let nextStopped = false;
      if (nextVisible !== undefined) {
        const nextPhase = runtime.value.getSlideChildPhase(nextVisible.sourceIndex);
        if (nextPhase.status !== "ok") return nextPhase;
        nextStopped = nextPhase.value === "stop";
      }
      if (!slideAfterTimeoutDue(over.value, adjusted, current.source.absolutePos,
        nextVisible?.source.absolutePos, nextStopped)) return ok(undefined);
    }
    const scoringPhase = current.sourceIndex === -1 ? "head" : current.isTerminal ? "tail" : "intermediate";
    const submitted = runtime.value.submitJudgement({
      noteInformation: current.source,
      phase: scoringPhase,
      noteType: 8,
      rawResult: NoteResultType.Miss,
      rawTiming: JudgeTiming.None,
      absolutePosition: current.source.absolutePos,
      // NoteSlide.onMiss divides damage by five for a non-end after node.
      ...(scoringPhase === "intermediate" ? { damageDivisor: 5 as const } : {}),
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    const marked = current.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    this.hideSlideNode(-1, true);
    this.hideSlideNode(current.sourceIndex, true);
    this.clearGestureState(current.sourceIndex);
    if (!current.source.isInvisible) {
      this.feedback.hideFlash();
      this.feedback.setSound("fade");
    }
    this.currentAfterIndexValue = current.sourceIndex + 1;
    this.skipManualInvisibleAfterNodes();
    return current.isTerminal || this.currentAfterIndexValue >= this.afterNotesValue.length
      ? this.changeState(NoteState.Deactive)
      : ok(undefined);
  }

  private skipManualInvisibleAfterNodes(
    adjustedMusicPosition?: number,
  ): void {
    while (true) {
      // Leading and trailing Hidden nodes only follow geometry time.
      if (this.hiddenEndpoints && (this.currentAfterIndexValue < this.firstVisibleAfterIndexValue ||
        this.currentAfterIndexValue > this.lastVisibleAfterIndexValue)) return;
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
      this.hideSlideNode(this.currentAfterIndexValue, true);
      this.currentAfterIndexValue += 1;
    }
  }

  private completeHiddenAfter(current: SlideAfterRuntime, hideBefore = true): SimulatorResult<void> {
    const marked = current.markJudged();
    if (marked.status !== "ok") return marked;
    if (hideBefore) this.hideBeforeSlideNode(current.sourceIndex, false);
    this.currentAfterIndexValue += 1;
    return current.isTerminal ? this.changeState(NoteState.Deactive) : ok(undefined);
  }

  /** Hidden nodes before the first visible node only follow geometry time. */
  private advanceLeadingHiddenNodes(): SimulatorResult<void> {
    if (this.hiddenHeadNode === null || !this.manualHeadJudgedValue) return ok(undefined);
    const runtime = this.autoLiveRuntime;
    if (runtime.status !== "ok") return runtime;
    const adjusted = runtime.value.getAdjustedMusicPosition();
    while (this.currentAfterIndexValue < this.firstVisibleAfterIndexValue) {
      const current = this.afterNotesValue[this.currentAfterIndexValue]!;
      if (current.judged) { this.currentAfterIndexValue += 1; continue; }
      if (adjusted < current.source.absolutePos) break;
      const completed = this.completeHiddenAfter(current);
      if (completed.status !== "ok") return completed;
    }
    return ok(undefined);
  }

  /** Tail handling after the last visible node of a Hidden tail: release the
   * finger, stop feedback and keep only the remaining hidden geometry. */
  private enterTrailingGeometryIfFinished(): void {
    if (this.trailingGeometryValue || this.state === NoteState.Deactive || !this.visibleRangeFinished) return;
    this.trailingGeometryValue = true;
    this.feedback.setSound("fade");
    this.feedback.hideFlash();
    this.tapLane("off-reserve", this.laneEffectTarget);
    this.laneEffectTarget = null;
    this.gestureStateValue = null;
    this.manualTouchOriginValue = null;
    this.setFingerId(-1);
    this.onManualOwnershipReleased?.(this);
  }

  /** Head handling for the first visible node of a Hidden head. Any touch,
   * including one already owned by another Slide, may register; the node itself
   * keeps the intermediate held-node judgement. */
  preflightHiddenHeadRegistration(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan | null> {
    const first = this.hiddenHeadNode;
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") return runtime;
    if (first === null || !this.awaitsHiddenHeadRegistration) return ok(null);
    const inside = runtime.value.isInsideSource(input.currentPosition, first.source, first.source.buttonTypesArray);
    if (inside.status !== "ok") return inside;
    if (!inside.value) return ok(null);
    const decision = runtime.value.judgeSlide(first.source);
    if (decision.status !== "ok") return decision;
    if (first.judgeNoteType !== 8) {
      // Gesture nodes bind on contact and judge on the following movement. The
      // registration takes any held touch like a plain node's (which ignores the
      // touch's own grade), so it starts the gesture's own state without a cache.
      if (decision.value.result === NoteResultType.None) return ok(null);
      const unbound = this.noManualSlideJudgementPlan(input.currentPosition, Math.fround(0));
      if (!first.isGesture) return ok(unbound);
      const gesture = Object.freeze({ index: first.sourceIndex, origin: input.currentPosition, grace: Math.fround(0), cache: null });
      return ok(Object.freeze({ ...unbound, familyData: Object.freeze({ ...unbound.familyData as object, gesture }) }));
    }
    const result = slideHeldNodeResult(decision.value, runtime.value.getJudgementAdjustValueB());
    if (result === NoteResultType.None) return ok(null);
    return this.reserveManualSlideNode(input, first, 8, result, JudgeTiming.None, false,
      input.currentPosition, Math.fround(0));
  }

  commitHiddenHeadRegistration(input: ManualNoteTouchInput, plan: ManualNoteContinuationPlan): void {
    const first = this.hiddenHeadNode;
    if (first === null || !this.awaitsHiddenHeadRegistration) throw new Error("Slide hidden head changed after preflight");
    this.setFingerId(input.fingerId);
    this.laneEffectTarget = this.targetButtonLane(first.source);
    // A Began touch already reports its own button-on event.
    if (input.phase !== ManualTouchPhase.Began) this.tapLane("on", this.laneEffectTarget);
    this.manualHeadJudgedValue = true;
    // Registration consumes the leading geometry-only nodes.
    while (this.currentAfterIndexValue < first.sourceIndex) {
      const leading = this.afterNotesValue[this.currentAfterIndexValue]!;
      if (leading.judged) { this.currentAfterIndexValue += 1; continue; }
      const completed = this.completeHiddenAfter(leading, false);
      if (completed.status !== "ok") throw new Error("Slide hidden head could not consume leading geometry");
    }
    if (this.state !== NoteState.Stop) {
      const changed = this.changeState(NoteState.Stop);
      if (changed.status !== "ok") throw new Error("Slide hidden head could not enter Stop state");
    }
    this.feedback.restartFlash();
    this.feedback.setSound("start");
    const data = plan.familyData as { readonly nextOrigin: ManualInputPosition | null; readonly nextGrace: number };
    if (plan.judgementPlan === null) {
      this.manualTouchOriginValue = data.nextOrigin;
      this.manualAfterMoveTimeValue = data.nextGrace;
      const gesture = (plan.familyData as { readonly gesture?: SlideGestureState }).gesture;
      this.gestureStateValue = gesture ?? null;
      return;
    }
    this.hideBeforeSlideNode(first.sourceIndex, false);
    this.commitManualSlideNode(input, plan);
    this.enterTrailingGeometryIfFinished();
  }

  private forcePerfectPendingAfter(): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    if (noteInformation === null || runtime.status !== "ok") {
      return integrityFailure(
        "auto-live.slide-runtime-graph-unavailable",
        "Slide pending-node Force Perfect requires the parent-owned runtime graph.",
      );
    }
    if (!runtime.value.shouldForcePerfect()) {
      return ok(undefined);
    }
    const current = this.afterNotesValue[this.currentAfterIndexValue];
    if (current === undefined) {
      return integrityFailure(
        "auto-live.slide-current-after-missing",
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
        "Slide after Force Perfect requires a finite adjusted position.",
      );
    }
    if (adjusted < current.source.absolutePos) {
      return ok(undefined);
    }
    if (!current.isTerminal && !current.isGesture) {
      if (current === this.hiddenHeadNode) this.beginAutoHiddenHead(current);
      const manual = this.manualRuntime;
      if (manual.status !== "ok") return manual;
      const position = manual.value.geometry.getTargetCenterScreenPosition?.(current.source);
      if (position === undefined) return integrityFailure("auto-live.slide-target-center-unavailable",
        "Force Perfect Moved requires the current source target center in input coordinates.");
      if (position.status !== "ok") return position;
      const transaction = manual.value.beginJudgementTransaction();
      const input: ManualNoteTouchInput = { fingerId: this.fingerId, phase: ManualTouchPhase.Moved,
        deltaTimeSeconds: null, beganPosition: { x: 0, y: 0 }, currentPosition: position.value,
        judgementTransaction: transaction };
      const planned = this.preflightManualTouchMoved(input);
      if (planned.status !== "ok") { transaction.abort(); return planned; }
      this.commitManualTouchMoved(input, planned.value, true);
      transaction.finish();
      return ok(undefined);
    }
    if (current.source.isInvisible) return this.completeHiddenAfter(current, false);
    const phase = current.isTerminal ? "tail" : "intermediate";
    let noteType = current.judgeNoteType;
    if (current.isTerminal) {
      if (
        current.terminalJudgeNoteType === null ||
        current.terminalJudgeNoteType !== this.terminalJudgeNoteTypeValue
      ) {
        return integrityFailure(
          "auto-live.invalid-slide-terminal-graph",
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
    this.reflectAutoAfterTapLane(current);
    const marked = current.markJudged();
    if (marked.status !== "ok") {
      return marked;
    }
    this.hideBeforeSlideNode(this.currentAfterIndexValue, false, true);
    this.closeGesturePresentation(current.sourceIndex);
    this.currentAfterIndexValue += 1;
    return current.isTerminal
      ? this.changeState(NoteState.Deactive)
      : ok(undefined);
  }

  protected override onResetForDispose(): void {
    this.feedback.hideFlash();
    this.allHiddenValue = false;
    this.firstVisibleAfterIndexValue = -1;
    this.lastVisibleAfterIndexValue = -1;
    this.trailingGeometryValue = false;
    this.headGestureNode = null;
    this.afterNotesValue = [];
    this.beganPlacementPending = false;
    this.pendingSpriteHides.clear();
    this.pendingGestureCloseIndices.clear();
    this.currentAfterIndexValue = 0;
    this.laneEffectTarget = null;
    this.manualHeadJudgedValue = false;
    this.slideAfterMultipleGroupValue = null;
    this.gestureStateValue = null;
    this.manualTouchOriginValue = null;
    this.manualAfterMoveTimeValue = Math.fround(0);
    this.terminalJudgeNoteTypeValue = null;
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
    this.feedback.hideFlash();
    // Sound belongs to the Slide root, not the child being consumed.
    this.feedback.setSound("fade");
    for (const after of this.afterNotesValue) {
      after.resetForParentDeactivation();
    }
    this.trailingGeometryValue = false;
    this.headGestureNode = null;
    this.afterNotesValue = [];
    this.beganPlacementPending = false;
    this.pendingSpriteHides.clear();
    this.pendingGestureCloseIndices.clear();
    this.currentAfterIndexValue = 0;
    this.laneEffectTarget = null;
    this.manualHeadJudgedValue = false;
    this.slideAfterMultipleGroupValue = null;
    this.gestureStateValue = null;
    this.manualTouchOriginValue = null;
    this.manualAfterMoveTimeValue = Math.fround(0);
    this.terminalJudgeNoteTypeValue = null;
  }
}

export abstract class NoteFlickBase extends NoteSingleBase {
  private frameCounterValue = Math.fround(0);
  private cachedJudgementValue: ManualNoteJudgement | null = null;

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
            "Flick Began requires its activated NoteInformation owner.",
          )
        : runtime;
    }
    const judgement = judgeManualNote(
      0,
      information.absolutePos,
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

  protected override waitState(_deltaTimeSeconds: number): SimulatorResult<void> {
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") return runtime;
    const executeFrame = runtime.value.getExecuteFrame();
    const nextFrameCounter = Math.fround(this.frameCounterValue + executeFrame);
    this.frameCounterValue = nextFrameCounter;
    if (nextFrameCounter < Math.fround(7)) return ok(undefined);
    // NoteFlickBase.WaitState tail-calls vtable +0x2B8 (onMiss), the slot
    // NoteSingleBase.MoveState uses for its timeout; forcePerfect is +0x2C8.
    const information = this.noteInformation;
    return information === null
      ? integrityFailure(
          "manual.flick-wait-without-source",
          "An unflicked Flick Wait expiry requires its activated source owner.",
        )
      : this.onTimeoutMiss(information);
  }

  protected override forcePerfect(): SimulatorResult<void> {
    const synthetic = this.forcePerfectSyntheticX;
    if (synthetic.status !== "ok") {
      return synthetic;
    }
    const autoRuntime = this.autoLiveRuntime;
    if (autoRuntime.status !== "ok") {
      return autoRuntime;
    }
    // Only Auto Live / mode 14 reach forcePerfect (NoteSingleBase.MoveState +0x2C8).
    return autoRuntime.value.shouldForcePerfect()
      ? this.submitHeadPerfect(this.forcePerfectJudgeNoteType)
      : integrityFailure(
          "manual.flick-force-perfect-outside-auto",
          "Flick forcePerfect is the Auto Live route; an unflicked manual Wait expiry calls onMiss.",
        );
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
    const movement = hasFlickMovement(runtime.value.geometry, input.beganPosition, input.currentPosition,
      null, 1);
    if (movement.status !== "ok") return movement;
    return movement.value ? this.reserveSuccessfulManualMove(input)
      : ok(Object.freeze({ judgementPlan: null, familyData: Object.freeze({ complete: false }) }));
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
            "Directional movement requires its activated source owner.",
          )
        : runtime;
    }
    const movement = hasFlickMovement(runtime.value.geometry, input.beganPosition, input.currentPosition,
      information.gameNoteType === GameNoteType.DirectionalFlickLeft ? "Left" : "Right", 1);
    if (movement.status !== "ok") return movement;
    return movement.value ? this.reserveSuccessfulManualMove(input)
      : ok(Object.freeze({ judgementPlan: null, familyData: Object.freeze({ complete: false }) }));
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

  registerMultipleDirectionalGroupResolver(
    resolver: (
      information: NoteInformation,
    ) => SimulatorResult<MultipleDirectionalRuntimeGroup>,
  ): void {
    this.groupResolverValue = resolver;
  }

  protected override acceptsFrontNoteType(frontNoteType: number): boolean {
    return frontNoteType === FrontNoteType.MultipleDirectionalFlick;
  }

  protected override get forcePerfectJudgeNoteType(): number {
    return 10;
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
            "Multiple Directional movement requires its activated source and registered group owner.",
          )
        : runtime;
    }
    const noJudgement = ok(Object.freeze({ judgementPlan: null, familyData: Object.freeze({ complete: false }) }));
    // Touches run in order; a side note whose group was judged earlier no longer judges.
    if (group.isUsed) return noJudgement;
    const movement = hasFlickMovement(runtime.value.geometry, input.beganPosition, input.currentPosition,
      information.gameNoteType === GameNoteType.DirectionalFlickLeft ? "Left" : "Right", group.count);
    if (movement.status !== "ok") return movement;
    return movement.value && group.reserveUse(input.judgementTransaction)
      ? this.reserveSuccessfulManualMove(input, group.count) : noJudgement;
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
    return ok(undefined);
  }

  protected override moveState(deltaTimeSeconds: number): SimulatorResult<void> {
    const group = this.groupValue;
    if (group?.isUsed) {
      return this.changeState(NoteState.Deactive);
    }
    return super.moveState(deltaTimeSeconds);
  }

  /** Move/WaitState deactivate a side note once its group has been judged. */
  protected override waitState(deltaTimeSeconds: number): SimulatorResult<void> {
    const group = this.groupValue;
    if (group?.isUsed) {
      return this.changeState(NoteState.Deactive);
    }
    return super.waitState(deltaTimeSeconds);
  }

  /** NoteMultipleDirectionalFlick.onMiss judges the connected group once. */
  protected override onTimeoutMiss(noteInformation: NoteInformation): SimulatorResult<void> {
    const group = this.groupValue;
    if (group === null) {
      return integrityFailure(
        "manual.multiple-directional-runtime-unavailable",
        "Multiple Directional timeout requires its registered group owner.",
      );
    }
    if (group.isUsed) {
      return this.changeState(NoteState.Deactive);
    }
    const used = group.markUsed();
    return used.status === "ok" ? super.onTimeoutMiss(noteInformation) : used;
  }

  protected override forcePerfect(): SimulatorResult<void> {
    const noteInformation = this.noteInformation;
    const runtime = this.autoLiveRuntime;
    const group = this.groupValue;
    if (noteInformation === null || runtime.status !== "ok" || group === null) {
      return integrityFailure(
        "multiple-directional-runtime-unavailable",
        "Multiple Directional Force Perfect requires its activated adjacent-button runtime group.",
      );
    }
    if (group.isUsed) {
      return this.changeState(NoteState.Deactive);
    }
    const synthetic = this.forcePerfectSyntheticX;
    if (synthetic.status !== "ok") {
      return synthetic;
    }
    if (runtime.value.shouldForcePerfect()) {
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
      const bounds = group.members.map(member => member.laneSpan ?? {
        start: Math.min(...member.buttonTypesArray), end: Math.max(...member.buttonTypesArray),
      });
      this.pulseAutoFrontTapLane(noteInformation.gameNoteType === GameNoteType.DirectionalFlickLeft
        ? Math.max(...bounds.map(span => span.end)) : Math.min(...bounds.map(span => span.start)));
      const used = group.markUsed();
      if (used.status !== "ok") {
        return used;
      }
    } else {
      return integrityFailure(
        "manual.multiple-directional-force-perfect-outside-auto",
        "Multiple Directional forcePerfect is the Auto Live route; an unflicked manual Wait expiry calls onMiss.",
      );
    }
    return this.changeState(NoteState.Deactive);
  }

  override snapshot() {
    return {
      ...super.snapshot(),
      multipleDirectionalGroupCount: this.groupValue?.count ?? null,
      multipleDirectionalGroupUsed: this.groupValue?.isUsed ?? null,
    };
  }

  protected override onDeactivated(): void {
    super.onDeactivated();
    this.groupValue = null;
  }

  protected override onResetForDispose(): void {
    super.onResetForDispose();
    this.groupValue = null;
  }
}

export class NoteMultipleDirectionalVisual extends NoteFrontBase {
  private resolvePresentationState: (() => NoteState) | null = null;

  registerPresentationLifecycle(resolveState: () => NoteState): void {
    this.resolvePresentationState = resolveState;
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
    return this.updatePresentationState();
  }

  protected override waitState(_deltaTimeSeconds: number): SimulatorResult<void> {
    return ok(undefined);
  }

  protected override stopState(_deltaTimeSeconds: number): SimulatorResult<void> {
    return ok(undefined);
  }

  updatePresentationState(): SimulatorResult<void> {
    if (this.resolvePresentationState === null) return integrityFailure(
      "note.multiple-directional-visual-owner-unregistered",
      "SetupNotes must register the connected tail lifecycle for AddLong/AddSlide visuals.",
    );
    return this.changeState(this.resolvePresentationState());
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
  stopAdjustmentCounter = 0;
  stopAdjustmentWaited = false;
  timeoutFrameCounter = 0;

  constructor(
    readonly source: NoteInformation,
    readonly sourceIndex: number,
    readonly isTerminal: boolean,
    readonly terminalJudgeNoteType: 5 | 6 | 7 | 8 | null,
  ) {}

  /** Extension (src/chart/README.md, Slide gesture nodes): a non-last node with an original flick-tail family. */
  get gestureAfterType(): AfterNoteTypeValue {
    return this.isTerminal ? AfterNoteType.None : slideGestureAfterType(this.source);
  }

  get isGesture(): boolean { return this.gestureAfterType !== AfterNoteType.None; }

  get judgeNoteType(): number {
    return this.isTerminal ? this.terminalJudgeNoteType ?? 8 : slideFlickJudgeNoteType(this.gestureAfterType);
  }

  get judged(): boolean {
    return this.judgedValue;
  }

  markJudged(): SimulatorResult<void> {
    if (this.judgedValue) {
      return integrityFailure(
        "auto-live.slide-after-already-judged",
        `Slide after node ${this.sourceIndex} cannot produce a second Auto Live result.`,
      );
    }
    this.judgedValue = true;
    return ok(undefined);
  }

  resetForParentDeactivation(): void {
    this.judgedValue = false;
    this.stopAdjustmentCounter = 0;
    this.stopAdjustmentWaited = false;
    this.timeoutFrameCounter = 0;
  }
}

export function validateAutoLiveActivationGraph(
  noteInformation: NoteInformation,
): SimulatorResult<void> {
  if (noteInformation.isInvisible && !noteInformation.hiddenSlideEndpoints) {
    return integrityFailure(
      "auto-live.invalid-playable-root-identity",
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
      !isFinitePosition(noteInformation.absolutePos) ||
      !isLongAfterType(noteInformation.afterNoteType) ||
      !isFinitePosition(noteInformation.afterNoteAbsolutePos) ||
      noteInformation.afterNoteAbsolutePos <= noteInformation.absolutePos
    ) {
      return integrityFailure(
        "auto-live.invalid-long-after-graph",
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
      !isFinitePosition(noteInformation.absolutePos) ||
      !noteInformation.isSlideNoteHead ||
      noteInformation.slideNoteList.length === 0
    ) {
      return integrityFailure(
        "auto-live.invalid-slide-after-graph",
        `Slide root ${noteInformation.index} has no confirmed after-node list.`,
      );
    }
    const terminalSource = noteInformation.slideNoteList[
      noteInformation.slideNoteList.length - 1
    ];
    if (terminalSource === undefined) {
      return integrityFailure(
        "auto-live.invalid-slide-after-graph",
        `Slide root ${noteInformation.index} has no terminal source node.`,
      );
    }
    if (terminalSource.isInvisible && !noteInformation.hiddenSlideEndpoints) {
      return integrityFailure(
        "auto-live.invalid-slide-terminal-graph",
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
    for (let index = 0; index < noteInformation.slideNoteList.length; index += 1) {
      const source = noteInformation.slideNoteList[index];
      if (source === undefined) {
        return integrityFailure(
          "auto-live.duplicate-or-missing-slide-node",
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
        !isFinitePosition(source.absolutePos)
      ) {
        return integrityFailure(
          "auto-live.duplicate-or-missing-slide-node",
          `Slide root ${noteInformation.index} contains an invalid shared after-node identity.`,
        );
      }
      seen.add(source);
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
      if (information.buttonType === ButtonType.None && information.laneSpan === undefined) {
        continue;
      }
      if (playableRoots.has(information)) {
        return integrityFailure(
          "auto-live.duplicate-runtime-note-identity",
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
  if (hasContinuousNoteGeometry(noteInformation) && Number.isInteger(noteInformation.index) &&
    noteInformation.index >= 0 && noteInformation.index <= 0x7fffffff) return ok(undefined);
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
      valid = (noteInformation.gameNoteType === GameNoteType.LongAddDirectionFlick &&
        noteInformation.afterNoteType === AfterNoteType.None) ||
        (noteInformation.gameNoteType === GameNoteType.LongDirectionalFlickLeftAdd &&
          noteInformation.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft) ||
        (noteInformation.gameNoteType === GameNoteType.LongDirectionalFlickRightAdd &&
          noteInformation.afterNoteType === AfterNoteType.MultipleDirectionalFlickRight);
      break;
    case FrontNoteType.SlideAMultipleDirectionalFlickAdd:
    case FrontNoteType.SlideBMultipleDirectionalFlickAdd:
      valid = (noteInformation.gameNoteType === GameNoteType.SlideAddDirectionalFlick &&
        noteInformation.afterNoteType === AfterNoteType.None) ||
        (noteInformation.gameNoteType === (noteInformation.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd
          ? GameNoteType.SlideADirectionalFlickLeftAdd : GameNoteType.SlideBDirectionalFlickLeftAdd) &&
          noteInformation.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft) ||
        (noteInformation.gameNoteType === (noteInformation.fireNoteType === FrontNoteType.SlideAMultipleDirectionalFlickAdd
          ? GameNoteType.SlideADirectionalFlickRightAdd : GameNoteType.SlideBDirectionalFlickRightAdd) &&
          noteInformation.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight);
      break;
    default:
      return integrityFailure(
        "auto-live.invalid-note-family-shape",
        `Playable root ${noteInformation.index} has an unconfirmed front family ${noteInformation.fireNoteType}.`,
      );
  }
  return valid
    ? ok(undefined)
    : integrityFailure(
        "auto-live.invalid-note-family-shape",
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
        source.gameNoteType === root.gameNoteType ||
        // Gesture intermediate (extension): the root family's original Slide end kinds.
        source.fireNoteType === FrontNoteType.None &&
        slideEndGameFamily(source.gameNoteType) === (root.fireNoteType === FrontNoteType.SlideA ? "A" : "B"));
  return validRole
    ? ok(undefined)
    : integrityFailure(
        "auto-live.invalid-slide-child-role",
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
        `Pool object ${poolObjectId} cannot bind front family ${noteInformation.fireNoteType}.`,
      );
}

function isFinitePosition(value: number): boolean {
  return Number.isFinite(value) &&
    value >= -0x80000000 &&
    value <= 0x7fffffff;
}

// Reverse 10.1.4: forcePerfectOnUpdate (0x30EA8E4) finishes through
// ExecTouchEnded (0x30EB854) into judgeAfterNote (0x30EB8D0), which emits
// 2/5/6/7 for Normal/Flick/Directional. Tail
// judgement kinds must retain Long-end semantics for audio and TapKeep cleanup.
function longAfterJudgeNoteType(
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
    `Slide terminal mapping is not confirmed (afterNoteType=${afterNoteType}, terminalGameNoteType=${terminalGameNoteType}).`,
  );
}
