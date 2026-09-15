import type { RenderColor, RenderFloat32, RenderOrderingKey, RenderVector2 } from "../../backends/renderingContracts";
import { createRenderFloat32 } from "../../backends/renderingValidation";
import { integrityFailure, ok, type SimulatorResult } from "../result";
import {
  RenderCommandProducer,
  RenderOwnerTransaction,
  type OrdinaryFixedNoteSceneInput,
  type TapLaneEffectRenderState,
} from "../rendering/renderCommandProducer";

const SLOT_COUNT = 7;
const TEXTURES = Object.freeze([0, 1, 2, 3, 2, 1, 0] as const);
const OFF_RESERVE_UPDATES = 2;
const FADE_DURATION_SECONDS = Math.fround(1 / 6);

export type TapLaneEffectPhase = "disabled" | "idle" | "fading";

interface TapLaneEffectSlotState {
  readonly slot: number;
  readonly phase: TapLaneEffectPhase;
  readonly reserveCounter: number;
  readonly fadeElapsedSeconds: number;
}

export interface TapLaneEffectSnapshot {
  readonly visible: boolean;
  readonly initialized: boolean;
  readonly activeCount: number;
  readonly slots: readonly TapLaneEffectSlotState[];
}

export interface TapLaneEffectInputEvent {
  readonly buttonType: number;
  readonly kind: "on" | "off" | "animated-off" | "off-reserve";
}

export class TapLaneEffectTransaction {
  private state: "pending" | "backend-committed" | "committed" | "discarded" = "pending";

  constructor(
    private readonly render: RenderOwnerTransaction | null,
    private readonly commitState: () => void,
    private readonly discardState: () => void = () => {},
  ) {}

  commitBackend(): SimulatorResult<void> {
    if (this.state !== "pending") return repeated(this.state);
    const committed = this.render?.commitBackend() ?? ok(undefined);
    if (committed.status === "ok") this.state = "backend-committed";
    return committed;
  }

  publishOwner(): SimulatorResult<void> {
    if (this.state !== "backend-committed") return repeated(this.state);
    const renderOwner = this.render?.publishOwner() ?? ok(undefined);
    if (renderOwner.status !== "ok") return renderOwner;
    this.state = "committed";
    this.commitState();
    return ok(undefined);
  }

  commit(): SimulatorResult<void> {
    const backend = this.commitBackend();
    return backend.status === "ok" ? this.publishOwner() : backend;
  }

  discard(): SimulatorResult<void> {
    if (this.state !== "pending") return repeated(this.state);
    const discarded = this.render?.discard() ?? ok(undefined);
    if (discarded.status === "ok") {
      this.state = "discarded";
      this.discardState();
    }
    return discarded;
  }
}

export class TapLaneEffectStateTransaction {
  private state: "pending" | "committed" | "discarded" = "pending";

  constructor(
    readonly renderStates: readonly TapLaneEffectRenderState[],
    private readonly publish: () => void,
    private readonly release: () => void,
  ) {}

  publishOwner(): SimulatorResult<void> {
    if (this.state !== "pending") return repeated(this.state);
    this.state = "committed";
    this.publish();
    return ok(undefined);
  }

  discard(): SimulatorResult<void> {
    if (this.state !== "pending") return repeated(this.state);
    this.state = "discarded";
    this.release();
    return ok(undefined);
  }
}

export class TapLaneEffectOwner {
  private initialized = false;
  private pendingState: TapLaneEffectStateTransaction | null = null;
  private slots: TapLaneEffectSlotState[] = Array.from({ length: SLOT_COUNT }, (_, slot) =>
    frozenSlot(slot, "disabled", 0, 0));

  constructor(
    private readonly producer: RenderCommandProducer,
    private readonly scene: OrdinaryFixedNoteSceneInput,
    private readonly visible: boolean,
  ) {}

  preflightInitialize(): SimulatorResult<TapLaneEffectTransaction> {
    if (this.initialized || typeof this.visible !== "boolean" || this.scene.goalPositions.length !== 7 ||
      this.scene.tapLaneEffectPositions.length !== SLOT_COUNT) {
      return rejected("render.tap-lane-effect.invalid-initialize", "Tap lane effect setup is a single seven-owner operation over the fixed seven-lane scene.");
    }
    const renderStates = this.slots.map((state) => this.renderState(state));
    const prepared = this.producer.preflightTapLaneEffectSetup(renderStates);
    if (prepared.status !== "ok") return prepared;
    return ok(new TapLaneEffectTransaction(prepared.value, () => { this.initialized = true; }));
  }

