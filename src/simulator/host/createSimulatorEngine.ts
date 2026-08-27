import type { SimulatorBackends } from "../backends/contracts";
import {
  ButtonType,
  FrontNoteType,
  type ChartConstructionResult,
  type NoteInformation,
} from "../engine/chart/types";
import {
  integrityFailure,
  ok,
  type SimulatorResult,
} from "../engine/evidence";
import { getConstructedChartRuntimeMetadata } from "../engine/runtime/chartRuntimeMetadata";
import {
  InGameCalculatedData,
  validateSimulatorModeIdentity,
} from "../engine/data/inGameCalculatedData";
import {
  snapshotOriginalLiveSettings,
  validateOriginalLiveSettings,
  type OriginalLiveSettings,
} from "../engine/data/originalLiveSettings";
import {
  copyManualInputPosition,
  type ManualInputButtonResolution,
  type ManualInputFrame,
  type ManualInputPosition,
} from "../engine/data/manualInput";
import {
  InGameDirector,
  validateDirectorDeltaTime,
} from "../engine/managers/inGameDirector";
import { InGameManager } from "../engine/managers/inGameManager";
import { StartupDirectionController } from "../engine/managers/startupDirectionController";
import { PrimaryJudgementAdjustmentOwner } from "../engine/managers/primaryJudgementAdjustmentOwner";
import { TapLaneEffectOwner } from "../engine/managers/tapLaneEffectOwner";
import { InGameMovieManager, mapMovieResult } from "../engine/movie/inGameMovieManager";
import { MvBackgroundModule } from "../engine/movie/mvBackgroundModule";
import { InGameMusicScoreController } from "../engine/managers/inGameMusicScoreController";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import { ScoreLifeStateManager } from "../engine/managers/scoreLifeStateManager";
import { createConstructedChartScoringPlan } from "../engine/scoring/constructedChartScoringAdapter";
import {
  GamePlayInputDispatcher,
  InputManager,
} from "../engine/managers/inputBoundaries";
import { NoteManager } from "../engine/managers/noteManager";
import { SlideNoteManager } from "../engine/managers/slideNoteManager";
import {
  RenderCommandProducer,
  validateHabahiroScene,
  validateOrdinaryFixedNoteSceneInput,
} from "../engine/rendering/renderCommandProducer";
import {
  validateAutoLiveActivationGraph,
  validateAutoLiveChartOwnership,
} from "../engine/notes/noteTypes";
import {
  AudioCommandProducer,
  mapAudioResult,
  type AudioOwnerTransaction,
} from "../engine/audio/audioCommandProducer";
import {
  ParticleCommandProducer,
} from "../engine/particles/particleCommandProducer";
import { ParticleFrameCoordinator } from "../engine/particles/particleFrameCoordinator";
import type {
  SimulatorEngine,
  SimulatorEngineInput,
  SimulatorSnapshot,
} from "./contracts";
import { getGarupaProductChartProfile } from "../engine/garupa/productChartProfile";
import { getGarupaProductTimingGroupAxisProfile } from "../engine/garupa/timingGroupAxis";
import { GarupaProductRenderProducer } from "../engine/garupa/productRenderProducer";
import { GarupaProductTimelineManager } from "../engine/garupa/productTimelineManager";

class SimulatorEngineHost implements SimulatorEngine {
  private naturalCompletionClearStatus: 1 | 2 | 3 | null = null;

  constructor(
    private readonly inGameDirector: InGameDirector,
    private readonly inGameManager: InGameManager,
    private readonly inputDispatcher: GamePlayInputDispatcher,
    private readonly renderingSessionId: string | null,
    private readonly renderProducer: RenderCommandProducer | null,
    private readonly audioProducer: AudioCommandProducer | null,
    private readonly particleCoordinator: ParticleFrameCoordinator | null,
    private readonly productTimeline: GarupaProductTimelineManager | null,
    private readonly originalLiveSettings: OriginalLiveSettings,
    readonly backends: SimulatorBackends,
  ) {}

  initialize(): SimulatorResult<void> {
    const renderer = validateRendererSession(this.renderingSessionId, this.backends);
    if (renderer.status !== "ok") return renderer;
    if (
      this.inGameManager.state === "faulted" ||
      this.inGameManager.state === "disposed"
    ) {
      return this.inGameManager.initialize();
    }
    if (this.inGameManager.state === "initialized") return ok(undefined);
    const audioFault = this.pollAudioFault();
    if (audioFault.status !== "ok") return audioFault;
    const movieFault = this.pollMovieFault();
    if (movieFault.status !== "ok") return movieFault;
    const audio = this.audioProducer?.preflightInitialize() ?? null;
    if (audio !== null && audio.status !== "ok") return audio;
    const awake = this.inGameDirector.awake();
    if (awake.status !== "ok") {
      if (audio?.status === "ok") audio.value.discard();
      return awake;
    }
    if (audio?.status === "ok") {
      const committed = this.commitAudio(audio.value);
      if (committed.status !== "ok") return committed;
    }
    return this.inGameManager.initialize();
  }

