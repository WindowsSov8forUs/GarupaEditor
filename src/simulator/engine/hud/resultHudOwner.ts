import type { RenderResultHudState } from "../../backends/renderingContracts";

export class ResultHudOwner {
  constructor(private readonly isAutoPlay: boolean) {}

  createState(
    result: 0 | 1 | 2 | 3 | 4,
    timing: 0 | 1 | 2,
  ): RenderResultHudState {
    return Object.freeze({
      judgeKey: resolveResultJudgeKey(result, this.isAutoPlay),
      timingKey: timingKeyForJudgeTiming(timing),
    });
  }
}

export function resolveResultJudgeKey(
  result: 0 | 1 | 2 | 3 | 4,
  isAutoPlay: boolean,
): RenderResultHudState["judgeKey"] {
  return isAutoPlay
    ? "judge_auto"
    : (["judge_miss", "judge_bad", "judge_good", "judge_great", "judge_perfect"] as const)[result];
}

function timingKeyForJudgeTiming(timing: 0 | 1 | 2): RenderResultHudState["timingKey"] {
  return timing === 1 ? "judge_fast" : timing === 2 ? "judge_slow" : null;
}
