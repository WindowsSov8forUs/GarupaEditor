import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useUiViewport } from "./useUiViewport";
import { OriginalSprite } from "./OriginalUi";
import { OriginalSearchButton } from "./OriginalSearchButton";
import "./BestdoriMusicFilterDialog.css";
import { OriginalFormInput } from "./OriginalFormParts";
import { OriginalPrefabModel, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { originalUiRound } from "./originalSpriteGeometry";
import { originalSurfaceRow } from "./useOriginalSurface";
import profile from "../data/originalMusicFilterProfile.json";
export interface MusicFilterFields {
  id: string; keyword: string; artist: string; difficulty: number | null;
  minimum: number; maximum: number; order: "TIME_DESC" | "TIME_ASC";
}

const source = new OriginalPrefabModel(profile.content as unknown as OriginalPrefab);
function subtree(root: number, sourceModel = source): OriginalPrefab {
  const source = sourceModel;
  const nodes = source.prefab.nodes.filter(node => source.isWithin(node.id, root))
    .map(node => node.id === root ? { ...node, parent: null, position: { x: 0, y: 0, z: 0 } } : node);
  return { resource: source.prefab.resource, nodes,
    components: source.prefab.components.filter(component => nodes.some(node => node.id === component.node)) };
}
const radios = subtree(25), level = subtree(55);
const levelSource = new OriginalPrefabModel(level);
const track = levelSource.rect(levelSource.components.get(163)!);
const trackSprite = originalSurfaceRow("menu", "slidegauge_bg");
const trackLeft = track.x + trackSprite.borderLeft;
const trackRight = track.x + track.width - trackSprite.borderRight;
const hiddenSliderParts = new Set([167]); // Upper thumb's parent is a geometry-only sprite with no atlas.
const drawer = new OriginalPrefabModel(profile.drawer as unknown as OriginalPrefab);
const drawerTitle = String(drawer.components.get(163)!.data.mText);
const header = subtree(22, drawer), footer = subtree(47, drawer);
// Keep the source siblings in the same coordinate space: their pivots differ.
const contentCenterX = 330;
const clipLeft = 23;
const captionLeft = 32 - clipLeft;
const groupCenter = contentCenterX - clipLeft;
export const originalMusicBandGridLeft = groupCenter + source.transform(19).x - source.transform(5).x;
// Project source siblings through their full parent hierarchy. Removing the
// account-dependent play-state group closes that group's span only.
const sourceTop = source.transform(16).y;
// The source controller shifts the following section by 180 when play-state is
// absent. This editor keeps the extension filters, so they share that shift.
const removedPlayStateHeight = 180;
export function originalMusicFilterTop(node: number, afterPlayState = false): number {
  return sourceTop - source.transform(node).y - (afterPlayState ? removedPlayStateHeight : 0);
}
export function MusicFilterSourceHeading({ text, top, node }: { text: string; top: number; node: number }) {
  const prefab = subtree(node);
  const label = prefab.components.find(component => component.kind === "UILabel")!;
  const model = new OriginalPrefabModel(prefab, { components: { [label.id]: { mText: text } } });
  return <div data-filter-heading={text} style={{ position: "absolute",
    left: groupCenter + source.transform(node).x - source.transform(5).x, top }}>
    <OriginalPrefabView model={model} />
  </div>;
}
const sectionGap = source.nodes.get(16)!.position.y - source.nodes.get(30)!.position.y; // 47
const difficultyToLevel = source.nodes.get(13)!.position.y - source.nodes.get(38)!.position.y; // 160
const levelToGauge = source.nodes.get(38)!.position.y - source.nodes.get(55)!.position.y; // 68
export function MusicFilterHeading({ text, top, kind = "section" }: { text: string; top: number; kind?: "section" | "difficulty" | "field" }) {
  const root = kind === "section" ? 27 : kind === "difficulty" ? 13 : 38;
  const label = kind === "section" ? 134 : kind === "difficulty" ? 145 : 119;
  const [measured, setMeasured] = useState<{ text: string; width: number }>();
  const base = new OriginalPrefabModel(subtree(root));
  const background = base.prefab.components.find(component => component.node === root && component.kind === "UISprite")!;
  const labelComponent = base.components.get(label)!;
  const backgroundRect = base.rect(background), labelRect = base.rect(labelComponent);
  const scale = Math.abs(base.transform(root).scaleX);
  const padding = (labelRect.x - backgroundRect.x) / scale;
  const availableWidth = 560;
  const textWidth = measured?.text === text ? measured.width : labelRect.width;
  const row = originalSurfaceRow("menu", background.data.mSpriteName);
  const fittedWidth = Math.min(availableWidth / scale,
    Math.max(row.borderLeft + row.borderRight, Math.ceil(textWidth / scale + padding * 2)));
  const capsule = kind !== "section";
  // Custom captions use the source typography and left inset, with symmetric
  // padding around measured text. Keep the left edge fixed for either source pivot.
  const x = kind === "section" ? captionLeft : groupCenter + source.nodes.get(root)!.position.x;
  const model = new OriginalPrefabModel(base.prefab, {
    nodes: capsule ? { [labelComponent.node]: { x: padding } } : undefined,
    components: {
      [label]: { mText: text, ...(capsule ? { mWidth: (availableWidth / scale) - padding * 2, mMaxLineCount: 1 } : {}) },
      ...(capsule ? { [background.id]: { mWidth: fittedWidth, mPivot: 3 } } : {}),
    },
  });
  return <div data-filter-heading={text} style={{ position: "absolute", left: x + (capsule ? backgroundRect.x : 0), top }}>
    <OriginalPrefabView model={model} bindings={capsule ? {
      labelMeasurements: { [label]: width => setMeasured(previous =>
        previous?.text === text && previous.width === width ? previous : { text, width }) },
    } : undefined} />
  </div>;
}
export function MusicFilterRadioOptions({ options, value, onChange, top, sort = false, extension = false, typography }: {
  options: readonly string[]; value: number; onChange(value: number): void; top: number; sort?: boolean; extension?: boolean;
  typography?: Pick<import("./OriginalPrefabView").OriginalRadioBinding, "fontSize" | "labelWidth" | "labelHeight" | "labelSpacingX" | "labelOffset" | "maxLineCount" | "optionLayouts">;
}) {
  const prefab = sort ? subtree(12) : extension ? subtree(28) : radios, manager = sort ? 126 : extension ? 121 : 131;
  const model = new OriginalPrefabModel(prefab, { components: {
    [manager]: { radioButtonNameList: options, RawNameFlag: 1 },
  } });
  return <div style={{ position: "absolute", left: groupCenter + (typography ? 2 : 0), top }}>
    <OriginalPrefabView model={model} bindings={{ radios: { [manager]: {
      index: value, onChange: index => { if (index !== value) onChange(index); },
      fontSize: 20, labelWidth: extension ? 88 : 126, labelHeight: sort ? 80 : 50, labelSpacingX: 1,
      labelOffset: { x: -8, y: -3 }, maxLineCount: sort ? 2 : 1,
      optionLayouts: sort ? { 0: { labelOffset: { x: -8, y: -1 } }, 1: { labelOffset: { x: -7, y: 0 } } } : undefined,
      ...typography,
    } } }} />
  </div>;
}

export function MusicFilterLevelRange({ minimum, maximum, onChange, top, bounds }: {
  minimum: number; maximum: number; top: number; bounds: readonly [number, number]; onChange(minimum: number, maximum: number): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; side: "lower" | "upper"; offset: number } | null>(null);
  const range = bounds[1] - bounds[0];
  const valueX = (value: number) => trackLeft + (trackRight - trackLeft) * (range === 0 ? 0 : (Math.min(bounds[1], Math.max(bounds[0], value)) - bounds[0]) / range);
  const model = new OriginalPrefabModel(level, { nodes: {
    49: { x: originalUiRound(valueX(minimum) - levelSource.transform(54).x) },
    53: { x: originalUiRound(valueX(maximum) - levelSource.transform(45).x) },
  }, components: { 152: { mText: String(minimum) }, 170: { mText: String(maximum) } } });
  const coordinate = (clientX: number) => {
    const box = host.current!.getBoundingClientRect();
    return (clientX - box.left) * 610 / box.width - groupCenter;
  };
  const set = (side: "lower" | "upper", x: number) => {
    const value = bounds[0] + originalUiRound(Math.min(1, Math.max(0, (x - trackLeft) / (trackRight - trackLeft))) * range);
    const lower = side === "lower" ? Math.min(maximum, value) : minimum;
    const upper = side === "upper" ? Math.max(minimum, value) : maximum;
    if (lower !== minimum || upper !== maximum) onChange(lower, upper);
  };
  return <div ref={host} style={{ position: "absolute", left: 0, top: top - 80, width: 610, height: 160 }}>
    <div style={{ position: "absolute", left: groupCenter, top: 80 }}>
      <OriginalPrefabView model={model} bindings={{ omit: hiddenSliderParts }} />
      {(["lower", "upper"] as const).map(side => {
        const hit = model.rect(model.components.get(side === "lower" ? 114 : 115)!);
        const value = side === "lower" ? minimum : maximum;
        return <div key={side} role="slider" tabIndex={0} aria-label={side === "lower" ? "最低谱面等级" : "最高谱面等级"}
          aria-valuemin={side === "lower" ? bounds[0] : minimum} aria-valuemax={side === "lower" ? maximum : bounds[1]} aria-valuenow={value}
          style={{ position: "absolute", left: hit.x, top: hit.y, width: hit.width, height: hit.height,
            zIndex: 40, touchAction: "none", cursor: "ew-resize" }}
          onPointerDown={event => {
            if (event.button !== 0 || drag.current) return;
            event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { id: event.pointerId, side, offset: valueX(value) - coordinate(event.clientX) };
          }}
          onPointerMove={event => { if (drag.current?.id === event.pointerId) set(side, coordinate(event.clientX) + drag.current.offset); }}
          onPointerUp={event => { if (drag.current?.id === event.pointerId) {
            set(side, coordinate(event.clientX) + drag.current.offset); drag.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          } }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
          onKeyDown={event => {
            const next = event.key === "Home" ? bounds[0] : event.key === "End" ? bounds[1]
              : event.key === "ArrowLeft" || event.key === "ArrowDown" ? value - 1
                : event.key === "ArrowRight" || event.key === "ArrowUp" ? value + 1 : null;
            if (next !== null) { event.preventDefault(); set(side, valueX(next)); }
          }} />;
      })}
    </div>
  </div>;
}

export function OriginalMusicFilterDialog({ open, value, onChange, onSearch, onClose, defaults, bounds, compact = false, custom, title = drawerTitle, mode = "filter" }: {
  mode?: "search" | "filter";
  title?: string;
  open: boolean; value: MusicFilterFields; onChange(value: MusicFilterFields): void;
  custom?: { resetLabel?: string; fields: readonly ("id" | "keyword" | "artist")[]; height: number; render(top: number): ReactNode };
  defaults: MusicFilterFields; bounds: readonly [number, number]; compact?: boolean;
  onSearch(value: MusicFilterFields, field: "id" | "keyword" | "artist"): void; onClose(): void;
}) {
  const view = useUiViewport();
  const searching = mode === "search";
  const displayedTitle = searching ? (title === drawerTitle ? "乐曲搜索" : "谱面搜索") : title;
  const [draft, setDraft] = useState({ id: value.id, keyword: value.keyword, artist: value.artist });
  const previousSearch = useRef({ id: value.id, keyword: value.keyword, artist: value.artist, open });
  useLayoutEffect(() => {
    const previous = previousSearch.current;
    setDraft(draft => Object.fromEntries((["id", "keyword", "artist"] as const).map(field =>
      [field, open !== previous.open || value[field] !== previous[field] ? value[field] : draft[field]])) as typeof draft);
    previousSearch.current = { id: value.id, keyword: value.keyword, artist: value.artist, open };
  }, [open, value.id, value.keyword, value.artist]);
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [scroll, setScroll] = useState({ top: 0, height: 1, viewport: 1 });
  const scroller = useRef<HTMLDivElement>(null);
  const contentDrag = useRef<{ id: number; x: number; y: number; top: number; moved: boolean } | null>(null);
  const suppressContentClick = useRef(false);
  const grab = useRef<{ id: number; y: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (open) { setMounted(true); const frame = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(frame); }
    contentDrag.current = null;
    suppressContentClick.current = false;
    setShown(false);
    const timer = setTimeout(() => setMounted(false), 150);
    return () => clearTimeout(timer);
  }, [open]);
  useLayoutEffect(() => {
    if (!mounted) return;
    const element = scroller.current!;
    const measure = () => setScroll({ top: element.scrollTop, height: element.scrollHeight, viewport: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element); observer.observe(element.firstElementChild!);
    measure();
    return () => observer.disconnect();
  }, [mounted]);
  const update = (change: Partial<MusicFilterFields>) => onChange({ ...value, ...change });
  if (!mounted) return null;
  const safeRight = view.safeInsets.right / view.scale;
  const safeTop = view.safeInsets.top / view.scale, safeBottom = view.safeInsets.bottom / view.scale;
  const height = view.logicalHeight;
  const fraction = Math.min(1, scroll.viewport / scroll.height);
  const barHeight = Math.max(0, height - safeTop - safeBottom - 196);
  const clipTop = safeTop + (height - safeTop - safeBottom - barHeight) / 2 - 12;
  const searchTop = 21;
  // Search inputs are editor fields, not the original two-row difficulty group.
  // A 32-high caption, 20-unit gap, 40-high input and 20-unit gap use 112 units.
  const searchRowPitch = 112;
  const searchHeight = searchTop + sectionGap + searchRowPitch * (custom?.fields.length ?? (compact ? 1 : 3));
  const filterTop = searchTop;
  const difficultyTop = filterTop + sectionGap;
  const levelTop = difficultyTop + (compact ? 0 : difficultyToLevel);
  const sortTop = levelTop + levelToGauge + 100;
  const contentHeight = searching ? searchHeight : custom ? filterTop + custom.height : compact ? sortTop : sortTop + 49 + 40;
  const headerModel = new OriginalPrefabModel(header, { components: {
    163: { mText: displayedTitle, mWidth: 350 }, 189: { mText: custom?.resetLabel ?? "恢复默认" },
  } });
  return createPortal(<div className="music-filter-drawer-projection" style={{
    width: (640 + safeRight) * view.scale, height: view.height,
  }}>
    <section className="music-filter-drawer" role="dialog" aria-label={displayedTitle}
      style={{ width: 640 + safeRight, height, scale: view.scale, transform: `translateX(${shown ? 0 : 640 + safeRight}px)` }}
      onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") onClose(); }}>
      <OriginalSprite data-filter-drawer-background atlas="menu" sprite="bg_base_r12" scale={1} fillCenter
        style={{ position: "absolute", inset: 0, width: Math.trunc((640 + safeRight) * 1.3), height, pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 436, top: safeTop, zIndex: 2 }}>
        <OriginalPrefabView model={headerModel} bindings={{ buttons: { 199: { action: () => { if (searching) { setDraft({ id: "", keyword: "", artist: "" }); onChange({ ...value, id: "", keyword: "", artist: "" }); } else onChange({ ...defaults, id: value.id, keyword: value.keyword, artist: value.artist }); }, label: custom?.resetLabel ?? "恢复默认" } } }} />
      </div>
      <div ref={scroller} className="music-filter-drawer-scroll" style={{ top: clipTop, height: barHeight }}
        onPointerDownCapture={event => {
          if (event.pointerType !== "mouse" || event.button !== 0 || contentDrag.current ||
            (event.target as Element).closest('input, textarea, [contenteditable="true"], [role="slider"]')) return;
          suppressContentClick.current = false;
          contentDrag.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
            top: event.currentTarget.scrollTop, moved: false };
          if (!(event.target as Element).closest("button")) event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMoveCapture={event => {
          const drag = contentDrag.current;
          if (!drag || drag.id !== event.pointerId) return;
          if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 4 * view.scale) return;
          drag.moved = true;
          suppressContentClick.current = true;
          // Taking capture clears the child button's pressed state via lostpointercapture.
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault(); event.stopPropagation();
          event.currentTarget.scrollTop = drag.top - (event.clientY - drag.y) / view.scale;
        }}
        onPointerUpCapture={event => {
          const drag = contentDrag.current;
          if (!drag || drag.id !== event.pointerId) return;
          contentDrag.current = null;
          if (drag.moved) {
            event.preventDefault(); event.stopPropagation();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancelCapture={() => { contentDrag.current = null; }}
        onLostPointerCapture={event => {
          if (event.target === event.currentTarget) contentDrag.current = null;
        }}
        onClickCapture={event => {
          if (suppressContentClick.current) {
            suppressContentClick.current = false; event.preventDefault(); event.stopPropagation();
          }
        }}
        onScroll={event => { const el = event.currentTarget; setScroll({ top: el.scrollTop, height: el.scrollHeight, viewport: el.clientHeight }); }}>
        <div className="music-filter-drawer-content" style={{ height: contentHeight }}>
          {searching && <><MusicFilterHeading text="搜索" top={searchTop} />
          {([{ key: "id", label: "ID", aria: "谱面 ID" }, { key: "keyword", label: "关键词", aria: "搜索关键词" },
            { key: "artist", label: "艺术家", aria: "艺术家" }] as const).filter(field => custom ? custom.fields.includes(field.key) : !compact || field.key === "id").map((field, index) => {
              const top = searchTop + sectionGap + index * searchRowPitch;
              return <div key={field.key} style={{ display: "contents" }}>
                <MusicFilterHeading text={field.label} top={top} kind="field" />
                <div style={{ position: "absolute", left: captionLeft, top: top + 36, width: 560, display: "flex", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <OriginalFormInput aria-label={field.aria} inputMode={field.key === "id" ? "numeric" : undefined}
                      value={draft[field.key]} disabled={field.key === "keyword" && !!value.id.trim()}
                      onChange={event => setDraft(previous => ({ ...previous, [field.key]: event.target.value }))} />
                  </div>
                  <OriginalSearchButton label={`搜索${field.label}`} disabled={field.key === "keyword" && !!value.id.trim()}
                    onClick={() => onSearch({ ...value, [field.key]: draft[field.key] }, field.key)} />
                </div>
              </div>;
            })}
          </>}
          {!searching && (custom ? custom.render(filterTop) : <>
          <MusicFilterHeading text="筛选" top={filterTop} />
          {!compact && <><MusicFilterHeading text="难易度" top={difficultyTop} kind="difficulty" />
          <MusicFilterRadioOptions options={["不指定", "EASY", "NORMAL", "HARD", "EXPERT", "SPECIAL"]} top={difficultyTop + 47}
            value={value.difficulty === null ? 0 : value.difficulty + 1} onChange={index => update({ difficulty: index ? index - 1 : null })} /></>}
          <MusicFilterHeading text="谱面等级" top={levelTop} kind="field" />
          <MusicFilterLevelRange bounds={bounds} top={levelTop + levelToGauge} minimum={value.minimum} maximum={value.maximum}
            onChange={(minimum, maximum) => update({ minimum, maximum })} />
          {!compact && <><MusicFilterHeading text="顺序" top={sortTop} />
          <MusicFilterRadioOptions options={["发布时间倒序", "发布时间顺序"]} top={sortTop + 49} sort
            value={value.order === "TIME_DESC" ? 0 : 1} onChange={index => update({ order: index ? "TIME_ASC" : "TIME_DESC" })} /></>}
          </>)}
        </div>
      </div>
      {fraction < 1 && <div role="scrollbar" aria-label={searching ? "搜索内容" : "筛选内容"} aria-orientation="vertical"
        aria-valuemin={0} aria-valuemax={Math.max(0, scroll.height - scroll.viewport)} aria-valuenow={scroll.top}
        style={{ position: "absolute", left: 610, top: clipTop, height: barHeight, width: 20, touchAction: "none" }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          grab.current = { id: event.pointerId, y: event.clientY, top: scroll.top };
        }} onPointerMove={event => {
          if (grab.current?.id === event.pointerId && scroller.current)
            scroller.current.scrollTop = grab.current.top + (event.clientY - grab.current.y) / view.scale * scroll.height / barHeight;
        }} onPointerUp={() => { grab.current = null; }} onPointerCancel={() => { grab.current = null; }}>
        <OriginalSprite atlas="menu" sprite="scrollbar_base" scale={1} style={{ position: "absolute", left: 6, width: 8, height: barHeight }} />
        <OriginalSprite atlas="menu" sprite="scrollbar_top" scale={1} style={{ position: "absolute", left: 6,
          top: scroll.top / scroll.height * barHeight, width: 8, height: fraction * barHeight }} />
      </div>}
      <div style={{ position: "absolute", left: 312, top: height - safeBottom - 68, zIndex: 2 }}>
        <OriginalPrefabView model={new OriginalPrefabModel(footer)}
          bindings={{ buttons: { 184: { action: onClose, label: "关闭" } } }} />
      </div>
    </section>
  </div>, document.body);
}
