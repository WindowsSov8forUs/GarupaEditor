import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ReactNode } from "react";
import { OriginalVerticalStepper } from "../OriginalFormParts";
import { OriginalSquareButton, ORIGINAL_SQUARE_BUTTON_BOUNDS } from "../OriginalSquareButton";
import { ORIGINAL_HEADER_MENU_BOUNDS } from "../OriginalPageHeader";
import { OriginalPrefabModel, ORIGINAL_PREFABS } from "../originalPrefabModel";
import { OriginalPrefabView } from "../OriginalPrefabView";
import { useUiViewport } from "../useUiViewport";
import { useApplicationResourceUrl } from "../../resources/applicationResourceContext";
import { RehearsalTimeHud } from "./rehearsalTimeHud";
import { EDITOR_LEFT_GRID } from "./SidebarPanel";
import "./EditorControlColumn.css";

const pad = (value: number, width: number) => String(value).padStart(width, "0");

/**
 * 00:00.000, or 00:00:00.000 with hours; negative or non-finite input shows zero. The current time takes the
 * total's form, so both keep one shape whichever side of an hour the current time is on.
 */
export function formatPlaybackClock(seconds: number, withHours: boolean): string {
  const ms = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds * 1000)) : 0;
  const totalSeconds = Math.floor(ms / 1000);
  const tail = `${pad(Math.floor(totalSeconds / 60) % 60, 2)}:${pad(totalSeconds % 60, 2)}.${pad(ms % 1000, 3)}`;
  return withHours ? `${pad(Math.floor(totalSeconds / 3600), 2)}:${tail}`
    : `${pad(Math.floor(totalSeconds / 60), 2)}:${pad(totalSeconds % 60, 2)}.${pad(ms % 1000, 3)}`;
}
const hasHours = (seconds: number) => Number.isFinite(seconds) && seconds >= 3600;

