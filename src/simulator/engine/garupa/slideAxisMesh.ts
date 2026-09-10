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
  const interval = slideAxisInterval(first, second);
  if (interval === null || interval[0] === 0 && interval[1] === 1)
    return buildOrdinaryLongNormalMesh(input);
  const rawFirst = scene.projectLaneAtCurve(center(from), first);
  const rawSecond = scene.projectLaneAtCurve(center(to), second);
  const scaleFirst = scene.projectNoteScaleAtCurve(first, from.width);
  const scaleSecond = scene.projectNoteScaleAtCurve(second, to.width);
  const finite = rawFirst.status === "ok" && rawSecond.status === "ok" &&
    scaleFirst.status === "ok" && scaleSecond.status === "ok";
  const width = (scale: number, count: number) => calculateNoteMeshHalfWidth(scale, count,
    input.screenToSafeAreaRatio.value, input.widthRate.value);
  return buildNoteMeshStrip(input.advanced ? 20 : 10, rate => {
    const curve = interpolate(Math.max(.002, Math.min(1, first)), Math.max(.002, Math.min(1, second)), rate);
    const ratio = finite ? interpolate(interval[0], interval[1], rate) : stableRatio(first, second, curve);
    let x: number, y: number, halfWidth: number;
    if (finite) {
      x = interpolate(input.front.position.x.value, input.after.position.x.value, ratio);
      y = interpolate(input.front.position.y.value, input.after.position.y.value, ratio);
      halfWidth = interpolate(width(input.front.localScale.x.value, from.width), width(input.after.localScale.x.value, to.width), ratio);
    } else {
      const point = scene.projectLaneAtCurve(interpolate(center(from), center(to), ratio), curve);
      const a = scene.projectNoteScaleAtCurve(curve, from.width);
      const b = scene.projectNoteScaleAtCurve(curve, to.width);
      if (point.status !== "ok") return point;
      if (a.status !== "ok") return a;
      if (b.status !== "ok") return b;
      x = point.value.x.value; y = point.value.y.value;
      halfWidth = interpolate(width(a.value.value, from.width), width(b.value.value, to.width), ratio);
    }
    const left = createRenderFloat32(Math.fround(x - halfWidth));
    const right = createRenderFloat32(Math.fround(x + halfWidth));
    const ordinate = createRenderFloat32(Math.fround(y));
    if (left.status !== "ok") return left;
    if (right.status !== "ok") return right;
    if (ordinate.status !== "ok") return ordinate;
    return ok([{ x: left.value, y: ordinate.value }, { x: right.value, y: ordinate.value }] as const);
  }, input.color);
}

export function slideAxisInterval(first: number, second: number): readonly [number, number] | null {
  if (Number.isNaN(first) || Number.isNaN(second) || Math.max(first, second) < .002 || Math.min(first, second) > 1) return null;
  if (first === second) return [0, 1];
  const lower = stableRatio(first, second, .002), upper = stableRatio(first, second, 1);
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
