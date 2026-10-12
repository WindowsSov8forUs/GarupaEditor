import { useLayoutEffect, useState, type RefObject } from "react";
import { originalLoading } from "./originalLoadingState";

/** Ordinary dialogs share the same pre-entry image/font/surface barrier. */
export function usePresentationAssets(ref: RefObject<HTMLElement | null>, open: boolean, mounted: boolean) {
  const [ready, setReady] = useState(false), [error, setError] = useState<unknown>();
  useLayoutEffect(() => {
    if (!open) { setReady(false); return; }
    if (!mounted || !ref.current || ready) return;
    const element = ref.current, loading = originalLoading.hold("network", {});
    let active = true, frame = 0, checking = false, revision = 0;
    const check = () => {
      if (!active || checking || element.querySelector('[data-original-surface-ready="false"]')) return;
      checking = true;
      const current = revision;
      const images = [...element.querySelectorAll("img")].filter(image => image.src);
      void Promise.all([document.fonts.ready, ...images.map(image => image.decode())]).then(() => {
        checking = false;
        if (!active) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (current !== revision) { check(); return; }
          if (!element.querySelector('[data-original-surface-ready="false"]')) setReady(true);
        });
      }, cause => { checking = false; if (active) setError(cause); });
    };
    const observer = new MutationObserver(() => { revision++; check(); });
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "data-original-surface-ready"] });
    check();
    return () => { active = false; cancelAnimationFrame(frame); observer.disconnect(); loading.release(); };
  }, [ref, open, mounted, ready]);
  if (error) throw error;
  return ready;
}
