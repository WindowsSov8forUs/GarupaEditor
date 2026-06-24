export interface StageGeometry {
  viewportWidth: number;
  viewportHeight: number;
  stageWidth: number;
  stageHeight: number;
  stageBottom: number;
  stageTop: number;
  stageJudge: number;
  viewportBottomPercent: number;
}

export const STAGE_HEIGHT_TO_WIDTH_RATIO = 634141 / 940938;
export const STAGE_JUDGE_TO_HEIGHT_RATIO = 338256 / 877231;
export const STAGE_TO_WINDOW_RATIO = 462 / 667;
export const FIELD_BG_WIDTH_TO_STAGE_WIDTH_RATIO = (7 / 8) / STAGE_TO_WINDOW_RATIO;
export const JUDGE_LINE_WIDTH_TO_STAGE_WIDTH_RATIO = 1.35 / STAGE_TO_WINDOW_RATIO;

export function calculateStageGeometry(viewportWidth: number, viewportHeight: number): StageGeometry {
  const stageWidthByViewportWidth = viewportWidth * STAGE_TO_WINDOW_RATIO;
  const stageHeightByViewportWidth = stageWidthByViewportWidth * STAGE_HEIGHT_TO_WIDTH_RATIO;

  let stageWidth: number;
  let stageHeight: number;
  if (stageHeightByViewportWidth <= viewportHeight + 1e-6) {
    stageWidth = stageWidthByViewportWidth;
    stageHeight = stageHeightByViewportWidth;
  } else {
    stageHeight = viewportHeight * STAGE_TO_WINDOW_RATIO;
    stageWidth = stageHeight / STAGE_HEIGHT_TO_WIDTH_RATIO;
  }

  const stageJudge = stageHeight * STAGE_JUDGE_TO_HEIGHT_RATIO;
  const stageBottom = viewportHeight * 0.5 + stageJudge;
  const stageTop = stageBottom - stageHeight;
  const viewportBottomPercent = (viewportHeight - stageTop) / Math.max(1e-6, stageHeight);

  return {
    viewportWidth,
    viewportHeight,
    stageWidth,
    stageHeight,
    stageBottom,
    stageTop,
    stageJudge,
    viewportBottomPercent,
  };
}
