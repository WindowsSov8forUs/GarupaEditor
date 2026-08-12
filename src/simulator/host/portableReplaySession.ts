import type {
  ManualInputButtonResolution,
  ManualInputFrame,
  ManualInputPosition,
  ManualInputTouch,
} from "../engine/data/manualInput";
import { copyManualInputPosition } from "../engine/data/manualInput";
import {
  evidenceRequired,
  ok,
  type EvidenceRequired,
  type SimulatorResult,
} from "../engine/evidence";
import type {
  SimulatorEngine,
  SimulatorSnapshot,
} from "./contracts";
import { enterMoveTimeForWholeEngineReplay } from "./createSimulatorEngine";

declare const simulatorReplayCheckpointBrand: unique symbol;

export interface SimulatorReplayCheckpoint {
  readonly [simulatorReplayCheckpointBrand]: true;
}

export interface SimulatorWholeEngineReplayFactory {
  createFreshEngine(): Promise<SimulatorResult<SimulatorEngine>>;
}

export interface PortableReplaySimulatorEngine extends SimulatorEngine {
  createReplayCheckpoint(): SimulatorResult<SimulatorReplayCheckpoint>;
  returnTime(checkpoint: SimulatorReplayCheckpoint): Promise<SimulatorResult<void>>;
}

type ReplayEvent =
  | {
      readonly kind: "resolve-manual-button";
      readonly position: ManualInputPosition;
      readonly resolutionId: number | null;
    }
  | {
      readonly kind: "step";
      readonly deltaTimeSeconds: number;
      readonly inputFrame: ReplayInputFrame | null;
    }
  | { readonly kind: "pause" }
  | { readonly kind: "resume" }
  | {
      readonly kind: "complete-live";
      readonly clearStatus: 1 | 2 | 3;
    };

interface ReplayInputTouch {
  readonly fingerId: number;
  readonly phase: ManualInputTouch["phase"];
  readonly position: ManualInputPosition;
  readonly resolutionId: number | null;
}

interface ReplayInputFrame {
  readonly touches: readonly ReplayInputTouch[];
}

interface CheckpointRecord {
  readonly generation: number;
  readonly eventCount: number;
  readonly projection: unknown;
}

export function createPortableReplaySimulatorEngine(
  initialEngine: SimulatorEngine,
  factory: SimulatorWholeEngineReplayFactory,
): SimulatorResult<PortableReplaySimulatorEngine> {
  if (initialEngine === null || typeof initialEngine !== "object" ||
    factory === null || typeof factory !== "object" ||
    typeof factory.createFreshEngine !== "function") {
    return rejected(
      "particle.replay.invalid-host-capability",
      "Whole-engine replay requires one fresh simulator engine and an explicit fresh-engine factory.",
    );
  }
  const before = initialEngine.snapshot();
  if (before.status !== "ok") return before;
  if (before.value.managers.state !== "created" || before.value.managers.fault !== null ||
    before.value.director.awakeComplete || before.value.managers.particle === null ||
    before.value.particleBackend?.state !== "ready") {
    return rejected(
      "particle.replay.initial-engine-not-fresh",
      "Replay ownership transfers only a fresh, uninitialized simulator engine with one ready particle session.",
    );
  }
  const initialized = initialEngine.initialize();
  if (initialized.status !== "ok") return initialized;
  return ok(new PortableReplaySimulatorEngineHost(initialEngine, factory));
}

class PortableReplaySimulatorEngineHost implements PortableReplaySimulatorEngine {
  private active: SimulatorEngine;
  private readonly usedEngines = new WeakSet<object>();
  private readonly checkpointRecords = new WeakMap<object, CheckpointRecord>();
  private readonly resolutionIds = new WeakMap<object, number>();
  private currentResolutions = new Map<number, ManualInputButtonResolution>();
  private events: ReplayEvent[] = [];
  private nextResolutionId = 0;
  private generation = 0;
  private state: "ready" | "replaying" | "faulted" | "disposed" = "ready";
  private fault: EvidenceRequired | null = null;

  constructor(
    initialEngine: SimulatorEngine,
    private readonly factory: SimulatorWholeEngineReplayFactory,
  ) {
    this.active = initialEngine;
    this.usedEngines.add(initialEngine);
  }

  initialize(): SimulatorResult<void> {
    const available = this.available<void>();
    return available ?? this.active.initialize();
  }

  step(
    deltaTimeSeconds: number,
    inputFrame?: ManualInputFrame,
  ): SimulatorResult<void> {
    const available = this.available<void>();
    if (available !== null) return available;
    const prepared = this.prepareLiveInputFrame(inputFrame);
    if (prepared.status !== "ok") return prepared;
    const stepped = this.active.step(deltaTimeSeconds, prepared.value.engineFrame ?? undefined);
    if (stepped.status !== "ok") return stepped;
    this.events.push(Object.freeze({
      kind: "step",
      deltaTimeSeconds,
      inputFrame: prepared.value.replayFrame,
    }));
    return ok(undefined);
  }

