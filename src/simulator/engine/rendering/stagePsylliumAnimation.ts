import profile from "../skin/stagePsyllium.json";
import { StageClipAnimation } from "./stageClipAnimation";

/** Ordinary stage events; no generated chart, team or character commands. */
export class StagePsylliumAnimation {
  readonly animation = new StageClipAnimation(profile.clips, "StartIdle");
  readonly active = new Uint8Array(profile.positions.length).fill(1);
  readonly colorFactors = new Float64Array(profile.positions.length).fill(1);
  readonly alphas = new Float64Array(profile.positions.length).fill(1);
  clipName: "StartIdle" | "Cheer" = "StartIdle";
  speed = 1;
  private readonly fadeSteps = new Uint8Array(profile.positions.length);
  private fadeStarted = false;
  private visibleCount = profile.positions.length;

  get hasVisible(): boolean { return this.visibleCount > 0; }

  beginFade(): boolean {
    if (this.fadeStarted) return false;
    this.fadeStarted = true;
    // StartCoroutine executes the first RGB increment before its first yield.
    for (let i = 0; i < this.active.length; i++) if (this.active[i]) {
      this.fadeSteps[i] = 1;
      this.colorFactors[i] = 1 - 1 / profile.fadeFrames;
    }
    return true;
  }

  hide(index: number): void {
    if (this.active[index] && this.alphas[index]! > 0) this.visibleCount--;
    this.active[index] = 0;
    this.fadeSteps[index] = 0;
  }

  beginClear(): void {
    this.active.fill(1);
    this.visibleCount = 0;
    for (const alpha of this.alphas) if (alpha > 0) this.visibleCount++;
    this.clipName = "Cheer";
    this.animation.play(this.clipName);
  }

  advance(deltaSeconds: number): boolean {
    if (!this.hasVisible) return false;
    this.animation.advance(deltaSeconds * this.speed);
    for (let i = 0; i < this.active.length; i++) {
      if (!this.active[i] || this.fadeSteps[i] === 0) continue;
      const step = this.fadeSteps[i]! + 1;
      this.fadeSteps[i] = step;
      this.colorFactors[i] = Math.max(0, 1 - step / profile.fadeFrames);
      if (step > profile.fadeFrames) {
        this.alphas[i] = 0;
        this.fadeSteps[i] = 0;
        this.visibleCount--;
      }
    }
    return true;
  }
}
