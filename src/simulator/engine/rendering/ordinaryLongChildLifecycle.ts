import { buildClippedNoteStrip } from "./noteMeshClipping";
import { coordinate, coordinateScale } from "./exponentialCoordinates";
import type {
  RenderColor,
  RenderFloat32,
} from "../../backends/renderingContracts";
import {
  createRenderFloat32,
  validateRenderFloat32,
} from "../../backends/renderingValidation";
import {
  integrityFailure,
  ok,
  type SimulatorResult,
} from "../result";
import {
  getHabahiroMeshWidthRate,
  noteMotionY,
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
  readonly launcherMusicPosition: number;
  readonly adjustedMusicPosition: number;
}

export interface OrdinaryLongNormalMeshInput {
  readonly front: OrdinaryNoteMotionResult;
  readonly after: OrdinaryNoteMotionResult;
  readonly afterScaleX: RenderFloat32;
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
    !Number.isFinite(afterAbsolutePosition) ||
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
  const startX = createRenderFloat32(motionState.noteStartPosition.x.value);
  const startY = createRenderFloat32(motionState.noteStartPosition.y.value);
  if (startX.status !== "ok") return startX;
  if (startY.status !== "ok") return startY;
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
        x: startX.value,
        y: startY.value,
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
    !Number.isFinite(input.launcherMusicPosition) ||
    !Number.isFinite(input.adjustedMusicPosition)
  ) {
    return reject(
      "render.long-child.invalid-frame-input",
      "Long after Update requires finite delta and music-position inputs.",
    );
  }
  if (state.phase === "stop") return ok(state);
  if (state.phase === "wait") {
    if (input.launcherMusicPosition < state.afterAbsolutePosition) {
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
    const renderedTransform = adjustment.value.lastMotion ?? state.renderedTransform;
    return ok(Object.freeze({
      ...state,
      phase: "move" as const,
      motionState: Object.freeze({
        ...state.motionState,
        progressRate: adjustment.value.progressRate,
        realMoveSecond: adjustment.value.realMoveSecond,
        currentPositionZ: renderedTransform.position.z,
      }),
      renderedTransform,
    }));
  }
  const realMoveSecond = createRenderFloat32(Math.fround(state.motionState.realMoveSecond.value + input.deltaTime.value));
  if (realMoveSecond.status !== "ok") return realMoveSecond;
  const motion = advanceOrdinaryNoteMotion(Object.freeze({
    ...state.motionState,
    deltaTime: input.deltaTime,
    realMoveSecond: realMoveSecond.value,
  }));
  if (motion.status !== "ok") return motion;
  return ok(Object.freeze({
    ...state,
    phase: input.adjustedMusicPosition - state.afterAbsolutePosition >= 0
      ? "stop" as const
      : "move" as const,
    motionState: Object.freeze({
      ...state.motionState,
      deltaTime: input.deltaTime,
      realMoveSecond: realMoveSecond.value,
      progressRate: motion.value.progressRate,
      currentPositionZ: motion.value.position.z,
    }),
    renderedTransform: motion.value,
  }));
}