  step(
    deltaTimeSeconds: number,
    inputFrame?: ManualInputFrame,
  ): SimulatorResult<void> {
    if (this.inGameManager.fault !== null) {
      return this.inGameManager.fault;
    }
    const audioFault = this.pollAudioFault();
    if (audioFault.status !== "ok") return audioFault;
    const movieFault = this.pollMovieFault();
    if (movieFault.status !== "ok") return movieFault;
    if (this.inGameManager.state !== "initialized") {
      return this.inGameManager.execUpdate(deltaTimeSeconds);
    }
    if (this.inGameManager.snapshot().paused) {
      return this.inGameDirector.update(deltaTimeSeconds);
    }
    const deltaValidation = validateDirectorDeltaTime(deltaTimeSeconds);
    if (deltaValidation.status !== "ok") {
      return deltaValidation;
    }
    const beforeUpdate = this.inGameManager.snapshot();
    if (!beforeUpdate.playable) {
      if (inputFrame !== undefined && inputFrame.touches.length > 0) {
        return integrityFailure(
          "startup-direction.manual-input-before-playable",
          ["SD09"],
          "Manual touches cannot enter the input owner before PlayingSound.",
        );
      }
      return this.inGameDirector.update(deltaTimeSeconds);
    }
    const productInput = this.productTimeline?.prepareManualFrame(
      inputFrame,
      deltaTimeSeconds,
    ) ?? ok(undefined);
    if (productInput.status !== "ok") return productInput;
    const originalInputFrame = this.productTimeline === null
      ? inputFrame
      : Object.freeze({ touches: Object.freeze([]) });
    const inputValidation =
      this.inGameManager.inputManager.prepareOuterFrame(originalInputFrame, deltaTimeSeconds);
    if (inputValidation.status !== "ok") {
      return inputValidation;
    }
    const updated = this.inGameDirector.update(deltaTimeSeconds);
    if (updated.status !== "ok") return updated;
    return this.pollNaturalCompletion();
  }

  resolveManualInputButton(
    position: ManualInputPosition,
  ): SimulatorResult<ManualInputButtonResolution | null> {
    if (this.inGameManager.fault !== null) {
      return this.inGameManager.fault;
    }
    const audioFault = this.pollAudioFault();
    if (audioFault.status !== "ok") return audioFault;
    const managerSnapshot = this.inGameManager.snapshot();
    if (this.inGameManager.state !== "initialized" || managerSnapshot.paused || !managerSnapshot.playable) {
      return integrityFailure(
        "manual-input.resolve-outside-active-session",
        ["D03", "D14", "MJ25"],
        "Raw input geometry can be resolved only by an initialized, running and PlayingSound manual engine session.",
      );
    }
    if (managerSnapshot.noteManager.calculatedData.isAutoPlay) {
      return integrityFailure(
        "manual-input.resolve-in-auto-live",
        ["D03", "D14", "MJ25"],
        "Real-touch button capabilities are unavailable in Auto Live.",
      );
    }
    const copied = copyManualInputPosition(position);
    if (copied.status !== "ok") {
      return copied;
    }
    if (this.productTimeline !== null) {
      return this.productTimeline.resolveContinuousInput(copied.value);
    }
    const resolved = this.backends.manualInputGeometry.resolveButton(copied.value);
    if (resolved.status !== "ok") {
      return resolved;
    }
    if (resolved.value === null) {
      return ok(null);
    }
    const button = this.inputDispatcher.getButtonForResolver(resolved.value);
    if (button.status !== "ok") {
      return button;
    }
    return this.inGameManager.inputManager.issueButtonResolution(
      copied.value,
      button.value,
    );
  }

  pause(): SimulatorResult<void> {
    if (this.inGameManager.fault !== null) {
      return this.inGameManager.fault;
    }
    const audioFault = this.pollAudioFault();
    if (audioFault.status !== "ok") return audioFault;
    const movieFault = this.pollMovieFault();
    if (movieFault.status !== "ok") return movieFault;
    const manager = this.inGameManager.snapshot();
    if (manager.startupDirection?.playable === false) {
      return integrityFailure(
        "startup-direction.pause-during-opening",
        ["SD09"],
        "Pause cannot emit audio commands before PlayingSound.",
      );
    }
    if (manager.paused) {
      return ok(undefined);
    }
    const audio = this.audioProducer?.preflightPause() ?? null;
    if (audio !== null && audio.status !== "ok") return audio;
    const pauseResult = this.inGameManager.pause();
    if (pauseResult.status !== "ok") {
      if (audio?.status === "ok") audio.value.discard();
      return pauseResult;
    }
    this.backends.lifecycle.recordState("paused");
    return audio?.status === "ok"
      ? this.commitAudio(audio.value)
      : ok(undefined);
  }

  resume(): SimulatorResult<void> {
    if (this.inGameManager.fault !== null) {
      return this.inGameManager.fault;
    }
    const audioFault = this.pollAudioFault();
    if (audioFault.status !== "ok") return audioFault;
    const movieFault = this.pollMovieFault();
    if (movieFault.status !== "ok") return movieFault;
    if (this.inGameManager.state !== "initialized") {
      return this.inGameManager.resume();
    }
    const manager = this.inGameManager.snapshot();
    if (manager.startupDirection?.playable === false && !manager.paused) {
      return integrityFailure(
        "startup-direction.resume-during-opening",
        ["SD09"],
        "Resume cannot emit audio commands before PlayingSound.",
      );
    }
    if (!manager.paused) {
      return ok(undefined);
    }
    const audio = this.audioProducer?.preflightResume() ?? null;
    if (audio !== null && audio.status !== "ok") return audio;
    const resumeResult = this.inGameManager.resume();
    if (resumeResult.status !== "ok") {
      if (audio?.status === "ok") audio.value.discard();
      return resumeResult;
    }
    this.backends.lifecycle.recordState("running");
    return audio?.status === "ok"
      ? this.commitAudio(audio.value)
      : ok(undefined);
  }

  continueLive(): SimulatorResult<void> {
    const audioFault = this.pollAudioFault();
    return audioFault.status === "ok"
      ? this.inGameManager.continueLive()
      : audioFault;
  }

