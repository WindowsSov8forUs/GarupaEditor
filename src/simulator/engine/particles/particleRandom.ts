export type ParticleRandomStateU32 = readonly [number, number, number, number];

export interface ParticleRandomStep {
  readonly state: ParticleRandomStateU32;
  readonly value: number;
}

const FLOAT32_SCALE_BITS = 0x34000001;

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
  return f32Multiply(Math.fround(integer), float32FromUint32(FLOAT32_SCALE_BITS));
}

export function particleRandomSlots(
  state: ParticleRandomStateU32,
): {
  readonly state: ParticleRandomStateU32;
  readonly slots: readonly number[];
} {
  let current = state;
  const slots: number[] = [];
  for (let index = 0; index < 12; index += 1) {
    const step = particleXorshift128(current);
    current = step.state;
    slots.push(particleSeedRatio(step.value));
  }
  return Object.freeze({ state: current, slots: Object.freeze(slots) });
}

function float32FromUint32(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, value >>> 0, true);
  return view.getFloat32(0, true);
}

function f32Multiply(left: number, right: number): number {
  return Math.fround(Math.fround(left) * Math.fround(right));
}
