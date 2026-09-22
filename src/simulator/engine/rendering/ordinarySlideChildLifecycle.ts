import { EMPTY_NOTE_STRIP } from "./noteMeshClipping";
import { noteMotionY, noteSpatialX, noteSpatialY } from "./ordinaryNoteGeometry";
import { coordinate, coordinateAdd, coordinateCompare, coordinateValue, type ExponentialCoordinate } from "./exponentialCoordinates";
import { virtualLaneNoteX } from "../chart/virtualLane";
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
} from "../result";
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
  readonly exitApplied: boolean;
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
  readonly rootExitApplied: boolean;
  readonly childStates: readonly OrdinarySlideChildState[];
  readonly segments: readonly OrdinarySlideSegmentGeometry[];
}

export interface OrdinarySlideStopControl {
  readonly advanceMotion: boolean;
  readonly rootWaiting: boolean;
  readonly rootExitApplied?: boolean;
  /** Approved hidden endpoints may have no later visible geometry anchor. */
  readonly hiddenEndpoints?: boolean;
  readonly judgementAdjustValueB: number;
  readonly virtualPerfectLine: number;
  readonly rootSource: SlideGeometrySource & { readonly slideNoteList: readonly SlideGeometrySource[] };
  readonly rootMotionState: OrdinaryNoteMotionState;
  readonly currentBpm: number;
  readonly virtualLaneDeltaX: number;
  readonly stoppedChildWaited: readonly boolean[];
}

export type SlideGeometrySource = Pick<NoteInformation,
  "absolutePos" | "isInvisible" | "virtualLaneDirection" | "virtualLaneDistance" | "slideExitOffset" | "authoredAfterAbsolutePos">;