  completeLiveAudio(clearStatus: 1 | 2 | 3): SimulatorResult<void> {
    if (this.inGameManager.fault !== null) return this.inGameManager.fault;
    const audioFault = this.pollAudioFault();
    if (audioFault.status !== "ok") return audioFault;
    if (this.inGameManager.state !== "initialized" || this.audioProducer === null) {
      return integrityFailure(
        "audio.complete.without-active-session",
        [],
        "Game Clear audio requires an initialized explicitly configured audio session.",
      );
    }
    if (clearStatus !== 1 && clearStatus !== 2 && clearStatus !== 3) {
      return integrityFailure(
        "audio.complete.invalid-clear-status",
        [],
        "Current Full Combo/Game Clear routing is confirmed only for clear status 1, 2 or 3.",
      );
    }
    const particle = this.particleCoordinator?.preflightTerminal("natural-end") ?? null;
    if (particle?.status === "integrity-failure") return particle;
    const rendering = this.renderProducer?.preflightGameClear(clearStatus) ?? null;
    if (rendering?.status === "integrity-failure") {
      if (particle?.status === "ok") particle.value.discard();
      return rendering;
    }
    const audio = this.audioProducer.preflightCompleteLive(clearStatus);
    if (audio.status !== "ok") {
      if (particle?.status === "ok") particle.value.discard();
      if (rendering?.status === "ok") rendering.value.discard();
      return audio;
    }
    if (particle?.status === "ok") {
      const domain = particle.value.commitDomain();
      if (domain.status !== "ok") {
        audio.value.discard();
        if (rendering?.status === "ok") rendering.value.discard();
        return this.inGameManager.latchExternalFault(domain);
      }
    }
    const committedAudio = this.commitAudio(audio.value);
    if (committedAudio.status !== "ok") {
      if (particle?.status === "ok") particle.value.discardRenderAfterDomainFault();
      if (rendering?.status === "ok") rendering.value.discard();
      return committedAudio;
    }
    if (rendering?.status === "ok") {
      const renderedClear = rendering.value.commit();
      if (renderedClear.status !== "ok") return this.inGameManager.latchExternalFault(renderedClear);
    }
    if (particle?.status === "ok") {
      const rendered = particle.value.commitRender();
      if (rendered.status !== "ok") return this.inGameManager.latchExternalFault(rendered);
    }
    const laneCleanup = this.inGameManager.clearTapLaneEffects();
    if (laneCleanup.status !== "ok") return laneCleanup;
    this.naturalCompletionClearStatus = clearStatus;
    return ok(undefined);
  }

  advanceNaturalCompletionPresentation(deltaTimeSeconds: number): SimulatorResult<void> {
    if (this.inGameManager.fault !== null) return this.inGameManager.fault;
    if (this.naturalCompletionClearStatus === null || !Number.isFinite(deltaTimeSeconds) ||
      deltaTimeSeconds < 0) {
      return integrityFailure(
        "render.game-clear.invalid-presentation-advance",
        [],
        "Game-clear presentation time advances only after natural completion with one finite non-negative host delta.",
      );
    }
    const planned = this.renderProducer?.preflightHudAnimationAdvance(deltaTimeSeconds) ?? null;
    if (planned === null) return ok(undefined);
    if (planned.status !== "ok") return planned;
    const committed = planned.value.commit();
    return committed.status === "ok"
      ? committed
      : this.inGameManager.latchExternalFault(committed);
  }

  getNaturalCompletionClearStatus(): 1 | 2 | 3 | null {
    return this.naturalCompletionClearStatus;
  }

  publishMoveTimeAudio(targetSeconds: number): SimulatorResult<void> {
    if (this.audioProducer === null) return ok(undefined);
    const publish = this.backends.audio.publishMoveTimeOutput;
    const seekMilliseconds = Math.trunc(targetSeconds * 1000);
    if (publish === undefined || !Number.isSafeInteger(seekMilliseconds) || seekMilliseconds < 0) {
      return integrityFailure(
        "audio.move-time.publication-owner-missing",
        ["LR-E16", "LR-C03"],
        "MoveTime publication requires the prepared audio owner and trunc(InGameSec*1000) target.",
      );
    }
    return mapAudioResult(publish.call(this.backends.audio, seekMilliseconds));
  }

  commitMoveTimeTimelineRevision(
    timelineRevision: number,
    moveTimeCount: number,
  ): SimulatorResult<void> {
    const manager = this.inGameManager.scoreLifeStateManager;
    return manager === null
      ? integrityFailure(
          "score-life.move-time-without-record-owner",
          ["LR-R03", "LR-C04"],
          "Rehearsal MoveTime publication requires the Score/Life/Record owner.",
        )
      : manager.commitMoveTimeTimelineRevision(timelineRevision, moveTimeCount);
  }

  enterMoveTimeForWholeEngineReplay(): SimulatorResult<void> {
    if (this.inGameManager.fault !== null) return this.inGameManager.fault;
    const backendFault = this.pollAudioFault();
    if (backendFault.status !== "ok") return backendFault;
    if (this.inGameManager.state !== "initialized" || this.particleCoordinator === null) {
      return integrityFailure(
        "particle.movetime.without-whole-engine-participant",
        [],
        "MoveTime requires one initialized particle session owned by the whole-engine replay host.",
      );
    }
    if (this.particleCoordinator.producer.snapshot().terminal) {
      return ok(undefined);
    }
    const planned = this.particleCoordinator.preflightMoveTime();
    if (planned.status !== "ok") return planned;
    const domain = planned.value.commitDomain();
    if (domain.status !== "ok") return this.inGameManager.latchExternalFault(domain);
    const rendered = planned.value.commitRender();
    if (rendered.status !== "ok") return this.inGameManager.latchExternalFault(rendered);
    return this.inGameManager.clearTapLaneEffects();
  }

  getAdjustedMusicPosition(): SimulatorResult<number> {
    const audioFault = this.pollAudioFault();
    return audioFault.status === "ok"
      ? this.inGameManager.getAdjustedMusicPosition()
      : audioFault;
  }

  snapshot(): SimulatorResult<SimulatorSnapshot> {
    if (this.inGameManager.state !== "disposed" && this.inGameManager.fault === null) {
      this.pollAudioFault();
      this.pollMovieFault();
    }
    const adjustedMusicPosition =
      this.inGameManager.noteManager.peekAdjustedMusicPosition();
    return ok({
      director: this.inGameDirector.snapshot(),
      managers: this.inGameManager.snapshot(),
      originalLiveSettings: snapshotOriginalLiveSettings(this.originalLiveSettings),
      adjustedMusicPosition,
      backendTrace: this.backends.snapshot(),
      renderingBackend: this.backends.rendering?.snapshot() ?? null,
      audioBackend: this.backends.audio.snapshot(),
      movieBackend: this.backends.movie?.snapshot() ?? null,
      particleBackend: this.backends.particles?.snapshot() ?? null,
      particleRendererBackend: this.backends.particleRendering?.snapshot() ?? null,
    });
  }

