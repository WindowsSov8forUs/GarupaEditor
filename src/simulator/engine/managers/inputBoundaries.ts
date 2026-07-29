import type { SimulatorPlayMode } from "../data/inGameCalculatedData";
import { GameState, type GameStateValue } from "../data/inGameState";
import {
  ManualInputResolutionOwner,
  type ManualInputButtonResolution,
  type ManualInputFrame,
  type ManualInputFrameSnapshot,
  type ManualInputPosition,
  type PreparedManualInputFrame,
} from "../data/manualInput";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";

export interface ManualInputDispatchPlan {
  readonly touchCount: number;
}

export interface ManualInputDispatcher {
  preflight(
    frame: PreparedManualInputFrame,
  ): SimulatorResult<ManualInputDispatchPlan>;
  commit(plan: ManualInputDispatchPlan): void;
}

interface PendingManualInputFrame {
  readonly frame: PreparedManualInputFrame;
  readonly dispatchPlan: ManualInputDispatchPlan | null;
}

export interface InputManagerSnapshot {
  readonly playMode: "manual" | "auto-live";
  readonly dispatcherRegistered: boolean;
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
    this.resolutionOwner.dispose();
  }

  snapshot(): InputManagerSnapshot {
    return Object.freeze({
      playMode: this.playMode.kind,
      dispatcherRegistered: this.dispatcherValue !== null,
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

export class GamePlayButton {
  execTouchBegan(): SimulatorResult<void> {
    return evidenceRequired(
      "input.game-play-button.touch-began",
      ["E12", "E13"],
      "GamePlayButton ownership is represented, but touch arbitration and judgement are excluded.",
    );
  }
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
