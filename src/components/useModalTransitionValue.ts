import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import { useModalTransition, type ModalTransitionPhase, type DialogMotion } from "./useModalTransition";

export function useModalTransitionValue<T>(
  value: T | null, motion: DialogMotion = "scale",
): { mounted: boolean; phase: ModalTransitionPhase; renderedValue: T | null; transitionStyle: CSSProperties; transitionRef: RefObject<HTMLDivElement | null> } {
  const open = value !== null;
  const { mounted, phase, transitionStyle, transitionRef } = useModalTransition(open, motion);
  const [lastValue, setLastValue] = useState<T | null>(value);

  useEffect(() => {
    if (value !== null) {
      setLastValue(value);
    }
  }, [value]);

  useEffect(() => {
    if (!mounted && value === null) {
      setLastValue(null);
    }
  }, [mounted, value]);

  return {
    mounted,
    phase,
    transitionStyle,
    transitionRef,
    renderedValue: value ?? lastValue,
  };
}
