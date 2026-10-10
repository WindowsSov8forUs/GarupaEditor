import { OfficialMusicFolders } from "./OfficialMusicFolders";
import { useOfficialMusicPreview } from "./useOfficialMusicPreview";
import { getOfficialMusicLibrary, type OfficialDifficulty } from "../services/officialMusicLibrary";
import { DEFAULT_OFFICIAL_FILTER, resetOfficialFilter, selectOfficialMusic } from "./officialMusicSelection";
import { OfficialMusicFilterDialog } from "./OfficialMusicFilterDialog";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type CSSProperties } from "react";
import { UiPageViewport } from "./UiViewport";
import { OriginalPrefabModel, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { OriginalSprite } from "./OriginalUi";
import { originalSurfaceRow } from "./useOriginalSurface";
import { originalSpriteDrawingRect } from "./originalSpriteGeometry";
import { OriginalDifficultySelect } from "./OriginalFormParts";
import { useUiViewport } from "./useUiViewport";
import { useMusicJacket } from "./useMusicJacket";
import { MusicSelectionCarousel } from "./musicSelectionCarousel";
import { musicSelectionLayout, musicCarouselRows, musicSelectionScale } from "./musicSelectionLayout";
import { loadMusicSelectionCharter, type MusicSelectionEntry } from "./musicSelectionData";
import profile from "../data/originalMusicSelectionProfile.json";
import detail from "../data/originalSongDetailProfile.json";
import "./MusicSelectionPage.css";
import { appLog } from "../logging/applicationLogger";
import { MusicSourceChoiceDialog, type MusicSource } from "./MusicSourceChoiceDialog";
import { AyachanMusicFilterDialog } from "./AyachanMusicFilterDialog";
import { AyachanMusicSearch, DEFAULT_AYACHAN_FILTER, normalizeAyachanFilter, type AyachanSearchState } from "./ayachanMusicSearch";
import { BestdoriMusicFilterDialog } from "./BestdoriMusicFilterDialog";
import { bestdoriSearchKey, BestdoriMusicSearch, DEFAULT_BESTDORI_FILTER, normalizeBestdoriMusicFilter, type BestdoriSearchState } from "./bestdoriMusicSearch";
import { OriginalChoiceDialog } from "./OriginalChoiceDialog";
import { OverlayDialogModal } from "./OverlayDialogModal";
import { userFacingErrorMessage } from "../services/downloadError";
import { originalLoading } from "./originalLoadingState";
import { useOriginalUiSound } from "./OriginalUiSound";

const prefabs = profile.prefabs as unknown as Record<keyof typeof profile.prefabs, OriginalPrefab>;
// The original right-pivot labels extend beyond ScoreBase. For the requested
// left-aligned ID, use its inner bounds and mirror the original numeric inset.
const idBaseNode = prefabs.info.nodes.find(node => node.id === 33)!;
const idBaseWidth = Number(prefabs.info.components.find(component => component.id === 272)!.data.mWidth);
const idInset = idBaseNode.position.x + idBaseWidth - prefabs.info.nodes.find(node => node.id === 13)!.position.x;
const idLabelX = idBaseNode.position.x + idInset;
const idLabelWidth = idBaseWidth - 2 * idInset;
const cellOmit = new Set([73, 74]);
const cellClickSE = Number(prefabs.cell.components.find(component => component.id === 73)!.data.clickSEType);
const defaultFolderModel = new OriginalPrefabModel(prefabs.folderCell, {
  // ScrollCellContent.UpdateCell: ordinary category, selected, without children
  // to expand. Keep the original 196 x 72 button and its pressed overlay.
  nodes: { 5: { active: false }, 4: { active: false }, 2: { active: true } },
  components: { 44: { mText: profile.wording.word_musicLargeCategoryAll, mColor: { r: 1, g: 1, b: 1, a: 1 } },
    47: { mColor: profile.defaultCategoryColor }, 52: { mColor: profile.defaultCategoryColor } },
});
type SelectionDestination = "play" | "editor";
// Reuse the confirm button hierarchy, dimensions, sound and pressed/disabled overlay.
const importButtonModel = new OriginalPrefabModel(prefabs.info, {
  nodes: { 1: { x: 0, y: 0 }, 73: { x: -483 } },
  components: {
    328: { mSpriteName: "button_gray" }, 329: { mSpriteName: "button_gray" },
    352: { mText: "导入", mColor: { r: 80 / 255, g: 80 / 255, b: 80 / 255, a: 1 } },
  },
});
const charterScrollLabels = new Set([270]);
const officialServerLabels = { jp: "日服", cn: "大陆服", tw: "台服", en: "英服" } as const;
// StarUIAnchor places the parent at the camera top; the child retains y=-147.
// The parent's UIWidget anchor adds 88 units, yielding a top inset of 59.
const filterButtonModel = new OriginalPrefabModel(prefabs.filterButton, {
  nodes: { 81: { x: 0, y: 0 }, 68: { y: 88 } },
  components: { 359: { mText: "筛选" } },
});
const sourceButtonModel = new OriginalPrefabModel(prefabs.filterButton, {
  nodes: { 81: { x: 0, y: 0 }, 68: { x: -447, y: 88 } },
  components: { 359: { mText: "切换源" } },
});

const searchButtonModel = new OriginalPrefabModel(prefabs.filterButton, {
  nodes: { 81: { x: 0, y: 0 }, 68: { x: -311, y: 88 } },
  components: { 359: { mText: "搜索" } },
});

const difficultyModel = new OriginalPrefabModel(detail.prefabs.difficultyManager as unknown as OriginalPrefab);
const difficultyPositions = difficultyModel.components.get(15)!.data.buttonPositions.map((ref: { m_PathID: number }) => {
  const point = difficultyModel.transform(ref.m_PathID);
  return { x: point.x, y: -point.y };
});

const MusicCell = memo(function MusicCell({ entry, selected = false }: { entry: MusicSelectionEntry; selected?: boolean }) {
  const model = useMemo(() => {
    const prefab = selected ? prefabs.selected : prefabs.cell;
    const marks = selected ? [69, 62, 71, 64, 67] : [60, 66, 58, 65, 62];
    const components: Record<number, { mText: string; mEncoding: boolean }> = selected
      ? { 57: { mText: entry.title, mEncoding: false }, 60: { mText: entry.artists, mEncoding: false } }
      : { 71: { mText: entry.title, mEncoding: false } };
    const nodes = Object.fromEntries(marks.map(id => [prefab.components.find(c => c.id === id)!.node,
      { active: false }]));
    return new OriginalPrefabModel(prefab, { components, nodes });
  }, [entry, selected]);
  return <OriginalPrefabView model={model} bindings={{ omit: selected ? undefined : cellOmit }} />;
});

const MusicInformation = memo(function MusicInformation({ entry, jacket, onConfirm, onImport, busy, onDifficulty }: {
  jacket: ReturnType<typeof useMusicJacket>;
  entry: MusicSelectionEntry; onConfirm(): void; onImport(): void; busy: boolean; onDifficulty(value: OfficialDifficulty): void;
}) {
  const [charter, setCharter] = useState<{ id: number; text: string }>();
  useEffect(() => {
    if (entry.source === "ayachan" || entry.source === "official") return;
    let active = true;
    const loading = originalLoading.hold("network", {});
    void loadMusicSelectionCharter(entry.id).then(text => { if (active) setCharter({ id: entry.id, text }); }, failure => {
      appLog("warn", "music-selection.charter-load-failed", { id: entry.id, error: String(failure) });
    }).finally(loading.release);
    return () => { active = false; loading.release(); };
  }, [entry.id, entry.source]);
  const ayachan = entry.source === "ayachan";
  const official = entry.source === "official";
  const available = official ? entry.officialSong.available : undefined;
  const separatorModel = useMemo(() => new OriginalPrefabModel(difficultyModel.prefab, { nodes: { 4: { active: !official || !!available?.includes("SPECIAL") } } }), [official, available]);
  const charterText = official ? "" : ayachan ? entry.author : charter?.id === entry.id ? charter.text : "";
  const idComponents = {
    308: { mText: "ID", mEncoding: false, mAlignment: 1, mPivot: 3, mWidth: idLabelWidth },
    263: { mText: String(entry.id), mEncoding: false, mAlignment: 1, mPivot: 3, mWidth: idLabelWidth },
  };
  const model = useMemo(() => new OriginalPrefabModel(prefabs.info, official ? {
    nodes: { 1: { x: 0, y: 0 },
      4: { active: true }, 13: { x: idLabelX }, 26: { x: idLabelX }, 36: { active: false },
      // Preserve the row's -151..161 bounds: 120 caption + 12 gap + 180 capsule.
      25: { x: 71 }, 100: { x: 71 },
      98: { active: entry.officialSong.master.musicDataType === "full" } },
    components: { ...idComponents, 264: { mText: "官方谱面来源", mEncoding: false, mWidth: 120, mAlignment: 2 },
      270: { mText: officialServerLabels[entry.officialSong.server], mEncoding: false, mWidth: 160, mAlignment: 2 },
      373: { mWidth: 180 }, 352: { mText: "游玩" }, 257: { mText: entry.level },
      258: { mText: detail.wording.word_musicLevel }, 277: { mText: "" },
      293: { mSpriteName: `bg_jacket_frame_rank_1_${entry.difficulty.toLowerCase()}` } },
  } : {
    // CenterRight anchors to the actual right edge, not the serialized editor preview width.
    // Keep the original row envelope; give the short caption 48 units and a 12-unit gap.
    // The name capsule takes the remaining width, with 10-unit horizontal insets.
    // Keep ScoreBase and vertical text placement; fit left-aligned labels inside it.
    // A chart ID has no score rank; retain only the caption and numeric display.
    nodes: { 1: { x: 0, y: 0 }, 4: { active: true }, 13: { x: idLabelX }, 26: { x: idLabelX },
      36: { active: false }, 15: { active: !ayachan && !official }, 25: { x: ayachan ? 5 : 35 }, 100: { x: ayachan ? 5 : 35 } },
    components: { ...idComponents,
      264: { mText: "谱师", mEncoding: false, mWidth: 48, mAlignment: 2 },
      270: { mText: charterText, mEncoding: false, mWidth: ayachan ? 292 : 232, mAlignment: 2 },
      373: { mWidth: ayachan ? 312 : 252 }, 352: { mText: "游玩" },
      257: { mText: entry.level }, 258: { mText: detail.wording.word_musicLevel }, 277: { mText: "" },
      293: { mSpriteName: `bg_jacket_frame_rank_1_${(entry.difficulty ?? "NORMAL").toLowerCase()}` } },
  }), [entry, charterText]);
  const mount = model.transform(model.nodeAt("DifficultyButtonRoot").id);
  return <div className="music-selection-info" data-original-owner="MusicInfoController" data-selected-id={entry.id}>
    <OriginalPrefabView model={model} bindings={{ horizontalScrollLabels: charterScrollLabels, buttons: { 331: { action: onConfirm, disabled: busy } }, textures: {
      279: jacket?.url ? <img src={jacket.url} alt={jacket.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : undefined,
    } }} />
    <OriginalPrefabView model={importButtonModel} root={73} bindings={{ buttons: { 331: { action: onImport, disabled: busy } } }} />
    <div style={{ position: "absolute", left: mount.x, top: -mount.y }}>
      <OriginalDifficultySelect value={entry.difficulty} readOnly={!official || busy} available={available} onChange={onDifficulty}
        layout={{ width: 0, height: 0, positions: difficultyPositions }}>
        <OriginalPrefabView model={separatorModel} />
      </OriginalDifficultySelect>
    </div>
  </div>;
});

function MusicCarousel({ entries, jacket, onConfirm, busy, onNextPage, onDifficulty, initialId, onSelected }: {
  jacket: ReturnType<typeof useMusicJacket>;
  entries: readonly MusicSelectionEntry[]; onConfirm(entry: MusicSelectionEntry, destination: SelectionDestination): void; busy: boolean; onNextPage(): void; onDifficulty(value: OfficialDifficulty): void; initialId?: number; onSelected(entry: MusicSelectionEntry): void;
}) {
  const sound = useOriginalUiSound();
  const nextPage = useRef(onNextPage); nextPage.current = onNextPage;
  const host = useRef<HTMLDivElement>(null);
  const viewport = useUiViewport();
  const selectorScale = musicSelectionScale(viewport.width, viewport.height, viewport.scale);
  const inputScale = viewport.scale * selectorScale;
  const [bounds, setBounds] = useState({ height: 0, center: 0 });
  const layout = useMemo(() => musicSelectionLayout(viewport.logicalWidth / selectorScale, viewport.logicalHeight / selectorScale, selectorScale),
    [viewport.logicalWidth, viewport.logicalHeight, selectorScale]);
  const motion = useMemo(() => new MusicSelectionCarousel(entries.length, 60, (candidate, confirmed) => {
    if (candidate !== confirmed) sound?.play(30);
  }, () => nextPage.current(), Math.max(0, entries.findIndex(entry => entry.id === initialId))), [sound]);
  useLayoutEffect(() => { motion.appendCount(entries.length); }, [motion, entries.length]);
  const [state, setState] = useState({ position: motion.position, candidate: motion.candidate, confirmed: motion.confirmed });
  const selectedCallback = useRef(onSelected); selectedCallback.current = onSelected;
  useEffect(() => { const entry = entries[state.confirmed]; if (entry) selectedCallback.current(entry); }, [entries, state.confirmed]);
  const frame = useRef(0), previousTime = useRef<number | null>(null);
  const wheelEnd = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointer = useRef<{ id: number; last: number; start: number; startX: number; time: number; speed: number; moved: boolean; index?: number; clickSE: number } | null>(null);
  const scrollbar = useRef<{ id: number; grab: number } | null>(null);
  const commit = () => setState(old => old.position === motion.position && old.candidate === motion.candidate && old.confirmed === motion.confirmed
    ? old : { position: motion.position, candidate: motion.candidate, confirmed: motion.confirmed });
  const wake = () => {
    if (frame.current) return;
    previousTime.current = null;
    const update = (now: number) => {
      const delta = previousTime.current === null ? 0 : (now - previousTime.current) / 1000;
      previousTime.current = now;
      motion.update(delta); commit();
      frame.current = motion.moving ? requestAnimationFrame(update) : 0;
    };
    frame.current = requestAnimationFrame(update);
  };
  useEffect(() => () => { cancelAnimationFrame(frame.current); clearTimeout(wheelEnd.current); }, []);
  useLayoutEffect(() => {
    const element = host.current!;
    const measure = () => {
      const box = element.getBoundingClientRect();
      setBounds({ height: element.clientHeight, center: (viewport.height / 2 - box.top) / inputScale });
    };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, [viewport, inputScale]);
  const choose = (index: number) => {
    if (pointer.current || scrollbar.current) return;
    clearTimeout(wheelEnd.current); motion.choose(index); commit(); wake();
  };
  const rows = musicCarouselRows(state.position, layout, entries.length);
  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    const drag = pointer.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.start) <= 4 * inputScale) return;
    drag.moved = true;
    const delta = (drag.last - event.clientY) / inputScale;
    if (delta !== 0) {
      if (event.timeStamp > drag.time) drag.speed = delta * 1000 / (event.timeStamp - drag.time);
      drag.last = event.clientY; drag.time = event.timeStamp;
      motion.queueDrag(delta); wake();
    }
  };
  const finishPointer = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = pointer.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (!cancelled) movePointer(event);
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled) motion.queueRelease();
    else if (!drag.moved && drag.index !== undefined) { sound?.play(drag.clickSE); motion.choose(drag.index); }
    else motion.queueRelease(event.timeStamp - drag.time > 100 ? 0 : drag.speed);
    commit(); wake();
  };
  const barHeight = layout.scrollbar.height;
  const barSize = Math.min(1, layout.top.height / layout.topContentHeight(entries.length));
  const thumbHeight = originalSpriteDrawingRect({ x: 0, y: 0, width: 16, height: barHeight,
    flipX: false, flipY: false }, originalSurfaceRow("menu", "scrollbar_top_touchable"),
    1, 1, 1, false, false, { x: 0, y: 0, z: 1, w: barSize }).height;
  const travel = Math.max(0, barHeight - thumbHeight);
  const thumbTop = motion.maximum ? state.position / motion.maximum * travel : 0;
  return <>
    <div className="music-selection-selector" style={{ width: viewport.logicalWidth / selectorScale,
      height: viewport.logicalHeight / selectorScale, transform: `scale(${selectorScale})`,
      "--ui-page-window-center-x": `${viewport.logicalWidth / selectorScale / 2}px`,
    } as CSSProperties}>
    {entries[0]?.source !== "official" && <div className="music-selection-folder" aria-label="谱面分类"
      style={{ left: `calc(var(--ui-page-window-center-x) + ${layout.folder.x}px)`, top: bounds.center + layout.folder.y, zIndex: layout.folder.depth }}>
      <OriginalPrefabView model={defaultFolderModel} bindings={{ buttons: {
        42: { action: () => choose(state.confirmed), label: profile.wording.word_musicLargeCategoryAll, role: "tab", selected: true },
      } }} />
    </div>}
    <div className="music-selection-background" style={{ left: "var(--ui-page-window-center-x)", top: bounds.center, zIndex: layout.backgroundDepth }}>
      <OriginalPrefabView model={layout.model} root={58} />
    </div>
    <div ref={host} className="music-selection-carousel" data-original-owner="CarouselScrollMusicSelectController"
      style={{ left: `calc(var(--ui-page-window-center-x) + ${layout.left}px)`, width: layout.width }}
      role="listbox" aria-label="谱面列表" tabIndex={0} aria-activedescendant={`music-selected-${entries[state.candidate]?.id}`}
      onPointerDown={event => {
        if (event.button !== 0 || pointer.current || scrollbar.current) return;
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); clearTimeout(wheelEnd.current);
        event.currentTarget.setPointerCapture(event.pointerId);
        const row = (event.target as HTMLElement).closest<HTMLElement>("[data-music-index]");
        pointer.current = { id: event.pointerId, last: event.clientY, start: event.clientY, startX: event.clientX, time: event.timeStamp, speed: 0, moved: false,
          index: row ? Number(row.dataset.musicIndex) : undefined, clickSE: Number(row?.dataset.clickSe ?? 0) };
        motion.beginDrag(); wake();
      }}
      onPointerMove={movePointer} onPointerUp={event => finishPointer(event)} onPointerCancel={event => finishPointer(event, true)}
      onLostPointerCapture={event => finishPointer(event, true)}
      onWheel={event => {
        if (pointer.current || scrollbar.current) return;
        clearTimeout(wheelEnd.current);
        motion.beginDrag(); motion.queueDrag(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height * inputScale : 1) / inputScale);
        wake(); wheelEnd.current = setTimeout(() => { motion.queueRelease(); wake(); }, 120);
      }}
      onKeyDown={event => {
        if (pointer.current || scrollbar.current) return;
        const target = event.key === "ArrowDown" ? state.candidate + 1 : event.key === "ArrowUp" ? state.candidate - 1
          : event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : null;
        if (target !== null) { event.preventDefault(); choose(target); }
      }}>
      {(["top", "bottom"] as const).map(side => <div key={side} className="music-selection-range"
        data-original-list={side} style={{ top: bounds.center + layout[side].y, width: layout[side].width, height: layout[side].height, zIndex: layout[side].depth }}>
        {rows.filter(row => row.side === side).map(row => <div key={row.index} className="music-selection-cell"
          data-music-index={row.index} data-click-se={cellClickSE} role="option" aria-selected={row.index === state.candidate} aria-label={entries[row.index]!.title}
          style={{ top: row.top }}><MusicCell entry={entries[row.index]!} /></div>)}
      </div>)}
      {entries[state.candidate] && <div className="music-selection-current" data-music-index={state.candidate}
        id={`music-selected-${entries[state.candidate]!.id}`} role="option" aria-selected="true" style={{ top: bounds.center - layout.selection.y, left: layout.selection.x - layout.left, zIndex: layout.selectionDepth }}>
        <MusicCell entry={entries[state.candidate]!} selected />
      </div>}
    </div>
    <div className="music-selection-scrollbar" style={{ left: `calc(var(--ui-page-window-center-x) + ${layout.scrollbar.x - 8}px)`,
      top: bounds.center + layout.scrollbar.y, height: barHeight, zIndex: layout.backgroundDepth }} role="scrollbar" aria-label="谱面列表滚动条" aria-orientation="vertical"
      aria-valuemin={0} aria-valuemax={entries.length - 1} aria-valuenow={state.candidate} tabIndex={0}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); choose(state.candidate + (event.key === "ArrowDown" ? 1 : -1)); } }}
      onPointerDown={event => {
        if (event.button !== 0 || pointer.current || scrollbar.current) return;
        clearTimeout(wheelEnd.current);
        const y = (event.clientY - event.currentTarget.getBoundingClientRect().top) / inputScale;
        const grab = y >= thumbTop && y <= thumbTop + thumbHeight ? y - thumbTop : thumbHeight / 2;
        event.currentTarget.setPointerCapture(event.pointerId); scrollbar.current = { id: event.pointerId, grab };
        motion.beginDrag(); motion.queueSeek(travel ? (y - grab) / travel : 0); wake();
      }}
      onPointerMove={event => {
        if (scrollbar.current?.id !== event.pointerId) return;
        const y = (event.clientY - event.currentTarget.getBoundingClientRect().top) / inputScale;
        motion.queueSeek(travel ? (y - scrollbar.current.grab) / travel : 0); wake();
      }}
      onLostPointerCapture={() => { if (scrollbar.current) { scrollbar.current = null; motion.queueRelease(); wake(); } }}
      onPointerUp={event => {
        if (scrollbar.current?.id !== event.pointerId) return;
        const y = (event.clientY - event.currentTarget.getBoundingClientRect().top) / inputScale;
        motion.queueSeek(travel ? (y - scrollbar.current.grab) / travel : 0);
        scrollbar.current = null; motion.queueRelease(); wake(); event.currentTarget.releasePointerCapture(event.pointerId);
      }}>
      <OriginalSprite atlas="menu" sprite="scrollbar_base" scale={1} style={{ position: "absolute", left: 8, top: 0, width: 8, height: "100%" }} />
      <OriginalSprite atlas="menu" sprite="scrollbar_top_touchable" scale={1} style={{ position: "absolute", left: 4, top: thumbTop, width: 16, height: thumbHeight }} />
    </div>
    <div className="music-selection-upper-mask" style={{ left: "var(--ui-page-window-center-x)", top: bounds.center, zIndex: layout.upperMaskDepth }}>
      <OriginalPrefabView model={layout.model} root={21} />
    </div>
    </div>
    {entries[state.confirmed] && <MusicInformation entry={entries[state.confirmed]!} jacket={jacket} busy={busy || motion.moving} onDifficulty={onDifficulty}
      onConfirm={() => { if (!busy && !motion.moving) onConfirm(entries[motion.confirmed]!, "play"); }}
      onImport={() => { if (!busy && !motion.moving) onConfirm(entries[motion.confirmed]!, "editor"); }} />}
  </>;
}

