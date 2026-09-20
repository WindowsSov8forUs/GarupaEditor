import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { SerializedDialogMotion, SerializedSettingsDialogMotion } from "./SerializedDialogMotion";

export type ModalTransitionPhase = "enter" | "exit";
export type DialogMotion = "scale" | "slide-left" | "none";

export function useModalTransition(open: boolean, motionKind: DialogMotion = "scale", holdEnter = false): {
  mounted: boolean; phase: ModalTransitionPhase; shown: boolean; transitionStyle: CSSProperties;
  transitionRef: RefObject<HTMLDivElement | null>;
} {
  const motion = useRef(motionKind === "slide-left" ? new SerializedSettingsDialogMotion() : new SerializedDialogMotion());
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const transitionRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const model = motion.current;
    let started = 0;
    setShown(false);
    if (open) setMounted(true);
    if (open && holdEnter) return;
    if (motionKind === "none") { setMounted(open); setShown(open); return; }
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const update = () => {
      const now = reduced ? started + SerializedDialogMotion.duration + 0.001 : performance.now() / 1000;
      const visible = model.update(now);
      // Only update the presentation node; do not rerender the entire settings form each frame.
      transitionRef.current?.style.setProperty("--original-dialog-scale", String(model.scale));
      transitionRef.current?.style.setProperty("--original-dialog-alpha", String(model.alpha));
      transitionRef.current?.style.setProperty("--original-dialog-x", String("x" in model ? model.x : 0));
      if (!visible) setMounted(false);
      if (now - started >= SerializedDialogMotion.duration) setShown(open);
      if (now - started < SerializedDialogMotion.duration) frame = requestAnimationFrame(update);
    };
    const begin = () => {
      // Start at presentation, not before React commits the settings page and its resources.
      started = performance.now() / 1000;
      model.setOpen(open, started, motionKind === "slide-left" ? 0 : 0.01);
      if (reduced) model.update(started);
      update();
    };
    frame = requestAnimationFrame(begin);
    return () => cancelAnimationFrame(frame);
  }, [open, motionKind, holdEnter]);
  return {
    mounted: open || mounted,
    phase: open ? "enter" : "exit",
    shown: open && shown,
    transitionRef,
    transitionStyle: {
      "--original-dialog-scale": motionKind === "none" ? 1 : motion.current.scale,
      "--original-dialog-alpha": motionKind === "none" ? (open ? 0.5 : 0) : motion.current.alpha,
      "--original-dialog-x": "x" in motion.current ? motion.current.x : 0,
    } as CSSProperties,
  };
}
