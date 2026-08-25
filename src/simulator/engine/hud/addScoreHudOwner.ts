import type { RenderAddScoreHudState } from "../../backends/renderingContracts";

export class AddScoreHudOwner {
  private poolIndex = 0;
  private depth = 0;

  createState(value: number): RenderAddScoreHudState {
    return Object.freeze({
      value,
      poolIndex: this.poolIndex as 0 | 1 | 2 | 3,
      depth: this.depth as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
    });
  }

  commit(): void {
    this.poolIndex = (this.poolIndex + 1) % 4;
    this.depth = (this.depth + 1) % 8;
  }

  snapshot(): Readonly<{ poolIndex: number; depth: number }> {
    return Object.freeze({ poolIndex: this.poolIndex, depth: this.depth });
  }
}