/** Extensions supply motion inputs, not a second Slide lifecycle. */
export interface SlideMotionExtension {
  outgoingTransform?: (transform: OrdinaryNoteMotionResult, sourceIndex: number) => SimulatorResult<OrdinaryNoteMotionResult>;
  canLeaveNode?: (sourceIndex: number) => boolean;
  advanceChild(state: OrdinaryLongNormalChildState, index: number): SimulatorResult<OrdinaryLongNormalChildState>;
  buildMesh?: (input: Parameters<typeof buildOrdinaryLongNormalMesh>[0], after: OrdinaryLongNormalChildState,
    before: OrdinaryLongNormalChildState | undefined, sourceIndex: number) => ReturnType<typeof buildOrdinaryLongNormalMesh>;
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
      noteMotionY(sampled.lifecycle.renderedTransform) <= sampled.lifecycle.motionState.targetCenterY.value);
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
      exitApplied: false,
      buttonCount,
      visible,
      meshVisible: true,
      judgeY: noteMotionY(lifecycle.value.renderedTransform),
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
  let rootExitApplied = stopControl.rootExitApplied ?? false;
  const sources = stopControl.rootSource.slideNoteList;
  // Successor lookup is invariant within this frame; do not rescan a long
  // hidden-node chain for every stopped child.
  const nextVisible: (OrdinarySlideChildState | undefined)[] = new Array(childStates.length);
  const nextMoving: number[] = new Array(childStates.length);
  let visibleSuccessor: OrdinarySlideChildState | undefined;
  for (let index = childStates.length - 1; index >= 0; index--) {
    nextVisible[index] = visibleSuccessor;
    if (!sources[index]!.isInvisible) visibleSuccessor = childStates[index];
    nextMoving[index] = index + 1 < childStates.length && childStates[index]!.lifecycle.phase === "stop"
      ? nextMoving[index + 1]! : index;
  }
  const first = childStates[0]!;
  let frontCanFollow = stopControl.rootWaiting && (extension?.canLeaveNode?.(-1) ?? true);
  if (stopControl.advanceMotion && frontCanFollow) {
    if (!rootExitApplied && stopControl.rootSource.slideExitOffset) {
      const shifted = withSlidePosition(frontTransform, addSpatial(noteSpatialX(frontTransform),
        stopControl.rootSource.slideExitOffset * stopControl.virtualLaneDeltaX), noteSpatialY(frontTransform));
      if (shifted.status !== "ok") return shifted;
      frontTransform = shifted.value;
      rootExitApplied = true;
    }
    if (first.lifecycle.phase === "stop") {
      const target = first.lifecycle.motionState.goalPosition;
      const x = slideGoalX(sources[0]!, target.x.value, stopControl.virtualLaneDeltaX);
      const moved = withSlidePosition(frontTransform, x, target.y.value, stopControl.rootMotionState.noteSettingScale);
      if (moved.status !== "ok") return moved;
      frontTransform = moved.value;
    } else {
      const moved = moveSlideEndpoint(frontTransform, stopControl.rootMotionState,
        stopControl.rootSource, first.lifecycle.motionState, sources[first.segmentStartIndex]!,
        input.deltaTime.value, stopControl.currentBpm, stopControl.virtualLaneDeltaX,
        stopControl.rootSource, stopControl.rootSource.authoredAfterAbsolutePos !== undefined);
      if (moved.status !== "ok") return moved;
      frontTransform = moved.value;
    }
  }
  let killNextMesh = false;
  for (const [index, state] of childStates.entries()) {
    const canLeaveNode = extension?.canLeaveNode?.(index) ?? true;
    // A later node may stop first under folded time or independent SV. Only
    // a contiguous stopped, released prefix may move the shared Slide head.
    frontCanFollow = frontCanFollow && state.lifecycle.phase === "stop" && canLeaveNode;
    const advanced = stopControl.advanceMotion
      ? extension?.advanceChild(state.lifecycle, index) ?? advanceOrdinaryLongNormalChild(state.lifecycle, input)
      : ok(state.lifecycle);
    if (advanced.status !== "ok") return advanced;
    let lifecycle = advanced.value;
    let meshVisible = state.meshVisible && !killNextMesh;
    killNextMesh = false;
    let visible = state.visible;
    let segmentStartIndex = state.segmentStartIndex;
    let exitApplied = state.exitApplied;
    let judgeY = state.judgeY;
    const judgementY = extension?.judgementY?.(lifecycle, index) ?? ok(noteMotionY(lifecycle.renderedTransform));
    if (judgementY.status !== "ok") return judgementY;
    if (stopControl.advanceMotion && state.lifecycle.phase !== "stop") {
      judgeY = Math.max(judgementY.value, stopControl.virtualPerfectLine);
    }
    if (stopControl.advanceMotion && state.lifecycle.phase === "move" && lifecycle.phase !== "wait") {
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
      const visibleAfter = nextVisible[index] ??
        (stopControl.hiddenEndpoints && index + 1 < childStates.length ? childStates[childStates.length - 1] : undefined);
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
        if (!canLeaveNode) {
          nextStates.push(Object.freeze({ ...state, lifecycle, meshVisible, visible, segmentStartIndex, judgeY, exitApplied }));
          continue;
        }
        if (!exitApplied && sources[index]!.slideExitOffset) {
          const shifted = withSlidePosition(lifecycle.renderedTransform, addSpatial(noteSpatialX(lifecycle.renderedTransform),
            sources[index]!.slideExitOffset! * stopControl.virtualLaneDeltaX), noteSpatialY(lifecycle.renderedTransform));
          if (shifted.status !== "ok") return shifted;
          lifecycle = { ...lifecycle, renderedTransform: shifted.value };
          exitApplied = true;
        }
        if (visibleAfter.lifecycle.phase === "stop") {
          const goal = visibleAfter.lifecycle.motionState.goalPosition;
          const moved = withSlidePosition(lifecycle.renderedTransform, goal.x.value, goal.y.value, lifecycle.motionState.noteSettingScale);
          if (moved.status !== "ok") return moved;
          lifecycle = Object.freeze({ ...lifecycle, renderedTransform: moved.value });
          // NoteSlideAfter calls afterNote.KillMesh here, before the adjustment
          // delay. The next child owns this node's outgoing strip, not this child.
          killNextMesh = true;
          if (frontCanFollow && (sources[index]!.slideExitOffset !== undefined || sources[visibleAfter.sourceIndex]!.slideExitOffset !== undefined)) {
            const followed = withSlidePosition(frontTransform, goal.x.value, goal.y.value);
            if (followed.status !== "ok") return followed;
            frontTransform = followed.value;
          }
          if (!stopControl.stoppedChildWaited[index]) visible = false;
        } else {
          const nextIndex = nextMoving[index + 1]!;
          const nextChild = childStates[nextIndex]!;
          let currentTransform = lifecycle.renderedTransform;
          if (nextIndex !== index + 1) {
            segmentStartIndex = childStates[index + 1]!.segmentStartIndex;
            const from = childStates[nextIndex - 1]!.lifecycle.renderedTransform;
            const x = noteSpatialX(from);
            const shifted = withSlidePosition(currentTransform, x, noteSpatialY(currentTransform), undefined, from.unclipped);
            if (shifted.status !== "ok") return shifted;
            currentTransform = shifted.value;
          }
          const origin = childStates[segmentStartIndex]!;
          const moved = moveSlideEndpoint(currentTransform, origin.lifecycle.motionState,
            sources[segmentStartIndex]!, childStates[nextChild.segmentStartIndex]!.lifecycle.motionState, sources[nextChild.segmentStartIndex]!,
            input.deltaTime.value, stopControl.currentBpm, stopControl.virtualLaneDeltaX,
            sources[index]!, stopControl.rootSource.authoredAfterAbsolutePos !== undefined);
          if (moved.status !== "ok") return moved;
          lifecycle = Object.freeze({ ...lifecycle, renderedTransform: moved.value });
          if (frontCanFollow) {
            const movedFront = withSlidePosition(frontTransform, noteSpatialX(moved.value), noteSpatialY(moved.value), undefined, moved.value.unclipped);
            if (movedFront.status !== "ok") return movedFront;
            frontTransform = movedFront.value;
          }
        }
      }
    }
    const next = Object.freeze({ ...state, lifecycle, meshVisible, visible, segmentStartIndex, judgeY, exitApplied });
    nextStates.push(next);
  }
  let previousTransform = frontTransform;
  let previousMotionState = stopControl.rootMotionState;
  let previousLifecycle: OrdinaryLongNormalChildState | undefined;
  let previousButtonCount = frontButtonCount;
  let previousExitApplied = rootExitApplied;
  let previousIndex = -1;
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
    const outgoing = !previousExitApplied && extension?.outgoingTransform
      ? extension.outgoingTransform(previousTransform, previousIndex) : ok(previousTransform);
    if (outgoing.status !== "ok") return outgoing;
    const meshInput = {
      front: outgoing.value,
      after: state.lifecycle.renderedTransform,
      afterScaleX: afterScale.value,
      frontButtonCount: previousButtonCount,
      afterButtonCount: state.buttonCount,
      screenToSafeAreaRatio,
      widthRate: widthRate.value,
      color,
      advanced: state.lifecycle.motionState.virtualLaneControllerPresent,
    };
    const dormant = !state.meshVisible || extension === undefined && (
      state.lifecycle.phase === "wait" && (previousLifecycle?.phase === "wait" ||
        previousLifecycle === undefined && input.launcherMusicPosition < stopControl.rootSource.absolutePos));
    const mesh = dormant ? ok(EMPTY_NOTE_STRIP)
      : extension?.buildMesh?.(meshInput, state.lifecycle, previousLifecycle, state.sourceIndex) ?? buildOrdinaryLongNormalMesh(meshInput);
    if (mesh.status !== "ok") return mesh;
    segments.push(Object.freeze({ sourceIndex: state.sourceIndex, geometry: mesh.value }));
    previousTransform = state.lifecycle.renderedTransform;
    previousExitApplied = state.exitApplied;
    previousIndex = state.sourceIndex;
    previousMotionState = state.lifecycle.motionState;
    previousLifecycle = state.lifecycle;
    previousButtonCount = state.buttonCount;
  }
  return ok(Object.freeze({
    frontTransform,
    rootExitApplied,
    childStates: Object.freeze(nextStates),
    segments: Object.freeze(segments),
  }));
}

