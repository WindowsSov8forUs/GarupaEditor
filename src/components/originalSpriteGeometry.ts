import drawing from "../data/originalUiDrawing.json";
import type { OriginalRect } from "./originalPrefabModel";

export interface OriginalSpriteGeometryRow {
  readonly width: number; readonly height: number;
  readonly borderLeft: number; readonly borderRight: number;
  readonly borderTop: number; readonly borderBottom: number;
  readonly paddingLeft: number; readonly paddingRight: number;
  readonly paddingTop: number; readonly paddingBottom: number;
}

/** UISprite.drawingDimensions leaves Tiled padding to each tile; other types inset the widget. */
export function originalSpriteDrawingRect(frame: OriginalRect, row: OriginalSpriteGeometryRow,
  type: number, scaleX: number, scaleY: number, spriteFlipX: boolean, spriteFlipY: boolean,
  region?: Readonly<{ x: number; y: number; z: number; w: number }>): OriginalRect {
  let left = row.paddingLeft, right = row.paddingRight, top = row.paddingTop, bottom = row.paddingBottom;
  if (type === drawing.types.tiled) left = right = top = bottom = 0;
  const simple = type === drawing.types.simple || type === drawing.types.filled;
  const sourceWidth = row.width + left + right, sourceHeight = row.height + top + bottom;
  if (simple) { right += sourceWidth & 1; top += sourceHeight & 1; }
  if (spriteFlipX !== frame.flipX) [left, right] = [right, left];
  if (spriteFlipY !== frame.flipY) [top, bottom] = [bottom, top];
  const xScale = simple ? frame.width / sourceWidth : Math.abs(scaleX) * drawing.atlasPixelSize;
  const yScale = simple ? frame.height / sourceHeight : Math.abs(scaleY) * drawing.atlasPixelSize;
  let x = frame.x + left * xScale, y = frame.y + top * yScale;
  let width = frame.width - (left + right) * xScale, height = frame.height - (top + bottom) * yScale;
  if (region) {
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const bordersX = (row.borderLeft + row.borderRight) * Math.abs(scaleX) * drawing.atlasPixelSize;
    const bordersY = (row.borderTop + row.borderBottom) * Math.abs(scaleY) * drawing.atlasPixelSize;
    const startX = frame.flipX ? 1 - clamp(region.z) : clamp(region.x);
    const endX = frame.flipX ? 1 - clamp(region.x) : clamp(region.z);
    const startY = frame.flipY ? clamp(region.y) : 1 - clamp(region.w);
    const endY = frame.flipY ? clamp(region.w) : 1 - clamp(region.y);
    x += (width - bordersX) * startX; y += (height - bordersY) * startY;
    width = bordersX + (width - bordersX) * (endX - startX);
    height = bordersY + (height - bordersY) * (endY - startY);
  }
  return { ...frame, x, y, width, height };
}

/** UIProgressBar.SetThumbPosition uses Mathf.Round (ties to even) in the thumb parent's coordinates. */
export function originalUiRound(value: number): number {
  const low = Math.floor(value), fraction = value - low;
  return fraction === 0.5 ? low % 2 === 0 ? low : low + 1 : Math.round(value);
}
export const ORIGINAL_PROGRESS_HIDE_THRESHOLD = drawing.progressBar.foregroundHideBelow;
