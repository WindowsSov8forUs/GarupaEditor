export type ParticleRandomStateU32 = readonly [number, number, number, number];
export type ParticleRandomSimdState = readonly [
  ParticleRandomStateU32,
  ParticleRandomStateU32,
  ParticleRandomStateU32,
  ParticleRandomStateU32,
];

export interface ParticleRandomStep {
  readonly state: ParticleRandomStateU32;
  readonly value: number;
}

const FLOAT32_SCALE_BITS = 0x34000001;
const SEED_RECURRENCE = 1812433253;

/** Current libunity process-subsystem seed-zero xorshift manager state. */
export const PARTICLE_AUTO_SEED_INITIAL_STATE: ParticleRandomStateU32 = Object.freeze([
  0,
  1,
  1812433254,
  1900727103,
]);

export function particleStateFromSeed(seed: number): ParticleRandomStateU32 {
  const s0 = seed >>> 0;
  const s1 = (Math.imul(SEED_RECURRENCE, s0) + 1) >>> 0;
  const s2 = (Math.imul(SEED_RECURRENCE, s1) + 1) >>> 0;
  const s3 = (Math.imul(SEED_RECURRENCE, s2) + 1) >>> 0;
  return Object.freeze([s0, s1, s2, s3]);
}

/** sub_833EA0: four SIMD lanes start at seed + lane*367. */
export function particleSimdStateFromSeed(seed: number): ParticleRandomSimdState {
  return Object.freeze([0, 1, 2, 3].map((lane) =>
    particleStateFromSeed(((seed >>> 0) + lane * 367) >>> 0))) as ParticleRandomSimdState;
}

export function particleSimdRandomValues(
  state: ParticleRandomSimdState,
  count: number,
): {
  readonly state: ParticleRandomSimdState;
  readonly words: readonly (readonly [number, number, number, number])[];
  readonly values: readonly (readonly [number, number, number, number])[];
} {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Particle SIMD random draw count must be one non-negative safe integer.");
  const lanes: ParticleRandomStateU32[] = [...state];
  const words: Array<readonly [number, number, number, number]> = [];
  const values: Array<readonly [number, number, number, number]> = [];
  for (let draw = 0; draw < count; draw += 1) {
    const wordRow: number[] = [];
    const valueRow: number[] = [];
    for (let lane = 0; lane < 4; lane += 1) {
      const step = particleXorshift128(lanes[lane]!);
      lanes[lane] = step.state;
      wordRow.push(step.value);
      valueRow.push(particleWordRatio(step.value));
    }
    words.push(Object.freeze(wordRow) as readonly [number, number, number, number]);
    values.push(Object.freeze(valueRow) as readonly [number, number, number, number]);
  }
  return Object.freeze({
    state: Object.freeze(lanes) as ParticleRandomSimdState,
    words: Object.freeze(words),
    values: Object.freeze(values),
  });
}

export function particleXorshift128(
  state: ParticleRandomStateU32,
): ParticleRandomStep {
  const x = state[0] >>> 0;
  const y = state[1] >>> 0;
  const z = state[2] >>> 0;
  const w = state[3] >>> 0;
  const shifted = (x ^ (x << 11)) >>> 0;
  const next = (shifted ^ (shifted >>> 8) ^ w ^ (w >>> 19)) >>> 0;
  return Object.freeze({
    state: Object.freeze([y, z, w, next]) as ParticleRandomStateU32,
    value: next,
  });
}

export function particleSeedRatio(seed: number): number {
  const value = seed >>> 0;
  const left = (value ^ (value << 11)) >>> 0;
  const product = Math.imul(1790253981, value) + 1900727103 >>> 0;
  const mixed = (product ^ value ^ (value << 11) ^ (left >>> 8)) >>> 0;
  const integer = ((mixed & 0x007fffff) ^ (product >>> 19)) >>> 0;
  return particleWordRatio(integer);
}

/** Native module streams project the low 23 bits of each xorshift word. */
export function particleWordRatio(word: number): number {
  return f32Multiply(Math.fround((word >>> 0) & 0x007fffff), float32FromUint32(FLOAT32_SCALE_BITS));
}

export function particleRandomValues(
  state: ParticleRandomStateU32,
  count: number,
): {
  readonly state: ParticleRandomStateU32;
  readonly values: readonly number[];
} {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Particle random draw count must be one non-negative safe integer.");
  let current = state;
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const step = particleXorshift128(current);
    current = step.state;
    values.push(particleWordRatio(step.value));
  }
  return Object.freeze({ state: current, values: Object.freeze(values) });
}

function float32FromUint32(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, value >>> 0, true);
  return view.getFloat32(0, true);
}

function f32Multiply(left: number, right: number): number {
  return Math.fround(Math.fround(left) * Math.fround(right));
}
