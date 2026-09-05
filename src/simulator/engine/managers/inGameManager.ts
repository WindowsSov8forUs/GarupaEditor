import {
  integrityFailure,
  ok,
  type SimulatorIntegrityFailure,
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
  RenderOwnerTransaction,
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
import type {
  TapLaneEffectOwner,
  TapLaneEffectSnapshot,
  TapLaneEffectStateTransaction,
  TapLaneEffectTransaction,
} from "./tapLaneEffectOwner";
import { FrameMutationPlan, type FrameMutationParticipant } from "./frameMutationPlan";

export interface InGameManagerSnapshot extends EngineLifecycleSnapshot {
  readonly fault: SimulatorIntegrityFailure | null;
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
  readonly habahiro: Readonly<{
    readonly phase: "idle" | "playing-before-change" | "playing-after-change" | "complete";
    readonly elapsedSeconds: number;
    readonly laneChanged: boolean;
  }> | null;
  readonly playable: boolean;
}

export class InGameManager {
  private lifecycleState: EngineLifecycleState = "created";
  private currentGameStateValue: GameStateValue;
  private pauseStateValue: PauseStateValue = PauseState.None;
  private faultValue: SimulatorIntegrityFailure | null = null;
  private degradedHabahiroLaneChanged = false;
  private habahiroLanePhase: "idle" | "playing-before-change" | "playing-after-change" | "complete" = "idle";
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
      return integrityFailure(
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
    if (fieldSetup?.status === "integrity-failure") return fieldSetup;
    if (fieldSetup?.status === "ok") {
      const committed = fieldSetup.value.commit();
      if (committed.status !== "ok") return committed;
    }
    const tapLaneEffectSetup = this.tapLaneEffect?.preflightInitialize() ?? null;
    if (tapLaneEffectSetup?.status === "integrity-failure") return tapLaneEffectSetup;
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
    if (hudSetup?.status === "integrity-failure") return hudSetup;
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
      return integrityFailure(
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
    const movieUpdate = this.startupDirection?.stepPlayableMovie(deltaTimeSeconds) ?? ok(undefined);
    if (movieUpdate.status !== "ok") return this.latchFault(movieUpdate);
    const primaryGate = this.primaryJudgementAdjustment?.consumeGameplayGate() ?? ok(false);
    if (primaryGate.status !== "ok") return this.latchFault(primaryGate);
    if (primaryGate.value) return this.commitParticleAdvance(deltaTimeSeconds, true);
    const audioFrame = this.audioProducer?.beginOuterFrame() ?? ok(undefined);
    if (audioFrame.status !== "ok") return this.latchFault(audioFrame);
    const updateResult = this.noteManager.execUpdate(deltaTimeSeconds);
    if (updateResult.status !== "ok") {
      return this.latchFault(updateResult);
    }
    const productUpdate = this.garupaProduct?.update(deltaTimeSeconds) ?? ok(undefined);
    if (productUpdate.status !== "ok") return this.latchFault(productUpdate);
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
      const committed = this.commitRenderFrame(laneChange.value, "habahiro-degraded-lane-change");
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
        const committed = this.commitRenderFrame(flash.value, "habahiro-flash-start");
        if (committed.status !== "ok") return this.latchFault(committed);
        this.habahiroLanePhase = "playing-before-change";
        this.habahiroFlashElapsed = Math.fround(0);
      } else if (this.habahiroLanePhase === "playing-before-change" ||
        this.habahiroLanePhase === "playing-after-change") {
        const previousElapsed = this.habahiroFlashElapsed;
        const nextElapsed = Math.fround(Math.min(
          this.renderScene.habahiro.animationCompleteSeconds.value,
          Math.fround(previousElapsed + deltaTimeSeconds),
        ));
        const previous = createRenderFloat32(previousElapsed);
        const next = createRenderFloat32(nextElapsed);
        if (previous.status !== "ok") return this.latchFault(previous);
        if (next.status !== "ok") return this.latchFault(next);
        const advanced = this.renderProducer.preflightHabahiroAnimationAdvance(
          previous.value,
          next.value,
          this.renderScene,
        );
        if (advanced.status !== "ok") return this.latchFault(advanced);
        const committed = this.commitRenderFrame(advanced.value, "habahiro-animation-advance");
        if (committed.status !== "ok") return this.latchFault(committed);
        const changed = previousElapsed < this.renderScene.habahiro.changeLaneSeconds.value &&
          nextElapsed >= this.renderScene.habahiro.changeLaneSeconds.value;
        if (changed) this.noteManager.commitHabahiroLaneChangeGeometry();
        this.habahiroFlashElapsed = nextElapsed;
        this.habahiroLanePhase = nextElapsed >= this.renderScene.habahiro.animationCompleteSeconds.value
          ? "complete"
          : changed || this.habahiroLanePhase === "playing-after-change"
            ? "playing-after-change"
            : "playing-before-change";
      }
    }
    const hudAnimation = this.renderProducer?.preflightHudAnimationAdvance(deltaTimeSeconds) ?? null;
    if (hudAnimation?.status === "integrity-failure") {
      return this.latchFault(hudAnimation);
    }
    if (hudAnimation?.status === "ok") {
      const committed = this.commitRenderFrame(hudAnimation.value, "hud-animation-advance");
      if (committed.status !== "ok") return this.latchFault(committed);
    }
    let particleAdvanced = false;
    let firstJudgementBatch = true;
    while (this.oneFrameJudgementController.existsOneFrameData()) {
      const reflectPlan =
        this.oneFrameJudgementController.preflightReflectOneFrameData();
      if (reflectPlan.status !== "ok") return this.latchFault(reflectPlan);
      if (reflectPlan.value !== null) {
        const batch = reflectPlan.value.batch;
        const batchDeltaTimeSeconds = firstJudgementBatch ? deltaTimeSeconds : Math.fround(0);
        const lifeBefore = this.scoreLifeStateManager?.record.currentLife ?? null;
        const businessPlan = this.scoreLifeStateManager?.preflightReflect(batch) ?? null;
        if (businessPlan?.status === "integrity-failure") {
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
          batchDeltaTimeSeconds,
          batch,
          terminalGameOver,
        ) ?? null;
        if (particlePlan?.status === "integrity-failure") {
          if (businessPlan?.status === "ok") {
            this.scoreLifeStateManager!.discardReflect(businessPlan.value);
          }
          this.oneFrameJudgementController.discardReflectOneFrameData(reflectPlan.value);
          return this.latchFault(particlePlan);
        }
        const audioPlan = this.audioProducer?.preflightJudgement(batch, terminalGameOver) ?? null;
        if (audioPlan?.status === "integrity-failure") {
          if (particlePlan?.status === "ok") particlePlan.value.discard();
          if (businessPlan?.status === "ok") {
            this.scoreLifeStateManager!.discardReflect(businessPlan.value);
          }
          this.oneFrameJudgementController.discardReflectOneFrameData(
            reflectPlan.value,
          );
          return this.latchFault(audioPlan);
        }
        const canCombineTapLane = businessPlan?.status === "ok" && this.renderProducer !== null;
        const tapLaneEffectStatePlan: SimulatorResult<TapLaneEffectStateTransaction | null> | null = canCombineTapLane
          ? terminalGameOver
            ? this.tapLaneEffect?.preflightAllOffState() ?? null
            : this.tapLaneEffect?.preflightJudgementState(batch) ?? null
          : null;
        if (tapLaneEffectStatePlan?.status === "integrity-failure") {
          if (particlePlan?.status === "ok") particlePlan.value.discard();
          if (audioPlan?.status === "ok") audioPlan.value.discard();
          if (businessPlan?.status === "ok") this.scoreLifeStateManager!.discardReflect(businessPlan.value);
          this.oneFrameJudgementController.discardReflectOneFrameData(reflectPlan.value);
          return this.latchFault(tapLaneEffectStatePlan);
        }
        const detachedTapLane = tapLaneEffectStatePlan?.status === "ok"
          ? tapLaneEffectStatePlan.value
          : null;
        const renderPlan = businessPlan?.status === "ok"
          ? this.renderProducer?.preflightHudReflect(
              businessPlan.value,
              batchDeltaTimeSeconds,
              detachedTapLane?.renderStates ?? Object.freeze([]),
            ) ?? null
          : null;
        if (renderPlan?.status === "integrity-failure") {
          if (particlePlan?.status === "ok") particlePlan.value.discard();
          if (audioPlan?.status === "ok") audioPlan.value.discard();
          detachedTapLane?.discard();
          this.scoreLifeStateManager!.discardReflect(businessPlan!.value);
          this.oneFrameJudgementController.discardReflectOneFrameData(
            reflectPlan.value,
          );
          return this.latchFault(renderPlan);
        }
        const productReflect = this.garupaProduct?.preflightReflectJudgementBatch(batch) ?? null;
        if (productReflect?.status === "integrity-failure") {
          if (particlePlan?.status === "ok") particlePlan.value.discard();
          if (audioPlan?.status === "ok") audioPlan.value.discard();
          if (renderPlan?.status === "ok") renderPlan.value.discard();
          detachedTapLane?.discard();
          if (businessPlan?.status === "ok") this.scoreLifeStateManager!.discardReflect(businessPlan.value);
          this.oneFrameJudgementController.discardReflectOneFrameData(reflectPlan.value);
          return this.latchFault(productReflect);
        }
        const participants: FrameMutationParticipant[] = [];
        participants.push(Object.freeze({
          identity: "one-frame",
          publishOwner: (): SimulatorResult<void> => {
            const reflected = this.oneFrameJudgementController.commitReflectOneFrameData(reflectPlan.value!);
            return reflected.status === "ok" ? ok(undefined) : reflected;
          },
          discard: () => this.oneFrameJudgementController.discardReflectOneFrameData(reflectPlan.value!),
        }));
        if (businessPlan?.status === "ok") participants.push(Object.freeze({
          identity: "score-life",
          publishOwner: () => this.scoreLifeStateManager!.commitReflect(businessPlan.value),
          discard: () => this.scoreLifeStateManager!.discardReflect(businessPlan.value),
        }));
        if (productReflect?.status === "ok" && productReflect.value !== null) participants.push(Object.freeze({
          identity: "product-reflect",
          publishOwner: () => productReflect.value!.publishOwner(),
          discard: () => productReflect.value!.discard(),
        }));
        if (particlePlan?.status === "ok") participants.push(Object.freeze({
          identity: "particle",
          commitExternal: () => particlePlan.value.commitExternal(),
          publishOwner: () => particlePlan.value.publishDomain(),
          discard: () => particlePlan.value.discard(),
        }));
        if (audioPlan?.status === "ok") participants.push(Object.freeze({
          identity: "audio",
          commitExternal: () => audioPlan.value.commitBackend(),
          publishOwner: () => audioPlan.value.publishOwner(),
          discard: () => audioPlan.value.discard(),
        }));
        if (renderPlan?.status === "ok") participants.push(Object.freeze({
          identity: "render",
          commitExternal: () => renderPlan.value.commitBackend(),
          publishOwner: () => renderPlan.value.publishOwner(),
          discard: () => renderPlan.value.discard(),
        }));
        if (detachedTapLane !== null) participants.push(Object.freeze({
          identity: "tap-lane",
          publishOwner: () => detachedTapLane.publishOwner(),
          discard: () => detachedTapLane.discard(),
        }));
        const ownerOrder = participants.map((participant) => participant.identity);
        const externalOrder = ["audio", "render", "particle"].filter((identity) =>
          participants.some((participant) => participant.identity === identity));
        const framePlan = FrameMutationPlan.create(participants, externalOrder, ownerOrder);
        if (framePlan.status !== "ok") {
          for (const participant of [...participants].reverse()) participant.discard();
          return this.latchFault(framePlan);
        }
        const committedFrame = framePlan.value.commit();
        if (committedFrame.status !== "ok") return this.latchFault(committedFrame);
        particleAdvanced ||= particlePlan?.status === "ok";
        firstJudgementBatch = false;
        const nextProductBatch = this.garupaProduct?.submitPendingJudgementBatch() ?? ok({
          submitted: 0,
          remaining: 0,
        });
        if (nextProductBatch.status !== "ok") return this.latchFault(nextProductBatch);
        if (nextProductBatch.value.remaining > 0 && nextProductBatch.value.submitted === 0 &&
          !this.oneFrameJudgementController.existsOneFrameData()) {
          return this.latchFault(integrityFailure(
            "one-frame.product-batch-no-progress",
            ["PLSO-O01", "PLSO-B01"],
            "A product due set must reserve at least one free fixed-pool slot after Reflect/release.",
          ));
        }
      }
    }
    const tapLaneEffectAdvance = this.tapLaneEffect?.preflightAdvance(deltaTimeSeconds) ?? null;
    if (tapLaneEffectAdvance?.status === "integrity-failure") {
      return this.latchFault(tapLaneEffectAdvance);
    }
    const particleAdvance = !particleAdvanced
      ? this.particleCoordinator?.preflightAdvance(deltaTimeSeconds, false) ?? null
      : null;
    if (particleAdvance?.status === "integrity-failure") {
      if (tapLaneEffectAdvance?.status === "ok" && tapLaneEffectAdvance.value !== null) {
        tapLaneEffectAdvance.value.discard();
      }
      return this.latchFault(particleAdvance);
    }
    const advanceParticipants: FrameMutationParticipant[] = [];
    if (tapLaneEffectAdvance?.status === "ok" && tapLaneEffectAdvance.value !== null) {
      advanceParticipants.push(Object.freeze({
        identity: "tap-lane-advance",
        commitExternal: () => tapLaneEffectAdvance.value!.commitBackend(),
        publishOwner: () => tapLaneEffectAdvance.value!.publishOwner(),
        discard: () => tapLaneEffectAdvance.value!.discard(),
      }));
    }
    if (particleAdvance?.status === "ok") advanceParticipants.push(Object.freeze({
      identity: "particle-advance",
      commitExternal: () => particleAdvance.value.commitExternal(),
      publishOwner: () => particleAdvance.value.publishDomain(),
      discard: () => particleAdvance.value.discard(),
    }));
    if (advanceParticipants.length === 0) {
      return this.audioProducer?.commitOuterFrame() ?? ok(undefined);
    }
    const advancePlan = FrameMutationPlan.create(
      advanceParticipants,
      advanceParticipants.map((participant) => participant.identity),
      advanceParticipants.map((participant) => participant.identity),
    );
    if (advancePlan.status !== "ok") {
      for (const participant of [...advanceParticipants].reverse()) participant.discard();
      return this.latchFault(advancePlan);
    }
    const advanced = advancePlan.value.commit();
    if (advanced.status !== "ok") return this.latchFault(advanced);
    const audioFrameCommitted = this.audioProducer?.commitOuterFrame() ?? ok(undefined);
    return audioFrameCommitted.status === "ok"
      ? audioFrameCommitted
      : this.latchFault(audioFrameCommitted);
  }

  continueLive(): SimulatorResult<void> {
    if (this.faultValue !== null) return this.faultValue;
    if (this.scoreLifeStateManager === null) {
      return integrityFailure(
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
      return integrityFailure(
        "ingame.adjusted-position-outside-initialized-lifecycle",
        [],
        "The recovered adjusted-position owner is only available for an initialized live.",
      );
    }
    return ok(this.noteManager.getAdjustedMusicPosition());
  }

  preflightTapLaneEffectsAllOff(): SimulatorResult<TapLaneEffectTransaction | null> {
    if (this.faultValue !== null) return this.faultValue;
    if (this.lifecycleState !== "initialized") {
      return integrityFailure(
        "render.tap-lane-effect.cleanup-outside-initialized-lifecycle",
        ["OLS-R05", "OLS-P01"],
        "Lane-effect all-off preflight belongs to one initialized session owner.",
      );
    }
    return this.tapLaneEffect?.preflightAllOff() ?? ok(null);
  }

  preflightTapLaneEffectsAllOffState(): SimulatorResult<TapLaneEffectStateTransaction | null> {
    if (this.faultValue !== null) return this.faultValue;
    if (this.lifecycleState !== "initialized") {
      return integrityFailure(
        "render.tap-lane-effect.cleanup-outside-initialized-lifecycle",
        ["OLS-R05", "OLS-P01"],
        "Lane-effect all-off state preflight belongs to one initialized session owner.",
      );
    }
    return this.tapLaneEffect?.preflightAllOffState() ?? ok(null);
  }

  clearTapLaneEffects(): SimulatorResult<void> {
    if (this.faultValue !== null) return this.faultValue;
    if (this.lifecycleState !== "initialized") {
      return integrityFailure(
        "render.tap-lane-effect.cleanup-outside-initialized-lifecycle",
        ["OLS-R05", "OLS-P01"],
        "Lane-effect all-off cleanup belongs to one initialized session owner.",
      );
    }
    const laneEffect = this.tapLaneEffect?.preflightAllOff() ?? null;
    if (laneEffect?.status === "integrity-failure") return this.latchFault(laneEffect);
    if (laneEffect?.status === "ok" && laneEffect.value !== null) {
      const committed = laneEffect.value.commit();
      if (committed.status !== "ok") return this.latchFault(committed);
    }
    return ok(undefined);
  }

  pause(
    preparedLaneEffect?: TapLaneEffectTransaction | null,
  ): SimulatorResult<void> {
    if (this.faultValue !== null) {
      return this.faultValue;
    }
    if (this.lifecycleState !== "initialized") {
      return integrityFailure(
        "ingame.pause-outside-initialized-lifecycle",
        [],
        "The recovered scheduling freeze is only represented for an initialized live.",
      );
    }
    if (this.currentGameStateValue === GameState.PauseSound) return ok(undefined);
    if (this.currentGameStateValue !== GameState.PlayingSound) {
      return integrityFailure(
        "startup-direction.pause-outside-playing-sound",
        ["SD09", "MVL-R03"],
        "Pause is available only from PlayingSound; MovieBeforeSound and every other opening/terminal state fail closed.",
      );
    }
    if (this.isPaused()) return ok(undefined);
    const laneEffect = preparedLaneEffect === undefined
      ? this.preflightTapLaneEffectsAllOff()
      : ok(preparedLaneEffect);
    if (laneEffect.status !== "ok") return laneEffect;
    const movie = this.startupDirection?.pauseMovie() ?? ok(undefined);
    if (movie.status !== "ok") {
      laneEffect.value?.discard();
      return this.latchFault(movie);
    }
    if (laneEffect.value !== null) {
      const external = laneEffect.value.commitBackend();
      if (external.status !== "ok") return this.latchFault(external);
      const published = laneEffect.value.publishOwner();
      if (published.status !== "ok") return this.latchFault(published);
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
      return integrityFailure(
        "ingame.resume-outside-initialized-lifecycle",
        [],
        "The recovered resume path is only represented for an initialized live.",
      );
    }
    if (this.currentGameStateValue === GameState.PlayingSound) return ok(undefined);
    if (this.currentGameStateValue !== GameState.PauseSound) {
      return integrityFailure(
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
    if (tapLaneEffectDispose?.status === "integrity-failure") return tapLaneEffectDispose;
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

  private commitRenderFrame(
    transaction: RenderOwnerTransaction,
    identity: string,
  ): SimulatorResult<void> {
    const participant: FrameMutationParticipant = Object.freeze({
      identity,
      commitExternal: () => transaction.commitBackend(),
      publishOwner: () => transaction.publishOwner(),
      discard: () => transaction.discard(),
    });
    const plan = FrameMutationPlan.create([participant], [identity], [identity]);
    return plan.status === "ok" ? plan.value.commit() : plan;
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
    const external = transaction.commitExternal();
    return external.status === "ok" ? transaction.publishDomain() : external;
  }

  private isPaused(): boolean {
    return isPausedState(this.currentGameStateValue, this.pauseStateValue);
  }

  get fault(): SimulatorIntegrityFailure | null {
    return this.faultValue === null
      ? null
      : { ...this.faultValue, requiredEvidence: [...this.faultValue.requiredEvidence] };
  }

  latchExternalFault(fault: SimulatorIntegrityFailure): SimulatorIntegrityFailure {
    return this.latchFault(fault);
  }

  private latchFault(fault: SimulatorIntegrityFailure): SimulatorIntegrityFailure {
    if (this.faultValue !== null) return this.faultValue;
    const latched = {
      ...fault,
      requiredEvidence: [...fault.requiredEvidence],
    };
    this.audioProducer?.discardOuterFrame();
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
      habahiro: this.renderProducer?.isCompleteHabahiro() === true
        ? Object.freeze({
            phase: this.habahiroLanePhase,
            elapsedSeconds: this.habahiroFlashElapsed,
            laneChanged: this.habahiroLanePhase === "playing-after-change" || this.habahiroLanePhase === "complete",
          })
        : null,
      playable: (this.startupDirection?.snapshot().playable ?? true) &&
        this.primaryJudgementAdjustment?.snapshot().gameplayBlocked !== true,
    };
  }
}
