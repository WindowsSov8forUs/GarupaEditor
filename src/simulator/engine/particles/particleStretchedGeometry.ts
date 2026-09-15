const f32 = Math.fround;
const MIN_SQUARED_LENGTH = 1e-30;

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
    ? f32(1 / Math.sqrt(speedSquared))
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
  const inverseSide = f32(1 / Math.sqrt(sideSquared));
  return {
    tail,
    sideXY: [f32(input.halfWidth * f32(x * inverseSide)), f32(input.halfWidth * f32(y * inverseSide))],
  };
}
