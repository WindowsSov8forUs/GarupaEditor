import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { downloadActivity } from "../services/downloadActivity";
import { FullScreenLoading } from "./simulator/FullScreenLoading";
import { startupLoadingAssets } from "./startupLoadingAssets";

/** Actual transport opens this surface; preparation owns its lifetime. */
export function DownloadOverlay() {
  const state = useSyncExternalStore(downloadActivity.subscribe, downloadActivity.getSnapshot);
  useEffect(() => {
    if (!state.active) return;
    const block = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const events = ["pointerdown", "pointerup", "pointermove", "click", "dblclick", "contextmenu", "wheel", "keydown", "keyup", "beforeinput"];
    events.forEach(type => window.addEventListener(type, block, { capture: true, passive: false }));
    return () => events.forEach(type => window.removeEventListener(type, block, true));
  }, [state.active]);
  if (!state.active) return null;
  return createPortal(<div data-download-overlay="" style={{ position: "fixed", inset: 0, zIndex: 10001 }}>
    <FullScreenLoading sources={startupLoadingAssets} progress={state.progress ?? null} />
  </div>, document.body);
}