  resolveManualInputButton(
    position: ManualInputPosition,
  ): SimulatorResult<ManualInputButtonResolution | null> {
    const available = this.available<ManualInputButtonResolution | null>();
    if (available !== null) return available;
    const copied = copyManualInputPosition(position);
    if (copied.status !== "ok") return copied;
    const resolved = this.active.resolveManualInputButton(copied.value);
    if (resolved.status !== "ok") return resolved;
    let resolutionId: number | null = null;
    if (resolved.value !== null) {
      resolutionId = this.nextResolutionId;
      this.nextResolutionId += 1;
      this.resolutionIds.set(resolved.value, resolutionId);
      this.currentResolutions.set(resolutionId, resolved.value);
    }
    this.events.push(Object.freeze({
      kind: "resolve-manual-button",
      position: copied.value,
      resolutionId,
    }));
    return resolved;
  }

  pause(): SimulatorResult<void> {
    return this.commitSimpleEvent({ kind: "pause" }, () => this.active.pause());
  }

  resume(): SimulatorResult<void> {
    return this.commitSimpleEvent({ kind: "resume" }, () => this.active.resume());
  }

  completeLiveAudio(clearStatus: 1 | 2 | 3): SimulatorResult<void> {
    return this.commitSimpleEvent(Object.freeze({
      kind: "complete-live",
      clearStatus,
    }), () => this.active.completeLiveAudio(clearStatus));
  }

  getNaturalCompletionClearStatus(): 1 | 2 | 3 | null {
    return this.active.getNaturalCompletionClearStatus();
  }

  getAdjustedMusicPosition(): SimulatorResult<number> {
    const available = this.available<number>();
    return available ?? this.active.getAdjustedMusicPosition();
  }

  snapshot(): SimulatorResult<SimulatorSnapshot> {
    if (this.state === "disposed") return this.active.snapshot();
    const available = this.available<SimulatorSnapshot>();
    return available ?? this.active.snapshot();
  }

  createReplayCheckpoint(): SimulatorResult<SimulatorReplayCheckpoint> {
    const available = this.available<SimulatorReplayCheckpoint>();
    if (available !== null) return available;
    const snapshot = this.active.snapshot();
    if (snapshot.status !== "ok") return snapshot;
    if (snapshot.value.managers.state !== "initialized" || snapshot.value.managers.fault !== null) {
      return rejected(
        "particle.replay.checkpoint-outside-active-session",
        "A replay checkpoint captures only one initialized fault-free whole-engine state.",
      );
    }
    const capability = Object.freeze({}) as SimulatorReplayCheckpoint;
    this.checkpointRecords.set(capability, Object.freeze({
      generation: this.generation,
      eventCount: this.events.length,
      projection: createReplayProjection(snapshot.value),
    }));
    return ok(capability);
  }

