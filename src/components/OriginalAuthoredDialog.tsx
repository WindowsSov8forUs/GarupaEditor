import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { originalUiViewportScale } from "../simulator/public/layout";
import { useModalLayer } from "./useModalLayer";
import { useModalTransition, type DialogMotion } from "./useModalTransition";
import { useOriginalDialogInput } from "./useOriginalDialogInput";
import { OriginalPrefabView, type OriginalViewBindings } from "./OriginalPrefabView";
import type { OriginalPrefabModel } from "./originalPrefabModel";

export function useOriginalUiScale(): number {
  const read = () => originalUiViewportScale(window.innerWidth, window.innerHeight);
  const [scale, setScale] = useState(read);
  useEffect(() => {
    const resized = () => setScale(read()); window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, []);
  return scale;
}
export function OriginalAuthoredDialog({ open, model, bindings, onClose, onClosed, motion = "scale", busy = false, frameComponentId, coverAlpha, children, cameraOverlay }: {
  open: boolean; model: OriginalPrefabModel; bindings: OriginalViewBindings; onClose: () => void;
  onClosed?: () => void; motion?: DialogMotion; busy?: boolean; frameComponentId?: number; coverAlpha?: number; children?: ReactNode; cameraOverlay?: ReactNode;
}) {
  const [prepared, setPrepared] = useState(false);
  const dialogId = useId(), cameraRef = useRef<HTMLDivElement>(null);
  const transition = useModalTransition(open, motion, open && !prepared);
  const layer = useModalLayer(open, transition.mounted);
  useEffect(() => { if (!open && !transition.mounted) onClosed?.(); }, [open, transition.mounted, onClosed]);
  useLayoutEffect(() => {
    if (!transition.mounted) { setPrepared(false); return; }
    if (!open || prepared) return;
    const element = transition.transitionRef.current;
    if (!element) return;
    const check = () => {
      if (!element.querySelector('[data-original-surface-ready="false"]') &&
        !cameraRef.current?.querySelector('[data-original-surface-ready="false"]')) setPrepared(true);
    };
    const observer = new MutationObserver(check);
    observer.observe(element, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["data-original-surface-ready"] });
    if (cameraRef.current) observer.observe(cameraRef.current, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["data-original-surface-ready"] });
    check();
    return () => observer.disconnect();
  }, [open, prepared, transition.mounted, transition.transitionRef]);
  useOriginalDialogInput(transition.transitionRef, transition.mounted, onClose, !transition.shown || busy);
  const scale = useOriginalUiScale(), windowNode = model.nodeAt("Window");
  const frame = frameComponentId === undefined ? model.componentAt(windowNode.id, "UISprite")!
    : model.components.get(frameComponentId)!;
  const title = [...model.components.values()].find(item => item.kind === "UILabel" && model.nodes.get(item.node)?.name === "Title");
  if (!transition.mounted) return null;
  const ownsInput = transition.shown && !busy && layer.pointerEvents !== "none";
  return <><div id={dialogId} ref={transition.transitionRef} className="modal-mask modal-transition-mask original-authored-mask"
    style={{ ...layer, ...transition.transitionStyle, ...(motion === "none" && coverAlpha !== undefined
      ? { "--original-dialog-alpha": open ? coverAlpha : 0 } : {}) } as CSSProperties} tabIndex={-1}>
    <div className="original-authored-viewport" role="dialog" aria-modal="true"
      aria-label={title ? model.text(title) : undefined} aria-busy={!prepared} inert={!ownsInput}
      data-original-prefab={model.prefab.resource} data-motion={motion}
      style={{ width: frame.data.mWidth * scale, height: frame.data.mHeight * scale,
        visibility: prepared ? undefined : "hidden" }}>
      <div className="original-prefab-origin" style={{ left: "50%", top: "50%", transform: `scale(${scale})` }}>
        <div className="original-authored-window" style={{ transform: motion === "slide-left"
          ? "translateX(calc(var(--original-dialog-x, -800) * 1px))"
          : "scale(var(--original-dialog-scale, 0))" }}>
          <OriginalPrefabView model={model} root={windowNode.id} bindings={bindings} />
          {children}
        </div>
      </div>
    </div>
  </div>
    {cameraOverlay && createPortal(<div ref={cameraRef} data-original-camera-for={dialogId}
      style={{ position: "fixed", inset: 0, zIndex: Number(layer.zIndex) + 1, pointerEvents: "none",
        mixBlendMode: "plus-lighter" }}>{cameraOverlay}</div>, document.body)}
  </>;
}
