import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import profile from "../data/originalMenuBackground.json";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import type { ApplicationResourceSlot } from "../resources/selections";
import { UiScaleOrigin } from "./UiViewport";
import "./OriginalMenuBackground.css";

export type MenuBackgroundType = 0 | 1 | 2 | 257 | "editor" | "home";
interface Layer {
  role: string; slot: string; x: number; y: number; rotationDegrees: number;
  width: number; height: number; textureWidth: number; textureHeight: number;
  depth: number; alpha: number; tiled: boolean;
  durationX?: number; durationY?: number; rightX?: boolean; rightY?: boolean;
}
const backgrounds: Record<MenuBackgroundType, readonly Layer[]> = profile.backgrounds;
interface View { type: MenuBackgroundType; revision: number; }

/** CommonBGView: two alternating views; a fade never resets the outgoing UV phase. */
export function OriginalMenuBackground({ type, onError }: {
  type: MenuBackgroundType; onError(message: string): void;
}) {
  const manager = useApplicationResourceManager();
  const errorHandler = useRef(onError); errorHandler.current = onError;
  const resources = useMemo(() => {
    const urls: Record<string, string> = {};
    for (const layer of Object.values(backgrounds).flat()) {
      if (urls[layer.slot]) continue;
      const result = manager.resolveBuiltinSlotUrl(layer.slot as ApplicationResourceSlot);
      if (result.status === "rejected") throw new Error(`${result.failure.capability}: ${result.failure.boundary}`);
      urls[layer.slot] = result.value;
    }
    return urls;
  }, [manager]);
  const [loads, setLoads] = useState<Partial<Record<MenuBackgroundType, true | string>>>({});
  // Decode the small shared page resource set once, before it is needed on navigation.
  useEffect(() => {
    let disposed = false;
    const images = new Map<string, Promise<void>>();
    for (const [key, layers] of Object.entries(backgrounds)) {
      const pending = layers.map(layer => {
        const url = resources[layer.slot];
        if (!images.has(url)) {
          const image = new Image(); image.src = url;
          images.set(url, image.decode());
        }
        return images.get(url)!;
      });
      void Promise.all(pending).then(() => {
        if (!disposed) setLoads(previous => ({ ...previous, [key]: true }));
      }).catch(error => {
        if (!disposed) setLoads(previous => ({ ...previous, [key]: String(error) }));
      });
    }
    return () => { disposed = true; };
  }, [resources]);
  const ready = loads[type] === true;
  const failure = loads[type];
  useEffect(() => {
    if (typeof failure === "string") errorHandler.current(`页面背景 ${type} 加载失败：${failure}`);
  }, [type, failure]);
  const [state, setState] = useState<{ views: (View | null)[]; current: number; revision: number }>({
    views: [null, null], current: 0, revision: 0,
  });
  useLayoutEffect(() => {
    if (!ready) return;
    setState(previous => {
      if (previous.views[previous.current]?.type === type) return previous;
      const current = previous.revision === 0 ? 0 : 1 - previous.current;
      const views = [...previous.views];
      views[current] = { type, revision: previous.revision + 1 };
      return { views, current, revision: previous.revision + 1 };
    });
  }, [type, ready]);
  const elements = useRef<(HTMLDivElement | null)[]>([]);
  const fades = useRef<(Animation | null)[]>([]);
  useLayoutEffect(() => {
    if (state.revision === 0) return;
    elements.current.forEach((element, index) => {
      if (!element) return;
      // Sample before cancellation, including interrupted transitions.
      const alpha = Number(getComputedStyle(element).opacity);
      fades.current[index]?.cancel();
      const target = index === state.current ? 1 : 0;
      element.style.setProperty("--background-play-state", "running");
      const animation = element.animate([{ opacity: alpha }, { opacity: target }], {
        duration: state.revision === 1 ? 0 : profile.fadeSeconds * 1000,
        // Exact polynomial OutQuad, represented by a cubic Bezier with linear time.
        easing: "cubic-bezier(0.333333333333,0.666666666667,0.666666666667,1)", fill: "forwards",
      });
      fades.current[index] = animation;
      animation.onfinish = () => {
        if (fades.current[index] !== animation) return;
        element.style.opacity = String(target);
        if (target === 0) element.style.setProperty("--background-play-state", "paused");
        animation.cancel(); fades.current[index] = null;
      };
    });
  }, [state]);
  useEffect(() => () => { fades.current.forEach(animation => animation?.cancel()); }, []);
  return <div className="original-menu-background" aria-hidden="true">
    {state.views.map((view, index) => <div key={index} ref={element => { elements.current[index] = element; }}
      className="original-menu-background-view" data-background-type={view?.type}>
      <UiScaleOrigin centered>
        {view && backgrounds[view.type].map(layer => {
          const durationX = layer.durationX ?? 0, durationY = layer.durationY ?? 0;
          const duration = Math.max(durationX, durationY);
          const startY = layer.tiled ? layer.height - layer.textureHeight : 0;
          const travelX = durationX > 0 ? (layer.rightX ? -1 : 1) * layer.textureWidth * duration / durationX : 0;
          const travelY = durationY > 0 ? (layer.rightY ? 1 : -1) * layer.textureHeight * duration / durationY : 0;
          return <div key={`${view.revision}:${layer.role}`} className="original-menu-background-layer" data-layer={layer.role} style={{
            left: layer.x - layer.width / 2, top: -layer.y - layer.height / 2,
            width: layer.width, height: layer.height, zIndex: layer.depth, opacity: layer.alpha,
            transform: `rotate(${-layer.rotationDegrees}deg)`,
            backgroundImage: `url(${JSON.stringify(resources[layer.slot])})`,
            backgroundSize: layer.tiled ? `${layer.textureWidth}px ${layer.textureHeight}px` : "100% 100%",
            backgroundRepeat: layer.tiled ? "repeat" : "no-repeat",
            backgroundPosition: `0px ${startY}px`,
            animationName: duration > 0 ? "original-menu-background-scroll" : "none",
            animationDuration: `${duration}s`,
            "--background-start-y": `${startY}px`, "--background-end-x": `${travelX}px`,
            "--background-end-y": `${startY + travelY}px`,
          } as CSSProperties} />;
        })}
      </UiScaleOrigin>
    </div>)}
  </div>;
}
