import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

export type EditorZoom = { width: number; vertical: number };
export function scaleEditorZoom(value: EditorZoom, factor: number, axis: "x" | "y" | "both"): EditorZoom {
  const low = Math.max(axis === "y" ? 0 : 0.25 / value.width, axis === "x" ? 0 : 0.5 / value.vertical);
  const high = Math.min(axis === "y" ? Infinity : 0.8 / value.width, axis === "x" ? Infinity : 5 / value.vertical);
  const applied = Math.max(low, Math.min(high, factor));
  return { width: axis === "y" ? value.width : value.width * applied,
    vertical: axis === "x" ? value.vertical : value.vertical * applied };
}

export function useEditorViewportZoom(viewport: RefObject<HTMLDivElement | null>, ready: boolean) {
  const [width, setWidth] = useState(0);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const attachViewport = useCallback((node: HTMLDivElement | null) => {
    viewport.current = node;
    setElement(node);
  }, [viewport]);
  const [zoom, setZoom] = useState<EditorZoom>({ width: 2 / 3, vertical: 1 });
  const current = useRef(zoom); current.current = zoom;
  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => { setWidth(element.clientWidth); element.scrollLeft = 0; };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    const apply = (factor: number, axis: "x" | "y" | "both") => {
      const previous = current.current, next = scaleEditorZoom(previous, factor, axis);
      if (next.width === previous.width && next.vertical === previous.vertical) return;
      current.current = next; setZoom(next);
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault(); event.stopPropagation();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      apply(Math.exp(-delta * 0.002), "both");
    };
    let singleY: number | null = null;
    let pinch: { x: number; y: number; distance: number; axis: "x" | "y" | "both" } | null = null;
    let pinched = false;
    const pair = (touches: TouchList) => {
      const a = touches[0]!, b = touches[1]!;
      return { x: Math.abs(a.clientX - b.clientX), y: Math.abs(a.clientY - b.clientY),
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length < 2) { singleY = event.touches[0]?.clientY ?? null; return; }
      event.preventDefault(); pinched = true; singleY = null;
      const p = pair(event.touches);
      pinch = { ...p, axis: p.x > p.y * 2 ? "x" : p.y > p.x * 2 ? "y" : "both" };
    };
    const move = (event: TouchEvent) => {
      event.preventDefault();
      if (pinch && event.touches.length >= 2) {
        const p = pair(event.touches), before = pinch.axis === "x" ? pinch.x : pinch.axis === "y" ? pinch.y : pinch.distance;
        const after = pinch.axis === "x" ? p.x : pinch.axis === "y" ? p.y : p.distance;
        if (before > 0 && after > 0) apply(after / before, pinch.axis);
        pinch = { ...p, axis: pinch.axis };
      } else if (!pinched && singleY !== null && event.touches[0]) {
        element.scrollTop += singleY - event.touches[0].clientY; singleY = event.touches[0].clientY;
      }
    };
    const end = (event: TouchEvent) => {
      if (pinched) event.preventDefault();
      if (event.touches.length < 2) pinch = null;
      if (!event.touches.length) { pinched = false; singleY = null; }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("touchstart", start, { passive: false });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end, { passive: false });
    element.addEventListener("touchcancel", end, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener("wheel", wheel);
      element.removeEventListener("touchstart", start); element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end); element.removeEventListener("touchcancel", end); };
  }, [element, ready]);
  return { trackWidth: width * zoom.width, verticalZoom: zoom.vertical, attachViewport, viewportElement: element };
}
