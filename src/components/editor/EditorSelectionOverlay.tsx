import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { SELECTION_FRAME_BORDER_PX } from "../../app/editorNoteMetrics";
import type { SelectionWidthEdge } from "../../app/selectionWidthDrag";
import { useOriginalSurface } from "../useOriginalSurface";

/** A rectangle in board coordinates. */
export type BoardRect = { left: number; top: number; width: number; height: number };

/** Width handles on the frame's left and right edges; sizes are in board px. */
export type SelectionResizeHandles = {
  /** Width of the draggable strip centred on each edge. */
  hitWidth: number;
  /** Size of the visible grip centred on each edge: gripScale of the frame's height less gripInset at the top and at
   * the bottom, at most gripMaxHeight. */
  gripWidth: number;
  gripMaxHeight: number;
  gripScale: number;
  gripInset: number;
  draggingEdge: SelectionWidthEdge | null;
  onDrag(edge: SelectionWidthEdge, deltaX: number): void;
  onEnd(): void;
  onCancel(): void;
};

export type EditorSelectionOverlayHandle = {
  /** Realigns the layer with the board (call after the board scrolls or moves). */
  sync(): void;
  /** Shows the hover frame around a board rectangle, or hides it. */
  setHoverFrame(rect: BoardRect | null): void;
};

/**
 * Selection frame, hover frame and marquee rectangle, drawn outside the editor region so its edge fade mask
 * does not cover them. Placed after the region as a zero-size origin in the (positioned) workspace; its layer is
 * clipped to the playfield scroll viewport and follows the board.
 */
export const EditorSelectionOverlay = forwardRef<EditorSelectionOverlayHandle, {
  scrollRef: { current: HTMLElement | null };
  boardRef: { current: HTMLElement | null };
  frame: BoardRect | null;
  marquee: BoardRect | null;
  /** Shown on the frame when the selection's width can be dragged. */
  resize: SelectionResizeHandles | null;
}>(function EditorSelectionOverlay({ scrollRef, boardRef, frame, marquee, resize }, ref) {
  const anchor = useRef<HTMLDivElement>(null);
  const clip = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const hover = useRef<HTMLDivElement>(null);

  const sync = useCallback(() => {
    const anchorElement = anchor.current, clipElement = clip.current, layerElement = layer.current;
    const scroll = scrollRef.current, board = boardRef.current;
    if (!anchorElement || !clipElement || !layerElement || !scroll || !board) return;
    const origin = anchorElement.getBoundingClientRect();
    const viewport = scroll.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    clipElement.style.left = `${viewport.left - origin.left}px`;
    clipElement.style.top = `${viewport.top - origin.top}px`;
    clipElement.style.width = `${viewport.width}px`;
    clipElement.style.height = `${viewport.height}px`;
    layerElement.style.transform = `translate(${boardRect.left - viewport.left}px, ${boardRect.top - viewport.top}px)`;
  }, [boardRef, scrollRef]);

  useImperativeHandle(ref, () => ({
    sync,
    setHoverFrame(rect) {
      const element = hover.current;
      if (!element) return;
      if (!rect) { element.style.display = "none"; return; }
      Object.assign(element.style, { display: "block", left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px` });
    },
  }), [sync]);

  useLayoutEffect(() => {
    sync();
  });
  useLayoutEffect(() => {
    const observer = new ResizeObserver(sync);
    if (scrollRef.current) observer.observe(scrollRef.current);
    if (boardRef.current) observer.observe(boardRef.current);
    window.addEventListener("resize", sync);
    return () => { observer.disconnect(); window.removeEventListener("resize", sync); };
  }, [boardRef, scrollRef, sync]);

  // An edge drag: pointer capture keeps it on the handle; Escape cancels it.
  const drag = useRef<{ edge: SelectionWidthEdge; startX: number; pointerId: number } | null>(null);
  const resizeRef = useRef(resize);
  resizeRef.current = resize;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !drag.current) return;
      drag.current = null;
      resizeRef.current?.onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const handleProps = (edge: SelectionWidthEdge) => ({
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { edge, startX: event.clientX, pointerId: event.pointerId };
      resizeRef.current?.onDrag(edge, 0);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      resizeRef.current?.onDrag(current.edge, event.clientX - current.startX);
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      drag.current = null;
      resizeRef.current?.onEnd();
    },
    onPointerCancel() {
      if (!drag.current) return;
      drag.current = null;
      resizeRef.current?.onCancel();
    },
  });

  // The original slider thumb (music filter level DualSlider), drawn stretched to the grip box.
  const thumb = useOriginalSurface("button_slidegauge");
  const border = { borderWidth: SELECTION_FRAME_BORDER_PX } as CSSProperties;
  return <div ref={anchor} className="editor-selection-overlay" aria-hidden="true">
    <div ref={clip} className="editor-selection-overlay-clip">
      <div ref={layer} className="editor-selection-overlay-layer">
        <div ref={hover} className="selection-frame is-hover" style={{ ...border, display: "none" }} />
        {frame && <div className="selection-frame" style={{ ...border, ...frame }} />}
        {frame && resize && (["left", "right"] as const).map(edge => (
          <div key={edge} className={`selection-resize-handle ${resize.draggingEdge === edge ? "is-dragging" : ""}`}
            style={{ left: (edge === "left" ? frame.left : frame.left + frame.width) - resize.hitWidth / 2,
              top: frame.top, width: resize.hitWidth, height: frame.height }} {...handleProps(edge)}>
            <div className="selection-resize-grip" style={{ ...thumb, width: resize.gripWidth,
              height: Math.max(0, Math.min(resize.gripMaxHeight, (frame.height - 2 * resize.gripInset) * resize.gripScale)) }} />
          </div>
        ))}
        {marquee && <div className="selection-rect" style={{ ...border, ...marquee }} />}
      </div>
    </div>
  </div>;
});
