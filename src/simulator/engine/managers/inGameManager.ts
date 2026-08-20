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
import { InputManager } from "./inputBoundaries";
import { NoteManager } from "./noteManager";
import type {
  OrdinaryFixedNoteSceneInput,
  RenderCommandProducer,
} from "../rendering/renderCommandProducer";
import { createRenderFloat32 } from "../../backends/renderingValidation";
import type { AudioCommandProducer } from "../audio/audioCommandProducer";
import type {
  ParticleFrameCoordinator,
  ParticleOuterFrameTransaction,
} from "../particles/particleFrameCoordinator";
import type {
  StartupDirectionController,
  StartupDirectionSnapshot,
} from "./startupDirectionController";
import type {
  GarupaProductTimelineManager,
  GarupaProductTimelineSnapshot,
} from "../garupa/productTimelineManager";
import type {
  PrimaryJudgementAdjustmentOwner,
  PrimaryJudgementAdjustmentSnapshot,
} from "./primaryJudgementAdjustmentOwner";
import type { TapLaneEffectOwner, TapLaneEffectSnapshot } from "./tapLaneEffectOwner";

export interface InGameManagerSnapshot extends EngineLifecycleSnapshot {
  readonly fault: EvidenceRequired | null;
  readonly currentGameState: GameStateValue;
  readonly pauseState: PauseStateValue;
  readonly musicScore: ReturnType<InGameMusicScoreController["snapshot"]>;
  readonly noteManager: ReturnType<NoteManager["snapshot"]>;
  readonly inputManager: ReturnType<InputManager["snapshot"]>;
  readonly oneFrame: ReturnType<InGameOneFrameJudgementController["snapshot"]>;
  readonly scoreLifeState: ReturnType<ScoreLifeStateManager["snapshot"]> | null;
  readonly particle: ReturnType<ParticleFrameCoordinator["producer"]["snapshot"]> | null;
  readonly startupDirection: StartupDirectionSnapshot | null;
  readonly garupaProduct: GarupaProductTimelineSnapshot | null;
  readonly primaryJudgementAdjustment: PrimaryJudgementAdjustmentSnapshot | null;
  readonly tapLaneEffect: TapLaneEffectSnapshot | null;
  readonly playable: boolean;
}

export class InGameManager {
  private lifecycleState: EngineLifecycleState = "created";
  private currentGameStateValue: GameStateValue;
  private pauseStateValue: PauseStateValue = PauseState.None;
  private faultValue: EvidenceRequired | null = null;
  private degradedHabahiroLaneChanged = false;
  private habahiroLanePhase: "idle" | "flashing" | "complete" = "idle";
  private habahiroFlashElapsed = Math.fround(0);

  constructor(
    readonly musicScoreController: InGameMusicScoreController,
    readonly noteManager: NoteManager,
    readonly oneFrameJudgementController: InGameOneFrameJudgementController,
    readonly inputManager: InputManager,
    readonly scoreLifeStateManager: ScoreLifeStateManager | null = null,
    private readonly renderProducer: RenderCommandProducer | null = null,
    private readonly audioProducer: AudioCommandProducer | null = null,
    private readonly particleCoordinator: ParticleFrameCoordinator | null = null,
    private readonly habahiroChangeAbsolutePos = -1,
    private readonly renderScene: OrdinaryFixedNoteSceneInput | null = null,
    private readonly startupDirection: StartupDirectionController | null = null,
    private readonly garupaProduct: GarupaProductTimelineManager | null = null,
    private readonly primaryJudgementAdjustment: PrimaryJudgementAdjustmentOwner | null = null,
    private readonly tapLaneEffect: TapLaneEffectOwner | null = null,
  ) {
    this.currentGameStateValue = startupDirection === null
      ? GameState.PlayingSound
      : GameState.Prepare;
  }

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

