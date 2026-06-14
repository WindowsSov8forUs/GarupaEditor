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
import ChartEditorController from "./app/ChartEditorController";
import { isMobileRuntime } from "./app/mobileRuntime";

const StaticChartRenderWindow = lazy(() => import("./app/StaticChartRenderWindow"));
const BuiltInSimulatorWindow = lazy(() => import("./app/BuiltInSimulatorWindow"));

type AppErrorBoundaryProps = {
  children: ReactNode;
  onRecover: () => void;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
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
  }

  private handleRecover = () => {
    this.setState({ hasError: false, message: "" });
    this.props.onRecover();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <section className="playfield-loading">
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

  const routeLoadingFallback = (
    <main className="app-shell">
      <section className="playfield-loading">加载中...</section>
    </main>
  );

  if (!mobileRuntime && isStaticRenderRoute) {
    return (
      <Suspense fallback={routeLoadingFallback}>
        <StaticChartRenderWindow />
      </Suspense>
    );
  }
  if (!mobileRuntime && isSimulatorRoute) {
    return (
      <Suspense fallback={routeLoadingFallback}>
        <BuiltInSimulatorWindow />
      </Suspense>
    );
  }

  return (
    <>
      <AppErrorBoundary key={appVersion} onRecover={() => setAppVersion((current) => current + 1)}>
        <ChartEditorController />
      </AppErrorBoundary>
      {mobileRuntime && (isStaticRenderRoute || isSimulatorRoute) ? (
        <div className="mobile-route-overlay" role="presentation">
          <Suspense fallback={routeLoadingFallback}>
            {isStaticRenderRoute ? <StaticChartRenderWindow /> : <BuiltInSimulatorWindow />}
          </Suspense>
        </div>
      ) : null}
    </>
  );
}

export default App;
