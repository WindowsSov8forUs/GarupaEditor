import type {
  RenderColor,
  RenderFloat32,
} from "../../backends/renderingContracts";
import type { NoteInformation } from "../chart/types";
import { getSecondsWithDistance } from "../data/manualJudgement";
import {
  createRenderFloat32,
} from "../../backends/renderingValidation";
import {
  integrityFailure,
  ok,
  type SimulatorResult,
} from "../evidence";
import {
  advanceOrdinaryLongNormalChild,
  buildOrdinaryLongNormalMesh,
  createOrdinaryLongNormalChildState,
  getOrdinaryNoteMeshAfterScale,
  type OrdinaryLongNormalChildFrameInput,
  type OrdinaryLongNormalChildState,
} from "./ordinaryLongChildLifecycle";
import {
  advanceOrdinaryNoteVerticalMotion,
  getHabahiroMeshWidthRate,
  repositionOrdinaryNoteToJudgeLine,
  type OrdinaryBaseNoteMeshGeometry,
  type OrdinaryNoteMotionResult,
  type OrdinaryNoteMotionState,
} from "./ordinaryNoteGeometry";

export interface OrdinarySlideChildState {
  readonly sourceIndex: number;
  readonly segmentStartIndex: number;
  readonly buttonCount: number;
  readonly visible: boolean;
  readonly meshVisible: boolean;
  readonly judgeY: number;
  readonly lifecycle: OrdinaryLongNormalChildState;
}

export interface OrdinarySlideSegmentGeometry {
  readonly sourceIndex: number;
  readonly geometry: OrdinaryBaseNoteMeshGeometry;
}

export interface OrdinarySlideFrameResult {
  readonly frontTransform: OrdinaryNoteMotionResult;
  readonly childStates: readonly OrdinarySlideChildState[];
  readonly segments: readonly OrdinarySlideSegmentGeometry[];
}

export interface OrdinarySlideStopControl {
  readonly advanceMotion: boolean;
  readonly rootWaiting: boolean;
  readonly judgementAdjustValueB: number;
  readonly virtualPerfectLine: number;
  readonly rootSource: SlideGeometrySource & { readonly slideNoteList: readonly SlideGeometrySource[] };
  readonly rootMotionState: OrdinaryNoteMotionState;
  readonly currentBpm: number;
  readonly virtualLaneDeltaX: number;
  readonly stoppedChildWaited: readonly boolean[];
}

export type SlideGeometrySource = Pick<NoteInformation,
  "absolutePos" | "isInvisible" | "virtualLaneDirection" | "virtualLaneDistance">;

/** Extensions supply motion inputs, not a second Slide lifecycle. */
export interface SlideMotionExtension {
  advanceChild(state: OrdinaryLongNormalChildState, index: number): SimulatorResult<OrdinaryLongNormalChildState>;
  buildMesh?: (input: Parameters<typeof buildOrdinaryLongNormalMesh>[0], after: OrdinaryLongNormalChildState,
    before: OrdinaryLongNormalChildState | undefined) => ReturnType<typeof buildOrdinaryLongNormalMesh>;
  isAfterHitTime?: (index: number) => boolean | undefined;
  judgementY?: (state: OrdinaryLongNormalChildState, index: number) => SimulatorResult<number>;
}

export interface SlideRenderHideRequest {
  readonly forceKillMesh: boolean;
  readonly afterUpdate: boolean;
}

export function queueSlideRenderHideBefore(
  requests: Map<number, SlideRenderHideRequest>,
  index: number,
  sources: readonly { readonly isInvisible: boolean }[],
  forceKillMesh: boolean,
  afterUpdate: boolean,
): void {
  for (let previous = index - 1; previous >= -1; previous -= 1) {
    const old = requests.get(previous);
    requests.set(previous, { forceKillMesh: forceKillMesh || old?.forceKillMesh === true,
      afterUpdate: afterUpdate || old?.afterUpdate === true });
    if (previous === -1 || !sources[previous]!.isInvisible) break;
  }
}

export function advanceSlideStopWait(counter: number, hasNextVisible: boolean, adjustment: number) {
  const waited = hasNextVisible && adjustment < 0 && counter < 6 - adjustment;
  return { counter: counter + (waited ? 1 : 0), waited };
}