    const primary = this.primaryJudgementAdjustment?.initialize(
      this.startupDirection !== null,
    ) ?? ok(undefined);
    if (primary.status !== "ok") return primary;
    const startup = this.startupDirection?.initialize() ?? ok(undefined);
    if (startup.status !== "ok") return startup;
    const noteValidation = this.noteManager.validateSetup();
    if (noteValidation.status !== "ok") {
      return noteValidation;
    }
    const fieldSetup = this.renderScene?.field !== undefined
      ? this.renderProducer?.preflightFieldSetup(
          this.renderScene.field.objects,
          this.renderScene.field.masks,
        ) ?? null
      : this.renderProducer?.isCompleteHabahiro() === true &&
          this.renderScene?.habahiro !== undefined
        ? this.renderProducer.preflightFieldSetup(
            this.renderScene.habahiro.fieldBefore,
            this.renderScene.habahiro.fieldMasks,
          )
        : null;
    if (fieldSetup?.status === "evidence-required") return fieldSetup;
    if (fieldSetup?.status === "ok") {
      const committed = fieldSetup.value.commit();
      if (committed.status !== "ok") return committed;
    }
    const tapLaneEffectSetup = this.tapLaneEffect?.preflightInitialize() ?? null;
    if (tapLaneEffectSetup?.status === "evidence-required") return tapLaneEffectSetup;
    if (tapLaneEffectSetup?.status === "ok") {
      const committed = tapLaneEffectSetup.value.commit();
      if (committed.status !== "ok") return committed;
    }
    const hudSetup = this.scoreLifeStateManager !== null && this.renderProducer !== null
      ? this.renderProducer.preflightHudSetup(
          this.scoreLifeStateManager.record.snapshot(),
          this.scoreLifeStateManager.scoreGauge.snapshot(),
        )
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
    const productInitialization = this.garupaProduct?.initialize() ?? ok(undefined);
    if (productInitialization.status !== "ok") return productInitialization;
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
    if (this.startupDirection !== null && !this.startupDirection.snapshot().playable) {
      const startup = this.startupDirection.step(deltaTimeSeconds);
      if (startup.status !== "ok") return this.latchFault(startup);
      this.currentGameStateValue = this.startupDirection.snapshot().currentGameState;
      return ok(undefined);
    }
    if (this.currentGameStateValue === GameState.PauseNone) {
      return this.commitParticleAdvance(deltaTimeSeconds, true);
    }
    const inputResult = this.inputManager.execInput(this.currentGameStateValue);
    if (inputResult.status !== "ok") {
      return inputResult;
    }
    if (this.currentGameStateValue === GameState.PauseSound) {
      return this.commitParticleAdvance(deltaTimeSeconds, true);
    }
    const primaryGate = this.primaryJudgementAdjustment?.consumeGameplayGate() ?? ok(false);
    if (primaryGate.status !== "ok") return this.latchFault(primaryGate);
    if (primaryGate.value) return this.commitParticleAdvance(deltaTimeSeconds, true);
    this.audioProducer?.beginOuterFrame();
    const updateResult = this.noteManager.execUpdate(deltaTimeSeconds);
    if (updateResult.status !== "ok") {
      return this.latchFault(updateResult);
    }
    const productUpdate = this.garupaProduct?.update() ?? ok(undefined);
    if (productUpdate.status !== "ok") return this.latchFault(productUpdate);
    const tapLaneEffectAdvance = this.tapLaneEffect?.preflightAdvance() ?? null;
    if (tapLaneEffectAdvance?.status === "evidence-required") {
      return this.latchFault(tapLaneEffectAdvance);
    }
    if (tapLaneEffectAdvance?.status === "ok" && tapLaneEffectAdvance.value !== null) {
      const committed = tapLaneEffectAdvance.value.commit();
      if (committed.status !== "ok") return this.latchFault(committed);
    }
    if (
      !this.degradedHabahiroLaneChanged &&
      this.renderProducer?.isDegradedHabahiro() === true &&
      this.habahiroChangeAbsolutePos >= 0 &&
      this.noteManager.peekAdjustedMusicPosition() >= this.habahiroChangeAbsolutePos
    ) {
      const laneChange = this.renderProducer.preflightDegradedHabahiroLaneChange(
        this.habahiroChangeAbsolutePos,
      );
      if (laneChange.status !== "ok") return this.latchFault(laneChange);
      const committed = laneChange.value.commit();
      if (committed.status !== "ok") return this.latchFault(committed);
      this.degradedHabahiroLaneChanged = true;
    }
    if (
      this.renderProducer?.isCompleteHabahiro() === true &&
      this.renderScene?.habahiro !== undefined &&
      this.habahiroChangeAbsolutePos >= 0
    ) {
      if (
        this.habahiroLanePhase === "idle" &&
        this.noteManager.peekAdjustedMusicPosition() >= this.habahiroChangeAbsolutePos
      ) {
        const flash = this.renderProducer.preflightHabahiroFlashStart(
          this.habahiroChangeAbsolutePos,
        );
        if (flash.status !== "ok") return this.latchFault(flash);
        const committed = flash.value.commit();
        if (committed.status !== "ok") return this.latchFault(committed);
        this.habahiroLanePhase = "flashing";
        this.habahiroFlashElapsed = Math.fround(0);
      } else if (this.habahiroLanePhase === "flashing") {
        const nextElapsed = Math.fround(this.habahiroFlashElapsed + deltaTimeSeconds);
        if (nextElapsed >= this.renderScene.habahiro.flashDurationSeconds.value) {
          const laneChange = this.renderProducer.preflightHabahiroLaneChange(
            this.habahiroChangeAbsolutePos,
            this.renderScene,
          );
          if (laneChange.status !== "ok") return this.latchFault(laneChange);
          const committed = laneChange.value.commit();
          if (committed.status !== "ok") return this.latchFault(committed);
          this.noteManager.commitHabahiroLaneChangeGeometry();
          this.habahiroLanePhase = "complete";
          this.habahiroFlashElapsed = nextElapsed;
        } else {
          const elapsed = createRenderFloat32(nextElapsed);
          if (elapsed.status !== "ok") return this.latchFault(elapsed);
          const sample = this.renderProducer.preflightHabahiroFlashAdvance(elapsed.value);
          if (sample.status !== "ok") return this.latchFault(sample);
          const committed = sample.value.commit();
          if (committed.status !== "ok") return this.latchFault(committed);
          this.habahiroFlashElapsed = nextElapsed;
        }
      }
    }
    const hudAnimation = this.renderProducer?.preflightHudAnimationAdvance(deltaTimeSeconds) ?? null;
    if (hudAnimation?.status === "evidence-required") {
      return this.latchFault(hudAnimation);
    }
    if (hudAnimation?.status === "ok") {
      const committed = hudAnimation.value.commit();
      if (committed.status !== "ok") return this.latchFault(committed);
    }
    let particleAdvanced = false;
    if (this.oneFrameJudgementController.existsOneFrameData()) {
      const reflectPlan =
        this.oneFrameJudgementController.preflightReflectOneFrameData();
      if (reflectPlan.status !== "ok") return this.latchFault(reflectPlan);
      if (reflectPlan.value !== null) {
        const batch = reflectPlan.value.batch;
        const lifeBefore = this.scoreLifeStateManager?.record.currentLife ?? null;
        const businessPlan = this.scoreLifeStateManager?.preflightReflect(batch) ?? null;
        if (businessPlan?.status === "evidence-required") {
          this.oneFrameJudgementController.discardReflectOneFrameData(
            reflectPlan.value,
          );
          return this.latchFault(businessPlan);
        }
        const gameOver = businessPlan?.status === "ok" && lifeBefore !== null &&
          lifeBefore > 0 && businessPlan.value.record.currentLife <= 0;
        const terminalGameOver = gameOver &&
          this.noteManager.snapshot().calculatedData.sessionMode === "live";
        const particlePlan = this.particleCoordinator?.preflightJudgement(
          deltaTimeSeconds,
          batch,
          terminalGameOver,
        ) ?? null;
        if (particlePlan?.status === "evidence-required") {
          if (businessPlan?.status === "ok") {
            this.scoreLifeStateManager!.discardReflect(businessPlan.value);
          }
          this.oneFrameJudgementController.discardReflectOneFrameData(reflectPlan.value);
          return this.latchFault(particlePlan);
        }
        const audioPlan = this.audioProducer?.preflightJudgement(batch, terminalGameOver) ?? null;
        if (audioPlan?.status === "evidence-required") {
          if (particlePlan?.status === "ok") particlePlan.value.discard();
          if (businessPlan?.status === "ok") {
            this.scoreLifeStateManager!.discardReflect(businessPlan.value);
          }
          this.oneFrameJudgementController.discardReflectOneFrameData(
            reflectPlan.value,
          );
          return this.latchFault(audioPlan);
        }
        const renderPlan = businessPlan?.status === "ok"
          ? this.renderProducer?.preflightHudReflect(businessPlan.value) ?? null
          : null;
        if (renderPlan?.status === "evidence-required") {
          if (particlePlan?.status === "ok") particlePlan.value.discard();
          if (audioPlan?.status === "ok") audioPlan.value.discard();
          this.scoreLifeStateManager!.discardReflect(businessPlan!.value);
          this.oneFrameJudgementController.discardReflectOneFrameData(
            reflectPlan.value,
          );
          return this.latchFault(renderPlan);
        }
        const reflected =
          this.oneFrameJudgementController.commitReflectOneFrameData(
            reflectPlan.value,
          );
        if (reflected.status !== "ok") {
          if (businessPlan?.status === "ok") {
            this.scoreLifeStateManager!.discardReflect(businessPlan.value);
          }
          if (particlePlan?.status === "ok") particlePlan.value.discard();
          if (audioPlan?.status === "ok") audioPlan.value.discard();
          if (renderPlan?.status === "ok") renderPlan.value.discard();
          return this.latchFault(reflected);
        }
        if (businessPlan?.status === "ok") {
          const businessReflect = this.scoreLifeStateManager!.commitReflect(
            businessPlan.value,
          );
          if (businessReflect.status !== "ok") {
            if (particlePlan?.status === "ok") particlePlan.value.discard();
            if (audioPlan?.status === "ok") audioPlan.value.discard();
            if (renderPlan?.status === "ok") renderPlan.value.discard();
              return this.latchFault(businessReflect);
          }
        }
        if (particlePlan?.status === "ok") {
          const committed = particlePlan.value.commitDomain();
          if (committed.status !== "ok") {
            if (audioPlan?.status === "ok") audioPlan.value.discard();
            if (renderPlan?.status === "ok") renderPlan.value.discard();
              return this.latchFault(committed);
          }
        }
        if (audioPlan?.status === "ok") {
          const committed = audioPlan.value.commit();
          if (committed.status !== "ok") {
            if (particlePlan?.status === "ok") particlePlan.value.discardRenderAfterDomainFault();
            if (renderPlan?.status === "ok") renderPlan.value.discard();
              return this.latchFault(committed);
          }
        }
        if (renderPlan?.status === "ok") {
          const committed = renderPlan.value.commit();
          if (committed.status !== "ok") {
            if (particlePlan?.status === "ok") particlePlan.value.discardRenderAfterDomainFault();
              return this.latchFault(committed);
          }
        }
        const tapLaneEffectPlan = this.tapLaneEffect?.preflightJudgement(batch) ?? null;
        if (tapLaneEffectPlan?.status === "evidence-required") {
          if (particlePlan?.status === "ok") particlePlan.value.discardRenderAfterDomainFault();
          return this.latchFault(tapLaneEffectPlan);
        }
        if (tapLaneEffectPlan?.status === "ok" && tapLaneEffectPlan.value !== null) {
          const committed = tapLaneEffectPlan.value.commit();
          if (committed.status !== "ok") {
            if (particlePlan?.status === "ok") particlePlan.value.discardRenderAfterDomainFault();
            return this.latchFault(committed);
          }
        }
        if (particlePlan?.status === "ok") {
          const committed = particlePlan.value.commitRender();
          if (committed.status !== "ok") return this.latchFault(committed);
          particleAdvanced = true;
        }
      }
    }
    if (!particleAdvanced) {
      const advanced = this.commitParticleAdvance(deltaTimeSeconds, false);
      if (advanced.status !== "ok") return this.latchFault(advanced);
    }
    return ok(undefined);
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
    if (this.currentGameStateValue === GameState.PauseSound) return ok(undefined);
    if (this.currentGameStateValue !== GameState.PlayingSound) {
      return evidenceRequired(
        "startup-direction.pause-outside-playing-sound",
        ["SD09", "MVL-R03"],
        "Pause is available only from PlayingSound; MovieBeforeSound and every other opening/terminal state fail closed.",
      );
    }
    if (this.isPaused()) return ok(undefined);
    const movie = this.startupDirection?.pauseMovie() ?? ok(undefined);
    if (movie.status !== "ok") return this.latchFault(movie);
    const laneEffect = this.tapLaneEffect?.preflightAllOff() ?? null;
    if (laneEffect?.status === "evidence-required") return this.latchFault(laneEffect);
    if (laneEffect?.status === "ok" && laneEffect.value !== null) {
      const committed = laneEffect.value.commit();
      if (committed.status !== "ok") return this.latchFault(committed);
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
    if (this.currentGameStateValue === GameState.PlayingSound) return ok(undefined);
    if (this.currentGameStateValue !== GameState.PauseSound) {
      return evidenceRequired(
        "startup-direction.resume-outside-pause-sound",
        ["SD09", "MVL-R04"],
        "Resume is available only from PauseSound; MovieBeforeSound and every other opening/terminal state fail closed.",
      );
    }
    if (!this.isPaused()) return ok(undefined);
    const movie = this.startupDirection?.resumeMovie() ?? ok(undefined);
    if (movie.status !== "ok") return this.latchFault(movie);
    this.currentGameStateValue = GameState.PlayingSound;
    this.pauseStateValue = PauseState.None;
    return ok(undefined);
  }

