import type {
  ManualInputButtonResolution,
  ManualInputFrame,
  ManualInputPosition,
} from "../engine/data/manualInput";
import { copyManualInputPosition } from "../engine/data/manualInput";
import { GameState } from "../engine/data/inGameState";
import {
  validateSimulatorModeIdentity,
  type SimulatorModeIdentity,
} from "../engine/data/inGameCalculatedData";
import {
  integrityFailure,
  ok,
  type SimulatorIntegrityFailure,
  type SimulatorResult,
} from "../engine/result";
import type {
  SimulatorEngine,
  SimulatorSnapshot,
  SimulatorEngineBuildPurpose,
} from "./contracts";
import type { PauseControlSceneSnapshot } from "../scene/pauseControlScene";
import type { SimulatorResultPresentationEngine, SimulatorResultRecord } from "./resultPresentation";
import {
  commitMoveTimeTimelineRevision,
  enterMoveTimeForWholeEngineReplay,
  enterMoveTimeWait,
  resumeFromMoveTime,
  captureMoveTimeSnapshot,
  returnToMoveTimeSnapshot,
  type MoveTimeEngineSnapshot,
  publishMoveTimeTimeline,
  resumeMoveTimeInPlace,
  publishFreshEngineVisual,
  publishMoveTimeAudio,
  setMoveTimeVisualState,
  stepForMoveTime,
} from "./createSimulatorEngine";

export type SimulatorMoveTimeDirection = "return-five" | "advance-five";

export interface SimulatorTimelineControlState {
  readonly mode: Readonly<{
    readonly sessionMode: "live" | "rehearsal";
    readonly inputMode: "manual" | "auto";
    readonly inGameMode: "single-normal" | "practice";
    readonly isEnablePractice: boolean;
    readonly isDemoPlayMode: boolean;
    readonly isAutoLive: boolean;
    readonly isAutoPlay: boolean;
  }>;
  readonly timelineSeconds: number;
  readonly playable: boolean;
  readonly hudAlpha?: number;
  readonly paused: boolean;
  /** 16 and the following 4: the countdown has resumed and MoveTime is unavailable. */
  readonly moveTimeInProgress: boolean;
  /** 15: the countdown runs; only the MoveTime buttons are routed. */
  readonly moveTimeWaiting: boolean;
  readonly moveTimeCount: number;
  /** The countdown arrow mirrors for returnTime (hasReturned). */
  readonly moveTimeReturned: boolean;
  readonly terminalPresentationActive?: boolean;
  readonly resultPresentationActive?: boolean;
}

export interface SimulatorMoveTimeReceipt {
  readonly direction: SimulatorMoveTimeDirection;
  readonly fromSeconds: number;
  readonly targetSeconds: number;
  readonly replayOriginSeconds: number;
  readonly timelineRevision: number;
  readonly moveTimeCount: number;
}

export interface SimulatorWholeEngineReplayFactory {
  readonly mode: SimulatorModeIdentity;
  readonly bgmDurationSeconds: number;
  readonly requireVisualPublication?: boolean;
  createFreshEngine(purpose: Exclude<SimulatorEngineBuildPurpose, "initial">): Promise<SimulatorResult<SimulatorEngine>>;
}

export interface PortableReplaySimulatorEngine extends SimulatorEngine, SimulatorResultPresentationEngine {
  moveTime(direction: SimulatorMoveTimeDirection): Promise<SimulatorResult<SimulatorMoveTimeReceipt>>;
  retrySession(): Promise<SimulatorResult<void>>;
  replayResult(): Promise<SimulatorResult<void>>;
  publishPauseControlState(snapshot: PauseControlSceneSnapshot): SimulatorResult<void>;
  getTimelineControlState(): SimulatorResult<SimulatorTimelineControlState>;
  resumeFromMoveTime(): SimulatorResult<void>;
}

interface PauseControlVisualEngine {
  publishPauseControlState(snapshot: PauseControlSceneSnapshot): SimulatorResult<void>;
}