  preflightFrame(
    events: readonly TapLaneEffectInputEvent[],
    deltaTimeSeconds: number,
  ): SimulatorResult<TapLaneEffectTransaction | null> {
    if (!this.initialized || !Array.isArray(events)) return unavailable();
    if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
      return rejected("render.tap-lane-effect.invalid-delta", "Lane animation requires a finite non-negative frame delta.");
    }
    if (!this.visible) return ok(null);
    const projected = [...this.slots];
    const changed = new Set<number>();
    let stateChanged = false;
    for (const event of events) {
      const slot = fullButtonSlot(event.buttonType);
      if (slot === null) continue;
      const current = projected[slot]!;
      // The original animation commands do not reset OffReserve's counter.
      if (event.kind === "off-reserve") {
        projected[slot] = frozenSlot(slot, current.phase, OFF_RESERVE_UPDATES, current.fadeElapsedSeconds);
      } else if (event.kind !== "animated-off" || current.phase !== "disabled") {
        projected[slot] = frozenSlot(slot, event.kind === "on" ? "idle"
          : event.kind === "off" ? "disabled" : "fading", current.reserveCounter, 0);
        changed.add(slot);
      }
      stateChanged = true;
    }
    // ButtonManager.ExecUpdate follows input and NoteManager once per outer update.
    for (let slot = 0; slot < projected.length; slot += 1) {
      let current = projected[slot]!;
      if (current.reserveCounter > 0) {
        const counter = current.reserveCounter - 1;
        current = frozenSlot(slot, counter === 0 && current.phase !== "disabled" ? "fading" : current.phase,
          counter, counter === 0 ? 0 : current.fadeElapsedSeconds);
        projected[slot] = current;
        stateChanged = true;
        if (counter === 0) changed.add(slot);
      }
      if (current.phase !== "fading" || deltaTimeSeconds === 0) continue;
      const elapsed = Math.fround(current.fadeElapsedSeconds + Math.fround(deltaTimeSeconds));
      projected[slot] = frozenSlot(slot, elapsed >= FADE_DURATION_SECONDS ? "disabled" : "fading",
        current.reserveCounter, elapsed);
      changed.add(slot);
      stateChanged = true;
    }
    return this.prepareProjected(projected, changed, stateChanged);
  }

  preflightAllOff(): SimulatorResult<TapLaneEffectTransaction | null> {
    const detached = this.preflightAllOffState();
    return detached.status === "ok" ? this.materialize(detached.value) : detached;
  }

  preflightAllOffState(): SimulatorResult<TapLaneEffectStateTransaction | null> {
    if (!this.initialized) return unavailable();
    const projected = this.slots.map((state, slot) => frozenSlot(slot, "disabled", state.reserveCounter, 0));
    const changed = new Set(this.slots.filter((slot) => slot.phase !== "disabled").map((slot) => slot.slot));
    return this.prepareDetached(projected, changed);
  }

  snapshot(): TapLaneEffectSnapshot {
    return Object.freeze({
      visible: this.visible,
      initialized: this.initialized,
      activeCount: this.slots.filter((slot) => slot.phase !== "disabled").length,
      slots: Object.freeze(this.slots.map((slot) => Object.freeze({ ...slot }))),
    });
  }

  private prepareProjected(
    projected: TapLaneEffectSlotState[],
    changed: ReadonlySet<number>,
    stateChanged = changed.size > 0,
  ): SimulatorResult<TapLaneEffectTransaction | null> {
    const detached = this.prepareDetached(projected, changed, stateChanged);
    return detached.status === "ok" ? this.materialize(detached.value) : detached;
  }

  private prepareDetached(
    projected: TapLaneEffectSlotState[],
    changed: ReadonlySet<number>,
    stateChanged = changed.size > 0,
  ): SimulatorResult<TapLaneEffectStateTransaction | null> {
    if (this.pendingState !== null) {
      return rejected("render.tap-lane-effect.overlapping-state-plan", "Only one detached lane-effect state plan may be pending.");
    }
    if (!stateChanged) return ok(null);
    const states = Object.freeze([...changed].sort((left, right) => left - right).map((slot) =>
      this.renderState(projected[slot]!)));
    let transaction!: TapLaneEffectStateTransaction;
    transaction = new TapLaneEffectStateTransaction(
      states,
      () => {
        if (this.pendingState !== transaction) throw new Error("Tap-lane state publication lost its one-use capability");
        this.slots = projected;
        this.pendingState = null;
      },
      () => {
        if (this.pendingState !== transaction) throw new Error("Tap-lane state discard lost its one-use capability");
        this.pendingState = null;
      },
    );
    this.pendingState = transaction;
    return ok(transaction);
  }

  private materialize(
    detached: TapLaneEffectStateTransaction | null,
  ): SimulatorResult<TapLaneEffectTransaction | null> {
    if (detached === null) return ok(null);
    if (detached.renderStates.length === 0) {
      return ok(new TapLaneEffectTransaction(
        null,
        () => { detached.publishOwner(); },
        () => { detached.discard(); },
      ));
    }
    const prepared = this.producer.preflightTapLaneEffectUpdate(detached.renderStates);
    if (prepared.status !== "ok") {
      detached.discard();
      return prepared;
    }
    return ok(new TapLaneEffectTransaction(
      prepared.value,
      () => { detached.publishOwner(); },
      () => { detached.discard(); },
    ));
  }

  private renderState(state: TapLaneEffectSlotState): TapLaneEffectRenderState {
    const position = this.scene.tapLaneEffectPositions[state.slot]!;
    const progress = state.phase === "fading"
      ? Math.fround(Math.min(state.fadeElapsedSeconds / FADE_DURATION_SECONDS, 1))
      : Math.fround(0);
    const scale = state.phase === "fading"
      ? Math.fround(Math.fround(1) - Math.fround(Math.fround(0.3) * progress))
      : Math.fround(1);
    const alpha = state.phase === "fading"
      ? Math.fround(Math.fround(1) - progress)
      : Math.fround(1);
    return Object.freeze({
      slot: state.slot,
      textureIndex: TEXTURES[state.slot]!,
      position,
      scale: vector2(scale, scale),
      color: color(1, 1, 1, alpha),
      ordering: ordering(position.z, state.slot),
      active: state.phase !== "disabled",
      flipX: state.slot >= 4,
    });
  }
}

