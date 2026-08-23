import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import { installProductionAutonomousSimulatorPlatform } from "../simulator/platform/platformComposition";
import type { AutonomousSimulatorPlatformCapabilities } from "../simulator/platform/platformComposition";
import { launchSimulatorModule } from "../simulator/public";
import { buildSimulatorLaunchRequest } from "./simulator/buildSimulatorLaunchRequest";
import { createBrowserAudioContextCapability } from "./simulator/browserAudioContextCapability";
import { createBrowserSimulatorPlatform } from "./simulator/browserSimulatorPlatform";
import {
  BrowserSimulatorLaunchDependencyError,
  BrowserSimulatorLaunchOwner,
  type BrowserSimulatorLaunchPlatformOwner,
  type BrowserSimulatorLaunchState,
} from "./simulator/browserSimulatorLaunchOwner";
import { createSimulatorResourceCapability } from "./simulator/createSimulatorResourceCapability";
import {
  SIMULATOR_WINDOW_CLOSED_EVENT,
  SIMULATOR_WINDOW_PAYLOAD_EVENT,
  SIMULATOR_WINDOW_READY_EVENT,
  type SimulatorLaunchTransportDescriptor,
  type SimulatorWindowPayloadEnvelope,
} from "./simulator/transportContracts";
import {
  isMobileRuntime,
  navigateBackToEditor,
  readMobileRoutePayload,
  removeMobileRoutePayload,
  setMobileSimulatorImmersive,
} from "./mobileRuntime";
import "../App.css";

const INITIAL_LAUNCH_STATE: BrowserSimulatorLaunchState = Object.freeze({
  phase: "waiting-descriptor",
  failure: null,
});

function routeRequestId(): string {
  const hash = window.location.hash ?? "";
  const query = hash.indexOf("?");
  if (query < 0) return "";
  return new URLSearchParams(hash.slice(query + 1)).get("request") ?? "";
}

function BuiltInSimulatorWindow() {
  const manager = useApplicationResourceManager();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const ownerRef = useRef<BrowserSimulatorLaunchOwner | null>(null);
  const [descriptor, setDescriptor] = useState<SimulatorLaunchTransportDescriptor | null>(null);
  const [launchState, setLaunchState] = useState<BrowserSimulatorLaunchState>(INITIAL_LAUNCH_STATE);
  const [transportFailure, setTransportFailure] = useState<string | null>(null);
  const requestId = routeRequestId();
  const mobile = isMobileRuntime();

  useEffect(() => {
    if (!mobile) return;
    return () => {
      try { setMobileSimulatorImmersive(false); } catch { /* terminal platform teardown */ }
    };
  }, [mobile]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void | Promise<void>) | null = null;
    void (async () => {
      if (requestId.length === 0) throw new Error("缺少播放器请求标识。");
      if (mobile) {
        const envelope = readMobileRoutePayload<SimulatorWindowPayloadEnvelope>(requestId);
        if (envelope?.requestId !== requestId || envelope.descriptor?.requestId !== requestId) {
          throw new Error("移动端播放器快照不可用。");
        }
        removeMobileRoutePayload(requestId);
        if (!disposed) setDescriptor(envelope.descriptor);
        return;
      }
      const current = getCurrentWebviewWindow();
      unlisten = await current.listen<SimulatorWindowPayloadEnvelope>(SIMULATOR_WINDOW_PAYLOAD_EVENT, (event) => {
        const envelope = event.payload;
        if (
          disposed || ownerRef.current !== null ||
          envelope?.requestId !== requestId || envelope.descriptor?.requestId !== requestId
        ) return;
        setDescriptor(envelope.descriptor);
      });
      await emit(SIMULATOR_WINDOW_READY_EVENT, { requestId, label: current.label });
    })().catch((error) => {
      if (!disposed) setTransportFailure(error instanceof Error ? error.message : String(error));
    });
    return () => {
      disposed = true;
      if (unlisten !== null) void unlisten();
    };
  }, [mobile, requestId]);

  useEffect(() => {
    if (
      descriptor === null || hostRef.current === null || ownerRef.current !== null ||
      transportFailure !== null
    ) return;
    const host = hostRef.current;
    const owner = new BrowserSimulatorLaunchOwner(
      requestId,
      descriptor,
      {
        async lockWindow() {
          if (mobile) return;
          const current = getCurrentWebviewWindow();
          await current.setResizable(false);
          if (await current.isResizable()) {
            throw dependencyFailure(
              "app.simulator.window-resize-lock-failed",
              "The independent Simulator window could not retain its frozen initial backing-store geometry.",
            );
          }
        },
        async refreshCatalog() {
          const refreshed = await manager.refreshCatalog("bestdori");
          if (refreshed.status === "rejected") throw dependencyFailure(
            refreshed.failure.capability,
            refreshed.failure.boundary,
          );
        },
        async acquireMedia(snapshotId) {
          const media = await manager.acquireSnapshot(snapshotId);
          if (media.status === "rejected") throw dependencyFailure(
            media.failure.capability,
            media.failure.boundary,
          );
          return media.value;
        },
        buildRequest: buildSimulatorLaunchRequest,
        createAudio: createBrowserAudioContextCapability,
        async createPlatform(audioContext): Promise<BrowserSimulatorLaunchPlatformOwner> {
          return createBrowserSimulatorPlatform({
            host,
            audioContext,
            resources: createSimulatorResourceCapability(manager, "jp"),
            safeArea: mobile ? "css-safe-area" : "full-surface",
            onLifecycleState: () => {},
          });
        },
        validatePlatform(platformOwner) {
          const platform = platformOwner.platform as AutonomousSimulatorPlatformCapabilities;
          const initialSurface = platform.graphics.readSurfaceState();
          if (mobile && initialSurface.viewportWidth < initialSurface.viewportHeight) {
            throw dependencyFailure(
              "app.simulator.mobile-portrait-initial-surface",
              "移动端Simulator只接受初始横屏backing store，禁止portrait默认或旋转修复。",
            );
          }
        },
        installPlatform(platformValue) {
          const installed = installProductionAutonomousSimulatorPlatform(
            platformValue as AutonomousSimulatorPlatformCapabilities,
          );
          if (installed.status === "rejected") throw dependencyFailure(
            installed.failure.capability,
            installed.failure.boundary,
          );
        },
        launch: launchSimulatorModule,
        async publishClosed(result) {
          await emit(SIMULATOR_WINDOW_CLOSED_EVENT, { requestId, ...result });
        },
        async leaveHost() {
          if (mobile) navigateBackToEditor();
          else await getCurrentWebviewWindow().close();
        },
      },
      setLaunchState,
    );
    ownerRef.current = owner;
    void owner.begin();
  }, [descriptor, manager, mobile, requestId, transportFailure]);

  useEffect(() => () => {
    const owner = ownerRef.current;
    ownerRef.current = null;
    if (owner !== null) void owner.dispose();
  }, []);

  const activateAudioFromPointer = useCallback(() => {
    const pending = ownerRef.current?.activateFromPointer();
    if (pending !== undefined) void pending;
  }, []);

  const leavePlayer = useCallback(async () => {
    const owner = ownerRef.current;
    if (owner !== null) {
      await owner.requestExit();
      return;
    }
    await emit(SIMULATOR_WINDOW_CLOSED_EVENT, {
      requestId,
      status: transportFailure === null ? "closed" : "rejected",
      capability: transportFailure,
    });
    if (mobile) navigateBackToEditor();
    else await getCurrentWebviewWindow().close();
  }, [mobile, requestId, transportFailure]);

  const overlay = renderOverlay(
    launchState,
    transportFailure,
    activateAudioFromPointer,
    () => { void leavePlayer(); },
  );
  return (
    <main style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", background: "#02050d" }}>
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      {overlay}
    </main>
  );
}

