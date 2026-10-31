/** Elements whose own handlers give modifier + wheel a meaning (the editor's zoom surface). */
export const MODIFIER_WHEEL_SURFACE_ATTRIBUTE = "data-modifier-wheel-surface";

function scrollableAncestor(start: Element | null): HTMLElement | null {
  for (let node = start; node instanceof HTMLElement; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/**
 * Outside a modifier-wheel surface, Ctrl / Shift / Alt + wheel act as the plain wheel: no page
 * zoom and no horizontal remapping, only the vertical scroll the bare wheel would do.
 */
export function installPlainModifierWheel(): void {
  window.addEventListener("wheel", event => {
    if (!event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(`[${MODIFIER_WHEEL_SURFACE_ATTRIBUTE}]`)) return;
    event.preventDefault();
    const scroller = scrollableAncestor(target);
    if (!scroller) return;
    const delta = event.deltaY || event.deltaX;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1;
    scroller.scrollTop += delta * unit;
  }, { capture: true, passive: false });
}
