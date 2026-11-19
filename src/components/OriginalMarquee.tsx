import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

/*
 * The original marquee (StarUIMarqueeLabel, CN 10.1.3): a soft clipped panel (softness 4) with the text's left edge 2
 * in from its left; when the text is wider than the panel less both softnesses it moves left at 100 × speed (1) px/s,
 * linearly, after 1 s, until its right edge reaches the panel's left edge, then restarts from the panel's right edge
 * with no delay, forever. Otherwise it stays put.
 */
export const ORIGINAL_MARQUEE = { softness: 4, inset: 2, speed: 100, delay: 1000 };

/** The panel's soft left and right edges, as a CSS mask. */
export const ORIGINAL_MARQUEE_MASK = `linear-gradient(to right, transparent, #000 ${ORIGINAL_MARQUEE.softness}px, `
  + `#000 calc(100% - ${ORIGINAL_MARQUEE.softness}px), transparent)`;

/** Whether text this wide scrolls in a panel this wide. */
export function originalMarqueeScrolls(textWidth: number, panelWidth: number): boolean {
  return textWidth > panelWidth - 2 * ORIGINAL_MARQUEE.softness;
}

/** Runs the marquee on `track` (the moving text, at the panel's left) while the text is too wide for the panel. */
export function useOriginalMarquee(track: RefObject<HTMLElement | null>, textWidth: number, panelWidth: number) {
  useLayoutEffect(() => {
    const element = track.current;
    if (!element || !originalMarqueeScrolls(textWidth, panelWidth)) return;
    const end = -textWidth;
    const pass = (from: number, delay: number, iterations: number) => element.animate(
      [{ transform: `translateX(${from}px)` }, { transform: `translateX(${end}px)` }],
      { duration: (from - end) / ORIGINAL_MARQUEE.speed * 1000, delay, iterations, easing: "linear", fill: "both" });
    let loop: Animation | null = null;
    const first = pass(ORIGINAL_MARQUEE.inset, ORIGINAL_MARQUEE.delay, 1);
    first.onfinish = () => { loop = pass(panelWidth, 0, Infinity); first.cancel(); };
    return () => { first.cancel(); loop?.cancel(); };
  }, [track, textWidth, panelWidth]);
}

/** The width of an element's content, kept as it changes. */
export function useMeasuredWidth(element: RefObject<HTMLElement | null>, key: unknown): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const target = element.current;
    if (!target) return;
    const update = () => setWidth(target.offsetWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    return () => observer.disconnect();
  }, [element, key]);
  return width;
}

/**
 * One line of text `width` × `height`: centred when it fits, scrolled as the original marquee when it is wider.
 * The text takes `textStyle` (font size, colour).
 */
export function OriginalMarqueeText({ text, width, height, textStyle }: {
  text: string; width: number; height: number; textStyle?: CSSProperties;
}) {
  const track = useRef<HTMLDivElement>(null);
  const measured = useRef<HTMLSpanElement>(null);
  const textWidth = useMeasuredWidth(measured, text);
  const scrolls = originalMarqueeScrolls(textWidth, width);
  useOriginalMarquee(track, scrolls ? textWidth : 0, width);
  return <div style={{ position: "relative", width, height, overflow: "hidden",
    ...(scrolls ? { maskImage: ORIGINAL_MARQUEE_MASK, WebkitMaskImage: ORIGINAL_MARQUEE_MASK } : {}) }}>
    <div ref={track} style={{ position: "absolute", top: 0, height, lineHeight: `${height}px`, whiteSpace: "pre",
      left: scrolls ? 0 : Math.max(0, (width - textWidth) / 2),
      transform: scrolls ? `translateX(${ORIGINAL_MARQUEE.inset}px)` : undefined }}>
      <span ref={measured} style={textStyle}>{text}</span>
    </div>
  </div>;
}
