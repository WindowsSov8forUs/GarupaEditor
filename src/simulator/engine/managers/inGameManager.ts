import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";
import {
  GameState,
  isPausedState,
  PauseState,
  type GameStateValue,
  type PauseStateValue,
} from "../data/inGameState";
import type { EngineLifecycleSnapshot, EngineLifecycleState } from "../lifecycle";
import { InGameMusicScoreController } from "./inGameMusicScoreController";
import { InGameOneFrameJudgementController } from "./inGameOneFrameJudgementController";
import { InputManager } from "./inputBoundaries";
import { NoteManager } from "./noteManager";

export interface InGameManagerSnapshot extends EngineLifecycleSnapshot {
  readonly currentGameState: GameStateValue;
  readonly pauseState: PauseStateValue;
  readonly musicScore: ReturnType<InGameMusicScoreController["snapshot"]>;
  readonly noteManager: ReturnType<NoteManager["snapshot"]>;
  readonly oneFrame: ReturnType<InGameOneFrameJudgementController["snapshot"]>;
}

export class InGameManager {
  private lifecycleState: EngineLifecycleState = "created";
  private currentGameStateValue: GameStateValue = GameState.PlayingSound;
  private pauseStateValue: PauseStateValue = PauseState.None;

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

  execUpdate(deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.lifecycleState !== "initialized") {
      return evidenceRequired(
        "ingame.update-outside-initialized-lifecycle",
        [],
        "InGameManager.ExecUpdate is only represented after initialization and before disposal.",
      );
    }
    if (this.currentGameStateValue === GameState.PauseNone) {
      return ok(undefined);
    }
    const inputResult = this.inputManager.execInput(this.currentGameStateValue);
    if (inputResult.status !== "ok") {
      return inputResult;
    }
    if (this.currentGameStateValue === GameState.PauseSound) {
      return ok(undefined);
    }
    if (this.currentGameStateValue === GameState.PlayingNone) {
      return evidenceRequired(
        "ingame.playing-none-input-inspection",
        ["E22", "E23", "E25"],
        "PlayingNone requires the original OneFrame input-inspection list, which is outside the first slice.",
      );
    }
    const updateResult = this.noteManager.execUpdate(deltaTimeSeconds);
    if (updateResult.status !== "ok") {
      return updateResult;
    }
    if (this.oneFrameJudgementController.existsOneFrameData()) {
      const reflectResult = this.oneFrameJudgementController.reflectOneFrameData();
      if (reflectResult.status !== "ok") {
        return reflectResult;
      }
    }
    return ok(undefined);
  }

  pause(): SimulatorResult<void> {
    if (this.lifecycleState !== "initialized") {
      return evidenceRequired(
        "ingame.pause-outside-initialized-lifecycle",
        [],
        "The recovered scheduling freeze is only represented for an initialized live.",
      );
    }
    if (this.isPaused()) {
      return ok(undefined);
    }
    this.currentGameStateValue = GameState.PauseSound;
    this.pauseStateValue = PauseState.None;
    return ok(undefined);
  }

  resume(): SimulatorResult<void> {
    if (this.lifecycleState !== "initialized") {
      return evidenceRequired(
        "ingame.resume-outside-initialized-lifecycle",
        [],
        "The recovered resume path is only represented for an initialized live.",
      );
    }
    if (!this.isPaused()) {
      return ok(undefined);
    }
    this.currentGameStateValue = GameState.PlayingSound;
    this.pauseStateValue = PauseState.None;
    return ok(undefined);
  }

  dispose(): SimulatorResult<void> {
    if (this.lifecycleState === "disposed") {
      return ok(undefined);
    }
    const noteDispose = this.noteManager.dispose();
    if (noteDispose.status !== "ok") {
      return noteDispose;
    }
    this.oneFrameJudgementController.dispose();
    this.lifecycleState = "disposed";
    this.currentGameStateValue = GameState.PlayingSound;
    this.pauseStateValue = PauseState.None;
    return ok(undefined);
  }

  private isPaused(): boolean {
    return isPausedState(this.currentGameStateValue, this.pauseStateValue);
  }

  snapshot(): InGameManagerSnapshot {
    return {
      state: this.lifecycleState,
      paused: this.isPaused(),
      currentGameState: this.currentGameStateValue,
      pauseState: this.pauseStateValue,
      musicScore: this.musicScoreController.snapshot(),
      noteManager: this.noteManager.snapshot(),
      oneFrame: this.oneFrameJudgementController.snapshot(),
    };
  }
}
