import { useEffect, useRef, useState } from "react";

export type ModalTransitionPhase = "enter" | "exit";

const DEFAULT_EXIT_DURATION_MS = 180;

export function useModalTransition(
  open: boolean,
  exitDurationMs: number = DEFAULT_EXIT_DURATION_MS,
): { mounted: boolean; phase: ModalTransitionPhase } {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<ModalTransitionPhase>(open ? "enter" : "exit");
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }

    if (open) {
      setMounted(true);
      setPhase("enter");
      return;
    }

    if (!mounted) {
      return;
    }

    setPhase("exit");
    exitTimerRef.current = window.setTimeout(() => {
      setMounted(false);
      exitTimerRef.current = null;
    }, exitDurationMs);

    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [open, mounted, exitDurationMs]);

  return { mounted, phase };
}
