// Authored hierarchy rotation, scale and reflection semantics.
// Host arithmetic is used without reproducing platform instruction sequences.
const f32 = Math.fround;
type Vector3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];
type Columns = readonly [Vector3, Vector3, Vector3];
export type ParticleMatrix = readonly number[];
export type ParticleSetupScale = number | readonly [number, number];

// BND-C179: 3883074 passes width first, then normalized note size * safe ratio.
export function calculateNativeParticleSetupFactors(widthRate: number, normalizedNoteSize: number, safeAreaRatio: number): readonly [number, number] {
  return [f32(widthRate), mul(normalizedNoteSize, safeAreaRatio)];
}

// Each 3883E60 call reads the scale written by the preceding call.
export function applyNativeParticleSetupScale(scale: Vector3, setup: ParticleSetupScale): Vector3 {
  const factors = typeof setup === "number" ? [setup] : setup;
  let result = scale;
  for (const factor of factors) result = [mul(result[0], factor), mul(result[1], factor), mul(result[2], factor)];
  return result;
}

export interface ParticleRuntimeTransform {
  readonly localToWorld: ParticleMatrix;
  readonly worldToLocal: ParticleMatrix;
  readonly scalingModeScale: Vector3;
}

export interface ParticleHierarchyTransform {
  readonly rotation: Quaternion;
  readonly scale: Vector3;
}

export interface ParticleHierarchyPositionTransform extends ParticleHierarchyTransform {
  readonly position: Vector3;
}

/** Compose the emitter position through its authored parent transforms. */
export function calculateNativeParticleEmitterOrigin(
  self: ParticleHierarchyPositionTransform,
  rootToImmediateParents: readonly ParticleHierarchyPositionTransform[],
): Vector3 {
  let position = self.position;
  for (let index = rootToImmediateParents.length - 1; index >= 0; index -= 1) {
    const parent = rootToImmediateParents[index]!;
    const rotated = applyColumns(scaledColumns(parent), position);
    position = [add(parent.position[0], rotated[0]), add(parent.position[1], rotated[1]), add(parent.position[2], rotated[2])];
  }
  return position;
}

// Reverse BND-C83: runtime68 -> worker128 -> 12CEDFC..12CEE68.
// This is the pre-pivot world point, with the original matrix preparation and
// X + (Y + (Z + translation)) grouping. Mode1 does not normalize its quaternion.
export function calculateNativeParticleWorldPosition(
  self: ParticleHierarchyPositionTransform,
  rootToImmediateParents: readonly ParticleHierarchyPositionTransform[],
  scalingMode: 0 | 1,
  localPosition: Vector3,
): Vector3 {
  const transform = calculateNativeParticleRuntimeTransform(self, rootToImmediateParents, scalingMode);
  return applyNativeParticleMatrixPoint(transform.localToWorld, localPosition);
}

// Reverse BND-C81/C85: complete runtime68/212/348 preparation for selector0.
export function calculateNativeParticleRuntimeTransform(
  self: ParticleHierarchyPositionTransform,
  rootToImmediateParents: readonly ParticleHierarchyPositionTransform[],
  scalingMode: 0 | 1,
): ParticleRuntimeTransform {
  let basis: Columns;
  if (scalingMode === 0) {
    basis = scaledColumns(self);
    for (let index = rootToImmediateParents.length - 1; index >= 0; index -= 1) {
      const parent = scaledColumns(rootToImmediateParents[index]!);
      basis = [applyColumns(parent, basis[0]), applyColumns(parent, basis[1]), applyColumns(parent, basis[2])];
    }
  } else {
    let rotation = self.rotation;
    for (let index = rootToImmediateParents.length - 1; index >= 0; index -= 1) {
      const parent = rootToImmediateParents[index]!;
      const sx = scaleSign(parent.scale[0]);
      const sy = scaleSign(parent.scale[1]);
      const sz = scaleSign(parent.scale[2]);
      rotation = multiplyNativeQuaternions(parent.rotation, [
        rotation[0] * (sy * sz), rotation[1] * (sx * sz), rotation[2] * (sx * sy), rotation[3],
      ]);
    }
    basis = scaledColumns({ rotation, scale: self.scale });
  }
  const origin = calculateNativeParticleEmitterOrigin(self, rootToImmediateParents);
  // Affine transforms have zero in the three basis W components.
  const localToWorld: ParticleMatrix = [
    ...basis[0], 0,
    ...basis[1], 0,
    ...basis[2], 0,
    ...origin, 1,
  ];
  return {
    localToWorld,
    worldToLocal: inverseNativeParticleMatrix(localToWorld),
    scalingModeScale: scalingMode === 0
      ? calculateNativeParticleHierarchyScale(self, rootToImmediateParents) : self.scale,
  };
}

export function applyNativeParticleMatrixPoint(matrix: ParticleMatrix, position: Vector3): Vector3 {
  const component = (axis: 0 | 1 | 2) => add(
    mul(position[0], matrix[axis]!),
    add(mul(position[1], matrix[4 + axis]!), add(mul(position[2], matrix[8 + axis]!), matrix[12 + axis]!)),
  );
  return [component(0), component(1), component(2)];
}

