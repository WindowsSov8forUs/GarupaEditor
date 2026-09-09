import type { ParticleAnimationCurve, ParticleMinMaxCurve, ParticleShapeModule } from "../../backends/particleContracts";

type Vector3 = readonly [number, number, number];
export type ParticleBoundsTuple = readonly [number, number, number, number, number, number];
type CurveAxes = readonly [ParticleMinMaxCurve, ParticleMinMaxCurve, ParticleMinMaxCurve];
interface BoundsVelocity {
  readonly axes: CurveAxes;
  readonly inWorldSpace: boolean;
  readonly worldToLocal: readonly number[];
}
interface BoundsParticle {
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly moduleVelocity: Vector3;
  readonly baseSize: Vector3;
}
interface BoundsSettings {
  readonly renderMode: 0 | 1 | 4;
  readonly velocityScale: number;
  readonly lengthScale: number;
  readonly pivot: Vector3;
  readonly meshBounds: ParticleBoundsTuple | null;
  readonly size3D: boolean;
  readonly startSize: CurveAxes;
  readonly sizeLifetime: CurveAxes | null;
  readonly sizeBySpeed: CurveAxes | null;
  readonly runtimeSize: number;
  readonly simulationSpace: number;
  readonly scale: Vector3;
  readonly translation: Vector3;
}

const f32 = Math.fround;
const add = (a: number, b: number): number => f32(a + b);
const sub = (a: number, b: number): number => f32(a - b);
const mul = (a: number, b: number): number => f32(a * b);
const div = (a: number, b: number): number => f32(a / b);
const words = new DataView(new ArrayBuffer(4));
const numberFromBits = (value: number): number => { words.setUint32(0, value, true); return words.getFloat32(0, true); };

/** BND-C173: metric1 for the gameplay camera at (0,0,-15), with reflected view Z. */
export function calculateNativeParticleRendererSortDistance(center: Vector3, sortingFudge: number): number {
  return sub(add(-15, add(add(mul(center[0], 0), mul(center[1], 0)), mul(center[2], -1))), sortingFudge);
}

/** BND-C147/C149: actual-particle branch, including the shared size/pivot tail. */
export function calculateNativeParticleActualBounds(particles: readonly BoundsParticle[], settings: BoundsSettings): ParticleBoundsTuple {
  if (particles.length === 0) {
    const p: Vector3 = settings.simulationSpace === 1 ? settings.translation : [0, 0, 0];
    const epsilon = f32(0.00001);
    return [sub(p[0], epsilon), sub(p[1], epsilon), sub(p[2], epsilon), add(p[0], epsilon), add(p[1], epsilon), add(p[2], epsilon)];
  }
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const include = (position: Vector3): void => {
    for (let axis = 0; axis < 3; axis++) {
      lo[axis] = Math.min(lo[axis]!, position[axis]!);
      hi[axis] = Math.max(hi[axis]!, position[axis]!);
    }
  };
  for (const particle of particles) {
    include(particle.position);
    if (settings.renderMode !== 1) continue;
    // Bounds reads base + module velocity without the renderer's speed modifier.
    const v = particle.velocity.map((value, axis) => add(value, particle.moduleVelocity[axis]!));
    const squared = add(mul(v[0]!, v[0]!), add(mul(v[1]!, v[1]!), mul(v[2]!, v[2]!)));
    const inverse = squared > numberFromBits(0x0da24260) ? f32(1 / Math.sqrt(squared)) : 0;
    const length = add(f32(settings.velocityScale), mul(particle.baseSize[0], mul(f32(settings.lengthScale), inverse)));
    include(particle.position.map((value, axis) => sub(value, mul(v[axis]!, length))) as unknown as Vector3);
  }
  return expandNativeParticleBounds(lo, hi, settings);
}