export function buildOrdinaryLongNormalMesh(
  input: OrdinaryLongNormalMeshInput,
): SimulatorResult<OrdinaryBaseNoteMeshGeometry> {
  const raw = input.front.unclipped ?? input.after.unclipped;
  if (raw !== undefined) {
    const endpoint = (motion: OrdinaryNoteMotionResult, count: number, scale: number) => ({
      base: [motion.unclipped?.x ?? motion.position.x.value, noteMotionY(motion),
        (motion.unclipped?.scale ?? scale) * count * input.screenToSafeAreaRatio.value * input.widthRate.value],
      slope: [0, 0, 0],
      ...(input.front.unclipped?.exponential || input.after.unclipped?.exponential ? { exponential: [
        motion.unclipped?.exponential?.x ?? coordinate(motion.unclipped?.x ?? motion.position.x.value),
        motion.unclipped?.exponential?.y ?? coordinate(noteMotionY(motion)),
        coordinateScale(motion.unclipped?.exponential?.scaleX ?? coordinate(motion.unclipped?.scale ?? scale),
          count * input.screenToSafeAreaRatio.value * input.widthRate.value),
      ] as const } : {}),
    });
    return buildClippedNoteStrip({ ...input, horizontalRange: raw.viewportX }, noteMotionY(input.front), noteMotionY(input.after), raw.viewportY,
      endpoint(input.front, input.frontButtonCount, input.front.localScale.x.value),
      endpoint(input.after, input.afterButtonCount, input.afterScaleX.value));
  }
  const state = Object.freeze({
    front: Object.freeze({
      position: Object.freeze({ x: input.front.position.x, y: input.front.position.y }),
      localScaleX: input.front.localScale.x,
      buttonCount: input.frontButtonCount,
    }),
    after: Object.freeze({
      position: Object.freeze({ x: input.after.position.x, y: input.after.position.y }),
      localScaleX: input.afterScaleX,
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

/** NoteMesh.getAfterNoteScale: a waiting endpoint has a mesh-only virtual
 * width. Its hidden sprite keeps its own transform and scale. */
export function getOrdinaryNoteMeshAfterScale(
  after: OrdinaryLongNormalChildState,
  frontTargetY: RenderFloat32,
  screenToSafeAreaRatio: RenderFloat32,
): SimulatorResult<RenderFloat32> {
  if (after.phase !== "wait") return ok(after.renderedTransform.localScale.x);
  const state = after.motionState;
  const inverseSafeRatio = Math.fround(1 / screenToSafeAreaRatio.value);
  const launcherY = Math.fround(state.launcherY.value * inverseSafeRatio);
  const targetY = Math.fround(frontTargetY.value * inverseSafeRatio);
  const afterLocalY = Math.fround(after.renderedTransform.position.y.value / state.noteParentScale.value);
  const distance = Math.abs(Math.fround(launcherY - targetY));
  if (distance === 0) return reject("render.mesh.degenerate-virtual-scale-range",
    "A waiting mesh endpoint requires distinct launcher and front target coordinates.");
  return createRenderFloat32(Math.fround(Math.fround(
    Math.abs(Math.fround(launcherY - afterLocalY)) * state.noteSettingScale.value,
  ) / distance));
}

function reject(capability: string, detail: string): SimulatorResult<never> {
  return integrityFailure(capability, detail);
}

/** One Long tail/strip calculation, with optional displacement and clipping inputs. */
export function advanceLongChildFrame(state: OrdinaryLongNormalChildState, front: OrdinaryNoteMotionResult,
  input: OrdinaryLongNormalChildFrameInput, ratio: RenderFloat32, color: RenderColor, widthSetting?: RenderFloat32,
  projection?: {
    advance: () => SimulatorResult<OrdinaryLongNormalChildState>;
    visible?: (next: OrdinaryLongNormalChildState) => boolean;
    mesh?: (input: OrdinaryLongNormalMeshInput, next: OrdinaryLongNormalChildState) => SimulatorResult<OrdinaryBaseNoteMeshGeometry>;
  }): SimulatorResult<{ readonly childState: OrdinaryLongNormalChildState; readonly mesh: OrdinaryBaseNoteMeshGeometry | null }> {
  const next = projection?.advance() ?? advanceOrdinaryLongNormalChild(state, input);
  if (next.status !== "ok") return next;
  const width = widthSetting === undefined ? createRenderFloat32(1) : getHabahiroMeshWidthRate(state.motionState.buttonCount, widthSetting);
  if (width.status !== "ok") return width;
  const visible = projection?.visible?.(next.value) ?? noteMotionY(next.value.renderedTransform) > state.motionState.goalPosition.y.value;
  const scale = getOrdinaryNoteMeshAfterScale(next.value, state.motionState.goalPosition.y, ratio);
  if (scale.status !== "ok") return scale;
  const meshInput: OrdinaryLongNormalMeshInput = { front, after: next.value.renderedTransform, afterScaleX: scale.value,
    frontButtonCount: state.motionState.buttonCount, afterButtonCount: state.motionState.buttonCount,
    screenToSafeAreaRatio: ratio, widthRate: width.value, color, advanced: state.motionState.virtualLaneControllerPresent };
  const mesh = visible ? projection?.mesh?.(meshInput, next.value) ?? buildOrdinaryLongNormalMesh(meshInput) : ok(null);
  return mesh.status === "ok" ? ok({ childState: next.value, mesh: mesh.value }) : mesh;
}