export function applyNativeParticleMatrixVector(matrix: ParticleMatrix, vector: Vector3): Vector3 {
  const component = (axis: 0 | 1 | 2) => add(
    mul(vector[0], matrix[axis]!),
    add(mul(vector[1], matrix[4 + axis]!), mul(vector[2], matrix[8 + axis]!)),
  );
  return [component(0), component(1), component(2)];
}

// 107D950: a world-space module in local simulation uses inverse columns
// scaled by runtime348 before those columns multiply the sampled vector.
export function applyNativeParticleWorldModuleVector(transform: ParticleRuntimeTransform, vector: Vector3): Vector3 {
  const matrix = transform.worldToLocal;
  const component = (axis: 0 | 1 | 2) => add(
    mul(vector[0], mul(matrix[axis]!, transform.scalingModeScale[0])),
    add(mul(vector[1], mul(matrix[4 + axis]!, transform.scalingModeScale[1])),
      mul(vector[2], mul(matrix[8 + axis]!, transform.scalingModeScale[2]))),
  );
  return [component(0), component(1), component(2)];
}

function inverseNativeParticleMatrix(matrix: ParticleMatrix): ParticleMatrix {
  const [a, b, c] = [0, 4, 8].map((offset) => matrix.slice(offset, offset + 3)) as [number[], number[], number[]];
  // EF6F98: each determinant term rounds both products before subtraction.
  const x = sub(mul(mul(a[0]!, b[1]!), c[2]!), mul(mul(a[0]!, b[2]!), c[1]!));
  const y = sub(mul(mul(a[1]!, b[2]!), c[0]!), mul(mul(a[1]!, b[0]!), c[2]!));
  const z = sub(mul(mul(a[2]!, b[0]!), c[1]!), mul(mul(a[2]!, b[1]!), c[0]!));
  const determinant = add(z, add(x, y));
  // The squared Float32 is promoted before comparison with the Float64 literal.
  if (!(mul(determinant, determinant) >= 1e-25)) return Array<number>(16).fill(0);
  const inverse = f32(1 / determinant);
  const cofactors = (left: readonly number[], right: readonly number[], scale: number): Vector3 => [
    mul(sub(mul(left[1]!, right[2]!), mul(left[2]!, right[1]!)), scale),
    mul(sub(mul(left[0]!, right[2]!), mul(left[2]!, right[0]!)), -scale),
    mul(sub(mul(left[0]!, right[1]!), mul(left[1]!, right[0]!)), scale),
  ];
  const rows = [cofactors(b, c, inverse), cofactors(a, c, -inverse), cofactors(a, b, inverse)];
  const zero = mul(0, inverse);
  const result = [
    rows[0]![0], rows[1]![0], rows[2]![0], zero,
    rows[0]![1], rows[1]![1], rows[2]![1], zero,
    rows[0]![2], rows[1]![2], rows[2]![2], zero,
  ];
  for (let axis = 0; axis < 3; axis += 1) result.push(-add(
    mul(result[8 + axis]!, matrix[14]!),
    add(mul(result[axis]!, matrix[12]!), mul(result[4 + axis]!, matrix[13]!)),
  ));
  result.push(1);
  return result;
}

export function calculateNativeParticleHierarchyScale(
  self: ParticleHierarchyTransform,
  rootToImmediateParents: readonly ParticleHierarchyTransform[],
): Vector3 {
  let rotation = self.rotation;
  for (let index = rootToImmediateParents.length - 1; index >= 0; index -= 1) {
    const parent = rootToImmediateParents[index]!;
    const sx = scaleSign(parent.scale[0]);
    const sy = scaleSign(parent.scale[1]);
    const sz = scaleSign(parent.scale[2]);
    rotation = multiplyNativeQuaternions(parent.rotation, [
      rotation[0] * (sy * sz), rotation[1] * (sx * sz), rotation[2] * (sx * sy), rotation[3],
    ]);
  }
  const inverseRotation = rotationColumns([-rotation[0], -rotation[1], -rotation[2], rotation[3]]);
  let world = scaledColumns(self);
  for (let index = rootToImmediateParents.length - 1; index >= 0; index -= 1) {
    const parent = scaledColumns(rootToImmediateParents[index]!);
    world = [applyColumns(parent, world[0]), applyColumns(parent, world[1]), applyColumns(parent, world[2])];
  }
  // 0x10892A8..0x10892E8: retain only the three diagonal lanes.
  return [
    applyColumns(inverseRotation, world[0])[0],
    applyColumns(inverseRotation, world[1])[1],
    applyColumns(inverseRotation, world[2])[2],
  ];
}

