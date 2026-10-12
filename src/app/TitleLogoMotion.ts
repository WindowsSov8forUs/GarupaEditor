import motion from "../data/title/logoMotion.json";
import { sampleOrdinaryVisibleClip } from "../simulator/backends/ordinaryVisibleAnimation";
import type { OrdinaryVisibleClip } from "../simulator/backends/resources/currentOrdinaryVisibleProfile";

type Pose = { scale: number; y: number; alpha: number; glowScaleX: number; glowScaleY: number; glow: number; white: number };
const rest: Pose = { scale: 1, y: 0, alpha: 1, glowScaleX: 1, glowScaleY: 1, glow: 0, white: 0 };
const unit = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = unit(value); return t * t * (3 - 2 * t); };
function blend(a: Pose, b: Pose, t: number): Pose {
  return Object.fromEntries(Object.keys(a).map(key => {
    const k = key as keyof Pose;
    return [k, a[k] + (b[k] - a[k]) * t];
  })) as Pose;
}

/** Authorized whole-image adaptation, not original letter-by-letter animation.
 * Keep the original flash/echo curves, but never flip or squash the bitmap. */
export class TitleLogoMotion {
  private mode: "show" | "skip" | "touch" = "show";
  private from = rest;
  constructor(private start: number) {}

  sample(now: number): Pose {
    const time = Math.max(0, now - this.start);
    if (this.mode === "skip") return blend(this.from, rest, ease(time / 0.22));
    if (this.mode === "touch") {
      const values = sampleOrdinaryVisibleClip(motion.touch as unknown as OrdinaryVisibleClip, time);
      // A click retains the assembled title. Only finish an interrupted project
      // reveal; never add a second scale/fade to the original touch layers.
      const p = blend(this.from, rest, ease(time / 0.22));
      return { ...p, glowScaleX: values[0]!, glowScaleY: values[1]!,
        glow: values[2]!, white: values[3]! };
    }
    const progress = ease(time / 0.8);
    const flash = sampleOrdinaryVisibleClip(motion.show as unknown as OrdinaryVisibleClip,
      2.133333444595337 + Math.max(0, time - 0.45));
    const reveal = time < 0.45 ? 0 : ease((time - 0.45) / 0.06);
    return { scale: 1.14 - 0.14 * progress, y: 24 * (1 - progress), alpha: ease(time / 0.32),
      glowScaleX: flash[3]!, glowScaleY: flash[4]!, glow: flash[5]! * reveal, white: flash[7]! * reveal };
  }

  skip(now: number) { this.from = this.sample(now); this.mode = "skip"; this.start = now; }
  enter(now: number) { this.from = this.sample(now); this.mode = "touch"; this.start = now; }
}
