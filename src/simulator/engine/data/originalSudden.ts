import source from "../../../data/simulator/originalSuddenProfile.json";

export const ORIGINAL_SUDDEN_DEFAULT = source.rate.default;
export const ORIGINAL_SUDDEN_MIN = source.rate.minimum;
export const ORIGINAL_SUDDEN_MAX = source.rate.maximum;
export const ORIGINAL_SUDDEN_STEP = source.rate.step;
export const ORIGINAL_SUDDEN_SMALL_STEP = source.rate.smallStep;
export const ORIGINAL_SUDDEN_BAR_ASSET = "live/sudden-line";

export function isOriginalSuddenRate(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= ORIGINAL_SUDDEN_MIN && value <= ORIGINAL_SUDDEN_MAX;
}

/** InGameCalculatedData.GetSuddenPos and ButtonManager.SetupSudden share this conversion. */
export function originalSuddenRatio(percent: number): number {
  if (!isOriginalSuddenRate(percent)) throw new Error("Sudden requires an integer percentage in [0,100].");
  if (percent === 0) return 0;
  const rate = percent / 100, offset = source.rate.offset;
  return Math.fround(offset + (1 - offset) * rate);
}

export interface OriginalSuddenLayout {
  readonly percent: number;
  readonly laneFit: boolean;
  readonly ratio: number;
  readonly noteLineClipY: number;
  readonly fieldScaleY: number;
  readonly fieldUvHeight: number;
  readonly maskBounds: readonly [number, number, number, number];
  readonly bar: {
    readonly enabled: boolean;
    readonly centerX: number;
    readonly centerY: number;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
    readonly sourceBorder: number;
    readonly scale: number;
    readonly alpha: number;
    readonly sortingOrder: number;
  };
}

export function originalSuddenLayout(percent: number, laneFit: boolean, viewportWidth: number,
  viewportHeight: number, uiPixelScale: number, safeChildScale: number): OriginalSuddenLayout {
  const ratio = originalSuddenRatio(percent);
  if (typeof laneFit !== "boolean" || ![viewportWidth, viewportHeight, uiPixelScale, safeChildScale]
    .every(value => Number.isFinite(value) && value > 0)) throw new Error("Invalid Sudden surface parameters.");
  const centerY = viewportHeight / 2;
  const top = centerY + (source.noteLane.bottomY + source.noteLane.height) * safeChildScale;
  const bottom = centerY + source.noteLane.bottomY * safeChildScale;
  const mask = source.mask, bar = source.appearBar;
  const originY = mask.suddenAreaY + mask.parentY;
  const maskWidth = mask.width * uiPixelScale, maskHeight = mask.height * ratio * uiPixelScale;
  const maskTop = centerY - (originY + (mask.imageY + mask.height / 2) * ratio) * uiPixelScale;
  const fieldScale = laneFit ? Math.fround(1 - ratio) : 1;
  const barWidth = bar.minimumWidth + (bar.maximumWidth - bar.minimumWidth) * ratio;
  return Object.freeze({
    percent, laneFit, ratio,
    noteLineClipY: Math.fround(top + (bottom - top) * ratio),
    fieldScaleY: fieldScale, fieldUvHeight: fieldScale,
    maskBounds: Object.freeze([(viewportWidth - maskWidth) / 2, maskTop, maskWidth, maskHeight]) as readonly [number, number, number, number],
    bar: Object.freeze({ enabled: percent !== 0, centerX: viewportWidth / 2,
      centerY: centerY - (originY + bar.localY * ratio) * uiPixelScale,
      sourceWidth: barWidth * bar.sprite.m_PixelsToUnits,
      sourceHeight: bar.height * bar.sprite.m_PixelsToUnits,
      sourceBorder: bar.sprite.m_Border.x,
      scale: bar.localScale.x * uiPixelScale / bar.sprite.m_PixelsToUnits,
      alpha: bar.color.a, sortingOrder: bar.sortingOrder }),
  });
}
