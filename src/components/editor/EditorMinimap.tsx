import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { drawNoteVisual, drawConnectionSegment, resolveSegmentGeometry, type CanvasNoteVisual } from "../../app/hooks/useCanvasPlayfieldBackend";
import type { RenderConnectionSegment } from "../../app/hooks/useEditorRenderModel";
import type { EditorDisplayAxis } from "../../app/editorDisplayAxis";
import { projectCanvasRenderResourceRuntimeAssets, type SkinAssets } from "../../skinLoader";
import "./EditorMinimap.css";
import { minimapLaneVisible } from "../../app/editorMinimapGeometry";

export function EditorMinimap({ notes, segments, duration, laneCount, axis, viewport, getImage, skinAssets,
  resourcesVersion, width, top, noteScale }: {
  notes: CanvasNoteVisual[]; segments: RenderConnectionSegment[]; duration: number; laneCount: number;
  axis: EditorDisplayAxis; viewport: RefObject<HTMLDivElement | null>;
  getImage: (url: string | null | undefined) => HTMLImageElement | null;
  skinAssets: SkinAssets | null; resourcesVersion: number; width: number; top: number; noteScale: number;
}) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ offset: number; pointer: number } | null>(null);
  const [height, setHeight] = useState(1);
  const [view, setView] = useState({ top: 0, height: 0 });
  const laneWidth = Math.max(1, width - 4) / laneCount;
  // The overview covers exactly [0, duration], with no unscrollable padding below zero.
  const plotHeight = Math.max(1, height);
  const y = (time: number) => (1 - time / duration) * plotHeight;
  const skin = useMemo(() => skinAssets ? projectCanvasRenderResourceRuntimeAssets(skinAssets) : null, [skinAssets]);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => setHeight(element.clientHeight);
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => {
      const a = y(axis.viewportTimeAtY(element.scrollTop));
      const b = y(axis.viewportTimeAtY(element.scrollTop + element.clientHeight));
      const start = Math.max(0, Math.min(height, a)), end = Math.max(0, Math.min(height, b));
      setView({ top: start, height: Math.max(1, end - start) });
    };
    const observer = new ResizeObserver(update); observer.observe(element);
    element.addEventListener("scroll", update); update();
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [axis, viewport, duration, height, plotHeight]);
  useLayoutEffect(() => {
    const target = canvas.current, ctx = target?.getContext("2d");
    if (!target || !ctx) return;
    const dpr = Math.max(1, window.devicePixelRatio);
    target.width = Math.round(width * dpr); target.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(8, 25, 55, 0.65)"; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgb(0, 166, 166)"; ctx.fillRect(0, 0, 2, height); ctx.fillRect(width - 2, 0, 2, height);
    ctx.save(); ctx.beginPath(); ctx.rect(2, 0, width - 4, height); ctx.clip();
    for (const segment of segments) {
      if (!minimapLaneVisible(segment.fromX, segment.spanLanes, laneCount) ||
          !minimapLaneVisible(segment.toX, segment.spanLanes, laneCount)) continue;
      const texture = getImage(segment.textureKind === "slide" ? skin?.longLineSpecial : skin?.longLine);
      const geometry = resolveSegmentGeometry({ fromX: 2 + segment.fromX * laneWidth, fromY: y(segment.fromY),
        toX: 2 + segment.toX * laneWidth, toY: y(segment.toY) });
      if (texture && geometry) drawConnectionSegment(ctx, segment, geometry, laneWidth * segment.spanLanes * noteScale, texture);
    }
    for (const note of notes) {
      if (note.y < 0 || note.y > duration || !minimapLaneVisible(note.x, note.spanLanes, laneCount)) continue;
      drawNoteVisual(ctx, { ...note, x: note.x * laneWidth, y: y(note.y) }, 2, laneWidth, noteScale, getImage);
    }
    ctx.restore();
  }, [notes, segments, duration, laneCount, width, height, laneWidth, noteScale, skin, getImage, resourcesVersion, plotHeight]);
  const seek = (clientY: number) => {
    const element = viewport.current, rect = host.current?.getBoundingClientRect();
    if (!element || !rect) return;
    const local = clientY - rect.top - (drag.current?.offset ?? 0);
    const time = (1 - local / plotHeight) * duration;
    element.scrollTop = axis.timeToY(time);
  };
  return <aside className="editor-minimap-column" style={{ width }}>
    <div ref={host} className="editor-minimap" style={{ top }} aria-label="谱面缩略图"
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        const element = viewport.current;
        const local = event.clientY - event.currentTarget.getBoundingClientRect().top;
        const onFrame = local >= view.top && local <= view.top + view.height;
        const actualTop = element ? y(axis.viewportTimeAtY(element.scrollTop)) : view.top;
        drag.current = { pointer: event.pointerId, offset: onFrame ? local - actualTop : view.height / 2 };
        seek(event.clientY);
      }}
      onPointerMove={event => { if (drag.current?.pointer === event.pointerId) seek(event.clientY); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}>
      <canvas ref={canvas} style={{ width, height }} aria-hidden="true" />
      <div className="editor-minimap-viewport" style={{ top: view.top, height: view.height }} />
    </div>
  </aside>;
}
