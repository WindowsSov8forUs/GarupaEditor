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
    Object.keys(value).sort().join(",") !==
      "origin,revision,safeArea,viewportHeight,viewportWidth" ||
    !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !Number.isSafeInteger(value.viewportWidth) || value.viewportWidth <= 0 ||
    !Number.isSafeInteger(value.viewportHeight) || value.viewportHeight <= 0 ||
    value.viewportWidth < value.viewportHeight ||
    value.origin !== "bottom-left" ||
    value.safeArea === null || typeof value.safeArea !== "object" ||
    Array.isArray(value.safeArea) ||
    Object.keys(value.safeArea).sort().join(",") !== "height,width,x,y" ||
    !exactFloat32(value.safeArea.x) || !exactFloat32(value.safeArea.y) ||
    !exactPositiveFloat32(value.safeArea.width) ||
    !exactPositiveFloat32(value.safeArea.height) ||
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
    return reject(
      "surface.dynamic-revision-unsupported",
      "Reverse 10.1.4 proves no complete original route that refreshes gameplay, particles, every StarUI helper and MV for an arbitrary mid-session surface revision. Any post-initial revision fails before command or input consumption.",
    );
  }
  return ok(undefined);
}

function exactFloat32(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    Object.is(value, Math.fround(value));
}

function exactPositiveFloat32(value: unknown): value is number {
  return exactFloat32(value) && value > 0;
}

function reject(capability: string, boundary: string) {
  return integrityFailure(capability, ["ML-E01", "ML-R05"], boundary);
}
