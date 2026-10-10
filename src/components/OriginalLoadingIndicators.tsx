import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { OriginalLoadingAnimation } from "./originalLoadingAnimation";
import { originalLoading, type OriginalLoadingKind, type OriginalLoadingScreen } from "./originalLoadingState";
import { useUiViewport } from "./useUiViewport";
import profile from "../data/originalLoadingProfile.json";

function Indicator({ kind, screen }: { kind: OriginalLoadingKind; screen: OriginalLoadingScreen }) {
  const viewport = useUiViewport();
  const animation = useMemo(() => new OriginalLoadingAnimation(kind), [kind]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let frame = 0, previous: number | undefined;
    const update = (now: number) => {
      animation.step(previous === undefined ? 0 : (now - previous) / 1000);
      previous = now; setRevision(value => value + 1); frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [animation]);
  const model = useMemo(() => animation.model(screen.progress), [animation, screen.progress, revision]);
  return <div className="original-authored-viewport" data-original-loading={kind} role="status" aria-label={screen.progress === undefined ? "正在加载" : "正在下载"}
    style={{ position: "fixed", right: viewport.safeInsets.right, bottom: viewport.safeInsets.bottom,
      width: 0, height: 0, transform: `scale(${viewport.scale})`, transformOrigin: "0 0", pointerEvents: "none" }}>
    <OriginalPrefabView model={model} />
  </div>;
}

function TransmittingInputBlock() {
  useLayoutEffect(() => {
    // Native BoxCollider blocks the page; keyboard and existing document shortcuts
    // must also stop in a desktop host, including while focus remains in an input.
    const block = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const events = ["pointerdown", "pointerup", "pointermove", "click", "dblclick", "contextmenu", "wheel", "keydown", "keyup", "beforeinput"];
    events.forEach(type => window.addEventListener(type, block, { capture: true, passive: false }));
    const root = document.getElementById("root"), wasInert = root?.inert;
    if (root) root.inert = true;
    return () => {
      events.forEach(type => window.removeEventListener(type, block, true));
      if (root) root.inert = wasInert ?? false;
    };
  }, []);
  const grayout = profile.prefabs.transmitting.components.find(c => c.kind === "UISprite" && c.id === 84)!;
  const color = grayout.data as { mColor: { r: number; g: number; b: number; a: number } };
  return <div data-original-transmitting-block="" style={{ position: "fixed", inset: 0,
    background: `rgba(${color.mColor.r * 255},${color.mColor.g * 255},${color.mColor.b * 255},${color.mColor.a})`, pointerEvents: "auto", touchAction: "none" }} />;
}

/** One host per application resource context; callers hold/release owners, not React overlays. */
export function OriginalLoadingIndicators() {
  const state = useSyncExternalStore(originalLoading.subscribe, originalLoading.getSnapshot);
  if (!state.network && !state.transmitting) return null;
  return createPortal(<div style={{ position: "fixed", inset: 0, zIndex: 10000, pointerEvents: "none" }}>
    {state.network && <Indicator key={`network-${state.network.generation}`} kind="network" screen={state.network} />}
    {state.transmitting && <div style={{ position: "absolute", inset: 0 }}>
      <TransmittingInputBlock />
      <Indicator key={`transmitting-${state.transmitting.generation}`} kind="transmitting" screen={state.transmitting} />
    </div>}
  </div>, document.body);
}