  dispose(): SimulatorResult<void> {
    if (this.inGameManager.state === "disposed") {
      return this.disposePhysicalBackends();
    }
    const rendererState = this.backends.rendering?.snapshot().state;
    const movieState = this.backends.movie?.snapshot().state;
    const particleBackendState = this.backends.particles?.snapshot().state;
    const particleRendererState = this.backends.particleRendering?.snapshot().state;
    if (this.inGameManager.state === "faulted" ||
      rendererState === "faulted" || rendererState === "disposed" ||
      movieState === "faulted" || movieState === "disposed" ||
      particleBackendState === "faulted" || particleBackendState === "disposed" ||
      particleRendererState === "faulted" || particleRendererState === "disposed") {
      this.inGameManager.disposeAfterTerminalBackendFault();
      return this.disposePhysicalBackends();
    }
    const rendererValidation = this.renderProducer?.validate();
    if (rendererValidation?.status === "integrity-failure") return rendererValidation;
    const particle = this.particleCoordinator?.preflightDispose() ?? null;
    if (particle?.status === "integrity-failure") return particle;
    const domainDispose = this.inGameManager.dispose();
    if (domainDispose.status !== "ok") {
      if (particle?.status === "ok") particle.value.discard();
      this.inGameManager.disposeAfterTerminalBackendFault();
      const physical = this.disposePhysicalBackends();
      return physical.status === "ok"
        ? domainDispose
        : integrityFailure(
            domainDispose.capability,
            domainDispose.requiredEvidence,
            `${domainDispose.boundary} Secondary cleanup failure: ${physical.capability}.`,
          );
    }
    if (particle?.status === "ok") {
      const domain = particle.value.commitDomain();
      if (domain.status !== "ok") return domain;
    }
    const release = this.renderProducer?.preflightSessionRelease() ?? null;
    if (release?.status === "integrity-failure") {
      if (particle?.status === "ok") particle.value.discardRenderAfterDomainFault();
      return release;
    }
    if (release?.status === "ok") {
      const committed = release.value.commit();
      if (committed.status !== "ok") {
        if (particle?.status === "ok") particle.value.discardRenderAfterDomainFault();
        return committed;
      }
    }
    if (particle?.status === "ok") {
      const rendered = particle.value.commitRender();
      if (rendered.status !== "ok") return rendered;
    }
    return this.disposePhysicalBackends();
  }

  private disposePhysicalBackends(): SimulatorResult<void> {
    let primary: import("../engine/evidence").SimulatorIntegrityFailure | null = null;
    const capture = (result: SimulatorResult<void>): void => {
      if (result.status === "ok") return;
      primary = primary === null
        ? result
        : integrityFailure(
            primary.capability,
            primary.requiredEvidence,
            `${primary.boundary} Secondary cleanup failure: ${result.capability}.`,
          );
    };
    capture(this.disposeAudio());
    capture(this.disposeMovie());
    capture(this.disposeParticles());
    capture(this.backends.rendering?.dispose() ?? ok(undefined));
    return primary ?? ok(undefined);
  }

  private commitAudio(transaction: AudioOwnerTransaction): SimulatorResult<void> {
    const committed = transaction.commit();
    return committed.status === "ok"
      ? committed
      : this.inGameManager.latchExternalFault(committed);
  }

  private pollNaturalCompletion(): SimulatorResult<void> {
    if (this.audioProducer === null || this.naturalCompletionClearStatus !== null) {
      return ok(undefined);
    }
    const ended = this.audioProducer.pollBgmNaturalEnd();
    if (ended.status !== "ok" || !ended.value) return ended.status === "ok" ? ok(undefined) : ended;
    if (this.backends.movie !== undefined) {
      const movie = mapMovieResult(this.backends.movie.observe());
      if (movie.status !== "ok") return this.inGameManager.latchExternalFault(movie);
      if (!movie.value.ended) return ok(undefined);
    }
    const scoreLife = this.inGameManager.scoreLifeStateManager;
    if (scoreLife === null) {
      return integrityFailure(
        "audio.natural-completion.without-score-owner",
        [],
        "Natural BGM completion requires the recovered InGameRecord clear-status owner; a default clear status is forbidden.",
      );
    }
    return this.completeLiveAudio(scoreLife.getClearStatus());
  }

  private pollMovieFault(): SimulatorResult<void> {
    if (this.backends.movie === undefined) return ok(undefined);
    const result = mapMovieResult(this.backends.movie.observe());
    return result.status === "ok"
      ? ok(undefined)
      : this.inGameManager.latchExternalFault(result);
  }

  private pollAudioFault(): SimulatorResult<void> {
    const particle = this.particleCoordinator?.pollFaults() ?? null;
    if (particle?.status === "integrity-failure") {
      return this.inGameManager.latchExternalFault(particle);
    }
    if (this.audioProducer === null) return ok(undefined);
    const result = this.audioProducer.pollBackendFault();
    return result.status === "ok"
      ? result
      : this.inGameManager.latchExternalFault(result);
  }

  private disposeAudio(): SimulatorResult<void> {
    if (this.audioProducer === null || this.backends.audio.snapshot().state === "disposed") {
      return ok(undefined);
    }
    return mapAudioResult(this.backends.audio.dispose());
  }

  private disposeMovie(): SimulatorResult<void> {
    if (this.backends.movie === undefined ||
      this.backends.movie.snapshot().state === "disposed") {
      return ok(undefined);
    }
    return mapMovieResult(this.backends.movie.dispose());
  }

