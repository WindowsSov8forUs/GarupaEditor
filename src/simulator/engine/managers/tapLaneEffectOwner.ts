import type { RenderColor, RenderFloat32, RenderOrderingKey, RenderVector2, RenderVector3 } from "../../backends/renderingContracts";
import { createRenderFloat32 } from "../../backends/renderingValidation";
import type { OneFrameJudgementBatch } from "../data/oneFrameData";
import { integrityFailure, ok, type SimulatorResult } from "../evidence";
import {
  RenderCommandProducer,
  RenderOwnerTransaction,
  type OrdinaryFixedNoteSceneInput,
  type TapLaneEffectRenderState,
} from "../rendering/renderCommandProducer";

const SLOT_COUNT = 13;
const TEXTURES = Object.freeze([0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 0] as const);
const OFF_RESERVE_UPDATES = 2;
const FADE_FRAMES = 10;

export type TapLaneEffectPhase = "disabled" | "idle" | "fading";

interface TapLaneEffectSlotState {
  readonly slot: number;
  readonly phase: TapLaneEffectPhase;
  readonly reserveCounter: number;
  readonly fadeFrame: number;
}

export interface TapLaneEffectSnapshot {
  readonly visible: boolean;
  readonly initialized: boolean;
  readonly activeCount: number;
  readonly slots: readonly TapLaneEffectSlotState[];
}

export interface TapLaneEffectInputEvent {
  readonly buttonType: number;
  readonly kind: "on" | "animated-off" | "off-reserve";
}

export class TapLaneEffectTransaction {
  private state: "pending" | "committed" | "discarded" = "pending";

  constructor(
    private readonly render: RenderOwnerTransaction | null,
    private readonly commitState: () => void,
  ) {}

  commit(): SimulatorResult<void> {
    if (this.state !== "pending") return repeated(this.state);
    const committed = this.render?.commit() ?? ok(undefined);
    if (committed.status !== "ok") return committed;
    this.state = "committed";
    this.commitState();
    return ok(undefined);
  }

  discard(): SimulatorResult<void> {
    if (this.state !== "pending") return repeated(this.state);
    const discarded = this.render?.discard() ?? ok(undefined);
    if (discarded.status === "ok") this.state = "discarded";
    return discarded;
  }
}

export class TapLaneEffectOwner {
  private initialized = false;
  private slots: TapLaneEffectSlotState[] = Array.from({ length: SLOT_COUNT }, (_, slot) =>
    frozenSlot(slot, "disabled", -1, 0));

  constructor(
    private readonly producer: RenderCommandProducer,
    private readonly scene: OrdinaryFixedNoteSceneInput,
    private readonly visible: boolean,
    private readonly resolveProductButtonTypes: ((noteIndex: number) => readonly number[] | null) | null = null,
  ) {}

  preflightInitialize(): SimulatorResult<TapLaneEffectTransaction> {
    if (this.initialized || typeof this.visible !== "boolean" || this.scene.goalPositions.length !== 7) {
      return rejected("render.tap-lane-effect.invalid-initialize", "Tap lane effect setup is a single thirteen-owner operation over the fixed seven-lane scene.");
    }
    const renderStates = this.slots.map((state) => this.renderState(state));
    const prepared = this.producer.preflightTapLaneEffectSetup(renderStates);
    if (prepared.status !== "ok") return prepared;
    return ok(new TapLaneEffectTransaction(prepared.value, () => { this.initialized = true; }));
  }

  preflightInputEvents(
    events: readonly TapLaneEffectInputEvent[],
  ): SimulatorResult<TapLaneEffectTransaction | null> {
    if (!this.initialized || !Array.isArray(events)) return unavailable();
    if (!this.visible || events.length === 0) return ok(null);
    const projected = [...this.slots];
    const changed = new Set<number>();
    for (const event of events) {
      const slot = fullButtonSlot(event.buttonType);
      if (slot === null) continue;
      const current = projected[slot]!;
      projected[slot] = event.kind === "on"
        ? frozenSlot(slot, "idle", -1, 0)
        : event.kind === "off-reserve"
          ? frozenSlot(slot, current.phase, OFF_RESERVE_UPDATES, current.fadeFrame)
          : frozenSlot(slot, "fading", -1, 0);
      changed.add(slot);
    }
    return this.prepareProjected(projected, changed);
  }

  preflightJudgement(
    batch: OneFrameJudgementBatch,
  ): SimulatorResult<TapLaneEffectTransaction | null> {
    if (!this.initialized || batch === null || !Array.isArray(batch.entries)) return unavailable();
    if (!this.visible) return ok(null);
    const projected = [...this.slots];
    const changed = new Set<number>();
    for (const entry of batch.entries) {
      const productButtons = this.resolveProductButtonTypes?.(entry.noteIndex) ?? null;
      const slot = judgementSlot(productButtons ?? entry.buttonTypes);
      if (slot === null) continue;
      projected[slot] = frozenSlot(slot, "idle", OFF_RESERVE_UPDATES, 0);
      changed.add(slot);
    }
    return this.prepareProjected(projected, changed);
  }

