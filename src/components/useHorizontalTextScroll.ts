import { useEffect, type RefObject } from "react";

/** Horizontal scrolling for single-line text from a horizontal wheel / touchpad delta. Modifier + wheel
 * outside the editor acts as the plain wheel, so Shift no longer remaps to horizontal. */
export function useHorizontalTextScroll(ref: RefObject<HTMLElement | null>, selector?: string, enabled = true) {
  useEffect(() => {
    const host = ref.current;
    if (!host || !enabled) return;
    const scroll = (event: WheelEvent) => {
      const target = selector ? host.querySelector<HTMLElement>(selector) : host;
      const delta = event.deltaX;
      if (!target || !delta || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
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