  async returnTime(
    checkpoint: SimulatorReplayCheckpoint,
  ): Promise<SimulatorResult<void>> {
    const available = this.available<void>();
    if (available !== null) return available;
    if (checkpoint === null || typeof checkpoint !== "object") {
      return rejected(
        "particle.replay.invalid-checkpoint",
        "ReturnTime requires an opaque checkpoint issued by the active replay generation.",
      );
    }
    const record = this.checkpointRecords.get(checkpoint);
    if (record === undefined || record.generation !== this.generation ||
      record.eventCount > this.events.length) {
      return rejected(
        "particle.replay.foreign-or-stale-checkpoint",
        "ReturnTime rejects foreign, future and prior-generation checkpoint capabilities before MoveTime mutation.",
      );
    }

    this.state = "replaying";
    const entered = enterMoveTimeForWholeEngineReplay(this.active);
    if (entered.status !== "ok") {
      this.state = "ready";
      return entered;
    }

    let produced: unknown;
    try {
      produced = await this.factory.createFreshEngine();
    } catch {
      return this.latchReplayFault(rejected(
        "particle.replay.factory-threw",
        "A fresh whole-engine factory exception is terminal and never falls back to particle-only seek.",
      ));
    }
    if (!isSimulatorResult(produced)) {
      return this.latchReplayFault(rejected(
        "particle.replay.factory-invalid-result",
        "The fresh-engine factory must return one explicit SimulatorResult and cannot fail open.",
      ));
    }
    const freshResult = produced as SimulatorResult<SimulatorEngine>;
    if (freshResult.status !== "ok") return this.latchReplayFault(freshResult);
    const fresh = freshResult.value;
    if (fresh === null || typeof fresh !== "object" || fresh === this.active ||
      this.usedEngines.has(fresh)) {
      return this.latchReplayFault(rejected(
        "particle.replay.engine-not-fresh",
        "Every ReturnTime reconstruction requires a previously unused whole-engine instance.",
      ));
    }
    this.usedEngines.add(fresh);
    const freshBefore = fresh.snapshot();
    if (freshBefore.status !== "ok" || freshBefore.value.managers.state !== "created" ||
      freshBefore.value.managers.fault !== null || freshBefore.value.director.awakeComplete ||
      freshBefore.value.managers.particle === null || freshBefore.value.particleBackend?.state !== "ready") {
      fresh.dispose();
      return this.latchReplayFault(freshBefore.status === "ok"
        ? rejected(
            "particle.replay.factory-engine-not-pristine",
            "The fresh-engine factory must return one uninitialized, fault-free whole-engine session with a ready particle backend.",
          )
        : freshBefore);
    }
    const initialized = fresh.initialize();
    if (initialized.status !== "ok") {
      fresh.dispose();
      return this.latchReplayFault(initialized);
    }

    const replayResolutions = new Map<number, ManualInputButtonResolution>();
    for (let index = 0; index < record.eventCount; index += 1) {
      const replayed = this.replayEvent(fresh, this.events[index]!, replayResolutions);
      if (replayed.status !== "ok") {
        fresh.dispose();
        return this.latchReplayFault(replayed);
      }
    }
    const reconstructed = fresh.snapshot();
    if (reconstructed.status !== "ok") {
      fresh.dispose();
      return this.latchReplayFault(reconstructed);
    }
    const projection = createReplayProjection(reconstructed.value);
    if (!replayValuesEqual(record.projection, projection)) {
      fresh.dispose();
      return this.latchReplayFault(rejected(
        "particle.replay.reconstruction-mismatch",
        "Whole-engine deterministic replay must reconstruct the checkpoint projection exactly before publication.",
      ));
    }

    const previous = this.active;
    const disposed = previous.dispose();
    if (disposed.status !== "ok") {
      fresh.dispose();
      return this.latchReplayFault(disposed);
    }
    this.active = fresh;
    this.currentResolutions = replayResolutions;
    for (const [resolutionId, resolution] of replayResolutions) {
      this.resolutionIds.set(resolution, resolutionId);
    }
    this.events = this.events.slice(0, record.eventCount);
    this.generation += 1;
    this.state = "ready";
    return ok(undefined);
  }

  dispose(): SimulatorResult<void> {
    if (this.state === "disposed") return this.active.dispose();
    if (this.state === "replaying") {
      return rejected(
        "particle.replay.dispose-during-reconstruction",
        "Whole-engine replay must finish or terminally fault before deterministic disposal.",
      );
    }
    const disposed = this.active.dispose();
    if (disposed.status === "ok") {
      this.state = "disposed";
      this.currentResolutions.clear();
      this.events = [];
    }
    return disposed;
  }

  private commitSimpleEvent(
    event: ReplayEvent,
    operation: () => SimulatorResult<void>,
  ): SimulatorResult<void> {
    const available = this.available<void>();
    if (available !== null) return available;
    const result = operation();
    if (result.status === "ok") this.events.push(Object.freeze(event));
    return result;
  }

