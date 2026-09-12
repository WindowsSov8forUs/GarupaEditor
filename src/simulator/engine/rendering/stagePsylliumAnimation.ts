import profile from "../skin/stagePsyllium.json";
import { StageClipAnimation } from "./stageClipAnimation";
import type { StagePsylliumCommand } from "../data/stageCommand";

/** Ordinary stage events and supplied presentation commands; no generated score. */
export class StagePsylliumAnimation {
  readonly animation = new StageClipAnimation(profile.clips, "StartIdle");
  readonly active = new Uint8Array(profile.positions.length).fill(1);
  readonly colorFactors = new Float64Array(profile.positions.length).fill(1);
  readonly alphas = new Float64Array(profile.positions.length).fill(1);
  readonly mainColors = new Float64Array(profile.positions.length * 3);
  clipName: keyof typeof profile.clips = "StartIdle";
  private selectedMotion: keyof typeof profile.clips | null = null;
  speed = 1;
  private readonly fadeSteps = new Uint8Array(profile.positions.length);
  private fadeStarted = false;
  private visibleCount = profile.positions.length;

  constructor() {
    for (let i = 0; i < this.active.length; i++) this.mainColors.set(profile.initialColor.slice(0, 3), i * 3);
  }

  executeCommand(command: StagePsylliumCommand | null, speed: number): void {
    this.speed = speed;
    if (command !== null && Object.prototype.hasOwnProperty.call(profile.commandMotions, command)) {
      this.selectedMotion = profile.commandMotions[command as keyof typeof profile.commandMotions] as keyof typeof profile.clips;
    }
    // Color commands also replay the current motion before applying their color.
    if (this.selectedMotion !== null) {
      this.clipName = this.selectedMotion;
      this.animation.play(this.clipName);
    }
    if (command === null || !Object.prototype.hasOwnProperty.call(profile.commandColors, command)) return;
    const pattern = profile.commandColors[command as keyof typeof profile.commandColors];
    this.fadeSteps.fill(0);
    this.colorFactors.fill(1);
    this.alphas.fill(1);
    this.visibleCount = 0;
    for (let i = 0; i < this.active.length; i++) {
      const color = pattern[i % pattern.length]!;
      this.mainColors.set(color.slice(0, 3), i * 3);
      if (this.active[i]) this.visibleCount++;
    }
  }

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
    this.selectedMotion = "Cheer";
    this.animation.play(this.clipName);
  }

  advance(deltaSeconds: number): boolean {
    if (!this.hasVisible) return false;
    let changed = this.animation.advance(deltaSeconds * this.speed);
    for (let i = 0; i < this.active.length; i++) {
      if (!this.active[i] || this.fadeSteps[i] === 0) continue;
      changed = true;
      const step = this.fadeSteps[i]! + 1;
      this.fadeSteps[i] = step;
      this.colorFactors[i] = Math.max(0, 1 - step / profile.fadeFrames);
      if (step > profile.fadeFrames) {
        this.alphas[i] = 0;
        this.fadeSteps[i] = 0;
        this.visibleCount--;
      }
    }
    return changed;
  }
}
