import { useLayoutEffect, useState, type RefObject } from "react";
import { originalLoading, type OriginalLoadingLease } from "./originalLoadingState";

const PENDING_SURFACE = '[data-original-surface-ready="false"]';
/** Image sources a dialog barrier has already decoded: reopening them is not a load. */
const decodedSources = new Set<string>();

/** Ordinary dialogs share the same pre-entry image/font/surface barrier. Like the original's
 * NetworkIndicator, it shows only while something is still loading, not for a cached dialog. */
export function usePresentationAssets(ref: RefObject<HTMLElement | null>, open: boolean, mounted: boolean) {
  const [ready, setReady] = useState(false), [error, setError] = useState<unknown>();
  useLayoutEffect(() => {
    if (!open) { setReady(false); return; }
    if (!mounted || !ref.current || ready) return;
    const element = ref.current;
    let indicator: OriginalLoadingLease | null = null;
    let active = true, frame = 0, checking = false, revision = 0;
    const images = () => [...element.querySelectorAll("img")].filter(image => image.src);
    const decoded = (image: HTMLImageElement) => image.complete && image.naturalWidth > 0;
    const settled = () => document.fonts.status === "loaded" && !element.querySelector(PENDING_SURFACE) &&
      images().every(decoded);
    // Loading, as opposed to local preparation: fonts, a never-decoded image, or an atlas sprite
    // still waiting for its atlas (a cached atlas paints in the opening commit). Previews that
    // prepare from cached resources wait without the NetworkIndicator.
    const loading = () => document.fonts.status !== "loaded" ||
      images().some(image => !decoded(image) && !decodedSources.has(image.src)) ||
      [...element.querySelectorAll(PENDING_SURFACE)].some(surface => !surface.hasAttribute("data-original-preview"));
    const check = () => {
      if (!active || checking || element.querySelector(PENDING_SURFACE)) return;
      checking = true;
      const current = revision;
      const pending = images();
      void Promise.all([document.fonts.ready, ...pending.map(image => image.decode())]).then(() => {
        checking = false;
        pending.forEach(image => decodedSources.add(image.src));
        if (!active) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (current !== revision) { check(); return; }
          if (!element.querySelector(PENDING_SURFACE)) setReady(true);
        });
      }, cause => { checking = false; if (active) setError(cause); });
    };
    const observer = new MutationObserver(() => { revision++; check(); });
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "data-original-surface-ready"] });
    // Cached atlases paint during this commit's layout effects, and their readiness re-renders
    // before the first paint; decide after that, so a cached dialog never shows the indicator.
    queueMicrotask(() => {
      if (!active) return;
      if (settled()) { setReady(true); return; }
      if (loading()) indicator = originalLoading.hold("network", {});
      check();
    });
    return () => { active = false; cancelAnimationFrame(frame); observer.disconnect(); indicator?.release(); };
  }, [ref, open, mounted, ready]);
  if (error) throw error;
  return ready;
}
