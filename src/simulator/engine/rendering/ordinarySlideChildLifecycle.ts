import type {
  RenderColor,
  RenderFloat32,
} from "../../backends/renderingContracts";
import {
  createRenderFloat32,
} from "../../backends/renderingValidation";
import {
  evidenceRequired,
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
import type {
  OrdinaryBaseNoteMeshGeometry,
  OrdinaryNoteMotionResult,
  OrdinaryNoteMotionState,
} from "./ordinaryNoteGeometry";

export interface OrdinarySlideChildState {
  readonly sourceIndex: number;
  readonly buttonCount: number;
  readonly visible: boolean;
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
  for (const state of childStates) {
    const advanced = advanceOrdinaryLongNormalChild(state.lifecycle, input);
    if (advanced.status !== "ok") return advanced;
    const next = Object.freeze({ ...state, lifecycle: advanced.value });
    nextStates.push(next);
    const widthRate = createRenderFloat32(Math.fround(1));
    if (widthRate.status !== "ok") return widthRate;
    const mesh = buildOrdinaryLongNormalMesh({
      front: previousTransform,
      after: advanced.value.renderedTransform,
      frontButtonCount: previousButtonCount,
      afterButtonCount: state.buttonCount,
      screenToSafeAreaRatio,
      widthRate: widthRate.value,
      color,
    });
    if (mesh.status !== "ok") return mesh;
    segments.push(Object.freeze({ sourceIndex: state.sourceIndex, geometry: mesh.value }));
    previousTransform = advanced.value.renderedTransform;
    previousButtonCount = state.buttonCount;
  }
  return ok(Object.freeze({
    childStates: Object.freeze(nextStates),
    segments: Object.freeze(segments),
  }));
}

function reject(capability: string, detail: string): SimulatorResult<never> {
  return evidenceRequired(capability, [
    "RPR-R4-010",
    "RPR-R4-014",
    "PR07",
    "PR12",
    "PR15",
  ], detail);
}
