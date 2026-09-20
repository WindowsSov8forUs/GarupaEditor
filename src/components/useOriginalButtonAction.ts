import { useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent } from "react";

let lastUiClick = -Infinity;
let dispatching = false;
/** StarUIButton.checkDoubleTap: per-button and shared UI interval, unless explicitly enabled. */
export function useOriginalButtonAction(onClick: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined, disabled: boolean,
  enableDoubleTap = false, longPressJudgementTime = 1, beforeClick?: () => void) {
  const lastClick = useRef(-Infinity);
  const capture = useRef<{ pointer: number; started: number } | null>(null);
  const released = useRef(false);
  const [pressed, setPressed] = useState(false);
  const clear = () => { capture.current = null; setPressed(false); };
  useEffect(() => { if (disabled) { capture.current = null; released.current = false; setPressed(false); } }, [disabled]);
  const activate = (event: MouseEvent<HTMLButtonElement>) => {
    const now = performance.now() / 1000;
    if (disabled || !onClick || dispatching || (!enableDoubleTap &&
      (now - lastClick.current < 0.2 || now - lastUiClick < 0.2))) return;
    dispatching = true;
    try { beforeClick?.(); onClick(event); }
    finally { dispatching = false; lastClick.current = lastUiClick = performance.now() / 1000; }
  };
  const handlers: ButtonHTMLAttributes<HTMLButtonElement> = {
    onPointerDown(event) {
      if (disabled || event.button !== 0 || capture.current) return;
      capture.current = { pointer: event.pointerId, started: performance.now() / 1000 };
      released.current = false; setPressed(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event) {
      if (capture.current?.pointer !== event.pointerId) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setPressed(event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom);
    },
    onPointerUp(event) {
      const current = capture.current;
      if (current?.pointer !== event.pointerId) return;
      const rect = event.currentTarget.getBoundingClientRect();
      released.current = performance.now() / 1000 - current.started < longPressJudgementTime &&
        event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      clear();
    },
    onPointerCancel() { released.current = false; clear(); },
    onLostPointerCapture() { clear(); },
    onBlur() { released.current = false; clear(); },
    onClick(event) {
      event.stopPropagation();
      if (event.detail !== 0 && !released.current) { event.preventDefault(); return; }
      released.current = false; activate(event);
    },
    onKeyDown(event) {
      if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
      if (!disabled && !event.repeat && (event.key === "Enter" || event.key === " ")) setPressed(true);
    },
    onKeyUp() { setPressed(false); },
  };
  return { pressed, handlers };
}