function expandNativeParticleBounds(lo: readonly number[], hi: readonly number[], settings: BoundsSettings): ParticleBoundsTuple {
  let coefficients = [1, 1, 1];
  if (settings.renderMode === 4 && settings.meshBounds !== null) {
    coefficients = [0, 1, 2].map((axis) => {
      const bound = Math.max(Math.abs(settings.meshBounds![axis]!), Math.abs(settings.meshBounds![axis + 3]!));
      return add(bound, bound);
    });
    if (!settings.size3D) coefficients[0] = Math.max(...coefficients);
  }
  let maximum = 0;
  for (let axis = 0; axis < (settings.size3D ? 3 : 1); axis++) {
    let upper = minMaxRange(settings.startSize[axis]!)[1];
    if (settings.sizeLifetime !== null) upper = mul(upper, minMaxRange(settings.sizeLifetime[axis]!)[1]);
    if (settings.sizeBySpeed !== null) upper = mul(upper, minMaxRange(settings.sizeBySpeed[axis]!)[1]);
    if (settings.renderMode === 4) upper = mul(upper, coefficients[axis]!);
    if (maximum < upper) maximum = upper;
  }
  if (maximum < settings.runtimeSize) maximum = settings.runtimeSize;
  const pivot = mul(maximum, Math.max(...settings.pivot.map(Math.abs)));
  let radius = mul(maximum, f32(0.71));
  if (settings.simulationSpace === 1 || settings.simulationSpace === 2) radius = mul(radius, Math.max(...settings.scale.map(Math.abs)));
  return [...lo.map((value) => sub(sub(value, pivot), radius)), ...hi.map((value) => add(add(value, pivot), radius))] as unknown as ParticleBoundsTuple;
}

/** BND-C157/C167: analytic local bounds with optional source constant local force. */
export function calculateNativeParticleLinearAnalyticBounds(
  lifetime: ParticleMinMaxCurve, speed: ParticleMinMaxCurve, initialSize3D: boolean, settings: BoundsSettings,
  force: CurveAxes | null = null,
  velocity: BoundsVelocity | null = null,
): ParticleBoundsTuple {
  const lifetimeMaximum = minMaxRange(lifetime)[1], speedRange = minMaxRange(speed);
  const distance = speedRange.map((value) => mul(value, lifetimeMaximum));
  const lo = [0, 0, Math.min(0, ...distance)], hi = [0, 0, Math.max(0, ...distance)];
  extendNativeParticleVelocityBounds(lo, hi, lifetimeMaximum, velocity);
  if (force !== null) {
    for (let axis = 0; axis < 3; axis++) {
      const half = mul(force[axis]!.scalar, 0.5);
      // Original 1044520 multiplies by lifetime twice, rounding after each operation.
      const lower = mul(mul(Math.min(half, 0), lifetimeMaximum), lifetimeMaximum);
      const upper = mul(mul(Math.max(half, 0), lifetimeMaximum), lifetimeMaximum);
      lo[axis] = Math.min(lo[axis]!, add(lo[axis]!, lower));
      hi[axis] = Math.max(hi[axis]!, add(hi[axis]!, upper));
    }
  }
  return finishNativeParticleAnalyticBounds(lo, hi, speedRange[1], initialSize3D, settings);
}

/** BND-C169: complete constant-axis interval and zero-translation world conversion. */
function extendNativeParticleVelocityBounds(lo: number[], hi: number[], lifetime: number, velocity: BoundsVelocity | null): void {
  if (velocity === null) return;
  const ranges = velocity.axes.map((curve) => nativeBoundsVelocityRange(curve).map((value) => mul(value, lifetime)));
  let lower = ranges.map((range) => range[0]!), upper = ranges.map((range) => range[1]!);
  if (velocity.inWorldSpace) {
    const bounds = [...lower, ...upper], matrix = velocity.worldToLocal;
    lower = [Infinity, Infinity, Infinity]; upper = [-Infinity, -Infinity, -Infinity];
    for (const corner of [[0, 1, 2], [3, 1, 2], [3, 4, 2], [0, 4, 2], [0, 1, 5], [3, 1, 5], [3, 4, 5], [0, 4, 5]]) {
      for (let axis = 0; axis < 3; axis++) {
        const value = add(0, add(add(mul(matrix[axis]!, bounds[corner[0]!]!),
          mul(matrix[axis + 4]!, bounds[corner[1]!]!)), mul(matrix[axis + 8]!, bounds[corner[2]!]!)));
        if (value < lower[axis]!) lower[axis] = value;
        if (upper[axis]! < value) upper[axis] = value;
      }
    }
  }
  for (let axis = 0; axis < 3; axis++) {
    const left = add(lo[axis]!, lower[axis]!), right = add(hi[axis]!, upper[axis]!);
    if (left < lo[axis]!) lo[axis] = left;
    if (hi[axis]! < right) hi[axis] = right;
  }
}

