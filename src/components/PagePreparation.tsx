import { Component, createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { originalLoading } from "./originalLoadingState";

type Preparation = { report(owner: object, pending: boolean, error?: unknown): void; remove(owner: object): void };
const Context = createContext<Preparation | null>(null);
export function usePreparationPending(pending: boolean, error?: unknown) {
  const preparation = useContext(Context), owner = useRef({});
  useLayoutEffect(() => {
    preparation?.report(owner.current, pending, error);
    return () => preparation?.remove(owner.current);
  }, [preparation, pending, error]);
}

class PreparationErrorBoundary extends Component<{ children: ReactNode; onError(error: unknown): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Mount once offscreen, wait for consumers and image decoding, then reveal the same tree. */
export function PagePreparation({ children, onReady, onError }: {
  children: ReactNode; onReady(): void; onError(error: unknown): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onError }); callbacks.current = { onReady, onError };
  const coordinator = useMemo(() => {
    const pending = new Set<object>();
    let frame = 0, alive = false, completed = false, failure: unknown;
    let release: (() => void) | undefined;
    const schedule = () => {
      cancelAnimationFrame(frame);
      if (!alive || completed) return;
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
        if (!alive || completed) return;
        if (failure) { completed = true; release?.(); callbacks.current.onError(failure); }
        else if (!pending.size) { completed = true; release?.(); callbacks.current.onReady(); }
      }); });
    };
    const api: Preparation = {
      report(owner, waiting, error) { if (error) failure = error; if (waiting) pending.add(owner); else pending.delete(owner); schedule(); },
      remove(owner) { pending.delete(owner); schedule(); },
    };
    return { api, start() {
      alive = true;
      // Pushing a page shows no loading layer of its own; what it waits for (API checks, a missing
      // asset's Spot download) is the NetworkIndicator, with the download's own progress.
      const indicator = originalLoading.hold("network", {}, { downloadProgress: true });
      release = () => { indicator.release(); };
      schedule();
    },
      stop() { alive = false; cancelAnimationFrame(frame); release?.(); } };
  }, []);
  useLayoutEffect(() => {
    const element = host.current!;
    const seen = new WeakMap<Element, string>();
    const cleanup = new Map<HTMLVideoElement, { src: string; dispose(): void }>();
    const scan = () => {
      for (const [media, pending] of cleanup) {
        if (!element.contains(media) || (media.currentSrc || media.src) !== pending.src) pending.dispose();
      }
      for (const image of element.querySelectorAll("img")) {
        const src = image.currentSrc || image.src;
        if (!src || seen.get(image) === src) continue;
        seen.set(image, src); const owner = {};
        coordinator.api.report(owner, true);
        void image.decode().then(() => coordinator.api.remove(owner), error => {
          if (image.isConnected && (image.currentSrc || image.src) === src) coordinator.api.report(owner, false, error);
          else coordinator.api.remove(owner);
        });
      }
      for (const media of element.querySelectorAll("video")) {
        const src = media.currentSrc || media.src;
        if (!src || seen.get(media) === src) continue;
        seen.set(media, src);
        if (media.readyState >= HTMLMediaElement.HAVE_METADATA) continue;
        const owner = {}; coordinator.api.report(owner, true);
        const dispose = () => { media.removeEventListener("loadedmetadata", loaded); media.removeEventListener("error", failed); cleanup.delete(media); coordinator.api.remove(owner); };
        const loaded = () => { dispose(); };
        const failed = () => { dispose(); coordinator.api.report(owner, false, new Error("视频元数据读取失败")); };
        cleanup.set(media, { src, dispose }); media.addEventListener("loadedmetadata", loaded); media.addEventListener("error", failed);
        if (media.error) failed();
      }
    };
    const fonts = {}; coordinator.api.report(fonts, true);
    void document.fonts.ready.then(() => coordinator.api.remove(fonts));
    const observer = new MutationObserver(scan); observer.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    scan(); coordinator.start();
    return () => { observer.disconnect(); coordinator.stop(); cleanup.forEach(pending => pending.dispose()); };
  }, [coordinator]);
  return <Context.Provider value={coordinator.api}><div ref={host} style={{ display: "contents" }}>
    <PreparationErrorBoundary onError={error => coordinator.api.report({}, false, error)}>{children}</PreparationErrorBoundary>
  </div></Context.Provider>;
}
