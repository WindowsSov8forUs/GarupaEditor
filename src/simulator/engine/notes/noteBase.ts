import {
  evidenceRequired,
  ok,
  type EvidenceReference,
  type SimulatorResult,
} from "../evidence";
import type { FirstSliceNoteInformationFixture } from "../data/noteData";
import type { OneFrameDataHandle } from "../data/oneFrameData";

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
  readonly fixtureId: string | null;
  readonly state: NoteState;
}

export class NoteBase {
  private stateValue = NoteState.Deactive;
  private lifecycleCallbacks: NoteLifecycleCallbacks | null = null;
  private fixtureValue: FirstSliceNoteInformationFixture | null = null;
  private getUsableOneFrameData: (() => SimulatorResult<OneFrameDataHandle>) | null = null;

  constructor(
    readonly poolObjectId: string,
    readonly evidence: readonly EvidenceReference[],
  ) {}

  get fixtureId(): string {
    return this.fixtureValue?.fixtureId ?? this.poolObjectId;
  }

  get fixture(): FirstSliceNoteInformationFixture | null {
    return this.fixtureValue;
  }

  get state(): NoteState {
    return this.stateValue;
  }

  setLifecycleCallbacks(callbacks: NoteLifecycleCallbacks): void {
    this.lifecycleCallbacks = callbacks;
  }

  registerCallbackGetUsableOneFrameData(
    callback: () => SimulatorResult<OneFrameDataHandle>,
  ): void {
    this.getUsableOneFrameData = callback;
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

  activate(fixture: FirstSliceNoteInformationFixture): SimulatorResult<void> {
    if (this.stateValue !== NoteState.Deactive) {
      return evidenceRequired(
        "note-pool.activate-active-object",
        ["E04", "E06"],
        `Pool object ${this.poolObjectId} cannot bind ${fixture.fixtureId} while active.`,
      );
    }
    this.fixtureValue = fixture;
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
    }

    return ok(undefined);
  }

  executeUpdate(deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.stateValue === NoteState.Deactive) {
      return ok(undefined);
    }

    const phaseResult = this.executeStatePhase(deltaTimeSeconds);
    if (phaseResult.status !== "ok") {
      return phaseResult;
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

  snapshot(): NoteStateSnapshot {
    return {
      poolObjectId: this.poolObjectId,
      fixtureId: this.fixtureValue?.fixtureId ?? null,
      state: this.stateValue,
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