/** C171: source mode1 two-key cached/general integrated ranges. */
function nativeBoundsVelocityRange(value: ParticleMinMaxCurve): readonly [number, number] {
  if (value.minMaxState === 0) return minMaxRange(value);
  const [left, right] = value.maxCurve.m_Curve;
  const width = Math.max(sub(right!.time, left!.time), f32(0.0001));
  const inverse = div(1, width), square = mul(inverse, inverse), difference = sub(right!.value, left!.value);
  const outgoing = mul(left!.outSlope as number, width), incoming = mul(width, right!.inSlope as number);
  const coefficients = [
    mul(inverse, mul(square, sub(sub(add(outgoing, incoming), difference), difference))),
    mul(square, sub(sub(sub(add(difference, add(difference, difference)), outgoing), outgoing), incoming)),
    f32(left!.outSlope as number), f32(left!.value),
  ].map((coefficient) => mul(coefficient, value.scalar));
  const integrate = (raw: readonly number[]): number[] => raw.map((coefficient, axis) => mul(coefficient, [0.25, f32(1 / 3), 0.5, 1][axis]!));
  const first = integrate(coefficients);
  const cached = Math.abs(sub(right!.time, 1)) <= f32(0.0001);
  const second = cached ? first : integrate([0, 0, 0, mul(right!.value, value.scalar)]);
  const split = cached ? 1 : f32(right!.time), end = cached ? 1 : numberFromBits(0x3f8147ae);
  const polynomial = (c: readonly number[], t: number): number => mul(t, add(c[3]!, mul(t, add(c[2]!, mul(t, add(c[1]!, mul(t, c[0]!)))))));
  const prefix = polynomial(first, split);
  const evaluate = (time: number): number => cached
    ? add(polynomial(first, Math.min(time, split)), polynomial(second, Math.max(sub(time, split), 0)))
    : time <= split ? polynomial(first, time) : add(prefix, polynomial(second, sub(time, split)));
  let lo = 0, hi = 0;
  const include = (time: number): void => { const v = evaluate(time); lo = Math.min(lo, v); hi = Math.max(hi, v); };
  for (let segment = 0; segment < 2; segment++) {
    const c = segment === 0 ? first : second, start = segment === 0 ? 0 : split, stop = segment === 0 ? split : end;
    const roots = nativeBoundsIntegralRoots(mul(c[0]!, 4), mul(c[1]!, 3), mul(c[2]!, 2), c[3]!);
    for (const root of roots) { const time = add(root, start); if (time >= start && time < stop) include(time); }
    include(stop);
  }
  return [lo, hi];
}

/** C171 original EF8374: binary64 cubic reduction, then binary32 deflation. */
function nativeBoundsIntegralRoots(a: number, b: number, c: number, d: number): number[] {
  const quadratic = (aa: number, bb: number, cc: number): number[] => {
    if (Math.abs(aa) < f32(0.00001)) return Math.abs(bb) > f32(0.00001) ? [div(-cc, bb)] : [];
    const discriminant = add(mul(bb, bb), mul(mul(aa, -4), cc));
    if (discriminant < 0) return [];
    const root = f32(Math.sqrt(discriminant)), factor = div(0.5, aa);
    return [mul(factor, sub(root, bb)), mul(factor, sub(-root, bb))];
  };
  if (Math.abs(a) < f32(0.0001)) return quadratic(f32(b), f32(c), f32(d));
  const third = 1 / 3, shift = (b / a) * third, normalized = c / a;
  const p = normalized * third - shift * shift;
  const q = (d / a) * 0.5 + (shift * (shift * shift) - (shift * normalized) * 0.5);
  const cube = p * (p * p), discriminant = cube + q * q;
  let root: number;
  if (discriminant <= 0) {
    const magnitude = Math.sqrt(-cube), angle = Math.acos(-q / magnitude), power = Math.pow(magnitude, third);
    const scale = power - p / power;
    const r0 = scale * Math.cos(angle * third) - shift;
    const r1 = scale * Math.cos((angle + f32(2 * Math.PI)) * third) - shift;
    const r2 = scale * Math.cos((angle + f32(4 * Math.PI)) * third) - shift;
    root = Math.max(r0, r1, r2);
  } else {
    const x = Math.sqrt(discriminant) - q;
    const power = x <= 0 ? -Math.pow(-x, third) : Math.pow(x, third);
    root = power + (-shift - p / power);
  }
  root = f32(root);
  return [root, ...quadratic(f32(a), f32(root * a + b), f32((root * b + c) + (root * a) * root))];
}

function finishNativeParticleAnalyticBounds(
  lo: number[], hi: number[], speedMaximum: number, initialSize3D: boolean, settings: BoundsSettings,
): ParticleBoundsTuple {
  if (settings.renderMode === 1) {
    // This branch selects Initial.size3D, independently of the SoA storage flag.
    const size = minMaxRange(settings.startSize[initialSize3D ? 1 : 0])[1];
    let length = Math.abs(f32(settings.velocityScale));
    if (speedMaximum > f32(0.000001)) length = add(length, div(mul(Math.abs(f32(settings.lengthScale)), size), speedMaximum));
    const stretch = mul(speedMaximum, length);
    for (let axis = 0; axis < 3; axis++) { lo[axis] = sub(lo[axis]!, stretch); hi[axis] = add(hi[axis]!, stretch); }
  }
  return expandNativeParticleBounds(lo, hi, settings);
}

