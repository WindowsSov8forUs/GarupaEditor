import React, { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ApplicationResourceProvider } from "./resources/applicationResourceContext";
import { bootstrapApplicationResources } from "./resources/applicationResources";

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
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

void bootstrapApplicationResources().then((resources) => {
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        {resources.status === "accepted" ? (
          <ApplicationResourceProvider manager={resources.value}>
            <App />
          </ApplicationResourceProvider>
        ) : (
          <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "20px" }}>
            <section>
              资源系统初始化失败：{resources.failure.capability}：{resources.failure.boundary}
            </section>
          </main>
        )}
      </AppErrorBoundary>
    </React.StrictMode>,
  );
});
