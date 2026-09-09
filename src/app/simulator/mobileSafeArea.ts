import type { SimulatorSurfaceState } from "../../simulator/platform/surfaceContracts";

export function measureCssSafeArea(
  canvas: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
): SimulatorSurfaceState["safeArea"] {
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0) || viewportWidth <= 0 || viewportHeight <= 0) {
    throw new Error("Mobile safe-area measurement requires positive CSS and backing-store dimensions.");
  }
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = [
    "position:fixed", "left:0", "top:0", "visibility:hidden", "pointer-events:none",
    "padding-left:env(safe-area-inset-left,0px)",
    "padding-right:env(safe-area-inset-right,0px)",
    "padding-top:env(safe-area-inset-top,0px)",
    "padding-bottom:env(safe-area-inset-bottom,0px)",
  ].join(";");
  document.documentElement.appendChild(probe);
  const style = getComputedStyle(probe);
  const left = pixels(style.paddingLeft);
  const right = pixels(style.paddingRight);
  const top = pixels(style.paddingTop);
  const bottom = pixels(style.paddingBottom);
  probe.remove();
  return calculateMobileSafeArea({ left, right, top, bottom }, rect.width, rect.height, viewportWidth, viewportHeight);
}

/** Fit one unchanged logical scene and its safe area into the current CSS host. */
export function fitSimulatorCanvas(
  surface: SimulatorSurfaceState,
  cssWidth: number,
  cssHeight: number,
  safe: SimulatorSurfaceState["safeArea"],
): SimulatorSurfaceState["safeArea"] {
  const source = surface.safeArea;
  const width = surface.viewportWidth, height = surface.viewportHeight;
  if (![width, height, cssWidth, cssHeight, source.width, source.height, safe.width, safe.height]
    .every((value) => Number.isFinite(value) && value > 0) ||
    ![source.x, source.y, safe.x, safe.y].every((value) => Number.isFinite(value) && value >= 0) ||
    Math.fround(source.x + source.width) > Math.fround(width) ||
    Math.fround(source.y + source.height) > Math.fround(height) ||
    Math.fround(safe.x + safe.width) > Math.fround(cssWidth) ||
    Math.fround(safe.y + safe.height) > Math.fround(cssHeight)) {
    throw new Error("Canvas fitting requires positive viewports with contained safe areas.");
  }
  // Each pair of placement bounds must overlap: keep both the whole canvas
  // inside the host and the logical safe area inside the current safe area.
  const scale = Math.min(
    cssWidth / width, cssHeight / height,
    safe.width / source.width, safe.height / source.height,
    (safe.x + safe.width) / (source.x + source.width),
    (cssWidth - safe.x) / (width - source.x),
    (safe.y + safe.height) / (source.y + source.height),
    (cssHeight - safe.y) / (height - source.y),
  );
  const place = (extent: number, targetExtent: number, sourceStart: number, sourceSize: number,
    targetStart: number, targetSize: number): number => {
    const lower = Math.max(0, targetStart - sourceStart * scale);
    const upper = Math.min(targetExtent - extent * scale, targetStart + targetSize - (sourceStart + sourceSize) * scale);
    const centered = targetStart + (targetSize - sourceSize * scale) / 2 - sourceStart * scale;
    return Math.max(lower, Math.min(upper, centered));
  };
  return Object.freeze({
    x: place(width, cssWidth, source.x, source.width, safe.x, safe.width),
    y: place(height, cssHeight, source.y, source.height, safe.y, safe.height),
    width: width * scale,
    height: height * scale,
  });
}

export function calculateMobileSafeArea(
  insets: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number },
  cssWidth: number,
  cssHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): SimulatorSurfaceState["safeArea"] {
  if (![insets.left, insets.right, insets.top, insets.bottom, cssWidth, cssHeight, viewportWidth, viewportHeight].every(Number.isFinite) ||
    cssWidth <= 0 || cssHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0 ||
    insets.left < 0 || insets.right < 0 || insets.top < 0 || insets.bottom < 0) {
    throw new Error("Mobile safe-area inputs must be finite positive dimensions and non-negative insets.");
  }
  const scaleX = viewportWidth / cssWidth;
  const scaleY = viewportHeight / cssHeight;
  const x = Math.fround(insets.left * scaleX);
  const y = Math.fround(insets.bottom * scaleY);
  const width = Math.fround(viewportWidth - (insets.left + insets.right) * scaleX);
  const height = Math.fround(viewportHeight - (insets.top + insets.bottom) * scaleY);
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 ||
    Math.fround(x + width) > viewportWidth || Math.fround(y + height) > viewportHeight) {
    throw new Error("Measured mobile safe area is outside the landscape backing store.");
  }
  return Object.freeze({ x, y, width, height });
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("CSS safe-area inset is invalid.");
  return parsed;
}
