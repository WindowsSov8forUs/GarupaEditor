import { noteMotionY, noteMotionCurveExponent, projectOrdinaryNoteMotion } from "../rendering/ordinaryNoteGeometry";
import { coordinate, coordinateAdd, coordinateScale } from "../rendering/exponentialCoordinates";
import { projectedNodeLane } from "./productChartProfile";
import { FrontNoteType } from "../chart/types";
import { NoteState } from "../notes/noteBase";
import { NoteLong, NoteSlide } from "../notes/noteTypes";
import { buildSlideAxisMesh, slideRenderedCurve, UNPRESENTED_SLIDE_MESH } from "./slideAxisMesh";
import type { RenderFloat32 } from "../../backends/renderingContracts";
import { createRenderFloat32 } from "../../backends/renderingValidation";
import type { GarupaProductSceneLayout } from "../../scene/simulatorSceneLayout";
import { ok, type SimulatorResult } from "../result";
import { advanceLongChildFrame, advanceOrdinaryLongNormalChild, createOrdinaryLongNormalChildState, getOrdinaryNoteMeshAfterScale, type OrdinaryLongNormalChildFrameInput, type OrdinaryLongNormalChildState } from "../rendering/ordinaryLongChildLifecycle";
import { advanceOrdinaryNoteVerticalMotion, calculateNoteMotionCurve, getOrdinaryNoteArrivalSeconds, repositionOrdinaryNoteToJudgeLine } from "../rendering/ordinaryNoteGeometry";
import { advanceOrdinarySlideChildren, applySlideRenderHides, createOrdinarySlideChildState, queueSlideRenderHideBefore, type OrdinarySlideChildState, type OrdinarySlideFrameResult, type SlideGeometrySource, type SlideRenderHideRequest } from "../rendering/ordinarySlideChildLifecycle";
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
}

export interface ExtensionSlideState {
  readonly root: OrdinaryLongNormalChildState;
  readonly rootJudgeY: number;
  readonly rootExitApplied?: boolean;
  readonly children: readonly OrdinarySlideChildState[];
  readonly rootVisible: boolean;
  readonly headCompleted?: boolean;
  readonly flashActive: boolean;
  readonly finished: boolean;
  readonly playableFinished: boolean;
}

