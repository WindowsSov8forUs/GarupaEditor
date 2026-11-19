import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import source from "../data/originalScrollPopupList.json";
import { OriginalPrefabModel, type OriginalComponent, type OriginalNode, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";

/**
 * The original StarUIScrollPopupList (AreaTalkFilterDialog's area filter, JP 10.2.0): the ListButton row shows the
 * current value; pressing it opens the list below it. The list's background, highlight bar, scroll bar and clip area
 * are the authored prefab; its cells are built at runtime as the original createCells does (a 400×48 cell holding a
 * 360×48 left-aligned label). Opening scales the list from 0 to full height and flips the arrow; closing fades it out.
 */
const prefab = source.prefab as unknown as OriginalPrefab;
const runtime = source.runtime;
const base = new OriginalPrefabModel(prefab);
const listButton = base.nodeAt("ListButton");
const triggerButton = base.componentAt(listButton.id, "StarUIButton")!;
const triggerSprite = base.componentAt(listButton.id, "UISprite")!;
const triggerCollider = base.componentAt(listButton.id, "BoxCollider2D")!;
const triggerLabel = base.componentAt(base.nodeAt("ListButton/Label").id, "UILabel")!;
const arrow = base.componentAt(base.nodeAt("PulldownIcon").id, "UISprite")!;
const popup = base.nodeAt("ScrollPopupList");
const popupList = base.componentAt(popup.id, "StarUIScrollPopupList")!;
const outerButton = base.componentAt(popup.id, "StarUIButton")!;
const background = base.nodeAt("ScrollPopupList/BG");
const clipBase = base.nodeAt("ClipPanelBase");
const selected = base.nodeAt("SelectedBG");
const scrollBar = base.nodeAt("ScrollBar");
const thumb = base.nodeAt("ScrollBar/Thumb");
const barBackground = base.componentAt(base.nodeAt("ScrollBar/Background").id, "UISprite")!;
const clip = base.componentAt(base.nodeAt("ScrollPopupList/ClipPanel").id, "UIPanel")!;
const grid = base.nodeAt("Grid");
const cellHeight = Number(popupList.data.cellHeight);
const selectedOffset = popupList.data.selectedCellBGPositionOffset as { x: number; y: number };
const fontColor = popupList.data.fontColor as OriginalComponent["data"];
const [clipX, clipY, clipWidth, clipHeight] = [clip.data.mClipRange.x, clip.data.mClipRange.y, clip.data.mClipRange.z, clip.data.mClipRange.w] as number[];
const softness = Number(clip.data.mClipSoftness.y);
const popupTransform = base.transform(popup.id);
/** The authored width of the row and the list (400); a narrower or wider control keeps every part's edge distances. */
export const ORIGINAL_SCROLL_POPUP_WIDTH = Number(triggerSprite.data.mWidth);

/**
 * Height of the list for a number of options: it fits them, keeping the authored space below the last row, up to the
 * authored height (316), which shows the original viewRows (6) rows; more options scroll.
 */
function listHeightFor(count: number): number {
  return Math.min(clipHeight, count * cellHeight + clipHeight - runtime.viewRows * cellHeight);
}

/** The layout box of the row at a given width: its hit area, which is wider and taller than its sprite. */
export function originalScrollPopupBox(width = ORIGINAL_SCROLL_POPUP_WIDTH): { width: number; height: number } {
  return { width: Number(triggerCollider.data.m_Size.x) + width - ORIGINAL_SCROLL_POPUP_WIDTH,
    height: Number(triggerCollider.data.m_Size.y) };
}
const CELL_ID = 1_000_000;

export interface OriginalScrollPopupOption { key: string; label: string }

/** The prefab with one runtime cell per option under the grid, and the runtime state written to the authored nodes. */
function buildModel(options: readonly OriginalScrollPopupOption[], value: string, scroll: number, open: boolean, width: number) {
  // Width change: parts anchored to an edge move by half of it, parts spanning the width grow by all of it.
  const change = width - ORIGINAL_SCROLL_POPUP_WIDTH;
  const triggerLabelNode = base.nodes.get(triggerLabel.node)!, arrowNode = base.nodes.get(arrow.node)!;
  const wider = (component: OriginalComponent) => ({ mWidth: Number(component.data.mWidth) + change });
  // Height change (never above the authored height): the list keeps its top edge, so its parts shift by half.
  const height = listHeightFor(options.length), grow = height - clipHeight;
  const widerClip = (panel: OriginalComponent) => ({ mClipRange: { ...panel.data.mClipRange,
    y: Number(panel.data.mClipRange.y) - grow / 2, z: Number(panel.data.mClipRange.z) + change, w: Number(panel.data.mClipRange.w) + grow } });
  const backgroundSprite = base.componentAt(background.id, "UISprite")!;
  const cellNodes: OriginalNode[] = options.map((_, index) => ({
    id: CELL_ID + index, transformId: CELL_ID + index, name: `Cell${index}`, parent: grid.id,
    position: { x: 0, y: -cellHeight * index, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
    active: true, path: `${grid.path}/Cell${index}`,
  }));
  const cellLabels: OriginalComponent[] = options.map((option, index) => ({
    id: CELL_ID + index, node: CELL_ID + index, kind: "UILabel", data: {
      ...triggerLabel.data, mText: option.label, mFontSize: popupList.data.fontSize, mColor: fontColor,
      mWidth: runtime.cell.labelWidth + change, mHeight: cellHeight, mPivot: 4, mAlignment: runtime.cell.labelAlignment,
      mSpacingX: runtime.cell.labelSpacingX, mOverflow: runtime.cell.labelOverflow, mDepth: popupList.data.cellDepth,
    },
  }));
  const index = Math.max(0, options.findIndex(option => option.key === value));
  const content = options.length * cellHeight, view = height - softness * 2;
  const barSize = Math.min(1, view / Math.max(content, 1));
  const barHeight = Number(barBackground.data.mHeight) + grow;
  const travel = Math.max(0, content - view);
  const thumbHeight = barHeight * barSize;
  const thumbY = (barHeight - thumbHeight) / 2 - (travel > 0 ? scroll / travel : 0) * (barHeight - thumbHeight);
  const gridPosition = { x: grid.position.x, y: grid.position.y + scroll };
  return new OriginalPrefabModel({ ...prefab, nodes: [...prefab.nodes, ...cellNodes], components: [...prefab.components, ...cellLabels] }, {
    nodes: {
      [popup.id]: { active: open },
      [grid.id]: gridPosition,
      // The highlight bar follows the selected cell (in world position) plus the authored offset.
      [selected.id]: { x: gridPosition.x + selectedOffset.x, y: gridPosition.y - cellHeight * index + selectedOffset.y },
      [thumb.id]: { y: thumb.position.y + thumbY },
      [triggerLabelNode.id]: { x: triggerLabelNode.position.x - change / 2 },
      [arrowNode.id]: { x: arrowNode.position.x + change / 2 },
      [scrollBar.id]: { x: scrollBar.position.x + change / 2, y: scrollBar.position.y - grow / 2 },
      [background.id]: { y: background.position.y - grow / 2 },
    },
    components: {
      [triggerSprite.id]: wider(triggerSprite),
      [triggerCollider.id]: { m_Size: { ...triggerCollider.data.m_Size, x: Number(triggerCollider.data.m_Size.x) + change } },
      [backgroundSprite.id]: { ...wider(backgroundSprite), mHeight: Number(backgroundSprite.data.mHeight) + grow },
      [barBackground.id]: { mHeight: barHeight },
      [base.componentAt(selected.id, "UISprite")!.id]: wider(base.componentAt(selected.id, "UISprite")!),
      [base.componentAt(clipBase.id, "UIPanel")!.id]: widerClip(base.componentAt(clipBase.id, "UIPanel")!),
      [clip.id]: widerClip(clip),
      [triggerLabel.id]: { mText: options.find(option => option.key === value)?.label ?? "", ...wider(triggerLabel) },
      [arrow.id]: { mFlip: open ? runtime.open.arrowFlip : runtime.close.arrowFlip },
      [base.componentAt(thumb.id, "UISprite")!.id]: { mHeight: thumbHeight },
    },
  });
}

const originStyle = (box: { x: number; y: number }): CSSProperties => ({ left: -box.x, top: -box.y });

export function OriginalScrollPopupList({ label, options, value, onChange, width = ORIGINAL_SCROLL_POPUP_WIDTH }: {
  label: string;
  options: readonly OriginalScrollPopupOption[];
  value: string;
  onChange(key: string): void;
  /** Width of the row and the list in design units (the original's 400 by default). */
  width?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [scroll, setScroll] = useState(0);
  const [placement, setPlacement] = useState<{ left: number; top: number; scale: number } | null>(null);
  const listHeight = listHeightFor(options.length);
  const content = options.length * cellHeight, view = listHeight - softness * 2;
  const travel = Math.max(0, content - view);
  const shown = open || closing;
  const model = useMemo(() => buildModel(options, value, scroll, shown && !closing, width), [options, value, scroll, shown, closing, width]);
  const triggerBox = model.rect(model.components.get(triggerCollider.id)!);
  const listWidth = clipWidth + width - ORIGINAL_SCROLL_POPUP_WIDTH;
  const close = () => {
    setClosing(true);
    window.setTimeout(() => { setOpen(false); setClosing(false); }, runtime.close.duration * 1000);
  };
  const toggle = () => {
    if (open) { close(); return; }
    // The selected cell is scrolled into view, as SelectDefaultCell does.
    const index = Math.max(0, options.findIndex(option => option.key === value));
    setScroll(Math.min(travel, Math.max(0, index * cellHeight - (view - cellHeight) / 2)));
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!shown || !host.current) return;
    const place = () => {
      const rect = host.current!.getBoundingClientRect();
      setPlacement({ left: rect.left, top: rect.top, scale: rect.width / triggerBox.width });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [shown]);
  useEffect(() => { if (!shown) setPlacement(null); }, [shown]);
  const drag = useRef<{ y: number; scroll: number; moved: boolean } | null>(null);
  const clampScroll = (next: number) => Math.min(travel, Math.max(0, next));
  const onWheel = (event: WheelEvent) => { if (travel > 0) setScroll(current => clampScroll(current + event.deltaY * 0.5)); };
  const onPointerDown = (event: PointerEvent) => {
    drag.current = { y: event.clientY, scroll, moved: false };
  };
  const onPointerMove = (event: PointerEvent) => {
    // The list does not drag when it fits (disableDragIfFits).
    const state = drag.current; if (!state || travel <= 0 || !placement) return;
    const delta = (state.y - event.clientY) / placement.scale;
    // The press stays with the cell under it (so a tap picks it) until it moves: then the list takes it and drags.
    if (!state.moved && Math.abs(delta) > 4) {
      state.moved = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    if (state.moved) setScroll(clampScroll(state.scroll + delta));
  };
  const pick = (key: string) => {
    if (drag.current?.moved) return;
    onChange(key);
    close();
  };
  const clipLeft = popupTransform.x + clipX - listWidth / 2;
  const clipTop = -(popupTransform.y + clipY + clipHeight / 2);
  // Scale opens from the list's own origin (the ScrollPopupList node), growing downwards.
  const originY = -popupTransform.y;
  const mask = `linear-gradient(to bottom, transparent, #000 ${softness}px, #000 calc(100% - ${softness}px), transparent)`;
  return <div ref={host} className="original-scroll-popup-list"
    style={{ position: "relative", width: triggerBox.width, height: triggerBox.height, flexShrink: 0 }}>
    <div className="original-prefab-origin" style={originStyle(triggerBox)}>
      <OriginalPrefabView model={model} root={listButton.id}
        bindings={{ buttons: { [triggerButton.id]: { action: toggle, label } } }} />
    </div>
    {shown && placement && createPortal(<div className="original-scroll-popup-layer" data-original-dialog-overlay=""
      style={{ position: "fixed", left: placement.left, top: placement.top, width: triggerBox.width, height: triggerBox.height,
        transform: `scale(${placement.scale})`, transformOrigin: "0 0", zIndex: 4000 }}>
      <div className="original-prefab-origin" style={originStyle(triggerBox)}>
        {/* The outer button closes the list when anything outside it is pressed. */}
        <OriginalPrefabView model={model} root={popup.id} bindings={{
          buttons: { [outerButton.id]: { action: close, label: "关闭" } },
          omit: new Set([...model.components.values()].filter(item => item.kind !== "StarUIButton" && model.isWithin(item.node, popup.id)).map(item => item.id)),
        }} />
        {/* Opening scales the list from 0 to full height (TweenScale); closing fades it out (TweenAlpha). */}
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: `0 ${originY}px`,
          animation: closing ? `original-scroll-popup-fade ${runtime.close.duration}s linear forwards`
            : `original-scroll-popup-open ${runtime.open.duration}s linear`,
          zIndex: 1001 }}>
          <OriginalPrefabView model={model} root={background.id} />
          <div onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={() => { window.setTimeout(() => { drag.current = null; }, 0); }}
            style={{ position: "absolute", left: clipLeft, top: clipTop, width: listWidth, height: listHeight,
              overflow: "hidden", maskImage: mask, WebkitMaskImage: mask, touchAction: "none" }}>
            <div className="original-prefab-origin" style={{ left: -clipLeft, top: -clipTop }}>
              <OriginalPrefabView model={model} root={clipBase.id} />
              <OriginalPrefabView model={model} root={grid.id} />
              {/* Cells carry no StarUIButton (createCells uses a UIEventListener), so picking one plays no sound. */}
              {options.map((option, index) => {
                const cell = model.rect(model.components.get(CELL_ID + index)!);
                return <button key={option.key} type="button" className="original-button original-prefab-hit original-scroll-popup-cell"
                  aria-label={option.label} aria-selected={option.key === value} role="option"
                  onClick={() => pick(option.key)}
                  style={{ position: "absolute", left: cell.x + cell.width / 2 - listWidth / 2, top: cell.y,
                    width: listWidth, height: cellHeight, zIndex: 1002 }} />;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>, document.body)}
  </div>;
}
