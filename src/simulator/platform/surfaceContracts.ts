import { integrityFailure, ok, type SimulatorResult } from "../engine/evidence";

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

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveFiniteNumber(value: unknown): value is number {
  return finiteNumber(value) && value > 0;
}

function reject(capability: string, boundary: string) {
  return integrityFailure(capability, ["ML-E01", "ML-R05"], boundary);
}