  dispose(): SimulatorResult<void> {
    if (this.lifecycleState === "disposed") {
      return ok(undefined);
    }
    const movieStop = this.startupDirection?.stopMovie() ?? ok(undefined);
    if (movieStop.status !== "ok") return movieStop;
    const productDispose = this.garupaProduct?.preflightDispose() ?? ok(null);
    if (productDispose.status !== "ok") return productDispose;
    const noteDispose = this.noteManager.dispose();
    if (noteDispose.status !== "ok") {
      if (productDispose.value !== null) productDispose.value.discard();
      return noteDispose;
    }
    if (productDispose.value !== null) {
      const committed = productDispose.value.commit();
      if (committed.status !== "ok") return committed;
    }
    const tapLaneEffectDispose = this.tapLaneEffect?.preflightAllOff() ?? null;
    if (tapLaneEffectDispose?.status === "evidence-required") return tapLaneEffectDispose;
    if (tapLaneEffectDispose?.status === "ok" && tapLaneEffectDispose.value !== null) {
      const committed = tapLaneEffectDispose.value.commit();
      if (committed.status !== "ok") return committed;
    }
    this.garupaProduct?.commitDispose();
    this.finishDispose();
    return ok(undefined);
  }

  disposeAfterTerminalBackendFault(): void {
    if (this.lifecycleState === "disposed") return;
    this.noteManager.disposeAfterTerminalRendererFault();
    this.garupaProduct?.commitDispose();
    this.finishDispose();
  }

