import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { OriginalPrefabView, type OriginalViewBindings } from "./OriginalPrefabView";
import { OriginalPrefabModel, originalRef } from "./originalPrefabModel";

export interface OriginalPageScrollState { value: number }

export function OriginalPageViewport({ model, bindings, children, scrollState, layout }: {
  model: OriginalPrefabModel; bindings: OriginalViewBindings; children?: ReactNode;
  scrollState?: OriginalPageScrollState;
  layout?: { scroll: string; content: string; bar: string; contentHeight?: number };
}) {
  const scroll = model.nodeAt(layout?.scroll ?? "Contents/ScrollView"), content = model.nodeAt(layout?.content ?? "Contents/ScrollView/Contents");
  const panel = model.componentAt(scroll.id, "UIPanel")!;
  const clip = panel.data.mClipRange, offset = panel.data.mClipOffset, transform = model.transform(scroll.id);
  const x = transform.x + clip.x + offset.x - clip.z / 2;
  const y = -(transform.y + clip.y + offset.y + clip.w / 2);
  const id = useId(), viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; grab: number } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const contentHeight = useMemo(() => {
    const bottoms = [...model.components.values()].filter(item =>
      model.isWithin(item.node, content.id) && model.isActive(item.node) && !bindings.omit?.has(item.id))
      .flatMap(item => {
        if (["UISprite", "UILabel", "UITexture"].includes(item.kind)) {
          const box = model.rect(item); return [box.y + box.height - y];
        }
        if (item.kind !== "StarUIRadioButtonManager" || !item.data.radioButtonNameList.length) return [];
        const startNode = model.prefab.nodes.find(node => node.transformId === originalRef(item.data.startPosTransform));
        if (!startNode) return [];
        const start = model.transform(startNode.id), count = item.data.radioButtonNameList.length;
        const lastRow = Math.floor((count - 1) / item.data.columnCount);
        const height = bindings.radios?.[item.id]?.labelHeight ?? 100;
        return [-start.y + (lastRow * item.data.heightMargin + height / 2) * Math.abs(start.scaleY) - y];
      });
    return Math.max(clip.w, layout?.contentHeight ?? 0, ...bottoms);
  }, [model, bindings.omit, bindings.radios, content.id, clip.w, y, layout?.contentHeight]);
  const maximum = Math.max(0, contentHeight - clip.w);
  useLayoutEffect(() => {
    if (viewport.current && scrollState) viewport.current.scrollTop = scrollState.value;
  }, [scrollState]);
  useLayoutEffect(() => {
    if (viewport.current) {
      setScrollTop(viewport.current.scrollTop);
      if (scrollState) scrollState.value = viewport.current.scrollTop;
    }
  }, [maximum, scrollState]);
  const barPath = layout?.bar ?? "Contents/ScrollBar";
  const bar = model.nodeAt(barPath), thumb = model.nodeAt(`${barPath}/Thumb`);
  const thumbSprite = model.componentAt(thumb.id, "UISprite")!;
  const background = model.componentAt(model.nodeAt(`${barPath}/Background`).id, "UISprite")!;
  const track = model.rect(background), barHeight = background.data.mHeight;
  const size = Math.min(1, clip.w / contentHeight);
  const fraction = maximum === 0 ? 0 : Math.min(1, Math.max(0, scrollTop / maximum));
  const barModel = new OriginalPrefabModel(model.prefab, { ...model.overrides,
    nodes: { ...model.overrides.nodes, [bar.id]: { ...model.overrides.nodes?.[bar.id], active: maximum > 0 },
      [thumb.id]: { ...model.overrides.nodes?.[thumb.id], y: -barHeight * size / 2 - fraction * barHeight * (1 - size) } },
    components: { ...model.overrides.components, [thumbSprite.id]: { ...thumbSprite.data, mHeight: barHeight * size, mPivot: 4 } },
  });
  const thumbBox = barModel.rect(barModel.components.get(thumbSprite.id)!);
  const hit = model.componentAt(bar.id, "BoxCollider2D");
  const hitBox = hit ? model.rect(hit) : track;
  const position = (clientY: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    return hitBox.y + (clientY - bounds.top) * hitBox.height / bounds.height;
  };
  const move = (sourceY: number, grab: number) => {
    if (!viewport.current || track.height <= thumbBox.height) return;
    const value = Math.min(1, Math.max(0, (sourceY - grab - track.y) / (track.height - thumbBox.height)));
    viewport.current.scrollTop = value * maximum;
    setScrollTop(viewport.current.scrollTop);
  };
  return <>
    <div ref={viewport} id={id} className="original-prefab-scroll" data-original-panel={panel.id}
      onScroll={event => {
        setScrollTop(event.currentTarget.scrollTop);
        if (scrollState) scrollState.value = event.currentTarget.scrollTop;
      }}
      style={{ left: x, top: y, width: clip.z, height: clip.w, zIndex: panel.data.mDepth,
        maskImage: `linear-gradient(to bottom, transparent, black ${panel.data.mClipSoftness.y}px, black calc(100% - ${panel.data.mClipSoftness.y}px), transparent)` }}>
      <div style={{ position: "relative", width: clip.z, height: contentHeight }}>
        <div className="original-prefab-origin" style={{ left: -x, top: -y }}>
          <OriginalPrefabView model={model} root={content.id} bindings={bindings} />
          {children}
        </div>
      </div>
    </div>
    <OriginalPrefabView model={barModel} root={bar.id} bindings={{}} />
    {maximum > 0 && <div role="scrollbar" aria-controls={id} aria-orientation="vertical" tabIndex={0}
      aria-valuemin={0} aria-valuemax={Math.round(maximum)} aria-valuenow={Math.round(scrollTop)}
      className="original-prefab-scrollbar-hit" style={{ left: hitBox.x, top: hitBox.y,
        width: hitBox.width, height: hitBox.height, zIndex: panel.data.mDepth + 1 }}
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        const sourceY = position(event.clientY, event.currentTarget);
        const inside = sourceY >= thumbBox.y && sourceY <= thumbBox.y + thumbBox.height;
        const grab = inside ? sourceY - thumbBox.y : thumbBox.height / 2;
        drag.current = { pointer: event.pointerId, grab };
        event.currentTarget.setPointerCapture(event.pointerId); move(sourceY, grab);
      }}
      onPointerMove={event => {
        if (drag.current?.pointer === event.pointerId) move(position(event.clientY, event.currentTarget), drag.current.grab);
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        const target = viewport.current; if (!target) return;
        const next = event.key === "Home" ? 0 : event.key === "End" ? maximum
          : event.key === "PageDown" ? target.scrollTop + clip.w : event.key === "PageUp" ? target.scrollTop - clip.w
            : event.key === "ArrowDown" ? target.scrollTop + 40 : event.key === "ArrowUp" ? target.scrollTop - 40 : null;
        if (next !== null) { event.preventDefault(); target.scrollTop = next; setScrollTop(target.scrollTop); }
      }} />}
  </>;
}
