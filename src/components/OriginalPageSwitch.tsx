import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { restoreOriginalFocus } from "./useOriginalDialogInput";
import { OriginalPageHeader } from "./OriginalPageHeader";
import "./OriginalPageSwitch.css";

/** ScreenAlphaInOut: linear 0.2 s, final sample followed by one frame before completion.
 * Source: GirlsBandParty-Reverse db872dca, menu-settings-ui-10-1-4/screen-navigation.json.
 * The editor retains its mounted workspace as a return-stack page. */
export function OriginalPageSwitch({ open, title, section = "歌曲", pageId = "song", onBack, onWorkspaceBack, showPageBack = true, onOpenMenu, menuOpen, onPageShown, children, page }: {
  open: boolean; title: string; onBack(): void; onOpenMenu(): void; menuOpen: boolean;
  section?: string; pageId?: string;
  onWorkspaceBack?(): void; showPageBack?: boolean;
  onPageShown?(pageId: string | null): void;
  children: ReactNode; page: ReactNode;
}) {
  const header = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null), detail = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false);
  const shown = useRef(false), frame = useRef(0);
  const shownPage = useRef(pageId);
  const [displayed, setDisplayed] = useState({ pageId, title, section, showPageBack });
  const current = useRef({ pageId, title, section, showPageBack });
  current.current = { pageId, title, section, showPageBack };
  // Retain the latest committed outgoing content, not its first-entry snapshot.
  const outgoingPage = useRef(page);
  useLayoutEffect(() => { if (displayed.pageId === pageId) outgoingPage.current = page; });
  const returnFocus = useRef<{ node: HTMLElement | null; keyboard: boolean } | null>(null);
  const backAction = useRef(onBack); backAction.current = onBack;
  const pageShown = useRef(onPageShown); pageShown.current = onPageShown;
  const visited = useRef(false);
  useLayoutEffect(() => {
    if (!open && !shown.current && !returnFocus.current) return;
    if (open && !returnFocus.current) {
      const node = header.current?.querySelector<HTMLElement>(".original-header-slot button") ?? null;
      returnFocus.current = { node, keyboard: !!node?.matches(":focus-visible")
        && !node.hasAttribute("data-original-restored-pointer-focus") };
    }
    setBusy(true);
    let started: number | undefined;
    // An interrupted return fades the currently visible page back in.
    let exiting = shown.current !== open || (open && shownPage.current !== pageId);
    let finalSample = false;
    const outgoing = shown.current ? detail.current : workspace.current;
    const startOpacity = Number(outgoing?.style.opacity || 1);
    const incomingOpacity = exiting ? 0 : startOpacity;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const update = (now: number) => {
      started ??= now;
      const progress = reduced ? 1 : Math.min(1, (now - started) / 200);
      const target = exiting ? outgoing : (open ? detail.current : workspace.current);
      if (target) target.style.opacity = String(exiting ? startOpacity * (1 - progress)
        : incomingOpacity + (1 - incomingOpacity) * progress);
      if (finalSample) {
        if (exiting) {
          shown.current = open;
          shownPage.current = pageId;
          setDisplayed(current.current);
          setVisible(open);
          pageShown.current?.(open ? pageId : null);
          exiting = false; started = undefined; finalSample = false;
        } else { setBusy(false); return; }
      } else if (progress === 1) finalSample = true;
      frame.current = requestAnimationFrame(update);
    };
    frame.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame.current);
  }, [open, pageId]);
  useLayoutEffect(() => {
    if (!open && !visible && !busy) return;
    const key = (event: KeyboardEvent) => {
      if (document.querySelector(".modal-transition-mask")) return;
      // Do not deliver page input to the editor's document-level shortcuts.
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) backAction.current();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, visible, busy]);
  useLayoutEffect(() => {
    if (busy) return;
    if (visible) { visited.current = true; detail.current?.focus({ preventScroll: true }); }
    else if (visited.current || (!open && returnFocus.current)) {
      const target = returnFocus.current;
      if (target) restoreOriginalFocus(target.node, target.keyboard);
      returnFocus.current = null;
      visited.current = false;
    }
  }, [open, visible, busy]);
  const visibleHeader = displayed.pageId === pageId ? { title, section, showPageBack } : displayed;
  return <div className="original-page-switch">
    <div ref={header} className="original-page-header-host" inert={busy || open !== visible}>
      <OriginalPageHeader section={visible ? visibleHeader.section : "编辑器"} title={visible ? visibleHeader.title : "谱面编辑"}
        onBack={visible ? onBack : onWorkspaceBack} showBack={!visible || visibleHeader.showPageBack}
        menuOpen={menuOpen} onOpenMenu={onOpenMenu} />
    </div>
    <div className="original-page-body">
    <div ref={workspace} className="editor-retained-page" inert={open || visible || busy}
      style={{ visibility: visible ? "hidden" : "visible" }} aria-hidden={visible}>
      {children}
    </div>
    {(open || visible || busy) && <div className="original-detail-page" ref={detail} tabIndex={-1} aria-label={visibleHeader.title}
      style={{ visibility: visible ? "visible" : "hidden" }} inert={!visible || busy}>
      <div className="original-page-content">{displayed.pageId === pageId ? page : outgoingPage.current}</div>
    </div>}
    {busy && <div className="original-page-input-cover" />}
    </div>
  </div>;
}
