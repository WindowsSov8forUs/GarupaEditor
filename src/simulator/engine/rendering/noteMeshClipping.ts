import { clipNotePolygon, type NoteClipVertex } from "./notePolygonClipping";
import { coordinateAdd, coordinateScale, type ExponentialCoordinate } from "./exponentialCoordinates";
import { createRenderFloat32 } from "../../backends/renderingValidation";
import type { RenderColor } from "../../backends/renderingContracts";
import { ok, type SimulatorResult } from "../result";
import { buildNoteMeshStrip, type OrdinaryBaseNoteMeshGeometry } from "./ordinaryNoteGeometry";

export const EMPTY_NOTE_STRIP: OrdinaryBaseNoteMeshGeometry = Object.freeze({
  vertices: Object.freeze([]), indices: Object.freeze([]), uv: Object.freeze([]), colors: Object.freeze([]),
});
export interface NoteClipEndpoint { readonly base: readonly number[]; readonly slope: readonly number[];
  readonly exponential?: readonly [ExponentialCoordinate, ExponentialCoordinate, ExponentialCoordinate] }

/** Shared original strip topology with host-precision clipping before Float32 publication. */
export function buildClippedNoteStrip(input: { readonly advanced?: boolean; readonly color: RenderColor; readonly horizontalRange?: readonly [number, number] },
  first: number, second: number, range: readonly [number, number],
  a: NoteClipEndpoint, b: NoteClipEndpoint): SimulatorResult<OrdinaryBaseNoteMeshGeometry> {
  const exponential = a.exponential !== undefined && b.exponential !== undefined;
  if (!exponential && noteClipInterval(first, second, range) === null) return ok(EMPTY_NOTE_STRIP);
  const [minimum, maximum] = range;
  const curveAt = (rate: number) => interpolate(Math.max(minimum, Math.min(maximum, first)),
    Math.max(minimum, Math.min(maximum, second)), rate);
  const boundaryAt = (rate: number) => {
    const curve = curveAt(rate);
    // Compute both weights directly: 1 - weight loses the contribution of a
    // distant endpoint. The limiting curve contribution also handles overflow.
    const weightA = first === second ? 1 - rate : stableRatio(second, first, curve),
      weightB = first === second ? rate : stableRatio(first, second, curve);
    const curveA = Number.isFinite(first) ? first * weightA : curve - second * weightB;
    const curveB = Number.isFinite(second) ? second * weightB : curve - first * weightA;
    const component = (index: number) => a.base[index]! * weightA + b.base[index]! * weightB +
      a.slope[index]! * curveA + b.slope[index]! * curveB;
    const x = component(0), y = component(1), halfWidth = component(2);
    return { x, y, halfWidth, uv: first === second ? rate : stableRatio(first, second, curve) };
  };
  if (input.horizontalRange) {
    const vertices: OrdinaryBaseNoteMeshGeometry["vertices"][number][] = [],
      uv: OrdinaryBaseNoteMeshGeometry["uv"][number][] = [], indices: number[] = [];
    const count = input.advanced ? 20 : 10;
    const row = (index: number): readonly [NoteClipVertex, NoteClipVertex] => {
      if (exponential) {
        const t = index / count;
        const component = (i: number) => coordinateAdd(coordinateScale(a.exponential![i]!, 1 - t), coordinateScale(b.exponential![i]!, t));
        const x = component(0), y = component(1), width = component(2);
        return [{ x: 0, y: 0, u: 0, v: t, exponential: [coordinateAdd(x, coordinateScale(width, -1)), y] },
          { x: 0, y: 0, u: 1, v: t, exponential: [coordinateAdd(x, width), y] }];
      }
      const p = boundaryAt(index / count);
      return [{ x: p.x - p.halfWidth, y: p.y, u: 0, v: p.uv },
        { x: p.x + p.halfWidth, y: p.y, u: 1, v: p.uv }] as const;
    };
    const zero = createRenderFloat32(0);
    if (zero.status !== "ok") return zero;
    for (let section = 0; section < count; section++) {
      const front = row(section), after = row(section + 1);
      for (const triangle of [[front[0], after[0], front[1]], [front[1], after[0], after[1]]]) {
        const clipped: NoteClipVertex[] = clipNotePolygon(triangle,
          [input.horizontalRange[0], minimum, input.horizontalRange[1], maximum]);
        if (clipped.length < 3) continue;
        const start = vertices.length;
        for (const point of clipped) {
          const x = createRenderFloat32(Math.fround(point.x)), y = createRenderFloat32(Math.fround(point.y)),
            u = createRenderFloat32(Math.fround(point.u)), v = createRenderFloat32(Math.fround(point.v));
          if (x.status !== "ok") return x;
          if (y.status !== "ok") return y;
          if (u.status !== "ok") return u;
          if (v.status !== "ok") return v;
          vertices.push({ x: x.value, y: y.value, z: zero.value }); uv.push({ x: u.value, y: v.value });
        }
        for (let i = 1; i + 1 < clipped.length; i++) indices.push(start, start + i, start + i + 1);
      }
    }
    return ok({ viewportClipped: true, vertices, indices, uv, colors: vertices.map(() => input.color) });
  }
  return buildNoteMeshStrip(input.advanced ? 20 : 10, rate => {
    const { x, y, halfWidth } = boundaryAt(rate);
    const left = createRenderFloat32(Math.fround(x - halfWidth)), right = createRenderFloat32(Math.fround(x + halfWidth)),
      ordinate = createRenderFloat32(Math.fround(y));
    if (left.status !== "ok") return left;
    if (right.status !== "ok") return right;
    if (ordinate.status !== "ok") return ordinate;
    return ok([{ x: left.value, y: ordinate.value }, { x: right.value, y: ordinate.value }] as const);
  }, input.color, undefined, rate => boundaryAt(rate).uv);
}

export function noteClipInterval(first: number, second: number, range: readonly [number, number]): readonly [number, number] | null {
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
