import { integrityFailure, ok, productSemantic, type SimulatorResult } from "../engine/evidence";

export interface SimulatorSurfaceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SimulatorSurfaceState {
  readonly revision: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly safeArea: SimulatorSurfaceRect;
  readonly origin: "bottom-left";
}

export function copyAndValidateInitialSimulatorSurface(
  value: SimulatorSurfaceState,
): SimulatorResult<SimulatorSurfaceState> {
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !Number.isSafeInteger(value.viewportWidth) || value.viewportWidth <= 0 ||
    !Number.isSafeInteger(value.viewportHeight) || value.viewportHeight <= 0 ||
    value.viewportWidth < value.viewportHeight ||
    value.origin !== "bottom-left" ||
    value.safeArea === null || typeof value.safeArea !== "object" ||
    Array.isArray(value.safeArea) ||
    !finiteNumber(value.safeArea.x) || !finiteNumber(value.safeArea.y) ||
    !positiveFiniteNumber(value.safeArea.width) ||
    !positiveFiniteNumber(value.safeArea.height) ||
    value.safeArea.x < 0 || value.safeArea.y < 0 ||
    Math.fround(value.safeArea.x + value.safeArea.width) > value.viewportWidth ||
    Math.fround(value.safeArea.y + value.safeArea.height) > value.viewportHeight
  ) {
    return reject(
      "surface.invalid-initial-state",
      "The current original contract accepts one exact positive landscape render-pixel viewport and one explicit finite binary32 base safe-area Rect wholly inside it; portrait, defaulted, repaired or clamped surfaces are forbidden.",
    );
  }
  return ok(Object.freeze({
    revision: value.revision,
    viewportWidth: value.viewportWidth,
    viewportHeight: value.viewportHeight,
    safeArea: Object.freeze({
      x: Math.fround(value.safeArea.x),
      y: Math.fround(value.safeArea.y),
      width: Math.fround(value.safeArea.width),
      height: Math.fround(value.safeArea.height),
    }),
    origin: "bottom-left" as const,
  }));
}

export function validateUnchangedSimulatorSurface(
  initial: SimulatorSurfaceState,
  current: SimulatorSurfaceState,
): SimulatorResult<void> {
  const checked = copyAndValidateInitialSimulatorSurface(current);
  if (checked.status !== "ok") return checked;
  const value = checked.value;
  if (
    value.revision !== initial.revision ||
    value.viewportWidth !== initial.viewportWidth ||
    value.viewportHeight !== initial.viewportHeight ||
    value.origin !== initial.origin ||
    !Object.is(value.safeArea.x, initial.safeArea.x) ||
    !Object.is(value.safeArea.y, initial.safeArea.y) ||
    !Object.is(value.safeArea.width, initial.safeArea.width) ||
    !Object.is(value.safeArea.height, initial.safeArea.height)
  ) {
    return productSemantic(
      undefined,
      "surface.product.revision-change-detected",
      ["ML-R05"],
      "Reverse does not provide an original arbitrary mid-session refresh route; the runtime must atomically rebuild the product surface before consuming the next input frame.",
      "GE-PS-SURFACE-ATOMIC-REBUILD",
    );
  }
  return ok(undefined);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveFiniteNumber(value: unknown): value is number {
  return finiteNumber(value) && value > 0;
}

function reject(capability: string, boundary: string) {
  return integrityFailure(capability, ["ML-E01", "ML-R05"], boundary);
}