export function createExtensionSlideState(nodes: readonly GarupaProductNode[],
  scene: GarupaProductSceneLayout, axis: GarupaProductTimingGroupAxisProfile): SimulatorResult<ExtensionSlideState> {
  const states: OrdinarySlideChildState[] = [];
  for (const [index, node] of nodes.entries()) {
    const motion = scene.motionStateAtLane(center(node), node.width, node.absolutePosition);
    if (motion.status !== "ok") return motion;
    const state = createOrdinarySlideChildState(Math.max(0, index - 1), node.width,
      node.visible, motion.value, node.absolutePosition, f32(bpmAtNode(axis, node.absolutePosition)));
    if (state.status !== "ok") return state;
    states.push(state.value);
  }
  return ok({ root: states[0]!.lifecycle, rootJudgeY: states[0]!.judgeY, children: states.slice(1), rootVisible: nodes[0]!.visible,
    flashActive: false, finished: false, playableFinished: false });
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
  usesAxis: (node: GarupaProductNode) => boolean,
  owner: NoteLong | NoteSlide | null,
  advanceRoot = true,
  initializeGeometry = false,
): SimulatorResult<{ readonly state: ExtensionSlideState; readonly segments: OrdinarySlideFrameResult["segments"] }> {
  const head = nodes[0]!;
  const chainUsesAxis = nodes.some(usesAxis);
  const sources: SlideGeometrySource[] = nodes.slice(1).map(geometrySource);
  const input: OrdinaryLongNormalChildFrameInput = {
    deltaTime: f32(frame.deltaTimeSeconds), launcherMusicPosition: frame.launcherMusicPosition,
    adjustedMusicPosition: frame.adjustedMusicPosition,
  };
  if (previous === undefined) {
    const created = createExtensionSlideState(nodes, scene, axis);
    if (created.status !== "ok") return created;
    previous = created.value;
  }
  if (previous.finished) return ok({ state: previous, segments: [] });
  const advancedRoot = advanceRoot ? advanceExtensionMotion(previous.root, head, frame, input, axis, usesAxis(head)) : ok(previous.root);
  if (advancedRoot.status !== "ok") return advancedRoot;
  let root = advancedRoot.value;
  const rootJudgementY = usesAxis(head) ? slideJudgementY(root) : ok(noteMotionY(root.renderedTransform));
  if (rootJudgementY.status !== "ok") return rootJudgementY;
  let rootJudgeY = previous.root.phase === "stop" ? previous.rootJudgeY
    : Math.max(rootJudgementY.value, scene.virtualPerfectLine);
  // A gesture head binds before it judges. Its sprite can stop at the real line,
  // but its spatial judgement must continue toward the virtual line like an after node.
  if (head.scoringSource?.slideGesture && owner instanceof NoteSlide && !owner.headJudged &&
      previous.root.phase === "stop" && rootJudgeY > scene.virtualPerfectLine) {
    const vertical = advanceOrdinaryNoteVerticalMotion({ ...root.motionState, deltaTime: input.deltaTime });
    if (vertical.status !== "ok") return vertical;
    rootJudgeY = Math.max(vertical.value.y, scene.virtualPerfectLine);
    root = { ...root, motionState: { ...root.motionState, progressRate: vertical.value.progressRate } };
  }
  if ((owner !== null && (owner.state === NoteState.Stop || owner.state === NoteState.Wait)) && previous.root.phase !== "stop") {
    const placed = repositionOrdinaryNoteToJudgeLine(root.motionState,
      frame.forcePerfect ? "perspective" : root.renderedTransform.localScale);
    if (placed.status !== "ok") return placed;
    root = { ...root, phase: "stop", renderedTransform: placed.value };
  }
  if (head.runtimeRoot?.fireNoteType === FrontNoteType.Long) {
    const tail = nodes[1]!;
    const child = previous.children[0]!;
    const long = advanceLongChildFrame(child.lifecycle, root.renderedTransform, input,
      ordinaryScene.screenToSafeAreaRatio!, ordinaryScene.longMeshColor!, ordinaryScene.habahiro?.meshWidthSetting, {
        advance: () => {
          if (initializeGeometry && !chainUsesAxis) return ok(child.lifecycle);
          const moved = advanceExtensionMotion(child.lifecycle, tail, frame, input, axis, usesAxis(tail));
          if (moved.status !== "ok") return moved;
          return ok(child.lifecycle.phase === "move" && frame.adjustedMusicPosition >= tail.absolutePosition
            ? { ...moved.value, phase: "stop" as const } : moved.value);
        },
        ...(chainUsesAxis ? {
          visible: (next: OrdinaryLongNormalChildState) => root.phase !== "wait" || next.phase !== "wait",
          mesh: (meshInput: import("../rendering/ordinaryLongChildLifecycle").OrdinaryLongNormalMeshInput,
            next: OrdinaryLongNormalChildState) => {
            const arrival = getOrdinaryNoteArrivalSeconds(root.motionState.specificSpeed);
            if (arrival.status !== "ok") return arrival;
            const curves: number[] = [];
            for (const node of nodes) {
              const displacement = axis.displacementAtPosition(node.timingGroup, node.absolutePosition, frame.absolutePosition);
              if (displacement.status !== "ok") return displacement;
              curves.push(calculateNoteMotionCurve(1 - displacement.value / (arrival.value.value * 1000), true));
            }
            return buildSlideAxisMesh(meshInput, head, tail, slideRenderedCurve(root, head, curves[0]!, scene),
              slideRenderedCurve(next, tail, curves[1]!, scene), scene);
          },
        } : {}),
      });
    if (long.status !== "ok") return long;
    const finished = previous.finished || frame.judged.has(tail.identity) || frame.missed.has(tail.identity);
    return ok({ state: { ...previous, root, rootJudgeY, children: [{ ...child, lifecycle: long.value.childState,
      visible: !finished, meshVisible: long.value.mesh !== null }], rootVisible: !finished, finished,
      playableFinished: finished, flashActive: owner != null && owner.flashAnimationRevision !== null && !finished },
      segments: [{ sourceIndex: 0, geometry: long.value.mesh ?? UNPRESENTED_SLIDE_MESH }] });
  }
  const hides = new Map<number, SlideRenderHideRequest>();
  if (owner instanceof NoteSlide) for (const [index, hide] of owner.pendingRenderHides) hides.set(index, hide);
  if (owner instanceof NoteSlide && owner.isGeometryOnly) {
    for (const child of previous.children) if (child.lifecycle.phase === "stop")
      queueSlideRenderHideBefore(hides, child.sourceIndex, sources, false, false);
  }
  let children = previous.children;
  let rootExitApplied = previous.rootExitApplied ?? false;
  let segments: OrdinarySlideFrameResult["segments"] = [];
  if (children.length > 0) {
    const curves: number[] = [];
    if (chainUsesAxis) {
      const arrival = getOrdinaryNoteArrivalSeconds(root.motionState.specificSpeed);
      if (arrival.status !== "ok") return arrival;
      for (const node of nodes) {
        const displacement = axis.displacementAtPosition(node.timingGroup, node.absolutePosition, frame.absolutePosition);
        if (displacement.status !== "ok") return displacement;
        const progress = 1 - displacement.value / (arrival.value.value * 1000);
        curves.push(calculateNoteMotionCurve(progress, true));
      }
    }
    const advanced = advanceOrdinarySlideChildren(root.renderedTransform, head.width, children,
      input, ordinaryScene.screenToSafeAreaRatio!, ordinaryScene.longMeshColor!, {
        advanceMotion: frame.deltaTimeSeconds > 0,
        rootWaiting: root.phase === "stop", rootExitApplied, hiddenEndpoints: head.runtimeRoot?.hiddenSlideEndpoints,
        judgementAdjustValueB: frame.adjustment,
        virtualPerfectLine: scene.virtualPerfectLine,
        rootSource: { ...geometrySource(head), slideNoteList: sources },
        rootMotionState: root.motionState, currentBpm: frame.currentBpm,
        virtualLaneDeltaX: scene.laneSpacingWorld.value,
        stoppedChildWaited: previous.children.map((_, index) =>
          owner instanceof NoteSlide && owner.afterNotes[index]?.stopAdjustmentWaited === true),
      }, ordinaryScene.habahiro?.meshWidthSetting, {
        canLeaveNode: index => {
          const source = nodes[index + 1]!.scoringSource;
          return source?.slideGesture === undefined || owner instanceof NoteSlide &&
            (index === -1 ? owner.headJudged : owner.afterNotes[index]?.judged === true);
        },
        outgoingTransform: (transform, index) => {
          const node = nodes[index + 1]!;
          const offset = geometrySource(node).slideExitOffset ?? 0;
          if (offset === 0) return ok(transform);
          const line = scene.fieldLines[0]!;
          const curve = (transform.position.y.value - line.start.y.value) / (line.goal.y.value - line.start.y.value);
          const incoming = scene.projectLaneAtCurve(center(node), curve);
          const outgoing = scene.projectLaneAtCurve(center(node) + offset, curve);
          if (incoming.status !== "ok") return incoming;
          if (outgoing.status !== "ok") return outgoing;
          const shift = outgoing.value.x.value - incoming.value.x.value;
          let unclipped = transform.unclipped;
          if (unclipped) {
            const startA = scene.projectLaneAtCurve(center(node), 0), startB = scene.projectLaneAtCurve(center(node) + offset, 0),
              goalA = scene.projectLaneAtCurve(center(node), 1), goalB = scene.projectLaneAtCurve(center(node) + offset, 1);
            if (startA.status !== "ok") return startA;
            if (startB.status !== "ok") return startB;
            if (goalA.status !== "ok") return goalA;
            if (goalB.status !== "ok") return goalB;
            const startShift = startB.value.x.value - startA.value.x.value,
              goalShift = goalB.value.x.value - goalA.value.x.value;
            const rawCurve = (unclipped.y - line.start.y.value) / (line.goal.y.value - line.start.y.value);
            const wide = unclipped.exponential;
            unclipped = { ...unclipped, x: unclipped.x + startShift + (goalShift - startShift) * rawCurve,
              ...(wide ? { exponential: { ...wide, x: coordinateAdd(wide.x, coordinate(startShift),
                coordinateScale(coordinateAdd(wide.y, coordinate(-line.start.y.value)),
                  (goalShift - startShift) / (line.goal.y.value - line.start.y.value))) } } : {}) };
          }
          return ok({ ...transform, unclipped, position: { ...transform.position,
            x: f32(transform.position.x.value + shift) } });
        },
        advanceChild: (child, index) => advanceExtensionMotion(child, nodes[index + 1]!, frame, input, axis, usesAxis(nodes[index + 1]!)),
        ...(chainUsesAxis ? { judgementY: (state: OrdinaryLongNormalChildState, index: number) =>
            usesAxis(nodes[index + 1]!) ? slideJudgementY(state) : ok(noteMotionY(state.renderedTransform)),
          isAfterHitTime: (index: number) => usesAxis(nodes[index + 1]!)
            ? frame.absolutePosition > nodes[index + 1]!.absolutePosition : undefined,
          buildMesh: (input: import("../rendering/ordinaryLongChildLifecycle").OrdinaryLongNormalMeshInput,
            after: OrdinaryLongNormalChildState, before: OrdinaryLongNormalChildState | undefined, index: number) => {
          const front = { ...(before ?? root), renderedTransform: input.front };
          if (front.phase === "wait" && after.phase === "wait") return ok(UNPRESENTED_SLIDE_MESH);
          // Signed SV may reveal the after node first. The unlaunched front
          // then needs the same virtual mesh width as an ordinary waiting after.
          const frontScale = getOrdinaryNoteMeshAfterScale(front, after.motionState.goalPosition.y, input.screenToSafeAreaRatio);
          if (frontScale.status !== "ok") return frontScale;
          const meshInput = { ...input, front: { ...input.front,
            localScale: { ...input.front.localScale, x: frontScale.value } } };
          return buildSlideAxisMesh(meshInput, outgoingNode(nodes[index]!), nodes[index + 1]!,
            slideRenderedCurve(front, nodes[index]!, curves[index]!, scene),
            slideRenderedCurve(after, nodes[index + 1]!, curves[index + 1]!, scene), scene);
        } } : {}),
      });
    if (advanced.status !== "ok") return advanced;
    children = applySlideRenderHides(children, advanced.value.childStates, hides);
    root = { ...root, renderedTransform: advanced.value.frontTransform };
    rootExitApplied = advanced.value.rootExitApplied;
    segments = advanced.value.segments;
  }
  const playableFinished = previous.playableFinished || owner?.state === NoteState.Deactive;
  const finished = playableFinished;
  const flashActive = owner !== null && owner.flashAnimationRevision !== null && !playableFinished;
  if (playableFinished) children = children.map(child => ({ ...child, visible: false }));
  return ok({ state: { headCompleted: owner instanceof NoteSlide ? owner.headJudged : previous.headCompleted, root, rootJudgeY, rootExitApplied, children, rootVisible: previous.rootVisible && !hides.has(-1) && !playableFinished,
    flashActive, finished, playableFinished }, segments });
}