  private disposeParticles(): SimulatorResult<void> {
    if (this.particleCoordinator === null ||
      this.backends.particles?.snapshot().state === "disposed") {
      return ok(undefined);
    }
    return this.particleCoordinator.disposeBackends();
  }
}

interface RegisteredMoveTimeWrapper {
  readonly host: SimulatorEngineHost;
  readonly publishVisual: () => SimulatorResult<void>;
  readonly setMoveTimeVisualState: (active: boolean) => SimulatorResult<void>;
}
const registeredMoveTimeWrappers = new WeakMap<object, RegisteredMoveTimeWrapper>();

export function registerSimulatorEngineMoveTimeWrapper(
  wrapper: SimulatorEngine,
  inner: SimulatorEngine,
  publishVisual: () => SimulatorResult<void>,
  setMoveTimeVisualState: (active: boolean) => SimulatorResult<void>,
): SimulatorResult<void> {
  const host = resolveMoveTimeHost(inner);
  if (host === null || wrapper === inner || registeredMoveTimeWrappers.has(wrapper)) {
    return integrityFailure(
      "timeline.movetime.invalid-engine-wrapper",
      ["LR-C03"],
      "A production mount may register exactly one simulator-owned wrapper around one host engine.",
    );
  }
  registeredMoveTimeWrappers.set(wrapper, Object.freeze({
    host,
    publishVisual,
    setMoveTimeVisualState,
  }));
  return ok(undefined);
}

export function setMoveTimeVisualState(
  engine: SimulatorEngine,
  active: boolean,
): SimulatorResult<void> {
  const wrapper = registeredMoveTimeWrappers.get(engine);
  return wrapper === undefined ? ok(undefined) : wrapper.setMoveTimeVisualState(active);
}

export function publishFreshEngineVisual(engine: SimulatorEngine): SimulatorResult<void> {
  const wrapper = registeredMoveTimeWrappers.get(engine);
  return wrapper === undefined
    ? integrityFailure(
        "timeline.retry.visual-publication-owner-missing",
        ["PAU-B04"],
        "Retry fresh generation publication requires the registered production mount wrapper after the old generation is disposed.",
      )
    : wrapper.publishVisual();
}

export function publishMoveTimeAudio(
  engine: SimulatorEngine,
  targetSeconds: number,
): SimulatorResult<void> {
  const host = resolveMoveTimeHost(engine);
  if (host === null) {
    return integrityFailure(
      "audio.move-time.foreign-engine",
      ["LR-C03"],
      "MoveTime audio publication may run only on an engine created by the simulator host.",
    );
  }
  const audio = host.publishMoveTimeAudio(targetSeconds);
  if (audio.status !== "ok") return audio;
  return registeredMoveTimeWrappers.get(engine)?.publishVisual() ?? ok(undefined);
}

export function commitMoveTimeTimelineRevision(
  engine: SimulatorEngine,
  timelineRevision: number,
  moveTimeCount: number,
): SimulatorResult<void> {
  const host = resolveMoveTimeHost(engine);
  return host !== null
    ? host.commitMoveTimeTimelineRevision(timelineRevision, moveTimeCount)
    : integrityFailure(
        "score-life.move-time-foreign-engine",
        ["LR-C04"],
        "Timeline revision may be committed only on an engine created by the simulator host.",
      );
}

export function enterMoveTimeForWholeEngineReplay(
  engine: SimulatorEngine,
): SimulatorResult<void> {
  const host = resolveMoveTimeHost(engine);
  return host !== null
    ? host.enterMoveTimeForWholeEngineReplay()
    : integrityFailure(
        "particle.movetime.foreign-engine",
        [],
        "Whole-engine replay accepts only an engine created by the portable simulator host.",
      );
}

function resolveMoveTimeHost(engine: SimulatorEngine): SimulatorEngineHost | null {
  if (engine instanceof SimulatorEngineHost) return engine;
  return registeredMoveTimeWrappers.get(engine)?.host ?? null;
}

