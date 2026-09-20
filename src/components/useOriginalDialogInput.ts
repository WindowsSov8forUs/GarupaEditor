import { useEffect, useRef, type RefObject } from "react";

function isTop(node: HTMLElement): boolean {
  const masks = [...document.querySelectorAll<HTMLElement>(".modal-transition-mask")];
  const last = masks.reduce<HTMLElement | null>((top, item) =>
    !top || Number(getComputedStyle(item).zIndex) >= Number(getComputedStyle(top).zIndex) ? item : top, null);
  return last === node;
}

/** Host keyboard/focus adapter; the cover is not an outside-click close target. */
export function useOriginalDialogInput(ref: RefObject<HTMLDivElement | null>, mounted: boolean,
  onClose: (() => void) | undefined, closeDisabled: boolean): void {
  const close = useRef(onClose), disabled = useRef(closeDisabled);
  close.current = onClose; disabled.current = closeDisabled;
  useEffect(() => {
    const node = ref.current;
    if (!mounted || !node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => [...node.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )].filter(item => item.getClientRects().length && !item.closest('[inert]') && item.tabIndex >= 0);
    const focus = () => (focusable()[0] ?? node).focus({ preventScroll: true });
    let frame = 0;
    const focusWhenPainted = () => {
      if (!node.isConnected || !isTop(node)) return;
      const card = node.firstElementChild;
      if (card instanceof HTMLElement && (card.inert || getComputedStyle(card).visibility === "hidden")) {
        frame = requestAnimationFrame(focusWhenPainted); return;
      }
      if (node.classList.contains("original-authored-mask")) node.focus({ preventScroll: true });
      else focus();
    };
    frame = requestAnimationFrame(focusWhenPainted);
    const keydown = (event: KeyboardEvent) => {
      if (!isTop(node)) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!disabled.current) close.current?.();
      } else if (event.key === "Tab") {
        const items = focusable();
        const first = items[0], last = items[items.length - 1];
        if (!first || !node.contains(document.activeElement)) { event.preventDefault(); focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const focusin = () => { if (isTop(node) && !node.contains(document.activeElement)) focus(); };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focusin, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", focusin, true);
      queueMicrotask(() => { if (previous?.isConnected && !previous.closest("[inert]")) previous.focus({ preventScroll: true }); });
    };
  }, [ref, mounted]);
}
