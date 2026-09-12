export interface StageLightFadeInput {
  readonly delay: number;
  readonly duration: number;
  readonly color: { readonly color: readonly number[] };
}

const BLUE = [0, 55 / 255, 1, 1] as const;
const SKY_BLUE = [213 / 255, 1, 1, 1] as const;
const TABLE_LENGTH = 7;

/** Ordinary EffectStageLightManager -> ColorFader, independent of chart time. */
export class StageLightAnimation {
  readonly color: number[];
  private readonly from: number[];
  private readonly skyIndex = Math.floor(Math.random() * TABLE_LENGTH);
  private index = 0;
  private elapsed = 0;
  private waiting = true;

  constructor(private readonly input: StageLightFadeInput) {
    this.color = [...input.color.color];
    this.from = [...this.color];
  }

  advance(deltaSeconds: number): void {
    if (this.waiting) {
      if (this.elapsed < this.input.delay) {
        this.elapsed += deltaSeconds;
        return;
      }
      this.waiting = false;
      this.elapsed = 0;
    }
    if (this.elapsed >= this.input.duration) {
      const completed = this.target();
      for (let channel = 0; channel < 4; channel++) this.from[channel] = completed[channel]!;
      this.index = (this.index + 1) % TABLE_LENGTH;
      // ColorFader finishes the old target and starts the next fade at zero;
      // a delayed frame does not skip colors or carry its overshoot forward.
      this.elapsed = 0;
    }
    const target = this.target();
    const progress = this.elapsed / this.input.duration;
    for (let channel = 0; channel < 4; channel++) {
      this.color[channel] = this.from[channel]! + (target[channel]! - this.from[channel]!) * progress;
    }
    this.elapsed += deltaSeconds;
  }

  private target(): readonly number[] {
    return this.index === this.skyIndex ? SKY_BLUE : BLUE;
  }
}
