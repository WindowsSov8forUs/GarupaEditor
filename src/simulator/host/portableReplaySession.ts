import type {
  ManualInputButtonResolution,
  ManualInputFrame,
  ManualInputPosition,
  ManualInputTouch,
} from "../engine/data/manualInput";
import { copyManualInputPosition } from "../engine/data/manualInput";
import {
  validateSimulatorModeIdentity,
  type SimulatorModeIdentity,
} from "../engine/data/inGameCalculatedData";
import {
  integrityFailure,
  ok,
  productSemantic,
  type SimulatorIntegrityFailure,
  type SimulatorResult,
} from "../engine/evidence";
import type {
  SimulatorEngine,
  SimulatorSnapshot,
  SimulatorEngineBuildPurpose,
} from "./contracts";
import type { PauseControlSceneSnapshot } from "../scene/pauseControlScene";
import {
  commitMoveTimeTimelineRevision,
  publishFreshEngineVisual,
  publishMoveTimeAudio,
  setMoveTimeVisualState,
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
  readonly paused: boolean;
  readonly moveTimeInProgress: boolean;
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
  readonly requireVisualPublication?: boolean;
  createFreshEngine(purpose: Exclude<SimulatorEngineBuildPurpose, "initial">): Promise<SimulatorResult<SimulatorEngine>>;
}

export interface PortableReplaySimulatorEngine extends SimulatorEngine {
  moveTime(direction: SimulatorMoveTimeDirection): Promise<SimulatorResult<SimulatorMoveTimeReceipt>>;
  rebuildSurface(): Promise<SimulatorResult<void>>;
  retrySession(): Promise<SimulatorResult<void>>;
  publishPauseControlState(snapshot: PauseControlSceneSnapshot): SimulatorResult<void>;
  getTimelineControlState(): SimulatorResult<SimulatorTimelineControlState>;
}

interface PauseControlVisualEngine {
  publishPauseControlState(snapshot: PauseControlSceneSnapshot): SimulatorResult<void>;
}

type ReplayEvent =
  | {
      readonly kind: "resolve-manual-button";
      readonly position: ManualInputPosition;
      readonly resolutionId: number | null;
      readonly timelineSecondsAfter: number;
    }
  | {
      readonly kind: "step";
      readonly deltaTimeSeconds: number;
      readonly inputFrame: ReplayInputFrame | null;
      readonly timelineSecondsAfter: number;
    }
  | { readonly kind: "pause"; readonly timelineSecondsAfter: number }
  | { readonly kind: "resume"; readonly timelineSecondsAfter: number }
  | { readonly kind: "continue-live"; readonly timelineSecondsAfter: number }
  | {
      readonly kind: "complete-live";
      readonly clearStatus: 1 | 2 | 3;
      readonly timelineSecondsAfter: number;
    };

interface ReplayInputTouch {
  readonly fingerId: number;
  readonly phase: ManualInputTouch["phase"];
  readonly position: ManualInputPosition;
  readonly resolutionId: number | null;
}
interface ReplayInputFrame { readonly touches: readonly ReplayInputTouch[]; }