const MOVE_TIME_SECONDS = 5;
const SNAPSHOT_FIRST_FRAME_SECONDS = Math.fround(0.0083333);

interface RecordedMoveTimeSnapshot {
  readonly inGameSeconds: number;
  readonly engine: MoveTimeEngineSnapshot;
}
const RETURN_REPLAY_LIMIT_SECONDS = 16;
const MOVE_TIME_MAX_DELTA_SECONDS = Math.fround(0.01666666753590107);

export function createPortableReplaySimulatorEngine(
  initialEngine: SimulatorEngine,
  factory: SimulatorWholeEngineReplayFactory,
): SimulatorResult<PortableReplaySimulatorEngine> {
  if (initialEngine === null || typeof initialEngine !== "object" ||
    factory === null || typeof factory !== "object" ||
    typeof factory.createFreshEngine !== "function") {
    return rejected(
      "timeline.replay.invalid-host-capability",
      "Whole-engine timeline replay requires one fresh simulator engine and an explicit fresh-engine factory.",
    );
  }
  const mode = validateSimulatorModeIdentity(factory.mode);
  if (mode.status !== "ok") return mode;
  if (!Number.isFinite(factory.bgmDurationSeconds) || factory.bgmDurationSeconds <= 0) {
    return rejected(
      "timeline.replay.invalid-bgm-duration",
      "Timeline controls require the prepared session BGM duration for the original whole-second seek boundary.",
    );
  }
  const before = initialEngine.snapshot();
  if (before.status !== "ok") return before;
  if (!isPristine(before.value)) {
    return rejected(
      "timeline.replay.initial-engine-not-fresh",
      "Timeline ownership transfers only a fresh, uninitialized, fault-free whole engine with a ready particle session.",
    );
  }
  const initialized = initialEngine.initialize();
  if (initialized.status !== "ok") return initialized;
  return ok(new PortableReplaySimulatorEngineHost(
    initialEngine,
    factory,
    mode.value,
  ));
}

class PortableReplaySimulatorEngineHost implements PortableReplaySimulatorEngine {
  private active: SimulatorEngine;
  private readonly usedEngines = new WeakSet<object>();
  private generation = 0;
  private timelineSecondsValue = Math.fround(0);
  private timelineRevisionValue = 0;
  private moveTimeCountValue = 0;
  private moveTimeReturnedValue = false;
  /** InGameSnapshotController: slots 0..trunc(BGM length)-1, each recorded once. */
  private readonly moveTimeSnapshots = new Map<number, RecordedMoveTimeSnapshot>();
  private beforeFrameSeconds = Math.fround(0);
  private state: "ready" | "replaying" | "faulted" | "disposed" = "ready";
  private fault: SimulatorIntegrityFailure | null = null;
  private readonly controlMode: SimulatorTimelineControlState["mode"];

  constructor(
    initialEngine: SimulatorEngine,
    private readonly factory: SimulatorWholeEngineReplayFactory,
    controlMode: SimulatorTimelineControlState["mode"],
  ) {
    this.active = initialEngine;
    this.usedEngines.add(initialEngine);
    this.controlMode = Object.freeze({ ...controlMode });
  }

  initialize(): SimulatorResult<void> {
    const available = this.available<void>();
    return available ?? this.active.initialize();
  }

  step(deltaTimeSeconds: number, inputFrame?: ManualInputFrame): SimulatorResult<void> {
    const available = this.available<void>();
    if (available !== null) return available;
    const before = this.active.getPlaybackState();
    if (before.status !== "ok") return before;
    if (!before.value.playable || before.value.gameplayBlocked) {
      return this.active.step(deltaTimeSeconds, inputFrame);
    }
    // The countdown before PlayingNone neither reads gameplay input nor advances the clock.
    if (before.value.currentGameState === GameState.MoveTimeWaitForPlay ||
      before.value.currentGameState === GameState.MoveTimeFinished) {
      return this.active.step(deltaTimeSeconds);
    }
    const stepped = this.active.step(deltaTimeSeconds, inputFrame);
    if (stepped.status !== "ok") return stepped;
    if (!before.value.paused) {
      this.timelineSecondsValue = Math.fround(this.timelineSecondsValue + deltaTimeSeconds);
      this.snapshotProcess(this.active, this.timelineSecondsValue);
    }

    return ok(undefined);
  }