/** BND-C161/C165/C169: source zero-rotation Shape and optional constant Velocity. */
export function calculateNativeParticleShapeAnalyticBounds(
  lifetime: ParticleMinMaxCurve, speed: ParticleMinMaxCurve, initialSize3D: boolean,
  shape: ParticleShapeModule, runtimeShapeScale: Vector3, settings: BoundsSettings,
  velocity: BoundsVelocity | null = null,
): ParticleBoundsTuple {
  const speedRange = minMaxRange(speed), lifetimeMaximum = minMaxRange(lifetime)[1];
  const distances = speedRange.map((value) => mul(value, lifetimeMaximum));
  let radius = f32(shape.radius.value);
  const cone = shape.type === 4 || shape.type === 8;
  const sine = cone ? nativeBoundsSine(mul(shape.angle, numberFromBits(0x3c8efa35))) : 0;
  if (shape.type === 8) radius = add(radius, mul(shape.length, sine));
  const half = shape.type === 5 ? [0.5, 0.5, 0.5] : shape.type === 0 ? [radius, radius, radius] : [radius, radius, f32(0.1)];
  const shapeScale: Vector3 = [shape.m_Scale.x, shape.m_Scale.y, shape.m_Scale.z];
  const position: Vector3 = [shape.m_Position.x, shape.m_Position.y, shape.m_Position.z];
  const transform = (bounds: readonly number[], scale: Vector3, translation: Vector3): number[] => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    // 76F720 retains corner order and translation + ((X + Y) + Z).
    for (const corner of [[0, 1, 2], [3, 1, 2], [3, 4, 2], [0, 4, 2], [0, 1, 5], [3, 1, 5], [3, 4, 5], [0, 4, 5]]) {
      for (let axis = 0; axis < 3; axis++) {
        const terms = corner.map((index, column) => mul(mul(axis === column ? 1 : 0, scale[column]!), bounds[index]!));
        const value = add(translation[axis]!, add(add(terms[0]!, terms[1]!), terms[2]!));
        if (value < lo[axis]!) lo[axis] = value;
        if (hi[axis]! < value) hi[axis] = value;
      }
    }
    return [...lo, ...hi];
  };
  // The registered cone-volume source has angle zero, so native sincosf stores0/1.
  const sourceBounds = cone ? [-radius, -radius, -0, radius, radius, shape.type === 8 ? mul(shape.length, 1) : 0]
    : [...half.map((v) => -v), ...half];
  const bounds = transform(sourceBounds, shapeScale, position)
    .map((value, axis) => mul(value, runtimeShapeScale[axis % 3]!));
  const randomDirection = shape.randomDirectionAmount > 0;
  const directionBounds = cone && (!randomDirection || shape.type === 4) ? [-sine, -sine, 0, sine, sine, 1]
    : shape.type === 5 && !randomDirection ? [0, 0, 0, 0, 0, 1] : [-1, -1, -1, 1, 1, 1];
  const direction = transform(directionBounds, [1, 1, 1], [0, 0, 0]);
  if (randomDirection && shape.type !== 4) { distances[0] = Math.abs(distances[0]!); distances[1] = Math.abs(distances[1]!); }
  const lo = bounds.slice(0, 3), hi = bounds.slice(3);
  for (let axis = 0; axis < 3; axis++) {
    lo[axis] = Math.min(lo[axis]!, add(lo[axis]!, mul(distances[1]!, direction[axis]!)));
    hi[axis] = Math.max(hi[axis]!, add(hi[axis]!, mul(distances[1]!, direction[axis + 3]!)));
    // The lower-distance interval is unioned directly, without adding Shape position.
    const left = mul(direction[axis]!, distances[0]!), right = mul(direction[axis + 3]!, distances[0]!);
    lo[axis] = Math.min(lo[axis]!, left, right); hi[axis] = Math.max(hi[axis]!, left, right);
  }
  extendNativeParticleVelocityBounds(lo, hi, lifetimeMaximum, velocity);
  return finishNativeParticleAnalyticBounds(lo, hi, speedRange[1], initialSize3D, settings);
}

function nativeBoundsSine(value: number): number { return f32(Math.sin(value)); }

