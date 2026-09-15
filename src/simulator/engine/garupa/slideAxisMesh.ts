import { projectedNodeLane } from "./productChartProfile";
import type { GarupaProductSceneLayout } from "../../scene/simulatorSceneLayout";
import { buildClippedNoteStrip, noteClipInterval as slideAxisInterval, EMPTY_NOTE_STRIP } from "../rendering/noteMeshClipping";
export { noteClipInterval as slideAxisInterval } from "../rendering/noteMeshClipping";
import { ok, type SimulatorResult } from "../result";
import { buildOrdinaryLongNormalMesh, type OrdinaryLongNormalMeshInput } from "../rendering/ordinaryLongChildLifecycle";
import { calculateNoteMeshHalfWidth, type OrdinaryBaseNoteMeshGeometry } from "../rendering/ordinaryNoteGeometry";
import type { GarupaProductNode } from "./productChartProfile";
import type { OrdinaryLongNormalChildState } from "../rendering/ordinaryLongChildLifecycle";

export const UNPRESENTED_SLIDE_MESH = EMPTY_NOTE_STRIP;

/** Clip the geometry that the shared lifecycle actually produced. Only an
 * overflowing moving endpoint needs its unrepresentable axis coordinate. */
export function slideRenderedCurve(state: OrdinaryLongNormalChildState, node: GarupaProductNode,
  rawCurve: number, scene: GarupaProductSceneLayout): number {
  if (state.phase === "move" && (scene.projectLaneAtCurve(center(node), rawCurve).status !== "ok" ||
    scene.projectNoteScaleAtCurve(rawCurve, node.width).status !== "ok")) return rawCurve;
  const line = scene.fieldLines[0]!;
  return (state.renderedTransform.position.y.value - line.start.y.value) /
    (line.goal.y.value - line.start.y.value);
}

/** Signed SV can put either end beyond the field, including outside the numeric
 * coordinate range. Clip only that additional domain; keep source strip rules. */
export function buildSlideAxisMesh(input: OrdinaryLongNormalMeshInput,
  from: GarupaProductNode, to: GarupaProductNode, first: number, second: number,
  scene: GarupaProductSceneLayout): SimulatorResult<OrdinaryBaseNoteMeshGeometry> {
  if (input.front.unclipped || input.after.unclipped) return buildOrdinaryLongNormalMesh(input);
  const interval = slideAxisInterval(first, second, scene.visibleCurveRange);
  if (interval === null) return ok(UNPRESENTED_SLIDE_MESH);
  if (interval[0] === 0 && interval[1] === 1)
    return buildOrdinaryLongNormalMesh(input);
  const width = (scale: number, count: number) => calculateNoteMeshHalfWidth(scale, count,
    input.screenToSafeAreaRatio.value, input.widthRate.value);
  const endpoint = (node: GarupaProductNode, curve: number, transform: typeof input.front, meshScale: number) => {
    const point = scene.projectLaneAtCurve(center(node), curve);
    const scale = scene.projectNoteScaleAtCurve(curve, node.width);
    if (point.status === "ok" && scale.status === "ok") return ok({
      base: [transform.position.x.value, transform.position.y.value, width(meshScale, node.width)],
      slope: [0, 0, 0],
    });
    const start = scene.projectLaneAtCurve(center(node), 0);
    const goal = scene.projectLaneAtCurve(center(node), 1);
    const goalScale = scene.projectNoteScaleAtCurve(1, node.width);
    const beyondGoalScale = scene.projectNoteScaleAtCurve(2, node.width);
    if (start.status !== "ok") return start;
    if (goal.status !== "ok") return goal;
    if (goalScale.status !== "ok") return goalScale;
    if (beyondGoalScale.status !== "ok") return beyondGoalScale;
    // Only the large positive curve can overflow. Sample the same side of the
    // original absolute-distance scale equation to recover its affine slope.
    const goalWidth = width(goalScale.value.value, node.width);
    const widthSlope = width(beyondGoalScale.value.value, node.width) - goalWidth;
    return ok({ base: [start.value.x.value, start.value.y.value, goalWidth - widthSlope],
      slope: [goal.value.x.value - start.value.x.value, goal.value.y.value - start.value.y.value,
        widthSlope] });
  };
  const a = endpoint(from, first, input.front, input.front.localScale.x.value),
    b = endpoint(to, second, input.after, input.afterScaleX.value);
  if (a.status !== "ok") return a;
  if (b.status !== "ok") return b;
  return buildClippedNoteStrip(input, first, second, scene.visibleCurveRange, a.value, b.value);
}

function center(node: GarupaProductNode): number { return projectedNodeLane(node); }
