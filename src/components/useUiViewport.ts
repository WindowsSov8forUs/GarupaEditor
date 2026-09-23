import { useSyncExternalStore } from "react";
import { originalUiViewportScale } from "../simulator/public/layout";

function readViewport() {
  const width = window.innerWidth, height = window.innerHeight;
  const scale = originalUiViewportScale(width, height);
  return { width, height, scale, logicalWidth: width / scale, logicalHeight: height / scale,
    stacked: height > width };
}

let snapshot = readViewport();
const listeners = new Set<() => void>();
function resized() {
  if (snapshot.width === window.innerWidth && snapshot.height === window.innerHeight) return;
  snapshot = readViewport();
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
