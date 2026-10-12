import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { restoreOriginalFocus } from "./useOriginalDialogInput";
import { OriginalPageHeader } from "./OriginalPageHeader";
import { OriginalPageVisible } from "./OriginalPrefabView";
import { originalLoading } from "./originalLoadingState";
import { PagePreparation } from "./PagePreparation";
import { OverlayDialogModal } from "./OverlayDialogModal";
import { useApplicationPresentation } from "../app/titleNavigation";
import { originalPageMotion } from "./originalPageMotion";
import { getUiViewport } from "./useUiViewport";
import { ORIGINAL_SCREEN_WIDTH_BASE } from "../simulator/scene/originalSurfaceLayout";
import "./OriginalPageSwitch.css";

type Page = { logicalId: string; pageId: string; title: string; section: string; showPageBack: boolean; content: ReactNode };
/** Prepare offscreen, then run each page's entry/exit only while presented. */
export function OriginalPageSwitch({ workspaceReady = true, open, title, section = "歌曲", pageId = "song", pageKey = pageId, onBack, onWorkspaceBack,
  showPageBack = true, onOpenMenu, menuOpen, onPageShown, onRestorePage, children, page }: {
  workspaceReady?: boolean; open: boolean; title: string; onBack(): void; onOpenMenu(): void; menuOpen: boolean;
  section?: string; pageId?: string; pageKey?: string; onWorkspaceBack?(): void; showPageBack?: boolean;
  onRestorePage?(pageId: string | null, pageKey?: string | null): void; onPageShown?(pageId: string | null): void; children: ReactNode; page: ReactNode;
}) {
  const presentation = useApplicationPresentation();
  const presented = presentation?.visible ?? true;
  const wasPresented = useRef(false);
  const requested = open ? pageKey : null;
  const backRequested = useRef(false);
  const forward = useRef(true);
  const [slots, setSlots] = useState<Page[]>([]);
  const [ready, setReady] = useState<Set<string>>(() => new Set());
  const [displayed, setDisplayed] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [error, setError] = useState("");
  const nodes = useRef(new Map<string | null, HTMLDivElement>());
  const visible = useRef<string | null>(null);
  const desired = useRef(requested); desired.current = requested;
  const actions = useRef({ onBack, onPageShown, onRestorePage }); actions.current = { onBack, onPageShown, onRestorePage };
  const latest = useRef<Page>({ logicalId: pageId, pageId: pageKey, title, section, showPageBack, content: page });
  latest.current = { logicalId: pageId, pageId: pageKey, title, section, showPageBack, content: page };
  const retained = useRef(slots); retained.current = slots;
  const returnFocus = useRef<{ node: HTMLElement; keyboard: boolean } | null>(null);
  const waiting = requested !== displayed;
  const busy = waiting || animating;
  const targetReady = requested === null ? workspaceReady : ready.has(requested);
  const goBack = () => {
    if (busy || backRequested.current) return;
    backRequested.current = true;
    if (visible.current === null) onWorkspaceBack?.();
    else actions.current.onBack();
  };
  const cancelPreparation = () => {
    backRequested.current = false;
    const action = actions.current;
    if (action.onRestorePage) action.onRestorePage(retained.current.find(slot => slot.pageId === visible.current)?.logicalId ?? null, visible.current);
    else action.onBack();
  };
  useLayoutEffect(() => {
    forward.current = !backRequested.current;
    backRequested.current = false;
    setSlots(previous => previous.filter(slot => slot.pageId === requested || slot.pageId === visible.current));
    setReady(previous => new Set([...previous].filter(id => id === requested || id === visible.current)));
    if (!requested) return;
    if (!returnFocus.current && document.activeElement instanceof HTMLElement) {
      const node = document.activeElement;
      returnFocus.current = { node, keyboard: node.matches(":focus-visible") && !node.hasAttribute("data-original-restored-pointer-focus") };
    }
    setSlots(previous => previous.some(slot => slot.pageId === requested) ? previous : [...previous, latest.current]);
  }, [requested]);
  // Snapshot the last committed props before they become outgoing content.
  useLayoutEffect(() => {
    if (requested) setSlots(previous => previous.map(slot => slot.pageId === requested ? latest.current : slot));
  }, [page, requested, title, section, showPageBack]);
  useLayoutEffect(() => {
    if (!presented) wasPresented.current = false;
    if (!targetReady) return;
    const appearing = presented && !wasPresented.current;
    wasPresented.current = presented;
    const logicalId = (key: string | null) => key === null ? null : retained.current.find(slot => slot.pageId === key)?.logicalId ?? null;
    if (!presented) {
      backRequested.current = false;
      forward.current = true;
      // Resource readiness does not consume the visible entrance animation.
      if (visible.current !== requested) {
        visible.current = requested; setDisplayed(requested);
        actions.current.onPageShown?.(logicalId(requested));
      }
      setAnimating(false);
      return;
    }
    if (!appearing && visible.current === requested && !animating) return;
    let frame = 0, start: number | undefined, exiting = !appearing && visible.current !== requested, final = false;
    const isForward = appearing || forward.current;
    if (appearing && visible.current !== requested) {
      visible.current = requested; setDisplayed(requested);
      actions.current.onPageShown?.(logicalId(requested));
    }
    const outgoing = nodes.current.get(visible.current);
    const outgoingHome = logicalId(visible.current) === "entrance";
    const incomingHome = logicalId(requested) === "entrance";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const apply = (node: HTMLDivElement | undefined, home: boolean, exit: boolean, p: number) => {
      if (!node) return;
      const viewport = getUiViewport();
      // This wrapper is in CSS pixels, outside UiPageViewport's scaled space.
      const motion = originalPageMotion(home, exit, p, 1200 * (viewport.width / ORIGINAL_SCREEN_WIDTH_BASE), isForward);
      node.style.opacity = String(motion.opacity);
      node.style.transform = `translateX(${motion.x}px)`;
    };
    setAnimating(true);
    apply(exiting ? outgoing : nodes.current.get(requested), exiting ? outgoingHome : incomingHome, exiting, 0);
    const update = (now: number) => {
      start ??= now;
      const p = reduced ? 1 : Math.min(1, (now - start) / 200);
      const node = exiting ? outgoing : nodes.current.get(requested);
      apply(node, exiting ? outgoingHome : incomingHome, exiting, p);
      if (final) {
        if (exiting) {
          apply(nodes.current.get(requested), incomingHome, false, 0);
          visible.current = requested; setDisplayed(requested); actions.current.onPageShown?.(requested === null ? null : retained.current.find(slot => slot.pageId === requested)!.logicalId);
          exiting = false; final = false; start = undefined;
        } else {
          setAnimating(false);
          setSlots(previous => previous.filter(slot => slot.pageId === requested));
          setReady(previous => new Set([...previous].filter(id => id === requested)));
          if (requested === null) { restoreOriginalFocus(returnFocus.current?.node ?? null, returnFocus.current?.keyboard ?? false); returnFocus.current = null; }
          else nodes.current.get(requested)?.focus({ preventScroll: true });
          return;
        }
      } else if (p === 1) final = true;
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => { cancelAnimationFrame(frame); const node = nodes.current.get(visible.current); if (node) { node.style.opacity = "1"; node.style.transform = ""; } };
  }, [requested, targetReady, presented]);
  useLayoutEffect(() => { if (waiting) return originalLoading.hold("network", {}).release; }, [waiting]);
  useLayoutEffect(() => {
    if (requested === null && displayed === null && !busy) return;
    const key = (event: KeyboardEvent) => {
      if (document.querySelector(".modal-transition-mask")) return;
      event.stopImmediatePropagation();
      if (event.key === "Escape") { event.preventDefault(); if (!animating) { if (waiting) cancelPreparation(); else goBack(); } }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [requested, displayed, busy, animating]);
  const header = slots.find(slot => slot.pageId === displayed);
  return <div className="original-page-switch">
    <div className="original-page-header-host" inert={animating}>
      <OriginalPageHeader section={header?.section ?? "编辑器"} title={header?.title ?? "谱面编辑"}
        onBack={waiting ? cancelPreparation : (displayed || onWorkspaceBack ? goBack : undefined)} showBack={header?.showPageBack ?? true}
        menuOpen={menuOpen} onOpenMenu={waiting ? () => {} : onOpenMenu} />
    </div>
    <div className="original-page-body">
      <div ref={node => { if (node) nodes.current.set(null, node); else nodes.current.delete(null); }}
        className="editor-retained-page" data-original-page-motion inert={displayed !== null || busy}
        style={{ visibility: displayed === null ? "visible" : "hidden" }} aria-hidden={displayed !== null}>{children}</div>
      {slots.map(slot => <div key={slot.pageId} ref={node => { if (node) nodes.current.set(slot.pageId, node); else nodes.current.delete(slot.pageId); }}
        className="original-detail-page" data-original-page-motion tabIndex={-1} aria-label={slot.title} aria-hidden={displayed !== slot.pageId}
        style={{ visibility: displayed === slot.pageId ? "visible" : "hidden" }} inert={displayed !== slot.pageId || busy}>
        <OriginalPageVisible.Provider value={displayed === slot.pageId}>
          <PagePreparation onReady={() => {
            setReady(previous => new Set(previous).add(slot.pageId));
          }} onError={cause => {
            if (desired.current !== slot.pageId) return;
            setError(cause instanceof Error ? cause.message : String(cause));
            if (actions.current.onRestorePage) actions.current.onRestorePage(retained.current.find(slot => slot.pageId === visible.current)?.logicalId ?? null, visible.current); else actions.current.onBack();
          }}><div className="original-page-content">{slot.pageId === requested ? page : slot.content}</div></PagePreparation>
        </OriginalPageVisible.Provider>
      </div>)}
      {busy && <div className="original-page-input-cover" />}
    </div>
    <OverlayDialogModal dialog={error ? { tone: "error", message: error } : null} onConfirm={() => setError("")} onCancel={() => setError("")} />
  </div>;
}
