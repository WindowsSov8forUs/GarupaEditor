import { useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";

let nextId = 1;
let revision = 0;
const active: number[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => revision;
const notify = () => { revision += 1; listeners.forEach(listener => listener()); };

/** Retain input ownership until the exit animation finishes, including forced unmounts. */
export function useModalLayer(_open: boolean, mounted: boolean): CSSProperties {
  const id = useRef<number | null>(null);
  if (id.current === null) id.current = nextId++;
  useSyncExternalStore(subscribe, snapshot, snapshot);
  useLayoutEffect(() => {
    if (!mounted) return;
    const current = id.current!;
    active.push(current); notify();
    return () => {
      const index = active.indexOf(current);
      if (index >= 0) { active.splice(index, 1); notify(); }
    };
  }, [mounted]);
  const index = active.indexOf(id.current);
  return { zIndex: 20 + Math.max(0, index) * 2,
    pointerEvents: index < 0 || active[active.length - 1] === id.current ? "auto" : "none" };
}
