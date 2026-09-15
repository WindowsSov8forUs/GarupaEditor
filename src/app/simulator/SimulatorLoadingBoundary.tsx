import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { SimulatorResultPreparation } from "../../simulator/host/resultPresentation";
import { SimulatorLoadingScreen } from "./SimulatorLoadingScreen";

const preparationStages = ["module", "media", "platform", "availability", "lease", "rendering", "presentation"] as const;
type PreparationStage = typeof preparationStages[number];
interface LoadingOwner {
  report(stage: PreparationStage, progress?: number): void;
  finish(): void;
  beginResult(): SimulatorResultPreparation;
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
  const [resultLoading, setResultLoading] = useState<{ progress: number; onReady(error?: unknown): void } | null>(null);
  const resultOwner = useRef<SimulatorResultPreparation | null>(null);
  const beginResult = useCallback((): SimulatorResultPreparation => {
    if (resultOwner.current !== null) throw new Error("Result preparation already has a loading owner.");
    let settleReady!: () => void, failReady!: (error: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => { settleReady = resolve; failReady = reject; });
    let stopped = false;
    let paintFrame: number | null = null;
    let paintTask: ReturnType<typeof setTimeout> | null = null;
    const onReady = (error?: unknown) => {
      if (stopped) return;
      if (error !== undefined) { failReady(error); return; }
      // Present the prepared loading surface before synchronous scene work.
      // This is a paint boundary, not a minimum loading duration.
      paintFrame = requestAnimationFrame(() => {
        paintTask = setTimeout(() => { if (!stopped) settleReady(); }, 0);
      });
    };
    const owner: SimulatorResultPreparation = {
      ready,
      async report(completed, total) {
        if (stopped) throw new Error("Result loading was closed during preparation.");
        setResultLoading(current => current === null ? null : { ...current, progress: completed / total });
        // Yield between real decode/build units so input and progress can paint.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      },
      finish() {
        if (stopped) return;
        stopped = true;
        if (paintFrame !== null) cancelAnimationFrame(paintFrame);
        if (paintTask !== null) clearTimeout(paintTask);
        failReady(new Error("Result loading ended before readiness."));
        resultOwner.current = null;
        setResultLoading(null);
      },
    };
    resultOwner.current = owner;
    flushSync(() => setResultLoading({ progress: 0, onReady }));
    return owner;
  }, []);
  useEffect(() => () => resultOwner.current?.finish(false), []);
  const report = useCallback((stage: PreparationStage, progress = 1) => {
    setStages((current) => (current[stage] ?? 0) >= progress ? current : { ...current, [stage]: progress });
  }, []);
  const finish = useCallback(() => setFinished(true), []);
  const owner = useMemo(() => ({ report, finish, beginResult }), [report, finish, beginResult]);
  // Count completed preparation stages, not elapsed time or estimated byte cost.
  const progress = (Number(resourcesReady) + preparationStages.reduce((sum, stage) => sum + (stages[stage] ?? 0), 0)) /
    (preparationStages.length + 1);
  return <LoadingContext.Provider value={owner}>
    {children}
    {!finished && <SimulatorLoadingScreen progress={progress} onReady={onReady} />}
    {resultLoading !== null && <SimulatorLoadingScreen progress={resultLoading.progress} onReady={resultLoading.onReady} ariaLabel="加载结算" />}
  </LoadingContext.Provider>;
}