function slideJudgementY(state: OrdinaryLongNormalChildState): SimulatorResult<number> {
  // SV changes visual displacement. Stop/judgement still uses the ordinary
  // time-driven vertical trajectory, including its virtual-line delay.
  const vertical = advanceOrdinaryNoteVerticalMotion({ ...state.motionState, deltaTime: f32(0) });
  return vertical.status === "ok" ? ok(vertical.value.y) : vertical;
}

export function advanceExtensionMotion(
  state: OrdinaryLongNormalChildState,
  node: GarupaProductNode,
  frame: ExtensionRenderFrame,
  input: OrdinaryLongNormalChildFrameInput,
  axis: GarupaProductTimingGroupAxisProfile,
  usesAxis: boolean,
): SimulatorResult<OrdinaryLongNormalChildState> {
  if (!usesAxis || state.phase === "stop") return advanceOrdinaryLongNormalChild(state, input);
  const arrival = getOrdinaryNoteArrivalSeconds(state.motionState.specificSpeed);
  if (arrival.status !== "ok") return arrival;
  const displacement = axis.displacementAtPosition(node.timingGroup, node.absolutePosition, frame.absolutePosition);
  if (displacement.status !== "ok") return displacement;
  const progress = 1 - displacement.value / (arrival.value.value * 1000);
  const due = frame.adjustedMusicPosition >= node.absolutePosition;
  const entered = progress >= 0 || due;
  // An unlaunched endpoint stays at the original launcher transform. Its strip
  // can remain visible even though the endpoint sprite has not entered yet.
  if (!entered) return state.phase === "wait" ? ok(state)
    : createOrdinaryLongNormalChildState(state.motionState, state.afterAbsolutePosition, state.noteBpm);
  const rawCurve = calculateNoteMotionCurve(progress, true);
  const noteTime = axis.positionToMilliseconds(node.absolutePosition);
  const currentTime = axis.positionToMilliseconds(frame.absolutePosition);
  if (noteTime.status !== "ok") return noteTime;
  if (currentTime.status !== "ok") return currentTime;
  const semanticProgress = 1 + (currentTime.value - noteTime.value) / (arrival.value.value * 1000);
  const projected = projectOrdinaryNoteMotion(state.motionState, f32(semanticProgress), rawCurve, undefined,
    Number.isFinite(rawCurve) ? undefined : noteMotionCurveExponent(progress));
  if (projected.status !== "ok") return projected;
  const transform = projected.value;
  return ok({ ...state, phase: entered ? "move" : "wait",
    renderedTransform: transform, motionState: { ...state.motionState,
      deltaTime: input.deltaTime, progressRate: transform.progressRate,
      currentPositionZ: state.motionState.currentPositionZ } });
}

function geometrySource(node: GarupaProductNode): SlideGeometrySource {
  return { absolutePos: node.absolutePosition, isInvisible: !node.visible,
    authoredAfterAbsolutePos: node.runtimeRoot?.authoredAfterAbsolutePos,
    virtualLaneDirection: 0, virtualLaneDistance: 0,
    slideExitOffset: node.scoringSource?.slideExitOffset };
}
function outgoingNode(node: GarupaProductNode): GarupaProductNode {
  const offset = geometrySource(node).slideExitOffset ?? 0;
  return offset === 0 ? node : { ...node, lane: node.lane + offset, spanStart: node.spanStart + offset, spanEnd: node.spanEnd + offset };
}
function center(node: GarupaProductNode): number { return projectedNodeLane(node); }
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
