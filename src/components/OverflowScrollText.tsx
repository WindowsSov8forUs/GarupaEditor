import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

type OverflowScrollTextProps = {
  text: string;
  className?: string;
};

export function OverflowScrollText({ text, className }: OverflowScrollTextProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLSpanElement | null>(null);
  const marqueeAnimationRef = useRef<Animation | null>(null);
  const resetAnimationRef = useRef<Animation | null>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  const recalcOverflow = useCallback(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) {
      return;
    }

    const containerWidth = container.getBoundingClientRect().width;
    const trackWidth = track.getBoundingClientRect().width;
    const distance = Math.ceil(trackWidth - containerWidth);
    setOverflowDistance(distance > 1 ? distance : 0);
  }, []);

  useLayoutEffect(() => {
    recalcOverflow();
  }, [recalcOverflow, text]);

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) {
      return;
    }

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        recalcOverflow();
      });
      observer.observe(container);
      observer.observe(track);
      return () => observer.disconnect();
    }

    const handleResize = () => {
      recalcOverflow();
    };
    window.addEventListener("resize", handleResize);
    const intervalId = window.setInterval(recalcOverflow, 300);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.clearInterval(intervalId);
    };
  }, [recalcOverflow, text]);

  useEffect(() => {
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fonts?.ready) {
      void fonts.ready.then(() => {
        recalcOverflow();
      });
    }
  }, [recalcOverflow, text]);

  const stopMarquee = useCallback((animateBack: boolean) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    marqueeAnimationRef.current?.cancel();
    marqueeAnimationRef.current = null;
    resetAnimationRef.current?.cancel();
    resetAnimationRef.current = null;

    if (!animateBack) {
      track.style.transform = "translateX(0px)";
      return;
    }

    const currentTransform = getComputedStyle(track).transform;
    if (currentTransform && currentTransform !== "none") {
      const resetAnimation = track.animate(
        [
          { transform: currentTransform },
          { transform: "translateX(0px)" },
        ],
        {
          duration: 220,
          easing: "linear",
          fill: "forwards",
        },
      );
      resetAnimationRef.current = resetAnimation;
      resetAnimation.onfinish = () => {
        track.style.transform = "translateX(0px)";
        if (resetAnimationRef.current === resetAnimation) {
          resetAnimationRef.current = null;
        }
      };
      return;
    }

    track.style.transform = "translateX(0px)";
  }, []);

  useEffect(() => {
    if (overflowDistance > 0) {
      return;
    }
    setIsHovering(false);
    stopMarquee(false);
  }, [overflowDistance, stopMarquee]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    if (!isHovering || overflowDistance <= 0) {
      stopMarquee(true);
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    stopMarquee(false);

    const speedPxPerSec = 44;
    const pauseMs = 750;
    const travelMs = Math.max(520, (overflowDistance / speedPxPerSec) * 1000);
    const totalMs = pauseMs + travelMs + pauseMs + travelMs;
    const pauseStartOffset = pauseMs / totalMs;
    const travelEndOffset = (pauseMs + travelMs) / totalMs;
    const pauseEndOffset = (pauseMs + travelMs + pauseMs) / totalMs;
    const target = `translateX(-${overflowDistance}px)`;

    const marqueeAnimation = track.animate(
      [
        { transform: "translateX(0px)", offset: 0 },
        { transform: "translateX(0px)", offset: pauseStartOffset },
        { transform: target, offset: travelEndOffset },
        { transform: target, offset: pauseEndOffset },
        { transform: "translateX(0px)", offset: 1 },
      ],
      {
        duration: totalMs,
        easing: "linear",
        iterations: Number.POSITIVE_INFINITY,
        fill: "both",
      },
    );
    marqueeAnimationRef.current = marqueeAnimation;

    return () => {
      if (marqueeAnimationRef.current === marqueeAnimation) {
        marqueeAnimation.cancel();
        marqueeAnimationRef.current = null;
      }
    };
  }, [isHovering, overflowDistance, stopMarquee]);

  useEffect(
    () => () => {
      marqueeAnimationRef.current?.cancel();
      resetAnimationRef.current?.cancel();
    },
    [],
  );

  const classNames = [
    className ?? "",
    "overflow-scroll-text",
    overflowDistance > 0 ? "is-overflowing" : "",
    isHovering ? "is-hovering" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style =
    overflowDistance > 0
      ? ({
          "--overflow-distance": `${overflowDistance}px`,
          "--overflow-duration": `${Math.min(14, Math.max(4, overflowDistance / 24 + 4)).toFixed(2)}s`,
        } as CSSProperties)
      : undefined;

  return (
    <span
      ref={containerRef}
      className={classNames}
      style={style}
      title={text}
      onMouseEnter={() => {
        if (overflowDistance > 0) {
          setIsHovering(true);
        }
      }}
      onMouseLeave={() => {
        setIsHovering(false);
      }}
    >
      <span ref={trackRef} className="overflow-scroll-track">
        {text}
      </span>
    </span>
  );
}
