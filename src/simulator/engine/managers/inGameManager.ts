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
  readonly oneFrameInitialized: boolean;
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
    return this.noteManager.execUpdate(deltaTimeSeconds);
  }

  pause(): SimulatorResult<void> {
    return evidenceRequired(
      "engine.pause",
      ["E09"],
      "Pause evidence is frozen; the host gate and backend broadcasts are implemented in T08.",
    );
  }

  resume(): SimulatorResult<void> {
    return evidenceRequired(
      "engine.resume",
      ["E09"],
      "Resume evidence is frozen; retained-state continuation is implemented in T08.",
    );
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
      oneFrameInitialized: this.oneFrameJudgementController.isInitialized,
    };
  }
}
