import { useSyncExternalStore } from "react";

let revision = 0;
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;
const snapshot = () => revision;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    let active = true;
    const changed = () => {
      if (!active) return;
      revision += 1;
      listeners.forEach(notify => notify());
    };
    document.fonts.addEventListener("loadingdone", changed);
    document.fonts.addEventListener("loadingerror", changed);
    // A cached font can finish between text measurement and subscription.
    void document.fonts.ready.then(changed);
    stop = () => {
      active = false;
      document.fonts.removeEventListener("loadingdone", changed);
      document.fonts.removeEventListener("loadingerror", changed);
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { stop?.(); stop = null; }
  };
}

/** Recalculate authored label fitting and radio hit bounds after font decoding. */
export function useOriginalFontRevision(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
