import { useSyncExternalStore } from "react";
import { originalUiViewportScale } from "../simulator/public/layout";

function readViewport() {
  const width = window.innerWidth, height = window.innerHeight;
  const style = getComputedStyle(document.documentElement);
  const inset = (edge: string) => Number.parseFloat(style.getPropertyValue(`--original-safe-${edge}`)) || 0;
  const horizontal = Math.max(inset("left"), inset("right"));
  const vertical = Math.max(inset("top"), inset("bottom"));
  const safeInsets = { left: horizontal, right: horizontal, top: vertical, bottom: vertical };
  const scale = originalUiViewportScale(width, height, safeInsets);
  return { width, height, scale, safeInsets, logicalWidth: width / scale, logicalHeight: height / scale,
    stacked: height > width };
}

let snapshot = readViewport();
const listeners = new Set<() => void>();
function resized() {
  const next = readViewport();
  if (snapshot.width === next.width && snapshot.height === next.height && snapshot.scale === next.scale
    && snapshot.safeInsets.left === next.safeInsets.left && snapshot.safeInsets.top === next.safeInsets.top) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("resize", resized);
  listeners.add(listener);
  resized();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("resize", resized);
  };
}

/** One viewport projection for authored dialogs and editor controls; chart coordinates remain independent. */
export const getUiViewport = () => snapshot;

export function useUiViewport() {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function useOriginalUiScale(): number {
  return useUiViewport().scale;
}

export function centeredUiSpace(bounds: Pick<DOMRect, "left" | "right">, viewportWidth: number) {
  const center = viewportWidth / 2;
  return { width: 2 * Math.max(0, Math.min(center - bounds.left, bounds.right - center)),
    offset: center - (bounds.left + bounds.right) / 2 };
}
