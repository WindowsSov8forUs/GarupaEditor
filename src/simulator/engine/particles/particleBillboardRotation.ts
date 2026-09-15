type Vector3 = readonly [number, number, number];
type Columns = readonly [Vector3, Vector3, Vector3];
type MutableVector3 = [number, number, number];
type Diagonals = readonly [Vector3, Vector3];
const f32 = Math.fround;
const multiply = (a: number, b: number): number => f32(f32(a) * f32(b));
const add = (a: number, b: number): number => f32(f32(a) + f32(b));
const subtract = (a: number, b: number): number => f32(f32(a) - f32(b));

function trigonometry(angle: number, direction = 1): readonly [number, number] {
  return [f32(Math.cos(angle)), f32(Math.sin(angle) * direction)];
}

export function calculateNativeMeshEulerQuaternion(rotation: Vector3): readonly [number, number, number, number] {
  // BND-C105: the mesh helper combines half-angle polynomials in ZXY order.
  const [cx, sx] = trigonometry(multiply(rotation[0], 0.5));
  const [cy, sy] = trigonometry(multiply(rotation[1], 0.5));
  const [cz, sz] = trigonometry(multiply(rotation[2], 0.5));
  const products = [multiply(cz, sx), multiply(sx, sz), multiply(cx, sz), multiply(cx, cz)];
  const firstSigns = [1, -1, 1, 1]; const secondSigns = [1, 1, -1, 1];
  const result: [number, number, number, number] = [0, 0, 0, 0];
  for (let axis = 0; axis < 4; axis += 1) {
    result[axis] = add(multiply(firstSigns[axis]!, multiply(products[axis]!, cy)),
      multiply(multiply(secondSigns[axis]!, sy), products[(axis + 2) % 4]!));
  }
  return result;
}

export function calculateNativeMeshScalarQuaternion(angle: number): readonly [number, number, number, number] {
  const [cosine, sine] = trigonometry(multiply(angle, 0.5));
  return [0, 0, sine, cosine];
}

export function calculateNativeScalarBillboardRotation(basis: Columns, angle: number): Columns {
  const [cosine, sine] = trigonometry(angle);
  const x: MutableVector3 = [0, 0, 0]; const y: MutableVector3 = [0, 0, 0]; const z: MutableVector3 = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const a = basis[0][axis]!; const b = basis[1][axis]!; const c = basis[2][axis]!;
    x[axis] = add(multiply(a, cosine), -multiply(b, sine));
    y[axis] = add(multiply(a, sine), multiply(b, cosine));
    z[axis] = c;
  }
  return [x, y, z];
}

export function calculateNative3DBillboardRotation(basis: Columns, rotation: Vector3): Columns {
  // Particle Euler rotation uses the opposite orientation to the billboard plane.
  const direction = -1;
  const [cz, sz] = trigonometry(rotation[2], direction);
  const [cx, sx] = trigonometry(rotation[0], direction);
  const [cy, sy] = trigonometry(rotation[1], direction);
  const czcy = multiply(cz, cy);
  const szcy = multiply(sz, cy);
  const cxcy = multiply(cx, cy);
  const szcx = multiply(sz, cx);
  const czcx = multiply(cz, cx);
  const cxsy = multiply(cx, sy);
  const xx = add(czcy, multiply(sz, multiply(sx, sy)));
  const xz = subtract(multiply(sz, multiply(cy, sx)), multiply(cz, sy));
  const yx = subtract(multiply(sy, multiply(cz, sx)), szcy);
  const yz = add(multiply(sx, czcy), multiply(sz, sy));
  const x: MutableVector3 = [0, 0, 0]; const y: MutableVector3 = [0, 0, 0]; const z: MutableVector3 = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const a = basis[0][axis]!; const b = basis[1][axis]!; const c = basis[2][axis]!;
    x[axis] = add(multiply(a, xx), add(multiply(b, szcx), multiply(c, xz)));
    y[axis] = add(multiply(a, yx), add(multiply(b, czcx), multiply(c, yz)));
    z[axis] = add(multiply(a, cxsy), subtract(multiply(c, cxcy), multiply(b, sx)));
  }
  return [x, y, z];
}

export function calculateNativeSimpleBillboardDiagonals(
  basis: Columns,
  rotation: Vector3,
  halfSize: readonly [number, number],
  requires3D: boolean,
): Diagonals {
  const first: MutableVector3 = [0, 0, 0]; const second: MutableVector3 = [0, 0, 0];
  if (requires3D) {
    const rotated = calculateNative3DBillboardRotation(basis, rotation);
    for (let axis = 0; axis < 3; axis += 1) {
      const y = multiply(halfSize[1], rotated[1][axis]!);
      const x = multiply(halfSize[0], rotated[0][axis]!);
      first[axis] = subtract(y, x);
      second[axis] = add(x, y);
    }
  } else {
    // BND-C40: the scalar worker scales trig values before rotating diagonals.
    const [cosine, sine] = trigonometry(rotation[2]);
    const s = multiply(sine, halfSize[0]); const c = multiply(cosine, halfSize[1]);
    const a = subtract(s, c); const b = add(c, s); const d = subtract(c, s);
    for (let axis = 0; axis < 3; axis += 1) {
      first[axis] = add(multiply(basis[0][axis]!, a), multiply(basis[1][axis]!, b));
      second[axis] = add(multiply(basis[0][axis]!, b), multiply(basis[1][axis]!, d));
    }
  }
  return [first, second];
}

export function calculateNativeBillboardVertices(center: Vector3, diagonals: Diagonals): readonly Vector3[] {
  const plus = (value: Vector3): Vector3 => [add(center[0], value[0]), add(center[1], value[1]), add(center[2], value[2])];
  const minus = (value: Vector3): Vector3 => [subtract(center[0], value[0]), subtract(center[1], value[1]), subtract(center[2], value[2])];
  // Native perimeter order is +d0,+d1,-d0,-d1; this grid follows UV [3,2,0,1].
  return [minus(diagonals[1]), minus(diagonals[0]), plus(diagonals[0]), plus(diagonals[1])];
}
