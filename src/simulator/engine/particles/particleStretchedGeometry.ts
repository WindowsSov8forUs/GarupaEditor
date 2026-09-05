import estimateTable from "./arm64ReciprocalSqrtEstimate.json";

// Reverse simulator-stretched-particle-worker-reaudit-10-1-4, STR-W03..W07.
// The table executes the source FRSQRTE opcode; it is not a device capture.
const estimates = Object.freeze(estimateTable.estimateBits);
const words = new DataView(new ArrayBuffer(4));
const f32 = Math.fround;
const MIN_SQUARED_LENGTH = fromBits(0x0da24260);
const ESTIMATE_CORRECTION = fromBits(0x3f804020);
type Vector3 = readonly [number, number, number];

export interface NativeStretchArithmeticInput {
  readonly cameraPosition: Vector3;
  readonly cameraVelocity: Vector3;
  readonly sizeY: number;
  readonly scaledLength: number;
  readonly velocityScale: number;
  readonly halfWidth: number;
}

export interface NativeStretchArithmetic {
  readonly tail: Vector3;
  readonly sideXY: readonly [number, number];
}

/** Current non-Freeform head/tail arithmetic; no centered-quad or roll fallback. */
export function calculateNativeStretchArithmetic(input: NativeStretchArithmeticInput): NativeStretchArithmetic {
  const p = input.cameraPosition;
  const v = input.cameraVelocity;
  const speedSquared = f32(f32(v[0] * v[0]) + f32(f32(v[1] * v[1]) + f32(v[2] * v[2])));
  const inverseSpeed = speedSquared > MIN_SQUARED_LENGTH
    ? f32(reciprocalSqrtEstimate(speedSquared) * ESTIMATE_CORRECTION)
    : 0;
  const stretch = f32(input.velocityScale + f32(f32(input.scaledLength * input.sizeY) * inverseSpeed));
  const tail: Vector3 = [
    f32(p[0] - f32(v[0] * stretch)),
    f32(p[1] - f32(v[1] * stretch)),
    f32(p[2] - f32(v[2] * stretch)),
  ];
  const x = f32(f32(p[2] * tail[1]) - f32(p[1] * tail[2]));
  const y = f32(f32(p[0] * tail[2]) - f32(p[2] * tail[0]));
  const sideSquared = f32(f32(x * x) + f32(y * y));
  if (sideSquared <= MIN_SQUARED_LENGTH) {
    return { tail, sideXY: [0, 0] };
  }
  let inverseSide = reciprocalSqrtEstimate(sideSquared);
  // FRSQRTS computes (3 - a*b)/2 before its Float32 rounding. Do not
  // substitute Math.sqrt or add another intermediate product rounding.
  inverseSide = f32(inverseSide * f32((3 - f32(sideSquared * inverseSide) * inverseSide) / 2));
  inverseSide = f32(inverseSide * f32((3 - f32(sideSquared * inverseSide) * inverseSide) / 2));
  return {
    tail,
    sideXY: [f32(input.halfWidth * f32(x * inverseSide)), f32(input.halfWidth * f32(y * inverseSide))],
  };
}

function reciprocalSqrtEstimate(value: number): number {
  words.setFloat32(0, value, true);
  const bits = words.getUint32(0, true);
  const exponent = ((bits >>> 23) & 255) - 127;
  const halfExponent = Math.floor(exponent / 2);
  const parity = exponent - halfExponent * 2;
  const bin = parity * 256 + ((bits & 0x7fffff) >>> 15);
  return fromBits(estimates[bin]! - halfExponent * 0x800000);
}

function fromBits(bits: number): number {
  words.setUint32(0, bits, true);
  return words.getFloat32(0, true);
}