const MOVE_TIME_SECONDS = 5;
const RETURN_REPLAY_LIMIT_SECONDS = 16;
const MOVE_TIME_MAX_DELTA_SECONDS = Math.fround(0.01666666753590107);
const EMPTY_MANUAL_FRAME: ManualInputFrame = Object.freeze({ touches: Object.freeze([]) });

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
  private readonly resolutionIds = new WeakMap<object, number>();
  private currentResolutions = new Map<number, ManualInputButtonResolution>();
  private events: ReplayEvent[] = [];
  private nextResolutionId = 0;
  private generation = 0;
  private timelineSecondsValue = Math.fround(0);
  private timelineRevisionValue = 0;
  private moveTimeCountValue = 0;
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
    const before = this.active.snapshot();
    if (before.status !== "ok") return before;
    if (!before.value.managers.playable) {
      return this.active.step(deltaTimeSeconds, inputFrame);
    }
    const prepared = this.prepareLiveInputFrame(inputFrame);
    if (prepared.status !== "ok") return prepared;
    const stepped = this.active.step(deltaTimeSeconds, prepared.value.engineFrame ?? undefined);
    if (stepped.status !== "ok") return stepped;
    if (!before.value.managers.paused) {
      this.timelineSecondsValue = Math.fround(this.timelineSecondsValue + deltaTimeSeconds);
    }
    this.events.push(Object.freeze({
      kind: "step",
      deltaTimeSeconds,
      inputFrame: prepared.value.replayFrame,
      timelineSecondsAfter: this.timelineSecondsValue,
    }));
    return ok(undefined);
  }

  resolveManualInputButton(position: ManualInputPosition): SimulatorResult<ManualInputButtonResolution | null> {
    const available = this.available<ManualInputButtonResolution | null>();
    if (available !== null) return available;
    const copied = copyManualInputPosition(position);
    if (copied.status !== "ok") return copied;
    const resolved = this.active.resolveManualInputButton(copied.value);
    if (resolved.status !== "ok") return resolved;
    let resolutionId: number | null = null;
    if (resolved.value !== null) {
      resolutionId = this.nextResolutionId++;
      this.resolutionIds.set(resolved.value, resolutionId);
      this.currentResolutions.set(resolutionId, resolved.value);
    }
    this.events.push(Object.freeze({
      kind: "resolve-manual-button",
      position: copied.value,
      resolutionId,
      timelineSecondsAfter: this.timelineSecondsValue,
    }));
    return resolved;
  }

  pause(): SimulatorResult<void> {
    return this.commitSimpleEvent("pause", () => this.active.pause());
  }
  resume(): SimulatorResult<void> {
    return this.commitSimpleEvent("resume", () => this.active.resume());
  }
  continueLive(): SimulatorResult<void> {
    return this.commitSimpleEvent("continue-live", () => this.active.continueLive());
  }
  completeLiveAudio(clearStatus: 1 | 2 | 3): SimulatorResult<void> {
    const result = this.active.completeLiveAudio(clearStatus);
    if (result.status === "ok") this.events.push(Object.freeze({
      kind: "complete-live",
      clearStatus,
      timelineSecondsAfter: this.timelineSecondsValue,
    }));
    return result;
  }
  advanceNaturalCompletionPresentation(deltaTimeSeconds: number): SimulatorResult<void> {
    return this.active.advanceNaturalCompletionPresentation(deltaTimeSeconds);
  }
  getNaturalCompletionClearStatus(): 1 | 2 | 3 | null {
    return this.active.getNaturalCompletionClearStatus();
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
    if (!currentSnapshot.value.managers.playable || currentSnapshot.value.managers.paused || this.active.getNaturalCompletionClearStatus() !== null) {
      return rejected(
        "timeline.movetime.outside-playing-state",
        "MoveTime accepts a touch-began intent only in an active playable Rehearsal PlayingSound state.",
      );
    }

    const fromSeconds = this.timelineSecondsValue;
    const wholeSecond = Math.floor(fromSeconds);
    const targetSeconds = direction === "return-five"
      ? Math.max(wholeSecond - MOVE_TIME_SECONDS, 0)
      : wholeSecond + MOVE_TIME_SECONDS;
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

    const movingVisual = setMoveTimeVisualState(this.active, true);
    if (movingVisual.status !== "ok") return movingVisual;
    this.state = "replaying";
    const freshResult = await this.createFreshCandidate("move-time-reconstruction");
    if (freshResult.status !== "ok") {
      setMoveTimeVisualState(this.active, false);
      this.state = "ready";
      return freshResult;
    }
    const fresh = freshResult.value;
    const replayResolutions = new Map<number, ManualInputButtonResolution>();
    const retained: ReplayEvent[] = [];
    let replaySeconds = Math.fround(0);
    const historyTargetSeconds = direction === "return-five"
      ? targetSeconds
      : replayOriginSeconds;
    for (const event of this.events) {
      if (event.timelineSecondsAfter > historyTargetSeconds) break;
      const replayed = this.replayEvent(fresh, event, replayResolutions);
      if (replayed.status !== "ok") return this.rejectCandidate(fresh, replayed);
      retained.push(event);
      replaySeconds = event.timelineSecondsAfter;
    }

    const freshModeSnapshot = fresh.snapshot();
    if (freshModeSnapshot.status !== "ok") return this.rejectCandidate(fresh, freshModeSnapshot);
    const isAutoPlay = freshModeSnapshot.value.managers.noteManager.calculatedData.isAutoPlay;
    const generated: ReplayEvent[] = [];
    while (replaySeconds < targetSeconds) {
      const delta = Math.fround(Math.min(targetSeconds - replaySeconds, MOVE_TIME_MAX_DELTA_SECONDS));
      if (!(delta > 0)) {
        return this.rejectCandidate(fresh, rejected(
          "timeline.movetime.float32-progress-stalled",
          "MoveTime reconstruction requires positive Float32 progress and never jumps or clamps the clock.",
        ));
      }
      const stepped = fresh.step(delta, isAutoPlay ? undefined : EMPTY_MANUAL_FRAME);
      if (stepped.status !== "ok") return this.rejectCandidate(fresh, stepped);
      replaySeconds = Math.fround(replaySeconds + delta);
      generated.push(Object.freeze({
        kind: "step",
        deltaTimeSeconds: delta,
        inputFrame: isAutoPlay ? null : Object.freeze({ touches: Object.freeze([]) }),
        timelineSecondsAfter: replaySeconds,
      }));
      if (fresh.getNaturalCompletionClearStatus() !== null && replaySeconds < targetSeconds) {
        return this.rejectCandidate(fresh, rejected(
          "timeline.movetime.target-after-natural-end",
          "Advance-five is disabled when the bounded target cannot be reconstructed before natural completion.",
        ));
      }
    }
    const revised = commitMoveTimeTimelineRevision(fresh, nextRevision, nextMoveCount);
    if (revised.status !== "ok") return this.rejectCandidate(fresh, revised);

    const previous = this.active;
    const disposed = previous.dispose();
    if (disposed.status !== "ok") {
      fresh.dispose();
      return this.latchReplayFault(disposed);
    }
    const published = publishMoveTimeAudio(fresh, targetSeconds);
    if (published.status !== "ok") {
      fresh.dispose();
      return this.latchReplayFault(published);
    }
    this.active = fresh;
    this.currentResolutions = replayResolutions;
    for (const [id, resolution] of replayResolutions) this.resolutionIds.set(resolution, id);
    this.events = [...retained, ...generated];
    this.timelineSecondsValue = replaySeconds;
    this.timelineRevisionValue = nextRevision;
    this.moveTimeCountValue = nextMoveCount;
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

  async rebuildSurface(): Promise<SimulatorResult<void>> {
    const available = this.available<void>();
    if (available !== null) return available;
    this.state = "replaying";
    const freshResult = await this.createFreshCandidate("surface-rebuild");
    if (freshResult.status !== "ok") {
      this.state = "ready";
      return freshResult;
    }
    const fresh = freshResult.value;
    const replayResolutions = new Map<number, ManualInputButtonResolution>();
    for (const event of this.events) {
      const replayed = this.replayEvent(fresh, event, replayResolutions);
      if (replayed.status !== "ok") return this.rejectCandidate(fresh, replayed);
    }
    if (this.moveTimeCountValue > 0) {
      const revised = commitMoveTimeTimelineRevision(
        fresh,
        this.timelineRevisionValue,
        this.moveTimeCountValue,
      );
      if (revised.status !== "ok") return this.rejectCandidate(fresh, revised);
    }
    const previous = this.active;
    const disposed = previous.dispose();
    if (disposed.status !== "ok") {
      fresh.dispose();
      return this.latchReplayFault(disposed);
    }
    const published = publishMoveTimeAudio(fresh, this.timelineSecondsValue);
    if (published.status !== "ok") {
      fresh.dispose();
      return this.latchReplayFault(published);
    }
    this.active = fresh;
    this.currentResolutions = replayResolutions;
    for (const [id, resolution] of replayResolutions) this.resolutionIds.set(resolution, id);
    this.generation += 1;
    this.state = "ready";
    return productSemantic(
      undefined,
      "surface.product.atomic-rebuild",
      ["ML-R05"],
      "The original mid-session resize route is unobserved; GarupaEditor atomically replays the current generation onto the new landscape surface without claiming original continuity.",
      "GE-PS-SURFACE-ATOMIC-REBUILD",
    );
  }

  getTimelineControlState(): SimulatorResult<SimulatorTimelineControlState> {
    const available = this.available<SimulatorTimelineControlState>();
    if (available !== null) return available;
    const snapshot = this.active.snapshot();
    if (snapshot.status !== "ok") return snapshot;
    return ok(Object.freeze({
      mode: this.controlMode,
      timelineSeconds: this.timelineSecondsValue,
      playable: snapshot.value.managers.playable && this.active.getNaturalCompletionClearStatus() === null,
      paused: snapshot.value.managers.paused,
      moveTimeInProgress: false,
    }));
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
    const disposed = previous.dispose();
    if (disposed.status !== "ok") {
      fresh.dispose();
      return this.latchReplayFault(disposed);
    }
    if (this.factory.requireVisualPublication === true) {
      const published = publishFreshEngineVisual(fresh);
      if (published.status !== "ok") {
        fresh.dispose();
        return this.latchReplayFault(published);
      }
    }
    this.active = fresh;
    this.events = [];
    this.currentResolutions.clear();
    this.timelineSecondsValue = Math.fround(0);
    this.timelineRevisionValue = 0;
    this.moveTimeCountValue = 0;
    this.generation += 1;
    this.state = "ready";
    return ok(undefined);
  }

  dispose(): SimulatorResult<void> {
    if (this.state === "disposed") return this.active.dispose();
    if (this.state === "replaying") {
      return rejected(
        "timeline.replay.dispose-during-reconstruction",
        "MoveTime reconstruction must settle before deterministic disposal.",
      );
    }
    const result = this.active.dispose();
    if (result.status === "ok") {
      this.state = "disposed";
      this.events = [];
      this.currentResolutions.clear();
    }
    return result;
  }

  private async createFreshCandidate(
    purpose: Exclude<SimulatorEngineBuildPurpose, "initial">,
  ): Promise<SimulatorResult<SimulatorEngine>> {
    let produced: unknown;
    try { produced = await this.factory.createFreshEngine(purpose); }
    catch {
      return rejected(
        "timeline.replay.factory-threw",
        "A fresh-engine factory exception rejects MoveTime without publishing partial reconstructed state.",
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
      fresh.dispose();
      return before.status === "ok"
        ? rejected(
            "timeline.replay.factory-engine-not-pristine",
            "The reconstruction factory must return one pristine whole engine.",
          )
        : before;
    }
    const initialized = fresh.initialize();
    if (initialized.status !== "ok") { fresh.dispose(); return initialized; }
    return ok(fresh);
  }

  private rejectCandidate<T>(fresh: SimulatorEngine, failure: SimulatorIntegrityFailure): SimulatorResult<T> {
    fresh.dispose();
    setMoveTimeVisualState(this.active, false);
    this.state = "ready";
    return failure;
  }

  private commitSimpleEvent(
    kind: "pause" | "resume" | "continue-live",
    operation: () => SimulatorResult<void>,
  ): SimulatorResult<void> {
    const available = this.available<void>();
    if (available !== null) return available;
    const result = operation();
    if (result.status === "ok") this.events.push(Object.freeze({
      kind,
      timelineSecondsAfter: this.timelineSecondsValue,
    }));
    return result;
  }

  private prepareLiveInputFrame(inputFrame: ManualInputFrame | undefined): SimulatorResult<{
    readonly engineFrame: ManualInputFrame | null;
    readonly replayFrame: ReplayInputFrame | null;
  }> {
    if (inputFrame === undefined) return ok(Object.freeze({ engineFrame: null, replayFrame: null }));
    if (inputFrame === null || typeof inputFrame !== "object" || !Array.isArray(inputFrame.touches)) {
      return rejected("timeline.replay.invalid-manual-frame", "Replay journaling accepts only an explicit touch array.");
    }
    const engineTouches: ManualInputTouch[] = [];
    const replayTouches: ReplayInputTouch[] = [];
    for (const touch of inputFrame.touches) {
      if (touch === null || typeof touch !== "object") {
        return rejected("timeline.replay.invalid-manual-touch", "Replay journaling requires immutable raw touch records.");
      }
      const copied = copyManualInputPosition(touch.position);
      if (copied.status !== "ok") return copied;
      let resolutionId: number | null = null;
      let currentResolution: ManualInputButtonResolution | null = null;
      if (touch.buttonResolution !== null) {
        if (typeof touch.buttonResolution !== "object") {
          return rejected("timeline.replay.invalid-resolution-capability", "Manual replay consumes wrapper-issued button capabilities only.");
        }
        resolutionId = this.resolutionIds.get(touch.buttonResolution) ?? null;
        if (resolutionId === null) {
          return rejected("timeline.replay.foreign-resolution-capability", "Foreign manual resolution capabilities are rejected.");
        }
        currentResolution = this.currentResolutions.get(resolutionId) ?? null;
        if (currentResolution === null) {
          return rejected("timeline.replay.stale-resolution-capability", "Discarded-future manual capabilities cannot cross MoveTime.");
        }
      }
      engineTouches.push(Object.freeze({ fingerId: touch.fingerId, phase: touch.phase, position: copied.value, buttonResolution: currentResolution }));
      replayTouches.push(Object.freeze({ fingerId: touch.fingerId, phase: touch.phase, position: copied.value, resolutionId }));
    }
    return ok(Object.freeze({
      engineFrame: Object.freeze({ touches: Object.freeze(engineTouches) }),
      replayFrame: Object.freeze({ touches: Object.freeze(replayTouches) }),
    }));
  }

  private replayEvent(
    engine: SimulatorEngine,
    event: ReplayEvent,
    resolutions: Map<number, ManualInputButtonResolution>,
  ): SimulatorResult<void> {
    switch (event.kind) {
      case "resolve-manual-button": {
        const resolved = engine.resolveManualInputButton(event.position);
        if (resolved.status !== "ok") return resolved;
        if ((resolved.value === null) !== (event.resolutionId === null)) {
          return rejected("timeline.replay.manual-resolution-mismatch", "Timeline replay must reproduce manual geometry decisions.");
        }
        if (resolved.value !== null && event.resolutionId !== null) resolutions.set(event.resolutionId, resolved.value);
        return ok(undefined);
      }
      case "step": {
        if (event.inputFrame === null) return engine.step(event.deltaTimeSeconds);
        const touches: ManualInputTouch[] = [];
        for (const touch of event.inputFrame.touches) {
          const resolution = touch.resolutionId === null ? null : resolutions.get(touch.resolutionId) ?? null;
          if (touch.resolutionId !== null && resolution === null) {
            return rejected("timeline.replay.missing-reconstructed-resolution", "A replayed touch references a missing prior geometry capability.");
          }
          touches.push(Object.freeze({ fingerId: touch.fingerId, phase: touch.phase, position: touch.position, buttonResolution: resolution }));
        }
        return engine.step(event.deltaTimeSeconds, Object.freeze({ touches: Object.freeze(touches) }));
      }
      case "pause": return engine.pause();
      case "resume": return engine.resume();
      case "continue-live": return engine.continueLive();
      case "complete-live": return engine.completeLiveAudio(event.clearStatus);
    }
  }

  private available<T>(): SimulatorResult<T> | null {
    if (this.fault !== null) return this.fault;
    if (this.state === "disposed") return rejected("timeline.replay.after-dispose", "Disposed timeline owner rejects all new operations.");
    if (this.state === "replaying") return rejected("timeline.replay.concurrent-operation", "No host operation may interleave with MoveTime reconstruction.");
    return null;
  }
  private latchReplayFault<T>(fault: SimulatorIntegrityFailure): SimulatorResult<T> {
    this.fault ??= Object.freeze({ ...fault, requiredEvidence: Object.freeze([...fault.requiredEvidence]) });
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
    typeof candidate.boundary === "string" && Array.isArray(candidate.requiredEvidence);
}
function rejected(capability: string, boundary: string): SimulatorIntegrityFailure {
  return integrityFailure(capability, [], boundary);
}