  preflightAdvance(): SimulatorResult<TapLaneEffectTransaction | null> {
    if (!this.initialized) return unavailable();
    if (!this.visible) return ok(null);
    const projected = [...this.slots];
    const changed = new Set<number>();
    let stateChanged = false;
    for (let slot = 0; slot < projected.length; slot += 1) {
      const current = projected[slot]!;
      if (current.reserveCounter > 0) {
        const counter = current.reserveCounter - 1;
        projected[slot] = counter === 0
          ? frozenSlot(slot, "fading", -1, 0)
          : frozenSlot(slot, current.phase, counter, current.fadeFrame);
        stateChanged = true;
        if (counter === 0) changed.add(slot);
        continue;
      }
      if (current.phase !== "fading") continue;
      const frame = current.fadeFrame + 1;
      projected[slot] = frame >= FADE_FRAMES
        ? frozenSlot(slot, "disabled", -1, 0)
        : frozenSlot(slot, "fading", -1, frame);
      changed.add(slot);
      stateChanged = true;
    }
    return this.prepareProjected(projected, changed, stateChanged);
  }

  preflightAllOff(): SimulatorResult<TapLaneEffectTransaction | null> {
    if (!this.initialized) return unavailable();
    const projected = this.slots.map((_, slot) => frozenSlot(slot, "disabled", -1, 0));
    const changed = new Set(this.slots.filter((slot) => slot.phase !== "disabled").map((slot) => slot.slot));
    return this.prepareProjected(projected, changed);
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
    if (!stateChanged) return ok(null);
    if (changed.size === 0) {
      return ok(new TapLaneEffectTransaction(null, () => { this.slots = projected; }));
    }
    const states = [...changed].sort((left, right) => left - right).map((slot) =>
      this.renderState(projected[slot]!));
    const prepared = this.producer.preflightTapLaneEffectUpdate(states);
    if (prepared.status !== "ok") return prepared;
    return ok(new TapLaneEffectTransaction(prepared.value, () => { this.slots = projected; }));
  }

  private renderState(state: TapLaneEffectSlotState): TapLaneEffectRenderState {
    const position = slotPosition(this.scene.goalPositions, state.slot);
    const progress = state.phase === "fading"
      ? Math.fround(state.fadeFrame / FADE_FRAMES)
      : Math.fround(0);
    const scale = state.phase === "fading"
      ? Math.fround(Math.fround(1) - Math.fround(Math.fround(0.3) * progress))
      : Math.fround(1);
    const colorChannel = state.phase === "fading"
      ? Math.fround(Math.fround(1) - progress)
      : Math.fround(1);
    return Object.freeze({
      slot: state.slot,
      textureIndex: TEXTURES[state.slot]!,
      position,
      scale: vector2(scale, scale),
      color: color(colorChannel, colorChannel, 1, 1),
      ordering: ordering(position.z, state.slot),
      active: state.phase !== "disabled",
    });
  }
}

function fullButtonSlot(buttonType: number): number | null {
  return Number.isInteger(buttonType) && buttonType >= 0 && buttonType <= 6
    ? buttonType * 2
    : null;
}

function judgementSlot(buttonTypes: readonly number[]): number | null {
  if (!Array.isArray(buttonTypes) || buttonTypes.length === 0 ||
    buttonTypes.some((button) => !Number.isInteger(button) || button < 0 || button > 6)) return null;
  const first = buttonTypes[0]!;
  const last = buttonTypes[buttonTypes.length - 1]!;
  const slot = first + last;
  return slot >= 0 && slot < SLOT_COUNT ? slot : null;
}

function slotPosition(goals: readonly RenderVector3[], slot: number): RenderVector3 {
  if (slot % 2 === 0) return goals[slot / 2]!;
  const left = goals[(slot - 1) / 2]!;
  const right = goals[(slot + 1) / 2]!;
  return Object.freeze({
    x: f32((left.x.value + right.x.value) / 2),
    y: f32((left.y.value + right.y.value) / 2),
    z: f32((left.z.value + right.z.value) / 2),
  });
}

function frozenSlot(slot: number, phase: TapLaneEffectPhase, reserveCounter: number, fadeFrame: number): TapLaneEffectSlotState {
  return Object.freeze({ slot, phase, reserveCounter, fadeFrame });
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
  return integrityFailure(capability, ["OLS-R05", "OLS-P01"], boundary);
}
