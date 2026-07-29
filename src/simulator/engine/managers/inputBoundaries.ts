import type { ButtonTypeValue } from "../chart/types";
import type { SimulatorPlayMode } from "../data/inGameCalculatedData";
import { GameState, type GameStateValue } from "../data/inGameState";
import {
  ManualInputResolutionOwner,
  ManualTouchPhase,
  type ManualInputButtonResolution,
  type ManualInputFrame,
  type ManualInputFrameSnapshot,
  type ManualInputPosition,
  type PreparedManualInputFrame,
  type PreparedManualInputTouch,
} from "../data/manualInput";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import { NoteBase, NoteState, type ManualNoteTouchInput } from "../notes/noteBase";
import type { NoteManager } from "./noteManager";

const FINGER_OWNER_CAPACITY = 15;
const GAME_PLAY_BUTTON_COUNT = 16;

export interface ManualInputDispatchPlan {
  readonly touchCount: number;
}

export interface ManualInputDispatcher {
  preflight(
    frame: PreparedManualInputFrame,
  ): SimulatorResult<ManualInputDispatchPlan>;
  commit(plan: ManualInputDispatchPlan): void;
  snapshot?(): unknown;
  dispose?(): void;
}

interface PendingManualInputFrame {
  readonly frame: PreparedManualInputFrame;
  readonly dispatchPlan: ManualInputDispatchPlan | null;
}

export interface InputManagerSnapshot {
  readonly playMode: "manual" | "auto-live";
  readonly dispatcherRegistered: boolean;
  readonly dispatchOwner: unknown;
  readonly pendingFrame: boolean;
  readonly consumedFrameCount: number;
  readonly lastFrame: ManualInputFrameSnapshot | null;
  readonly trace: readonly ManualInputFrameSnapshot[];
  readonly resolutionOwner: ReturnType<ManualInputResolutionOwner["snapshot"]>;
}

export class InputManager {
  private readonly resolutionOwner = new ManualInputResolutionOwner();
  private pendingFrameValue: PendingManualInputFrame | null = null;
  private dispatcherValue: ManualInputDispatcher | null = null;
  private consumedFrameCountValue = 0;
  private lastFrameValue: ManualInputFrameSnapshot | null = null;
  private readonly traceValue: ManualInputFrameSnapshot[] = [];

  constructor(private readonly playMode: SimulatorPlayMode) {}

  initialize(): SimulatorResult<void> {
    return this.resolutionOwner.initialize();
  }

  issueButtonResolution(
    position: ManualInputPosition,
    buttonOwner: object,
  ): SimulatorResult<ManualInputButtonResolution> {
    return this.resolutionOwner.issue(position, buttonOwner);
  }

  registerDispatcher(dispatcher: ManualInputDispatcher): SimulatorResult<void> {
    if (
      this.dispatcherValue !== null ||
      dispatcher === null ||
      typeof dispatcher !== "object" ||
      typeof dispatcher.preflight !== "function" ||
      typeof dispatcher.commit !== "function"
    ) {
      return evidenceRequired(
        "input.invalid-or-duplicate-dispatcher",
        ["D03", "D14", "D15", "MJ25", "MJ26"],
        "InputManager accepts exactly one engine-owned manual dispatcher for its initialized session.",
      );
    }
    this.dispatcherValue = dispatcher;
    return ok(undefined);
  }