  resolveManualInputButton(position: ManualInputPosition): SimulatorResult<ManualInputButtonResolution | null> {
    const available = this.available<ManualInputButtonResolution | null>();
    if (available !== null) return available;
    const copied = copyManualInputPosition(position);
    if (copied.status !== "ok") return copied;
    return this.active.resolveManualInputButton(copied.value);
  }

  pause(): SimulatorResult<void> {
    return this.available<void>() ?? this.active.pause();
  }
  resume(): SimulatorResult<void> {
    return this.available<void>() ?? this.active.resume();
  }
  startResultAudio(): SimulatorResult<void> { return this.active.startResultAudio(); }
  playResultEvaluationSound(failed: boolean): SimulatorResult<void> { return this.active.playResultEvaluationSound(failed); }
  setResultCountSound(active: boolean): SimulatorResult<void> { return this.active.setResultCountSound(active); }
  playUiDecisionSound(): SimulatorResult<void> {
    return this.active.playUiDecisionSound();
  }
  continueLive(): SimulatorResult<void> {
    return this.available<void>() ?? this.active.continueLive();
  }
  completeLiveAudio(clearStatus: 1 | 2 | 3): SimulatorResult<void> {
    return this.active.completeLiveAudio(clearStatus);
  }
  advanceNaturalCompletionPresentation(deltaTimeSeconds: number): SimulatorResult<boolean> {
    return this.active.advanceNaturalCompletionPresentation(deltaTimeSeconds);
  }
  getNaturalCompletionClearStatus(): 1 | 2 | 3 | null {
    return this.active.getNaturalCompletionClearStatus();
  }
  isUiDecisionSoundPlaying(): SimulatorResult<boolean> { return this.active.isUiDecisionSoundPlaying(); }
  async showResult(record: SimulatorResultRecord): Promise<SimulatorResult<void>> {
    const active = this.active as SimulatorEngine & Partial<SimulatorResultPresentationEngine>;
    return typeof active.showResult === "function" ? active.showResult(record)
      : rejected("timeline.result.visual-owner-unavailable", "The active production generation must own its result presentation.");
  }
  private resultReplayRequested = false;
  advanceResult(deltaSeconds: number, input: ManualInputFrame | null): SimulatorResult<"stay" | "exit" | "replay"> {
    const active = this.active as SimulatorEngine & Partial<SimulatorResultPresentationEngine>;
    const result = typeof active.advanceResult === "function" ? active.advanceResult(deltaSeconds, input)
      : rejected("timeline.result.visual-owner-unavailable", "The active production generation must own its result presentation.");
    if (result.status === "ok" && result.value === "replay") this.resultReplayRequested = true;
    return result;
  }
  publishPauseControlState(snapshot: PauseControlSceneSnapshot): SimulatorResult<void> {
    const active = this.active as SimulatorEngine & Partial<PauseControlVisualEngine>;
    return typeof active.publishPauseControlState === "function"
      ? active.publishPauseControlState(snapshot)
      : rejected(
          "timeline.pause-control.visual-owner-unavailable",
          "Production Pause routing requires the active fresh engine generation to expose its Simulator-owned control visual owner.",
        );
  }
  getAdjustedMusicPosition(): SimulatorResult<number> { return this.active.getAdjustedMusicPosition(); }
  getPlaybackState() { return this.active.getPlaybackState(); }
  snapshot(): SimulatorResult<SimulatorSnapshot> {
    if (this.state === "disposed") return this.active.snapshot();
    const available = this.available<SimulatorSnapshot>();
    return available ?? this.active.snapshot();
  }

