import type {
  RenderColor,
  RenderFloat32,
} from "../../backends/renderingContracts";
import {
  createRenderFloat32,
  validateRenderFloat32,
} from "../../backends/renderingValidation";
import {
  evidenceRequired,
  ok,
  type SimulatorResult,
} from "../evidence";
import {
  advanceOrdinaryNoteActivationAdjustment,
  advanceOrdinaryNoteMotion,
  buildOrdinaryAdvancedNoteMesh,
  buildOrdinaryBaseNoteMesh,
  type OrdinaryBaseNoteMeshGeometry,
  type OrdinaryNoteMotionResult,
  type OrdinaryNoteMotionState,
} from "./ordinaryNoteGeometry";

export type OrdinaryLongAfterPhase = "wait" | "move" | "stop";

export interface OrdinaryLongNormalChildState {
  readonly phase: OrdinaryLongAfterPhase;
  readonly afterAbsolutePosition: number;
  readonly noteBpm: RenderFloat32;
  readonly motionState: OrdinaryNoteMotionState;
  readonly renderedTransform: OrdinaryNoteMotionResult;
}

export interface OrdinaryLongNormalChildFrameInput {
  readonly deltaTime: RenderFloat32;
  readonly launcherMusicPosition: RenderFloat32;
  readonly musicPosition: RenderFloat32;
}

export interface OrdinaryLongNormalMeshInput {
  readonly front: OrdinaryNoteMotionResult;
  readonly after: OrdinaryNoteMotionResult;
  readonly frontButtonCount: number;
  readonly afterButtonCount: number;
  readonly screenToSafeAreaRatio: RenderFloat32;
  readonly widthRate: RenderFloat32;
  readonly color: RenderColor;
  readonly advanced?: boolean;
}

export function createOrdinaryLongNormalChildState(
  motionState: OrdinaryNoteMotionState,
  afterAbsolutePosition: number,
  noteBpm: RenderFloat32,
): SimulatorResult<OrdinaryLongNormalChildState> {
  if (
    !Number.isSafeInteger(afterAbsolutePosition) ||
    afterAbsolutePosition < 0 ||
    !validateRenderFloat32(noteBpm) ||
    noteBpm.value <= 0
  ) {
    return reject(
      "render.long-child.invalid-activation-owner-state",
      "The authorized ordinary Long child requires one non-negative tail position, positive Float32 BPM and the null virtual-lane branch.",
    );
  }
  const zero = createRenderFloat32(Math.fround(0));
  const one = createRenderFloat32(Math.fround(1));
  if (zero.status !== "ok") return zero;
  if (one.status !== "ok") return one;
  return ok(Object.freeze({
    phase: "wait" as const,
    afterAbsolutePosition,
    noteBpm,
    motionState: Object.freeze({
      ...motionState,
      progressRate: zero.value,
      deltaTime: zero.value,
      realMoveSecond: zero.value,
    }),
    renderedTransform: Object.freeze({
      progressRate: zero.value,
      position: Object.freeze({
        x: motionState.noteStartPosition.x,
        y: motionState.noteStartPosition.y,
        z: motionState.currentPositionZ,
      }),
      localScale: Object.freeze({ x: one.value, y: one.value, z: one.value }),
    }),
  }));
}

export function advanceOrdinaryLongNormalChild(
  state: OrdinaryLongNormalChildState,
  input: OrdinaryLongNormalChildFrameInput,
): SimulatorResult<OrdinaryLongNormalChildState> {
  if (
    !validateRenderFloat32(input.deltaTime) ||
    input.deltaTime.value < 0 ||
    !validateRenderFloat32(input.launcherMusicPosition) ||
    !validateRenderFloat32(input.musicPosition)
  ) {
    return reject(
      "render.long-child.invalid-frame-input",
      "Long after Update requires finite Float32 delta, LauncherMusicPos and MusicPos inputs.",
    );
  }
  if (state.phase === "stop") return ok(state);
  if (state.phase === "wait") {
    if (input.launcherMusicPosition.value < state.afterAbsolutePosition) {
      return ok(state);
    }
    const zero = createRenderFloat32(Math.fround(0));
    if (zero.status !== "ok") return zero;
    const adjustment = advanceOrdinaryNoteActivationAdjustment(
      Object.freeze({ ...state.motionState, deltaTime: zero.value }),
      input.launcherMusicPosition,
      state.afterAbsolutePosition,
      state.noteBpm,
    );
    if (adjustment.status !== "ok") return adjustment;
    const renderedTransform = adjustment.value.motions[
      adjustment.value.motions.length - 1
    ] ?? state.renderedTransform;
    return ok(Object.freeze({
      ...state,
      phase: "move" as const,
      motionState: Object.freeze({
        ...state.motionState,
        progressRate: adjustment.value.progressRate,
        realMoveSecond: adjustment.value.realMoveSecond,
      }),
      renderedTransform,
    }));
  }
  const motion = advanceOrdinaryNoteMotion(Object.freeze({
    ...state.motionState,
    deltaTime: input.deltaTime,
  }));
  if (motion.status !== "ok") return motion;
  return ok(Object.freeze({
    ...state,
    phase: input.musicPosition.value - state.afterAbsolutePosition >= 0
      ? "stop" as const
      : "move" as const,
    motionState: Object.freeze({
      ...state.motionState,
      deltaTime: input.deltaTime,
      progressRate: motion.value.progressRate,
    }),
    renderedTransform: motion.value,
  }));
}

export function buildOrdinaryLongNormalMesh(
  input: OrdinaryLongNormalMeshInput,
): SimulatorResult<OrdinaryBaseNoteMeshGeometry> {
  const state = Object.freeze({
    front: Object.freeze({
      position: Object.freeze({ x: input.front.position.x, y: input.front.position.y }),
      localScaleX: input.front.localScale.x,
      buttonCount: input.frontButtonCount,
    }),
    after: Object.freeze({
      position: Object.freeze({ x: input.after.position.x, y: input.after.position.y }),
      localScaleX: input.after.localScale.x,
      buttonCount: input.afterButtonCount,
    }),
    screenToSafeAreaRatio: input.screenToSafeAreaRatio,
    widthRate: input.widthRate,
    color: input.color,
  });
  return input.advanced === true
    ? buildOrdinaryAdvancedNoteMesh(state)
    : buildOrdinaryBaseNoteMesh(state);
}

function reject(capability: string, detail: string): SimulatorResult<never> {
  return evidenceRequired(capability, [
    "RPR-D05",
    "RPR-D06",
    "RPR-D07",
    "PR10",
    "PR11",
    "PR13",
    "PR15",
    "PR39",
  ], detail);
}
