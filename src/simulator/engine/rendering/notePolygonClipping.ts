import { coordinate, coordinateAdd, coordinateCompare, coordinateMultiply, coordinateRatio, coordinateScale,
  type ExponentialCoordinate, type ExponentialPoint } from "./exponentialCoordinates";

export type NoteClipVertex = { x: number; y: number; u: number; v: number; exponential?: ExponentialPoint };

/** Clip in host precision; pin the crossing coordinate to the actual boundary
 * to avoid cancellation between very distant endpoints. Preserve source UVs. */
export function clipNotePolygon(input: NoteClipVertex[], bounds: readonly [number, number, number, number]): NoteClipVertex[] {
  if (input.some(point => point.exponential)) return clipExponentialPolygon(input, bounds);
  let polygon = input;
  const [left, top, right, bottom] = bounds;
  for (const [axis, limit, lower] of [["x", left, true], ["x", right, false],
    ["y", top, true], ["y", bottom, false]] as const) {
    const result: NoteClipVertex[] = [];
    const inside = (point: NoteClipVertex) => lower ? point[axis] >= limit : point[axis] <= limit;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      if (inside(a)) result.push(a);
      if (inside(a) === inside(b)) continue;
      const scale = Math.max(Math.abs(a[axis]), Math.abs(b[axis]), Math.abs(limit), 1);
      const denominator = b[axis] / scale - a[axis] / scale;
      const weightB = (limit / scale - a[axis] / scale) / denominator;
      const weightA = (b[axis] / scale - limit / scale) / denominator;
      result.push({ x: axis === "x" ? limit : a.x * weightA + b.x * weightB,
        y: axis === "y" ? limit : a.y * weightA + b.y * weightB,
        u: a.u * weightA + b.u * weightB, v: a.v * weightA + b.v * weightB });
    }
    polygon = result;
  }
  return polygon;
}

/** Homogeneous intersections postpone division until the polygon is inside.
 * UVs carry the same weights as position, including distant endpoint widths. */
function clipExponentialPolygon(input: NoteClipVertex[], bounds: readonly [number, number, number, number]): NoteClipVertex[] {
  type Point = { x: ExponentialCoordinate; y: ExponentialCoordinate; w: ExponentialCoordinate;
    u: ExponentialCoordinate; v: ExponentialCoordinate };
  let polygon: Point[] = input.map(p => ({ x: p.exponential?.[0] ?? coordinate(p.x),
    y: p.exponential?.[1] ?? coordinate(p.y), w: coordinate(1), u: coordinate(p.u), v: coordinate(p.v) }));
  for (const [axis, limit, direction] of [["x", bounds[0], 1], ["x", bounds[2], -1],
    ["y", bounds[1], 1], ["y", bounds[3], -1]] as const) {
    const result: Point[] = [];
    const distance = (p: Point) => coordinateScale(coordinateAdd(p[axis], coordinateScale(p.w, -limit)), direction);
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      const da = distance(a), db = distance(b), insideA = coordinateCompare(da, []) >= 0, insideB = coordinateCompare(db, []) >= 0;
      if (insideA) result.push(a);
      if (insideA === insideB) continue;
      const p = insideA ? a : b, q = insideA ? b : a, dp = insideA ? da : db, dq = insideA ? db : da;
      const mix = (key: keyof Point) => coordinateAdd(coordinateMultiply(dp, q[key]), coordinateScale(coordinateMultiply(dq, p[key]), -1));
      const w = mix("w");
      result.push({ x: axis === "x" ? coordinateScale(w, limit) : mix("x"),
        y: axis === "y" ? coordinateScale(w, limit) : mix("y"), w, u: mix("u"), v: mix("v") });
    }
    polygon = result;
  }
  return polygon.map(p => {
    const result = { x: coordinateRatio(p.x, p.w), y: coordinateRatio(p.y, p.w),
      u: coordinateRatio(p.u, p.w), v: coordinateRatio(p.v, p.w) };
    if (!Object.values(result).every(Number.isFinite)) throw new Error("Clipped note coordinates must be finite.");
    return result;
  });
}
