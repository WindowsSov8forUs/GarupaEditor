import estimateTable from "./arm64ReciprocalSqrtEstimate.json";

type Vector3 = readonly [number, number, number];
type Columns = readonly [Vector3, Vector3, Vector3];
type Quaternion = readonly [number, number, number, number];
const words = new DataView(new ArrayBuffer(4));
const f32 = Math.fround;
const mul = (a: number, b: number): number => f32(f32(a) * f32(b));
const add = (a: number, b: number): number => f32(f32(a) + f32(b));
const sub = (a: number, b: number): number => f32(f32(a) - f32(b));
const minimumSquaredLength = fromBits(0x0da24260);

// BND-C117: native mesh normal stores use paired sums and two FRSQRTS steps.
export function normalizeNativeParticleNormal(value: Vector3): Vector3 {
  const squared = add(add(mul(value[0], value[0]), mul(value[1], value[1])), add(mul(value[2], value[2]), 0));
  if (!(squared > minimumSquaredLength)) return [0, 0, 0];
  let inverse = reciprocalSqrtEstimate(squared);
  // FRSQRTS rounds after (3-a*b)/2; its inner product is not separately rounded.
  inverse = mul(inverse, f32((3 - mul(squared, inverse) * inverse) / 2));
  inverse = mul(inverse, f32((3 - mul(squared, inverse) * inverse) / 2));
  return [mul(value[0], inverse), mul(value[1], inverse), mul(value[2], inverse)];
}

// BND-C117: preserve the native inverse register vectors before the writer's transpose.
export function calculateNativeMeshInverseRows(columns: Columns): Columns {
  const sum = add(add(squaredLength(columns[0]), squaredLength(columns[1])), squaredLength(columns[2]));
  const mean = mul(sum, fromBits(0x3eaaaa9f));
  if (mean < minimumSquaredLength) return [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const scale = mul(reciprocalSqrtEstimate(mean), fromBits(0x3f804020));
  const normalized: Columns = [scaleVector(columns[0], scale), scaleVector(columns[1], scale), scaleVector(columns[2], scale)];
  const first = cross(normalized[1], normalized[2]);
  const determinant = pairedDot(normalized[0], first);
  const inverse = Math.abs(determinant) <= fromBits(0x358637bd)
    ? singularInverse(normalized)
    : transpose([scaleVector(first, f32(1 / determinant)),
      scaleVector(cross(normalized[2], normalized[0]), f32(1 / determinant)),
      scaleVector(cross(normalized[0], normalized[1]), f32(1 / determinant))]);
  return [scaleVector(inverse[0], scale), scaleVector(inverse[1], scale), scaleVector(inverse[2], scale)];
}

export function calculateNativeMeshNormals(normals: readonly Vector3[], columns: Columns): readonly Vector3[] {
  const inverse = calculateNativeMeshInverseRows(columns);
  return normals.map((normal) => normalizeNativeParticleNormal([
    orderedDot(inverse[0], normal), orderedDot(inverse[1], normal), orderedDot(inverse[2], normal),
  ]));
}

function squaredLength(value: Vector3): number { return pairedDot(value, value); }
function pairedDot(a: Vector3, b: Vector3): number { return add(add(mul(a[0], b[0]), mul(a[1], b[1])), add(mul(a[2], b[2]), 0)); }
function orderedDot(a: Vector3, b: Vector3): number { return add(mul(a[0], b[0]), add(mul(a[1], b[1]), mul(a[2], b[2]))); }
function scaleVector(v: Vector3, scale: number): Vector3 { return [mul(v[0], scale), mul(v[1], scale), mul(v[2], scale)]; }
function negate(v: Vector3): Vector3 { return [-v[0], -v[1], -v[2]]; }
function cross(a: Vector3, b: Vector3): Vector3 {
  return [sub(mul(a[1], b[2]), mul(b[1], a[2])), sub(mul(a[2], b[0]), mul(b[2], a[0])), sub(mul(a[0], b[1]), mul(b[0], a[1]))];
}
function transpose(m: Columns): Columns { return [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]]; }
function apply(m: Columns, v: Vector3): Vector3 {
  return [add(mul(m[0][0], v[0]), add(mul(m[1][0], v[1]), mul(m[2][0], v[2]))),
    add(mul(m[0][1], v[0]), add(mul(m[1][1], v[1]), mul(m[2][1], v[2]))),
    add(mul(m[0][2], v[0]), add(mul(m[1][2], v[1]), mul(m[2][2], v[2])))];
}
function matrixProduct(a: Columns, b: Columns): Columns { return [apply(a, b[0]), apply(a, b[1]), apply(a, b[2])]; }

