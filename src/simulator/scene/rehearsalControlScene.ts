import type { SimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { integrityFailure, ok, type SimulatorResult } from "../engine/evidence";
import type { OriginalSurfaceLayout } from "./originalSurfaceLayout";

export type RehearsalControlIntent = "return-five-seconds" | "advance-five-seconds";
export interface RehearsalControlCommand {
  readonly kind: RehearsalControlIntent;
  readonly capability: object;
}
export type RehearsalControlTouchPhase = "began" | "moved" | "ended";

export interface RehearsalControlBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RehearsalControlSceneLayout {
  readonly surfaceRevision: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly returnFive: {
    readonly centerBottomLeft: readonly [number, number];
    readonly widgetBoundsTopLeft: RehearsalControlBounds;
    readonly hitCircleRadiusPixels: number;
  };
  readonly advanceFive: {
    readonly centerBottomLeft: readonly [number, number];
    readonly widgetBoundsTopLeft: RehearsalControlBounds;
    readonly hitCircleRadiusPixels: number;
  };
  readonly timeLabelBoundsTopLeft: RehearsalControlBounds;
  readonly autoLiveCaptionBoundsTopLeft: RehearsalControlBounds;
  readonly demoBadgeBoundsTopLeft: RehearsalControlBounds;
}

const issuedControlCapabilities = new WeakMap<object, Readonly<{
  intent: RehearsalControlIntent;
  mode: SimulatorModeIdentity;
  timelineWholeSecond: number;
  surfaceRevision: number;
  consumed: boolean;
}>>();

export function createRehearsalControlSceneLayout(
  layout: OriginalSurfaceLayout,
): RehearsalControlSceneLayout {
  const width = layout.ui.moveTime.widgetSize[0];
  const height = layout.ui.moveTime.widgetSize[1];
  const returnCenter = layout.ui.moveTime.returnCenterBottomLeft;
  const advanceCenter = layout.ui.moveTime.advanceCenterBottomLeft;
  return deepFreeze({
    surfaceRevision: layout.surface.revision,
    viewportWidth: layout.surface.viewportWidth,
    viewportHeight: layout.surface.viewportHeight,
    returnFive: {
      centerBottomLeft: returnCenter,
      widgetBoundsTopLeft: widgetBounds(layout.surface.viewportHeight, returnCenter, width, height),
      hitCircleRadiusPixels: layout.ui.moveTime.hitCircleRadiusPixels,
    },
    advanceFive: {
      centerBottomLeft: advanceCenter,
      widgetBoundsTopLeft: widgetBounds(layout.surface.viewportHeight, advanceCenter, width, height),
      hitCircleRadiusPixels: layout.ui.moveTime.hitCircleRadiusPixels,
    },
    timeLabelBoundsTopLeft: bounds(layout.ui.moveTime.timeBackgroundBoundsTopLeft),
    autoLiveCaptionBoundsTopLeft: bounds(layout.ui.autoLiveCaptionBoundsTopLeft),
    demoBadgeBoundsTopLeft: bounds(layout.ui.autoLiveCaptionBoundsTopLeft),
  });
}

export function resolveRehearsalControlTouch(
  mode: SimulatorModeIdentity,
  phase: RehearsalControlTouchPhase,
  bottomLeftPosition: Readonly<{ x: number; y: number }>,
  state: Readonly<{
    timelineSeconds: number;
    paused: boolean;
    moveTimeInProgress: boolean;
  }>,
  layout: RehearsalControlSceneLayout,
): SimulatorResult<RehearsalControlCommand | null> {
  if (!validPosition(bottomLeftPosition) || !Number.isFinite(state?.timelineSeconds) ||
    state.timelineSeconds < 0 || typeof state.paused !== "boolean" ||
    typeof state.moveTimeInProgress !== "boolean" ||
    !validLayout(layout)) {
    return integrityFailure(
      "rehearsal.control.invalid-touch-state",
      ["LR-E06", "LR-E11", "ML-E03"],
      "The control owner requires one finite bottom-left touch, explicit Rehearsal playing state and one original prefab-derived surface layout.",
    );
  }
  if (mode.sessionMode !== "rehearsal" || !mode.isEnablePractice || mode.inGameMode !== "practice") {
    return ok(null);
  }
  if (phase !== "began" || state.paused || state.moveTimeInProgress) return ok(null);
  if (insideCircle(bottomLeftPosition, layout.returnFive)) {
    return ok(Math.floor(state.timelineSeconds) === 0
      ? null
      : issueControlCommand(
          "return-five-seconds",
          mode,
          state.timelineSeconds,
          layout.surfaceRevision,
        ));
  }
  if (insideCircle(bottomLeftPosition, layout.advanceFive)) {
    return ok(issueControlCommand(
      "advance-five-seconds",
      mode,
      state.timelineSeconds,
      layout.surfaceRevision,
    ));
  }
  return ok(null);
}

export function consumeRehearsalControlCommand(
  command: RehearsalControlCommand,
  state: Readonly<{
    mode: SimulatorModeIdentity;
    timelineSeconds: number;
    paused: boolean;
    moveTimeInProgress: boolean;
    surfaceRevision?: number;
  }>,
): SimulatorResult<RehearsalControlIntent> {
  if (command === null || typeof command !== "object" ||
    (command.kind !== "return-five-seconds" && command.kind !== "advance-five-seconds") ||
    command.capability === null || typeof command.capability !== "object") {
    return integrityFailure(
      "rehearsal.control.invalid-command-capability",
      ["LR-E06", "LR-E09", "LR-E10"],
      "Runtime accepts only an opaque one-use command issued by the simulator-owned Rehearsal hit router.",
    );
  }
  const issued = issuedControlCapabilities.get(command.capability);
  if (issued === undefined || issued.consumed || issued.intent !== command.kind ||
    state.mode !== issued.mode || !Number.isFinite(state.timelineSeconds) ||
    Math.floor(state.timelineSeconds) !== issued.timelineWholeSecond ||
    (state.surfaceRevision !== undefined && state.surfaceRevision !== issued.surfaceRevision) ||
    state.paused || state.moveTimeInProgress) {
    return integrityFailure(
      "rehearsal.control.foreign-stale-or-state-mismatched-command",
      ["LR-E06", "LR-E11", "LR-C03", "ML-R05"],
      "MoveTime command identity, canonical mode, integer timeline, initial surface revision and active playing state must still match at consumption.",
    );
  }
  issuedControlCapabilities.set(command.capability, Object.freeze({ ...issued, consumed: true }));
  return ok(issued.intent);
}

export function formatRehearsalTimeLabel(
  currentSeconds: number,
  durationSeconds: number,
): SimulatorResult<string> {
  if (!Number.isFinite(currentSeconds) || currentSeconds < 0 ||
    !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return integrityFailure(
      "rehearsal.control.invalid-time-label-owner",
      ["LR-E12", "LR-R04"],
      "The Rehearsal label consumes only engine timeline seconds and the exact positive session BGM duration.",
    );
  }
  return ok(`${minutesSeconds(Math.floor(currentSeconds))}/${minutesSeconds(Math.floor(durationSeconds))}`);
}

function issueControlCommand(
  intent: RehearsalControlIntent,
  mode: SimulatorModeIdentity,
  timelineSeconds: number,
  surfaceRevision: number,
): RehearsalControlCommand {
  const capability = Object.freeze({});
  issuedControlCapabilities.set(capability, Object.freeze({
    intent,
    mode,
    timelineWholeSecond: Math.floor(timelineSeconds),
    surfaceRevision,
    consumed: false,
  }));
  return Object.freeze({ kind: intent, capability });
}

function widgetBounds(
  viewportHeight: number,
  center: readonly [number, number],
  width: number,
  height: number,
): RehearsalControlBounds {
  return bounds(Object.freeze([
    Math.fround(center[0] - width / 2),
    Math.fround(viewportHeight - Math.fround(center[1] + height / 2)),
    width,
    height,
  ]));
}

function bounds(value: readonly number[]): RehearsalControlBounds {
  return Object.freeze({ x: value[0]!, y: value[1]!, width: value[2]!, height: value[3]! });
}

function insideCircle(
  point: Readonly<{ x: number; y: number }>,
  control: Readonly<{
    centerBottomLeft: readonly [number, number];
    hitCircleRadiusPixels: number;
  }>,
): boolean {
  const dx = Math.fround(point.x - control.centerBottomLeft[0]);
  const dy = Math.fround(point.y - control.centerBottomLeft[1]);
  const squared = Math.fround(Math.fround(dx * dx) + Math.fround(dy * dy));
  const radiusSquared = Math.fround(control.hitCircleRadiusPixels * control.hitCircleRadiusPixels);
  return squared <= radiusSquared;
}

function validLayout(value: unknown): value is RehearsalControlSceneLayout {
  if (value === null || typeof value !== "object") return false;
  const layout = value as RehearsalControlSceneLayout;
  return Number.isSafeInteger(layout.surfaceRevision) && layout.surfaceRevision >= 0 &&
    Number.isSafeInteger(layout.viewportWidth) && layout.viewportWidth > 0 &&
    Number.isSafeInteger(layout.viewportHeight) && layout.viewportHeight > 0 &&
    Number.isFinite(layout.returnFive?.hitCircleRadiusPixels) &&
    layout.returnFive.hitCircleRadiusPixels > 0 &&
    Number.isFinite(layout.advanceFive?.hitCircleRadiusPixels) &&
    layout.advanceFive.hitCircleRadiusPixels > 0;
}

function minutesSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function validPosition(value: unknown): value is Readonly<{ x: number; y: number }> {
  if (value === null || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return typeof point.x === "number" && Number.isFinite(point.x) &&
    typeof point.y === "number" && Number.isFinite(point.y);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
