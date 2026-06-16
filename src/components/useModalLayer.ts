import { useEffect, useMemo, useState, type CSSProperties } from "react";

const MODAL_LAYER_BASE_Z_INDEX = 20;
const MODAL_LAYER_STEP = 2;

let nextModalLayerId = 1;
const activeModalLayerIds: number[] = [];
const listeners = new Set<() => void>();

function notifyModalLayerChange(): void {
  listeners.forEach((listener) => listener());
}

export function useModalLayer(open: boolean, mounted: boolean): CSSProperties {
  const [layerId, setLayerId] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const listener = () => setRevision((current) => current + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setLayerId((currentLayerId) => {
        if (currentLayerId !== null) {
          return currentLayerId;
        }
        const nextLayerId = nextModalLayerId++;
        activeModalLayerIds.push(nextLayerId);
        notifyModalLayerChange();
        return nextLayerId;
      });
      return;
    }

    if (!mounted) {
      setLayerId((currentLayerId) => {
        if (currentLayerId === null) {
          return null;
        }
        const index = activeModalLayerIds.indexOf(currentLayerId);
        if (index >= 0) {
          activeModalLayerIds.splice(index, 1);
          notifyModalLayerChange();
        }
        return null;
      });
    }
  }, [mounted, open]);

  return useMemo(() => {
    if (layerId === null) {
      return {};
    }
    const layerIndex = Math.max(0, activeModalLayerIds.indexOf(layerId));
    return {
      zIndex: MODAL_LAYER_BASE_Z_INDEX + layerIndex * MODAL_LAYER_STEP,
    };
  }, [layerId, revision]);
}
