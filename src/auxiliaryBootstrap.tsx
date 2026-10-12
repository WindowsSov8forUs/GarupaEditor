import { presentAuxiliaryWindow } from "./app/RoutePresentation";
import { connectNativeDownloads } from "./services/downloadActivity";
import { DownloadOverlay } from "./app/DownloadOverlay";
import { appLog, initializeLogging, startOperation } from "./logging/applicationLogger";
import { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { UiViewportRoot } from "./components/UiViewport";
import { OriginalLoadingIndicators } from "./components/OriginalLoadingIndicators";
import "./App.css";
import { ApplicationResourceProvider } from "./resources/applicationResourceContext";
import { bootstrapApplicationResources } from "./resources/applicationResources";
import { SimulatorLoadingBoundary } from "./app/simulator/SimulatorLoadingBoundary";
import { isMobileRuntime } from "./app/mobileRuntime";

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode; onError?: (error: unknown) => void }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("App render error:", error, info.componentStack);
    this.props.onError?.(error);
    void presentAuxiliaryWindow();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="ui-fallback-page"
          style={{
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "var(--text)",
          }}
        >
          <section className="ui-fallback-content ui-design-scale"
            style={{
              border: "1px solid var(--line)",
              borderRadius: "12px",
              background: "var(--panel)",
              padding: "16px",
              maxWidth: "min(640px, var(--ui-safe-logical-width))",
              width: "100%",
            }}
          >
            <h2 style={{ marginTop: 0 }}>界面渲染发生异常</h2>
            <p style={{ marginBottom: "12px" }}>请把下面错误内容发给开发者：</p>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "#ffd6de",
                fontFamily: "Consolas, monospace",
              }}
            >
              {this.state.message || "Unknown error"}
            </pre>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

initializeLogging();
const finishBootstrap = startOperation("application.bootstrap");
const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const renderApplication = (content: ReactNode) => root.render(<UiViewportRoot>{content}</UiViewportRoot>);

const simulatorWindow = window.location.hash.startsWith("#simulator") && !isMobileRuntime();

void connectNativeDownloads().then(() => bootstrapApplicationResources()).then(async (resources) => {
  finishBootstrap(resources.status === "rejected" ? resources.failure : undefined);
  renderApplication(
    <AppErrorBoundary>
      {resources.status === "accepted" ? (
        <ApplicationResourceProvider manager={resources.value}>
          {simulatorWindow ? <SimulatorLoadingBoundary><App /></SimulatorLoadingBoundary> : <App />}
          <OriginalLoadingIndicators /><DownloadOverlay />
        </ApplicationResourceProvider>
      ) : (
        <main className="ui-fallback-page">
          <section className="ui-fallback-content ui-design-scale">
            资源系统初始化失败：{resources.failure.capability}：{resources.failure.boundary}
          </section>
        </main>
      )}
    </AppErrorBoundary>,
  );
  if (resources.status === "rejected") await presentAuxiliaryWindow();
}).catch(async (error: unknown) => {
  finishBootstrap(error); appLog("error", "application.bootstrap.exception", { error });
  renderApplication(<main className="ui-fallback-page"><section className="ui-fallback-content ui-design-scale">资源系统初始化失败：{error instanceof Error ? error.message : String(error)}</section></main>);
  await presentAuxiliaryWindow();
});