export function applySlideRenderHides(
  previous: readonly OrdinarySlideChildState[],
  next: readonly OrdinarySlideChildState[],
  requests: ReadonlyMap<number, SlideRenderHideRequest> | undefined,
): readonly OrdinarySlideChildState[] {
  return next.map((state, index) => {
    const request = requests?.get(index - 1);
    const sampled = request?.afterUpdate ? state : previous[index]!;
    const killMesh = request !== undefined && (request.forceKillMesh ||
      sampled.lifecycle.renderedTransform.position.y.value <= sampled.lifecycle.motionState.targetCenterY.value);
    return requests?.has(index) || killMesh
      ? Object.freeze({ ...state, visible: state.visible && !requests?.has(index), meshVisible: state.meshVisible && !killMesh })
      : state;
  });
}

export function createOrdinarySlideChildState(
  sourceIndex: number,
  buttonCount: number,
  visible: boolean,
  motionState: OrdinaryNoteMotionState,
  absolutePosition: number,
  noteBpm: RenderFloat32,
): SimulatorResult<OrdinarySlideChildState> {
  if (
    !Number.isSafeInteger(sourceIndex) ||
    sourceIndex < 0 ||
    buttonCount < 1 ||
    !Number.isInteger(buttonCount)
  ) {
    return reject(
      "render.slide.invalid-child-owner-state",
      "The R4 Slide child requires a non-negative source index and one positive integer-width endpoint owner.",
    );
  }
  const lifecycle = createOrdinaryLongNormalChildState(
    motionState,
    absolutePosition,
    noteBpm,
  );
  return lifecycle.status === "ok"
    ? ok(Object.freeze({
      sourceIndex,
      segmentStartIndex: sourceIndex,
      buttonCount,
      visible,
      meshVisible: true,
      judgeY: lifecycle.value.renderedTransform.position.y.value,
      lifecycle: lifecycle.value,
    }))
    : lifecycle;
}

