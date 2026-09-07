// Reverse BND-C29/C32, libunity 10.1.4/230 ARM64 0x1089018..0x10892EF.
// Preserve its Float32 grouping, sign-bit adjustment and diagonal selection.
// This is not a componentwise scale product or a generic lossyScale operation.
const f32 = Math.fround;
type Vector3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];
type Columns = readonly [Vector3, Vector3, Vector3];

export interface ParticleHierarchyTransform {
  readonly rotation: Quaternion;
  readonly scale: Vector3;
}

export interface ParticleHierarchyPositionTransform extends ParticleHierarchyTransform {
  readonly position: Vector3;
}

// Reverse BND-C81: 108834C, descriptor selector0, runtime translation+116.
export function calculateNativeParticleEmitterOrigin(
  self: ParticleHierarchyPositionTransform,
  rootToImmediateParents: readonly ParticleHierarchyPositionTransform[],
  scalingMode: 0 | 1,
): Vector3 {
  let position = self.position;
  for (let index = rootToImmediateParents.length - 1; index >= 0; index -= 1) {
    const parent = rootToImmediateParents[index]!;
    let rotated: Vector3;
    if (scalingMode === 0) {
      rotated = applyColumns(scaledColumns(parent), position);
    } else {
      // 1088AF4..1088B58: retain the delta columns and their subtraction
      // order; adding identity to a rotation matrix first rounds differently.
      const [x, y, z, w] = parent.rotation;
      const x2 = mul(2, x); const nx2 = mul(-2, x);
      const y2 = mul(2, y); const ny2 = mul(-2, y);
      const z2 = mul(2, z); const nz2 = mul(-2, z);
      const delta: Columns = [
        [sub(mul(y, ny2), mul(z, z2)), sub(mul(x, y2), mul(w, nz2)), sub(mul(w, ny2), mul(x, nz2))],
        [sub(mul(w, nz2), mul(y, nx2)), sub(mul(z, nz2), mul(x, x2)), sub(mul(y, z2), mul(w, nx2))],
        [sub(mul(z, x2), mul(w, ny2)), sub(mul(w, nx2), mul(z, ny2)), sub(mul(x, nx2), mul(y, y2))],
      ];
      const scaled: Vector3 = [mul(position[0], parent.scale[0]), mul(position[1], parent.scale[1]), mul(position[2], parent.scale[2])];
      const component = (axis: 0 | 1 | 2) => add(
        add(scaled[axis], mul(delta[0][axis], scaled[0])),
        add(mul(delta[1][axis], scaled[1]), mul(delta[2][axis], scaled[2])),
      );
      rotated = [component(0), component(1), component(2)];
    }
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
  const origin = calculateNativeParticleEmitterOrigin(self, rootToImmediateParents, scalingMode);
  const component = (axis: 0 | 1 | 2) => add(
    mul(localPosition[0], basis[0][axis]),
    add(mul(localPosition[1], basis[1][axis]), add(mul(localPosition[2], basis[2][axis]), origin[axis])),
  );
  return [component(0), component(1), component(2)];
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
  // Preserve the inverse camera's reflected Z column and signed zero lanes.
  const inverseView: Columns = [[1, -0, -0], [-0, 1, -0], [-0, -0, -1]];
  const diagonal: Columns = [[scale[0], 0, 0], [0, scale[1], 0], [0, 0, scale[2]]];
  return [applyColumns(diagonal, inverseView[0]), applyColumns(diagonal, inverseView[1]), applyColumns(diagonal, inverseView[2])];
}

function scaleSign(value: number): number {
  return value < 0 || Object.is(value, -0) ? -1 : 1;
}

function multiplyNativeQuaternions(parent: Quaternion, child: Quaternion): Quaternion {
  const [a, b, c, d] = parent;
  const [x, y, z, w] = child;
  // Native SIMD subtraction/sign-flip order, including its w-term ordering.
  return [
    -sub(sub(sub(mul(c, y), mul(b, z)), mul(d, x)), mul(a, w)),
    -sub(sub(sub(mul(a, z), mul(c, x)), mul(d, y)), mul(b, w)),
    -sub(sub(sub(mul(b, x), mul(d, z)), mul(c, w)), mul(a, y)),
    sub(sub(sub(mul(d, w), mul(a, x)), mul(c, z)), mul(b, y)),
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
