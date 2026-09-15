import { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { ApplicationResourceProvider } from "./resources/applicationResourceContext";
import { bootstrapApplicationResources } from "./resources/applicationResources";
import { SimulatorLoadingBoundary } from "./app/simulator/SimulatorLoadingBoundary";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
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
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            color: "#ecf7fb",
            background: "#0b1724",
            fontFamily: "Rajdhani, Noto Sans SC, sans-serif",
            padding: "20px",
          }}
        >
          <section
            style={{
              border: "1px solid rgba(114,214,229,0.45)",
              borderRadius: "12px",
              background: "rgba(8,23,34,0.9)",
              padding: "16px",
              maxWidth: "640px",
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

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

const simulatorWindow = window.location.hash.startsWith("#simulator") && !isMobileRuntime();
async function showSimulatorWindow(): Promise<void> {
  if (simulatorWindow && isTauri() && !isMobileRuntime()) await getCurrentWebviewWindow().show();
}

void bootstrapApplicationResources(simulatorWindow ? async (manager) => {
  await new Promise<void>((resolve, reject) => {
    root.render(<AppErrorBoundary onError={reject}><ApplicationResourceProvider manager={manager}>
      <SimulatorLoadingBoundary resourcesReady={false} onReady={(error) => error === undefined ? resolve() : reject(error)} />
    </ApplicationResourceProvider></AppErrorBoundary>);
  });
  await showSimulatorWindow();
} : undefined).then(async (resources) => {
  root.render(
    <AppErrorBoundary>
      {resources.status === "accepted" ? (
        <ApplicationResourceProvider manager={resources.value}>
          {simulatorWindow ? <SimulatorLoadingBoundary><App /></SimulatorLoadingBoundary> : <App />}
        </ApplicationResourceProvider>
      ) : (
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "20px" }}>
          <section>
            资源系统初始化失败：{resources.failure.capability}：{resources.failure.boundary}
          </section>
        </main>
      )}
    </AppErrorBoundary>,
  );
  if (resources.status === "rejected") await showSimulatorWindow();
}).catch(async (error: unknown) => {
  root.render(<main style={{ padding: 20 }}>资源系统初始化失败：{error instanceof Error ? error.message : String(error)}</main>);
  await showSimulatorWindow();
});