/** The rehearsal-style time HUD: current playback time over the audio length. */
export function EditorPlaybackClock({ getSeconds, maxSeconds, designUnits = false }: { getSeconds(): number; maxSeconds: number;
  designUnits?: boolean }) {
  const withHours = hasHours(maxSeconds);
  const [text, setText] = useState(() => formatPlaybackClock(getSeconds(), withHours));
  useEffect(() => {
    let frame = 0, last = "";
    const tick = () => {
      const next = formatPlaybackClock(getSeconds(), withHours);
      if (next !== last) { last = next; setText(next); }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [getSeconds, withHours]);
  return <RehearsalTimeHud nowText={text} maxText={`/${formatPlaybackClock(maxSeconds, withHours)}`} designUnits={designUnits} />;
}


/** Edit tools sit at two thirds of the header menu button, stacked from the bottom up and centred on it.
 * Sizes are design px; the original square button is scaled uniformly from its own bounds to that size. */
const TOOL_SIZE_RATIO = 2 / 3;
const TOOL_GAP = 8;

const TOOL_SCALE = Math.min(ORIGINAL_HEADER_MENU_BOUNDS.width, ORIGINAL_HEADER_MENU_BOUNDS.height) * TOOL_SIZE_RATIO
  / Math.max(ORIGINAL_SQUARE_BUTTON_BOUNDS.width, ORIGINAL_SQUARE_BUTTON_BOUNDS.height);

/** One original square button, at the edit tool size unless `size` gives another ratio to its original size. */
function EditorToolCell({ className, scale, size = TOOL_SCALE, popup, children }: {
  className?: string; scale: number; size?: number; popup?: ReactNode; children: ReactNode;
}) {
  return <div className={`editor-control-tool-cell ${className ?? ""}`.trim()}
    style={{ width: ORIGINAL_SQUARE_BUTTON_BOUNDS.width * size * scale, height: ORIGINAL_SQUARE_BUTTON_BOUNDS.height * size * scale }}>
    <div className="editor-control-tool-scale"
      style={{ width: ORIGINAL_SQUARE_BUTTON_BOUNDS.width, height: ORIGINAL_SQUARE_BUTTON_BOUNDS.height,
        transform: `scale(${size * scale})` }}>
      <div className="original-prefab-origin" style={{ left: -ORIGINAL_SQUARE_BUTTON_BOUNDS.x, top: -ORIGINAL_SQUARE_BUTTON_BOUNDS.y }}>
        {children}
      </div>
    </div>
    {popup}
  </div>;
}

/** Speed text a step below the HiSpeed value's authored 28 so five-character rates keep a margin in the field. */
const SPEED_FONT_SIZE = 24;
/** Playback speed: the original HiSpeed stepper stacked vertically, at the edit tool scale and the column's width. */
function EditorSpeedStepper({ scale, label, canSlower, canFaster, step }: {
  scale: number; label: string; canSlower: boolean; canFaster: boolean; step(delta: number): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current!;
    setSize({ width: element.offsetWidth, height: element.offsetHeight });
  }, [label]);
  return <div className="editor-control-tool-cell editor-speed-stepper"
    style={{ width: size.width * TOOL_SCALE * scale, height: size.height * TOOL_SCALE * scale }}>
    <div ref={ref} className="editor-control-tool-scale" style={{ transform: `scale(${TOOL_SCALE * scale})` }}>
      <OriginalVerticalStepper title="播放倍速" text={label}
        width={ORIGINAL_HEADER_MENU_BOUNDS.width / TOOL_SCALE} gap={TOOL_GAP / TOOL_SCALE} fontSize={SPEED_FONT_SIZE}
        canIncrease={canFaster} canDecrease={canSlower} onIncrease={() => step(1)} onDecrease={() => step(-1)} />
    </div>
  </div>;
}

/**
 * The left column's middle row, above the play action: undo, redo, delete (the selected notes and Slide segments, as
 * the Delete key and a right-click do), copy and paste, one per column. The column is drawn in design px (it carries
 * the UI scale itself), so the cells use scale 1 and keep the original button size.
 */
export function EditorHistoryTools({ canUndo, canRedo, onUndo, onRedo, canDelete, onDelete, onCopy, onPaste, undoIcon,
  deleteIcon, copyIcon, pasteIcon }: {
  canUndo: boolean; canRedo: boolean; onUndo(): void; onRedo(): void;
  canDelete: boolean; onDelete(): void; onCopy(): void; onPaste(): void;
  undoIcon: string; deleteIcon: string; copyIcon: string; pasteIcon: string;
}) {
  return <div className="editor-history-tools" style={{ gap: EDITOR_LEFT_GRID.gap }}>
    <EditorSquareTool label="撤销" glyph={undoIcon} disabled={!canUndo} onClick={onUndo} />
    <EditorSquareTool label="重做" glyph={undoIcon} flip disabled={!canRedo} onClick={onRedo} />
    <EditorSquareTool label="删除" glyph={deleteIcon} disabled={!canDelete} onClick={onDelete} />
    <EditorSquareTool label="复制" glyph={copyIcon} onClick={onCopy} />
    <EditorSquareTool label="粘贴" glyph={pasteIcon} onClick={onPaste} />
  </div>;
}

/** One original square button of the left column's rows, at its original size (the column carries the UI scale). */
export function EditorSquareTool({ label, glyph, disabled, selected, flip, rotate, onClick }: {
  label: string; glyph: string; disabled?: boolean; selected?: boolean; flip?: boolean; rotate?: boolean; onClick(): void;
}) {
  return <EditorToolCell scale={1} size={1}>
    <OriginalSquareButton label={label} glyph={glyph} disabled={disabled} selected={selected} flip={flip} rotate={rotate}
      onClick={onClick} />
  </EditorToolCell>;
}

/** The left column's top row of selection tools: up-down and left-right mirror, then `trailing`, one per column. */
export function EditorMirrorTools({ enabled, onMirror, mirrorIcon, trailing }: {
  enabled: boolean; onMirror(axis: "horizontal" | "vertical"): void; mirrorIcon: string; trailing?: ReactNode;
}) {
  return <div className="editor-history-tools" style={{ gap: EDITOR_LEFT_GRID.gap }}>
    <EditorSquareTool label="上下翻转" glyph={mirrorIcon} rotate disabled={!enabled} onClick={() => onMirror("vertical")} />
    <EditorSquareTool label="左右翻转" glyph={mirrorIcon} disabled={!enabled} onClick={() => onMirror("horizontal")} />
    {trailing}
  </div>;
}

// The header menu button (TopRightMenu/buttonMenu): 80×80 button_gray with its pink icon. The play button reuses it
// with the menu, NEW and alert icons hidden and the play/pause glyph drawn where the menu icon sits.
const menuSource = new OriginalPrefabModel(ORIGINAL_PREFABS.header!);
const menuRoot = menuSource.nodeAt("TopRightMenu/buttonMenu");
const menuNodes = menuSource.prefab.nodes.filter(node => menuSource.isWithin(node.id, menuRoot.id))
  .map(node => node.id === menuRoot.id ? { ...node, parent: null, position: { x: 0, y: 0, z: 0 } } : node);
const menuPrefab = { ...menuSource.prefab, nodes: menuNodes,
  components: menuSource.prefab.components.filter(item => menuNodes.some(node => node.id === item.node)) };
const menuLocal = new OriginalPrefabModel(menuPrefab);
const menuSurface = menuLocal.componentAt(menuRoot.id, "UISprite")!;
const menuButton = menuLocal.componentAt(menuRoot.id, "StarUIButton")!;
const menuIcon = menuLocal.componentAt(menuLocal.nodeAt("buttonMenu/MenuIcon").id, "UISprite")!;
const menuBounds = menuLocal.rect(menuSurface);
const menuIconBounds = menuLocal.rect(menuIcon);
const hiddenMenuNodes = Object.fromEntries(menuNodes
  .filter(node => /^(MenuIcon|NewIcon|Alert Icon)$/.test(node.name))
  .map(node => [node.id, { active: false }]));
/** The menu icon's pink (icon_menu), for the glyph on the gray button. */
const MENU_ICON_PINK = "rgb(255 59 114)";
/** The glyph's box: square, 60% of the button, centred where the menu icon is (the glyph art has its own margin). */
const glyphSize = menuBounds.width * 0.6;

function EditorPlayButton({ playing, glyph, onClick, scale }: {
  playing: boolean; glyph: string; onClick(): void; scale: number;
}) {
  const model = useMemo(() => new OriginalPrefabModel(menuPrefab, { nodes: hiddenMenuNodes,
    components: playing ? { [menuSurface.id]: { mSpriteName: "button_pink" } } : {} }), [playing]);
  const label = playing ? "停止播放" : "播放";
  return <div style={{ position: "relative", flex: "0 0 auto", width: menuBounds.width * scale, height: menuBounds.height * scale }}>
    <div style={{ position: "absolute", left: 0, top: 0, width: menuBounds.width, height: menuBounds.height,
      transform: `scale(${scale})`, transformOrigin: "0 0" }}>
      <div className="original-prefab-origin" style={{ left: -menuBounds.x, top: -menuBounds.y }}>
        <OriginalPrefabView model={model} bindings={{ buttons: { [menuButton.id]: { label, action: onClick, selected: playing } } }} />
        <span className="original-square-button-glyph" style={{
          left: menuIconBounds.x + menuIconBounds.width / 2 - glyphSize / 2,
          top: menuIconBounds.y + menuIconBounds.height / 2 - glyphSize / 2, width: glyphSize, height: glyphSize,
          zIndex: menuIcon.data.mDepth ?? 0, "--original-square-button-glyph": `url(${JSON.stringify(glyph)})`,
          backgroundColor: playing ? "rgb(255 255 255 / 1)" : MENU_ICON_PINK,
        } as CSSProperties} />
      </div>
    </div>
  </div>;
}

/** Right column of the editor: the play button and the playback speed, and `bottom` at its foot. */
export function EditorControlColumn({ width, isPlaying, onTogglePlayback, speed, speedGap, playRaise = 0, bottom }: {
  width: number;
  isPlaying: boolean; onTogglePlayback(): void;
  speed: { label: string; canSlower: boolean; canFaster: boolean; step(delta: number): void };
  /** Space between the play button and the speed stepper, in design px. */
  speedGap: number;
  /**
   * How far the play button sits above its centred place, in design px; the speed stepper stays put (the extra
   * gap above it is balanced by the same margin below it).
   */
  playRaise?: number;
  /** Controls at the column's foot (design px: the column scales them), stacked from the bottom up, `bottom.inset`
   * design px above its bottom edge. */
  bottom?: { node: ReactNode; inset: number };
}) {
  const { scale } = useUiViewport();
  const playIcon = useApplicationResourceUrl("ui.icon.editor-play");
  const pauseIcon = useApplicationResourceUrl("ui.icon.editor-pause");
  return <aside className="editor-control-column" style={{ width }} aria-label="编辑器右栏">
    <div className="editor-control-row editor-control-play" style={{ gap: (speedGap + playRaise) * scale }}>
      <EditorPlayButton playing={isPlaying} glyph={isPlaying ? pauseIcon : playIcon} onClick={onTogglePlayback} scale={scale} />
      <div style={{ marginBottom: playRaise * scale }}><EditorSpeedStepper scale={scale} {...speed} /></div>
    </div>
    {bottom && <div className="editor-control-bottom" style={{ bottom: bottom.inset * scale,
      width: width / scale, transform: `scale(${scale})` }}>{bottom.node}</div>}
  </aside>;
}
