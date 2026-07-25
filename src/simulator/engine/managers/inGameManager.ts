import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";
import type { EngineLifecycleSnapshot, EngineLifecycleState } from "../lifecycle";
import { InGameMusicScoreController } from "./inGameMusicScoreController";
import { InGameOneFrameJudgementController } from "./inGameOneFrameJudgementController";
import { InputManager } from "./inputBoundaries";
import { NoteManager } from "./noteManager";

export interface InGameManagerSnapshot extends EngineLifecycleSnapshot {
  readonly musicScore: ReturnType<InGameMusicScoreController["snapshot"]>;
  readonly noteManager: ReturnType<NoteManager["snapshot"]>;
  readonly oneFrame: ReturnType<InGameOneFrameJudgementController["snapshot"]>;
}

export class InGameManager {
  private lifecycleState: EngineLifecycleState = "created";
  private pausedValue = false;

  constructor(
    readonly musicScoreController: InGameMusicScoreController,
    readonly noteManager: NoteManager,
    readonly oneFrameJudgementController: InGameOneFrameJudgementController,
    readonly inputManager: InputManager,
  ) {}

  initialize(): SimulatorResult<void> {
    if (this.lifecycleState === "disposed") {
      return evidenceRequired(
        "host.initialize-after-dispose",
        [],
        "The portable host does not reconstruct an engine after disposal.",
      );
    }
    if (this.lifecycleState === "initialized") {
      return ok(undefined);
    }

    const oneFrameInitialization = this.oneFrameJudgementController.initialize();
    if (oneFrameInitialization.status !== "ok") {
      return oneFrameInitialization;
    }
    const noteInitialization = this.noteManager.execAwakeEnd();
    if (noteInitialization.status !== "ok") {
      return noteInitialization;
    }
    this.lifecycleState = "initialized";
    return ok(undefined);
  }

  step(deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.pausedValue) {
      return ok(undefined);
    }
    const updateResult = this.noteManager.execUpdate(deltaTimeSeconds);
    if (updateResult.status !== "ok") {
      return updateResult;
    }
    const reflectResult = this.oneFrameJudgementController.reflectOneFrameData();
    if (reflectResult.status !== "ok") {
      return reflectResult;
    }
    return ok(undefined);
  }

  pause(): SimulatorResult<void> {
    if (this.pausedValue) {
      return ok(undefined);
    }
    this.pausedValue = true;
    return ok(undefined);
  }

  resume(): SimulatorResult<void> {
    if (!this.pausedValue) {
      return ok(undefined);
    }
    this.pausedValue = false;
    return ok(undefined);
  }

  dispose(): SimulatorResult<void> {
    this.lifecycleState = "disposed";
    this.pausedValue = false;
    return ok(undefined);
  }

  snapshot(): InGameManagerSnapshot {
    return {
      state: this.lifecycleState,
      paused: this.pausedValue,
      musicScore: this.musicScoreController.snapshot(),
      noteManager: this.noteManager.snapshot(),
      oneFrame: this.oneFrameJudgementController.snapshot(),
    };
  }
}
