export type TitlePhase = "show_9th" | "idle_9th" | "touch_9th";

/** Two original animators have independent clocks. CN skip also invokes the
 * show-completed callback immediately, while the logo retains its seek. */
export class TitlePlayback {
  private phase: TitlePhase = "show_9th";
  private phaseStart: number;
  private logoStart: number;
  private settledShowTime: number | null = null;
  private complete = false;

  constructor(now: number, private readonly timing: {
    show: number; touch: number; logoShow: number; logoCue: number; skip: number; showStart?: number;
  }) {
    this.phaseStart = now - (timing.showStart ?? 0);
    this.logoStart = this.phaseStart + timing.logoCue;
  }

  sample(now: number) {
    let elapsed = Math.max(0, now - this.phaseStart);
    if (this.phase === "show_9th" && elapsed >= this.timing.show) {
      this.settledShowTime = this.timing.show;
      this.phase = "idle_9th";
      this.phaseStart += this.timing.show;
      elapsed = now - this.phaseStart;
    }
    if (this.phase === "touch_9th" && elapsed >= this.timing.touch) this.complete = true;
    return { phase: this.phase, time: elapsed, logoTime: Math.max(0, now - this.logoStart),
      settledShowTime: this.settledShowTime, complete: this.complete };
  }

  click(now: number): "skip" | "enter" | "ignored" {
    this.sample(now);
    if (this.phase === "show_9th") {
      this.settledShowTime = this.timing.show * this.timing.skip;
      this.logoStart = now - this.timing.logoShow * this.timing.skip;
      this.phase = "idle_9th";
      this.phaseStart = now;
      return "skip";
    }
    if (this.phase === "idle_9th") {
      this.phase = "touch_9th";
      this.phaseStart = now;
      this.logoStart = now;
      return "enter";
    }
    return "ignored";
  }
}
