import { buildSlideAxisMesh } from "./slideAxisMesh";
import type { RenderFloat32 } from "../../backends/renderingContracts";
import { createRenderFloat32 } from "../../backends/renderingValidation";
import type { GarupaProductSceneLayout } from "../../scene/simulatorSceneLayout";
import { ok, type SimulatorResult } from "../evidence";
import { advanceOrdinaryLongNormalChild, type OrdinaryLongNormalChildFrameInput, type OrdinaryLongNormalChildState } from "../rendering/ordinaryLongChildLifecycle";
import { calculateNoteMotionCurve, getOrdinaryNoteArrivalSeconds, repositionOrdinaryNoteToJudgeLine, type OrdinaryNoteMotionResult } from "../rendering/ordinaryNoteGeometry";
import { advanceOrdinarySlideChildren, advanceSlideStopWait, applySlideRenderHides, createOrdinarySlideChildState, queueSlideRenderHideBefore, type OrdinarySlideChildState, type OrdinarySlideFrameResult, type SlideGeometrySource, type SlideRenderHideRequest } from "../rendering/ordinarySlideChildLifecycle";
import type { OrdinaryFixedNoteSceneInput } from "../rendering/renderCommandProducer";
import type { GarupaProductNode } from "./productChartProfile";
import type { GarupaProductTimingGroupAxisProfile } from "./timingGroupAxis";

export interface ExtensionRenderFrame {
  readonly absolutePosition: number;
  readonly currentBpm: number;
  readonly launcherMusicPosition: number;
  readonly adjustedMusicPosition: number;
  readonly deltaTimeSeconds: number;
  readonly adjustment: number;
  readonly forcePerfect: boolean;
  readonly judged: ReadonlySet<string>;
  readonly missed: ReadonlySet<string>;
  readonly heldChains: ReadonlySet<string>;
}

export interface ExtensionSlideState {
  readonly root: OrdinaryLongNormalChildState;
  readonly rootJudgeY: number;
  readonly children: readonly OrdinarySlideChildState[];
  readonly rootVisible: boolean;
  readonly waits: readonly number[];
  readonly flashActive: boolean;
  readonly finished: boolean;
  readonly playableFinished: boolean;
}

/** Only the authored time/coordinate inputs differ. Slide state transitions and
 * mesh construction are owned by ordinarySlideChildLifecycle. */
