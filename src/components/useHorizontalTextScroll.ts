import { useEffect, type RefObject } from "react";

/** Native horizontal scrolling for single-line text, including Shift + wheel. */
export function useHorizontalTextScroll(ref: RefObject<HTMLElement | null>, selector?: string, enabled = true) {
  useEffect(() => {
    const host = ref.current;
    if (!host || !enabled) return;
    const scroll = (event: WheelEvent) => {
      const target = selector ? host.querySelector<HTMLElement>(selector) : host;
      const delta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
      if (!target || !delta || event.ctrlKey) return;
      const unit = event.deltaMode === 1 ? Number.parseFloat(getComputedStyle(target).lineHeight)
        : event.deltaMode === 2 ? target.clientWidth : 1;
      const previous = target.scrollLeft;
      target.scrollLeft += delta * unit;
      if (target.scrollLeft !== previous) event.preventDefault();
    };
    host.addEventListener("wheel", scroll, { passive: false });
    return () => host.removeEventListener("wheel", scroll);
  }, [ref, selector, enabled]);
}