function slideGoalX(source: SlideGeometrySource, base: number, delta: number, apply = source.isInvisible): number {
  return apply ? virtualLaneNoteX(source, delta, base) : base;
}

function withSlidePosition(
  transform: OrdinaryNoteMotionResult, x: number | ExponentialCoordinate, y: number | ExponentialCoordinate, targetScale?: RenderFloat32,
  bounds?: OrdinaryNoteMotionResult["unclipped"],
): SimulatorResult<OrdinaryNoteMotionResult> {
  const raw = transform.unclipped;
  if (typeof x !== "number" || typeof y !== "number" || raw?.exponential) {
    const view = raw ?? bounds;
    if (view === undefined) return reject("render.slide.missing-clip-viewport", "Extended Slide following requires its source viewport.");
    const wideX = typeof x === "number" ? coordinate(x) : x, wideY = typeof y === "number" ? coordinate(y) : y;
    const bounded = (value: ExponentialCoordinate, range: readonly [number, number]) => coordinateCompare(value, coordinate(range[0])) < 0 ? range[0]
      : coordinateCompare(value, coordinate(range[1])) > 0 ? range[1] : coordinateValue(value);
    const safeX = createRenderFloat32(Math.fround(bounded(wideX, view.viewportX))), safeY = createRenderFloat32(Math.fround(bounded(wideY, view.viewportY)));
    if (safeX.status !== "ok") return safeX;
    if (safeY.status !== "ok") return safeY;
    const scale = targetScale === undefined ? raw?.exponential?.scaleX ?? coordinate(raw?.scale ?? transform.localScale.x.value) : coordinate(targetScale.value);
    return ok({ ...transform, position: { x: safeX.value, y: safeY.value, z: transform.position.z },
      localScale: targetScale ? { x: targetScale, y: targetScale, z: transform.localScale.z } : transform.localScale,
      unclipped: { ...view, x: safeX.value.value, y: safeY.value.value, scale: targetScale?.value ?? raw?.scale ?? transform.localScale.x.value,
        exponential: { x: wideX, y: wideY, scaleX: scale, scaleY: scale } } });
  }
  const scale = targetScale?.value ?? raw?.scale;
  const nextX = createRenderFloat32(Math.fround(x)), nextY = createRenderFloat32(Math.fround(y));
  const nextScale = scale === undefined ? undefined : createRenderFloat32(Math.fround(scale));
  if (nextX.status === "ok" && nextY.status === "ok" && nextScale?.status !== "integrity-failure" &&
    (!raw || [x, y, scale!].every(value => Number.isFinite(Math.fround(value * raw.pixelsPerWorldUnit))))) {
    return ok({ ...transform, unclipped: undefined,
      position: { x: nextX.value, y: nextY.value, z: transform.position.z },
      localScale: nextScale?.status === "ok" ? { x: nextScale.value, y: nextScale.value, z: transform.localScale.z } : transform.localScale });
  }
  if (!raw || ![x, y, scale].every(value => typeof value === "number" && Number.isFinite(value)))
    return nextX.status !== "ok" ? nextX : nextY.status !== "ok" ? nextY : nextScale! as SimulatorResult<never>;
  const safeX = createRenderFloat32(Math.fround(Math.max(raw.viewportX[0], Math.min(raw.viewportX[1], x)))),
    safeY = createRenderFloat32(Math.fround(Math.max(raw.viewportY[0], Math.min(raw.viewportY[1], y))));
  if (safeX.status !== "ok") return safeX;
  if (safeY.status !== "ok") return safeY;
  return ok({ ...transform, position: { x: safeX.value, y: safeY.value, z: transform.position.z },
    unclipped: { ...raw, x, y, scale: scale! } });
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
  foldedTime = false,
): SimulatorResult<OrdinaryNoteMotionResult> {
  const seconds = getSecondsWithDistance(targetSource.absolutePos - source.absolutePos, bpm);
  if (seconds.status !== "ok") return seconds;
  const originX = source.isInvisible
    ? slideGoalX(originalSource, origin.goalPosition.x.value, laneDelta, true)
    : origin.goalPosition.x.value + (source.slideExitOffset ?? 0) * laneDelta;
  const targetX = slideGoalX(targetSource, target.goalPosition.x.value, laneDelta);
  const dx = targetX - originX;
  // Coincident goals have no horizontal displacement, including at zero duration.
  // Skip both division and target clamping to preserve the current X.
  if (dx === 0) return withSlidePosition(current, noteSpatialX(current), origin.goalPosition.y.value);
  // A folded successor whose deadline precedes this stopped endpoint is
  // already due. It cannot acquire a negative-duration outward motion.
  if (foldedTime && seconds.value < 0) return withSlidePosition(current, targetX, origin.goalPosition.y.value);
  const step = Math.fround(dx / (seconds.value / deltaTime));
  if (step === Infinity || step === -Infinity) return withSlidePosition(current, targetX, origin.goalPosition.y.value);
  const currentX = noteSpatialX(current);
  if (typeof currentX !== "number") {
    const next = coordinateAdd(currentX, coordinate(step)), target = coordinate(targetX);
    const reached = step < 0 ? coordinateCompare(next, target) <= 0 : coordinateCompare(next, target) >= 0;
    return withSlidePosition(current, reached ? targetX : next, origin.goalPosition.y.value);
  }
  const nextX = current.unclipped ? currentX + step : Math.fround(currentX + step);
  const x = step < 0 ? Math.max(targetX, nextX) : Math.min(targetX, nextX);
  return withSlidePosition(current, x, origin.goalPosition.y.value);
}

function addSpatial(value: number | ExponentialCoordinate, delta: number): number | ExponentialCoordinate {
  return typeof value === "number" ? value + delta : coordinateAdd(value, coordinate(delta));
}

function reject(capability: string, detail: string): SimulatorResult<never> {
  return integrityFailure(capability, detail);
}
