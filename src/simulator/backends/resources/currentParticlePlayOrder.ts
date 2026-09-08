import playOrder from "./currentParticlePlayOrder.json";
import playActive from "./currentParticlePlayActive.json";

const resources: Readonly<Record<string, Readonly<Record<string, number>>>> = playOrder.resources;

/** Original Transform child traversal, independent of serialized component order. */
export function getNativeParticlePlayOrdinal(logicalResource: string, path: string): number {
  const ordinal = resources[logicalResource]?.[path];
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new Error(`Missing original ParticleSystem Play order: ${logicalResource}:${path}`);
  }
  return ordinal;
}

const activeResources: Readonly<Record<string, Readonly<Record<string, boolean>>>> = playActive.resources;

/** Source descendant hierarchy state when its gameplay prefab root enters Play. */
export function getNativeParticlePlayActive(logicalResource: string, path: string): boolean {
  const active = activeResources[logicalResource]?.[path];
  if (typeof active !== "boolean") {
    throw new Error(`Missing original ParticleSystem Play active state: ${logicalResource}:${path}`);
  }
  return active;
}
