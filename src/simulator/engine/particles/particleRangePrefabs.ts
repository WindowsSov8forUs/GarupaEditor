import type { ParticleInstanceIdentity, ParticleRootId } from "../../backends/particleContracts";

// Reverse HPR-C01/C02: GamePlayButton's eight arrays have seven source prefabs.
// This is not Slide's pooled base-prefab selection or a scale multiplier.
const RANGE_BASES = Object.freeze([
  "effect_TapKeep", "effect_tap_good", "effect_tap_great", "effect_tap_perfect",
  "effect_tap_skill_good", "effect_tap_skill_great", "effect_tap_skill_perfect", "effect_tap_swipe",
] as const);

export interface ParticleRangePrefab {
  readonly prefab: string;
  readonly root: ParticleRootId;
  readonly rangeLength: number | null;
}

export const HABAHIRO_PARTICLE_RANGE_PREFABS: readonly ParticleRangePrefab[] = Object.freeze([
  Object.freeze({ prefab: "effect_tap", root: "ordinary:effect_tap" as const, rangeLength: null }),
  ...RANGE_BASES.flatMap((base) => Array.from({ length: 7 }, (_, index) => Object.freeze({
    prefab: index === 0 ? base : `${base}_${index + 1}`,
    root: `ordinary:${base}` as ParticleRootId,
    rangeLength: index + 1,
  }))),
]);

export function findHabahiroParticleRangePrefab(prefab: string): ParticleRangePrefab | undefined {
  return HABAHIRO_PARTICLE_RANGE_PREFABS.find((entry) => entry.prefab === prefab);
}

export function selectedParticleRangeLength(instance: ParticleInstanceIdentity): number | null {
  // NoteSlide.GetSlideNoteTapKeepEffect has its own base-prefab pool. Its width
  // affects the separately owned outer transform, never this button array index.
  return instance.kind === "note-slide" ? 1 : instance.rangeLength;
}
