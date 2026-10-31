import {
  integrityFailure,
  ok,
  type SimulatorIntegrityFailure,
  type SimulatorResult,
} from "../result";
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

export interface InGamePlaybackState {
  readonly playable: boolean;
  readonly paused: boolean;
  readonly currentGameState: GameStateValue;
  readonly startupPlayable: boolean;
  readonly gameplayBlocked: boolean;
  readonly hudAlpha: number;
  readonly singleGameOver: boolean;
  readonly startupScene: StartupDirectionSnapshot["scene"] | null;
  /** MoveTimeWaitForPlay (15) waits for the countdown; MoveTimeFinished (16) and the following
   * PlayingNone (4) resume to PlayingSound. */
  readonly moveTimePhase: "none" | "waiting" | "resuming";
}

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
  private habahiroLanePhase: "idle" | "playing-before-change" | "playing-after-change" | "complete" = "idle";
  private habahiroFlashElapsed = Math.fround(0);
  /** onResumeFromMoveTime writes 16 inside the countdown's animation event, after this frame's
   * ExecUpdate; the following ExecUpdate writes 4. */
  private moveTimeResumeWrittenThisFrame = false;
  /** judgeAdjustFastProcess started by updatePlayingSound after a MoveTime, until PlayMusic. */
  private moveTimeMusicPending = false;

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

  /** The post-start MV coroutine also runs while Game-clear waits for finish. */
  advanceMovie(deltaTimeSeconds: number): SimulatorResult<void> {
    const updated = this.startupDirection?.stepPlayableMovie(deltaTimeSeconds) ?? ok(undefined);
    return updated.status === "ok" ? updated : this.latchFault(updated);
  }

  publishGameClearState(finished: boolean): void {
    if (!finished) this.startupDirection?.beginGameClearPresentation(this.musicScoreController.stageTiming.bpm);
    this.currentGameStateValue = finished ? GameState.GameClearAnimEnd : GameState.GameClearAnimStart;
  }

  advanceGameClearPresentation(deltaTimeSeconds: number): void {
    this.startupDirection?.advanceGameClearPresentation(deltaTimeSeconds);
  }

  publishGameOverState(): void {
    this.currentGameStateValue = GameState.GameOverMotionFirstStart;
  }

  get isMoveTime(): boolean {
    return this.currentGameStateValue === GameState.MoveTime;
  }

  execMoveTimeStep(deltaTimeSeconds: number): SimulatorResult<void> {
    const entry = this.currentGameStateValue;
    if (this.lifecycleState !== "initialized" ||
      (entry !== GameState.PlayingSound && entry !== GameState.MoveTimeWaitForPlay) ||
      this.noteManager.inGameCalculatedData.mode.sessionMode !== "rehearsal") {
      return integrityFailure(
        "timeline.movetime.invalid-step-state",
        "MoveTime advances only an initialized Rehearsal in PlayingSound or an earlier MoveTime's countdown.",
      );
    }
    this.currentGameStateValue = GameState.MoveTime;
    try {
      // InputManager excludes state 14; note owners select forcePerfect.
      return this.execUpdateFrame(deltaTimeSeconds);
    } finally {
      this.currentGameStateValue = entry;
    }
  }

  /** moveTimeToStartMusic sets MoveTimeWaitForPlay after its resets and LoadMusic; a MoveTime
   * pressed during the countdown restarts it. */
  enterMoveTimeWait(): SimulatorResult<void> {
    if (this.faultValue !== null) return this.faultValue;
    if (this.lifecycleState !== "initialized" ||
      (this.currentGameStateValue !== GameState.PlayingSound &&
        this.currentGameStateValue !== GameState.MoveTimeWaitForPlay)) {
      return integrityFailure(
        "timeline.movetime.invalid-wait-state",
        "Only a MoveTime from PlayingSound or an earlier countdown waits for the countdown.",
      );
    }
    const adjustment = this.primaryJudgementAdjustment?.resetForMoveTime() ?? ok(undefined);
    if (adjustment.status !== "ok") return this.latchFault(adjustment);
    this.currentGameStateValue = GameState.MoveTimeWaitForPlay;
    this.moveTimeResumeWrittenThisFrame = false;
    this.moveTimeMusicPending = false;
    return ok(undefined);
  }

  captureMoveTimeSnapshot(): Readonly<{ noteGroupIndex: number; music: ReturnType<InGameMusicScoreController["captureMoveTimeSnapshot"]> }> {
    return Object.freeze({
      noteGroupIndex: this.noteManager.noteGroupIndex,
      music: this.musicScoreController.captureMoveTimeSnapshot(),
    });
  }

  /** returnTime restores the snapshot through both note managers before the replay. CommandNoteManager
   * only restores its index; Rehearsal never dispatches stage command groups here. */
  returnToMoveTimeSnapshot(
    snapshot: ReturnType<InGameManager["captureMoveTimeSnapshot"]>,
  ): SimulatorResult<void> {
    if (this.faultValue !== null) return this.faultValue;
    if (this.lifecycleState !== "initialized" ||
      (this.currentGameStateValue !== GameState.PlayingSound &&
        this.currentGameStateValue !== GameState.MoveTimeWaitForPlay)) {
      return integrityFailure(
        "timeline.movetime.invalid-return-state",
        "returnTime runs only from PlayingSound or an earlier MoveTime's countdown.",
      );
    }
    const returned = this.noteManager.returnTime(snapshot.noteGroupIndex, snapshot.music);
    if (returned.status !== "ok") return this.latchFault(returned);
    this.garupaProduct?.resetForReturnTime();
    this.scoreLifeStateManager?.resetForReturnTime();
    return ok(undefined);
  }

  /** onResumeFromMoveTime: the countdown's 1.4 s event writes 16 and starts the one-second
   * ImmortalityTimer before 16 -> 4 -> 5. */
  resumeFromMoveTime(): SimulatorResult<void> {
    if (this.faultValue !== null) return this.faultValue;
    if (this.lifecycleState !== "initialized" || this.currentGameStateValue !== GameState.MoveTimeWaitForPlay) {
      return integrityFailure(
        "timeline.movetime.resume-outside-wait",
        "The countdown resumes only the MoveTime that is waiting for it.",
      );
    }
    this.currentGameStateValue = GameState.MoveTimeFinished;
    this.moveTimeResumeWrittenThisFrame = true;
    this.scoreLifeStateManager?.startMoveTimeImmortality();
    return ok(undefined);
  }

  execUpdate(deltaTimeSeconds: number): SimulatorResult<void> {
    const waitingForCountdown = this.currentGameStateValue === GameState.MoveTimeWaitForPlay;
    const musicGateRunning = this.moveTimeMusicPending;
    const updated = this.execUpdateFrame(deltaTimeSeconds);
    // Coroutines resume after Update: a started judgeAdjustFastProcess steps once per frame.
    if (updated.status === "ok" && musicGateRunning && this.moveTimeMusicPending && !this.isPaused()) {
      const music = this.stepMoveTimeMusicGate();
      if (music.status !== "ok") return music;
    }
    // The ImmortalityTimer coroutine subtracts Time.deltaTime once when started and then once per
    // frame; a MoveTime's reset stops it until the next countdown restarts it.
    if (updated.status === "ok" && !waitingForCountdown) {
      this.scoreLifeStateManager?.advanceImmortality(deltaTimeSeconds);
    }
    return updated;
  }

  private execUpdateFrame(deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.faultValue !== null) {
      return this.faultValue;
    }
    if (this.lifecycleState !== "initialized") {
      return integrityFailure(
        "ingame.update-outside-initialized-lifecycle",
        "InGameManager.ExecUpdate is only represented after initialization and before disposal.",
      );
    }
    // A manual Pause keeps Unity time running (timeScale 1), so the cover's
    // Normal-update DOScale also finishes while paused.
    this.startupDirection?.advanceGameOverCover(deltaTimeSeconds);
    if (this.currentGameStateValue === GameState.GameOverMotionFirstStart) return ok(undefined);
    let enteredPlayingSound = false;
    if (this.startupDirection !== null && !this.startupDirection.snapshot().playable) {
      const startup = this.startupDirection.step(deltaTimeSeconds);
      if (startup.status !== "ok") return this.latchFault(startup);
      this.currentGameStateValue = this.startupDirection.snapshot().currentGameState;
      if (!this.startupDirection.snapshot().playable) return ok(undefined);
      enteredPlayingSound = true;
    }
    if (!enteredPlayingSound) this.startupDirection?.advancePlayablePresentation(deltaTimeSeconds);
    // ExecUpdate bypasses updatePlayState in 15 and only writes 4 in 16.
    if (this.currentGameStateValue === GameState.MoveTimeWaitForPlay) {
      return this.advanceMoveTimeWaitPresentation(deltaTimeSeconds);
    }
    if (this.currentGameStateValue === GameState.MoveTimeFinished) {
      if (this.moveTimeResumeWrittenThisFrame) this.moveTimeResumeWrittenThisFrame = false;
      else this.currentGameStateValue = GameState.PlayingNone;
      return this.advanceMoveTimeWaitPresentation(deltaTimeSeconds);
    }
    if (this.currentGameStateValue === GameState.PlayingNone && this.isStartupPlayable()) {
      // updatePlayingSound starts judgeAdjustFastProcess (its first step runs at once) and
      // writes 5 in the same call; PlayMusic waits for a positive adjustment's frames.
      this.moveTimeMusicPending = true;
      const music = this.stepMoveTimeMusicGate();
      if (music.status !== "ok") return music;
      this.currentGameStateValue = GameState.PlayingSound;
    }
    if (this.currentGameStateValue === GameState.PauseNone) {
      return this.advancePausedPresentation(deltaTimeSeconds);
    }
    if (this.currentGameStateValue !== GameState.PauseSound) {
      const movieUpdate = enteredPlayingSound ? ok(undefined) : this.advanceMovie(deltaTimeSeconds);
      if (movieUpdate.status !== "ok") return movieUpdate;
      const primaryGate = this.primaryJudgementAdjustment?.consumeGameplayGate() ?? ok(false);
      if (primaryGate.status !== "ok") return this.latchFault(primaryGate);
      if (primaryGate.value) return this.commitParticleAdvance(deltaTimeSeconds, true);
    }
    if (enteredPlayingSound) {
      // Opening touches do not reach gameplay. Stage an empty frame before
      // continuing the native same-update
      // updatePlayingSound -> InputManager -> NoteManager chain.
      const input = this.inputManager.prepareOuterFrame({ touches: [] }, deltaTimeSeconds);
      if (input.status !== "ok") return this.latchFault(input);
    }
    const inputResult = this.inputManager.execInput(this.currentGameStateValue);
    if (inputResult.status !== "ok") {
      return inputResult;
    }
    if (this.currentGameStateValue === GameState.PauseSound) {
      return this.advancePausedPresentation(deltaTimeSeconds);
    }
    const audioFrame = this.audioProducer?.beginOuterFrame() ?? ok(undefined);
    if (audioFrame.status !== "ok") return this.latchFault(audioFrame);
    const updateResult = this.noteManager.execUpdate(deltaTimeSeconds);
    if (updateResult.status !== "ok") {
      return this.latchFault(updateResult);
    }
    // Native ButtonManager.ExecUpdate follows input and NoteManager, before HUD reflection.
    const laneEvents = this.noteManager.takeTapLaneEffects();
    const laneFrame = this.tapLaneEffect?.preflightFrame(laneEvents, deltaTimeSeconds) ?? null;
    if (laneFrame?.status === "integrity-failure") return this.latchFault(laneFrame);
    if (laneFrame?.status === "ok" && laneFrame.value !== null) {
      const committed = laneFrame.value.commit();
      if (committed.status !== "ok") return this.latchFault(committed);
    }
    const stageTiming = this.musicScoreController.stageTiming;
    this.startupDirection?.reflectStageCommands(stageTiming.position, stageTiming.bpm);
    this.startupDirection?.reflectStageMusicProgress(
      stageTiming.beatProgress, stageTiming.bpm,
    );
    const productUpdate = this.garupaProduct?.update(deltaTimeSeconds) ?? ok(undefined);
    if (productUpdate.status !== "ok") return this.latchFault(productUpdate);
    const noteAnimations = this.noteManager.advanceNoteAnimations(deltaTimeSeconds);
    if (noteAnimations.status !== "ok") return this.latchFault(noteAnimations);
    const holdSounds = this.noteManager.takeHoldSounds();
    if (holdSounds.length > 0 && this.audioProducer !== null) {
      const soundPlan = this.audioProducer.preflightHoldSounds(holdSounds);
      if (soundPlan.status !== "ok") return this.latchFault(soundPlan);
      const committed = soundPlan.value.commit();
      if (committed.status !== "ok") return this.latchFault(committed);
    }
    const presentation = this.advanceScenePresentation(deltaTimeSeconds, true);
    if (presentation.status !== "ok") return presentation;
    let particleAdvanced = false;
    let firstJudgementBatch = true;
    while (this.oneFrameJudgementController.existsOneFrameData()) {
      const reflectPlan =
        this.oneFrameJudgementController.preflightReflectOneFrameData();
      if (reflectPlan.status !== "ok") return this.latchFault(reflectPlan);
      if (reflectPlan.value !== null) {
        const batch = reflectPlan.value.batch;
        const batchDeltaTimeSeconds = firstJudgementBatch ? deltaTimeSeconds : Math.fround(0);
        const businessPlan = this.scoreLifeStateManager?.preflightReflect(batch) ?? null;
        if (businessPlan?.status === "integrity-failure") {
          this.oneFrameJudgementController.discardReflectOneFrameData(
            reflectPlan.value,
          );
          return this.latchFault(businessPlan);
        }
        const particlePlan = this.particleCoordinator?.preflightJudgement(
          batchDeltaTimeSeconds,
          batch,
        ) ?? null;
        if (particlePlan?.status === "integrity-failure") {
          if (businessPlan?.status === "ok") {
            this.scoreLifeStateManager!.discardReflect(businessPlan.value);
          }
          this.oneFrameJudgementController.discardReflectOneFrameData(reflectPlan.value);
          return this.latchFault(particlePlan);
        }
        const audioPlan = this.audioProducer?.preflightJudgement(batch) ?? null;
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
        const renderPlan = businessPlan?.status === "ok"
          ? this.renderProducer?.preflightHudReflect(
              businessPlan.value,
              // Each newly started AddScore coroutine reads the same outer Time.deltaTime.
              deltaTimeSeconds,
              !this.noteManager.inGameCalculatedData.mode.isDemoPlayMode && !this.isMoveTime,
            ) ?? null
          : null;
        if (renderPlan?.status === "integrity-failure") {
          if (particlePlan?.status === "ok") particlePlan.value.discard();
          if (audioPlan?.status === "ok") audioPlan.value.discard();
          this.scoreLifeStateManager!.discardReflect(businessPlan!.value);
          this.oneFrameJudgementController.discardReflectOneFrameData(
            reflectPlan.value,
          );
          return this.latchFault(renderPlan);
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
        this.startupDirection?.reflectStageJudgements(batch);
        if (businessPlan?.status === "ok") this.startupDirection?.reflectLife(businessPlan.value.record.currentLife);
        particleAdvanced ||= particlePlan?.status === "ok";
        firstJudgementBatch = false;

      }
    }
    const particleAdvance = !particleAdvanced
      ? this.particleCoordinator?.preflightAdvance(deltaTimeSeconds, false) ?? null
      : null;
    if (particleAdvance?.status === "integrity-failure") {
      return this.latchFault(particleAdvance);
    }
    const advanceParticipants: FrameMutationParticipant[] = [];
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
        "The recovered scheduling freeze is only represented for an initialized live.",
      );
    }
    if (this.currentGameStateValue === GameState.PauseSound) return ok(undefined);
    if (this.currentGameStateValue !== GameState.PlayingSound) {
      return integrityFailure(
        "startup-direction.pause-outside-playing-sound",
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
        "The recovered resume path is only represented for an initialized live.",
      );
    }
    if (this.currentGameStateValue === GameState.PlayingSound) return ok(undefined);
    if (this.currentGameStateValue !== GameState.PauseSound) {
      return integrityFailure(
        "startup-direction.resume-outside-pause-sound",
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
    const noteDispose = this.noteManager.dispose();
    if (noteDispose.status !== "ok") return noteDispose;
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

  private advanceScenePresentation(
    deltaTimeSeconds: number,
    allowHabahiroStart: boolean,
  ): SimulatorResult<void> {
    if (
      this.renderProducer?.isCompleteHabahiro() === true &&
      this.renderScene?.habahiro !== undefined &&
      this.habahiroChangeAbsolutePos >= 0
    ) {
      if (
        allowHabahiroStart && this.habahiroLanePhase === "idle" &&
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
    return ok(undefined);
  }

  private stepMoveTimeMusicGate(): SimulatorResult<void> {
    const gate = this.primaryJudgementAdjustment?.preflightMusicStart() ?? ok(true);
    if (gate.status !== "ok") return this.latchFault(gate);
    if (!gate.value) return ok(undefined);
    const music = this.audioProducer?.preflightMoveTimeMusicStart() ?? null;
    if (music !== null && music.status !== "ok") return this.latchFault(music);
    if (music !== null) {
      const committed = music.value.commit();
      if (committed.status !== "ok") return this.latchFault(committed);
    }
    const started = this.primaryJudgementAdjustment?.commitMusicStarted() ?? ok(undefined);
    if (started.status !== "ok") return this.latchFault(started);
    this.moveTimeMusicPending = false;
    return ok(undefined);
  }

  private isStartupPlayable(): boolean {
    return this.startupDirection === null || this.startupDirection.snapshot().playable;
  }

  /** Outside updatePlayState only note animators and particle systems keep running. */
  private advanceMoveTimeWaitPresentation(deltaTimeSeconds: number): SimulatorResult<void> {
    const animated = this.noteManager.advanceNoteAnimations(deltaTimeSeconds);
    if (animated.status !== "ok") return this.latchFault(animated);
    return this.commitParticleAdvance(deltaTimeSeconds, false);
  }

  private advancePausedPresentation(deltaTimeSeconds: number): SimulatorResult<void> {
    const animated = this.noteManager.advanceNoteAnimations(deltaTimeSeconds);
    if (animated.status !== "ok") return this.latchFault(animated);
    const presentation = this.advanceScenePresentation(deltaTimeSeconds, false);
    return presentation.status === "ok"
      ? this.commitParticleAdvance(deltaTimeSeconds, true)
      : presentation;
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
      : { ...this.faultValue };
  }

  latchExternalFault(fault: SimulatorIntegrityFailure): SimulatorIntegrityFailure {
    return this.latchFault(fault);
  }

  private latchFault(fault: SimulatorIntegrityFailure): SimulatorIntegrityFailure {
    if (this.faultValue !== null) return this.faultValue;
    const latched = {
      ...fault,
    };
    this.audioProducer?.discardOuterFrame();
    this.faultValue = latched;
    this.lifecycleState = "faulted";
    return latched;
  }

  getPlaybackState(): InGamePlaybackState {
    const startup = this.startupDirection?.getPlaybackState();
    const gameplayBlocked = this.primaryJudgementAdjustment?.snapshot().gameplayBlocked === true;
    const playable = (startup?.playable ?? true) &&
      this.currentGameStateValue !== GameState.GameOverMotionFirstStart &&
      this.currentGameStateValue !== GameState.GameClearAnimStart &&
      this.currentGameStateValue !== GameState.GameClearAnimEnd && !gameplayBlocked;
    return { playable, paused: this.isPaused(), currentGameState: this.currentGameStateValue,
      startupPlayable: startup?.playable ?? true, gameplayBlocked,
      hudAlpha: startup?.hudAlpha ?? (playable ? 1 : 0),
      singleGameOver: this.scoreLifeStateManager?.record.singleGameOver === true,
      startupScene: startup?.scene ?? null,
      moveTimePhase: this.currentGameStateValue === GameState.MoveTimeWaitForPlay ? "waiting"
        : this.currentGameStateValue === GameState.MoveTimeFinished ||
          (this.currentGameStateValue === GameState.PlayingNone && (startup?.playable ?? true)) ? "resuming"
          : "none" };
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
      playable: this.getPlaybackState().playable,
    };
  }
}
