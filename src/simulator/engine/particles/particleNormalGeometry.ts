import estimateTable from "./arm64ReciprocalSqrtEstimate.json";

type Vector3 = readonly [number, number, number];
const words = new DataView(new ArrayBuffer(4));
const f32 = Math.fround;
const mul = (a: number, b: number): number => f32(f32(a) * f32(b));
const add = (a: number, b: number): number => f32(f32(a) + f32(b));
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