export function advanceOrdinarySlideChildren(
  front: OrdinaryNoteMotionResult,
  frontButtonCount: number,
  childStates: readonly OrdinarySlideChildState[],
  input: OrdinaryLongNormalChildFrameInput,
  screenToSafeAreaRatio: RenderFloat32,
  color: RenderColor,
  stopControl: OrdinarySlideStopControl,
  habahiroMeshWidthSetting?: RenderFloat32,
  extension?: SlideMotionExtension,
): SimulatorResult<OrdinarySlideFrameResult> {
  if (childStates.length === 0) {
    return reject(
      "render.slide.child-chain-empty",
      "The R4 Slide profile requires at least one chart-owned after node.",
    );
  }
  const nextStates: OrdinarySlideChildState[] = [];
  const segments: OrdinarySlideSegmentGeometry[] = [];
  let frontTransform = front;
  const sources = stopControl.rootSource.slideNoteList;
  const first = childStates[0]!;
  if (stopControl.advanceMotion && stopControl.rootWaiting) {
    if (first.lifecycle.phase === "stop") {
      const target = first.lifecycle.motionState.goalPosition;
      const x = slideGoalX(sources[0]!, target.x.value, stopControl.virtualLaneDeltaX);
      const moved = withSlidePosition(frontTransform, x, target.y.value, stopControl.rootMotionState.noteSettingScale);
      if (moved.status !== "ok") return moved;
      frontTransform = moved.value;
    } else {
      const moved = moveSlideEndpoint(frontTransform, stopControl.rootMotionState,
        stopControl.rootSource, first.lifecycle.motionState, sources[first.segmentStartIndex]!,
        input.deltaTime.value, stopControl.currentBpm, stopControl.virtualLaneDeltaX);
      if (moved.status !== "ok") return moved;
      frontTransform = moved.value;
    }
  }
  for (const [index, state] of childStates.entries()) {
    const advanced = stopControl.advanceMotion
      ? extension?.advanceChild(state.lifecycle, index) ?? advanceOrdinaryLongNormalChild(state.lifecycle, input)
      : ok(state.lifecycle);
    if (advanced.status !== "ok") return advanced;
    let lifecycle = advanced.value;
    let meshVisible = state.meshVisible;
    let visible = state.visible;
    let segmentStartIndex = state.segmentStartIndex;
    let judgeY = state.judgeY;
    const judgementY = extension?.judgementY?.(lifecycle, index) ?? ok(lifecycle.renderedTransform.position.y.value);
    if (judgementY.status !== "ok") return judgementY;
    if (stopControl.advanceMotion && state.lifecycle.phase !== "stop") {
      judgeY = Math.max(judgementY.value, stopControl.virtualPerfectLine);
    }
    if (stopControl.advanceMotion && state.lifecycle.phase === "move") {
      const hasAfter = index + 1 < childStates.length;
      const realLine = stopControl.rootWaiting && hasAfter;
      const stopLine = realLine
        ? lifecycle.motionState.goalPosition.y.value
        : stopControl.virtualPerfectLine;
      const crossed = (extension?.isAfterHitTime?.(index) ?? lifecycle.renderedTransform.progressRate.value > 1) &&
        judgementY.value <= stopLine;
      if (crossed && judgementY.value < lifecycle.motionState.goalPosition.y.value) {
        meshVisible = false;
      }
      lifecycle = Object.freeze({ ...lifecycle, phase: crossed ? "stop" as const : "move" as const });
      if (crossed && (realLine || stopControl.judgementAdjustValueB === 0 ||
        (!hasAfter && stopControl.judgementAdjustValueB >= 1))) {
        const goal = lifecycle.motionState.goalPosition;
        const x = createRenderFloat32(slideGoalX(sources[index]!, goal.x.value, stopControl.virtualLaneDeltaX));
        if (x.status !== "ok") return x;
        const snapped = repositionOrdinaryNoteToJudgeLine({ ...lifecycle.motionState,
          goalPosition: { x: x.value, y: goal.y } }, "target-button");
        if (snapped.status !== "ok") return snapped;
        lifecycle = Object.freeze({ ...lifecycle, renderedTransform: snapped.value });
      }
    }
    if (stopControl.advanceMotion && state.lifecycle.phase === "stop") {
      const visibleAfter = childStates.find((candidate) => candidate.sourceIndex > index &&
        !sources[candidate.sourceIndex]!.isInvisible);
      if (visibleAfter !== undefined) {
        // Stop keeps the endpoint on the field while its judgement motion
        // continues to the virtual line. No later consumer needs progress past it.
        if (judgeY > stopControl.virtualPerfectLine) {
          const virtual = advanceOrdinaryNoteVerticalMotion({ ...lifecycle.motionState, deltaTime: input.deltaTime });
          if (virtual.status !== "ok") return virtual;
          judgeY = Math.max(virtual.value.y, stopControl.virtualPerfectLine);
          lifecycle = Object.freeze({ ...lifecycle, motionState: Object.freeze({
            ...lifecycle.motionState, progressRate: virtual.value.progressRate,
          }) });
        }
        if (visibleAfter.lifecycle.phase === "stop") {
          const goal = visibleAfter.lifecycle.motionState.goalPosition;
          const moved = withSlidePosition(lifecycle.renderedTransform, goal.x.value, goal.y.value, lifecycle.motionState.noteSettingScale);
          if (moved.status !== "ok") return moved;
          lifecycle = Object.freeze({ ...lifecycle, renderedTransform: moved.value });
          if (!stopControl.stoppedChildWaited[index]) visible = false;
        } else {
          let nextIndex = index + 1;
          while (nextIndex + 1 < childStates.length && childStates[nextIndex]!.lifecycle.phase === "stop") nextIndex += 1;
          const nextChild = childStates[nextIndex]!;
          let currentTransform = lifecycle.renderedTransform;
          if (nextIndex !== index + 1) {
            segmentStartIndex = childStates[index + 1]!.segmentStartIndex;
            const x = childStates[nextIndex - 1]!.lifecycle.renderedTransform.position.x.value;
            const shifted = withSlidePosition(currentTransform, x, currentTransform.position.y.value);
            if (shifted.status !== "ok") return shifted;
            currentTransform = shifted.value;
          }
          const origin = childStates[segmentStartIndex]!;
          const moved = moveSlideEndpoint(currentTransform, origin.lifecycle.motionState,
            sources[segmentStartIndex]!, childStates[nextChild.segmentStartIndex]!.lifecycle.motionState, sources[nextChild.segmentStartIndex]!,
            input.deltaTime.value, stopControl.currentBpm, stopControl.virtualLaneDeltaX,
            sources[index]!);
          if (moved.status !== "ok") return moved;
          lifecycle = Object.freeze({ ...lifecycle, renderedTransform: moved.value });
          const movedFront = withSlidePosition(frontTransform, moved.value.position.x.value, moved.value.position.y.value);
          if (movedFront.status !== "ok") return movedFront;
          frontTransform = movedFront.value;
        }
      }
    }
    const next = Object.freeze({ ...state, lifecycle, meshVisible, visible, segmentStartIndex, judgeY });
    nextStates.push(next);
  }
  let previousTransform = frontTransform;
  let previousMotionState = stopControl.rootMotionState;
  let previousLifecycle: OrdinaryLongNormalChildState | undefined;
  let previousButtonCount = frontButtonCount;
  for (const state of nextStates) {
    const widthRate = habahiroMeshWidthSetting === undefined
      ? createRenderFloat32(Math.fround(1))
      : getHabahiroMeshWidthRate(
          Math.max(previousButtonCount, state.buttonCount),
          habahiroMeshWidthSetting,
        );
    if (widthRate.status !== "ok") return widthRate;
    const afterScale = getOrdinaryNoteMeshAfterScale(state.lifecycle, previousMotionState.goalPosition.y, screenToSafeAreaRatio);
    if (afterScale.status !== "ok") return afterScale;
    const meshInput = {
      front: previousTransform,
      after: state.lifecycle.renderedTransform,
      afterScaleX: afterScale.value,
      frontButtonCount: previousButtonCount,
      afterButtonCount: state.buttonCount,
      screenToSafeAreaRatio,
      widthRate: widthRate.value,
      color,
      advanced: state.lifecycle.motionState.virtualLaneControllerPresent,
    };
    const mesh = extension?.buildMesh?.(meshInput, state.lifecycle, previousLifecycle) ?? buildOrdinaryLongNormalMesh(meshInput);
    if (mesh.status !== "ok") return mesh;
    segments.push(Object.freeze({ sourceIndex: state.sourceIndex, geometry: mesh.value }));
    previousTransform = state.lifecycle.renderedTransform;
    previousMotionState = state.lifecycle.motionState;
    previousLifecycle = state.lifecycle;
    previousButtonCount = state.buttonCount;
  }
  return ok(Object.freeze({
    frontTransform,
    childStates: Object.freeze(nextStates),
    segments: Object.freeze(segments),
  }));
}

