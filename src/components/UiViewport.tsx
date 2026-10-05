import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useUiViewport } from "./useUiViewport";
import "./UiViewport.css";

/** Window-level values also reach portals, bootstrap screens and separate window routes. */
export function UiViewportRoot({ children }: { children: ReactNode }) {
  const view = useUiViewport();
  useLayoutEffect(() => {
    const root = document.documentElement;
    const values = {
      "--ui-scale": String(view.scale),
      "--ui-logical-width": `${view.logicalWidth}px`,
      "--ui-logical-height": `${view.logicalHeight}px`,
      "--ui-safe-left": `${view.safeInsets.left}px`, "--ui-safe-right": `${view.safeInsets.right}px`,
      "--ui-safe-top": `${view.safeInsets.top}px`, "--ui-safe-bottom": `${view.safeInsets.bottom}px`,
      "--ui-safe-logical-width": `${(view.width - view.safeInsets.left - view.safeInsets.right) / view.scale}px`,
      "--ui-safe-logical-height": `${(view.height - view.safeInsets.top - view.safeInsets.bottom) / view.scale}px`,
    };
    for (const [key, value] of Object.entries(values)) root.style.setProperty(key, value);
    root.dataset.uiLayout = view.stacked ? "stacked" : "columns";
  }, [view]);
  return children;
}

/** A page receives its actual allocated region in design units, with one projection. */
export function UiPageViewport({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const { scale, width: windowWidth, height: windowHeight } = useUiViewport();
  const [size, setSize] = useState({ width: 0, height: 0, left: 0, top: 0 });
  useLayoutEffect(() => {
    const element = host.current!;
    const measure = () => setSize(previous => {
      const width = element.clientWidth, height = element.clientHeight;
      const { left, top } = element.getBoundingClientRect();
      return previous.width === width && previous.height === height && previous.left === left && previous.top === top
        ? previous : { width, height, left, top };
    });
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, [scale, windowWidth, windowHeight]);
  return <div ref={host} className="ui-page-viewport">
    <div className="ui-page-design ui-design-scale" style={{ width: size.width / scale, height: size.height / scale,
      "--ui-page-window-center-x": `${(windowWidth / 2 - size.left) / scale}px`,
      "--ui-page-window-center-y": `${(windowHeight / 2 - size.top) / scale}px`,
    } as CSSProperties}>
      {children}
    </div>
  </div>;
}

/** Source coordinates are centered for prefabs, top-left for ordinary authored scenes. */
export function UiAuthoredSurface({ width, height, centered = true, className = "", style, children }: {
  width: number; height: number; centered?: boolean; className?: string; style?: CSSProperties; children: ReactNode;
}) {
  const { scale } = useUiViewport();
  return <div className={`ui-authored-surface ${className}`} style={{ ...style, width: width * scale, height: height * scale }}>
    <UiScaleOrigin centered={centered}>{children}</UiScaleOrigin>
  </div>;
}

export function UiScaleOrigin({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return <div className={`ui-scale-origin${centered ? " is-centered" : ""}`}>{children}</div>;
}

/** Component fit inside an already projected design region, not another window projection. */
export function UiFitSurface({ width, height, fillSlot = false, children }: {
  width: number; height: number; fillSlot?: boolean; children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = host.current!;
    const measure = () => setAvailable(previous => {
      const width = element.clientWidth, height = element.clientHeight;
      return previous.width === width && previous.height === height ? previous : { width, height };
    });
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  const scale = fillSlot ? Math.min(available.width / width, available.height / height) : Math.min(1, available.width / width);
  return <div ref={host} className="ui-fit-surface" style={{ maxWidth: fillSlot ? undefined : width, height: fillSlot ? "100%" : height * scale }}>
    <div style={{ position: "absolute", left: fillSlot ? (available.width - width * scale) / 2 : 0,
      top: fillSlot ? (available.height - height * scale) / 2 : 0,
      transform: `scale(${scale})`, transformOrigin: "0 0" }}>{children}</div>
  </div>;
}
