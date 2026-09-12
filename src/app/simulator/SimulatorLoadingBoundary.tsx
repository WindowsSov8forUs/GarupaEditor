import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SimulatorLoadingScreen } from "./SimulatorLoadingScreen";

const preparationStages = ["module", "media", "platform", "availability", "lease", "rendering", "presentation"] as const;
type PreparationStage = typeof preparationStages[number];
interface LoadingOwner {
  report(stage: PreparationStage, progress?: number): void;
  finish(): void;
}
const LoadingContext = createContext<LoadingOwner | null>(null);

export function useSimulatorLoading(): LoadingOwner {
  const owner = useContext(LoadingContext);
  if (owner === null) throw new Error("Simulator loading owner is not installed.");
  return owner;
}

export function SimulatorLoadingBoundary(props: {
  children?: ReactNode;
  resourcesReady?: boolean;
  onReady?: (error?: unknown) => void;
}) {
  const existing = useContext(LoadingContext);
  // The desktop bootstrap already owns this screen. Mobile routes own one here.
  return existing === null ? <LoadingOwnerBoundary {...props} /> : props.children;
}

function LoadingOwnerBoundary({ children, resourcesReady = true, onReady }: {
  children?: ReactNode;
  resourcesReady?: boolean;
  onReady?: (error?: unknown) => void;
}) {
  const [stages, setStages] = useState<Partial<Record<PreparationStage, number>>>({});
  const [finished, setFinished] = useState(false);
  const report = useCallback((stage: PreparationStage, progress = 1) => {
    setStages((current) => (current[stage] ?? 0) >= progress ? current : { ...current, [stage]: progress });
  }, []);
  const finish = useCallback(() => setFinished(true), []);
  const owner = useMemo(() => ({ report, finish }), [report, finish]);
  // Count completed preparation stages, not elapsed time or estimated byte cost.
  const progress = (Number(resourcesReady) + preparationStages.reduce((sum, stage) => sum + (stages[stage] ?? 0), 0)) /
    (preparationStages.length + 1);
  return <LoadingContext.Provider value={owner}>
    {children}
    {!finished && <SimulatorLoadingScreen progress={progress} onReady={onReady} />}
  </LoadingContext.Provider>;
}
