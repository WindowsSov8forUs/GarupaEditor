type Vector3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];
type Columns = readonly [Vector3, Vector3, Vector3];

// BND-C109: original single-mesh cache min/max, keyed by serialized mesh SHA.
// These retain Mesh.localAABB arithmetic rather than recomputing vertex bounds.
const meshBounds: Readonly<Record<string, readonly number[]>> = {
  A011B7668060DF09340E550322F72F1EA635E5C8461EA3FBFB2A6F4071FFF82A: [0xbf000000, 0xbf000000, 0xa40d3131, 0x3f000000, 0x3f000000, 0x240d3131],
  "5B2B0F8978CF1BDB6EBCD0A4A9495E3BFB9C2C3D4B9338AA8C046DC8F7A65C27": [0xbde7eab9, 0xbde7eab6, 0xbc5009d6, 0x3de7eab7, 0x3de7eaba, 0x3c400acc],
  "29EBB9C3F84AB4081B3751BA663E8BA2DA95DE0BB9397489EFF59F6460AAFB9D": [0xc0707a54, 0xc070dd7e, 0x3e30e3c0, 0x405ac954, 0x40669d02, 0x4096fb6a],
  E7E2328D60C428527F7D0B545CE86D4ED70E308E6D1025818B8BA8B86084242A: [0xbfe48bfc, 0xbfaa4096, 0xbda06c80, 0x3fbe4d66, 0x3fd1d182, 0x411ebf26],
};
const f32 = Math.fround;
const mul = (a: number, b: number): number => f32(f32(a) * f32(b));
const add = (a: number, b: number): number => f32(f32(a) + f32(b));
const sub = (a: number, b: number): number => f32(f32(a) - f32(b));

export function calculateNativeMeshPivotOffset(meshSha256: string, pivot: Vector3): Vector3 | undefined {
  const words = meshBounds[meshSha256];
  if (words === undefined) return undefined;
  const bounds = new Float32Array(new Uint32Array(words).buffer);
  const component = (axis: 0 | 1 | 2): number => {
    const half = mul(sub(bounds[axis + 3]!, bounds[axis]!), 0.5);
    const product = mul(axis === 2 ? -pivot[axis] : pivot[axis], half);
    return add(product, product);
  };
  return [component(0), component(1), component(2)];
}

function rotationColumns(q: Quaternion): Columns {
  const [x, y, z, w] = q;
  const x2 = mul(2, x); const nx2 = mul(-2, x);
  const y2 = mul(2, y); const ny2 = mul(-2, y);
  const z2 = mul(2, z); const nz2 = mul(-2, z);
  return [
    [add(add(mul(y, ny2), mul(z, nz2)), 1), add(add(mul(x, y2), mul(w, z2)), 0), add(add(mul(w, ny2), mul(x, z2)), 0)],
    [add(add(mul(w, nz2), mul(y, x2)), 0), add(add(mul(z, nz2), mul(x, nx2)), 1), add(add(mul(y, z2), mul(w, x2)), 0)],
    [add(add(mul(z, x2), mul(w, y2)), 0), add(add(mul(w, nx2), mul(z, y2)), 0), add(add(mul(x, nx2), mul(y, ny2)), 1)],
  ];
}

function apply(columns: Columns, value: Vector3): Vector3 {
  const component = (axis: 0 | 1 | 2): number => add(mul(columns[0][axis], value[0]),
    add(mul(columns[1][axis], value[1]), mul(columns[2][axis], value[2])));
  return [component(0), component(1), component(2)];
}

function scale(column: Vector3, value: number, transformScale: Vector3): Vector3 {
  return [mul(mul(column[0], transformScale[0]), value),
    mul(mul(column[1], transformScale[1]), value), mul(mul(column[2], transformScale[2]), value)];
}

export function calculateNativeMeshVertices(
  vertices: readonly Vector3[], rotation: Quaternion, size: Vector3, basis: Columns, pivot: Vector3, transformScale: Vector3,
): readonly Vector3[] {
  const rotated = rotationColumns(rotation);
  // BND-C111: Transform axes scale the matrix rows before each particle axis.
  const columns: Columns = [apply(basis, scale(rotated[0], size[0], transformScale)),
    apply(basis, scale(rotated[1], size[1], transformScale)), apply(basis, scale(rotated[2], size[2], transformScale))];
  const offset = apply(columns, pivot);
  const translation: Vector3 = [add(0, offset[0]), add(0, offset[1]), add(0, offset[2])];
  return vertices.map((vertex) => {
    const transformed = apply(columns, vertex);
    return [add(translation[0], transformed[0]), add(translation[1], transformed[1]), add(translation[2], transformed[2])];
  });
}
