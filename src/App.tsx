import { PreparedRoute } from "./app/RoutePresentation";
import {
  Component,
  Suspense,
  lazy,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { StartupReadinessContext } from "./app/startupReadiness";
import { isMobileRuntime } from "./app/mobileRuntime";
import { SimulatorLoadingBoundary } from "./app/simulator/SimulatorLoadingBoundary";

const ChartEditorController = lazy(() => import("./app/ChartEditorController"));
let preparedEditor: typeof ChartEditorController | typeof import("./app/ChartEditorController").default;
const StaticChartRenderWindow = lazy(() => import("./app/StaticChartRenderWindow"));
const BuiltInSimulatorWindow = lazy(() => import("./app/BuiltInSimulatorWindow"));

export async function preloadApplicationRoutes() {
  await Promise.all([
    import("./app/ChartEditorController").then(module => { preparedEditor = module.default; }),
    import("./app/StaticChartRenderWindow"),
    import("./app/BuiltInSimulatorWindow"),
  ]);
}

type AppErrorBoundaryProps = {
  children: ReactNode;
  onRecover: () => void;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  static contextType = StartupReadinessContext;
  declare context: React.ContextType<typeof StartupReadinessContext>;
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Unhandled app render error:", error, info);
    this.context?.report("editor", false, String(error));
  }

  private handleRecover = () => {
    this.setState({ hasError: false, message: "" });
    this.props.onRecover();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <section className="playfield-loading ui-design-scale">
            界面渲染发生异常：{this.state.message || "未知错误"}
            <button type="button" onClick={this.handleRecover}>
              <span className="btn-content">重试</span>
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

function App() {
  const Editor = preparedEditor ?? ChartEditorController;
  const [appVersion, setAppVersion] = useState(0);
  const [hash, setHash] = useState(() =>
    typeof window !== "undefined" ? window.location.hash ?? "" : "",
  );
  const mobileRuntime = isMobileRuntime();

  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash ?? "");
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const isStaticRenderRoute = useMemo(() => hash.startsWith("#static-render"), [hash]);
  const isSimulatorRoute = useMemo(() => hash.startsWith("#simulator"), [hash]);

  const routeLoadingFallback = null;

  if (!mobileRuntime && isStaticRenderRoute) {
    return (
      <Suspense fallback={routeLoadingFallback}>
        <StaticChartRenderWindow />
      </Suspense>
    );
  }
  if (!mobileRuntime && isSimulatorRoute) {
    return (
      <SimulatorLoadingBoundary><Suspense fallback={null}>
        <BuiltInSimulatorWindow />
      </Suspense></SimulatorLoadingBoundary>
    );
  }

  return (
    <>
      <AppErrorBoundary key={appVersion} onRecover={() => setAppVersion((current) => current + 1)}>
        <Suspense fallback={routeLoadingFallback}>
          <Editor />
        </Suspense>
      </AppErrorBoundary>
      {mobileRuntime && (isStaticRenderRoute || isSimulatorRoute) ? (
        <div className="mobile-route-overlay" role="presentation" style={{ background: "transparent", pointerEvents: "none" }}>
          <PreparedRoute key={hash}>
          {isSimulatorRoute ? <SimulatorLoadingBoundary key={hash}>
            <Suspense fallback={null}><BuiltInSimulatorWindow /></Suspense>
          </SimulatorLoadingBoundary> : <Suspense fallback={routeLoadingFallback}>
            <StaticChartRenderWindow />
          </Suspense>}
          </PreparedRoute>
        </div>
      ) : null}
    </>
  );
}

export default App;
