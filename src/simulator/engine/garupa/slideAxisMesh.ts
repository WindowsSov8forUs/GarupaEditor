import type { GarupaProductSceneLayout } from "../../scene/simulatorSceneLayout";
import { createRenderFloat32 } from "../../backends/renderingValidation";
import { ok, type SimulatorResult } from "../evidence";
import { buildOrdinaryLongNormalMesh, type OrdinaryLongNormalMeshInput } from "../rendering/ordinaryLongChildLifecycle";
import { buildNoteMeshStrip, calculateNoteMeshHalfWidth, type OrdinaryBaseNoteMeshGeometry } from "../rendering/ordinaryNoteGeometry";
import type { GarupaProductNode } from "./productChartProfile";

/** Signed SV can put either end beyond the field, including outside the numeric
 * coordinate range. Clip only that additional domain; keep source strip rules. */
export function buildSlideAxisMesh(input: OrdinaryLongNormalMeshInput,
  from: GarupaProductNode, to: GarupaProductNode, first: number, second: number,
  scene: GarupaProductSceneLayout): SimulatorResult<OrdinaryBaseNoteMeshGeometry> {
  const interval = slideAxisInterval(first, second, scene.visibleCurveRange);
  if (interval === null || interval[0] === 0 && interval[1] === 1)
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
  const [minimum, maximum] = scene.visibleCurveRange;
  const curveAt = (rate: number) => interpolate(Math.max(minimum, Math.min(maximum, first)),
    Math.max(minimum, Math.min(maximum, second)), rate);
  return buildNoteMeshStrip(input.advanced ? 20 : 10, rate => {
    const curve = curveAt(rate);
    // Compute both weights directly: 1 - weight loses the contribution of a
    // distant endpoint. The limiting curve contribution also handles overflow.
    const weightA = stableRatio(second, first, curve), weightB = stableRatio(first, second, curve);
    const curveA = Number.isFinite(first) ? first * weightA : curve - second * weightB;
    const curveB = Number.isFinite(second) ? second * weightB : curve - first * weightA;
    const component = (index: number) => a.value.base[index]! * weightA + b.value.base[index]! * weightB +
      a.value.slope[index]! * curveA + b.value.slope[index]! * curveB;
    const x = component(0), y = component(1), halfWidth = component(2);
    const left = createRenderFloat32(Math.fround(x - halfWidth));
    const right = createRenderFloat32(Math.fround(x + halfWidth));
    const ordinate = createRenderFloat32(Math.fround(y));
    if (left.status !== "ok") return left;
    if (right.status !== "ok") return right;
    if (ordinate.status !== "ok") return ordinate;
    return ok([{ x: left.value, y: ordinate.value }, { x: right.value, y: ordinate.value }] as const);
  }, input.color, undefined, rate => stableRatio(first, second, curveAt(rate)));
}

export function slideAxisInterval(first: number, second: number, range: readonly [number, number]): readonly [number, number] | null {
  const [minimum, maximum] = range;
  if (Number.isNaN(first) || Number.isNaN(second) || Math.max(first, second) < minimum || Math.min(first, second) > maximum) return null;
  if (first === second) return [0, 1];
  const lower = stableRatio(first, second, minimum), upper = stableRatio(first, second, maximum);
  return [Math.min(lower, upper), Math.max(lower, upper)];
}
function stableRatio(first: number, second: number, target: number): number {
  if (!Number.isFinite(first)) return 1;
  if (!Number.isFinite(second)) return 0;
  const scale = Math.max(Math.abs(first), Math.abs(second), Math.abs(target), 1);
  return Math.max(0, Math.min(1, (target / scale - first / scale) / (second / scale - first / scale)));
}
function interpolate(first: number, second: number, rate: number): number {
  return Math.fround(Math.fround(first * Math.fround(1 - rate)) + Math.fround(second * rate));
}
function center(node: GarupaProductNode): number { return node.spanStart + (node.width - 1) / 2; }
