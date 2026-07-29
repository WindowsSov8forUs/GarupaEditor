import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";

export const ManualTouchPhase = {
  Began: 0,
  Moved: 1,
  Stationary: 2,
  Ended: 3,
} as const;

export type ManualTouchPhaseValue =
  (typeof ManualTouchPhase)[keyof typeof ManualTouchPhase];

export interface ManualInputPosition {
  readonly x: number;
  readonly y: number;
}

declare const manualInputButtonResolutionBrand: unique symbol;

export interface ManualInputButtonResolution {
  readonly [manualInputButtonResolutionBrand]: true;
}

export interface ManualInputTouch {
  readonly fingerId: number;
  readonly phase: ManualTouchPhaseValue;
  readonly position: ManualInputPosition;
  readonly buttonResolution: ManualInputButtonResolution | null;
}

export interface ManualInputFrame {
  readonly touches: readonly ManualInputTouch[];
}

export interface ManualInputTouchSnapshot {
  readonly fingerId: number;
  readonly phase: ManualTouchPhaseValue;
  readonly position: ManualInputPosition;
  readonly resolvedButton: boolean;
}

export interface ManualInputFrameSnapshot {
  readonly frameIndex: number;
  readonly touches: readonly ManualInputTouchSnapshot[];
}

export interface ManualInputResolutionOwnerSnapshot {
  readonly initialized: boolean;
  readonly disposed: boolean;
  readonly issuedCount: number;
  readonly consumedCount: number;
}

export interface PreparedManualInputTouch extends ManualInputTouchSnapshot {
  readonly buttonOwner: object | null;
}

export interface PreparedManualInputFrame {
  readonly touches: readonly PreparedManualInputTouch[];
  readonly buttonResolutions: readonly ManualInputButtonResolution[];
}

interface OwnedButtonResolution {
  readonly position: ManualInputPosition;
  readonly buttonOwner: object;
  consumed: boolean;
}

export class ManualInputResolutionOwner {
  private readonly ownedResolutions = new WeakMap<
    ManualInputButtonResolution,
    OwnedButtonResolution
  >();
  private readonly ownedPreparedFrames = new WeakSet<PreparedManualInputFrame>();
  private initializedValue = false;
  private disposedValue = false;
  private issuedCountValue = 0;
  private consumedCountValue = 0;

  initialize(): SimulatorResult<void> {
    if (this.disposedValue) {
      return evidenceRequired(
        "input.resolution-owner.initialize-after-dispose",
        ["D14", "MJ25"],
        "An input resolver owner remains terminal after its initialized engine session is disposed.",
      );
    }
    this.initializedValue = true;
    return ok(undefined);
  }

  issue(
    position: ManualInputPosition,
    buttonOwner: object,
  ): SimulatorResult<ManualInputButtonResolution> {
    if (!this.initializedValue || this.disposedValue) {
      return evidenceRequired(
        "input.resolution-owner.outside-initialized-session",
        ["D03", "D14", "MJ25"],
        "Button resolutions are bound to one initialized, non-disposed engine session.",
      );
    }
    const positionValidation = copyManualInputPosition(position);
    if (positionValidation.status !== "ok") {
      return positionValidation;
    }
    if (buttonOwner === null || typeof buttonOwner !== "object") {
      return evidenceRequired(
        "input.resolution-owner.invalid-button-owner",
        ["D03", "D15", "MJ26"],
        "Only an engine-owned GamePlayButton object can back a resolver capability.",
      );
    }
    const handle = Object.freeze({}) as ManualInputButtonResolution;
    this.ownedResolutions.set(handle, {
      position: positionValidation.value,
      buttonOwner,
      consumed: false,
    });
    this.issuedCountValue += 1;
    return ok(handle);
  }

