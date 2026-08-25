export interface HudWebView2Observation {
  readonly highRankNodes: readonly unknown[];
  readonly highRankGeneration: number;
}

export function captureHudRenderingWebView2Observation(
  scoreObservation: {
    readonly hudScoreHighRankNodes: readonly unknown[] | null;
    readonly hudScoreHighRankGeneration: number | null;
  },
): HudWebView2Observation {
  if (scoreObservation.hudScoreHighRankNodes === null ||
    scoreObservation.hudScoreHighRankGeneration === null) {
    throw new Error("Actual WebView2 HUD observation requires the complete persistent ScoreGaugeSS graph.");
  }
  return Object.freeze({
    highRankNodes: Object.freeze([...scoreObservation.hudScoreHighRankNodes]),
    highRankGeneration: scoreObservation.hudScoreHighRankGeneration,
  });
}
