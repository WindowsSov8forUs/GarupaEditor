import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OriginalSprite } from "./OriginalUi";

/*
 * The original scroll bar (UIScrollView's, as the profile's note statistics page draws it: Background scrollbar_base
 * and Thumb scrollbar_top, 8 wide, sliced) beside a scrolling host element, for content the host scrolls natively.
 */
const BAR_WIDTH = 8;
/** The bar's left edge past the scrolling element's right edge, and its track inset from the element's top and bottom
 * (the note statistics' bar: 295 − 575 / 2 out, its 282 track in a 300 view). */
const BAR_OFFSET = 295 - 575 / 2 - BAR_WIDTH / 2;
const TRACK_INSET = (300 - 282) / 2;
const MIN_THUMB = 24;

type Metrics = { left: number; top: number; width: number; height: number; scrollTop: number; scrollHeight: number };

function measure(element: HTMLElement): Metrics {
  return { left: element.offsetLeft, top: element.offsetTop, width: element.offsetWidth, height: element.clientHeight,
    scrollTop: element.scrollTop, scrollHeight: element.scrollHeight };
}

/** The bar for `target`, drawn in its offset parent while it can scroll; the thumb drags it. */
export function OriginalScrollBar({ target }: { target: HTMLElement }) {
  const [metrics, setMetrics] = useState(() => measure(target));
  const drag = useRef<{ pointer: number; y: number; scrollTop: number } | null>(null);
  useEffect(() => {
    const update = () => setMetrics(previous => {
      const next = measure(target);
      return (Object.keys(next) as (keyof Metrics)[]).every(key => next[key] === previous[key]) ? previous : next;
    });
    update();
    target.addEventListener("scroll", update, { passive: true });
    target.addEventListener("input", update);
    const resize = new ResizeObserver(update);
    resize.observe(target);
    const mutation = new MutationObserver(update);
    mutation.observe(target, { childList: true, subtree: true, characterData: true });
    return () => {
      target.removeEventListener("scroll", update);
      target.removeEventListener("input", update);
      resize.disconnect(); mutation.disconnect();
    };
  }, [target]);
  const host = target.offsetParent;
  const maximum = metrics.scrollHeight - metrics.height;
  if (!(host instanceof HTMLElement) || maximum <= 1) return null;
  const track = Math.max(0, metrics.height - 2 * TRACK_INSET);
  const thumb = Math.min(track, Math.max(MIN_THUMB, track * metrics.height / metrics.scrollHeight));
  const thumbTop = (track - thumb) * Math.min(1, Math.max(0, metrics.scrollTop / maximum));
  return createPortal(<div className="original-scroll-bar" aria-hidden="true" style={{ position: "absolute",
    left: metrics.left + metrics.width + BAR_OFFSET, top: metrics.top + TRACK_INSET, width: BAR_WIDTH, height: track,
    zIndex: 20 }}>
    <OriginalSprite sprite="scrollbar_base" atlas="menu" scale={1} spriteType={1}
      style={{ position: "absolute", left: 0, top: 0, width: BAR_WIDTH, height: track, pointerEvents: "none" }} />
    <OriginalSprite sprite="scrollbar_top" atlas="menu" scale={1} spriteType={1}
      style={{ position: "absolute", left: 0, top: thumbTop, width: BAR_WIDTH, height: thumb, cursor: "pointer" }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, y: event.clientY, scrollTop: target.scrollTop };
      }}
      onPointerMove={event => {
        const state = drag.current;
        if (!state || state.pointer !== event.pointerId || track <= thumb) return;
        // Screen px to the bar's own px (the dialog is scaled), then to scroll px.
        const scale = event.currentTarget.getBoundingClientRect().height / thumb || 1;
        target.scrollTop = state.scrollTop + (event.clientY - state.y) / scale * maximum / (track - thumb);
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
  </div>, host);
}

/** Scroll bars for every element matching `selector` under `root`, kept as the content changes. */
export function OriginalScrollBars({ root, selector }: { root: HTMLElement | null; selector: string }) {
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  useEffect(() => {
    if (!root) return;
    const collect = () => setTargets(previous => {
      const next = [...root.querySelectorAll<HTMLElement>(selector)];
      return next.length === previous.length && next.every((element, index) => element === previous[index]) ? previous : next;
    });
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [root, selector]);
  return <>{targets.map((target, index) => <OriginalScrollBar key={index} target={target} />)}</>;
}
