import type { RenderAddScoreHudState } from "../../backends/renderingContracts";

export class AddScoreHudOwner {
  private poolIndex = 0;
  private depth = 0;

  createState(value: number): RenderAddScoreHudState {
    return Object.freeze({
      value,
      alpha: Math.fround(0.6),
      localXOffset: 0,
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

export interface AddScoreAnimationState {
  readonly phase: 0 | 1 | 2;
  readonly phaseElapsedSeconds: number;
  readonly hud: RenderAddScoreHudState;
}

/** AddScoreObject.MoveNext (0x387A260): each resume checks the previous
 * phase time, resets time when changing phase, then performs one update. */
export function advanceAddScoreAnimation(
  state: AddScoreAnimationState,
  deltaSeconds: number,
): AddScoreAnimationState | null {
  const duration = Math.fround(0.14);
  let phase = state.phase;
  let elapsed = state.phaseElapsedSeconds;
  if (elapsed >= duration) {
    if (phase === 2) return null;
    phase = phase === 0 ? 1 : 2;
    elapsed = 0;
  }
  elapsed = Math.fround(elapsed + deltaSeconds);
  const alpha = phase === 0
    ? Math.fround(Math.fround(Math.fround(elapsed * Math.fround(0.8)) / duration) + Math.fround(0.2))
    : phase === 1 ? 1 : Math.fround(1 - Math.fround(elapsed / duration));
  return Object.freeze({
    phase,
    phaseElapsedSeconds: elapsed,
    hud: Object.freeze({
      ...state.hud,
      alpha,
      localXOffset: Math.fround(state.hud.localXOffset + (phase === 0 ? 8 : 1)),
    }),
  });
}