export function createSimulatorEngine(
  input: SimulatorEngineInput,
  backends: SimulatorBackends,
): SimulatorResult<SimulatorEngine> {
  const renderingSessionId = input.rendering?.sessionId ?? null;
  const rendererValidation = validateRendererSession(renderingSessionId, backends);
  if (rendererValidation.status !== "ok") return rendererValidation;
  if (input.rendering !== undefined && backends.rendering !== undefined) {
    const fidelity = backends.rendering.snapshot().fidelity;
    if (
      fidelity?.mode !== "ordinary" &&
      !(fidelity?.mode === "habahiro" &&
        fidelity.fidelity === "current-external-complete")
    ) {
      return integrityFailure(
        "render.note.non-ordinary-scene-lifecycle-unimplemented",
        ["RPR-D05", "RPR-D13", "PR04", "PR39", "PR40", "HA-D04"],
        "The connected Note lifecycle accepts exact ordinary or the functionally complete HABAHIRO current-external route; legacy degraded profiles are not production engine modes.",
      );
    }
    const sceneValidation = validateOrdinaryFixedNoteSceneInput(
      input.rendering.ordinaryNoteScene,
    );
    if (sceneValidation.status !== "ok") return sceneValidation;
    if (
      fidelity?.mode === "habahiro" &&
      fidelity.fidelity === "current-external-complete" &&
      !validateHabahiroScene(
        input.rendering.ordinaryNoteScene.habahiro,
      )
    ) {
      return integrityFailure(
        "render.habahiro.scene-required",
        ["HAB-A04", "HAB-A08", "HAB-A09", "HAB-A10"],
        "Complete HABAHIRO rendering requires explicit mesh-width, flash-clock and field/judge scene plans before engine creation.",
      );
    }
  }
  const renderProducer = input.rendering !== undefined && backends.rendering !== undefined
    ? new RenderCommandProducer(
        input.rendering.sessionId,
        backends.rendering,
        input.rendering.resources,
        Object.freeze({
          isAutoPlay: input.runtime.mode.isAutoPlay,
          allPerfectStatusPresentationEnabled:
            input.runtime.originalLiveSettings.allPerfectStatusDisplayMode,
        }),
      )
    : null;
  const producerValidation = renderProducer?.validate();
  if (producerValidation?.status === "integrity-failure") return producerValidation;
  const chartValidation = validateChart(input.chart);
  if (chartValidation.status !== "ok") {
    return chartValidation;
  }
  const particleCoordinatorResult = createParticleCoordinator(input, backends);
  if (particleCoordinatorResult.status !== "ok") return particleCoordinatorResult;
  const particleCoordinator = particleCoordinatorResult.value;
  if (input.audio === undefined && backends.audio.snapshot().state === "ready") {
    return integrityFailure(
      "audio.session.incomplete-host-binding",
      [],
      "A prepared audio backend requires one explicit matching host audio session.",
    );
  }
  const audioProducer = input.audio === undefined
    ? null
    : new AudioCommandProducer(input.audio, backends.audio, input.chart);
  const audioValidation = audioProducer?.validate();
  if (audioValidation !== undefined && audioValidation.status !== "ok") {
    return audioValidation;
  }
  const runtimeMetadata = getConstructedChartRuntimeMetadata(input.chart);
  if (runtimeMetadata === undefined) {
    return integrityFailure(
      "runtime.unregistered-chart-construction",
      ["E07", "E25"],
      "The runtime only accepts the exact ChartConstructionResult produced by the recovered chart factory; cloned or caller-synthesized charts have no proven process-history BPM count.",
    );
  }
  if (runtimeMetadata.isCommand) {
    return integrityFailure(
      "runtime.command-parse-chart",
      ["E07", "E25"],
      "The gameplay runtime consumes the normal construction result captured before the separate command parse, not an isCommand construction result.",
    );
  }
  const originalLiveSettingsValidation = validateOriginalLiveSettings(
    input.runtime.originalLiveSettings,
  );
  if (originalLiveSettingsValidation.status !== "ok") {
    return originalLiveSettingsValidation;
  }
  const originalLiveSettings = originalLiveSettingsValidation.value;
  const modeValidation = validateSimulatorModeIdentity(input.runtime.mode);
  if (modeValidation.status !== "ok") return modeValidation;
  const primaryJudgementAdjustment = new PrimaryJudgementAdjustmentOwner(
    originalLiveSettings.core.judgementAdjustValue,
    input.startupDirection?.purpose ?? "initial",
  );
  const productProfile = getGarupaProductChartProfile(input.chart);
  const productLaneEffectButtons = new Map<number, readonly number[]>();
  if (productProfile?.route === "product-extension") {
    for (const node of productProfile.visibleNodes) {
      const noteIndex = node.scoringSource?.index;
      if (noteIndex === undefined || !Number.isInteger(node.spanStart) ||
        !Number.isInteger(node.spanEnd) || node.spanStart < 0 || node.spanEnd > 6) continue;
      productLaneEffectButtons.set(
        noteIndex,
        Object.freeze(Array.from(
          { length: node.spanEnd - node.spanStart + 1 },
          (_, index) => node.spanStart + index,
        )),
      );
    }
  }
  const tapLaneEffectOwner = renderProducer !== null && input.rendering !== undefined &&
    input.rendering.resources.ordinaryVisible?.tapLaneEffectLogicalAssetIds.length === 4
    ? new TapLaneEffectOwner(
        renderProducer,
        input.rendering.ordinaryNoteScene,
        originalLiveSettings.visibleTapLaneEffect,
        productLaneEffectButtons.size === 0
          ? null
          : (noteIndex) => productLaneEffectButtons.get(noteIndex) ?? null,
      )
    : null;
  const movieBackgroundResult = createMovieBackground(
    input,
    backends,
    modeValidation.value,
    originalLiveSettings.core.mvDarkness,
  );
  if (movieBackgroundResult.status !== "ok") return movieBackgroundResult;
  const slideNoteManager = new SlideNoteManager();
  const inGameCalculatedData = new InGameCalculatedData(
    modeValidation.value,
    originalLiveSettings,
  );
  const scoringPlanResult = input.scoreLifeState === undefined
    ? ok(null)
    : createConstructedChartScoringPlan(input.chart);
  if (scoringPlanResult.status !== "ok") return scoringPlanResult;
  const scoreLifeStateResult = input.scoreLifeState === undefined
    ? ok<ScoreLifeStateManager | null>(null)
    : ScoreLifeStateManager.create(
        input.scoreLifeState,
        scoringPlanResult.value!,
        modeValidation.value,
      );
  if (scoreLifeStateResult.status !== "ok") return scoreLifeStateResult;
  const scoreLifeStateManager = scoreLifeStateResult.value;
  const musicScoreController = new InGameMusicScoreController(input.chart);
  const oneFrameJudgementController = new InGameOneFrameJudgementController();
  let productTimeline: GarupaProductTimelineManager | null = null;
  if (productProfile?.route === "product-extension") {
    const productAxis = getGarupaProductTimingGroupAxisProfile(input.chart);
    if (productAxis === undefined) {
      return integrityFailure(
        "simulator.garupa-extension.axis-profile-unregistered",
        [],
        "A product-extension chart requires its exact construction-owned TimingGroup axis profile.",
      );
    }
    const productScene = input.garupaProductScene ?? input.rendering?.garupaProductScene;
    if ((input.garupaProductScene !== undefined && input.rendering?.garupaProductScene !== undefined &&
        input.garupaProductScene !== input.rendering.garupaProductScene) ||
      (modeValidation.value.inputMode === "manual" && productScene === undefined) ||
      (input.rendering !== undefined && input.rendering.garupaProductScene === undefined)) {
      return integrityFailure(
        "simulator.garupa-extension.scene-profile-unregistered",
        [],
        "A rendered or Manual product-extension chart requires one unambiguous scene sibling with the unchanged seven reference field lines.",
      );
    }
    const productRender = input.rendering === undefined || backends.rendering === undefined
      ? null
      : new GarupaProductRenderProducer(
          input.rendering.sessionId,
          backends.rendering,
          input.rendering.resources,
          productProfile,
          productAxis,
          input.rendering.garupaProductScene!,
          input.rendering.ordinaryNoteScene.specificSpeed,
          originalLiveSettings.noteColor,
          originalLiveSettings.syncLine,
        );
    productTimeline = new GarupaProductTimelineManager(
      productProfile,
      modeValidation.value,
      musicScoreController,
      oneFrameJudgementController,
      productRender,
      productScene ?? null,
      originalLiveSettings.core.judgementAdjustValueB,
    );
  }
  if (scoreLifeStateManager !== null) {
    const businessOwner = oneFrameJudgementController.registerBusinessOwner(
      (judgement, source) => scoreLifeStateManager.freezeOneFrame(judgement, source),
    );
    if (businessOwner.status !== "ok") return businessOwner;
  }
  const noteManager = new NoteManager(
    input.chart.noteBatches,
    slideNoteManager,
    musicScoreController,
    musicScoreController,
    runtimeMetadata.processBpmChangeCount,
    originalLiveSettings.core.judgementAdjustValueB,
    inGameCalculatedData,
    () => oneFrameJudgementController.getUsableOneFrameData(),
    (request) => oneFrameJudgementController.setupAutoLiveJudgement(request),
    undefined,
    () => oneFrameJudgementController.createManualJudgementTransaction(),
    backends.manualInputGeometry,
    renderProducer,
    input.rendering?.ordinaryNoteScene ?? null,
  );
  const judgementOwner =
    oneFrameJudgementController.registerAutoLiveJudgementOwner(
      (noteInformation) =>
        productTimeline?.getAutoLiveJudgementOwnership(noteInformation) ??
        noteManager.getAutoLiveJudgementOwnership(noteInformation),
    );
  if (judgementOwner.status !== "ok") {
    return judgementOwner;
  }
  const manualJudgementOwner =
    oneFrameJudgementController.registerManualJudgementOwner(
      (noteInformation) =>
        productTimeline?.getManualJudgementOwnership(noteInformation) ??
        noteManager.getManualJudgementOwnership(noteInformation),
    );
  if (manualJudgementOwner.status !== "ok") {
    return manualJudgementOwner;
  }
  const inputManager = new InputManager(inGameCalculatedData.mode);
  const inputDispatcher = new GamePlayInputDispatcher(noteManager, tapLaneEffectOwner);
  const inputDispatcherRegistration = inputManager.registerDispatcher(inputDispatcher);
  if (inputDispatcherRegistration.status !== "ok") {
    return inputDispatcherRegistration;
  }
  const startupDirection = input.startupDirection === undefined
    ? null
    : new StartupDirectionController(
        inGameCalculatedData.mode,
        input.startupDirection.scene,
        audioProducer,
        input.startupDirection.liveStartVoiceCue,
        input.startupDirection.purpose,
        movieBackgroundResult.value,
        primaryJudgementAdjustment,
      );
  const inGameManager = new InGameManager(
    musicScoreController,
    noteManager,
    oneFrameJudgementController,
    inputManager,
    scoreLifeStateManager,
    renderProducer,
    audioProducer,
    particleCoordinator,
    input.chart.habahiroChangeAbsolutePos,
    input.rendering?.ordinaryNoteScene ?? null,
    startupDirection,
    productTimeline,
    primaryJudgementAdjustment,
    tapLaneEffectOwner,
  );
  const inGameDirector = new InGameDirector(
    inGameManager,
    originalLiveSettings.core.highFrequencyMode,
    backends.frameRate,
  );

  return ok(new SimulatorEngineHost(
    inGameDirector,
    inGameManager,
    inputDispatcher,
    renderingSessionId,
    renderProducer,
    audioProducer,
    particleCoordinator,
    productTimeline,
    originalLiveSettings,
    backends,
  ));
}

