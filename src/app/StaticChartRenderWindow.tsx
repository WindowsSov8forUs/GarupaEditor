import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sanitizeFileName } from "../chartCore";
import { DownloadProgressModal } from "../components/DownloadProgressModal";
import { EditorSquareTool } from "../components/editor/EditorControlColumn";
import { loadPreviewLaneImage, unprojectFieldRows } from "../components/editor/previewLaneStrip";
import { OriginalBackButton } from "../components/OriginalPageHeader";
import { OverlayDialogModal, type OverlayDialogState } from "../components/OverlayDialogModal";
import { useOriginalFieldLane, useOriginalSkinPreviewResources } from "../components/useOriginalSkinPreviewResources";
import { useUiViewport } from "../components/useUiViewport";
import { appLog, loggedInvoke as invoke } from "../logging/applicationLogger";
import { useApplicationResourceManager, useApplicationResourceUrl } from "../resources/applicationResourceContext";
import type { ResourceSnapshotId } from "../resources/contracts";
import { decodeAppliedSkinResources, type AppliedSkinResources } from "../skin/resourceSkinDecoder";
import { projectSkinRuntimeResourceMap } from "../skin/resourceSkinProjection";
import {
  isMobileRuntime,
  navigateBackToEditor,
  readMobileRoutePayload,
  removeMobileRoutePayload,
  shareFile,
} from "./mobileRuntime";
import { usePresentRoute } from "./RoutePresentation";
import { StaticPreviewTitleBar } from "./StaticPreviewTitleBar";
import { buildPreviewScene, drawPreviewColumn, drawPreviewColumnLabels, noteCountUpTo, type PreviewImages, type PreviewScene } from "./staticPreviewDrawing";
import {
  previewColumnAt,
  previewColumnOf,
  previewColumnTime,
  previewEndTime,
  previewLayout,
  PREVIEW_SPAN_DEFAULT,
  PREVIEW_SPAN_MAX,
  PREVIEW_SPAN_MIN,
  type PreviewLayout,
} from "./staticPreviewLayout";
import type { StaticRenderPayload } from "./staticRenderTypes";

/*
 * The chart preview window: the skin's background and the editor's dark blue mask fill the window and stay put; over
 * them the chart, cut into columns (staticPreviewLayout) drawn as the editor draws its board (staticPreviewDrawing),
 * scrolls sideways. Shift + wheel or a pinch zooms the columns, lanes and time alike, about the pointer: a column holds
 * 8 seconds at first, 4 to 16 as zoomed.
 */

const MAX_RENDER_DPR = 2;
const MAX_EXPORT_CANVAS_WIDTH = 32767;
const MAX_EXPORT_CANVAS_HEIGHT = 16384;
const MAX_EXPORT_CANVAS_PIXELS = 180_000_000;
/** The editor's mask under its track (.editor-track-zone-background). */
const MASK_COLOR = "rgba(12, 28, 72, 0.55)";

type StaticPayloadEnvelope = { requestId: string; payload: StaticRenderPayload };

type PreviewLoadingState = { visible: boolean; blocking: boolean; percent: number; message: string; logs: string[] };

type HoverLine = { column: number; y: number; time: number; count: number };