  private prepareLiveInputFrame(
    inputFrame: ManualInputFrame | undefined,
  ): SimulatorResult<{
    readonly engineFrame: ManualInputFrame | null;
    readonly replayFrame: ReplayInputFrame | null;
  }> {
    if (inputFrame === undefined) {
      return ok(Object.freeze({ engineFrame: null, replayFrame: null }));
    }
    if (inputFrame === null || typeof inputFrame !== "object" || !Array.isArray(inputFrame.touches)) {
      return rejected(
        "particle.replay.invalid-manual-frame",
        "Replay journaling accepts only an explicit manual touch array or absent Auto frame.",
      );
    }
    const engineTouches: ManualInputTouch[] = [];
    const replayTouches: ReplayInputTouch[] = [];
    for (const touch of inputFrame.touches) {
      if (touch === null || typeof touch !== "object") {
        return rejected(
          "particle.replay.invalid-manual-touch",
          "Replay journaling requires immutable raw touch records.",
        );
      }
      const copied = copyManualInputPosition(touch.position);
      if (copied.status !== "ok") return copied;
      let resolutionId: number | null = null;
      let currentResolution: ManualInputButtonResolution | null = null;
      if (touch.buttonResolution !== null) {
        if (typeof touch.buttonResolution !== "object") {
          return rejected(
            "particle.replay.invalid-resolution-capability",
            "Manual replay consumes only wrapper-issued button resolution capabilities.",
          );
        }
        resolutionId = this.resolutionIds.get(touch.buttonResolution) ?? null;
        if (resolutionId === null) {
          return rejected(
            "particle.replay.foreign-resolution-capability",
            "Manual replay rejects button resolutions not issued by this whole-engine replay owner.",
          );
        }
        currentResolution = this.currentResolutions.get(resolutionId) ?? null;
        if (currentResolution === null) {
          return rejected(
            "particle.replay.stale-resolution-capability",
            "A resolution issued only on a discarded future timeline cannot cross ReturnTime.",
          );
        }
      }
      engineTouches.push(Object.freeze({
        fingerId: touch.fingerId,
        phase: touch.phase,
        position: copied.value,
        buttonResolution: currentResolution,
      }));
      replayTouches.push(Object.freeze({
        fingerId: touch.fingerId,
        phase: touch.phase,
        position: copied.value,
        resolutionId,
      }));
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
          return rejected(
            "particle.replay.manual-resolution-mismatch",
            "Whole-engine replay must reproduce each null/non-null manual geometry decision.",
          );
        }
        if (resolved.value !== null && event.resolutionId !== null) {
          resolutions.set(event.resolutionId, resolved.value);
        }
        return ok(undefined);
      }
      case "step": {
        if (event.inputFrame === null) return engine.step(event.deltaTimeSeconds);
        const touches: ManualInputTouch[] = [];
        for (const touch of event.inputFrame.touches) {
          const resolution = touch.resolutionId === null
            ? null
            : resolutions.get(touch.resolutionId) ?? null;
          if (touch.resolutionId !== null && resolution === null) {
            return rejected(
              "particle.replay.missing-reconstructed-resolution",
              "A replayed touch cannot reference a resolution absent from its prior replay journal.",
            );
          }
          touches.push(Object.freeze({
            fingerId: touch.fingerId,
            phase: touch.phase,
            position: touch.position,
            buttonResolution: resolution,
          }));
        }
        return engine.step(event.deltaTimeSeconds, Object.freeze({
          touches: Object.freeze(touches),
        }));
      }
      case "pause":
        return engine.pause();
      case "resume":
        return engine.resume();
      case "complete-live":
        return engine.completeLiveAudio(event.clearStatus);
    }
  }

  private available<T>(): SimulatorResult<T> | null {
    if (this.fault !== null) return this.fault;
    if (this.state === "disposed") {
      return rejected(
        "particle.replay.after-dispose",
        "A disposed whole-engine replay owner rejects every operation except snapshot and repeated dispose.",
      );
    }
    if (this.state === "replaying") {
      return rejected(
        "particle.replay.concurrent-operation",
        "No host operation may interleave with whole-engine deterministic reconstruction.",
      );
    }
    return null;
  }

  private latchReplayFault<T>(fault: EvidenceRequired): SimulatorResult<T> {
    if (this.fault === null) {
      this.fault = Object.freeze({
        ...fault,
        requiredEvidence: Object.freeze([...fault.requiredEvidence]),
      });
    }
    this.state = "faulted";
    return this.fault;
  }
}

function createReplayProjection(snapshot: SimulatorSnapshot): unknown {
  return cloneAndFreezeReplayValue({
    director: snapshot.director,
    managers: snapshot.managers,
    adjustedMusicPosition: snapshot.adjustedMusicPosition,
    backendTrace: snapshot.backendTrace,
    renderingBackend: snapshot.renderingBackend === null
      ? null
      : { ...snapshot.renderingBackend, sessionId: null },
    audioBackend: {
      ...snapshot.audioBackend,
      sessionId: null,
    },
    particleBackend: snapshot.particleBackend === null
      ? null
      : { ...snapshot.particleBackend, sessionId: null },
    particleRendererBackend: snapshot.particleRendererBackend === null
      ? null
      : { ...snapshot.particleRendererBackend, sessionId: null },
  });
}

function cloneAndFreezeReplayValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneAndFreezeReplayValue(entry)));
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = cloneAndFreezeReplayValue((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(result);
}

function replayValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  const leftArray = Array.isArray(left);
  if (leftArray !== Array.isArray(right)) return false;
  if (leftArray) {
    const leftValues = left as readonly unknown[];
    const rightValues = right as readonly unknown[];
    return leftValues.length === rightValues.length &&
      leftValues.every((value, index) => replayValuesEqual(value, rightValues[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] &&
      replayValuesEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ));
}

function isSimulatorResult(value: unknown): value is SimulatorResult<unknown> {
  if (value === null || typeof value !== "object" || !("status" in value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.status === "ok") return "value" in candidate;
  return candidate.status === "evidence-required" &&
    typeof candidate.capability === "string" &&
    typeof candidate.boundary === "string" &&
    Array.isArray(candidate.requiredEvidence) &&
    candidate.requiredEvidence.every((entry) => typeof entry === "string");
}

function rejected(capability: string, boundary: string): EvidenceRequired {
  return evidenceRequired(capability, [], boundary);
}
