import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";
import type { ButtonTypeValue, NoteInformation } from "../chart/types";
import type {
  ManualInputPosition,
  ManualTouchPhaseValue,
} from "../data/manualInput";
import type {
  ManualJudgementCommitPlan,
  ManualJudgementTransaction,
} from "../data/manualJudgement";
import type { OneFrameDataHandle } from "../data/oneFrameData";
import type { NoteAutoLiveRuntime } from "../data/autoLiveJudgement";

export enum NoteState {
  Move = 0,
  Wait = 1,
  Stop = 2,
  Deactive = 3,
}

export interface NoteLifecycleCallbacks {
  readonly onActivate: (note: NoteBase) => void;
  readonly onDeactivate: (note: NoteBase) => void;
}

export interface NoteStateSnapshot {
  readonly poolObjectId: string;
  readonly noteIndex: number | null;
  readonly state: NoteState;
  readonly fingerId: number;
  readonly buttonTypes: readonly ButtonTypeValue[];
}

export interface ManualNoteRuntime {
  readonly getAdjustedMusicPosition: () => number;
  readonly getCurrentBpm: () => number;
}

export interface ManualNoteTouchInput {
  readonly fingerId: number;
  readonly phase: ManualTouchPhaseValue;
  readonly beganPosition: ManualInputPosition;
  readonly currentPosition: ManualInputPosition;
  readonly judgementTransaction: ManualJudgementTransaction;
}

export interface ManualNoteBeganPlan {
  readonly outcome: "bind" | "none";
  readonly judgementPlan: ManualJudgementCommitPlan | null;
  readonly familyData: unknown;
}

export class NoteBase {
  private stateValue = NoteState.Deactive;
  private lifecycleCallbacks: NoteLifecycleCallbacks | null = null;
  private noteInformationValue: NoteInformation | null = null;
  private getUsableOneFrameData: (() => SimulatorResult<OneFrameDataHandle>) | null = null;
  private autoLiveRuntimeValue: NoteAutoLiveRuntime | null = null;
  private manualRuntimeValue: ManualNoteRuntime | null = null;
  private fingerIdValue = -1;

  constructor(readonly poolObjectId: string) {}

  get noteInformation(): NoteInformation | null {
    return this.noteInformationValue;
  }

  get state(): NoteState {
    return this.stateValue;
  }

  get fingerId(): number {
    return this.fingerIdValue;
  }

  isContainsButton(buttonType: ButtonTypeValue): boolean {
    return this.noteInformationValue?.buttonTypes.includes(buttonType) ?? false;
  }

  setFingerId(fingerId: number): void {
    this.fingerIdValue = fingerId;
  }

  setLifecycleCallbacks(callbacks: NoteLifecycleCallbacks): void {
    this.lifecycleCallbacks = callbacks;
  }

  registerCallbackGetUsableOneFrameData(
    callback: () => SimulatorResult<OneFrameDataHandle>,
  ): void {
    this.getUsableOneFrameData = callback;
  }

  registerAutoLiveRuntime(runtime: NoteAutoLiveRuntime): void {
    this.autoLiveRuntimeValue = runtime;
  }

  registerManualRuntime(runtime: ManualNoteRuntime): void {
    this.manualRuntimeValue = runtime;
  }

  requestUsableOneFrameData(): SimulatorResult<OneFrameDataHandle> {
    if (this.getUsableOneFrameData === null) {
      return evidenceRequired(
        "note.one-frame-callback-unregistered",
        ["E02", "E08"],
        "NoteBase.RegisterCallbackGetUsableOneFrameData must be installed during SetupNotes.",
      );
    }
    return this.getUsableOneFrameData();
  }

  activate(noteInformation: NoteInformation): SimulatorResult<void> {
    const activationValidation = this.validateCanActivate(noteInformation);
    if (activationValidation.status !== "ok") {
      return activationValidation;
    }
    this.noteInformationValue = noteInformation;
    this.fingerIdValue = -1;
    return this.changeState(NoteState.Move);
  }

  changeState(nextState: NoteState): SimulatorResult<void> {
    const previousState = this.stateValue;
    if (previousState === nextState) {
      return ok(undefined);
    }

    this.stateValue = nextState;
    if (previousState === NoteState.Deactive && nextState === NoteState.Move) {
      this.lifecycleCallbacks?.onActivate(this);
    } else if (previousState !== NoteState.Deactive && nextState === NoteState.Deactive) {
      this.lifecycleCallbacks?.onDeactivate(this);
      this.onDeactivated();
      this.fingerIdValue = -1;
    }

    return ok(undefined);
  }

  resetForDispose(): SimulatorResult<void> {
    const deactivated = this.changeState(NoteState.Deactive);
    if (deactivated.status !== "ok") {
      return deactivated;
    }
    this.noteInformationValue = null;
    this.fingerIdValue = -1;
    this.onResetForDispose();
    return ok(undefined);
  }

  executeUpdate(deltaTimeSeconds: number): SimulatorResult<void> {
    if ((this.stateValue as NoteState) === NoteState.Deactive) {
      return ok(undefined);
    }

    const phaseResult = this.executeStatePhase(deltaTimeSeconds);
    if (phaseResult.status !== "ok") {
      return phaseResult;
    }
    if (this.stateValue === NoteState.Deactive) {
      return ok(undefined);
    }
    return this.onUpdate(deltaTimeSeconds);
  }

  executeAfterUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    return evidenceRequired(
      "note.execute-after-update",
      ["E03", "E05"],
      "The first slice confirms the dispatch boundary, not derived-note after-update behavior.",
    );
  }

  preflightManualTouchBegan(
    _input: ManualNoteTouchInput,
  ): SimulatorResult<ManualNoteBeganPlan> {
    return evidenceRequired(
      "manual.note-touch-began-unimplemented",
      ["D04", "D05", "MJ03", "MJ08"],
      "The InputManager/GamePlayButton owner path is represented, but the concrete note family must close its manual Began judgement before owner mutation.",
    );
  }

  preflightManualTouchBeganCommit(
    _input: ManualNoteTouchInput,
    plan: ManualNoteBeganPlan,
  ): SimulatorResult<ManualNoteBeganPlan> {
    return ok(plan);
  }

  commitManualTouchBegan(
    _input: ManualNoteTouchInput,
    _plan: ManualNoteBeganPlan,
  ): void {}

  preflightManualTouchMoved(
    _input: ManualNoteTouchInput,
  ): SimulatorResult<void> {
    return evidenceRequired(
      "manual.note-touch-moved-unimplemented",
      ["D07", "D08", "D09", "D10", "MJ13", "MJ14", "MJ15"],
      "The concrete Flick, Multiple, Long or Slide owner must close movement judgement before owner mutation.",
    );
  }

  commitManualTouchMoved(_input: ManualNoteTouchInput): void {}

  preflightManualTouchEnded(
    _input: ManualNoteTouchInput,
  ): SimulatorResult<void> {
    return evidenceRequired(
      "manual.note-touch-ended-unimplemented",
      ["D09", "D10", "D12", "MJ19", "MJ21"],
      "The concrete Long or Slide owner must close release judgement before owner mutation.",
    );
  }

  commitManualTouchEnded(_input: ManualNoteTouchInput): void {}

  snapshot(): NoteStateSnapshot {
    return {
      poolObjectId: this.poolObjectId,
      noteIndex: this.noteInformationValue?.index ?? null,
      state: this.stateValue,
      fingerId: this.fingerIdValue,
      buttonTypes: [...(this.noteInformationValue?.buttonTypes ?? [])],
    };
  }

  protected moveState(_deltaTimeSeconds: number): SimulatorResult<void> {
    return this.unimplementedStatePhase("move");
  }

  protected waitState(_deltaTimeSeconds: number): SimulatorResult<void> {
    return this.unimplementedStatePhase("wait");
  }

  protected stopState(_deltaTimeSeconds: number): SimulatorResult<void> {
    return this.unimplementedStatePhase("stop");
  }

  protected onUpdate(_deltaTimeSeconds: number): SimulatorResult<void> {
    return evidenceRequired(
      "note.on-update",
      ["E03", "E12", "E13"],
      "The original OnUpdate dispatch is confirmed; note-family behavior belongs to later slices.",
    );
  }

  protected onResetForDispose(): void {}

  protected onDeactivated(): void {}

  protected validateCanActivate(
    noteInformation: NoteInformation,
  ): SimulatorResult<void> {
    if (this.stateValue !== NoteState.Deactive) {
      return evidenceRequired(
        "note-pool.activate-active-object",
        ["E04", "E06", "R04"],
        `Pool object ${this.poolObjectId} cannot bind note ${noteInformation.index} while active.`,
      );
    }
    return ok(undefined);
  }

  protected get manualRuntime(): SimulatorResult<ManualNoteRuntime> {
    if (this.manualRuntimeValue === null) {
      return evidenceRequired(
        "manual.note-runtime-unregistered",
        ["D05", "D14", "MJ02", "MJ26"],
        "SetupNotes must install the adjusted-position and current-BPM manual judgement owner.",
      );
    }
    return ok(this.manualRuntimeValue);
  }

  protected get autoLiveRuntime(): SimulatorResult<NoteAutoLiveRuntime> {
    if (this.autoLiveRuntimeValue === null) {
      return evidenceRequired(
        "auto-live.note-runtime-unregistered",
        ["R01", "R02", "R04"],
        "SetupNotes must install the shared Auto Live calculated-data and judgement callbacks.",
      );
    }
    return ok(this.autoLiveRuntimeValue);
  }

  private executeStatePhase(deltaTimeSeconds: number): SimulatorResult<void> {
    switch (this.stateValue) {
      case NoteState.Move:
        return this.moveState(deltaTimeSeconds);
      case NoteState.Wait:
        return this.waitState(deltaTimeSeconds);
      case NoteState.Stop:
        return this.stopState(deltaTimeSeconds);
      case NoteState.Deactive:
        return ok(undefined);
    }
  }

  private unimplementedStatePhase(phase: string): SimulatorResult<void> {
    return evidenceRequired(
      `note.state.${phase}`,
      ["E03", "E12", "E13"],
      `NoteState ${phase} dispatch is confirmed, but the concrete note-family behavior is not part of the first framework batch.`,
    );
  }
}
