import type { OrdinaryVisibleClip } from "./resources/currentOrdinaryVisibleProfile";

/** Shared source-curve sampling for live owners and the settings preview. */
export function sampleOrdinaryVisibleClip(
  clip: Pick<OrdinaryVisibleClip, "loop" | "durationSeconds" | "curves">,
  elapsedSeconds: number,
): readonly number[] {
  const phase = clip.loop
    ? Math.fround(elapsedSeconds % clip.durationSeconds)
    : Math.fround(Math.min(elapsedSeconds, clip.durationSeconds));
  return Object.freeze(clip.curves.map((curve) => {
    if (curve.storage === "constant") return curve.value;
    let key = curve.keys[0]!;
    for (const candidate of curve.keys) {
      if (candidate.time > phase) break;
      key = candidate;
    }
    const delta = Math.fround(phase - key.time);
    let value = Math.fround(Math.fround(key.coefficients[0] * delta) + key.coefficients[1]);
    value = Math.fround(Math.fround(value * delta) + key.coefficients[2]);
    return Math.fround(Math.fround(value * delta) + key.coefficients[3]);
  }));
}