function slideGoalX(source: SlideGeometrySource, base: number, delta: number, apply = source.isInvisible): number {
  if (!apply || source.virtualLaneDirection === 0) return base;
  const offset = Math.fround(source.virtualLaneDistance * delta);
  return Math.fround(source.virtualLaneDirection === 1 ? base - offset : base + offset);
}

function withSlidePosition(
  transform: OrdinaryNoteMotionResult, x: number, y: number, targetScale?: RenderFloat32,
): SimulatorResult<OrdinaryNoteMotionResult> {
  const nextX = createRenderFloat32(Math.fround(x));
  const nextY = createRenderFloat32(Math.fround(y));
  if (nextX.status !== "ok") return nextX;
  if (nextY.status !== "ok") return nextY;
  return ok(Object.freeze({ ...transform,
    position: Object.freeze({ x: nextX.value, y: nextY.value, z: transform.position.z }),
    ...(targetScale === undefined ? {} : { localScale: Object.freeze({ x: targetScale, y: targetScale, z: targetScale }) }),
  }));
}

function moveSlideEndpoint(
  current: OrdinaryNoteMotionResult,
  origin: OrdinaryNoteMotionState,
  source: SlideGeometrySource,
  target: OrdinaryNoteMotionState,
  targetSource: SlideGeometrySource,
  deltaTime: number,
  bpm: number,
  laneDelta: number,
  originalSource = source,
): SimulatorResult<OrdinaryNoteMotionResult> {
  // Equal-position connections extend the original transition to zero duration.
  if (targetSource.absolutePos === source.absolutePos) {
    return withSlidePosition(current, slideGoalX(targetSource, target.goalPosition.x.value, laneDelta), origin.goalPosition.y.value);
  }
  const seconds = getSecondsWithDistance(Math.fround(targetSource.absolutePos - source.absolutePos), bpm);
  if (seconds.status !== "ok") return seconds;
  const originX = source.isInvisible
    ? slideGoalX(originalSource, origin.goalPosition.x.value, laneDelta, true)
    : origin.goalPosition.x.value;
  const targetX = slideGoalX(targetSource, target.goalPosition.x.value, laneDelta);
  const step = Math.fround(Math.fround(targetX - originX) / Math.fround(seconds.value / deltaTime));
  const nextX = Math.fround(current.position.x.value + step);
  const x = step < 0 ? Math.max(targetX, nextX) : Math.min(targetX, nextX);
  return withSlidePosition(current, x, origin.goalPosition.y.value);
}

function reject(capability: string, detail: string): SimulatorResult<never> {
  return integrityFailure(capability, [
    "RPR-R4-010",
    "RPR-R4-014",
    "PR07",
    "PR12",
    "PR15",
  ], detail);
}
