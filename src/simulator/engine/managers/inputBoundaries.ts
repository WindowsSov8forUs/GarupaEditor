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

export interface InputManagerSnapshot {
  readonly playMode: "manual" | "auto-live";
  readonly pendingFrame: boolean;
  readonly consumedFrameCount: number;
  readonly lastFrame: ManualInputFrameSnapshot | null;
  readonly trace: readonly ManualInputFrameSnapshot[];
  readonly resolutionOwner: ReturnType<ManualInputResolutionOwner["snapshot"]>;
}

export class InputManager {
  private readonly resolutionOwner = new ManualInputResolutionOwner();
  private pendingFrameValue: PreparedManualInputFrame | null = null;
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
    this.pendingFrameValue = prepared.value;
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
    const frame = this.pendingFrameValue;
    if (frame === null) {
      return evidenceRequired(
        "input.manual-frame-not-staged",
        ["D14", "MJ01", "MJ25"],
        "InputManager consumes exactly one explicitly staged manual frame per active outer update.",
      );
    }
    this.pendingFrameValue = null;
    const snapshot = Object.freeze({
      frameIndex: this.consumedFrameCountValue,
      touches: Object.freeze(frame.touches.map((touch) => Object.freeze({
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
