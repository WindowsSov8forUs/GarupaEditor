import type { RenderComboHudState } from "../../backends/renderingContracts";

export class ComboHudOwner {
  constructor(private readonly allPerfectStatusDisplayMode: boolean) {}

  displayedAllPerfect(allPerfectStatistic: boolean): boolean {
    return allPerfectStatistic && this.allPerfectStatusDisplayMode;
  }

  normalState(combo: number): RenderComboHudState {
    return Object.freeze({ combo, allPerfect: false });
  }

  allPerfectState(combo: number): RenderComboHudState {
    return Object.freeze({ combo, allPerfect: true });
  }
}

export function resolveDisplayedAllPerfect(
  allPerfectStatistic: boolean,
  allPerfectStatusDisplayMode: boolean,
): boolean {
  return allPerfectStatistic && allPerfectStatusDisplayMode;
}
