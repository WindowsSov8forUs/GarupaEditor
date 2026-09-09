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
  readonly rootSource: NoteInformation;
  readonly rootMotionState: OrdinaryNoteMotionState;
  readonly currentBpm: number;
  readonly virtualLaneDeltaX: number;
  readonly stoppedChildWaited: readonly boolean[];
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
    !Number.isInteger(buttonCount) ||
    buttonCount < 1 ||
    buttonCount > 7
  ) {
    return reject(
      "render.slide.invalid-child-owner-state",
      "The R4 Slide child requires a non-negative source index and one 1..7-button endpoint owner.",
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
      ? advanceOrdinaryLongNormalChild(state.lifecycle, input) : ok(state.lifecycle);
    if (advanced.status !== "ok") return advanced;
    let lifecycle = advanced.value;
    let meshVisible = state.meshVisible;
    let visible = state.visible;
    let segmentStartIndex = state.segmentStartIndex;
    let judgeY = state.judgeY;
    if (stopControl.advanceMotion && state.lifecycle.phase !== "stop") {
      judgeY = Math.max(lifecycle.renderedTransform.position.y.value, stopControl.virtualPerfectLine);
    }
    if (stopControl.advanceMotion && state.lifecycle.phase === "move") {
      const hasAfter = index + 1 < childStates.length;
      const realLine = stopControl.rootWaiting && hasAfter;
      const stopLine = realLine
        ? lifecycle.motionState.goalPosition.y.value
        : stopControl.virtualPerfectLine;
      const crossed = lifecycle.renderedTransform.progressRate.value > 1 &&
        lifecycle.renderedTransform.position.y.value <= stopLine;
      if (crossed && lifecycle.renderedTransform.position.y.value < lifecycle.motionState.goalPosition.y.value) {
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
  let previousButtonCount = frontButtonCount;
  for (const state of nextStates) {
    const widthRate = habahiroMeshWidthSetting === undefined
      ? createRenderFloat32(Math.fround(1))
      : getHabahiroMeshWidthRate(
          Math.max(previousButtonCount, state.buttonCount),
          habahiroMeshWidthSetting,
        );
    if (widthRate.status !== "ok") return widthRate;
    const mesh = buildOrdinaryLongNormalMesh({
      front: previousTransform,
      after: state.lifecycle.renderedTransform,
      frontButtonCount: previousButtonCount,
      afterButtonCount: state.buttonCount,
      screenToSafeAreaRatio,
      widthRate: widthRate.value,
      color,
      advanced: state.lifecycle.motionState.virtualLaneControllerPresent,
    });
    if (mesh.status !== "ok") return mesh;
    segments.push(Object.freeze({ sourceIndex: state.sourceIndex, geometry: mesh.value }));
    previousTransform = state.lifecycle.renderedTransform;
    previousButtonCount = state.buttonCount;
  }
  return ok(Object.freeze({
    frontTransform,
    childStates: Object.freeze(nextStates),
    segments: Object.freeze(segments),
  }));
}

function slideGoalX(source: NoteInformation, base: number, delta: number, apply = source.isInvisible): number {
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
  source: NoteInformation,
  target: OrdinaryNoteMotionState,
  targetSource: NoteInformation,
  deltaTime: number,
  bpm: number,
  laneDelta: number,
  originalSource = source,
): SimulatorResult<OrdinaryNoteMotionResult> {
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
