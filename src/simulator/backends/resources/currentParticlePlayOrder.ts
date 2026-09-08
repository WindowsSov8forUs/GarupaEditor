import playOrder from "./currentParticlePlayOrder.json";

const resources: Readonly<Record<string, Readonly<Record<string, number>>>> = playOrder.resources;

/** Original Transform child traversal, independent of serialized component order. */
export function getNativeParticlePlayOrdinal(logicalResource: string, path: string): number {
  const ordinal = resources[logicalResource]?.[path];
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new Error(`Missing original ParticleSystem Play order: ${logicalResource}:${path}`);
  }
  return ordinal;
}
