import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SimulatorResultPreparation } from "../../simulator/host/resultPresentation";
import { originalLoading } from "../../components/originalLoadingState";
import { usePresentRoute } from "../RoutePresentation";
const preparationStages = ["module", "media", "platform", "availability", "lease", "rendering", "presentation"] as const;
type PreparationStage = typeof preparationStages[number];
interface LoadingOwner { report(stage: PreparationStage, progress?: number): void; finish(): void; beginResult(): SimulatorResultPreparation }
const LoadingContext = createContext<LoadingOwner | null>(null);
export function useSimulatorLoading(): LoadingOwner {
  const owner = useContext(LoadingContext); if (!owner) throw new Error("Simulator loading owner is not installed."); return owner;
}
export function SimulatorLoadingBoundary({ children }: { children?: ReactNode }) {
  const existing = useContext(LoadingContext);
  return existing ? children : <LoadingOwnerBoundary>{children}</LoadingOwnerBoundary>;
}
function LoadingOwnerBoundary({ children }: { children?: ReactNode }) {
  const [finished, setFinished] = useState(false);
  const present = usePresentRoute();
  useEffect(() => { if (!finished) return originalLoading.hold("network", {}).release; }, [finished]);
  const resultOwner = useRef<SimulatorResultPreparation | null>(null);
  const beginResult = useCallback((): SimulatorResultPreparation => {
    if (resultOwner.current) throw new Error("Result preparation already has a loading owner.");
    const lease = originalLoading.hold("network", {});
    let stopped = false;
    const owner: SimulatorResultPreparation = {
      // Yield for the indicator while the existing gameplay surface remains visible.
      ready: new Promise<void>(resolve => setTimeout(resolve, 0)),
      async report() { if (stopped) throw new Error("Result preparation was cancelled."); await new Promise(resolve => setTimeout(resolve, 0)); },
      finish() { if (stopped) return; stopped = true; lease.release(); resultOwner.current = null; },
    };
    resultOwner.current = owner; return owner;
  }, []);
  useEffect(() => () => resultOwner.current?.finish(false), []);
  const report = useCallback((_stage: PreparationStage, _progress?: number) => {}, []);
  const finish = useCallback(() => { setFinished(true); present(); }, [present]);
  const owner = useMemo(() => ({ report, finish, beginResult }), [report, finish, beginResult]);
  return <LoadingContext.Provider value={owner}><div style={{ position: "absolute", inset: 0, opacity: finished ? 1 : 0, visibility: finished ? "visible" : "hidden" }} inert={!finished}>{children}</div></LoadingContext.Provider>;
}
