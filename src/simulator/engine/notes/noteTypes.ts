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
        "Long tail reservation requires its root and parent-owned after source.",
      );
    }
    const noteType = longAfterJudgeNoteType(after.afterNoteType);
    if (noteType === null) {
      return integrityFailure(
        "manual.long-after-type-unrepresented",
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
    const noteType = longAfterJudgeNoteType(after.afterNoteType);
    if (noteType === null) {
      return integrityFailure(
        "manual.long-timeout-after-type-unrepresented",
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

export class NoteSlide extends NoteFrontBase {
  onTouchKeepSound: ((noteIndex: number, action: "start" | "fade") => void) | null = null;
  private readonly feedback = new SlideFeedbackState(action => {
    if (this.noteInformation !== null) this.onTouchKeepSound?.(this.noteInformation.index, action);
  });
  get flashAnimationRevision(): number | null { return this.feedback.revision; }
  private readonly pendingSpriteHides = new Map<number, SlideNodeHideRequest>();
  private beganPlacementPending = false;
  private headGestureNode: SlideAfterRuntime | null = null;
  get headJudged(): boolean { return this.manualHeadJudgedValue; }
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
    // ExecTouchMoved's beam branch is for visible intermediate nodes only.
    if (current.isTerminal || current.source.isInvisible || current.source.slideGesture) return;
    this.replaceTapLaneTarget(current.source);
    this.tapLane("off-reserve", this.laneEffectTarget);
  }

  private reflectAutoAfterTapLane(current: SlideAfterRuntime): void {
    if (this.hiddenEndpoints && this.noteInformation?.isInvisible &&
        current.sourceIndex === this.firstVisibleAfterIndexValue) {
      this.laneEffectTarget = this.targetButtonLane(current.source);
      if (!current.isTerminal) {
        this.feedback.restartFlash();
        this.feedback.setSound("start");
      }
    }
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
  private allHiddenValue = false;
  private firstVisibleAfterIndexValue = -1;
  get isGeometryOnly(): boolean { return this.allHiddenValue; }
  private get hiddenEndpoints(): boolean { return this.noteInformation?.hiddenSlideEndpoints === true; }

  private slideAfterMultipleGroupResolverValue: ((
    information: NoteInformation,
  ) => SimulatorResult<MultipleDirectionalRuntimeGroup | null>) | null = null;
  private slideAfterMultipleGroupValue: MultipleDirectionalRuntimeGroup | null = null;
  private manualGestureSource: NoteInformation | null = null;
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

  get pendingBeganPlacement(): boolean {
    return this.beganPlacementPending;
  }

  commitBeganPlacement(): void {
    this.beganPlacementPending = false;
  }

  commitRenderHides(): void {
    this.pendingSpriteHides.clear();
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
    if (this.allHiddenValue) return null;
    const source = !this.manualHeadJudgedValue ? this.noteInformation
      : this.afterNotesValue[this.currentAfterIndexValue]?.source ?? null;
    const leadingHidden = this.hiddenEndpoints && source?.isInvisible && this.noteInformation?.isInvisible &&
      this.currentAfterIndexValue <= this.firstVisibleAfterIndexValue;
    return leadingHidden ? null : source;
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
    this.headGestureNode = noteInformation.slideGesture ? new SlideAfterRuntime(noteInformation, -1, false, null) : null;
    this.feedback.reset();
    this.firstVisibleAfterIndexValue = afterNotes.findIndex(after => !after.source.isInvisible);
    this.allHiddenValue = noteInformation.isInvisible && this.firstVisibleAfterIndexValue < 0;
    this.afterNotesValue = afterNotes;
    this.currentAfterIndexValue = 0;
    this.laneEffectTarget = null;
    this.manualHeadJudgedValue = false;
    this.slideAfterMultipleGroupValue = multipleGroup.value;
    this.manualGestureSource = null;
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
    if (!this.manualHeadJudgedValue && this.headGestureNode !== null)
      return ok({ outcome: "bind", ...this.noManualSlideJudgementPlan(input.currentPosition, 0) });
    if (this.manualHeadJudgedValue) {
      const current = this.afterNotesValue[this.currentAfterIndexValue]!;
      const firstVisibleMiddle = this.noteInformation?.isInvisible && current.judgeNoteType === 8 && !current.isTerminal &&
        current.sourceIndex === this.firstVisibleAfterIndexValue;
      const result = firstVisibleMiddle
        ? slideHeldNodeResult(judgement.value, runtime.value.getJudgementAdjustValueB()) : judgement.value.result;
      if (result === NoteResultType.None) return ok({ outcome: "none", judgementPlan: null, familyData: null });
      // A flick tail binds on Began and judges on movement/release.
      const continuation = current.judgeNoteType !== 8
        ? ok(this.noManualSlideJudgementPlan(input.currentPosition, Math.fround(0)))
        : this.reserveManualSlideNode(
            input, current, 8, result, firstVisibleMiddle ? JudgeTiming.None : timing,
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
      this.commitManualSlideNode(input, plan);
      if (this.state !== NoteState.Deactive) {
        this.feedback.restartFlash();
        this.feedback.setSound("start");
      }
      return;
    }
    if (plan.judgementPlan === null && this.headGestureNode === null)
      throw new Error("Slide head commit lost its reservation");
    if (plan.judgementPlan !== null) input.judgementTransaction.commit(plan.judgementPlan);
    this.beganPlacementPending = true;
    this.manualHeadJudgedValue = plan.judgementPlan !== null;
    this.manualTouchOriginValue = input.currentPosition;
    this.manualGestureSource = this.noteInformation?.slideGesture ? this.noteInformation : null;
    this.manualAfterMoveTimeValue = Math.fround(0);
    const changed = this.changeState(NoteState.Stop);
    if (changed.status !== "ok") {
      throw new Error("Slide head commit could not enter Stop state");
    }
    this.feedback.restartFlash();
    this.feedback.setSound("start");
  }

  override preflightManualTouchMoved(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const plans: ManualNoteContinuationPlan[] = [];
    let current = this.manualCurrentNode;
    let origin = this.manualTouchOriginValue;
    let grace = this.manualAfterMoveTimeValue;
    let gestureSource = this.manualGestureSource;
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") return runtime;
    while (true) {
      const planned = this.preflightManualSlideMovedNode(input, current, origin, grace, gestureSource);
      if (planned.status !== "ok") return planned;
      plans.push(planned.value);
      const data = planned.value.familyData as { advanceHidden?: boolean };
      if (current === undefined || current.isTerminal || current.sourceIndex < 0 || current.source.slideGesture !== undefined) break;
      const advanced = planned.value.judgementPlan !== null || data.advanceHidden === true;
      const next = advanced ? this.afterNotesValue[current.sourceIndex + 1] : current;
      if (next === undefined) break;
      // ExecTouchMoved 0x321CB48..0x321CB78 re-enters only after successful
      // intermediate progression with B != 0. Otherwise it reaches the tail
      // gesture block, including when another intermediate remains current.
      if (!advanced || runtime.value.getJudgementAdjustValueB() === 0) {
        const tail = this.afterNotesValue[this.afterNotesValue.length - 1];
        if (tail !== undefined && tail.judgeNoteType !== 8) {
          if (tail.judgeNoteType === 6 || tail.judgeNoteType === 7) origin = input.currentPosition;
          const terminal = this.preflightManualSlideMovedNode(input, next, origin, grace, gestureSource, tail);
          if (terminal.status !== "ok") return terminal;
          plans.push(terminal.value);
        }
        break;
      }
      if (next.source.slideGesture) {
        origin = input.currentPosition;
        grace = 0;
        gestureSource = next.source;
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
    gestureSource: NoteInformation | null,
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
      if (current.isTerminal && !this.hiddenEndpoints) return ok(this.noManualSlideJudgementPlan(origin, grace));
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
    const judgement = runtime.value.judgeSlide(target.source);
    if (judgement.status !== "ok") {
      return judgement;
    }
    const gesture = target.source.slideGesture;
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
      grace, runtime.value.getExecuteFrame(),
      gesture !== undefined && gestureSource !== target.source ? input.currentPosition : origin,
      input.currentPosition);
    const nextGrace = contact.grace;
    const nextOrigin = contact.origin;
    if (nextOrigin === null) {
      return integrityFailure(
        "manual.slide-touch-origin-unavailable",
        "Slide terminal movement requires its cached Began origin.",
      );
    }
    const afterNoteType = this.noteInformation!.afterNoteType;
    const direction = gesture ? gesture.direction : afterNoteType === AfterNoteType.SlideFlickEnd ? null
      : afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft || afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft
        ? "Left" : "Right";
    const multiple = gesture ? gesture.direction !== null && gesture.width > 1 : afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft ||
      afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight;
    const movement = hasFlickMovement(runtime.value.geometry, nextOrigin, input.currentPosition, direction);
    if (movement.status !== "ok") return movement;
    let movementSucceeded = movement.value;
    if (movementSucceeded && multiple) {
      if (gesture === undefined && (group === null || group.isUsed)) return integrityFailure("manual.slide-multiple-terminal-group-unavailable", "Slide Multiple terminal requires its unused chart-owned group.");
      const grouped = hasFlickMovement(runtime.value.geometry, nextOrigin, input.currentPosition, direction, gesture?.width ?? group!.count);
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
      // actual current node. An earlier intermediate therefore takes its Miss path.
      const released = this.reserveManualSlideNode(input, releasedCurrent, releasedCurrent.judgeNoteType,
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
    // Intermediate gestures retain their existing continuation semantics.
    return released.status === "ok" && target.isTerminal ? ok({ ...released.value,
      familyData: { ...released.value.familyData as object, release: true } }) : released;
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
    }
  }

  override preflightManualTouchEnded(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteContinuationPlan> {
    const current = !this.manualHeadJudgedValue && this.headGestureNode !== null ? this.headGestureNode : this.afterNotesValue.find((after, index) =>
      index >= this.currentAfterIndexValue && !after.source.isInvisible && !after.judged);
    const root = this.noteInformation;
    const runtime = this.manualRuntime;
    if (current === undefined && this.hiddenEndpoints) return ok({ judgementPlan: null,
      familyData: { hiddenRelease: true } });
    if (current === undefined || root === null || runtime.status !== "ok") {
      return runtime.status === "ok"
        ? integrityFailure(
            "manual.slide-ended-owner-unavailable",
            "Slide Ended requires its current parent-owned node.",
          )
        : runtime;
    }
    const noteType = current.judgeNoteType;
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
    const data = plan.familyData as { readonly currentIndex: number; readonly reserveLaneOff: boolean; readonly hiddenRelease?: boolean };
    if (data.hiddenRelease) {
      this.feedback.setSound("fade");
      this.feedback.hideFlash();
      this.tapLane("off", this.laneEffectTarget);
      this.laneEffectTarget = null;
      this.setFingerId(-1);
      return;
    }
    this.replaceTapLaneTarget(this.afterNotesValue[this.currentAfterIndexValue]?.source ?? null);
    const laneTarget = this.laneEffectTarget;
    this.feedback.setSound("fade");
    this.hideBeforeSlideNode(data.currentIndex, true, afterUpdate);
    this.hideSlideNode(data.currentIndex, true, afterUpdate);
    this.commitManualSlideNode(input, plan, afterUpdate);
    this.skipManualInvisibleAfterNodes();
    this.tapLane(data.reserveLaneOff ? "off-reserve" : "off", laneTarget);
    this.setFingerId(-1);
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
    const reserved = input.judgementTransaction.preflight({
      noteInformation: current.source,
      phase: current.sourceIndex === -1 ? "head" : current.isTerminal ? "tail" : "intermediate",
      noteType,
      rawResult,
      rawTiming,
      absolutePosition: current.source.absolutePos,
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
    };
    this.manualGestureSource = this.manualCurrentNode?.source.slideGesture ? this.manualCurrentNode.source : null;
    this.manualTouchOriginValue = data.nextOrigin;
    this.manualAfterMoveTimeValue = data.nextGrace;
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
      this.manualTouchOriginValue = input.currentPosition;
      this.manualAfterMoveTimeValue = 0;
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
    this.currentAfterIndexValue += 1;
    if (current?.source.slideGesture || this.afterNotesValue[this.currentAfterIndexValue]?.source.slideGesture) {
      this.manualTouchOriginValue = input.currentPosition;
      this.manualAfterMoveTimeValue = 0;
      this.manualGestureSource = this.manualCurrentNode?.source.slideGesture ? this.manualCurrentNode.source : null;
    }
    if (current?.isTerminal) {
      const changed = this.changeState(NoteState.Deactive);
      if (changed.status !== "ok") {
        throw new Error("Slide completion could not deactivate parent");
      }
    }
  }

  protected override moveState(_deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.noteInformation?.isInvisible) {
      if (!this.allHiddenValue) return ok(undefined);
      const manual = this.manualRuntime;
      if (manual.status !== "ok") return manual;
      const stopped = manual.value.stopSlideHeadAtJudgeLine();
      return stopped.status !== "ok" ? stopped : stopped.value ? this.changeState(NoteState.Stop) : ok(undefined);
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
      noteType: this.noteInformation!.slideGesture?.noteType ?? 8,
      absolutePosition: noteInformation.absolutePos,
      multipleDirectionalFlickNoteCount: 0,
    });
    if (submitted.status === "ok") {
      if (!noteInformation.slideGesture) this.pulseAutoFrontTapLane(this.effectButtonLane(noteInformation));
      this.laneEffectTarget = this.targetButtonLane(noteInformation);
      // forcePerfectMoveState invokes Began, which advances currentNote, then pulses that target.
      if (!noteInformation.slideGesture) this.pulseTapLane(this.targetButtonLane(this.afterNotesValue[0]?.source ?? noteInformation));
      const manual = this.manualRuntime;
      if (manual.status !== "ok") return manual;
      const origin = manual.value.geometry.getTargetCenterScreenPosition?.(noteInformation);
      if (origin?.status !== "ok") return origin ?? integrityFailure("auto-live.slide-target-center-unavailable",
        "Force Perfect Began requires the root target center in input coordinates.");
      this.manualTouchOriginValue = origin.value;
      this.manualHeadJudgedValue = true;
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
    ) ?? (this.hiddenEndpoints ? this.afterNotesValue[this.afterNotesValue.length - 1] : undefined);
    if (!slideHeadTimeoutDue(frontOver.value, adjusted, information.absolutePos, nextVisible?.source.absolutePos)) {
      return ok(undefined);
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation: information,
      phase: "head",
      noteType: this.noteInformation!.slideGesture?.noteType ?? 8,
      rawResult: NoteResultType.Miss,
      rawTiming: JudgeTiming.None,
      absolutePosition: information.absolutePos,
    });
    if (submitted.status !== "ok") {
      return submitted;
    }
    this.manualHeadJudgedValue = true;
    if (information.slideGesture) { this.feedback.hideFlash(); this.feedback.setSound("fade"); }
    this.hideSlideNode(-1, true);
    this.skipManualInvisibleAfterNodes();
    return this.currentAfterIndexValue >= this.afterNotesValue.length
      ? this.changeState(NoteState.Deactive)
      : this.changeState(NoteState.Stop);
  }

  protected override stopState(_deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.hiddenEndpoints && (!this.manualHeadJudgedValue ||
        this.afterNotesValue[this.currentAfterIndexValue]?.source.isInvisible)) return ok(undefined);
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
    return selected.isTerminal ? this.changeState(NoteState.Deactive) : ok(undefined);
  }

  protected override onUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    const runtime = this.autoLiveRuntime;
    if (runtime.status !== "ok") return runtime;
    if (this.allHiddenValue) {
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
    if (this.hiddenEndpoints) {
      const advanced = this.advanceHiddenEndpoints();
      if (advanced.status !== "ok" || this.state === NoteState.Deactive || !this.manualHeadJudgedValue) return advanced;
    }
    if (this.manualHeadJudgedValue) {
      for (const after of this.afterNotesValue) {
        if (this.state === NoteState.Deactive) break;
        after.stopAdjustmentWaited = false;
        const timeout = this.executeManualSlideAfterTimeout(after,
          !runtime.value.shouldForcePerfect() && !after.source.isInvisible);
        if (timeout.status !== "ok") return timeout;
      }
      if (this.state === NoteState.Deactive) return ok(undefined);
    }
    return ok(undefined);
  }

  /** NoteSlide.OnUpdate runs forcePerfectOnUpdate after every child ExecuteUpdate. */
  executeAfterChildrenUpdate(): SimulatorResult<void> {
    if (this.state === NoteState.Deactive || this.allHiddenValue) return ok(undefined);
    if (this.hiddenEndpoints && !this.manualHeadJudgedValue) return ok(undefined);
    if (this.headGestureNode !== null && !this.manualHeadJudgedValue && this.state === NoteState.Stop) return ok(undefined);
    return this.forcePerfectPendingAfter();
  }

  private executeManualSlideAfterTimeout(current: SlideAfterRuntime, canJudge: boolean): SimulatorResult<void> {
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") {
      return runtime;
    }
    const adjusted = runtime.value.getAdjustedMusicPosition();
    if (!Number.isFinite(adjusted)) {
      return integrityFailure(
        "manual.slide-timeout-non-finite-adjusted-position",
        "Slide current timeout requires a finite adjusted position.",
      );
    }
    const phase = runtime.value.getSlideChildPhase(current.sourceIndex);
    if (phase.status !== "ok") return phase;
    if (phase.value !== "stop") return ok(undefined);
    const nextVisible = this.afterNotesValue.find((after) =>
      after.sourceIndex > current.sourceIndex && !after.source.isInvisible) ??
      (this.hiddenEndpoints && !current.isTerminal ? this.afterNotesValue[this.afterNotesValue.length - 1] : undefined);
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
        current.isTerminal, nextVisible?.source.absolutePos, nextStopped)) return ok(undefined);
    }
    const submitted = runtime.value.submitJudgement({
      noteInformation: current.source,
      phase: current.sourceIndex === -1 ? "head" : current.isTerminal ? "tail" : "intermediate",
      noteType: current.source.slideGesture?.noteType ?? 8,
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
    this.hideSlideNode(-1, true);
    this.hideSlideNode(current.sourceIndex, true);
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
    if (this.hiddenEndpoints) return;
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

  private advanceHiddenEndpoints(): SimulatorResult<void> {
    const runtime = this.manualRuntime;
    if (runtime.status !== "ok") return runtime;
    const root = this.noteInformation!;
    const current = this.afterNotesValue[this.currentAfterIndexValue];
    const source = !this.manualHeadJudgedValue ? root : current?.source;
    if (source === undefined || !source.isInvisible) return ok(undefined);
    const auto = this.autoLiveRuntime;
    if (auto.status !== "ok") return auto;
    if (auto.value.shouldForcePerfect()) {
      // Same hidden-node timing as forcePerfectPendingAfter; no scoring request.
      if (auto.value.getAdjustedMusicPosition() < source.absolutePos) return ok(undefined);
    } else {
      const decision = runtime.value.judgeSlide(source);
      if (decision.status !== "ok") return decision;
      if (slideHeldNodeResult(decision.value, runtime.value.getJudgementAdjustValueB()) === NoteResultType.None)
        return ok(undefined);
    }
    if (!this.manualHeadJudgedValue) {
      this.manualHeadJudgedValue = true;
      return this.changeState(NoteState.Stop);
    }
    return this.completeHiddenAfter(current!);
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
    if (!current.isTerminal && current.source.slideGesture === undefined && !this.hiddenEndpoints) {
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
    if (current.source.isInvisible) {
      return this.hiddenEndpoints ? ok(undefined) : this.completeHiddenAfter(current, false);
    }
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
    this.currentAfterIndexValue += 1;
    return current.isTerminal
      ? this.changeState(NoteState.Deactive)
      : ok(undefined);
  }

  protected override onResetForDispose(): void {
    this.feedback.hideFlash();
    this.allHiddenValue = false;
    this.firstVisibleAfterIndexValue = -1;
    this.headGestureNode = null;
    this.afterNotesValue = [];
    this.beganPlacementPending = false;
    this.pendingSpriteHides.clear();
    this.currentAfterIndexValue = 0;
    this.laneEffectTarget = null;
    this.manualHeadJudgedValue = false;
    this.slideAfterMultipleGroupValue = null;
    this.manualGestureSource = null;
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
    this.headGestureNode = null;
    this.afterNotesValue = [];
    this.beganPlacementPending = false;
    this.pendingSpriteHides.clear();
    this.currentAfterIndexValue = 0;
    this.laneEffectTarget = null;
    this.manualHeadJudgedValue = false;
    this.slideAfterMultipleGroupValue = null;
    this.manualGestureSource = null;
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
    return nextFrameCounter < Math.fround(7)
      ? ok(undefined)
      : this.forcePerfect();
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
    if (autoRuntime.value.shouldForcePerfect()) {
      return this.submitHeadPerfect(this.forcePerfectJudgeNoteType);
    }
    const information = this.noteInformation;
    const manualRuntime = this.manualRuntime;
    if (information === null || manualRuntime.status !== "ok") {
      return manualRuntime.status === "ok"
        ? integrityFailure(
            "manual.flick-force-perfect-without-source",
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

  override preflightManualTouchBegan(
    input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteBeganPlan> {
    const group = this.groupValue;
    if (group?.isUsed) {
      return integrityFailure(
        "manual.multiple-directional-group-already-used",
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
            "Multiple Directional movement requires its activated source and registered group owner.",
          )
        : runtime;
    }
    if (group.isUsed) {
      return integrityFailure(
        "manual.multiple-directional-group-already-used",
        "A consumed Multiple Directional side owner cannot produce a duplicate movement judgement.",
      );
    }
    const movement = hasFlickMovement(runtime.value.geometry, input.beganPosition, input.currentPosition,
      information.gameNoteType === GameNoteType.DirectionalFlickLeft ? "Left" : "Right", group.count);
    if (movement.status !== "ok") return movement;
    return movement.value ? this.reserveSuccessfulManualMove(input, group.count)
      : ok(Object.freeze({ judgementPlan: null, familyData: Object.freeze({ complete: false }) }));
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
    const group = this.groupValue;
    const fingerId = this.fingerId;
    super.onDeactivated();
    group?.clearManualFinger(fingerId);
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

  get judgeNoteType(): number { return this.source.slideGesture?.noteType ?? this.terminalJudgeNoteType ?? 8; }

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
        source.gameNoteType === root.gameNoteType);
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