function normalizeQuaternion(q: Quaternion): Quaternion {
  const squared = add(add(mul(q[0], q[0]), mul(q[1], q[1])), add(mul(q[2], q[2]), mul(q[3], q[3])));
  let inverse = reciprocalSqrtEstimate(squared);
  inverse = mul(inverse, f32((3 - mul(squared, inverse) * inverse) / 2));
  inverse = mul(inverse, f32((3 - mul(squared, inverse) * inverse) / 2));
  return [mul(inverse, q[0]), mul(inverse, q[1]), mul(inverse, q[2]), mul(inverse, q[3])];
}
function quaternionProduct(parent: Quaternion, child: Quaternion): Quaternion {
  const [a, b, c, d] = parent; const [x, y, z, w] = child;
  return [-sub(sub(sub(mul(c, y), mul(b, z)), mul(d, x)), mul(a, w)),
    -sub(sub(sub(mul(a, z), mul(c, x)), mul(d, y)), mul(b, w)),
    -sub(sub(sub(mul(b, x), mul(d, z)), mul(c, w)), mul(a, y)),
    sub(sub(sub(mul(d, w), mul(a, x)), mul(c, z)), mul(b, y))];
}
function rotationColumns(q: Quaternion): Columns {
  const [x, y, z, w] = q; const x2 = mul(2, x); const nx2 = mul(-2, x);
  const y2 = mul(2, y); const ny2 = mul(-2, y); const z2 = mul(2, z); const nz2 = mul(-2, z);
  return [[add(add(mul(y, ny2), mul(z, nz2)), 1), add(add(mul(x, y2), mul(w, z2)), 0), add(add(mul(w, ny2), mul(x, z2)), 0)],
    [add(add(mul(w, nz2), mul(y, x2)), 0), add(add(mul(z, nz2), mul(x, nx2)), 1), add(add(mul(y, z2), mul(w, x2)), 0)],
    [add(add(mul(z, x2), mul(w, y2)), 0), add(add(mul(w, nx2), mul(z, y2)), 0), add(add(mul(x, nx2), mul(y, ny2)), 1)]];
}