/** CarouselScrollMusicSelectController.updateMusicListDisplayState:
 * hide the music scroll view and activate its authored EmptyLabel. */
function EmptyMusicSelection({ onNextPage, busy, official }: { onNextPage(): void; busy: boolean; official: boolean }) {
  const viewport = useUiViewport();
  const scale = musicSelectionScale(viewport.width, viewport.height, viewport.scale);
  const width = viewport.logicalWidth / scale, height = viewport.logicalHeight / scale;
  const layout = musicSelectionLayout(width, height, scale);
  const model = new OriginalPrefabModel(layout.model.prefab, {
    nodes: { ...layout.model.overrides.nodes, 2: { active: true } },
    components: { 159: { mText: profile.wording.carouselMusicSelect_musicList_emptyLabel } },
  });
  const pointer = useRef<number | null>(null);
  return <div className="music-selection-selector" data-original-empty="EmptyLabel" style={{
    width, height, transform: `scale(${scale})`, "--ui-page-window-center-x": `${width / 2}px`,
  } as CSSProperties}>
    {!official && <div className="music-selection-folder" style={{
      left: width / 2 + layout.folder.x, top: height / 2 + layout.folder.y, zIndex: layout.folder.depth,
    }}><OriginalPrefabView model={defaultFolderModel} bindings={{ buttons: {
      42: { label: profile.wording.word_musicLargeCategoryAll, selected: true, disabled: true },
    } }} /></div>}
    <div className="music-selection-background" style={{ left: width / 2, top: height / 2 }}>
      <OriginalPrefabView model={model} root={58} />
    </div>
    <div role="status" aria-label="没有符合筛选条件的乐曲" style={{ position: "absolute", left: width / 2, top: height / 2 }}>
      <OriginalPrefabView model={model} root={2} />
    </div>
    {/* A filtered remote page can be empty while the server has more pages.
        Retain the same downward end-attempt gesture, without an invented button. */}
    <div className="music-selection-carousel" tabIndex={0} aria-label="谱面列表"
      style={{ left: width / 2 + layout.left, width: layout.width }}
      onWheel={event => { if (!busy && event.deltaY > 0) onNextPage(); }}
      onKeyDown={event => { if (!busy && ["ArrowDown", "PageDown", "End"].includes(event.key)) { event.preventDefault(); onNextPage(); } }}
      onPointerDown={event => { pointer.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerUp={event => { if (!busy && pointer.current !== null && event.clientY < pointer.current - 8) onNextPage(); pointer.current = null; }}
      onPointerCancel={() => { pointer.current = null; }} />
  </div>;
}

export function MusicSelectionPage({ source, onSourceChange: setSource, onLoad, onReady, previewVolume, onResourceWarning }: {
  source: MusicSource; onSourceChange(source: MusicSource): void;
  onResourceWarning(message: string): void;
  previewVolume: number;
  onLoad(source: "bestdori" | "test" | "official", id: string, progress: (ratio: number) => void, destination: SelectionDestination, difficulty?: OfficialDifficulty): Promise<boolean>;
  onReady(destination: SelectionDestination): void;
}) {
  // The list may reset for a filter/difficulty change; its jacket lease must not.
  const [jacketEntry, setJacketEntry] = useState<MusicSelectionEntry>();
  const jacket = useMusicJacket(jacketEntry);
  const selectionMemory = useRef<Partial<Record<MusicSource | "official-other", { id: number; order: number[] }>>>({});
  const officialLibrary = getOfficialMusicLibrary();
  const [officialFilter, setOfficialFilter] = useState(() => resetOfficialFilter(DEFAULT_OFFICIAL_FILTER, officialLibrary));
  const warning = useRef(onResourceWarning); warning.current = onResourceWarning;
  useEffect(() => {
    if (source !== "official") return;
    const catalogFailures = officialLibrary.metadata?.sourceMedia?.failures?.length ?? 0;
    if (officialLibrary.error || officialLibrary.mediaFailures.length || catalogFailures)
      warning.current(`官方曲库资源准备失败：${officialLibrary.error ? (officialLibrary.metadata ? "启动更新失败，使用已保存的数据。" : "启动更新失败，尚无可用缓存。") : ""}${catalogFailures ? `${catalogFailures} 份资源清单未更新，已保留其他成功结果及已有记录。` : ""}${officialLibrary.mediaFailures.length ? `${officialLibrary.mediaFailures.length} 项封面／试听资源未准备完成（${officialLibrary.mediaFailures.join("、")}）。` : ""}下次启动会重新检查资源站并尝试补齐。`);
  }, [source, officialLibrary]);
  const officialEntries = useMemo(() => selectOfficialMusic(officialLibrary, officialFilter), [officialLibrary, officialFilter]);
  const [previewSlot, setPreviewSlot] = useState<string | null>(null);
  const [sourceChoiceOpen, setSourceChoiceOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [retainedFilter, setFilter] = useState({ ...DEFAULT_BESTDORI_FILTER });
  const filter = useMemo(() => normalizeBestdoriMusicFilter(retainedFilter), [retainedFilter]);
  useLayoutEffect(() => { if (filter !== retainedFilter) setFilter(filter); }, [filter, retainedFilter]);
  const [searchRevision, setSearchRevision] = useState(0);
  const [bestdoriSearch, setSearch] = useState<BestdoriSearchState>({ entries: [], offset: 0, hasMore: true, loading: false, error: "" });
  const bestdoriSession = useMemo(() => new BestdoriMusicSearch(setSearch), []);
  const [ayachanFilterState, setAyachanFilter] = useState({ ...DEFAULT_AYACHAN_FILTER });
  const ayachanFilter = useMemo(() => normalizeAyachanFilter(ayachanFilterState), [ayachanFilterState]);
  useLayoutEffect(() => { if (ayachanFilter !== ayachanFilterState) setAyachanFilter(ayachanFilter); }, [ayachanFilter, ayachanFilterState]);
  const [ayachanRevision, setAyachanRevision] = useState(0);
  const [ayachanSearch, setAyachanSearch] = useState<AyachanSearchState>({ entries: [], page: 0, hasMore: true, loading: false, error: "" });
  const ayachanSession = useMemo(() => new AyachanMusicSearch(setAyachanSearch), []);
  const search = source === "official" ? { entries: officialEntries, loading: false, error: officialLibrary.songs.length ? "" : officialLibrary.error } : source === "bestdori" ? bestdoriSearch : ayachanSearch;
  const entries = search.entries;
  const memoryKey = source === "official" && officialFilter.category !== 0 ? "official-other" : source;
  const remembered = selectionMemory.current[memoryKey];
  const oldIndex = remembered?.order.indexOf(remembered.id) ?? -1;
  const preferred = remembered ? [...remembered.order.slice(Math.max(0, oldIndex)), ...remembered.order.slice(0, Math.max(0, oldIndex))] : [];
  const initialId = preferred.find(id => entries.some(entry => entry.id === id));
  const nextPage = () => { if (source === "official") return; void (source === "bestdori" ? bestdoriSession : ayachanSession).next(); };
  const queryKey = bestdoriSearchKey(filter);
  const currentFilter = useRef(filter); currentFilter.current = filter;
  const currentAyachanFilter = useRef(ayachanFilter); currentAyachanFilter.current = ayachanFilter;
  useLayoutEffect(() => {
    if (source !== "bestdori") return;
    bestdoriSession.reset(currentFilter.current); void bestdoriSession.next();
    return () => bestdoriSession.dispose();
  }, [source, queryKey, searchRevision, bestdoriSession]);
  useLayoutEffect(() => {
    if (source !== "ayachan") return;
    ayachanSession.reset(currentAyachanFilter.current); void ayachanSession.next();
    return () => ayachanSession.dispose();
  }, [source, ayachanFilter.id, ayachanRevision, ayachanSession]);
  useLayoutEffect(() => { if (source === "bestdori") bestdoriSession.updateFilter(filter); }, [source, filter, bestdoriSession]);
  useLayoutEffect(() => { if (source === "ayachan") ayachanSession.updateFilter(ayachanFilter); }, [source, ayachanFilter, ayachanSession]);
  useEffect(() => { if (search.loading) return originalLoading.hold("network", {}).release; }, [search.loading]);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  useEffect(() => { setSearchError(search.loading ? "" : search.error); }, [source, search.loading, search.error]);
  const [busy, setBusy] = useState(false);
  useOfficialMusicPreview(source === "official" && entries.length ? previewSlot : null, previewVolume, busy,
    message => warning.current(message));
  const running = useRef(false), active = useRef(true);
  const releaseLoad = useRef<(() => void) | null>(null);
  useEffect(() => { active.current = true; return () => {
    active.current = false; releaseLoad.current?.(); releaseLoad.current = null;
  }; }, []);
  const confirm = async (entry: MusicSelectionEntry, destination: SelectionDestination) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    const loading = originalLoading.hold("network", {});
    releaseLoad.current = loading.release;
    try {
      const success = await onLoad(entry.source === "official" ? "official" : entry.source === "ayachan" ? "test" : "bestdori", String(entry.id), loading.progress, destination, entry.difficulty ?? undefined);
      if (active.current) {
        if (success) { loading.progress(1); onReady(destination); }
        // A false result has already been reported by the shared import action.
      }
    } catch (failure) {
      appLog("error", "music-selection.load-failed", { source: entry.source, id: entry.id, destination, error: failure });
      if (active.current) setError(userFacingErrorMessage(failure));
    }
    finally { loading.release(); releaseLoad.current = null; running.current = false; if (active.current) setBusy(false); }
  };
  return <><UiPageViewport fullWindow>
    <section aria-label="谱面搜索" data-original-screen="ScreenLayerMusicSelect" className="music-selection-page"
      onKeyDown={event => { if (event.key !== "Escape") event.stopPropagation(); }}>
      <div style={{ position: "absolute", right: 0, top: 0, zIndex: 30 }}>
        <OriginalPrefabView model={filterButtonModel} root={108} bindings={{ buttons: { 386: { action: () => { setSearchOpen(false); setFilterOpen(true); }, disabled: busy || (source === "official" && getOfficialMusicLibrary().songs.length === 0) } } }} />
        <OriginalPrefabView model={searchButtonModel} root={108}
          bindings={{ buttons: { 386: { action: () => { setFilterOpen(false); setSearchOpen(true); }, disabled: busy } } }} />
        <OriginalPrefabView model={sourceButtonModel} root={108}
          bindings={{ buttons: { 386: { action: () => { setSearchOpen(false); setFilterOpen(false); setSourceChoiceOpen(true); }, disabled: busy } } }} />
      </div>
      {source === "official" && <OfficialMusicFolders selected={officialFilter.category} onChange={category => setOfficialFilter(value => ({ ...value, category }))} busy={busy || filterOpen || searchOpen || sourceChoiceOpen} />}
      {entries.length > 0 && <MusicCarousel key={`${source}:${JSON.stringify(source === "official" ? officialFilter : source === "bestdori" ? filter : ayachanFilter)}`} entries={entries} jacket={jacket} initialId={initialId} onSelected={entry => { setJacketEntry(entry); setPreviewSlot(entry.source === "official" ? entry.officialSong.previewSlot : null); selectionMemory.current[memoryKey] = { id: entry.id, order: entries.map(item => item.id) }; }} onDifficulty={difficulty => setOfficialFilter(value => ({ ...value, difficulty }))} busy={busy || filterOpen || searchOpen || sourceChoiceOpen} onNextPage={nextPage} onConfirm={(entry, destination) => void confirm(entry, destination)} />}
      {!search.loading && !search.error && entries.length === 0 &&
        <EmptyMusicSelection official={source === "official"} onNextPage={nextPage} busy={busy || filterOpen || searchOpen || sourceChoiceOpen} />}
    </section>
  </UiPageViewport>
    <OverlayDialogModal dialog={error || (source === "official" && searchError) ? { tone: "error", message: error || searchError } : null}
      onConfirm={() => { setError(""); setSearchError(""); }} onCancel={() => { setError(""); setSearchError(""); }} />
    <OriginalChoiceDialog open={source !== "official" && !!searchError} title="谱面列表加载失败" message={searchError}
      onClose={() => setSearchError("")} choices={[
        { label: "关闭", action: () => setSearchError("") },
        { label: "重试", tone: "pink", action: () => { setSearchError(""); nextPage(); } },
      ]} />
    {(["search", "filter"] as const).map(mode => source === "official" ? <OfficialMusicFilterDialog key={mode} mode={mode} open={mode === "search" ? searchOpen : filterOpen} value={officialFilter} library={officialLibrary} onChange={setOfficialFilter} onClose={() => mode === "search" ? setSearchOpen(false) : setFilterOpen(false)} /> : source === "bestdori" ? <BestdoriMusicFilterDialog key={mode} mode={mode} open={mode === "search" ? searchOpen : filterOpen} value={filter} onChange={setFilter}
      onSearch={(next, field) => {
        setFilter(next);
        if (field !== "artist") setSearchRevision(revision => revision + 1);
      }} onClose={() => mode === "search" ? setSearchOpen(false) : setFilterOpen(false)} /> :
      <AyachanMusicFilterDialog key={mode} mode={mode} open={mode === "search" ? searchOpen : filterOpen} value={ayachanFilter} onChange={setAyachanFilter}
        onSearch={next => { setAyachanFilter(next); setAyachanRevision(revision => revision + 1); }}
        onClose={() => mode === "search" ? setSearchOpen(false) : setFilterOpen(false)} />)}
    <MusicSourceChoiceDialog open={sourceChoiceOpen} source={source}
      onSelect={next => { if (next !== source) { setSource(next); setFilterOpen(false); setSearchOpen(false); setError(""); } }}
      onClose={() => setSourceChoiceOpen(false)} />
  </>;
}
