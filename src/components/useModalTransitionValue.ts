import { useEffect, useState } from "react";
import { useModalTransition, type ModalTransitionPhase } from "./useModalTransition";

export function useModalTransitionValue<T>(
  value: T | null,
): { mounted: boolean; phase: ModalTransitionPhase; renderedValue: T | null } {
  const open = value !== null;
  const { mounted, phase } = useModalTransition(open);
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
    renderedValue: value ?? lastValue,
  };
}