/** A pending zoom's anchor: the time under the pointer, where in its column's lanes it was and the pointer's x. */
type ZoomAnchor = { time: number; lanes: number; viewX: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseStaticRenderRouteParams(): { requestId: string; isMobileRoute: boolean } {
  const hash = window.location.hash ?? "";
  const queryIndex = hash.indexOf("?");
  if (queryIndex < 0) return { requestId: "", isMobileRoute: false };
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  return { requestId: params.get("request") ?? "", isMobileRoute: params.get("mode") === "mobile" };
}

function formatTimePrecise(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const minute = Math.floor(totalMs / 60000);
  const second = Math.floor((totalMs % 60000) / 1000);
  return `${minute}:${String(second).padStart(2, "0")}.${String(totalMs % 1000).padStart(3, "0")}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`图片加载失败：${url}`));
    image.src = url;
  });
}

/** Draws `image` over the whole width × height area, cropped to keep its aspect (CSS background-size: cover). */
function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale, drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

/** A field lane image unprojected flat (previewLaneStrip), or null while it loads or for no URL. */
function useFlatLane(url: string | null, onError: (message: string) => void): HTMLCanvasElement | null {
  const [lane, setLane] = useState<{ url: string; art: HTMLCanvasElement } | null>(null);
  const error = useRef(onError); error.current = onError;
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    loadPreviewLaneImage(url)
      .then(image => { if (!cancelled) setLane({ url, art: unprojectFieldRows(image) }); })
      .catch(cause => {
        appLog("error", "static-render.lane-art.failed", { error: cause });
        if (!cancelled) error.current(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [url]);
  return url && lane?.url === url ? lane.art : null;
}

export default function StaticChartRenderWindow() {
  const present = usePresentRoute();
  const { requestId, isMobileRoute } = useMemo(parseStaticRenderRouteParams, []);
  const [payload, setPayload] = useState<StaticRenderPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [overlayDialog, setOverlayDialog] = useState<OverlayDialogState | null>(null);
  const [loading, setLoading] = useState<PreviewLoadingState>({
    visible: true, blocking: true, percent: 8, message: "正在初始化预览窗口…", logs: ["正在初始化预览窗口…"],
  });
  const hideTimer = useRef<number | null>(null);

  const updateLoading = useCallback((percent: number, message: string, blocking?: boolean) => {
    setLoading(previous => ({
      visible: true,
      blocking: blocking ?? previous.blocking,
      percent: clamp(Math.round(percent), 0, 100),
      message,
      logs: previous.logs[previous.logs.length - 1] === message ? previous.logs : [...previous.logs, message].slice(-2),
    }));
  }, []);
  const completeLoading = useCallback((message: string, delayMs = 420) => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    updateLoading(100, message, false);
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      setLoading({ visible: false, blocking: false, percent: 0, message: "", logs: [] });
    }, delayMs);
  }, [updateLoading]);
  useEffect(() => () => { if (hideTimer.current !== null) window.clearTimeout(hideTimer.current); }, []);

  useEffect(() => {
    if (!errorMessage) return;
    present();
    setOverlayDialog({ tone: "error", message: errorMessage });
    setLoading(previous => ({ ...previous, visible: false, blocking: false }));
  }, [errorMessage, present]);

  // The payload arrives once from the editor (an event, or the mobile route's stored copy).
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void (async () => {
      if (!requestId) {
        setErrorMessage("缺少预览请求标识，无法接收数据。");
        return;
      }
      if (isMobileRoute || isMobileRuntime()) {
        const envelope = readMobileRoutePayload<StaticPayloadEnvelope>(requestId);
        if (envelope?.requestId === requestId && envelope.payload) {
          setPayload(envelope.payload);
          removeMobileRoutePayload(requestId);
          updateLoading(60, "正在生成预览画面…");
          return;
        }
      }
      try {
        updateLoading(22, "正在等待主窗口连接…");
        const currentWindow = getCurrentWebviewWindow();
        unlisten = await currentWindow.listen<StaticPayloadEnvelope>("static-render:payload", event => {
          const envelope = event.payload;
          if (disposed || envelope?.requestId !== requestId || !envelope.payload) return;
          setPayload(envelope.payload);
          updateLoading(60, "正在生成预览画面…");
        });
        if (disposed) { unlisten(); return; }
        updateLoading(36, "连接已建立，等待主窗口发送数据…");
        await emit("static-render:ready", { requestId, label: currentWindow.label });
      } catch (error) {
        appLog("error", "static-render.operation.failed", { error });
        if (!disposed) setErrorMessage(`预览窗口初始化失败：${error instanceof Error ? error.message : String(error)}`);
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [isMobileRoute, requestId, updateLoading]);

  const onReady = useCallback(() => {
    appLog("info", "static-render.ready", {});
    present();
    completeLoading("预览已就绪。");
  }, [completeLoading, present]);

  const validPayload = payload !== null && payload.schemaVersion === 3 ? payload : null;
  useEffect(() => {
    if (payload !== null && payload.schemaVersion !== 3) setErrorMessage("静态渲染请求使用了不受支持的数据格式。");
  }, [payload]);

  return <main className="static-render-page">
    {validPayload && !errorMessage
      ? <PreviewStage payload={validPayload} isMobileRoute={isMobileRoute} onReady={onReady} onError={setErrorMessage}
        onDialog={setOverlayDialog} />
      : <div className="static-render-mask" style={{ background: MASK_COLOR }} />}
    <DownloadProgressModal visible={loading.visible} blocking={loading.blocking} percent={loading.percent}
      message={loading.message} logs={loading.logs} />
    <OverlayDialogModal dialog={overlayDialog} onConfirm={() => setOverlayDialog(null)} onCancel={() => setOverlayDialog(null)} />
  </main>;
}

function PreviewStage({ payload, isMobileRoute, onReady, onError, onDialog }: {
  payload: StaticRenderPayload; isMobileRoute: boolean; onReady(): void; onError(message: string): void;
  onDialog(dialog: OverlayDialogState): void;
}) {
  const resourceManager = useApplicationResourceManager();
  const imageExportIcon = useApplicationResourceUrl("ui.icon.image-export");
  const defaultBackground = useApplicationResourceUrl("ui.skin-preview-background");
  const { scale } = useUiViewport();
  const errorRef = useRef(onError); errorRef.current = onError;

  // The skin's note images (the editor's resource snapshot).
  const [skinResources, setSkinResources] = useState<AppliedSkinResources | null>(null);
  useEffect(() => {
    let disposed = false;
    let owned: AppliedSkinResources | null = null;
    void (async () => {
      const lease = await resourceManager.acquireSnapshot(payload.resourceSnapshotId as ResourceSnapshotId);
      if (lease.status === "rejected") throw new Error(`${lease.failure.capability}: ${lease.failure.boundary}`);
      owned = await decodeAppliedSkinResources(lease.value, payload.skinIdentities);
      if (disposed) { await owned.dispose(); return; }
      setSkinResources(owned);
    })().catch(error => {
      appLog("error", "static-render.resources.failed", { error });
      if (!disposed) errorRef.current(`静态渲染资源加载失败：${error instanceof Error ? error.message : String(error)}`);
    });
    return () => {
      disposed = true;
      if (owned !== null) void owned.dispose();
      setSkinResources(null);
    };
  }, [payload, resourceManager]);
  const resourceUrls = useMemo<Readonly<Record<string, string>>>(
    () => skinResources === null ? {} : projectSkinRuntimeResourceMap(skinResources.note), [skinResources]);
  const [loadedImages, setLoadedImages] = useState<ReadonlyMap<string, HTMLImageElement> | null>(null);
  useEffect(() => {
    setLoadedImages(null);
    const urls = Object.values(resourceUrls);
    if (urls.length === 0) return;
    let cancelled = false;
    void Promise.all(urls.map(url => loadImage(url).then(image => [url, image] as const).catch(() => null)))
      .then(entries => {
        if (!cancelled) setLoadedImages(new Map(entries.filter((entry): entry is readonly [string, HTMLImageElement] => entry !== null)));
      });
    return () => { cancelled = true; };
  }, [resourceUrls]);

  // The background and the lane art, as the skin settings pick them (the editor's track uses the same lane art).
  const skinPreview = useOriginalSkinPreviewResources(payload.skinRecipe, message => errorRef.current(`轨道贴图失败：${message}`));
  const backgroundUrl = skinPreview.background ?? defaultBackground;
  // A HABAHIRO chart's lane art is the skin00 field, then the HABAHIRO one from the lane change; an ordinary chart's is
  // the skin settings' field.
  const habahiro = payload.habahiroLane;
  const laneError = (message: string) => errorRef.current(`轨道贴图失败：${message}`);
  const beforeLaneUrl = useOriginalFieldLane(habahiro ? habahiro.beforeField : null, laneError);
  const afterLaneUrl = useOriginalFieldLane(habahiro && habahiro.swapTimeSec !== null ? habahiro.afterField : null, laneError);
  const firstLaneUrl = habahiro ? beforeLaneUrl : skinPreview.lane;
  const secondLaneUrl = habahiro && habahiro.swapTimeSec !== null ? afterLaneUrl : null;
  const firstLane = useFlatLane(firstLaneUrl, laneError);
  const secondLane = useFlatLane(secondLaneUrl, laneError);
  const laneArt = useMemo<PreviewImages["laneArt"]>(() => {
    if (firstLane === null) return null;
    if (habahiro?.swapTimeSec == null) return { before: firstLane, after: null, swapTimeSec: null };
    return secondLane === null ? null : { before: firstLane, after: secondLane, swapTimeSec: habahiro.swapTimeSec };
  }, [firstLane, habahiro?.swapTimeSec, secondLane]);

  const images = useMemo<PreviewImages | null>(() => {
    if (loadedImages === null) return null;
    const url = (key: string | null | undefined) => (key ? resourceUrls[key] ?? null : null);
    const byUrl = (value: string | null | undefined) => (value ? loadedImages.get(value) ?? null : null);
    return { url, byUrl, image: key => byUrl(url(key)), laneArt };
  }, [laneArt, loadedImages, resourceUrls]);

  const scene = useMemo<PreviewScene>(() => buildPreviewScene(payload), [payload]);
  const endTime = useMemo(() => previewEndTime(payload), [payload]);

  const viewportRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => setViewport(current => current.width === element.clientWidth && current.height === element.clientHeight
      ? current : { width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  // The zoom is how many seconds a column holds.
  const [span, setSpan] = useState(PREVIEW_SPAN_DEFAULT);
  const layout = useMemo<PreviewLayout | null>(() => viewport.height > 0
    ? previewLayout(payload, scale, span, viewport.height, endTime) : null, [endTime, payload, scale, span, viewport.height]);
  const layoutRef = useRef(layout); layoutRef.current = layout;

  // Draws the columns in view onto the viewport-sized canvas (it stays put while the strip scrolls under it).
  const frame = useRef(0);
  const draw = useCallback(() => {
    frame.current = 0;
    const canvas = canvasRef.current, element = viewportRef.current, current = layoutRef.current;
    if (!canvas || !element || !current || !images) return;
    const dpr = Math.min(MAX_RENDER_DPR, Math.max(1, window.devicePixelRatio || 1));
    const width = element.clientWidth, height = current.height;
    const pixelWidth = Math.max(1, Math.round(width * dpr)), pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const scrollLeft = element.scrollLeft;
    const count = current.columns.length;
    const originOf = (column: number) => current.inset + current.columns[column]!.left - scrollLeft;
    const first = previewColumnAt(current, scrollLeft), last = previewColumnAt(current, scrollLeft + width);
    for (let column = first; column <= last; column += 1) {
      drawPreviewColumn(context, current, scene, images, column, originOf(column), dpr);
    }
    // Labels over every track, the neighbours' too (a label may reach past its gutter).
    for (let column = Math.max(0, first - 1); column <= Math.min(count - 1, last + 1); column += 1) {
      drawPreviewColumnLabels(context, current, scene, column, originOf(column));
    }
  }, [images, scene]);
  const requestDraw = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  // A zoom keeps the time under the pointer at the pointer's x (in that time's column at the new size).
  const pendingAnchor = useRef<ZoomAnchor | null>(null);
  useLayoutEffect(() => {
    const element = viewportRef.current, anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    if (element && layout && anchor) {
      const column = previewColumnOf(layout, anchor.time);
      const info = layout.columns[column]!;
      element.scrollLeft = layout.inset + info.left + info.boardLeft + anchor.lanes * layout.lane - anchor.viewX;
    }
    requestDraw();
  }, [layout, requestDraw]);
  useEffect(() => { requestDraw(); }, [images, requestDraw, viewport.width]);

  const pointAt = useCallback((clientX: number, clientY: number) => {
    const element = viewportRef.current, current = layoutRef.current;
    if (!element || !current) return null;
    const rect = element.getBoundingClientRect();
    const viewX = clientX - rect.left, y = clientY - rect.top;
    const x = element.scrollLeft + viewX;
    const column = previewColumnAt(current, x), info = current.columns[column]!;
    return { column, y, viewX, time: previewColumnTime(current, column, y),
      lanes: (x - current.inset - info.left - info.boardLeft) / current.lane };
  }, []);
  const zoomBy = useCallback((factor: number, clientX: number, clientY: number) => {
    const current = layoutRef.current, point = pointAt(clientX, clientY);
    if (!current) return;
    const next = clamp(current.span / factor, PREVIEW_SPAN_MIN, PREVIEW_SPAN_MAX);
    if (next === current.span) return;
    if (point) pendingAnchor.current = { time: point.time, lanes: point.lanes, viewX: point.viewX };
    setSpan(next);
  }, [pointAt]);

  // Shift + wheel zooms; a plain wheel scrolls the columns sideways. Two fingers pinch to zoom.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      // Some hosts move a Shift + wheel delta to the horizontal axis.
      const delta = event.deltaY || event.deltaX;
      if (!delta) return;
      event.preventDefault();
      const pixels = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1);
      if (event.shiftKey) zoomBy(Math.exp(-pixels * 0.002), event.clientX, event.clientY);
      else element.scrollLeft += pixels;
    };
    let pinchDistance: number | null = null;
    const pair = (touches: TouchList) => {
      const a = touches[0]!, b = touches[1]!;
      return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      event.preventDefault();
      pinchDistance = pair(event.touches).distance;
    };
    const move = (event: TouchEvent) => {
      if (pinchDistance === null || event.touches.length < 2) return;
      event.preventDefault();
      const next = pair(event.touches);
      if (pinchDistance > 0 && next.distance > 0) zoomBy(next.distance / pinchDistance, next.x, next.y);
      pinchDistance = next.distance;
    };
    const end = (event: TouchEvent) => { if (event.touches.length < 2) pinchDistance = null; };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("touchstart", start, { passive: false });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", end);
    return () => {
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", end);
    };
  }, [zoomBy]);

  const [hover, setHover] = useState<HoverLine | null>(null);
  const updateHover = useCallback((clientX: number, clientY: number) => {
    const point = pointAt(clientX, clientY), current = layoutRef.current;
    if (!point || !current) { setHover(null); return; }
    const time = clamp(point.time, 0, current.endTime);
    setHover({ column: point.column, y: clamp(point.y, 0, current.height), time, count: noteCountUpTo(scene, time) });
  }, [pointAt, scene]);
  useEffect(() => { setHover(null); }, [layout]);

  const ready = images !== null && laneArt !== null && layout !== null;
  const reported = useRef(false);
  useEffect(() => {
    if (!ready || reported.current) return;
    reported.current = true;
    requestDraw();
    onReady();
  }, [onReady, ready, requestDraw]);

  const [exporting, setExporting] = useState(false);
  const exportImage = useCallback(async () => {
    const current = layoutRef.current;
    if (!current || !images) {
      onDialog({ tone: "info", message: "当前没有可导出的预览内容。" });
      return;
    }
    const width = Math.ceil(current.totalWidth), height = Math.ceil(current.height);
    const ratio = Math.min(MAX_RENDER_DPR, Math.max(1, window.devicePixelRatio || 1), MAX_EXPORT_CANVAS_WIDTH / width,
      MAX_EXPORT_CANVAS_HEIGHT / height, Math.sqrt(MAX_EXPORT_CANVAS_PIXELS / (width * height)));
    if (ratio < 0.5) {
      onDialog({ tone: "error", message: `导出尺寸超过浏览器可处理上限（${width}×${height}）。\n请缩小后重试。` });
      return;
    }
    setExporting(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法创建导出画布。");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      // As the window shows it: the background and the mask under the columns.
      drawCover(context, await loadImage(backgroundUrl), width, height);
      context.fillStyle = MASK_COLOR;
      context.fillRect(0, 0, width, height);
      current.columns.forEach((info, column) =>
        drawPreviewColumn(context, current, scene, images, column, current.inset + info.left, ratio));
      current.columns.forEach((info, column) =>
        drawPreviewColumnLabels(context, current, scene, column, current.inset + info.left));
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      if (!base64) throw new Error("导出编码失败。");
      const defaultFileName = `${sanitizeFileName(payload.chartTitle)}-preview.png`;
      const savedPath = isMobileRuntime()
        ? (await shareFile({ fileName: defaultFileName, mimeType: "image/png", base64Data: base64 })).path
        : await invoke<string | null>("save_chart_png_via_dialog", { defaultFileName, pngBase64: base64 });
      onDialog({ tone: "info", message: typeof savedPath === "string" && savedPath ? `导出完成：${savedPath}` : "已取消导出。" });
    } catch (error) {
      appLog("error", "static-render.operation.failed", { error });
      onDialog({ tone: "error", message: `导出失败：${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setExporting(false);
    }
  }, [backgroundUrl, images, onDialog, payload.chartTitle, scene]);

  return <>
    <div className="static-render-background" style={{ backgroundImage: `url(${JSON.stringify(backgroundUrl)})` }} />
    <div className="static-render-mask" style={{ background: MASK_COLOR }} />
    <StaticPreviewTitleBar title={payload.chartTitle} difficulty={payload.difficulty} level={payload.difficultyLevel} />
    <div className="static-render-back">
      <OriginalBackButton onBack={() => {
        if (isMobileRoute) navigateBackToEditor();
        else void getCurrentWebviewWindow().close();
      }} />
    </div>
    <div className="static-render-export ui-design-scale">
      <EditorSquareTool label={exporting ? "导出中…" : "导出图片"} glyph={imageExportIcon} disabled={!ready || exporting}
        onClick={() => void exportImage()} />
    </div>
    <section ref={viewportRef} className="static-render-viewport" onScroll={requestDraw}
      onMouseMove={event => updateHover(event.clientX, event.clientY)} onMouseLeave={() => setHover(null)}>
      <div className="static-render-strip" style={{ width: layout ? layout.totalWidth : 0 }}>
        <canvas ref={canvasRef} className="static-render-canvas" />
        {hover && layout && <div className="static-render-hover-line"
          style={{ left: layout.inset + layout.columns[hover.column]!.left + layout.columns[hover.column]!.boardLeft,
            top: hover.y, width: layout.trackWidth }}>
          <span className="static-render-hover-label static-render-hover-label-left">{formatTimePrecise(hover.time)}</span>
          <span className="static-render-hover-label static-render-hover-label-right" style={{ left: layout.trackWidth }}>
            {hover.count}
          </span>
        </div>}
      </div>
    </section>
  </>;
}