  async moveTime(direction: SimulatorMoveTimeDirection): Promise<SimulatorResult<SimulatorMoveTimeReceipt>> {
    const available = this.available<SimulatorMoveTimeReceipt>();
    if (available !== null) return available;
    if (direction !== "return-five" && direction !== "advance-five") {
      return rejected(
        "timeline.movetime.invalid-direction",
        "Rehearsal exposes only fixed return-five and advance-five intents.",
      );
    }
    const currentSnapshot = this.active.snapshot();
    if (currentSnapshot.status !== "ok") return currentSnapshot;
    const mode = currentSnapshot.value.managers.noteManager.calculatedData;
    if (mode.sessionMode !== "rehearsal" || !mode.isEnablePractice || mode.inGameMode !== "practice") {
      return rejected(
        "timeline.movetime.outside-rehearsal",
        "MoveTime is unavailable in Live regardless of Manual or Auto input identity.",
      );
    }
    if (!currentSnapshot.value.managers.playable || currentSnapshot.value.managers.paused ||
      currentSnapshot.value.managers.primaryJudgementAdjustment?.gameplayBlocked === true ||
      this.active.getNaturalCompletionClearStatus() !== null) {
      return rejected(
        "timeline.movetime.outside-playing-state",
        "MoveTime accepts a touch-began intent only in an active playable Rehearsal PlayingSound state.",
      );
    }

    const fromSeconds = this.timelineSecondsValue;
    const wholeSecond = Math.floor(fromSeconds);
    const targetSeconds = direction === "return-five"
      ? Math.max(wholeSecond - MOVE_TIME_SECONDS, 0)
      // Original advanceTime bounds by trunc(BGM milliseconds / 1000).
      // onAdvanceTime never reverses an already later fractional clock.
      : Math.max(fromSeconds, Math.min(wholeSecond + MOVE_TIME_SECONDS, Math.floor(this.factory.bgmDurationSeconds)));
    if (direction === "return-five" && wholeSecond === 0) {
      return rejected(
        "timeline.movetime.return-at-origin",
        "The return-five control is disabled at the zero-second boundary and performs no mutation.",
      );
    }
    const replayOriginSeconds = direction === "return-five"
      ? Math.max(targetSeconds - RETURN_REPLAY_LIMIT_SECONDS, 0)
      : fromSeconds;
    const nextRevision = direction === "return-five"
      ? this.timelineRevisionValue + 1
      : this.timelineRevisionValue;
    const nextMoveCount = this.moveTimeCountValue + 1;

    // returnTime restores the snapshot of max(destination - 16, 0) and returns silently without one.
    const origin = direction === "return-five" ? this.moveTimeSnapshots.get(replayOriginSeconds) ?? null : null;
    if (direction === "return-five" && origin === null) {
      return ok(Object.freeze({
        direction, fromSeconds, targetSeconds: fromSeconds, replayOriginSeconds,
        timelineRevision: this.timelineRevisionValue, moveTimeCount: this.moveTimeCountValue,
      }));
    }

    const movingVisual = setMoveTimeVisualState(this.active, true);
    if (movingVisual.status !== "ok") return movingVisual;
    this.state = "replaying";
    return this.moveInPlace(direction, fromSeconds, targetSeconds, replayOriginSeconds, origin, nextRevision, nextMoveCount);
  }

  getTimelineControlState(): SimulatorResult<SimulatorTimelineControlState> {
    const available = this.available<SimulatorTimelineControlState>();
    if (available !== null) return available;
    const snapshot = this.active.getPlaybackState();
    if (snapshot.status !== "ok") return snapshot;
    return ok(Object.freeze({
      mode: this.controlMode,
      timelineSeconds: this.timelineSecondsValue,
      playable: snapshot.value.playable && !snapshot.value.gameplayBlocked &&
        this.active.getNaturalCompletionClearStatus() === null,
      hudAlpha: snapshot.value.hudAlpha,
      paused: snapshot.value.paused,
      moveTimeInProgress: snapshot.value.moveTimePhase === "resuming",
      moveTimeWaiting: snapshot.value.moveTimePhase === "waiting",
      moveTimeCount: this.moveTimeCountValue,
      moveTimeReturned: this.moveTimeReturnedValue,
    }));
  }

