import type {
  RenderColor,
  RenderFloat32,
} from "../../backends/renderingContracts";
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
  getHabahiroMeshWidthRate,
  repositionOrdinaryNoteToJudgeLine,
  type OrdinaryBaseNoteMeshGeometry,
  type OrdinaryNoteMotionResult,
  type OrdinaryNoteMotionState,
} from "./ordinaryNoteGeometry";

export interface OrdinarySlideChildState {
  readonly sourceIndex: number;
  readonly buttonCount: number;
  readonly visible: boolean;
  readonly meshVisible: boolean;
  readonly lifecycle: OrdinaryLongNormalChildState;
}

export interface OrdinarySlideSegmentGeometry {
  readonly sourceIndex: number;
  readonly geometry: OrdinaryBaseNoteMeshGeometry;
}

export interface OrdinarySlideFrameResult {
  readonly childStates: readonly OrdinarySlideChildState[];
  readonly segments: readonly OrdinarySlideSegmentGeometry[];
}

export interface OrdinarySlideStopControl {
  readonly rootWaiting: boolean;
  readonly judgementAdjustValueB: number;
  readonly virtualPerfectLine: number;
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
      buttonCount,
      visible,
      meshVisible: true,
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
  let previousTransform = front;
  let previousButtonCount = frontButtonCount;
  for (const [index, state] of childStates.entries()) {
    const advanced = advanceOrdinaryLongNormalChild(state.lifecycle, input);
    if (advanced.status !== "ok") return advanced;
    let lifecycle = advanced.value;
    let meshVisible = state.meshVisible;
    if (state.lifecycle.phase === "move") {
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
        const snapped = repositionOrdinaryNoteToJudgeLine(lifecycle.motionState);
        if (snapped.status !== "ok") return snapped;
        lifecycle = Object.freeze({ ...lifecycle, renderedTransform: snapped.value });
      }
    }
    const next = Object.freeze({ ...state, lifecycle, meshVisible });
    nextStates.push(next);
    const widthRate = habahiroMeshWidthSetting === undefined
      ? createRenderFloat32(Math.fround(1))
      : getHabahiroMeshWidthRate(
          Math.max(previousButtonCount, state.buttonCount),
          habahiroMeshWidthSetting,
        );
    if (widthRate.status !== "ok") return widthRate;
    const mesh = buildOrdinaryLongNormalMesh({
      front: previousTransform,
      after: lifecycle.renderedTransform,
      frontButtonCount: previousButtonCount,
      afterButtonCount: state.buttonCount,
      screenToSafeAreaRatio,
      widthRate: widthRate.value,
      color,
      advanced: state.lifecycle.motionState.virtualLaneControllerPresent,
    });
    if (mesh.status !== "ok") return mesh;
    segments.push(Object.freeze({ sourceIndex: state.sourceIndex, geometry: mesh.value }));
    previousTransform = lifecycle.renderedTransform;
    previousButtonCount = state.buttonCount;
  }
  return ok(Object.freeze({
    childStates: Object.freeze(nextStates),
    segments: Object.freeze(segments),
  }));
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