  prepareOuterFrame(
    frame: ManualInputFrame | undefined,
  ): SimulatorResult<void> {
    if (this.pendingFrameValue !== null) {
      return evidenceRequired(
        "input.frame-already-pending",
        ["D14", "D15", "MJ25", "MJ26"],
        "One InputManager owner can stage at most one input frame for an outer update.",
      );
    }
    if (this.playMode.kind === "auto-live") {
      if (frame === undefined) {
        return ok(undefined);
      }
      if (frame === null || typeof frame !== "object" || !Array.isArray(frame.touches)) {
        return evidenceRequired(
          "input.invalid-auto-live-frame",
          ["D14", "D15", "MJ25", "MJ26"],
          "An Auto Live outer update cannot accept a malformed manual input frame.",
        );
      }
      if (frame.touches.length !== 0) {
        return evidenceRequired(
          "input.touch-in-auto-live",
          ["D14", "MJ25"],
          "Real touch input cannot switch Auto Live into manual judgement or share its synthetic producer.",
        );
      }
      return ok(undefined);
    }
    if (frame === undefined) {
      return evidenceRequired(
        "input.manual-frame-required",
        ["D03", "D14", "MJ01", "MJ25"],
        "Manual mode requires an explicit touch array for every consumed outer frame.",
      );
    }
    const prepared = this.resolutionOwner.preflight(frame);
    if (prepared.status !== "ok") {
      return prepared;
    }
    let dispatchPlan: ManualInputDispatchPlan | null = null;
    if (prepared.value.touches.length > 0) {
      if (this.dispatcherValue === null) {
        return evidenceRequired(
          "input.manual-dispatcher-unregistered",
          ["D03", "D14", "D15", "MJ25", "MJ26"],
          "A non-empty manual frame requires the single engine-owned dispatcher before any resolver capability is consumed.",
        );
      }
      const preflight = this.dispatcherValue.preflight(prepared.value);
      if (preflight.status !== "ok") {
        return preflight;
      }
      dispatchPlan = preflight.value;
      if (dispatchPlan.touchCount !== prepared.value.touches.length) {
        return evidenceRequired(
          "input.invalid-dispatch-plan",
          ["D14", "D15", "MJ25", "MJ26"],
          "The dispatcher plan must cover every touch in caller enumeration order.",
        );
      }
    }
    const committed = this.resolutionOwner.commit(prepared.value);
    if (committed.status !== "ok") {
      return committed;
    }
    this.pendingFrameValue = Object.freeze({
      frame: prepared.value,
      dispatchPlan,
    });
    return ok(undefined);
  }

  execInput(currentGameState: GameStateValue): SimulatorResult<void> {
    if (this.playMode.kind === "auto-live") {
      return ok(undefined);
    }
    if (
      currentGameState !== GameState.PlayingSound &&
      currentGameState !== GameState.PlayingNone
    ) {
      return ok(undefined);
    }
    const pending = this.pendingFrameValue;
    if (pending === null) {
      return evidenceRequired(
        "input.manual-frame-not-staged",
        ["D14", "MJ01", "MJ25"],
        "InputManager consumes exactly one explicitly staged manual frame per active outer update.",
      );
    }
    if (pending.dispatchPlan !== null) {
      if (this.dispatcherValue === null) {
        return evidenceRequired(
          "input.manual-dispatcher-lost",
          ["D14", "D15", "MJ25", "MJ26"],
          "The owner that preflighted a non-empty frame must remain registered until the same outer-frame input dispatch.",
        );
      }
      this.dispatcherValue.commit(pending.dispatchPlan);
    }
    this.pendingFrameValue = null;
    const snapshot = Object.freeze({
      frameIndex: this.consumedFrameCountValue,
      touches: Object.freeze(pending.frame.touches.map((touch) => Object.freeze({
        fingerId: touch.fingerId,
        phase: touch.phase,
        position: Object.freeze({ ...touch.position }),
        resolvedButton: touch.resolvedButton,
      }))),
    });
    this.consumedFrameCountValue += 1;
    this.lastFrameValue = snapshot;
    this.traceValue.push(snapshot);
    return ok(undefined);
  }

  dispose(): void {
    this.pendingFrameValue = null;
    this.dispatcherValue?.dispose?.();
    this.resolutionOwner.dispose();
  }

  snapshot(): InputManagerSnapshot {
    return Object.freeze({
      playMode: this.playMode.kind,
      dispatcherRegistered: this.dispatcherValue !== null,
      dispatchOwner: this.dispatcherValue?.snapshot?.() ?? null,
      pendingFrame: this.pendingFrameValue !== null,
      consumedFrameCount: this.consumedFrameCountValue,
      lastFrame: copyFrameSnapshot(this.lastFrameValue),
      trace: Object.freeze(
        this.traceValue.map((frame) => copyFrameSnapshot(frame) as ManualInputFrameSnapshot),
      ),
      resolutionOwner: this.resolutionOwner.snapshot(),
    });
  }
}

interface GamePlayButtonProjection {
  readonly beganPositions: (ManualInputPosition | null)[];
  readonly touchNotes: (NoteBase | null)[];
}

interface GamePlayButtonTouchPlan {
  readonly phase: "began" | "moved" | "ended" | "none";
  readonly touchPhase: ManualNoteTouchInput["phase"];
  readonly fingerId: number;
  readonly position: ManualInputPosition;
  readonly beganPosition: ManualInputPosition | null;
  readonly note: NoteBase | null;
  readonly bindNote: boolean;
}