function createMovieBackground(
  input: SimulatorEngineInput,
  backends: SimulatorBackends,
  mode: import("../engine/data/inGameCalculatedData").SimulatorModeIdentity,
  mvDarkness: number,
): SimulatorResult<MvBackgroundModule | null> {
  const backend = backends.movie;
  if (input.movie === undefined) {
    const state = backend?.snapshot().state ?? null;
    return state === "ready" || state === "play-pending" || state === "playing" ||
      state === "paused" || state === "seeking" || state === "ended"
      ? integrityFailure(
          "movie.session.incomplete-host-binding",
          ["MVL-C01"],
          "A prepared movie backend requires one explicit matching Live host binding and cannot become an ambient background.",
        )
      : ok(null);
  }
  if (input.movie === null || typeof input.movie !== "object" ||
    typeof input.movie.sessionId !== "string" || input.movie.sessionId.length === 0 ||
    !Number.isInteger(input.movie.musicStartDelayMilliseconds) ||
    input.movie.musicStartDelayMilliseconds < -0x80000000 ||
    input.movie.musicStartDelayMilliseconds > 0x7fffffff ||
    input.startupDirection === undefined ||
    input.startupDirection.purpose === "move-time-reconstruction" ||
    mode.sessionMode !== "live" || backend === undefined) {
    return integrityFailure(
      "movie.session.invalid-host-binding",
      ["MVL-E12", "MVL-E13", "MVL-R01", "MVL-R02"],
      "MV Live requires one prepared backend, exact session/delay binding, fresh Live Manual/Auto startup and no Rehearsal/MoveTime inheritance.",
    );
  }
  const snapshot = backend.snapshot();
  if (snapshot.state !== "ready" || snapshot.sessionId !== input.movie.sessionId ||
    snapshot.resourceCount !== 1 || snapshot.fault !== null ||
    snapshot.muted !== true || snapshot.loop !== false) {
    return integrityFailure(
      "movie.session.backend-not-ready",
      ["MVL-P01", "MVL-P02", "MVL-C01"],
      "The exact muted non-looping movie backend session must be ready before engine owners are constructed.",
    );
  }
  return ok(new MvBackgroundModule(
    new InGameMovieManager(input.movie.sessionId, backend, mvDarkness),
    input.movie.musicStartDelayMilliseconds,
  ));
}

