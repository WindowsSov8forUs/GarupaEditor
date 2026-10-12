import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { originalLoading } from "../components/originalLoadingState";
import { ApplicationResourceProvider } from "../resources/applicationResourceContext";
import { connectNativeDownloads, downloadActivity } from "../services/downloadActivity";
import { DownloadOverlay } from "./DownloadOverlay";
import { TitleScreen } from "./TitleScreen";
import type { ApplicationResourceManager } from "../resources/applicationResourceManager";
import type { StartupPart, StartupReadiness } from "./startupReadiness";
import { appLog } from "../logging/applicationLogger";
import PreparedApplication from "./PreparedApplication";
import { TitleNavigationContext } from "./titleNavigation";

const LoadingIndicators = lazy(() => import("../components/OriginalLoadingIndicators").then(module => ({ default: module.OriginalLoadingIndicators })));
const StartupResourceDialog = lazy(() => import("./StartupResourceDialog"));
const parts: readonly StartupPart[] = ["session", "editor-audio", "editor", "sound", "home-image", "home-page", "background"];
class StartupBoundary extends Component<{ children: ReactNode; failed: (error: unknown) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.props.failed(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function StartupShell() {
  const [phase, setPhase] = useState<"title" | "loading" | "ready">("title");
  const entering = useRef(false);
  const [indicatorManager, setIndicatorManager] = useState<ApplicationResourceManager | null>(null);
  const [manager, setManager] = useState<ApplicationResourceManager | null>(null);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);

  const generation = useRef(0);
  const running = useRef(false);
  const prepared = useRef(false);
  const acknowledged = useRef(false);
  const readyParts = useRef(new Set<StartupPart>());
  useEffect(() => {
    if (phase === "ready") return;
    // The retained editor must not consume global shortcuts behind the title.
    const blockEditorKeys = (event: KeyboardEvent) => event.stopImmediatePropagation();
    window.addEventListener("keydown", blockEditorKeys, true);
    window.addEventListener("keyup", blockEditorKeys, true);
    return () => {
      window.removeEventListener("keydown", blockEditorKeys, true);
      window.removeEventListener("keyup", blockEditorKeys, true);
    };
  }, [phase]);
  useEffect(() => {
    if (phase !== "loading" || error) return;
    const timer = window.setInterval(() => {
      appLog("info", "application.startup.waiting", { prepared: prepared.current,
        pending: parts.filter(part => !readyParts.current.has(part)) });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [phase, error]);
  const releaseDownload = useRef<(() => void) | undefined>(undefined);
  const endDownload = useCallback(() => { releaseDownload.current?.(); releaseDownload.current = undefined; }, []);
  useEffect(() => endDownload, [endDownload]);
  const finish = useCallback(() => {
    if (!entering.current || !prepared.current || !parts.every(part => readyParts.current.has(part))) return;
    const current = generation.current;
    // Allow committed images and the home transition to paint underneath.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (entering.current && current === generation.current && prepared.current && parts.every(part => readyParts.current.has(part))) {
        endDownload();
        if (acknowledged.current) { entering.current = false; running.current = false; setPhase("ready"); }
      }
    }));
  }, [endDownload]);
  const failed = useCallback((value: unknown) => {
    running.current = false; prepared.current = false;
    endDownload();
    setManager(null);
    setError(value instanceof Error ? value.message : String(value));
    appLog("error", "application.startup.failed", { error: value });
  }, [endDownload]);
  const readiness = useMemo<StartupReadiness>(() => {
    const current = generation.current;
    return { report(part, ready, failure) {
    if (current !== generation.current) return;
    if (failure) { failed(failure); return; }
    const changed = readyParts.current.has(part) !== ready;
    if (ready) readyParts.current.add(part); else readyParts.current.delete(part);
    if (changed) appLog("info", "application.startup.part", { part, ready,
      pending: parts.filter(value => !readyParts.current.has(value)) });
    finish();
  } }; }, [failed, finish, attempt]);
  const prepare = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    endDownload(); releaseDownload.current = downloadActivity.prepare();
    const current = ++generation.current;
    setError(""); setWarnings([]); setManager(null);
    readyParts.current.clear(); prepared.current = false; acknowledged.current = false;
    setAttempt(value => value + 1);
    try {
      await connectNativeDownloads();
      const { prepareApplication } = await import("./prepareApplication");
      const result = await prepareApplication(() => {}, value => { if (current === generation.current) setIndicatorManager(value); });
      if (current !== generation.current) return;
      running.current = false; prepared.current = true; acknowledged.current = result.warnings.length === 0;
      setWarnings(result.warnings); setManager(result.manager);
    } catch (cause) { if (current === generation.current) failed(cause); }
  }, [failed, endDownload]);
  const retry = useCallback(() => { if (!running.current) void prepare(); }, [prepare]);
  const enter = useCallback(() => {
    if (entering.current) return;
    entering.current = true;
    setPhase("loading");
    // Retain the prepared application and the unsaved chart on a title round trip.
    if (prepared.current) return;
    void prepare();
  }, [prepare]);
  const returnToTitle = useCallback(() => {
    entering.current = false;
    endDownload();
    setPhase(current => current === "ready" ? "title" : current);
  }, [endDownload]);
  const visible = phase === "ready";
  const navigation = useMemo(() => ({ visible, returnToTitle }),
    [visible, returnToTitle]);
  useEffect(() => {
    if (phase === "loading" && !error && warnings.length === 0) return originalLoading.hold("network", {}).release;
  }, [phase, error, warnings.length]);
  return <>
    {manager && <div style={{ position: "absolute", inset: 0, visibility: visible ? "visible" : "hidden", opacity: visible ? 1 : 0 }} inert={phase !== "ready"}>
      <StartupBoundary key={attempt} failed={failed}><Suspense fallback={null}>
        <TitleNavigationContext.Provider value={navigation}>
          <PreparedApplication manager={manager} readiness={phase === "loading" ? readiness : null} />
        </TitleNavigationContext.Provider>
      </Suspense></StartupBoundary>
    </div>}
    {(phase === "title" || phase === "loading") && <div inert={phase === "loading"}><TitleScreen onEnter={enter} /></div>}
    {indicatorManager && <ApplicationResourceProvider manager={indicatorManager}><Suspense fallback={null}><LoadingIndicators /></Suspense></ApplicationResourceProvider>}
    <DownloadOverlay />
    {phase === "loading" && (error || warnings.length > 0) && <Suspense fallback={null}>
      <StartupResourceDialog error={error} warnings={warnings} onRetry={retry}
        onContinue={() => { acknowledged.current = true; setWarnings([]); finish(); }} />
    </Suspense>}
  </>;
}
