import type { SimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";

export type RehearsalControlIntent = "return-five-seconds" | "advance-five-seconds";
export interface RehearsalControlCommand {
  readonly kind: RehearsalControlIntent;
  readonly capability: object;
}
export type RehearsalControlTouchPhase = "began" | "moved" | "ended";

export interface RehearsalControlHitRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RehearsalControlSceneProfile {
  readonly viewportWidth: 1600;
  readonly viewportHeight: 720;
  readonly returnFive: {
    readonly center: readonly [142, 360];
    readonly visibleBounds: RehearsalControlHitRegion;
    readonly hitRegion: RehearsalControlHitRegion;
    readonly atlasFrame: Readonly<{ x: 912; y: 924; width: 97; height: 99 }>;
  };
  readonly advanceFive: {
    readonly center: readonly [1457.5, 360];
    readonly visibleBounds: RehearsalControlHitRegion;
    readonly hitRegion: RehearsalControlHitRegion;
    readonly atlasFrame: Readonly<{ x: 903; y: 315; width: 96; height: 99 }>;
  };
  readonly timeLabelRegion: RehearsalControlHitRegion;
  readonly demoBadgeRegion: RehearsalControlHitRegion;
}

const issuedControlCapabilities = new WeakMap<object, Readonly<{
  intent: RehearsalControlIntent;
  mode: SimulatorModeIdentity;
  timelineWholeSecond: number;
  consumed: boolean;
}>>();

export const REHEARSAL_CONTROL_SCENE_PROFILE: RehearsalControlSceneProfile = deepFreeze({
  viewportWidth: 1600,
  viewportHeight: 720,
  returnFive: {
    center: [142, 360],
    visibleBounds: { x: 101, y: 319, width: 82, height: 82 },
    hitRegion: { x: 92, y: 310, width: 100, height: 100 },
    atlasFrame: { x: 912, y: 924, width: 97, height: 99 },
  },
  advanceFive: {
    center: [1457.5, 360],
    visibleBounds: { x: 1416, y: 319, width: 83, height: 82 },
    hitRegion: { x: 1407.5, y: 310, width: 100, height: 100 },
    atlasFrame: { x: 903, y: 315, width: 96, height: 99 },
  },
  timeLabelRegion: { x: 1358, y: 91, width: 146, height: 25 },
  demoBadgeRegion: { x: 111, y: 97, width: 177, height: 35 },
});

export function resolveRehearsalControlTouch(
  mode: SimulatorModeIdentity,
  phase: RehearsalControlTouchPhase,
  bottomLeftPosition: Readonly<{ x: number; y: number }>,
  state: Readonly<{
    timelineSeconds: number;
    paused: boolean;
    moveTimeInProgress: boolean;
  }>,
): SimulatorResult<RehearsalControlCommand | null> {
  if (!validPosition(bottomLeftPosition) || !Number.isFinite(state?.timelineSeconds) ||
    state.timelineSeconds < 0 || typeof state.paused !== "boolean" ||
    typeof state.moveTimeInProgress !== "boolean") {
    return evidenceRequired(
      "rehearsal.control.invalid-touch-state",
      ["LR-E06", "LR-E11"],
      "The control owner requires one finite bottom-left touch and explicit Rehearsal playing state.",
    );
  }
  if (mode.sessionMode !== "rehearsal" || !mode.isEnablePractice || mode.inGameMode !== "practice") {
    return ok(null);
  }
  if (phase !== "began" || state.paused || state.moveTimeInProgress) return ok(null);
  const point = Object.freeze({
    x: bottomLeftPosition.x,
    y: REHEARSAL_CONTROL_SCENE_PROFILE.viewportHeight - bottomLeftPosition.y,
  });
  if (inside(point, REHEARSAL_CONTROL_SCENE_PROFILE.returnFive.hitRegion)) {
    return ok(Math.floor(state.timelineSeconds) === 0
      ? null
      : issueControlCommand("return-five-seconds", mode, state.timelineSeconds));
  }
  if (inside(point, REHEARSAL_CONTROL_SCENE_PROFILE.advanceFive.hitRegion)) {
    return ok(issueControlCommand("advance-five-seconds", mode, state.timelineSeconds));
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
  }>,
): SimulatorResult<RehearsalControlIntent> {
  if (command === null || typeof command !== "object" ||
    Object.keys(command).sort().join(",") !== "capability,kind" ||
    (command.kind !== "return-five-seconds" && command.kind !== "advance-five-seconds") ||
    command.capability === null || typeof command.capability !== "object") {
    return evidenceRequired(
      "rehearsal.control.invalid-command-capability",
      ["LR-E06", "LR-E09", "LR-E10"],
      "Runtime accepts only an opaque one-use command issued by the simulator-owned Rehearsal hit router.",
    );
  }
  const issued = issuedControlCapabilities.get(command.capability);
  if (issued === undefined || issued.consumed || issued.intent !== command.kind ||
    state.mode !== issued.mode || !Number.isFinite(state.timelineSeconds) ||
    Math.floor(state.timelineSeconds) !== issued.timelineWholeSecond ||
    state.paused || state.moveTimeInProgress) {
    return evidenceRequired(
      "rehearsal.control.foreign-stale-or-state-mismatched-command",
      ["LR-E06", "LR-E11", "LR-C03"],
      "MoveTime command identity, canonical mode, integer timeline and active playing state must still match at consumption.",
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
    return evidenceRequired(
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
): RehearsalControlCommand {
  const capability = Object.freeze({});
  issuedControlCapabilities.set(capability, Object.freeze({
    intent,
    mode,
    timelineWholeSecond: Math.floor(timelineSeconds),
    consumed: false,
  }));
  return Object.freeze({ kind: intent, capability });
}

function minutesSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function validPosition(value: unknown): value is Readonly<{ x: number; y: number }> {
  if (value === null || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return Object.keys(point).sort().join(",") === "x,y" &&
    typeof point.x === "number" && Number.isFinite(point.x) &&
    typeof point.y === "number" && Number.isFinite(point.y);
}

function inside(point: Readonly<{ x: number; y: number }>, region: RehearsalControlHitRegion): boolean {
  return point.x >= region.x && point.x < region.x + region.width &&
    point.y >= region.y && point.y < region.y + region.height;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