// 10EFB00: five Jacobi sweeps, signed column sorting, then three QR rotations.
function singularInverse(matrix: Columns): Columns {
  let symmetric = matrixProduct(transpose(matrix), matrix);
  let right: Quaternion = [0, 0, 0, 1];
  const sine = fromBits(0x3ec3ef15); const cosine = fromBits(0x3f6c835e);
  for (let sweep = 0; sweep < 5; sweep += 1) {
    for (const [first, second, axis] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]] as const) {
      const off = symmetric[first][second]; const delta = sub(symmetric[first][first], symmetric[second][second]);
      const twice = add(delta, delta);
      const useFixed = mul(mul(fromBits(0x40ba827a), off), off) >= mul(twice, twice);
      const factors: Quaternion = axis === 0 ? [1, 0, 0, 1] : axis === 1 ? [0, 1, 0, 1] : [0, 0, 1, 1];
      const candidate: Quaternion = useFixed
        ? [axis === 0 ? sine : 0, axis === 1 ? sine : 0, axis === 2 ? sine : 0, cosine]
        : [mul(off, factors[0]), mul(off, factors[1]), mul(off, factors[2]), mul(twice, factors[3])];
      const rotation = normalizeQuaternion(candidate); const basis = rotationColumns(rotation);
      right = quaternionProduct(right, rotation);
      symmetric = matrixProduct(matrixProduct(transpose(basis), symmetric), basis);
    }
  }
  let columns = matrixProduct(matrix, rotationColumns(right));
  const lengths = [squaredLength(columns[0]), squaredLength(columns[1]), squaredLength(columns[2])];
  const half = fromBits(0x3f3504f3);
  for (const [first, second, turn] of [[0, 1, [0, 0, half, half]], [0, 2, [0, -half, 0, half]], [1, 2, [half, 0, 0, half]]] as const) {
    const swap = lengths[second]! > lengths[first]!;
    if (swap) {
      const next: [Vector3, Vector3, Vector3] = [...columns];
      next[first] = columns[second]; next[second] = negate(columns[first]); columns = next;
      [lengths[first], lengths[second]] = [lengths[second]!, lengths[first]!];
    }
    right = quaternionProduct(right, swap ? turn : [0, 0, 0, 1]);
  }
  let left: Quaternion = [0, 0, 0, 1];
  for (const [column, first, second, factors] of [[0, 0, 1, [0, 0, 1, 1]], [0, 0, 2, [0, -1, 0, 1]], [1, 1, 2, [1, 0, 0, 1]]] as const) {
    const a = columns[column][first]; const b = columns[column][second];
    const length = f32(Math.sqrt(add(mul(a, a), mul(b, b)))); const epsilon = fromBits(0x26901d7d);
    const ch = add(Math.max(length, epsilon), Math.abs(a)); const sh = length <= epsilon ? 0 : b;
    const x = a >= 0 ? sh : ch; const w = a >= 0 ? ch : sh;
    const rotation = normalizeQuaternion([mul(x, factors[0]), mul(x, factors[1]), mul(x, factors[2]), mul(w, factors[3])]);
    left = column === 0 && second === 1 ? rotation : quaternionProduct(left, rotation);
    columns = matrixProduct(rotationColumns([-rotation[0], -rotation[1], -rotation[2], rotation[3]]), columns);
  }
  const reciprocal = [nativeReciprocal(columns[0][0]), nativeReciprocal(columns[1][1]), nativeReciprocal(columns[2][2])] as const;
  const rightBasis = rotationColumns(right); const leftRows = transpose(rotationColumns(left));
  const scaleRow = (row: Vector3): Vector3 => [mul(row[0], reciprocal[0]), mul(row[1], reciprocal[1]), mul(row[2], reciprocal[2])];
  return [apply(rightBasis, scaleRow(leftRows[0])), apply(rightBasis, scaleRow(leftRows[1])), apply(rightBasis, scaleRow(leftRows[2]))];
}

function nativeReciprocal(value: number): number {
  if (Math.abs(value) < fromBits(0x358637bd)) return 0;
  words.setFloat32(0, value, true); const word = words.getUint32(0, true);
  const exponent = ((word >>> 23) & 255) - 127; const bucket = 256 + ((word >>> 15) & 255);
  let estimate = f32(Math.round(262144 / (2 * bucket + 1)) * 2 ** (-exponent - 9));
  if (value < 0) estimate = -estimate;
  estimate = mul(estimate, f32(2 - value * estimate));
  return mul(estimate, f32(2 - value * estimate));
}

function reciprocalSqrtEstimate(value: number): number {
  words.setFloat32(0, value, true);
  const bits = words.getUint32(0, true);
  const exponent = ((bits >>> 23) & 255) - 127;
  const halfExponent = Math.floor(exponent / 2);
  const parity = exponent - halfExponent * 2;
  const bin = parity * 256 + ((bits & 0x7fffff) >>> 15);
  return fromBits(estimateTable.estimateBits[bin]! - halfExponent * 0x800000);
}

function fromBits(bits: number): number {
  words.setUint32(0, bits, true);
  return words.getFloat32(0, true);
}