export function advanceExtensionSlide(
  nodes: readonly GarupaProductNode[],
  previous: ExtensionSlideState | undefined,
  frame: ExtensionRenderFrame,
  scene: GarupaProductSceneLayout,
  ordinaryScene: OrdinaryFixedNoteSceneInput,
  axis: GarupaProductTimingGroupAxisProfile,
  usesAxis: boolean,
): SimulatorResult<{ readonly state: ExtensionSlideState; readonly segments: OrdinarySlideFrameResult["segments"] }> {
  const head = nodes[0]!;
  const sources: SlideGeometrySource[] = nodes.slice(1).map(geometrySource);
  const input: OrdinaryLongNormalChildFrameInput = {
    deltaTime: f32(frame.deltaTimeSeconds), launcherMusicPosition: f32(frame.launcherMusicPosition),
    adjustedMusicPosition: f32(frame.adjustedMusicPosition),
  };
  if (previous === undefined) {
    const states: OrdinarySlideChildState[] = [];
    for (const [index, node] of nodes.entries()) {
      const motion = scene.motionStateAtLane(center(node), node.width, node.absolutePosition);
      if (motion.status !== "ok") return motion;
      const state = createOrdinarySlideChildState(Math.max(0, index - 1), node.width,
        node.visible, motion.value, node.absolutePosition, f32(bpmAtNode(axis, node.absolutePosition)));
      if (state.status !== "ok") return state;
      states.push(state.value);
    }
    previous = { root: states[0]!.lifecycle, rootJudgeY: states[0]!.judgeY, children: states.slice(1), rootVisible: head.visible,
      waits: sources.map(() => 0), flashActive: false, finished: false, playableFinished: false };
  }
  if (previous.finished) return ok({ state: previous, segments: [] });
  const advancedRoot = advanceExtensionMotion(previous.root, head, frame, input, scene, axis, usesAxis);
  if (advancedRoot.status !== "ok") return advancedRoot;
  let root = advancedRoot.value;
  const rootJudgeY = previous.root.phase === "stop" ? previous.rootJudgeY
    : Math.max(root.renderedTransform.position.y.value, scene.virtualPerfectLine);
  if ((frame.judged.has(head.identity) || frame.missed.has(head.identity)) && previous.root.phase !== "stop") {
    const placed = repositionOrdinaryNoteToJudgeLine(root.motionState,
      frame.forcePerfect ? "perspective" : root.renderedTransform.localScale);
    if (placed.status !== "ok") return placed;
    root = { ...root, phase: "stop", renderedTransform: placed.value };
  }
  const hides = new Map<number, SlideRenderHideRequest>();
  for (const [index, node] of nodes.entries()) {
    if (index > 0 && frame.judged.has(node.identity))
      queueSlideRenderHideBefore(hides, index - 1, sources, false, frame.forcePerfect);
    if (frame.missed.has(node.identity)) {
      hides.set(index - 1, { forceKillMesh: true, afterUpdate: false });
      if (index > 0) queueSlideRenderHideBefore(hides, index - 1, sources, true, false);
    }
  }
  const waits = previous.children.map((child, index) => child.lifecycle.phase !== "stop"
    ? { counter: previous!.waits[index]!, waited: false }
    : advanceSlideStopWait(previous!.waits[index]!, sources.slice(index + 1).some(source => !source.isInvisible), frame.adjustment));
  let children = previous.children;
  let segments: OrdinarySlideFrameResult["segments"] = [];
  if (children.length > 0) {
    const curves: number[] = [];
    if (usesAxis) {
      const arrival = getOrdinaryNoteArrivalSeconds(root.motionState.specificSpeed);
      if (arrival.status !== "ok") return arrival;
      for (const [index, node] of nodes.entries()) {
        const stopped = index === 0 ? root.phase === "stop" : children[index - 1]!.lifecycle.phase === "stop";
        const displacement = axis.displacementAtPosition(node.timingGroup, node.absolutePosition, frame.absolutePosition);
        if (displacement.status !== "ok") return displacement;
        curves.push(stopped ? 1 : calculateNoteMotionCurve(1 - displacement.value / (arrival.value.value * 1000), true));
      }
    }
    let meshIndex = 0;
    const advanced = advanceOrdinarySlideChildren(root.renderedTransform, head.width, children,
      input, ordinaryScene.screenToSafeAreaRatio!, ordinaryScene.longMeshColor!, {
        advanceMotion: frame.deltaTimeSeconds > 0,
        rootWaiting: root.phase === "stop", judgementAdjustValueB: frame.adjustment,
        virtualPerfectLine: scene.virtualPerfectLine,
        rootSource: { ...geometrySource(head), slideNoteList: sources },
        rootMotionState: root.motionState, currentBpm: frame.currentBpm,
        virtualLaneDeltaX: scene.laneSpacingWorld.value,
        stoppedChildWaited: waits.map(wait => wait.waited),
      }, ordinaryScene.habahiro?.meshWidthSetting, {
        advanceChild: (child, index) => advanceExtensionMotion(child, nodes[index + 1]!, frame, input, scene, axis, usesAxis),
        ...(usesAxis ? { isAfterHitTime: (index: number) => frame.absolutePosition > nodes[index + 1]!.absolutePosition, buildMesh: (input: import("../rendering/ordinaryLongChildLifecycle").OrdinaryLongNormalMeshInput) => {
          const index = meshIndex++;
          return buildSlideAxisMesh(input, nodes[index]!, nodes[index + 1]!, curves[index]!, curves[index + 1]!, scene);
        } } : {}),
      });
    if (advanced.status !== "ok") return advanced;
    children = applySlideRenderHides(children, advanced.value.childStates, hides);
    root = { ...root, renderedTransform: advanced.value.frontTransform };
    segments = advanced.value.segments;
  }
  const lastVisible = [...nodes].reverse().find(node => node.visible);
  const playableFinished = previous.playableFinished || lastVisible === undefined ||
    frame.judged.has(lastVisible.identity) || frame.missed.has(lastVisible.identity);
  const tail = nodes[nodes.length - 1]!;
  const finished = playableFinished && (tail.visible || frame.adjustedMusicPosition > tail.absolutePosition);
  const flashActive = !playableFinished && (frame.forcePerfect
    ? (previous.flashActive || nodes.some(node => frame.judged.has(node.identity)))
    : frame.heldChains.has(head.chainIdentity!));
  if (playableFinished) children = children.map(child => ({ ...child, visible: false }));
  return ok({ state: { root, rootJudgeY, children, rootVisible: previous.rootVisible && !hides.has(-1) && !playableFinished,
    waits: waits.map(wait => wait.counter), flashActive, finished, playableFinished }, segments });
}