interface GamePlayInputOperation {
  readonly inputButton: GamePlayButton | null;
  readonly fingerId: number;
  readonly buttonPlan: GamePlayButtonTouchPlan | null;
}

interface GamePlayInputPlan extends ManualInputDispatchPlan {
  readonly operations: readonly GamePlayInputOperation[];
}

export interface GamePlayButtonSnapshot {
  readonly buttonType: ButtonTypeValue;
  readonly touchOwners: readonly {
    readonly fingerId: number;
    readonly beganPosition: ManualInputPosition | null;
    readonly noteIndex: number | null;
    readonly noteFingerId: number | null;
  }[];
}

export interface GamePlayInputDispatcherSnapshot {
  readonly buttonWithFingerId: readonly (ButtonTypeValue | null)[];
  readonly buttons: readonly GamePlayButtonSnapshot[];
}

export class GamePlayInputDispatcher implements ManualInputDispatcher {
  private readonly buttonsValue: readonly GamePlayButton[];
  private readonly ownedButtons = new WeakSet<GamePlayButton>();
  private readonly ownedPlans = new WeakSet<GamePlayInputPlan>();
  private readonly buttonWithFingerId: (GamePlayButton | null)[] = Array.from(
    { length: FINGER_OWNER_CAPACITY },
    () => null,
  );

  constructor(noteManager: NoteManager) {
    this.buttonsValue = Object.freeze(Array.from(
      { length: GAME_PLAY_BUTTON_COUNT },
      (_, buttonType) => new GamePlayButton(buttonType as ButtonTypeValue, noteManager),
    ));
    for (const button of this.buttonsValue) {
      this.ownedButtons.add(button);
    }
  }

  getButtonForResolver(buttonType: ButtonTypeValue): SimulatorResult<GamePlayButton> {
    if (!Number.isInteger(buttonType) || buttonType < 0 || buttonType >= GAME_PLAY_BUTTON_COUNT) {
      return evidenceRequired(
        "input.resolver-button-outside-gameplay-domain",
        ["D02", "D03", "D15", "MJ05", "MJ26"],
        "The gameplay resolver owner can issue only one of the 16 ButtonType values 0..15.",
      );
    }
    const button = this.buttonsValue[buttonType];
    return button === undefined
      ? evidenceRequired(
          "input.resolver-button-owner-missing",
          ["D02", "D03", "D15", "MJ05", "MJ26"],
          "The requested gameplay button must exist in this dispatcher owner.",
        )
      : ok(button);
  }

  preflight(
    frame: PreparedManualInputFrame,
  ): SimulatorResult<ManualInputDispatchPlan> {
    const projectedInputButtons = [...this.buttonWithFingerId];
    const projections = new Map<GamePlayButton, GamePlayButtonProjection>();
    const projectedFingerOwners = new Map<NoteBase, number>();
    const operations: GamePlayInputOperation[] = [];

    for (const touch of frame.touches) {
      let inputButton: GamePlayButton | null = null;
      let buttonPlan: GamePlayButtonTouchPlan | null = null;
      if (touch.phase === ManualTouchPhase.Began) {
        if (touch.buttonOwner !== null) {
          if (!(touch.buttonOwner instanceof GamePlayButton) || !this.ownedButtons.has(touch.buttonOwner)) {
            return evidenceRequired(
              "input.foreign-game-play-button",
              ["D03", "D15", "MJ05", "MJ26"],
              "A resolved button must be the exact GamePlayButton owned by this engine dispatcher.",
            );
          }
          inputButton = touch.buttonOwner;
          projectedInputButtons[touch.fingerId] = inputButton;
          const projection = projectionFor(inputButton, projections);
          const planned = inputButton.preflightTouchBegan(
            touch,
            projection,
            projectedFingerOwners,
          );
          if (planned.status !== "ok") {
            return planned;
          }
          buttonPlan = planned.value;
        }
      } else {
        inputButton = projectedInputButtons[touch.fingerId] ?? null;
        if (inputButton !== null) {
          const projection = projectionFor(inputButton, projections);
          const planned = inputButton.preflightTouchContinuation(touch, projection);
          if (planned.status !== "ok") {
            return planned;
          }
          buttonPlan = planned.value;
        }
      }
      operations.push(Object.freeze({
        inputButton: touch.phase === ManualTouchPhase.Began ? inputButton : null,
        fingerId: touch.fingerId,
        buttonPlan,
      }));
    }

    const plan: GamePlayInputPlan = Object.freeze({
      touchCount: frame.touches.length,
      operations: Object.freeze(operations),
    });
    this.ownedPlans.add(plan);
    return ok(plan);
  }