function createParticleCoordinator(
  input: SimulatorEngineInput,
  backends: SimulatorBackends,
): SimulatorResult<ParticleFrameCoordinator | null> {
  const backendState = backends.particles?.snapshot().state ?? null;
  const rendererState = backends.particleRendering?.snapshot().state ?? null;
  if (input.particles === undefined) {
    return backendState === "ready" || rendererState === "ready"
      ? integrityFailure(
          "particle.session.incomplete-host-binding",
          [],
          "A prepared particle backend/renderer requires one explicit matching host particle session.",
        )
      : ok(null);
  }
  if (input.particles === null || typeof input.particles !== "object" ||
    Object.keys(input.particles).length !== 1 ||
    typeof input.particles.sessionId !== "string" || input.particles.sessionId.length === 0 ||
    backends.particles === undefined) {
    return integrityFailure(
      "particle.session.invalid-host-binding",
      [],
      "Particle input contains only one non-empty session identity and requires an explicit prepared backend.",
    );
  }
  const producer = new ParticleCommandProducer(
    input.chart,
    input.runtime.mode.isAutoPlay,
  );
  const coordinator = new ParticleFrameCoordinator(
    input.particles.sessionId,
    producer,
    backends.particles,
    backends.particleRendering ?? null,
  );
  const validated = coordinator.validate();
  return validated.status === "ok" ? ok(coordinator) : validated;
}

function validateRendererSession(
  sessionId: string | null,
  backends: SimulatorBackends,
): SimulatorResult<void> {
  if (sessionId === null && backends.rendering === undefined) {
    return ok(undefined);
  }
  if (
    sessionId === null ||
    sessionId.length === 0 ||
    backends.rendering === undefined
  ) {
    return integrityFailure(
      "render.session.incomplete-host-binding",
      ["RPR-D14", "RPR-D17", "PR35", "PR38"],
      "A rendering engine requires both one explicit session identity and one prepared typed renderer backend.",
    );
  }
  const snapshot = backends.rendering.snapshot();
  if (
    snapshot.state !== "ready" ||
    snapshot.sessionId !== sessionId ||
    snapshot.fault !== null
  ) {
    return integrityFailure(
      "render.session.renderer-not-ready",
      ["RPR-D14", "RPR-D17", "PR35", "PR38"],
      "Renderer readiness and the exact host session must validate before chart or domain owners are created or initialized.",
    );
  }
  return ok(undefined);
}

function validateChart(chart: ChartConstructionResult): SimulatorResult<void> {
  if (
    !isValidBpm(chart.startBpm) ||
    chart.startBpmString.length === 0 ||
    chart.bpmChangeRealValueList.length !==
      chart.bpmChangeStringRealValueList.length
  ) {
    return integrityFailure(
      "runtime.invalid-chart-bpm-state",
      ["E07", "E08"],
      "The chart must preserve positive finite start/change BPM values and their original parallel strings.",
    );
  }

  const ownershipValidation = validateAutoLiveChartOwnership(chart.noteBatches);
  if (ownershipValidation.status !== "ok") {
    return ownershipValidation;
  }

  for (const batch of chart.noteBatches) {
    if (
      !isInt32(batch.barIndex) ||
      !isInt32(batch.numerator) ||
      !isInt32(batch.denominator) ||
      !isInt32(batch.absolutePos)
    ) {
      return integrityFailure(
        "runtime.invalid-chart-batch-position",
        ["E10", "E14"],
        "Runtime batches must preserve the recovered Int32 position fields.",
      );
    }
    for (const noteInformation of batch.informationList) {
      const validation = validateNoteInformation(noteInformation);
      if (validation.status !== "ok") {
        return validation;
      }
    }
  }
  return ok(undefined);
}

function validateNoteInformation(
  noteInformation: NoteInformation,
): SimulatorResult<void> {
  if (
    !isInt32(noteInformation.index) ||
    !isInt32(noteInformation.barIndex) ||
    !isInt32(noteInformation.numerator) ||
    !isInt32(noteInformation.denominator) ||
    !isInt32(noteInformation.absolutePos)
  ) {
    return integrityFailure(
      "runtime.invalid-note-position",
      ["E10", "E14"],
      "NoteInformation must preserve recovered Int32 fields.",
    );
  }
  if (noteInformation.ccNum === 3 || noteInformation.ccNum === 8) {
    if (
      noteInformation.denominator === 0 ||
      !isValidBpm(noteInformation.bpm) ||
      noteInformation.bpmString.length === 0
    ) {
      return integrityFailure(
        "runtime.invalid-bpm-command",
        ["E07", "E10"],
        "CC03/CC08 commands require a nonzero denominator, positive finite BPM and original string.",
      );
    }
    return ok(undefined);
  }
  if (noteInformation.buttonType === ButtonType.None) {
    return ok(undefined);
  }
  const validFrontType =
    noteInformation.fireNoteType >= FrontNoteType.Normal &&
    noteInformation.fireNoteType <=
      FrontNoteType.SlideBMultipleDirectionalFlickAdd;
  if (
    !validFrontType
  ) {
    return integrityFailure(
      "runtime.unrepresented-note-root",
      ["E11", "E13"],
      `A surviving non-BPM record must map to a confirmed playable root family (index=${noteInformation.index}, ccNum=${noteInformation.ccNum}, buttonType=${noteInformation.buttonType}, fireNoteType=${noteInformation.fireNoteType}).`,
    );
  }
  return validateAutoLiveActivationGraph(noteInformation);
}

function isValidBpm(value: number): boolean {
  const floatValue = Math.fround(value);
  return Number.isFinite(value) && Number.isFinite(floatValue) && floatValue > 0;
}

function isInt32(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= -0x80000000 &&
    value <= 0x7fffffff
  );
}
