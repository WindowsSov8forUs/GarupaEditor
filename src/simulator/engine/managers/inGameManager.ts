import {
  evidenceRequired,
  ok,
  type EvidenceRequired,
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
import { ScoreLifeStateManager } from "./scoreLifeStateManager";
import type { FeverTimeCommandName } from "./feverTimeManager";
import { InputManager } from "./inputBoundaries";
import { NoteManager } from "./noteManager";
import type { RenderCommandProducer } from "../rendering/renderCommandProducer";

export interface InGameManagerSnapshot extends EngineLifecycleSnapshot {
  readonly fault: EvidenceRequired | null;
  readonly currentGameState: GameStateValue;
  readonly pauseState: PauseStateValue;
  readonly musicScore: ReturnType<InGameMusicScoreController["snapshot"]>;
  readonly noteManager: ReturnType<NoteManager["snapshot"]>;
  readonly inputManager: ReturnType<InputManager["snapshot"]>;
  readonly oneFrame: ReturnType<InGameOneFrameJudgementController["snapshot"]>;
  readonly scoreLifeState: ReturnType<ScoreLifeStateManager["snapshot"]> | null;
}

export class InGameManager {
  private lifecycleState: EngineLifecycleState = "created";
  private currentGameStateValue: GameStateValue = GameState.PlayingSound;
  private pauseStateValue: PauseStateValue = PauseState.None;
  private faultValue: EvidenceRequired | null = null;

  constructor(
    readonly musicScoreController: InGameMusicScoreController,
    readonly noteManager: NoteManager,
    readonly oneFrameJudgementController: InGameOneFrameJudgementController,
    readonly inputManager: InputManager,
    readonly scoreLifeStateManager: ScoreLifeStateManager | null = null,
    private readonly renderProducer: RenderCommandProducer | null = null,
  ) {}

  get state(): EngineLifecycleState {
    return this.lifecycleState;
  }

  initialize(): SimulatorResult<void> {
    if (this.faultValue !== null) {
      return this.faultValue;
    }
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

    const noteValidation = this.noteManager.validateSetup();
    if (noteValidation.status !== "ok") {
      return noteValidation;
    }
    const hudSetup = this.scoreLifeStateManager !== null && this.renderProducer !== null
      ? this.renderProducer.preflightHudSetup(this.scoreLifeStateManager.record.snapshot())
      : null;
    if (hudSetup?.status === "evidence-required") return hudSetup;
    if (hudSetup?.status === "ok") {
      const committed = hudSetup.value.commit();
      if (committed.status !== "ok") return committed;
    }
    const inputInitialization = this.inputManager.initialize();
    if (inputInitialization.status !== "ok") {
      return inputInitialization;
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
    if (this.faultValue !== null) {
      return this.faultValue;
    }
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
    this.scoreLifeStateManager?.update(deltaTimeSeconds);
    const updateResult = this.noteManager.execUpdate(deltaTimeSeconds);
    if (updateResult.status !== "ok") {
      return this.latchFault(updateResult);
    }
    const hudAnimation = this.renderProducer?.preflightHudAnimationAdvance(deltaTimeSeconds) ?? null;
    if (hudAnimation?.status === "evidence-required") {
      return this.latchFault(hudAnimation);
    }
    if (hudAnimation?.status === "ok") {
      const committed = hudAnimation.value.commit();
      if (committed.status !== "ok") return this.latchFault(committed);
    }
    if (this.oneFrameJudgementController.existsOneFrameData()) {
      const reflectResult = this.oneFrameJudgementController.reflectOneFrameData();
      if (reflectResult.status !== "ok") {
        return this.latchFault(reflectResult);
      }
      if (reflectResult.value !== null && this.scoreLifeStateManager !== null) {
        const businessPlan = this.scoreLifeStateManager.preflightReflect(reflectResult.value);
        if (businessPlan.status !== "ok") return this.latchFault(businessPlan);
        const renderPlan = this.renderProducer?.preflightHudReflect(businessPlan.value) ?? null;
        if (renderPlan?.status === "evidence-required") {
          this.scoreLifeStateManager.discardReflect(businessPlan.value);
          return this.latchFault(renderPlan);
        }
        const businessReflect = this.scoreLifeStateManager.commitReflect(businessPlan.value);
        if (businessReflect.status !== "ok") {
          if (renderPlan?.status === "ok") renderPlan.value.discard();
          return this.latchFault(businessReflect);
        }
        if (renderPlan?.status === "ok") {
          const committed = renderPlan.value.commit();
          if (committed.status !== "ok") return this.latchFault(committed);
        }
      }
    }
    return ok(undefined);
  }

  updateFeverMemberPoint(
    displayIndex: number,
    point: number,
    isOwnTeam: boolean,
  ): SimulatorResult<void> {
    if (this.faultValue !== null) return this.faultValue;
    if (this.lifecycleState !== "initialized" || this.scoreLifeStateManager === null) {
      return evidenceRequired(
        "score-life.fever-adapter-without-active-profile",
        ["SLS-D16", "SLS-D24"],
        "Fever adapter updates require an initialized Score/Life session profile.",
      );
    }
    return this.scoreLifeStateManager.updateFeverMemberPoint(displayIndex, point, isOwnTeam);
  }

  changeFeverCommand(command: FeverTimeCommandName): SimulatorResult<void> {
    if (this.faultValue !== null) return this.faultValue;
    if (this.lifecycleState !== "initialized" || this.scoreLifeStateManager === null) {
      return evidenceRequired(
        "score-life.fever-command-without-active-profile",
        ["SLS-D16", "SLS-D24"],
        "Fever commands require an initialized Score/Life session profile.",
      );
    }
    return this.scoreLifeStateManager.changeFeverCommand(command);
  }

  continueLive(): SimulatorResult<void> {
    if (this.faultValue !== null) return this.faultValue;
    if (this.scoreLifeStateManager === null) {
      return evidenceRequired(
        "score-life.continue-without-profile",
        ["SLS-D22", "SLS-D24", "BS36"],
        "Continue is unavailable without a Score/Life session and remains excluded with one.",
      );
    }
    return this.scoreLifeStateManager.continueLive();
  }

  getAdjustedMusicPosition(): SimulatorResult<number> {
    if (this.faultValue !== null) {
      return this.faultValue;
    }
    if (this.lifecycleState !== "initialized") {
      return evidenceRequired(
        "ingame.adjusted-position-outside-initialized-lifecycle",
        [],
        "The recovered adjusted-position owner is only available for an initialized live.",
      );
    }
    return ok(this.noteManager.getAdjustedMusicPosition());
  }

  pause(): SimulatorResult<void> {
    if (this.faultValue !== null) {
      return this.faultValue;
    }
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
    if (this.faultValue !== null) {
      return this.faultValue;
    }
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
    this.finishDispose();
    return ok(undefined);
  }

  disposeAfterTerminalRendererFault(): void {
    if (this.lifecycleState === "disposed") return;
    this.noteManager.disposeAfterTerminalRendererFault();
    this.finishDispose();
  }

  private finishDispose(): void {
    this.oneFrameJudgementController.dispose();
    this.inputManager.dispose();
    this.lifecycleState = "disposed";
    this.currentGameStateValue = GameState.PlayingSound;
    this.pauseStateValue = PauseState.None;
  }

  private isPaused(): boolean {
    return isPausedState(this.currentGameStateValue, this.pauseStateValue);
  }

  get fault(): EvidenceRequired | null {
    return this.faultValue === null
      ? null
      : { ...this.faultValue, requiredEvidence: [...this.faultValue.requiredEvidence] };
  }

  private latchFault(fault: EvidenceRequired): EvidenceRequired {
    const latched = {
      ...fault,
      requiredEvidence: [...fault.requiredEvidence],
    };
    this.faultValue = latched;
    this.lifecycleState = "faulted";
    return latched;
  }

  snapshot(): InGameManagerSnapshot {
    return {
      state: this.lifecycleState,
      fault: this.fault,
      paused: this.isPaused(),
      currentGameState: this.currentGameStateValue,
      pauseState: this.pauseStateValue,
      musicScore: this.musicScoreController.snapshot(),
      noteManager: this.noteManager.snapshot(),
      inputManager: this.inputManager.snapshot(),
      oneFrame: this.oneFrameJudgementController.snapshot(),
      scoreLifeState: this.scoreLifeStateManager?.snapshot() ?? null,
    };
  }
}