  commit(plan: ManualInputDispatchPlan): void {
    const ownedPlan = plan as GamePlayInputPlan;
    if (!this.ownedPlans.has(ownedPlan)) {
      throw new Error("GamePlayInputDispatcher received a foreign dispatch plan");
    }
    this.ownedPlans.delete(ownedPlan);
    for (const operation of ownedPlan.operations) {
      if (operation.inputButton !== null) {
        this.buttonWithFingerId[operation.fingerId] = operation.inputButton;
      }
      if (operation.buttonPlan !== null) {
        const button = operation.inputButton ??
          this.buttonWithFingerId[operation.fingerId];
        button?.commitTouch(operation.buttonPlan);
      }
    }
  }

  snapshot(): GamePlayInputDispatcherSnapshot {
    return Object.freeze({
      buttonWithFingerId: Object.freeze(
        this.buttonWithFingerId.map((button) => button?.buttonType ?? null),
      ),
      buttons: Object.freeze(this.buttonsValue.map((button) => button.snapshot())),
    });
  }

  dispose(): void {
    this.buttonWithFingerId.fill(null);
    for (const button of this.buttonsValue) {
      button.dispose();
    }
  }
}

export class GamePlayButton {
  private readonly beganPositions: (ManualInputPosition | null)[] = Array.from(
    { length: FINGER_OWNER_CAPACITY },
    () => null,
  );
  private readonly touchNotes: (NoteBase | null)[] = Array.from(
    { length: FINGER_OWNER_CAPACITY },
    () => null,
  );

  constructor(
    readonly buttonType: ButtonTypeValue,
    private readonly noteManager?: NoteManager,
  ) {}

  preflightTouchBegan(
    touch: PreparedManualInputTouch,
    projection: GamePlayButtonProjection,
    projectedFingerOwners: Map<NoteBase, number>,
  ): SimulatorResult<GamePlayButtonTouchPlan> {
    if (this.noteManager === undefined) {
      return evidenceRequired(
        "input.game-play-button.owner-unregistered",
        ["D03", "D04", "MJ03", "MJ05"],
        "GamePlayButton must retain its engine NoteManager owner before touch arbitration.",
      );
    }
    const selected = this.noteManager.selectManualCandidateBeforeJudgement(
      this.buttonType,
    );
    if (selected.status !== "ok") {
      return selected;
    }
    const candidate = selected.value;
    if (candidate === null) {
      projection.touchNotes[touch.fingerId] = null;
      return ok(noNotePlan("began", touch));
    }
    const beganInput = manualNoteInput(
      touch,
      touch.position,
      ManualTouchPhase.Began,
    );
    const judgement = candidate.preflightManualTouchBegan(beganInput);
    if (judgement.status !== "ok") {
      return judgement;
    }
    const projectedFinger = projectedFingerOwners.get(candidate) ?? candidate.fingerId;
    if (judgement.value === "none" || projectedFinger >= 0) {
      projection.touchNotes[touch.fingerId] = null;
      return ok(noNotePlan("began", touch));
    }
    projection.beganPositions[touch.fingerId] = touch.position;
    projection.touchNotes[touch.fingerId] = candidate;
    projectedFingerOwners.set(candidate, touch.fingerId);
    return ok(Object.freeze({
      phase: "began",
      touchPhase: touch.phase,
      fingerId: touch.fingerId,
      position: touch.position,
      beganPosition: touch.position,
      note: candidate,
      bindNote: true,
    }));
  }