  resumeFromMoveTime(): SimulatorResult<void> {
    const available = this.available<void>();
    return available ?? resumeFromMoveTime(this.active);
  }

  async retrySession(): Promise<SimulatorResult<void>> {
    const available = this.available<void>();
    if (available !== null) return available;
    const snapshot = this.active.snapshot();
    if (snapshot.status !== "ok") return snapshot;
    if (!snapshot.value.managers.playable || !snapshot.value.managers.paused || this.active.getNaturalCompletionClearStatus() !== null) {
      return rejected(
        "timeline.retry.outside-paused-playing-state",
        "Current four-mode Retry accepts only the paused playable Pause-menu confirmation state before creating a fresh generation."
      );
    }
    return this.replaceSession();
  }

  async replayResult(): Promise<SimulatorResult<void>> {
    const available = this.available<void>();
    if (available !== null) return available;
    if (!this.resultReplayRequested) return rejected("timeline.result.replay-without-decision",
      "Result replay requires a released result button and completed decision sound.");
    this.resultReplayRequested = false;
    return this.replaceSession();
  }

  /** Pause Retry and result replay share resource reuse and fresh generation ownership. */
  private async replaceSession(): Promise<SimulatorResult<void>> {
    const visual = setMoveTimeVisualState(this.active, true);
    if (visual.status !== "ok") return visual;
    this.state = "replaying";
    const freshResult = await this.createFreshCandidate("retry");
    if (freshResult.status !== "ok") {
      setMoveTimeVisualState(this.active, false);
      this.state = "ready";
      return freshResult;
    }
    const fresh = freshResult.value;
    const previous = this.active;
    const disposed = await disposeSimulatorEngine(previous);
    if (disposed.status !== "ok") {
      return this.latchReplayFault(appendEngineCleanupFailure(disposed, await disposeSimulatorEngine(fresh)));
    }
    if (this.factory.requireVisualPublication === true) {
      const published = publishFreshEngineVisual(fresh);
      if (published.status !== "ok") {
        return this.latchReplayFault(appendEngineCleanupFailure(published, await disposeSimulatorEngine(fresh)));
      }
    }
    this.active = fresh;
    this.timelineSecondsValue = Math.fround(0);
    this.timelineRevisionValue = 0;
    this.moveTimeCountValue = 0;
    this.moveTimeReturnedValue = false;
    // Retry loads a new scene whose Init creates a new InGameSnapshotController.
    this.moveTimeSnapshots.clear();
    this.beforeFrameSeconds = Math.fround(0);
    this.generation += 1;
    this.state = "ready";
    return ok(undefined);
  }

  dispose(): SimulatorResult<void> {
    if (this.state === "disposed") return this.active.dispose();
    if (this.state === "replaying") {
      return rejected(
        "timeline.replay.dispose-during-move",
        "MoveTime or Retry must settle before deterministic disposal.",
      );
    }
    const result = this.active.dispose();
    if (result.status === "ok") {
      this.state = "disposed";
    }
    return result;
  }

  settleDisposal(): Promise<SimulatorResult<void>> {
    return this.active.settleDisposal?.() ?? Promise.resolve(ok(undefined));
  }

