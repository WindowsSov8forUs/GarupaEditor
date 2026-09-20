import profile from "../data/originalRhythmAdjust.json";

export function rhythmAdjustRound(value: number): number {
  const lower = Math.floor(value), fraction = value - lower;
  return fraction === 0.5 ? lower + (Math.abs(lower) % 2) : Math.round(value);
}

/** RhythmAdjustDialog: four first-tap windows, in original 60 Hz judgement units. */
export class OriginalRhythmAdjust {
  readonly samples: (number | null)[] = [null, null, null, null];
  readonly labels = ["", "", "", ""];
  elapsed = 0;
  private touched = false;
  press(): void { this.touched = true; }
  advance(delta: number): boolean {
    this.elapsed += delta;
    const clock = profile.clock;
    const progress = Math.trunc(this.elapsed * clock.progressPerSecond);
    const bar = Math.trunc(progress / clock.barDivision), within = progress % clock.barDivision;
    if (clock.samplingBars.includes(bar)) {
      const window = clock.sampleWindowsInclusive.findIndex(([from, to]) => within >= from! && within <= to!);
      if (window >= 0) {
        const index = (bar - 1) * 2 + window;
        if (this.touched && this.samples[index] === null) {
          this.samples[index] = Math.trunc((clock.sampleTargets[window]! - within) / clock.progressPerFrame);
          this.labels[index] = String(this.samples[index]);
        }
        for (let i = 0; i < index; i++) if (this.samples[i] === null) this.labels[i] = "-";
      }
    }
    this.touched = false;
    if (this.elapsed >= clock.playingEndSeconds && this.samples[3] === null) this.labels[3] = "-";
    return this.elapsed >= clock.playingEndSeconds;
  }
  result(): number {
    const valid = this.samples.filter((value): value is number => value !== null);
    return valid.length ? rhythmAdjustRound(valid.reduce((sum, value) => sum + value, 0) / valid.length) : 0;
  }
}
