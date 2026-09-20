import { createOriginalSurfaceLayout } from "../scene/originalSurfaceLayout";

/** Shared StarUI authored-unit projection; fitting does not rearrange prefab children. */
export function originalUiViewportScale(width: number, height: number): number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    throw new Error("Original UI projection requires a positive viewport.");
  const layout = createOriginalSurfaceLayout({ revision: 0, viewportWidth: width, viewportHeight: height,
    origin: "bottom-left", safeArea: { x: 0, y: 0, width, height } }, 100);
  if (layout.status !== "ok") throw new Error(layout.boundary);
  return layout.value.ui.screenToSafeChildScale;
}