export function advanceExtensionMotion(
  state: OrdinaryLongNormalChildState,
  node: GarupaProductNode,
  frame: ExtensionRenderFrame,
  input: OrdinaryLongNormalChildFrameInput,
  scene: GarupaProductSceneLayout,
  axis: GarupaProductTimingGroupAxisProfile,
  usesAxis: boolean,
): SimulatorResult<OrdinaryLongNormalChildState> {
  if (!usesAxis || state.phase === "stop") return advanceOrdinaryLongNormalChild(state, input);
  const arrival = getOrdinaryNoteArrivalSeconds(state.motionState.specificSpeed);
  if (arrival.status !== "ok") return arrival;
  const displacement = axis.displacementAtPosition(node.timingGroup, node.absolutePosition, frame.absolutePosition);
  if (displacement.status !== "ok") return displacement;
  const progress = 1 - displacement.value / (arrival.value.value * 1000);
  const rawCurve = calculateNoteMotionCurve(progress, true);
  // Clip only coordinates outside the drawable field. A stopped/judged endpoint
  // is subsequently governed by the shared Slide lifecycle, never by SV again.
  let position = scene.projectLaneAtCurve(center(node), rawCurve);
  let scale = scene.projectNoteScaleAtCurve(rawCurve, node.width);
  if (position.status !== "ok" || scale.status !== "ok") {
    const clippedCurve = rawCurve < 0.002 ? 0.002 : 1;
    position = scene.projectLaneAtCurve(center(node), clippedCurve);
    scale = scene.projectNoteScaleAtCurve(clippedCurve, node.width);
  }
  if (position.status !== "ok") return position;
  if (scale.status !== "ok") return scale;
  const due = frame.adjustedMusicPosition >= node.absolutePosition;
  const entered = rawCurve >= 0.002 || due || state.phase !== "wait";
  const semanticProgress = 1 + (frame.absolutePosition - node.absolutePosition) * 60 / (48 * frame.currentBpm * arrival.value.value);
  const transform: OrdinaryNoteMotionResult = { progressRate: f32(semanticProgress), position: { ...position.value, z: state.motionState.currentPositionZ },
    localScale: { x: scale.value, y: scale.value, z: f32(0) } };
  return ok({ ...state, phase: entered ? "move" : "wait",
    renderedTransform: transform, motionState: { ...state.motionState,
      deltaTime: input.deltaTime, progressRate: transform.progressRate,
      currentPositionZ: state.motionState.currentPositionZ } });
}

function geometrySource(node: GarupaProductNode): SlideGeometrySource {
  return { absolutePos: node.absolutePosition, isInvisible: !node.visible,
    virtualLaneDirection: 0, virtualLaneDistance: 0 };
}
function center(node: GarupaProductNode): number { return node.spanStart + (node.width - 1) / 2; }
function f32(value: number): RenderFloat32 {
  const result = createRenderFloat32(Math.fround(value));
  if (result.status !== "ok") throw new Error(result.capability);
  return result.value;
}

/** A directional span is made from one-lane source bodies, anchored at its incoming lane. */
export function noteRenderInput(node: GarupaProductNode): GarupaProductNode {
  return node.type !== "Directional" ? node : { ...node, spanStart: node.lane, spanEnd: node.lane, width: 1 };
}
export function bpmAtNode(axis: GarupaProductTimingGroupAxisProfile, position: number): number {
  let bpm = axis.bpmSegments[0]!.bpm;
  for (const segment of axis.bpmSegments) { if (segment.absolutePosition > position) break; bpm = segment.bpm; }
  return bpm;
}