  disposeAfterTerminalRendererFault(): void {
    this.disposeAfterTerminalBackendFault();
  }

  private finishDispose(): void {
    this.oneFrameJudgementController.dispose();
    this.inputManager.dispose();
    this.startupDirection?.dispose();
    this.lifecycleState = "disposed";
    this.currentGameStateValue = this.startupDirection === null ? GameState.PlayingSound : GameState.Prepare;
    this.pauseStateValue = PauseState.None;
  }

  private commitParticleAdvance(
    deltaTimeSeconds: number,
    paused: boolean,
  ): SimulatorResult<void> {
    const planned = this.particleCoordinator?.preflightAdvance(deltaTimeSeconds, paused) ?? null;
    if (planned === null) return ok(undefined);
    if (planned.status !== "ok") return planned;
    return this.commitParticleTransaction(planned.value);
  }

  private commitParticleTransaction(
    transaction: ParticleOuterFrameTransaction,
  ): SimulatorResult<void> {
    const domain = transaction.commitDomain();
    return domain.status === "ok" ? transaction.commitRender() : domain;
  }

  private isPaused(): boolean {
    return isPausedState(this.currentGameStateValue, this.pauseStateValue);
  }

  get fault(): EvidenceRequired | null {
    return this.faultValue === null
      ? null
      : { ...this.faultValue, requiredEvidence: [...this.faultValue.requiredEvidence] };
  }

  latchExternalFault(fault: EvidenceRequired): EvidenceRequired {
    return this.latchFault(fault);
  }

  private latchFault(fault: EvidenceRequired): EvidenceRequired {
    if (this.faultValue !== null) return this.faultValue;
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
      particle: this.particleCoordinator?.producer.snapshot() ?? null,
      startupDirection: this.startupDirection?.snapshot() ?? null,
      garupaProduct: this.garupaProduct?.snapshot() ?? null,
      primaryJudgementAdjustment: this.primaryJudgementAdjustment?.snapshot() ?? null,
      tapLaneEffect: this.tapLaneEffect?.snapshot() ?? null,
      playable: (this.startupDirection?.snapshot().playable ?? true) &&
        this.primaryJudgementAdjustment?.snapshot().gameplayBlocked !== true,
    };
  }
}