function fullButtonSlot(buttonType: number): number | null {
  return Number.isInteger(buttonType) && buttonType >= 0 && buttonType <= 6
    ? buttonType
    : null;
}

function frozenSlot(slot: number, phase: TapLaneEffectPhase, reserveCounter: number, fadeElapsedSeconds: number): TapLaneEffectSlotState {
  return Object.freeze({ slot, phase, reserveCounter, fadeElapsedSeconds: Math.fround(fadeElapsedSeconds) });
}
function vector2(x: number, y: number): RenderVector2 { return Object.freeze({ x: f32(x), y: f32(y) }); }
function color(red: number, green: number, blue: number, alpha: number): RenderColor {
  return Object.freeze({ red: f32(red), green: f32(green), blue: f32(blue), alpha: f32(alpha) });
}
function ordering(sourceZ: RenderFloat32, creationSequence: number): RenderOrderingKey {
  return Object.freeze({ domainLayer: 1, sourceDepthOrSortingOrder: 0, sourceZ, creationSequence });
}
function f32(value: number): RenderFloat32 {
  const result = createRenderFloat32(Math.fround(value));
  if (result.status !== "ok") throw new Error(`${result.capability}: value=${String(value)} rounded=${String(Math.fround(value))}`);
  return result.value;
}
function unavailable(): ReturnType<typeof integrityFailure> {
  return rejected("render.tap-lane-effect.owner-unavailable", "Tap lane effect transactions require one initialized fixed owner.");
}
function repeated(state: string): ReturnType<typeof integrityFailure> {
  return rejected("render.tap-lane-effect.repeated-transaction", `Tap lane effect transaction cannot commit or discard from ${state}.`);
}
function rejected(capability: string, boundary: string): ReturnType<typeof integrityFailure> {
  return integrityFailure(capability, boundary);
}
