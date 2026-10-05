import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { restoreOriginalFocus } from "./useOriginalDialogInput";
import { OriginalPageHeader } from "./OriginalPageHeader";
import "./OriginalPageSwitch.css";

/** ScreenAlphaInOut: linear 0.2 s, final sample followed by one frame before completion.
 * Source: GirlsBandParty-Reverse db872dca, menu-settings-ui-10-1-4/screen-navigation.json.
 * The editor retains its mounted workspace as a return-stack page. */
export function OriginalPageSwitch({ open, title, onBack, onOpenMenu, menuOpen, children, page }: {
  open: boolean; title: string; onBack(): void; onOpenMenu(): void; menuOpen: boolean;
  children: ReactNode; page: ReactNode;
}) {
  const header = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null), detail = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false);
  const shown = useRef(false), frame = useRef(0);
  const returnFocus = useRef<{ node: HTMLElement | null; keyboard: boolean } | null>(null);
  const backAction = useRef(onBack); backAction.current = onBack;
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
    let exiting = shown.current !== open;
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
          setVisible(open);
          exiting = false; started = undefined; finalSample = false;
        } else { setBusy(false); return; }
      } else if (progress === 1) finalSample = true;
      frame.current = requestAnimationFrame(update);
    };
    frame.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame.current);
  }, [open]);
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
  return <div className="original-page-switch">
    <div ref={header} className="original-page-header-host" inert={busy || open !== visible}>
      <OriginalPageHeader section={visible ? "歌曲" : "编辑器"} title={visible ? title : "谱面编辑"}
        onBack={visible ? onBack : undefined} menuOpen={menuOpen} onOpenMenu={onOpenMenu} />
    </div>
    <div className="original-page-body">
    <div ref={workspace} className="editor-retained-page" inert={open || visible || busy}
      style={{ visibility: visible ? "hidden" : "visible" }} aria-hidden={visible}>
      {children}
    </div>
    {(open || visible || busy) && <div className="original-detail-page" ref={detail} tabIndex={-1} aria-label={title}
      style={{ visibility: visible ? "visible" : "hidden" }} inert={!visible || busy}>
      <div className="original-page-content">{page}</div>
    </div>}
    {busy && <div className="original-page-input-cover" />}
    </div>
  </div>;
}