  /**
   * InGameMoveTimeController works on the running scene. returnTime first restores the snapshot
   * through both note managers; advanceTime then advances the ordinary update pipeline in MoveTime
   * state (no touch input) by steps of at most 1/60 s to the target and resumes. No engine is
   * rebuilt and no input history is replayed.
   */
  private moveInPlace(
    direction: SimulatorMoveTimeDirection,
    fromSeconds: number,
    targetSeconds: number,
    replayOriginSeconds: number,
    origin: RecordedMoveTimeSnapshot | null,
    nextRevision: number,
    nextMoveCount: number,
  ): SimulatorResult<SimulatorMoveTimeReceipt> {
    const engine = this.active;
    const fail = (failure: SimulatorIntegrityFailure): SimulatorResult<SimulatorMoveTimeReceipt> => this.latchReplayFault(failure);
    const entered = enterMoveTimeForWholeEngineReplay(engine);
    if (entered.status !== "ok") return fail(entered);
    if (origin !== null) {
      const returned = returnToMoveTimeSnapshot(engine, origin.engine);
      if (returned.status !== "ok") return fail(returned);
    }
    let replaySeconds = Math.fround(origin?.inGameSeconds ?? fromSeconds);
    while (replaySeconds < targetSeconds) {
      const delta = Math.fround(Math.min(targetSeconds - replaySeconds, MOVE_TIME_MAX_DELTA_SECONDS));
      if (!(delta > 0)) {
        return fail(rejected(
          "timeline.movetime.float32-progress-stalled",
          "MoveTime requires positive Float32 progress and never jumps or clamps the clock.",
        ));
      }
      const stepped = stepForMoveTime(engine, delta);
      if (stepped.status !== "ok") return fail(stepped);
      replaySeconds = Math.fround(replaySeconds + delta);
      this.snapshotProcess(engine, replaySeconds);
      if (engine.getNaturalCompletionClearStatus() !== null && replaySeconds < targetSeconds) {
        return fail(rejected(
          "timeline.movetime.target-after-natural-end",
          "MoveTime is disabled when the bounded target lies after natural completion.",
        ));
      }
    }
    const revised = commitMoveTimeTimelineRevision(engine, nextRevision, nextMoveCount);
    if (revised.status !== "ok") return fail(revised);
    const resumed = resumeMoveTimeInPlace(engine);
    if (resumed.status !== "ok") return fail(resumed);
    const published = publishMoveTimeAudio(engine, targetSeconds);
    if (published.status !== "ok") return fail(published);
    const waiting = enterMoveTimeWait(engine);
    if (waiting.status !== "ok") return fail(waiting);
    const timeline = publishMoveTimeTimeline(engine, replaySeconds);
    if (timeline.status !== "ok") return fail(timeline);
    const visual = setMoveTimeVisualState(engine, false);
    if (visual.status !== "ok") return fail(visual);

    this.timelineSecondsValue = replaySeconds;
    this.timelineRevisionValue = nextRevision;
    this.moveTimeCountValue = nextMoveCount;
    this.moveTimeReturnedValue = direction === "return-five";
    this.generation += 1;
    this.state = "ready";
    return ok(Object.freeze({
      direction,
      fromSeconds,
      targetSeconds,
      replayOriginSeconds,
      timelineRevision: nextRevision,
      moveTimeCount: nextMoveCount,
    }));
  }

  /** SnapshotProcess at the end of each logical update: a new integer second (or the first
   * 0.0083333 s) records its slot once with the advanced InGameSec. */
  private snapshotProcess(engine: SimulatorEngine, inGameSeconds: number): void {
    if (this.controlMode.sessionMode !== "rehearsal") return;
    const before = this.beforeFrameSeconds;
    this.beforeFrameSeconds = inGameSeconds;
    if (!(before < SNAPSHOT_FIRST_FRAME_SECONDS) && Math.trunc(inGameSeconds) === Math.trunc(before)) return;
    const slot = Math.trunc(inGameSeconds);
    if (slot < 0 || slot >= Math.trunc(this.factory.bgmDurationSeconds) || this.moveTimeSnapshots.has(slot)) return;
    const captured = captureMoveTimeSnapshot(engine);
    if (captured === null) return;
    // Both group indexes are recorded as 0 before one second.
    this.moveTimeSnapshots.set(slot, Object.freeze({
      inGameSeconds,
      engine: inGameSeconds >= 1 ? captured : Object.freeze({ ...captured, noteGroupIndex: 0 }),
    }));
  }

