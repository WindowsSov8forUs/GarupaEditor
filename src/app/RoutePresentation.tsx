import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { originalLoading } from "../components/originalLoadingState";
import { downloadActivity } from "../services/downloadActivity";
import { isMobileRuntime } from "./mobileRuntime";

const Context = createContext<(() => void) | null>(null);
export function PreparedRoute({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const finish = useRef(() => setReady(true));
  useEffect(() => { if (!ready) return originalLoading.hold("network", {}).release; }, [ready]);
  return <Context.Provider value={finish.current}><div style={{ position: "absolute", inset: 0, opacity: ready ? 1 : 0, visibility: ready ? "visible" : "hidden", pointerEvents: ready ? "auto" : "none" }} inert={!ready}>{children}</div></Context.Provider>;
}
export function usePresentRoute() {
  const mobileReady = useContext(Context);
  const called = useRef(false);
  const action = useRef(() => {
    if (called.current) return; called.current = true;
    mobileReady?.();
    void presentAuxiliaryWindow();
  });
  return action.current;
}
/** Parent owns local preparation feedback while the new native window stays hidden. */
export async function holdAuxiliaryPreparation(requestId: string, onError?: (message: string) => void,
  indicator: "network" | "screen" = "network") {
  // Live start keeps the full-screen Loading until the gameplay surface replaces it.
  const releaseIndicator = indicator === "screen" ? downloadActivity.holdScreen() : originalLoading.hold("network", {}).release;
  let stopped = false, unlisten: (() => void) | undefined;
  const release = () => { if (stopped) return; stopped = true; releaseIndicator(); unlisten?.(); };
  try {
    unlisten = await listen<{ requestId: string; error?: string }>("application:page-presented", event => { if (event.payload.requestId === requestId) { release(); if (event.payload.error) onError?.(event.payload.error); } });
    if (stopped) unlisten();
    return release;
  } catch (error) { release(); throw error; }
}

export async function presentAuxiliaryWindow() {
  if (!isMobileRuntime() && isTauri()) {
    const requestId = new URLSearchParams(location.hash.split("?")[1]).get("request");
    let error: string | undefined;
    try { await getCurrentWebviewWindow().show(); } catch (cause) { error = String(cause); }
    await emit("application:page-presented", { requestId, error });
  }
}