  preflight(frame: ManualInputFrame): SimulatorResult<PreparedManualInputFrame> {
    if (!this.initializedValue || this.disposedValue) {
      return evidenceRequired(
        "input.frame.outside-initialized-session",
        ["D14", "MJ25"],
        "Manual input frames can only be prepared by their initialized, non-disposed engine owner.",
      );
    }
    if (frame === null || typeof frame !== "object" || !Array.isArray(frame.touches)) {
      return evidenceRequired(
        "input.invalid-frame",
        ["D15", "MJ26"],
        "A manual outer frame must explicitly provide a touch array.",
      );
    }

    const seenFingerPhases = new Set<string>();
    const seenResolutions = new Set<ManualInputButtonResolution>();
    const buttonResolutions: ManualInputButtonResolution[] = [];
    const touches: PreparedManualInputTouch[] = [];

    for (const touch of frame.touches) {
      if (touch === null || typeof touch !== "object") {
        return invalidTouch("Each touch must be an immutable raw touch record.");
      }
      if (!Number.isInteger(touch.fingerId) || touch.fingerId < 0 || touch.fingerId > 14) {
        return invalidTouch("Touch fingerId must remain in the owner array interval 0..14.");
      }
      if (!isManualTouchPhase(touch.phase)) {
        return invalidTouch("Only Began, Moved, Stationary and Ended phases 0..3 are represented.");
      }
      const positionValidation = copyManualInputPosition(touch.position);
      if (positionValidation.status !== "ok") {
        return positionValidation;
      }
      const fingerPhaseKey = `${touch.fingerId}:${touch.phase}`;
      if (seenFingerPhases.has(fingerPhaseKey)) {
        return invalidTouch("A finger/phase pair cannot be duplicated in one outer frame.");
      }
      seenFingerPhases.add(fingerPhaseKey);

      let buttonOwner: object | null = null;
      if (touch.buttonResolution !== null) {
        if (touch.phase !== ManualTouchPhase.Began) {
          return invalidTouch("Moved, Stationary and Ended must reuse owner state and cannot rebind a button.");
        }
        if (
          typeof touch.buttonResolution !== "object" ||
          seenResolutions.has(touch.buttonResolution)
        ) {
          return invalidTouch("A resolver capability cannot be forged, aliased or consumed twice.");
        }
        const owned = this.ownedResolutions.get(touch.buttonResolution);
        if (
          owned === undefined ||
          owned.consumed ||
          !samePosition(owned.position, positionValidation.value)
        ) {
          return evidenceRequired(
            "input.foreign-or-invalid-button-resolution",
            ["D03", "D15", "MJ26"],
            "The button resolution must belong to this engine session, remain unused and match the exact Float32 touch position.",
          );
        }
        seenResolutions.add(touch.buttonResolution);
        buttonResolutions.push(touch.buttonResolution);
        buttonOwner = owned.buttonOwner;
      }

      touches.push(Object.freeze({
        fingerId: touch.fingerId,
        phase: touch.phase,
        position: positionValidation.value,
        resolvedButton: buttonOwner !== null,
        buttonOwner,
      }));
    }

    const prepared = Object.freeze({
      touches: Object.freeze(touches),
      buttonResolutions: Object.freeze(buttonResolutions),
    });
    this.ownedPreparedFrames.add(prepared);
    return ok(prepared);
  }

  commit(prepared: PreparedManualInputFrame): SimulatorResult<void> {
    if (!this.initializedValue || this.disposedValue) {
      return evidenceRequired(
        "input.frame.commit-outside-initialized-session",
        ["D14", "MJ25"],
        "A prepared frame cannot consume capabilities outside its initialized engine session.",
      );
    }
    if (!this.ownedPreparedFrames.has(prepared)) {
      return evidenceRequired(
        "input.foreign-prepared-frame",
        ["D03", "D15", "MJ26"],
        "Only the exact immutable frame prepared by this resolver owner can consume its capabilities.",
      );
    }
    const owned: OwnedButtonResolution[] = [];
    for (const handle of prepared.buttonResolutions) {
      const resolution = this.ownedResolutions.get(handle);
      if (resolution === undefined || resolution.consumed) {
        return evidenceRequired(
          "input.foreign-or-invalid-button-resolution",
          ["D03", "D15", "MJ26"],
          "Every prepared button resolution must remain owned and unused until whole-frame dispatch preflight succeeds.",
        );
      }
      owned.push(resolution);
    }
    for (const resolution of owned) {
      resolution.consumed = true;
      this.consumedCountValue += 1;
    }
    this.ownedPreparedFrames.delete(prepared);
    return ok(undefined);
  }

  dispose(): void {
    this.disposedValue = true;
  }

  snapshot(): ManualInputResolutionOwnerSnapshot {
    return Object.freeze({
      initialized: this.initializedValue,
      disposed: this.disposedValue,
      issuedCount: this.issuedCountValue,
      consumedCount: this.consumedCountValue,
    });
  }
}

function invalidTouch(boundary: string) {
  return evidenceRequired(
    "input.invalid-touch",
    ["D06", "D15", "MJ07", "MJ26"],
    boundary,
  );
}

export function copyManualInputPosition(
  position: ManualInputPosition,
): SimulatorResult<ManualInputPosition> {
  if (
    position === null ||
    typeof position !== "object" ||
    !isExactFiniteFloat32(position.x) ||
    !isExactFiniteFloat32(position.y)
  ) {
    return evidenceRequired(
      "input.invalid-float32-position",
      ["D03", "D15", "MJ26"],
      "Touch positions must preserve finite Float32 x/y values in bottom-left screen space.",
    );
  }
  return ok(Object.freeze({ x: position.x, y: position.y }));
}

function isExactFiniteFloat32(value: number): boolean {
  return Number.isFinite(value) && Object.is(value, Math.fround(value));
}

function isManualTouchPhase(value: number): value is ManualTouchPhaseValue {
  return (
    value === ManualTouchPhase.Began ||
    value === ManualTouchPhase.Moved ||
    value === ManualTouchPhase.Stationary ||
    value === ManualTouchPhase.Ended
  );
}

function samePosition(
  left: ManualInputPosition,
  right: ManualInputPosition,
): boolean {
  return Object.is(left.x, right.x) && Object.is(left.y, right.y);
}