  preflightTouchContinuation(
    touch: PreparedManualInputTouch,
    projection: GamePlayButtonProjection,
  ): SimulatorResult<GamePlayButtonTouchPlan> {
    const note = projection.touchNotes[touch.fingerId] ?? null;
    const beganPosition = projection.beganPositions[touch.fingerId] ?? null;
    if (note === null || beganPosition === null || note.state === NoteState.Deactive) {
      return ok(noNotePlan(
        touch.phase === ManualTouchPhase.Ended ? "ended" : "moved",
        touch,
      ));
    }
    const phase = touch.phase === ManualTouchPhase.Ended ? "ended" : "moved";
    const input = manualNoteInput(touch, beganPosition, touch.phase);
    const validation = phase === "ended"
      ? note.preflightManualTouchEnded(input)
      : note.preflightManualTouchMoved(input);
    if (validation.status !== "ok") {
      return validation;
    }
    return ok(Object.freeze({
      phase,
      touchPhase: touch.phase,
      fingerId: touch.fingerId,
      position: touch.position,
      beganPosition,
      note,
      bindNote: false,
    }));
  }

  commitTouch(plan: GamePlayButtonTouchPlan): void {
    if (plan.phase === "none" || plan.note === null) {
      if (plan.phase === "began") {
        this.touchNotes[plan.fingerId] = null;
      }
      return;
    }
    const input: ManualNoteTouchInput = Object.freeze({
      fingerId: plan.fingerId,
      phase: plan.touchPhase,
      beganPosition: plan.beganPosition ?? plan.position,
      currentPosition: plan.position,
    });
    if (plan.phase === "began") {
      this.beganPositions[plan.fingerId] = plan.beganPosition;
      this.touchNotes[plan.fingerId] = plan.note;
      if (plan.bindNote) {
        plan.note.setFingerId(plan.fingerId);
      }
      plan.note.commitManualTouchBegan(input);
      return;
    }
    if (plan.phase === "ended") {
      plan.note.commitManualTouchEnded(input);
      return;
    }
    plan.note.commitManualTouchMoved(input);
  }

  execTouchBegan(): SimulatorResult<void> {
    return evidenceRequired(
      "input.game-play-button.touch-began",
      ["D03", "D04", "D15", "MJ03", "MJ26"],
      "GamePlayButton touch dispatch requires an owner-preflighted outer-frame plan and cannot be called as a public shortcut.",
    );
  }

  snapshot(): GamePlayButtonSnapshot {
    return Object.freeze({
      buttonType: this.buttonType,
      touchOwners: Object.freeze(this.touchNotes.flatMap((note, fingerId) => {
        const beganPosition = this.beganPositions[fingerId] ?? null;
        return note === null && beganPosition === null
          ? []
          : [Object.freeze({
              fingerId,
              beganPosition: beganPosition === null
                ? null
                : Object.freeze({ ...beganPosition }),
              noteIndex: note?.noteInformation?.index ?? null,
              noteFingerId: note?.fingerId ?? null,
            })];
      })),
    });
  }

  dispose(): void {
    this.beganPositions.fill(null);
    this.touchNotes.fill(null);
  }

  createProjection(): GamePlayButtonProjection {
    return {
      beganPositions: [...this.beganPositions],
      touchNotes: [...this.touchNotes],
    };
  }
}

function projectionFor(
  button: GamePlayButton,
  projections: Map<GamePlayButton, GamePlayButtonProjection>,
): GamePlayButtonProjection {
  const existing = projections.get(button);
  if (existing !== undefined) {
    return existing;
  }
  const created = button.createProjection();
  projections.set(button, created);
  return created;
}

function manualNoteInput(
  touch: PreparedManualInputTouch,
  beganPosition: ManualInputPosition,
  phase: ManualNoteTouchInput["phase"],
): ManualNoteTouchInput {
  return Object.freeze({
    fingerId: touch.fingerId,
    phase,
    beganPosition,
    currentPosition: touch.position,
  });
}

function noNotePlan(
  phase: GamePlayButtonTouchPlan["phase"],
  touch: PreparedManualInputTouch,
): GamePlayButtonTouchPlan {
  return Object.freeze({
    phase,
    touchPhase: touch.phase,
    fingerId: touch.fingerId,
    position: touch.position,
    beganPosition: null,
    note: null,
    bindNote: false,
  });
}

function copyFrameSnapshot(
  frame: ManualInputFrameSnapshot | null,
): ManualInputFrameSnapshot | null {
  if (frame === null) {
    return null;
  }
  return Object.freeze({
    frameIndex: frame.frameIndex,
    touches: Object.freeze(frame.touches.map((touch) => Object.freeze({
      fingerId: touch.fingerId,
      phase: touch.phase,
      position: Object.freeze({ ...touch.position }),
      resolvedButton: touch.resolvedButton,
    }))),
  });
}
