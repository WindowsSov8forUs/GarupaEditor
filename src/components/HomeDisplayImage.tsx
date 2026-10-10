import { useEffect, useRef, useState } from "react";
import button from "../data/originalHomeDisplayButton.json";
import { appLog } from "../logging/applicationLogger";
import { useApplicationResourceManager, useApplicationResourceUrl } from "../resources/applicationResourceContext";
import { ResourceFailureError, type ResourceConsumerLease } from "../resources/contracts";
import { normalizeSourcePng } from "../resources/normalizeImagePng";
import { OriginalButton } from "./OriginalUi";
import { useUiViewport } from "./useUiViewport";
import { CoverDisplayImage } from "./CoverDisplayImage";
import { OverlayDialogModal } from "./OverlayDialogModal";

/** Original Home edit sprite, mounted at the mode-change button's LeftTop anchor.
 * Source: home-display-button-10-1-4, 99aa7841d08ce4032500c42048a3dbf8ffb3c715.
 * Local image selection and cover fitting are the requested editor behavior. */
export function HomeDisplayImage() {
  const manager = useApplicationResourceManager();
  const buttonImage = useApplicationResourceUrl("ui.home.display-button");
  const viewport = useUiViewport();
  const input = useRef<HTMLInputElement>(null);
  const [revision, setRevision] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayedLease = useRef<ResourceConsumerLease | null>(null);
  useEffect(() => () => { void displayedLease.current?.release(); displayedLease.current = null; }, []);
  useEffect(() => {
    let active = true;
    let lease: ResourceConsumerLease | undefined;
    const reference = manager.getDisplayImageRef();
    void (async () => {
      const snapshot = await manager.createSnapshotFromRefs({ display: reference });
      if (snapshot.status === "rejected") throw new ResourceFailureError(snapshot.failure);
      const acquired = await manager.acquireSnapshot(snapshot.value.snapshotId);
      if (acquired.status === "rejected") throw new ResourceFailureError(acquired.failure);
      lease = acquired.value;
      if (!active) { await lease.release(); return; }
      const files = lease.listFiles("display");
      if (files.length !== 1) throw new Error("展示图片资源必须包含一张图片。");
      const image = await lease.openObjectUrl("display", files[0]!.logicalPath);
      if (active) {
        const previous = displayedLease.current;
        displayedLease.current = lease;
        setUrl(image);
        void previous?.release();
      } else await lease.release();
    })().catch(cause => {
      if (lease && displayedLease.current !== lease) void lease.release();
      appLog("error", "home.display-image.load-failed", { cause });
      if (active) setError(`展示图片读取失败：${String(cause)}`);
    });
    return () => { active = false; };
  }, [manager, revision]);

  const replace = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true); setError(null);
    try {
      // Decode before publishing: a truncated image must not replace a working selection.
      const decoded = await createImageBitmap(file);
      decoded.close();
      const png = await normalizeSourcePng(new Uint8Array(await file.arrayBuffer()), "display image", null);
      const installed = await manager.setDisplayImage(png);
      if (installed.status === "rejected") throw new ResourceFailureError(installed.failure);
      setRevision(value => value + 1);
    } catch (cause) {
      appLog("error", "home.display-image.replace-failed", { cause });
      setError(`展示图片更换失败：${String(cause)}`);
    } finally { setBusy(false); }
  };
  const left = viewport.safeInsets.left / viewport.scale;
  const top = viewport.safeInsets.top / viewport.scale;
  const originX = `calc(var(--ui-page-window-center-x) - ${viewport.width / viewport.scale / 2}px)`;
  const originY = `calc(var(--ui-page-window-center-y) - ${viewport.height / viewport.scale / 2}px)`;
  const imageWidth = Math.max(1, Math.min(620, viewport.width / viewport.scale / 2 - left - 32));
  const imageHeight = Math.max(1, viewport.height / viewport.scale - top - viewport.safeInsets.bottom / viewport.scale - 120);
  return <>
    {url && <CoverDisplayImage src={url} width={imageWidth} height={imageHeight} style={{ position: "absolute",
      left: `calc(${originX} + ${left + 16}px)`, top: `calc(${originY} + ${top + 120}px)`,
    }} />}
    <OriginalButton surfaceImage={buttonImage} aria-label="更换展示图片" title="更换展示图片" disabled={busy}
      clickSEType={button.clickSEType} enableDoubleTap={!!button.enableDoubleTap} longPressJudgementTime={button.longPressJudgementTime}
      onClick={() => input.current?.click()} style={{ position: "absolute", padding: 0, minWidth: 0, minHeight: 0,
        left: `calc(${originX} + ${left + button.center.x - button.width / 2}px)`,
        top: `calc(${originY} + ${top + button.center.y - button.height / 2}px)`, width: button.width, height: button.height }} />
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden disabled={busy}
      onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void replace(file); }} />
    <OverlayDialogModal dialog={error ? { tone: "error", message: error } : null}
      onConfirm={() => setError(null)} onCancel={() => setError(null)} />
  </>;
}
