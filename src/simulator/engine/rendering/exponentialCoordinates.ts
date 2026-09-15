/** A coordinate sum, retained before clipping as coefficient * 2 ** exponent.
 * Terms preserve finite offsets when distant endpoint contributions cancel.
 * This is a drawing representation, never a replacement note clock or state. */
export type ExponentialCoordinate = readonly (readonly [exponent: number, coefficient: number])[];
export type ExponentialPoint = readonly [ExponentialCoordinate, ExponentialCoordinate];

export function coordinate(value: number, exponent = 0): ExponentialCoordinate {
  if (!Number.isFinite(value) || !Number.isFinite(exponent)) throw new Error("Non-finite coordinate coefficient or exponent.");
  if (value === 0) return [];
  const shift = Math.floor(Math.log2(Math.abs(value)));
  // Dividing in two steps also covers subnormal coefficients.
  const step = Math.max(-1022, Math.min(1023, shift));
  return Object.freeze([Object.freeze([exponent + shift, value / 2 ** step / 2 ** (shift - step)] as const)]);
}

export function coordinateAdd(...values: readonly ExponentialCoordinate[]): ExponentialCoordinate {
  const terms = new Map<number, number>();
  for (const value of values) for (const [exponent, coefficient] of value)
    terms.set(exponent, (terms.get(exponent) ?? 0) + coefficient);
  // Combine before normalizing: equal leading terms must cancel before a
  // small constant is evaluated relative to their exponent.
  return Object.freeze([...terms].filter(([, coefficient]) => coefficient !== 0).sort((a, b) => b[0] - a[0]).map(term => Object.freeze(term)));
}

export function coordinateMultiply(a: ExponentialCoordinate, b: ExponentialCoordinate): ExponentialCoordinate {
  return coordinateAdd(...a.flatMap(([ae, av]) => b.map(([be, bv]) => coordinate(av * bv, ae + be))));
}

export function coordinateScale(value: ExponentialCoordinate, scale: number): ExponentialCoordinate {
  return coordinateMultiply(value, coordinate(scale));
}

function leading(value: ExponentialCoordinate): readonly [number, number] {
  let exponent = 0, coefficient = 0;
  for (const [nextExponent, nextCoefficient] of value) {
    if (coefficient === 0) { exponent = nextExponent; coefficient = nextCoefficient; }
    else coefficient += nextCoefficient * 2 ** (nextExponent - exponent);
  }
  return [exponent, coefficient];
}

export function coordinateRatio(a: ExponentialCoordinate, b: ExponentialCoordinate): number {
  const [ae, av] = leading(a), [be, bv] = leading(b);
  if (av === 0) return 0;
  const ratio = av / bv;
  // Normalize the coefficient before exponentiation, not after it overflowed.
  const [term] = coordinate(ratio, ae - be);
  const step = Math.max(-1022, Math.min(1023, term![0]));
  return (term![1] * 2 ** step) * 2 ** (term![0] - step);
}

export function coordinateValue(value: ExponentialCoordinate): number {
  return coordinateRatio(value, coordinate(1));
}

export function coordinateCompare(a: ExponentialCoordinate, b: ExponentialCoordinate): number {
  return Math.sign(leading(coordinateAdd(a, coordinateScale(b, -1)))[1]);
}

/** Normalize a vector by a common power before computing its direction. */
export function coordinateDirection(x: ExponentialCoordinate, y: ExponentialCoordinate): readonly [number, number] {
  const [xe, xv] = leading(x), [ye, yv] = leading(y);
  const exponent = Math.max(xv === 0 ? -Infinity : xe, yv === 0 ? -Infinity : ye);
  if (exponent === -Infinity) return [0, 0];
  const a = xv === 0 ? 0 : xv * 2 ** (xe - exponent), b = yv === 0 ? 0 : yv * 2 ** (ye - exponent), length = Math.hypot(a, b);
  return [a / length, b / length];
}

export interface ExponentialTransform {
  readonly x: ExponentialCoordinate;
  readonly y: ExponentialCoordinate;
  readonly scaleX: ExponentialCoordinate;
  readonly scaleY: ExponentialCoordinate;
}

export interface ExponentialLine {
  readonly start: ExponentialPoint;
  readonly end: ExponentialPoint;
  readonly width: ExponentialCoordinate;
}

export function validExponentialCoordinate(value: ExponentialCoordinate): boolean {
  return Array.isArray(value) && value.every((term, index) => Array.isArray(term) && term.length === 2 &&
    term.every(Number.isFinite) && (index === 0 || value[index - 1]![0] > term[0]));
}
export function validExponentialTransform(value: ExponentialTransform): boolean {
  return value != null && [value.x, value.y, value.scaleX, value.scaleY].every(validExponentialCoordinate);
}
export function validExponentialLine(value: ExponentialLine): boolean {
  return value != null && value.start?.length === 2 && value.end?.length === 2 &&
    [...value.start, ...value.end, value.width].every(validExponentialCoordinate) && coordinateCompare(value.width, []) > 0;
}

function copyCoordinate(value: ExponentialCoordinate): ExponentialCoordinate {
  return Object.freeze(value.map(term => Object.freeze([...term] as const)));
}
export function copyExponentialTransform(value: ExponentialTransform): ExponentialTransform {
  return Object.freeze({ x: copyCoordinate(value.x), y: copyCoordinate(value.y),
    scaleX: copyCoordinate(value.scaleX), scaleY: copyCoordinate(value.scaleY) });
}
export function copyExponentialLine(value: ExponentialLine): ExponentialLine {
  return Object.freeze({ start: Object.freeze([copyCoordinate(value.start[0]), copyCoordinate(value.start[1])] as const),
    end: Object.freeze([copyCoordinate(value.end[0]), copyCoordinate(value.end[1])] as const), width: copyCoordinate(value.width) });
}