  private async createFreshCandidate(
    purpose: Exclude<SimulatorEngineBuildPurpose, "initial">,
  ): Promise<SimulatorResult<SimulatorEngine>> {
    let produced: unknown;
    try { produced = await this.factory.createFreshEngine(purpose); }
    catch {
      return rejected(
        "timeline.replay.factory-threw",
        "A fresh-engine factory exception rejects Retry without publishing a partial generation.",
      );
    }
    if (!isSimulatorResult(produced)) {
      return rejected(
        "timeline.replay.factory-invalid-result",
        "The fresh-engine factory must return one explicit SimulatorResult.",
      );
    }
    const result = produced as SimulatorResult<SimulatorEngine>;
    if (result.status !== "ok") return result;
    const fresh = result.value;
    if (fresh === null || typeof fresh !== "object" || fresh === this.active || this.usedEngines.has(fresh)) {
      return rejected(
        "timeline.replay.engine-not-fresh",
        "Every MoveTime transaction requires a previously unused engine instance.",
      );
    }
    this.usedEngines.add(fresh);
    const before = fresh.snapshot();
    if (before.status !== "ok" || !isPristine(before.value)) {
      const failure = before.status === "ok"
        ? rejected(
            "timeline.replay.factory-engine-not-pristine",
            "The Retry factory must return one pristine whole engine.",
          )
        : before;
      return appendEngineCleanupFailure(failure, await disposeSimulatorEngine(fresh));
    }
    const initialized = fresh.initialize();
    if (initialized.status !== "ok") return appendEngineCleanupFailure(initialized, await disposeSimulatorEngine(fresh));
    return ok(fresh);
  }

  private available<T>(): SimulatorResult<T> | null {
    if (this.fault !== null) return this.fault;
    if (this.state === "disposed") return rejected("timeline.replay.after-dispose", "Disposed timeline owner rejects all new operations.");
    if (this.state === "replaying") return rejected("timeline.replay.concurrent-operation", "No host operation may interleave with MoveTime or Retry.");
    return null;
  }
  private latchReplayFault<T>(fault: SimulatorIntegrityFailure): SimulatorResult<T> {
    this.fault ??= Object.freeze({ ...fault });
    this.state = "faulted";
    return this.fault;
  }
}

function isPristine(snapshot: SimulatorSnapshot): boolean {
  return snapshot.managers.state === "created" && snapshot.managers.fault === null &&
    !snapshot.director.awakeComplete &&
    (snapshot.managers.particle === null || snapshot.particleBackend?.state === "ready");
}
function isSimulatorResult(value: unknown): value is SimulatorResult<unknown> {
  if (value === null || typeof value !== "object" || !("status" in value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.status === "ok") return "value" in candidate;
  return candidate.status === "integrity-failure" && typeof candidate.capability === "string" &&
    typeof candidate.boundary === "string";
}
function rejected(capability: string, boundary: string): SimulatorIntegrityFailure {
  return integrityFailure(capability, boundary);
}

/** Stops a generation immediately, then observes its application resource release. */
export async function disposeSimulatorEngine(engine: SimulatorEngine): Promise<SimulatorResult<void>> {
  let disposed: SimulatorResult<void>;
  try { disposed = engine.dispose(); }
  catch (error) {
    disposed = integrityFailure("timeline.engine-dispose-threw",
      `Engine disposal threw: ${error instanceof Error ? error.message : String(error)}`);
  }
  let settled: SimulatorResult<void>;
  try { settled = await engine.settleDisposal?.() ?? ok(undefined); }
  catch (error) {
    settled = integrityFailure("timeline.engine-resource-release-threw",
      `Engine resource release threw: ${error instanceof Error ? error.message : String(error)}`);
  }
  return disposed.status === "ok" ? settled : appendEngineCleanupFailure(disposed, settled);
}

export function appendEngineCleanupFailure(
  failure: SimulatorIntegrityFailure,
  cleanup: SimulatorResult<void>,
): SimulatorIntegrityFailure {
  return cleanup.status === "ok" ? failure : integrityFailure(
    failure.capability,
    `${failure.boundary} Candidate cleanup also failed: ${cleanup.capability}: ${cleanup.boundary}`,
  );
}