// Reverse BND-C33: 0x108838C / 0x1088C8C -> 0x107A0DC -> 0x12CEC50.
// The Local billboard worker scales rows of its selected basis. Its Hierarchy
// branch selects the full matrix and replaces the separate scale with one.
export function calculateNativeParticleLocalBillboardBasis(
  self: ParticleHierarchyTransform,
  rootToImmediateParents: readonly ParticleHierarchyTransform[],
  scalingMode: 0 | 1,
): Columns {
  let basis: Columns;
  let scale: Vector3;
  if (scalingMode === 0) {
    basis = scaledColumns(self);
    for (let index = rootToImmediateParents.length - 1; index >= 0; index -= 1) {
      const parent = scaledColumns(rootToImmediateParents[index]!);
      basis = [applyColumns(parent, basis[0]), applyColumns(parent, basis[1]), applyColumns(parent, basis[2])];
    }
    scale = [1, 1, 1];
  } else {
    let rotation = self.rotation;
    for (let index = rootToImmediateParents.length - 1; index >= 0; index -= 1) {
      const parent = rootToImmediateParents[index]!;
      const sx = scaleSign(parent.scale[0]);
      const sy = scaleSign(parent.scale[1]);
      const sz = scaleSign(parent.scale[2]);
      rotation = multiplyNativeQuaternions(parent.rotation, [
        rotation[0] * (sy * sz), rotation[1] * (sx * sz), rotation[2] * (sx * sy), rotation[3],
      ]);
    }
    const squaredLength = add(
      add(mul(rotation[0], rotation[0]), mul(rotation[1], rotation[1])),
      add(mul(rotation[2], rotation[2]), mul(rotation[3], rotation[3])),
    );
    const length = f32(Math.sqrt(squaredLength));
    // Original threshold 0x0DA24260 and identity literal 0x155A70.
    const normalized: Quaternion = squaredLength > f32(1e-30)
      ? [f32(rotation[0] / length), f32(rotation[1] / length), f32(rotation[2] / length), f32(rotation[3] / length)]
      : [0, 0, 0, 1];
    basis = rotationColumns(normalized);
    scale = self.scale;
  }
  const diagonal: Columns = [[scale[0], 0, 0], [0, scale[1], 0], [0, 0, scale[2]]];
  return [applyColumns(diagonal, basis[0]), applyColumns(diagonal, basis[1]), applyColumns(diagonal, basis[2])];
}

// Reverse BND-C36: current source GameCamera -> 0x107A0DC -> View worker.
export function calculateNativeParticleViewBillboardBasis(scale: Vector3): Columns {
  return [[scale[0], 0, 0], [0, scale[1], 0], [0, 0, -scale[2]]];
}

function scaleSign(value: number): number {
  return value < 0 ? -1 : 1;
}

function multiplyNativeQuaternions(parent: Quaternion, child: Quaternion): Quaternion {
  const [a, b, c, d] = parent;
  const [x, y, z, w] = child;
  return [
    f32(d * x + a * w + b * z - c * y),
    f32(d * y - a * z + b * w + c * x),
    f32(d * z + a * y - b * x + c * w),
    f32(d * w - a * x - b * y - c * z),
  ];
}

function rotationColumns(q: Quaternion): Columns {
  const [x, y, z, w] = q;
  // Literal-vector multiplications precede component products in the source.
  const x2 = mul(2, x); const nx2 = mul(-2, x);
  const y2 = mul(2, y); const ny2 = mul(-2, y);
  const z2 = mul(2, z); const nz2 = mul(-2, z);
  return [
    [add(add(mul(y, ny2), mul(z, nz2)), 1), add(add(mul(x, y2), mul(w, z2)), 0), add(add(mul(w, ny2), mul(x, z2)), 0)],
    [add(add(mul(w, nz2), mul(y, x2)), 0), add(add(mul(z, nz2), mul(x, nx2)), 1), add(add(mul(y, z2), mul(w, x2)), 0)],
    [add(add(mul(z, x2), mul(w, y2)), 0), add(add(mul(w, nx2), mul(z, y2)), 0), add(add(mul(x, nx2), mul(y, ny2)), 1)],
  ];
}

function scaledColumns(transform: ParticleHierarchyTransform): Columns {
  const columns = rotationColumns(transform.rotation);
  return [
    scaleColumn(columns[0], transform.scale[0]),
    scaleColumn(columns[1], transform.scale[1]),
    scaleColumn(columns[2], transform.scale[2]),
  ];
}

function scaleColumn(column: Vector3, scale: number): Vector3 {
  return [mul(column[0], scale), mul(column[1], scale), mul(column[2], scale)];
}

function applyColumns(columns: Columns, value: Vector3): Vector3 {
  const component = (axis: 0 | 1 | 2) => add(
    mul(columns[0][axis]!, value[0]),
    add(mul(columns[1][axis]!, value[1]), mul(columns[2][axis]!, value[2])),
  );
  return [component(0), component(1), component(2)];
}

function mul(a: number, b: number): number { return f32(a * b); }
function add(a: number, b: number): number { return f32(a + b); }
function sub(a: number, b: number): number { return f32(a - b); }