function renderOverlay(
  state: BrowserSimulatorLaunchState,
  transportFailure: string | null,
  onActivationPointer: () => void,
  onLeave: () => void,
) {
  if (state.phase === "running" || state.phase === "closing") return null;
  if (state.phase === "awaiting-host-activation") {
    return (
      <section
        onPointerDown={onActivationPointer}
        style={{ ...preparationOverlayStyle, cursor: "pointer", touchAction: "none" }}
      >
        <p style={preparationTextStyle}>点击任意位置继续</p>
      </section>
    );
  }
  const failure = transportFailure === null ? state.failure : {
    capability: "app.simulator.transport-failed",
    boundary: transportFailure,
  };
  if (state.phase === "rejected" || failure !== null) {
    return (
      <section style={preparationOverlayStyle}>
        <div style={preparationPanelStyle}>
          <p style={{ ...preparationTextStyle, color: "#ffd6de" }}>
            Simulator启动失败：{failure?.capability ?? "app.simulator.unknown"}
          </p>
          <p style={{ ...preparationTextStyle, fontSize: 14 }}>{failure?.boundary ?? "未知平台故障"}</p>
          <button type="button" className="simulator-mobile-back-button" onClick={onLeave} style={returnButtonStyle}>
            返回编辑器
          </button>
        </div>
      </section>
    );
  }
  if (state.phase === "closed" || state.phase === "disposed") return null;
  return (
    <section style={preparationOverlayStyle}>
      <div style={preparationPanelStyle}>
        <p style={preparationTextStyle}>{preparationText(state.phase)}</p>
        <button type="button" className="simulator-mobile-back-button" onClick={onLeave} style={returnButtonStyle}>
          返回编辑器
        </button>
      </div>
    </section>
  );
}

function preparationText(phase: BrowserSimulatorLaunchState["phase"]): string {
  switch (phase) {
    case "waiting-descriptor": return "正在等待主窗口资源快照…";
    case "preparing-window": return "正在固定播放器窗口…";
    case "refreshing-catalog": return "正在刷新资源目录…";
    case "acquiring-media": return "正在获取谱面媒体快照…";
    case "building-request": return "正在构建Simulator请求…";
    case "checking-audio": return "正在检查设备音频能力…";
    case "creating-platform": return "正在创建播放器平台…";
    case "installing-launcher": return "正在安装Simulator平台…";
    case "launching": return "正在启动Simulator…";
    default: return "正在准备Simulator…";
  }
}

function dependencyFailure(capability: string, boundary: string): BrowserSimulatorLaunchDependencyError {
  return new BrowserSimulatorLaunchDependencyError(capability, boundary);
}

const preparationOverlayStyle = Object.freeze({
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  background: "rgba(2,5,13,.94)",
  color: "white",
  zIndex: 20,
} as const);
const preparationPanelStyle = Object.freeze({ textAlign: "center", maxWidth: 640, padding: 24 } as const);
const preparationTextStyle = Object.freeze({ margin: "0 0 16px", textAlign: "center" } as const);
const returnButtonStyle = Object.freeze({
  appearance: "none",
  border: "1px solid rgba(255,255,255,.55)",
  borderRadius: 4,
  background: "rgba(5,14,24,.8)",
  color: "white",
  padding: "8px 16px",
  cursor: "pointer",
} as const);
export default BuiltInSimulatorWindow;
