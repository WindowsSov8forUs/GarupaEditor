import { ORIGINAL_SCREEN_WIDTH_BASE, ORIGINAL_SCREEN_HEIGHT_BASE } from "../scene/originalSurfaceLayout";

export interface OriginalUiSafeInsets { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }

/** StarUI projection from the host viewport and its actual safe area.
 * Platform-specific safe-area acquisition belongs to the host, not this calculation. */
export function originalUiViewportScale(width: number, height: number,
  insets: OriginalUiSafeInsets = { left: 0, right: 0, top: 0, bottom: 0 }): number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    throw new Error("Original UI projection requires a positive viewport.");
  const horizontal = Math.max(insets.left, insets.right);
  const vertical = Math.max(insets.top, insets.bottom);
  if (![insets.left, insets.right, insets.top, insets.bottom].every(value => Number.isFinite(value) && value >= 0)
    || horizontal * 2 >= width || vertical * 2 >= height)
    throw new Error("Original UI projection requires a non-empty safe area.");
  const safeRatio = Math.min((width - 2 * horizontal) / width, (height - 2 * vertical) / height);
  return Math.min(width / ORIGINAL_SCREEN_WIDTH_BASE, height / ORIGINAL_SCREEN_HEIGHT_BASE) * safeRatio;
}