/** BND-C153: ordinary renderer output is center/extents, not corner union. */
export function calculateNativeParticleWorldBounds(
  bounds: ParticleBoundsTuple, matrix: readonly number[], scale: Vector3, space: number, alignment: number,
): ParticleBoundsTuple {
  const center = [0, 1, 2].map((axis) => mul(add(bounds[axis]!, bounds[axis + 3]!), 0.5));
  const extent = [0, 1, 2].map((axis) => mul(sub(bounds[axis + 3]!, bounds[axis]!), 0.5));
  if (space === 1) return [...center, ...extent] as unknown as ParticleBoundsTuple;
  const factors = [1, 1, 1];
  if (space !== 2 && alignment <= 3 && alignment !== 2) {
    const maximum = Math.max(...scale.map(Math.abs));
    for (let axis = 0; axis < 3; axis++) if (Math.abs(scale[axis]!) > numberFromBits(0x3089705f)) factors[axis] = div(maximum, scale[axis]!);
  }
  const worldCenter = [0, 1, 2].map((axis) => add(matrix[12 + axis]!, add(mul(matrix[axis]!, center[0]!),
    add(mul(matrix[4 + axis]!, center[1]!), mul(matrix[8 + axis]!, center[2]!)))));
  const worldExtent = [0, 1, 2].map((axis) => add(add(
    Math.abs(mul(mul(matrix[axis]!, factors[0]!), extent[0]!)),
    Math.abs(mul(mul(matrix[4 + axis]!, factors[1]!), extent[1]!))),
  Math.abs(mul(mul(matrix[8 + axis]!, factors[2]!), extent[2]!))));
  return [...worldCenter, ...worldExtent] as unknown as ParticleBoundsTuple;
}

function minMaxRange(value: ParticleMinMaxCurve): readonly [number, number] {
  const scalar = f32(value.scalar);
  if (value.minMaxState === 0) return scalar <= 0 ? [scalar, 0] : [0, scalar];
  if (value.minMaxState === 3) {
    const minimum = f32(value.minScalar);
    return scalar <= minimum ? [scalar, minimum] : [minimum, scalar];
  }
  let range = curveRange(value.maxCurve, [Infinity, -Infinity]);
  if (value.minMaxState === 2) range = curveRange(value.minCurve, range);
  return [mul(range[0], scalar), mul(range[1], scalar)];
}

function curveRange(curve: ParticleAnimationCurve, initial: readonly [number, number]): readonly [number, number] {
  let lo = initial[0], hi = initial[1];
  const include = (value: number): void => { lo = Math.min(lo, value); hi = Math.max(hi, value); };
  const keys = curve.m_Curve;
  if (keys.length === 0) return initial;
  include(f32(keys[0]!.value));
  for (let index = 0; index + 1 < keys.length; index++) {
    const left = keys[index]!, right = keys[index + 1]!;
    const width = Math.max(sub(right.time, left.time), f32(0.0001));
    const inverse = div(1, width), square = mul(inverse, inverse), difference = sub(right.value, left.value);
    let a = 0, b = 0, c = 0, d = f32(left.value);
    if (left.outSlope === "number:+infinity" || right.inSlope === "number:+infinity") {
      d = f32(left.value);
    } else if (left.outSlope === "number:-infinity" || right.inSlope === "number:-infinity") {
      d = f32(right.value);
    } else {
      const outgoing = mul(left.outSlope, width), incoming = mul(width, right.inSlope);
      a = mul(inverse, mul(square, sub(sub(add(outgoing, incoming), difference), difference)));
      b = mul(square, sub(sub(sub(add(difference, add(difference, difference)), outgoing), outgoing), incoming));
      c = f32(left.outSlope);
    }
    const evaluate = (time: number): number => add(d, mul(time, add(c, mul(time, add(b, mul(a, time))))));
    const quadratic = mul(a, 3), linear = add(b, b), roots: number[] = [];
    if (Math.abs(quadratic) < f32(0.00001)) {
      if (Math.abs(linear) > f32(0.00001)) roots.push(div(-c, linear));
    } else {
      const discriminant = add(mul(linear, linear), mul(mul(quadratic, -4), c));
      if (discriminant >= 0) {
        const root = f32(Math.sqrt(discriminant)), factor = div(0.5, quadratic);
        roots.push(mul(factor, sub(root, linear)), mul(factor, sub(-root, linear)));
      }
    }
    for (const time of roots) if (time >= 0 && add(left.time, time) < right.time) include(evaluate(time));
    include(evaluate(sub(right.time, left.time)));
  }
  return [lo, hi];
}
