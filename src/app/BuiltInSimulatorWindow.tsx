import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import type { ResourceConsumerLease } from "../resources/contracts";
import { installProductionAutonomousSimulatorPlatform } from "../simulator/platform/platformComposition";
import { launchSimulatorModule } from "../simulator/public";
import type { SimulatorModuleCloseReport } from "../simulator/public/contracts";
import { buildSimulatorLaunchRequest } from "./simulator/buildSimulatorLaunchRequest";
import { createBrowserSimulatorPlatform, type BrowserSimulatorPlatformOwner } from "./simulator/browserSimulatorPlatform";
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
} from "./mobileRuntime";
import "../App.css";

function routeRequestId(): string {
  const hash = window.location.hash ?? "";
  const query = hash.indexOf("?");
  if (query < 0) return "";
  return new URLSearchParams(hash.slice(query + 1)).get("request") ?? "";
}

function BuiltInSimulatorWindow() {
  const manager = useApplicationResourceManager();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const platformRef = useRef<BrowserSimulatorPlatformOwner | null>(null);
  const mediaLeaseRef = useRef<ResourceConsumerLease | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [descriptor, setDescriptor] = useState<SimulatorLaunchTransportDescriptor | null>(null);
  const [status, setStatus] = useState("正在等待主窗口资源快照…");
  const [started, setStarted] = useState(false);
  const [closeReport, setCloseReport] = useState<SimulatorModuleCloseReport | null>(null);
  const requestId = routeRequestId();
  const mobile = isMobileRuntime();

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
        if (disposed || envelope?.requestId !== requestId || envelope.descriptor?.requestId !== requestId) return;
        setDescriptor(envelope.descriptor);
      });
      await emit(SIMULATOR_WINDOW_READY_EVENT, { requestId, label: current.label });
    })().catch((error) => {
      if (!disposed) setStatus(error instanceof Error ? error.message : String(error));
    });
    return () => {
      disposed = true;
      if (unlisten !== null) void unlisten();
    };
  }, [mobile, requestId]);

  useEffect(() => () => {
    platformRef.current?.dispose();
    platformRef.current = null;
    if (mediaLeaseRef.current !== null) void mediaLeaseRef.current.release();
    mediaLeaseRef.current = null;
    if (audioContextRef.current !== null) void audioContextRef.current.close();
    audioContextRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (started || descriptor === null || hostRef.current === null) return;
    setStarted(true);
    setStatus("正在解锁音频并验证资源…");
    try {
      if (!mobile) {
        const current = getCurrentWebviewWindow();
        await current.setResizable(false);
        if (await current.isResizable()) throw new Error("Simulator窗口无法锁定resize。");
      }
      const refreshed = await manager.refreshCatalog("bestdori");
      if (refreshed.status === "rejected") throw new Error(`${refreshed.failure.capability}: ${refreshed.failure.boundary}`);
      const media = await manager.acquireSnapshot(descriptor.mediaSnapshotId);
      if (media.status === "rejected") throw new Error(`${media.failure.capability}: ${media.failure.boundary}`);
      mediaLeaseRef.current = media.value;
      const request = await buildSimulatorLaunchRequest(descriptor, media.value);
      const audioContext = new AudioContext({ latencyHint: "interactive" });
      audioContextRef.current = audioContext;
      await audioContext.resume();
      if (audioContext.state !== "running") throw new Error("AudioContext未在用户手势后进入running状态。");
      const platform = await createBrowserSimulatorPlatform({
        host: hostRef.current,
        audioContext,
        resources: createSimulatorResourceCapability(manager, "jp"),
        safeArea: mobile ? "css-safe-area" : "full-surface",
        onLifecycleState: (state) => setStatus(`Simulator: ${state}`),
      });
      platformRef.current = platform;
      const initialSurface = platform.platform.graphics.readSurfaceState();
      if (mobile && initialSurface.viewportWidth < initialSurface.viewportHeight) {
        throw new Error("移动端Simulator只接受初始横屏backing store，禁止portrait默认或旋转修复。");
      }
      const installed = installProductionAutonomousSimulatorPlatform(platform.platform);
      if (installed.status === "rejected") throw new Error(`${installed.failure.capability}: ${installed.failure.boundary}`);
      const launched = await launchSimulatorModule(request);
      await media.value.release();
      mediaLeaseRef.current = null;
      if (launched.status === "rejected") throw new Error(`${launched.failure.capability}: ${launched.failure.boundary}`);
      setStatus("Simulator运行中");
      const report = await launched.closed;
      setCloseReport(report);
      setStatus(report.failure === null ? `Simulator已结束：${report.reason}` : `Simulator失败：${report.failure.capability}`);
      await emit(SIMULATOR_WINDOW_CLOSED_EVENT, {
        requestId,
        status: report.failure === null ? "closed" : "rejected",
        capability: report.failure?.capability ?? null,
      });
      platform.dispose();
      platformRef.current = null;
      await audioContext.close();
      audioContextRef.current = null;
    } catch (error) {
      if (mediaLeaseRef.current !== null) await mediaLeaseRef.current.release();
      mediaLeaseRef.current = null;
      platformRef.current?.dispose();
      platformRef.current = null;
      if (audioContextRef.current !== null) await audioContextRef.current.close();
      audioContextRef.current = null;
      setStatus(error instanceof Error ? error.message : String(error));
      setStarted(false);
      await emit(SIMULATOR_WINDOW_CLOSED_EVENT, {
        requestId,
        status: "rejected",
        capability: error instanceof Error ? error.message : String(error),
      });
    }
  }, [descriptor, manager, mobile, requestId, started]);

  const close = useCallback(async () => {
    if (platformRef.current !== null) {
      platformRef.current.requestClose();
      return;
    }
    await emit(SIMULATOR_WINDOW_CLOSED_EVENT, {
      requestId,
      status: "closed",
      capability: null,
    });
    if (mobile) navigateBackToEditor();
    else await getCurrentWebviewWindow().close();
  }, [mobile, requestId]);

  return (
    <main style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", background: "#02050d" }}>
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      {!started && closeReport === null ? (
        <section style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(2,5,13,.88)", color: "white", zIndex: 20 }}>
          <div style={{ textAlign: "center", maxWidth: 560, padding: 24 }}>
            <p>{descriptor === null ? status : "点击开始以解锁音频并启动Simulator。"}</p>
            <button type="button" disabled={descriptor === null} onClick={() => void start()}>开始</button>
            <button type="button" onClick={() => void close()}>返回</button>
          </div>
        </section>
      ) : null}
      <div style={{ position: "absolute", left: 8, top: 8, color: "white", zIndex: 10, pointerEvents: "none" }}>{status}</div>
      {started ? <button type="button" onClick={() => void close()} style={{ position: "absolute", right: 8, top: 8, zIndex: 12 }}>关闭</button> : null}
    </main>
  );
}

export default BuiltInSimulatorWindow;
