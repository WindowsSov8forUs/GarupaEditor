type Vector3 = readonly [number, number, number];
type Columns = readonly [Vector3, Vector3, Vector3];
type MutableVector3 = [number, number, number];
type Diagonals = readonly [Vector3, Vector3];

// BND-C38: literal Float32 coefficients from the original billboard workers.
const coefficients = new Float32Array(new Uint32Array([
  0x3e22f983, 0x42992322, 0x42a33422, 0x42255ddc, 0x40c90fda, 0x421ea0cd,
]).buffer);
const f32 = Math.fround;
const multiply = (a: number, b: number): number => f32(f32(a) * f32(b));
const add = (a: number, b: number): number => f32(f32(a) + f32(b));
const subtract = (a: number, b: number): number => f32(f32(a) - f32(b));

function foldedPolynomial(turns: number): number {
  const signedRound = turns < 0 || Object.is(turns, -0) ? -8388608 : 8388608;
  const nearest = subtract(add(turns, signedRound), signedRound);
  const folded = subtract(0.25, f32(Math.abs(subtract(turns, nearest))));
  const squared = multiply(folded, folded);
  const fourth = multiply(squared, squared);
  const low = subtract(coefficients[4]!, multiply(squared, coefficients[3]!));
  const middle = multiply(fourth, subtract(coefficients[2]!, multiply(squared, coefficients[1]!)));
  const high = multiply(multiply(fourth, fourth), coefficients[5]!);
  return multiply(folded, add(high, add(low, middle)));
}

function trigonometry(angle: number, inverseTwoPi: number): readonly [number, number] {
  const turns = multiply(angle, inverseTwoPi);
  return [foldedPolynomial(turns), foldedPolynomial(add(turns, -0.25))];
}

export function calculateNativeScalarBillboardRotation(basis: Columns, angle: number): Columns {
  const [cosine, sine] = trigonometry(angle, coefficients[0]!);
  const x: MutableVector3 = [0, 0, 0]; const y: MutableVector3 = [0, 0, 0]; const z: MutableVector3 = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const a = basis[0][axis]!; const b = basis[1][axis]!; const c = basis[2][axis]!;
    const zero = multiply(c, 0);
    x[axis] = add(multiply(a, cosine), subtract(zero, multiply(b, sine)));
    y[axis] = add(multiply(a, sine), add(zero, multiply(b, cosine)));
    z[axis] = add(multiply(a, 0), add(c, multiply(b, 0)));
  }
  return [x, y, z];
}

export function calculateNative3DBillboardRotation(basis: Columns, rotation: Vector3): Columns {
  // The 3D branch folds negative turns; substituting the scalar sine with a
  // negation changes rounding even when the particle's X/Y angles are zero.
  const inverseTwoPi = -coefficients[0]!;
  const [cz, sz] = trigonometry(rotation[2], inverseTwoPi);
  const [cx, sx] = trigonometry(rotation[0], inverseTwoPi);
  const [cy, sy] = trigonometry(rotation[1], inverseTwoPi);
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
      const y = add(multiply(rotated[2][axis]!, 0), multiply(halfSize[1], rotated[1][axis]!));
      const x = multiply(halfSize[0], rotated[0][axis]!);
      first[axis] = subtract(y, x);
      second[axis] = add(x, y);
    }
  } else {
    // BND-C40: the scalar worker scales trig values before rotating diagonals.
    const [cosine, sine] = trigonometry(rotation[2], coefficients[0]!);
    const s = multiply(sine, halfSize[0]); const c = multiply(cosine, halfSize[1]);
    const a = subtract(s, c); const b = add(c, s); const d = subtract(c, s);
    for (let axis = 0; axis < 3; axis += 1) {
      const zero = multiply(basis[2][axis]!, 0);
      first[axis] = add(multiply(basis[0][axis]!, a), add(zero, multiply(basis[1][axis]!, b)));
      second[axis] = add(multiply(basis[0][axis]!, b), add(zero, multiply(basis[1][axis]!, d)));
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
