import { useLayoutEffect, useRef, useState, type RefObject } from "react";

// The scroll surface grows independently of chart duration. Rendering remains windowed.
export function useEditorScrollExtent(viewport: RefObject<HTMLDivElement | null>, ready: HTMLDivElement | null, playbackPositionPercent: number) {
  const [padding, setPadding] = useState({ top: 0, bottom: 0 });
  const previousTop = useRef(0);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const grow = () => {
      const height = element.clientHeight;
      if (!height) return;
      const extendTop = element.scrollTop < height;

      setPadding(current => {
        const top = extendTop ? current.top + height * 2 : current.top;
        // Native scroll maximum puts zero exactly at the configured playback anchor.
        const bottom = height * Math.max(0, Math.min(1, playbackPositionPercent / 100)) - 1;
        return top === current.top && bottom === current.bottom ? current : { top, bottom };
      });
    };
    const observer = new ResizeObserver(grow);
    observer.observe(element);
    element.addEventListener("scroll", grow);
    grow();
    return () => { observer.disconnect(); element.removeEventListener("scroll", grow); };
  }, [viewport, ready, playbackPositionPercent]);
  useLayoutEffect(() => {
    if (viewport.current) viewport.current.scrollTop += padding.top - previousTop.current;
    previousTop.current = padding.top;
  }, [padding.top, viewport]);
  return padding;
}
