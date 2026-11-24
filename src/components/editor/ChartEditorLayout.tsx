import { hiddenMarkPaint } from "../../app/spriteOpaqueBox";
import { editorHiddenMarkGeometry } from "../../app/editorNoteMetrics";
import type { SlideFitSettings } from "../../app/slideFitShapes";
import profile from "../../data/originalSongDetailProfile.json";
import { OriginalPrefabModel, type OriginalPrefab } from "../originalPrefabModel";
import { flushSync } from "react-dom";
import { EditorMinimap } from "./EditorMinimap";
import { EDITOR_EDGE_SOFTNESS } from "../../app/editorEdgeMask";
import { hitTestEventBubble, type EventBubbleHit, type TimelineEventTarget } from "../../app/hooks/useCanvasPlayfieldBackend";
import type { EventBubbleHandlers } from "../../app/hooks/usePlayfieldRenderers";
import { EditorBpmDialog } from "./EditorBpmDialog";
import { EditorSvDialog } from "./EditorSvDialog";
import { DEFAULT_METADATA, GLOBAL_TIMING_GROUP_ID, noteLaneSpanStart, toolPreviewNoteType } from "../../chartCore";
import { EditorBeatDivisionButton } from "./EditorBeatDivision";
import { EditorOptionsButton } from "./EditorOptionsButton";
import { EditorOptionsDrawer } from "./EditorOptionsDrawer";
import { EditorControlColumn, EditorHistoryTools, EditorMirrorTools, EditorPlaybackClock, EditorSquareTool } from "./EditorControlColumn";
import { EditorNotePropertiesDialog } from "./EditorNotePropertiesDialog";
import { editorLeftGridSpan, SidebarActionButton } from "./SidebarPanel";
import { useApplicationResourceUrl } from "../../resources/applicationResourceContext";
import { ORIGINAL_HEADER_MENU_BOUNDS, ORIGINAL_HEADER_TITLE_BOTTOM } from "../OriginalPageHeader";
import { editorDirectionalBackLineWidth, editorDirectionalHeadGeometry, editorFlickArrowGeometry, editorNoteHeight, editorDirectionalSegmentWidth, editorHiddenButtonHeight, editorNoteTokenWidth, SELECTION_FRAME_MARGIN, SELECTION_RESIZE_GRIP_MAX_HEIGHT, SELECTION_RESIZE_GRIP_SCALE, SELECTION_RESIZE_GRIP_WIDTH, SELECTION_RESIZE_HIT_WIDTH } from "../../app/editorNoteMetrics";
import { EditorSelectionOverlay, type EditorSelectionOverlayHandle } from "./EditorSelectionOverlay";
import { OriginalMenuBackground } from "../OriginalMenuBackground";
import { useApplicationPresentation, useReturnToTitle } from "../../app/titleNavigation";
import { useStartupReadiness } from "../../app/startupReadiness";
import { EDITOR_STACK, HOME_STACK, leaveLivePreparation, openDetailPage, popPage, pushPage, returnToPage, topPage, type AppPage, type PageStack } from "./pageStack";
import { AppSettingsModal } from "../AppSettingsModal";
import { OriginalUiSoundProvider } from "../OriginalUiSound";
import { BestdoriLoginModal } from "../BestdoriLoginModal";
import { useLayoutEffect,  useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { ExportJsonModal } from "../ExportJsonModal";
import { ChartCodeEditModal } from "../ChartCodeEditModal";
import { SongInformationEditPage } from "../SongInformationEditPage";
import { OriginalChoiceDialog } from "../OriginalChoiceDialog";
import { SONG_INFORMATION_CONTENT_BOUNDS } from "../OriginalSongDetailParts";
import { LivePreparationPage, MvDownloadDialog } from "../LivePreparationPage";
import { ResourceLoadErrorDialog } from "../OriginalConfirmDialog";
import { LiveInProgressCover, type LiveInProgressSong } from "../LiveInProgressCover";
import { downloadActivity } from "../../services/downloadActivity";
import { SAMPLE_START_GAME_FADE_SECONDS, useMusicPreview } from "../useMusicPreview";
import type { MusicPreviewRequest } from "../musicSelectionData";
import songDetailSource from "../../data/originalSongDetailProfile.json";
import { songHasSpecialNotes } from "../songNoteStatistics";
import { SIMULATOR_PRE_ADAPTATION_DEFAULTS, type SimulatorModeSelection } from "../../app/simulator/preAdaptationContract";
import type { SimulatorWindowExit } from "../../app/simulator/transportContracts";
import { OriginalPageSwitch } from "../OriginalPageSwitch";
import { LiveSelectionPage } from "../LiveSelectionPage";
import { MusicSelectionPage } from "../MusicSelectionPage";
import { musicPlaySelection, type MusicPlaySelection } from "../musicSelectionData";
import { DownloadProgressModal } from "../DownloadProgressModal";
import { OverlayDialogModal } from "../OverlayDialogModal";
import { SkinSettingsModal } from "../SkinSettingsModal";
import { bestdoriCheckSession, bestdoriLogin, bestdoriLogout,
  onBestdoriSessionExpired } from "../../services/bestdori/api";
import { appLog } from "../../logging/applicationLogger";
import { isMobileRuntime } from "../../app/mobileRuntime";
import { SidebarPanel } from "./SidebarPanel";
import { projectPlayfieldLineRuntimeAssets } from "../../skinLoader";
import { useUiViewport } from "../useUiViewport";
import type { useEditorIoAndShortcuts } from "../../app/hooks/useEditorIoAndShortcuts";
import { useOriginalSkinPreviewResources } from "../useOriginalSkinPreviewResources";
import { FIELD_WIDTH_LANES, loadPreviewLaneImage, unprojectFieldRows } from "./previewLaneStrip";
import { resolveOriginalPreviewSkin } from "../../simulator/public/settings";

/** Standard lanes; lane counts above it add lanes evenly on both sides (an ExGarupa feature). */
const STANDARD_LANE_COUNT = 7;
/** 创建工程 starts from a new project's song: no name or artist (filled in before 确定), default settings, no media. */
const NEW_PROJECT_METADATA = Object.freeze({ ...DEFAULT_METADATA, title: "", artist: "" });
const NO_MEDIA = Object.freeze({ cover: null, mv: null, illustBackground: null, audio: null });

/**
 * Extended lane counts: white dashed lines at the track zone's edges, and faint ones between the outer lanes
 * (the extra lanes beyond one per side). Static like the track: the chart scrolls over them.
 */
function EditorLaneRangeGuides({ laneCount, left, width }: { laneCount: number; left: string; width: number }) {
  const lane = width / laneCount;
  const extra = (laneCount - STANDARD_LANE_COUNT) / 2;
  const inner: number[] = [];
  for (let index = 1; index < extra; index += 1) inner.push(index * lane, width - index * lane);
  return <div className="editor-lane-range-guides" style={{ left, width }}>
    <span className="editor-lane-range-edge" style={{ left: 0 }} />
    <span className="editor-lane-range-edge" style={{ left: width }} />
    {inner.map(x => <span key={x} className="editor-lane-range-inner" style={{ left: x }} />)}
  </div>;
}

type ChartEditorLayoutProps = {
  vm: Record<string, any> & Pick<ReturnType<typeof useEditorIoAndShortcuts>, "loadOfficialChart">;
};

const CANVAS_INTERACTION_OVERSCAN_PX = 240;
const CANVAS_INTERACTION_SNAP_PX = 96;

/** Page switch slot identity: each music selection source is its own page. */
function pageSwitchKey(page: AppPage, source: string): string {
  return page === "search" ? `search:${source}` : page;
}

function isHalfBeatAligned(value: number): boolean {
  if (!Number.isFinite(value)) {
    return true;
  }
  const snapped = Math.round(value * 2) / 2;
  return Math.abs(snapped - value) <= 1e-6;
}

/** Design-pixel Y of the song information page's lower box bottom edge (page centre = 0, down = positive): the Beat 0 limit. */
const JUDGE_LIMIT_DESIGN_Y = (() => {
  const model = new OriginalPrefabModel(profile.prefabs.profileInformation as unknown as OriginalPrefab);
  const box = model.rect(model.components.get(859)!);
  return box.y + box.height;
})();


/** A function identity that never changes while always running the latest closure, so memoized children are not re-rendered by it. */
function useStableEvent<A extends unknown[], R>(handler: (...args: A) => R): (...args: A) => R {
  const latest = useRef(handler);
  latest.current = handler;
  return useCallback((...args: A) => latest.current(...args), []);
}

/** Playfield scroll position as a tiny external store: scrolling re-renders only the overlays that read it, not the whole layout. */
const playfieldScroll = {
  value: 0,
  listeners: new Set<() => void>(),
  get: () => playfieldScroll.value,
  set(next: number) {
    if (next === playfieldScroll.value) return;
    playfieldScroll.value = next;
    playfieldScroll.listeners.forEach(listener => listener());
  },
  subscribe(listener: () => void) {
    playfieldScroll.listeners.add(listener);
    return () => { playfieldScroll.listeners.delete(listener); };
  },
};

/** Canvas interaction window (scroll range with overscan): external store, so snapping the window re-renders only its readers. */
const interactionWindow = {
  value: { top: 0, bottom: 0 },
  listeners: new Set<() => void>(),
  get: () => interactionWindow.value,
  set(next: { top: number; bottom: number }) {
    const previous = interactionWindow.value;
    if (Math.abs(previous.top - next.top) < 1e-6 && Math.abs(previous.bottom - next.bottom) < 1e-6) return;
    interactionWindow.value = next;
    interactionWindow.listeners.forEach(listener => listener());
  },
  subscribe(listener: () => void) {
    interactionWindow.listeners.add(listener);
    return () => { interactionWindow.listeners.delete(listener); };
  },
};

/** Hides a note's hitbox when it lies outside the canvas interaction window. */
function NoteWindowCull({ y, children }: { y: number; children: ReactNode }) {
  const window = useSyncExternalStore(interactionWindow.subscribe, interactionWindow.get);
  if (y < window.top - 48 || y > window.bottom + 48) return null;
  return <>{children}</>;
}

function SlideSegmentsLayer({ render }: { render: (window: { top: number; bottom: number }) => ReactNode }) {
  const window = useSyncExternalStore(interactionWindow.subscribe, interactionWindow.get);
  return <>{render(window)}</>;
}

/** The note a press on a note's button means: of the overlapping buttons under it, the note whose centre is nearest. */
function pressedNoteOf(runtime: any, event: { clientX: number; clientY: number }, fallback: any) {
  const point = boardPointOf(runtime, event);
  return (point && runtime.findNoteNearestAtBoardPoint?.(point.x, point.y)) ?? fallback;
}

/** A note press's point on the playfield board. */
function boardPointOf(runtime: any, event: { clientX: number; clientY: number }): { x: number; y: number } | null {
  const board = runtime.playfieldBoardRef?.current as HTMLElement | null | undefined;
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/** How far the right column's foot controls sit above its bottom edge, in design px: none, which lines the beat
 * division up with the left column's 游玩. */
const RIGHT_COLUMN_FOOT_INSET = 0;
/** The right column's buttons are the width of the header menu button (80): their text keeps only this far in. */
const RIGHT_COLUMN_LABEL_INSET = 6;

export function ChartEditorLayout({ vm }: ChartEditorLayoutProps) {
  const returnToTitle = useReturnToTitle();
  const presentation = useApplicationPresentation();
  const uiViewport = useUiViewport();
  const sidebarPlay = useStableEvent(() => { setIsAppSettingsOpen(false); setPageStack(stack => openDetailPage(stack, "live")); });
  const sidebarPreview = useStableEvent(() => { void openStaticRenderWindow(); });
  const sidebarUndo = useStableEvent(() => vm.undoLastNote());
  const sidebarRedo = useStableEvent(() => vm.redoLastNote());
  const curveSave = useStableEvent((settings: SlideFitSettings) => vm.saveCurveToolSettings(settings));
  const curveCancel = useStableEvent(() => vm.cancelCurveTool());

  const sidebarCopy = useStableEvent(() => vm.copyCurrentSelectionByShortcut());
  const sidebarPaste = useStableEvent(() => vm.applyPasteToolFromPalette());
  // Beat 0 limit in window pixels: the page is centred in the window, so the edge sits JUDGE_LIMIT_DESIGN_Y * scale below the centre.
  const judgeBottomY = uiViewport.height / 2 + JUDGE_LIMIT_DESIGN_Y * uiViewport.scale;
  const judgeInsetBottom = uiViewport.height - judgeBottomY;
  // The editor region spans the whole window height: bleed it past the page body (header above, bottom bar below).
  const editorRegionRef = useRef<HTMLElement | null>(null);
  const selectionOverlayRef = useRef<EditorSelectionOverlayHandle>(null);
  const [editorRegionBleed, setEditorRegionBleed] = useState({ top: 0, bottom: 0, height: 0 });
  useLayoutEffect(() => {
    const parent = editorRegionRef.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const rect = parent.getBoundingClientRect();
      const next = { top: rect.top, bottom: window.innerHeight - rect.bottom, height: rect.height };
      setEditorRegionBleed(prev => (prev.top === next.top && prev.bottom === next.bottom && prev.height === next.height ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const {
    jsonImportRef,
    bestdoriV2ImportRef,
    handleJsonImport,
    handleBestdoriV2Import,
    triggerBestdoriV2Import,
    openImportJsonModal,
    downloadJson,
    openStaticRenderWindow,
    openSimulatorWindow,
    garupaChartJsonText,
    isImportJsonModalOpen,
    importJsonText,
    uploadCommunityPostContent,
    uploadCommunityPostTags,
    uploadChartAuthor,
    setUploadChartAuthor,
    setImportJsonText,
    setUploadCommunityPostContent,
    setUploadCommunityPostTags,
    applyImportJsonText,
    applyUploadCommunityChart,
    applyUploadNotGarupaServerChart,
    applyUploadTestServerChart,
    closeImportJsonModal,
    isExportJsonModalOpen,
    closeExportJsonModal,
    saveExportJsonToSelectedPath,
    exportBestdoriV2ToFile,
    overlayDialog,
    confirmOverlayDialog,
    cancelOverlayDialog,
    openAppSettings,
    openSkinSettings,
    metadata,
    chartMediaSources,
    audioDurationSec,
    visibleNoteCount,
    isSkinReady,
    isToolArmed,
    tool,
    applyToolFromPalette,
    onTogglePlayTool,
    isPlayToolSelected,
    isPlaybackPlaying,
    isNoteOutsideActiveTimingGroup,
    getPaletteSpriteLayers,
    getPaletteSpriteAspectRatio,
    renderPaletteSpriteStack,
    getSpriteLayers,
    getSpriteAspectRatio,
    renderSpriteStack,
    clearSelection,
    showDialog,
    notes,
    noteById,
    isSvPreviewEnabled,
    playfieldRef,
    handlePlayfieldScroll,
    selectionDrag,
    isSlideBuilding,
    handleBoardMouseDown,
    handleBoardMouseMove,
    handleBoardMouseLeave,
    handleBoardContextMenu,
    boardHeight,
    scrollContentHeight,
    deleteTimelineEvent,
    describeBpmEvent,
    describeSvEvent,
    eventBubbleHitsRef,
    cursorPreview,
    cursorPreviewRef,
    resolveDirectionalWidenPreviewAt,
    resolveNoteReplacePreviewAt,
    beatToY,
    playfieldTrackCanvasRef,
    playfieldNoteCanvasRef,
    playfieldBoardRef,
    boardWidth,
    handleBoardClick,
    renderSlideSegments,
    NOTE_SPECS,
    resolvePlacedNoteLayers,
    isDirectionalNoteType,
    getNoteSpanLanes,
    LANE_WIDTH,
    getRenderedNotePlacement,
    getNoteDisplayY,
    laneToColumn,
    formatBeat,
    selectedNoteIdSet,
    slideBuildSelectedIdSet,
    selectionFrame,
    canResizeSelection,
    selectionWidthDrag,
    previewSelectionWidth,
    endSelectionWidth,
    cancelSelectionWidth,
    renderNotes,
    slideBuildRef,
    pressSlideTool,
    slidePressRef,
    findNoteAtGridPoint,
    findNoteNearestAtBoardPoint,
    beginSelectedNotesMove,
    suppressNextNoteClickRef,
    toggleSelectedNote,
    applyToolToPlacedNote,
    cancelSlideBuild,
    deleteRightClickedNotes,
    toolDirectionalWidth,
    toolRhythmWidth,
    normalizeDirectionalWidth,
    normalizeRhythmWidth,
    isRhythmWidthEditableType,
    isHabahiroEnabled,
    renderDirectionalSprite,
    isSkinApplying,
    isAppSettingsOpen,
    setIsAppSettingsOpen,
    appOptionSettings,
    isSkinSettingsOpen,
    setIsSkinSettingsOpen,
    windowPresetId,
    playbackWindowPresetId,
    playbackFps,
    playbackMvMode,
    playbackMvAlphaPercent,
    playbackAllPerfectStatusDisplayMode,
    WINDOW_SIZE_PRESETS,
    setWindowPresetId,
    setPlaybackWindowPresetId,
    setPlaybackFps,
    setPlaybackMvMode,
    setPlaybackMvAlphaPercent,
    setPlaybackAllPerfectStatusDisplayMode,
    pendingSkinSelection,
    setPendingSkinSelection,
    normalizeSkinSelection,
    bestdoriSkinCatalogOptions,
    bestdoriCatalogStatus,
    formatTypeLabel,
    applyWindowPresetById,
    applyAppOptionSettings,
    applyBestdoriSkinSelection,
    downloadProgress,
    playbackRuntimeLineRef,
    playbackGuideHostRef,
    playbackGuideLabelRef,
    noteVisualScale,
    copiedChartPayload,
  } = vm;
  const mobileRuntime = isMobileRuntime();
  const editIcon = useApplicationResourceUrl("ui.icon.edit");
  const copyIcon = useApplicationResourceUrl("ui.icon.copy-action");
  const pasteIcon = useApplicationResourceUrl("ui.icon.paste-action");
  // deleteSelectedNotes changes with the selection; a stable handler keeps the memoized row unchanged.
  const deleteSelectionRef = useRef(vm.deleteSelectedNotes);
  deleteSelectionRef.current = vm.deleteSelectedNotes;
  const deleteSelection = useCallback(() => deleteSelectionRef.current(), []);
  // The left column's rows on its five columns (see SidebarPanel's EDITOR_LEFT_GRID). Memoized: SidebarPanel is
  // memoized and must not re-render for an identical row.
  const historyTools = useMemo(() => <EditorHistoryTools canUndo={vm.canUndoLastOperation} canRedo={vm.canRedoLastOperation}
    onUndo={sidebarUndo} onRedo={sidebarRedo} canDelete={vm.canDeleteSelection} onDelete={deleteSelection}
    onCopy={sidebarCopy} onPaste={sidebarPaste} undoIcon={vm.undoActionIcon} deleteIcon={vm.clearActionIcon}
    copyIcon={copyIcon} pasteIcon={pasteIcon} />,
  [vm.canUndoLastOperation, vm.canRedoLastOperation, vm.undoActionIcon, sidebarUndo, sidebarRedo, sidebarCopy, sidebarPaste,
    vm.canDeleteSelection, deleteSelection, vm.clearActionIcon, copyIcon, pasteIcon]);
  // The note property editor (编辑), on the selected notes.
  const [notePropertiesOpen, setNotePropertiesOpen] = useState(false);
  const hasNoteSelection = vm.selectedNoteProperties !== null;
  useEffect(() => { if (!hasNoteSelection) setNotePropertiesOpen(false); }, [hasNoteSelection]);
  const mirrorTools = useMemo(() => <EditorMirrorTools enabled={vm.canMirror} onMirror={vm.mirrorSelectionAlong}
    mirrorIcon={vm.mirrorActionIcon}
    trailing={<>
      <EditorSquareTool label="编辑" glyph={editIcon} disabled={!hasNoteSelection} onClick={() => setNotePropertiesOpen(true)} />
      {/* Multi-select mode, two columns wide: pink while on. */}
      <SidebarActionButton label={vm.isMultiSelectMode ? "多选 开" : "多选 关"} ariaLabel={vm.isMultiSelectMode ? "多选 开" : "多选 关"}
        width={editorLeftGridSpan(2)} on={vm.isMultiSelectMode} onClick={() => vm.setIsMultiSelectMode(!vm.isMultiSelectMode)} />
    </>} />,
  [vm.canMirror, vm.mirrorSelectionAlong, vm.mirrorActionIcon, editIcon, hasNoteSelection, vm.isMultiSelectMode,
    vm.setIsMultiSelectMode]);
  const [isEditorOptionsOpen, setEditorOptionsOpen] = useState(false);
  // Each opening of 编辑信息 / 创建工程 starts a new draft.
  const [songEditSession, setSongEditSession] = useState(0);
  const [songEditCreating, setSongEditCreating] = useState(false);
  // The two confirmations: starting a new project from the home page, and dropping it on 创建工程.
  const [confirmingCreate, setConfirmingCreate] = useState(false);
  const [confirmingCancelCreate, setConfirmingCancelCreate] = useState(false);
  // 新建工程 (menu) over a project in progress: it is replaced once the new one is saved.
  const [confirmingReplaceProject, setConfirmingReplaceProject] = useState(false);
  // 发布到测试服 asks first: it publishes the chart as it is.
  const [confirmingTestServer, setConfirmingTestServer] = useState(false);
  // Which publishing page the export window opens on: 发布到 Bestdori (upload) or 发布到 NotGarupa (upload-server).
  const [publishTarget, setPublishTarget] = useState<"upload" | "upload-server">("upload");
  const openSongEdit = (creating: boolean, open: (stack: PageStack) => PageStack) => {
    setSongEditCreating(creating); setSongEditSession(session => session + 1); setPageStack(open);
  };
  // 创建工程 over the page it is opened on (cancelling it returns there); opened again on itself, a new draft.
  const openSongCreate = () => openSongEdit(true, stack =>
    topPage(stack) === "songEdit" && songEditCreating ? stack : [...stack, "songEdit"]);
  // The menu's 新建工程: warns when a project is in progress, otherwise opens 创建工程 at once.
  const startNewProject = () => { if (vm.hasProjectContent) setConfirmingReplaceProject(true); else openSongCreate(); };
  // 创建工程 leaves through its confirmation; 编辑信息 to the page it came from.
  const leaveSongEdit = () => { if (songEditCreating) setConfirmingCancelCreate(true); else setPageStack(popPage); };
  // Cancelling 创建工程 returns to the page it was opened on (编辑信息 included, as a new draft).
  const cancelSongCreate = () => {
    const below = pageStack[pageStack.length - 2];
    setPageStack(popPage);
    if (below === "songEdit") { setSongEditCreating(false); setSongEditSession(session => session + 1); }
  };
  const longBodyTexture = useMemo(() => vm.skinAssets ? projectPlayfieldLineRuntimeAssets(vm.skinAssets).longLine : undefined, [vm.skinAssets]);
  const curveSlideLineTexture = useMemo(() => vm.skinAssets ? projectPlayfieldLineRuntimeAssets(vm.skinAssets).curveSlideLine : undefined, [vm.skinAssets]);
  const [viewportTop, setViewportTop] = useState(0);
  // Workspace top: overlay controls sit in the workspace, not in the editor region (which now bleeds to the window top).
  const [workspaceTop, setWorkspaceTop] = useState(0);
  /** Gap between the header menu button's bottom and the workspace top, in design px. */
  const headerToWorkspaceGap = Math.max(0, (workspaceTop - uiViewport.safeInsets.top) / uiViewport.scale
    - ORIGINAL_HEADER_MENU_BOUNDS.top - ORIGINAL_HEADER_MENU_BOUNDS.height);
  const editorTrackRecipe = useMemo(() => resolveOriginalPreviewSkin(appOptionSettings.simulatorSettings.skin),
    [appOptionSettings.simulatorSettings.skin]);
  const editorTrackPreview = useOriginalSkinPreviewResources(editorTrackRecipe,
    message => vm.showDialog(`轨道贴图失败：${message}`, "error"));
  const [flatTrackLane, setFlatTrackLane] = useState<string | null>(null);
  useEffect(() => {
    const url = editorTrackPreview.lane;
    setFlatTrackLane(null);
    if (!url) return;
    let cancelled = false;
    loadPreviewLaneImage(url)
      .then(image => { if (!cancelled) setFlatTrackLane(unprojectFieldRows(image).toDataURL("image/png")); })
      .catch(cause => console.error("Flat track lane failed", cause));
    return () => { cancelled = true; };
  }, [editorTrackPreview.lane]);
  const sidebarCurve = useMemo(() => ({ settings: vm.curveToolSettings, onSave: curveSave, onCancel: curveCancel,
    trackLane: flatTrackLane, boardLaneWidth: LANE_WIDTH }), [vm.curveToolSettings, curveSave, curveCancel, flatTrackLane, LANE_WIDTH]);
  const [viewportRight, setViewportRight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [timelineLabelX, setTimelineLabelX] = useState(8);
  const rhythmSkinTypes = bestdoriSkinCatalogOptions?.rhythm ?? [];
  const directionalSkinTypes = bestdoriSkinCatalogOptions?.directional ?? [];
  const rhythmSeSkinTypes = bestdoriSkinCatalogOptions?.rhythmSe ?? [];
  const directionalSeSkinTypes = bestdoriSkinCatalogOptions?.directionalSe ?? [];
  const bgSkinTypes = bestdoriSkinCatalogOptions?.bg ?? [];
  const fieldSkinTypes = bestdoriSkinCatalogOptions?.field ?? [];
  const judgeSkinTypes = bestdoriSkinCatalogOptions?.judge ?? [];
  const catalogResource = (kind: keyof NonNullable<typeof bestdoriSkinCatalogOptions>["resources"], value: string) =>
    bestdoriSkinCatalogOptions?.resources[kind]?.[value] ?? null;
  const bestdoriAuthRevision = useRef(0);
  const bestdoriAuthBusy = useRef(false);
  const [isBestdoriLoginOpen, setIsBestdoriLoginOpen] = useState(false);
  const [pageStack, setPageStack] = useState<PageStack>(HOME_STACK);
  const page = topPage(pageStack);
  const livePreparationOpen = page === "live";
  // Song select stays below live preparation: its sample and play session continue there.
  const musicSelectionOpen = pageStack.includes("search");
  const [backgroundPage, setBackgroundPage] = useState<string | null>(null);
  const handleReturnToTitle = () => {
    if (isPlayToolSelected) onTogglePlayTool();
    setIsAppSettingsOpen(false);
    returnToTitle?.();
  };
  useEffect(() => {
    if (!presentation || presentation.visible) return;
    setPageStack(HOME_STACK);
  }, [presentation?.visible]);
  // Song select only records the selection; files are fetched when live preparation starts, as in the original.
  const [playSelection, setPlaySelection] = useState<MusicPlaySelection | null>(null);
  const loadedPlay = useRef<{ key: string; withMv: boolean } | null>(null);
  const pendingLaunch = useRef<{ mode: SimulatorModeSelection; done(): void } | null>(null);
  const [launchRevision, setLaunchRevision] = useState(0);
  const [mvDownloadAnswer, setMvDownloadAnswer] = useState<((confirmed: boolean) => void) | null>(null);
  const [preview, setPreview] = useState<{ request: MusicPreviewRequest | null; paused: boolean }>({ request: null, paused: false });
  const [previewStopped, setPreviewStopped] = useState(false);
  useEffect(() => { if (!livePreparationOpen) setPreviewStopped(false); }, [livePreparationOpen]);
  const samplePlayer = useMusicPreview(musicSelectionOpen && !previewStopped ? preview.request : null,
    appOptionSettings.simulatorSettings.systemBgmVolumePercent * appOptionSettings.simulatorSettings.masterVolumePercent / 10000,
    preview.paused, message => vm.showDialog(message, "error"));
  const answerMvDownload = (confirmed: boolean) => { mvDownloadAnswer?.(confirmed); setMvDownloadAnswer(null); };
  useEffect(() => {
    if (musicSelectionOpen) return;
    // Leaving the selection flow ends its sample; entering again waits for the list's own decision.
    setPreview({ request: null, paused: false });
    setPlaySelection(null); loadedPlay.current = null;
    vm.endPlaySession();
  }, [musicSelectionOpen, vm.endPlaySession]);
  // もう1回ライブ comes back to this preparation and PlaySampleMusic restarts the sample from its
  // start before PushUIScreen(43); a launch that never ran stays here with the sample as well.
  const [launchFailed, setLaunchFailed] = useState(false);
  const [liveSong, setLiveSong] = useState<LiveInProgressSong | null>(null);
  // The chart and media loaded for this live are current in the render that launches it.
  const currentLiveSong = (): LiveInProgressSong => {
    const shown = playSelection ? { ...metadata, title: playSelection.title, difficulty: playSelection.difficulty } : metadata;
    return { title: shown.title, bandName: shown.artist, difficulty: shown.difficulty,
      isFullLength: shown.isFullLength === true };
  };
  // Committed synchronously: the in-progress cover leaves in the same commit as the page switch,
  // before the opener releases the start Loading.
  const endLive = (exit: SimulatorWindowExit) => flushSync(() => {
    setLiveSong(null);
    if (exit === "leave") setPageStack(leaveLivePreparation);
    else setPreviewStopped(false);
    // A live that never ran stays on this preparation behind the resource-read notice.
    if (exit === "failed") setLaunchFailed(true);
  });
  // Launch from the render that holds the chart just loaded for play.
  useEffect(() => {
    const pending = pendingLaunch.current;
    if (pending === null) return;
    pendingLaunch.current = null;
    setLiveSong(currentLiveSong());
    void openSimulatorWindow(pending.mode, endLive).finally(pending.done);
  }, [launchRevision]);
  const startLive = async (mode: SimulatorModeSelection) => {
    const selection = playSelection;
    const key = selection === null ? null : `${selection.source}:${selection.id}:${selection.officialDifficulty ?? ""}`;
    const withMv = selection !== null && mode.sessionMode === "live" && playbackMvMode && selection.hasMv;
    const needsMv = withMv && !(loadedPlay.current?.key === key && loadedPlay.current.withMv);
    // liveStart asks before downloading a missing selected MV; cancel stays on this page.
    if (needsMv && !await new Promise<boolean>(answer => setMvDownloadAnswer(() => answer))) return;
    // ShowLoadingScreen (layer 13) is held for every start, downloaded or not, until the
    // gameplay surface is presented; transfers add the download gauge.
    const releaseLoading = downloadActivity.holdScreen();
    try {
      if (selection === null) { setLiveSong(currentLiveSong()); return await openSimulatorWindow(mode, endLive); }
      if (loadedPlay.current?.key !== key || needsMv) {
        await vm.beginPlaySession();
        const progress = { progress: () => {} };
        const loaded = selection.source === "official"
          ? await vm.loadOfficialChart({ id: selection.id, difficulty: selection.officialDifficulty!, preserveForPlay: true, includeMv: withMv, ...progress })
          : await vm.loadChartForPlay(selection.source, selection.id, progress);
        if (!loaded) return;
        loadedPlay.current = { key: key!, withMv };
      }
      // startGame: StopBGM(0.5) fades the sample out under the Loading screen.
      samplePlayer.stop(SAMPLE_START_GAME_FADE_SECONDS); setPreviewStopped(true);
      await new Promise<void>(done => { pendingLaunch.current = { mode, done }; setLaunchRevision(value => value + 1); });
    } finally { releaseLoading(); }
  };
  useStartupReadiness("home-page", backgroundPage === "entrance");
  const [preparationSettingsOpen, setPreparationSettingsOpen] = useState(false);
  const preparationInputs = useRef<Record<SimulatorModeSelection["sessionMode"], SimulatorModeSelection["inputMode"]>>({
    live: SIMULATOR_PRE_ADAPTATION_DEFAULTS.inputMode, rehearsal: SIMULATOR_PRE_ADAPTATION_DEFAULTS.inputMode,
  });
  const [preparationMode, setPreparationMode] = useState<SimulatorModeSelection>({
    sessionMode: SIMULATOR_PRE_ADAPTATION_DEFAULTS.sessionMode, inputMode: SIMULATOR_PRE_ADAPTATION_DEFAULTS.inputMode,
  });
  const changePreparationMode = (next: SimulatorModeSelection) => {
    if (next.sessionMode !== preparationMode.sessionMode) {
      setPreparationMode({ ...next, inputMode: preparationInputs.current[next.sessionMode] });
    } else {
      preparationInputs.current[next.sessionMode] = next.inputMode;
      setPreparationMode(next);
    }
  };
  const [bestdoriLoginUsernameInput, setBestdoriLoginUsernameInput] = useState("");
  const [bestdoriLoginPasswordInput, setBestdoriLoginPasswordInput] = useState("");
  const [bestdoriLoginSubmitting, setBestdoriLoginSubmitting] = useState(false);
  const [bestdoriLoginErrorMessage, setBestdoriLoginErrorMessage] = useState("");
  const [bestdoriNicknameDisplay, setBestdoriNicknameDisplay] = useState("");
  const [bestdoriUsernameDisplay, setBestdoriUsernameDisplay] = useState("");
  // 谱面作者 follows the Bestdori login: its nickname (the username for an account without one) once signed in,
  // empty when signed out or expired; the field can be edited in between.
  useEffect(() => { setUploadChartAuthor(bestdoriNicknameDisplay || bestdoriUsernameDisplay); },
    [bestdoriNicknameDisplay, bestdoriUsernameDisplay, setUploadChartAuthor]);

  // A login Bestdori no longer accepts, found at startup or before an upload, is shown signed out.
  useEffect(() => onBestdoriSessionExpired(() => {
    bestdoriAuthRevision.current += 1;
    setBestdoriUsernameDisplay("");
    setBestdoriNicknameDisplay("");
    showDialog("Bestdori 登录已失效，\n请重新登录。");
  }), [showDialog]);
  useEffect(() => {
    let disposed = false;
    const revision = bestdoriAuthRevision.current;
    void (async () => {
      try {
        const session = await bestdoriCheckSession();
        if (disposed || revision !== bestdoriAuthRevision.current) return;
        // Offline, the stored account stays shown; it is checked again before it is used.
        const me = session.status === "signed-in" ? session.me : session.status === "unverified" ? session.me : null;
        if (!me) return;
        setBestdoriUsernameDisplay(me.username?.trim() ?? "");
        setBestdoriNicknameDisplay(me.nickname?.trim() ?? "");
      } catch (error) {
        appLog("warn", "auth.session-check-failed", { error });
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  const openBestdoriLoginModal = useCallback(() => {
    setBestdoriLoginErrorMessage("");
    setBestdoriLoginPasswordInput("");
    setBestdoriLoginUsernameInput((current) => current || bestdoriUsernameDisplay);
    setIsBestdoriLoginOpen(true);
  }, [bestdoriUsernameDisplay]);

  const closeBestdoriLoginModal = useCallback(() => {
    if (bestdoriAuthBusy.current) {
      return;
    }
    setIsBestdoriLoginOpen(false);
    setBestdoriLoginPasswordInput("");
  }, [bestdoriLoginSubmitting]);

  const submitBestdoriLogin = useCallback(async () => {
    if (bestdoriAuthBusy.current) {
      return;
    }
    const username = bestdoriLoginUsernameInput.trim();
    const password = bestdoriLoginPasswordInput.trim();
    if (!username || !password) {
      setBestdoriLoginErrorMessage("请输入用户名和密码。");
      return;
    }
    bestdoriAuthBusy.current = true;
    bestdoriAuthRevision.current += 1;
    setBestdoriLoginSubmitting(true);
    setBestdoriLoginErrorMessage("");
    try {
      const response = await bestdoriLogin(username, password);
      const resolvedUsername = typeof response.username === "string" ? response.username.trim() : username;
      const resolvedNickname = typeof response.nickname === "string" ? response.nickname.trim() : "";
      setBestdoriUsernameDisplay(resolvedUsername);
      setBestdoriNicknameDisplay(resolvedNickname);
      setIsBestdoriLoginOpen(false);
      setBestdoriLoginPasswordInput("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showDialog(`Bestdori 登录失败：${message}`, "error");
    } finally {
      bestdoriAuthBusy.current = false;
      setBestdoriLoginSubmitting(false);
    }
  }, [bestdoriLoginPasswordInput, bestdoriLoginSubmitting, bestdoriLoginUsernameInput, showDialog]);

  const logoutBestdori = useCallback(async () => {
    if (bestdoriAuthBusy.current) return;
    bestdoriAuthBusy.current = true;
    bestdoriAuthRevision.current += 1;
    setBestdoriLoginSubmitting(true);
    setBestdoriLoginErrorMessage("");
    try {
      await bestdoriLogout();
      setBestdoriUsernameDisplay("");
      setBestdoriNicknameDisplay("");
      setBestdoriLoginPasswordInput("");
    } catch (error) {
      showDialog(`Bestdori 退出登录失败：${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      bestdoriAuthBusy.current = false;
      setBestdoriLoginSubmitting(false);
    }
  }, [showDialog]);

  const isColorAssistEnabled = appOptionSettings?.colorAssistEnabled === true;
  /** The event bubble section under the pointer, or null. */
  const eventBubbleHitAt = (event: { clientX: number; clientY: number }) =>
    hitTestEventBubble(eventBubbleHitsRef.current, playfieldTrackCanvasRef.current, event.clientX, event.clientY);
  // With the BPM tool armed, a bubble holding a BPM event opens that event's editor.
  // The target stays set while the dialog closes, so its value does not change during the close animation.
  const [bpmEditTarget, setBpmEditTarget] = useState<{ key: string; selectionId: string; bpm: number; isBase: boolean } | null>(null);
  const [bpmEditOpen, setBpmEditOpen] = useState(false);
  // With the SV tool armed, a bubble holding an SV event opens that event's editor.
  const [svEditTarget, setSvEditTarget] = useState<{ id: string; value: number; timingGroup: string } | null>(null);
  const [svEditOpen, setSvEditOpen] = useState(false);
  /**
   * Event lines are never selected: a bubble only reaches its event through the armed BPM or SV tool. The BPM tool
   * takes the bubble's BPM event; the SV tool the SV section that was pressed, else the bubble's first SV event.
   */
  const toolEventTarget = (hit: Pick<EventBubbleHit, "target" | "bubble">): TimelineEventTarget | null => {
    if (!isToolArmed) return null;
    if (tool === "bpm") return hit.bubble.find(target => target.kind === "bpm") ?? null;
    if (tool === "sv") return hit.target.kind === "sv" ? hit.target : hit.bubble.find(target => target.kind === "sv") ?? null;
    return null;
  };
  const eventBubbleHandlers: EventBubbleHandlers = {
    // A press opens the tool's editor for that event.
    press(hit) {
      const target = toolEventTarget(hit);
      if (target?.kind === "bpm") {
        const described = describeBpmEvent(target);
        if (described) {
          setBpmEditTarget({ key: target.key, ...described });
          setBpmEditOpen(true);
        }
      } else if (target?.kind === "sv") {
        const described = describeSvEvent(target);
        if (described) {
          setSvEditTarget(described);
          setSvEditOpen(true);
        }
      }
    },
    // A right-click deletes that event.
    remove(hit) {
      const target = toolEventTarget(hit);
      if (target) deleteTimelineEvent(target);
    },
  };
  const effectiveScrollContentHeight = Math.max(boardHeight, Number(scrollContentHeight) || 0);
  const canvasBpmCursorPreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasBpmSnapPreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasSvCursorPreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasSvSnapPreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasNoteCursorPreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasNoteSnapPreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasNoteReplacePreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasDirectionalWidenPreviewRef = useRef<HTMLDivElement | null>(null);

  // The Middle and Hidden tools place on blank board only in ExGarupa (elsewhere they only work on Slides), so they
  // preview only there.
  const isPlacementNoteTool = isToolArmed && tool !== "bpm" && tool !== "sv" && tool !== "copy" && tool !== "paste"
    && tool !== "curve"
    && !((tool === "middle" || tool === "hidden") && !vm.isExGarupaEnabled);
  const isPasteToolSelected = isToolArmed && tool === "paste";
  // The Long tool previews its head (the slide sprite); the Middle tool its node (the slide middle-node sprite).
  const isMiddlePreview = tool === "middle";
  const canvasPreviewType = isPlacementNoteTool ? toolPreviewNoteType(tool) : null;
  const canvasPreviewRhythmWidth = canvasPreviewType && isHabahiroEnabled && isRhythmWidthEditableType(canvasPreviewType)
    ? normalizeRhythmWidth(toolRhythmWidth)
    : 1;
  const canvasPreviewSpec = canvasPreviewType ? NOTE_SPECS[canvasPreviewType] : null;
  const canvasPreviewLayers = useMemo(() => {
    if (!canvasPreviewType) {
      return null;
    }
    return getSpriteLayers(canvasPreviewType, { width: canvasPreviewRhythmWidth,
      ...(isMiddlePreview ? { baseImageType: "slide_among" as const } : {}) });
  }, [canvasPreviewRhythmWidth, canvasPreviewType, getSpriteLayers, isMiddlePreview]);
  const canvasPreviewSingleAssistLayers = useMemo(() => {
    if (canvasPreviewType !== "single" || isMiddlePreview || !isColorAssistEnabled) {
      return null;
    }
    return getSpriteLayers("single", {
      baseImageType: "single16",
      includeDirectionalOverlay: false,
      includeFlickOverlay: false,
      width: canvasPreviewRhythmWidth,
    });
  }, [
    canvasPreviewRhythmWidth,
    canvasPreviewType,
    getSpriteLayers,
    isColorAssistEnabled,
  ]);
  const canvasPreviewHasSprite = Boolean(canvasPreviewLayers?.base || canvasPreviewLayers?.overlay);
  const canvasPreviewAspectRatio = useMemo(
    () => (canvasPreviewLayers ? getSpriteAspectRatio(canvasPreviewLayers) : 1),
    [canvasPreviewLayers, getSpriteAspectRatio],
  );
  const canvasPreviewIsDirectional = Boolean(canvasPreviewType && isDirectionalNoteType(canvasPreviewType));
  const canvasPreviewSpanLanes = canvasPreviewIsDirectional
    ? normalizeDirectionalWidth(toolDirectionalWidth)
    : canvasPreviewRhythmWidth;
  const noteSpriteHeightPx = editorNoteHeight(LANE_WIDTH, noteVisualScale);
  const directionalBaseWidthPx = editorDirectionalSegmentWidth(LANE_WIDTH, noteVisualScale);
  // The flick arrow and the Directional arrow head and back line, as the board's canvas draws them, for the
  // DOM-drawn previews (cursor and paste) on the board.
  const noteIconStyle = useMemo(() => {
    const flick = editorFlickArrowGeometry(LANE_WIDTH, noteVisualScale);
    const head = editorDirectionalHeadGeometry(LANE_WIDTH, noteVisualScale);
    return {
      "--flick-arrow-height": `${flick.height}px`,
      "--flick-arrow-offset": `${flick.offset}px`,
      "--directional-head-height": `${head.height}px`,
      "--directional-head-offset": `${head.offset}px`,
      "--directional-back-line-width": `${editorDirectionalBackLineWidth(LANE_WIDTH, noteVisualScale)}px`,
    };
  }, [LANE_WIDTH, noteVisualScale]);
  const canvasPreviewTokenWidth = canvasPreviewIsDirectional
    ? canvasPreviewSpanLanes * LANE_WIDTH
    : (
      canvasPreviewSpanLanes > 1
        ? editorNoteTokenWidth(canvasPreviewSpanLanes, false, LANE_WIDTH, noteVisualScale)
        : undefined
    );
  // The Hidden tool previews a Hidden node's mark, not a sprite.
  const canvasPreviewHiddenMark = canvasPreviewType === "hidden" ? (() => {
    const mark = editorHiddenMarkGeometry(canvasPreviewSpanLanes, LANE_WIDTH, noteVisualScale, vm.hiddenMarkBoxAt(canvasPreviewSpanLanes));
    return <span className="hidden-node-handle" style={{ left: `calc(50% + ${mark.offsetX - mark.width / 2}px)`,
      top: `calc(50% + ${mark.offsetY - mark.height / 2}px)`, width: mark.width, height: mark.height }} />;
  })() : null;
  const canvasPreviewTokenClassName = `note-token has-sprite preview-token ${canvasPreviewLayers?.overlay ? "composite" : ""} ${canvasPreviewIsDirectional ? "directional" : ""}`;
  useEffect(() => {
    const playfield = playfieldRef.current;
    if (!playfield) {
      return;
    }

    const updatePlayfieldMeasurements = () => {
      setViewportTop(playfield.parentElement!.getBoundingClientRect().top);
      setWorkspaceTop(playfield.parentElement!.parentElement!.getBoundingClientRect().top);
      setViewportHeight(window.innerHeight);
      setViewportRight(window.innerWidth - playfield.parentElement!.parentElement!.getBoundingClientRect().right);
      const bottom = playfield.parentElement!.getBoundingClientRect().bottom;
      vm.setPlaybackBottomInsetRatio(Math.max(0, Math.min(1,
        (window.innerHeight - bottom) / Math.max(1, window.innerHeight))));
      const board = playfieldBoardRef.current;
      if (!board) {
        setTimelineLabelX(8);
        return;
      }
      const playfieldRect = playfield.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      const boardScale = boardRect.width > 0 ? boardWidth / boardRect.width : 1;
      const viewportLeftInBoard = (playfieldRect.left - boardRect.left) * boardScale;
      setTimelineLabelX(8 + Math.min(0, viewportLeftInBoard));
    };

    updatePlayfieldMeasurements();
    window.addEventListener("resize", updatePlayfieldMeasurements);

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updatePlayfieldMeasurements);
      observer.observe(playfield);
      observer.observe(playfield.parentElement!);
      const board = playfieldBoardRef.current;
      if (board) {
        observer.observe(board);
      }
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", updatePlayfieldMeasurements);
      };
    }

    return () => {
      window.removeEventListener("resize", updatePlayfieldMeasurements);
    };
  }, [boardWidth, isSkinReady, playfieldBoardRef, playfieldRef]);
  const scaledBoardWidth = boardWidth;
  const scaledScrollContentHeight = effectiveScrollContentHeight;
  // The Middle tool's node, as the board draws one: moved so its sprite's opaque part is centred on its time.
  const middlePreviewBox = isMiddlePreview ? vm.hiddenMarkBoxAt(canvasPreviewRhythmWidth) : null;
  const canvasPreviewBaseShift = middlePreviewBox
    ? (0.5 - (middlePreviewBox.top + middlePreviewBox.bottom) / 2) * noteSpriteHeightPx : 0;
  const canvasPreviewTokenStyle: CSSProperties = useMemo(
    () => ({
      left: -9999,
      top: -9999,
      "--preview-base-shift": `${canvasPreviewBaseShift}px`,
      ...(canvasPreviewTokenWidth
        ? ({
            width: canvasPreviewTokenWidth,
            "--lane-width": `${LANE_WIDTH}px`,
            "--directional-base-width": `${directionalBaseWidthPx}px`,
            "--note-visual-scale": `${noteVisualScale}`,
            "--note-sprite-height": `${noteSpriteHeightPx}px`,
            "--sprite-aspect-ratio": `${canvasPreviewAspectRatio}`,
          } as CSSProperties)
        : ({
            "--directional-base-width": `${directionalBaseWidthPx}px`,
            "--note-visual-scale": `${noteVisualScale}`,
            "--note-sprite-height": `${noteSpriteHeightPx}px`,
            "--sprite-aspect-ratio": `${canvasPreviewAspectRatio}`,
          } as CSSProperties)),
    }),
    [LANE_WIDTH, canvasPreviewAspectRatio, canvasPreviewBaseShift, canvasPreviewTokenWidth, directionalBaseWidthPx,
      noteSpriteHeightPx, noteVisualScale],
  );
  const canvasDirectionalWidenTokenStyle: CSSProperties = useMemo(
    () => ({
      left: -9999,
      top: -9999,
      width: LANE_WIDTH,
      "--lane-width": `${LANE_WIDTH}px`,
      "--directional-base-width": `${directionalBaseWidthPx}px`,
      "--note-visual-scale": `${noteVisualScale}`,
      "--note-sprite-height": `${noteSpriteHeightPx}px`,
      "--sprite-aspect-ratio": `${canvasPreviewAspectRatio}`,
    } as CSSProperties),
    [LANE_WIDTH, canvasPreviewAspectRatio, directionalBaseWidthPx, noteSpriteHeightPx, noteVisualScale],
  );
  const canvasNoteReplaceTokenStyle: CSSProperties = useMemo(
    () => ({
      left: -9999,
      top: -9999,
      ...(canvasPreviewTokenWidth
        ? ({
            width: canvasPreviewTokenWidth,
            "--lane-width": `${LANE_WIDTH}px`,
            "--directional-base-width": `${directionalBaseWidthPx}px`,
            "--note-visual-scale": `${noteVisualScale}`,
            "--note-sprite-height": `${noteSpriteHeightPx}px`,
            "--sprite-aspect-ratio": `${canvasPreviewAspectRatio}`,
          } as CSSProperties)
        : ({
            "--directional-base-width": `${directionalBaseWidthPx}px`,
            "--note-visual-scale": `${noteVisualScale}`,
            "--note-sprite-height": `${noteSpriteHeightPx}px`,
            "--sprite-aspect-ratio": `${canvasPreviewAspectRatio}`,
          } as CSSProperties)),
    }),
    [LANE_WIDTH, canvasPreviewAspectRatio, canvasPreviewTokenWidth, directionalBaseWidthPx, noteSpriteHeightPx, noteVisualScale],
  );
  const pastePreviewVisuals = useMemo(() => {
    if (!isPasteToolSelected || !copiedChartPayload || !cursorPreview || cursorPreview.snappedBeat === null) {
      return {
        notes: [] as Array<{
          key: string;
          type: string;
          x: number;
          y: number;
          spanLanes: number;
          isDirectional: boolean;
          layers: any;
          aspectRatio: number;
          label: string;
        }>,
        bpmYPositions: [] as number[],
        svYPositions: [] as number[],
      };
    }

    if (copiedChartPayload.laneAnchorEnabled && cursorPreview.snappedLane === null) {
      return {
        notes: [] as Array<{
          key: string;
          type: string;
          x: number;
          y: number;
          spanLanes: number;
          isDirectional: boolean;
          layers: any;
          aspectRatio: number;
          label: string;
        }>,
        bpmYPositions: [] as number[],
        svYPositions: [] as number[],
      };
    }

    const laneDelta = copiedChartPayload.laneAnchorEnabled
      ? Number(((cursorPreview.snappedLane ?? copiedChartPayload.anchorLane) - copiedChartPayload.anchorLane).toFixed(6))
      : 0;
    const beatDelta = Number((cursorPreview.snappedBeat - copiedChartPayload.anchorBeat).toFixed(6));

    const previewNotes = copiedChartPayload.notes.flatMap((source: any, index: number) => {
      if (source.type === "hidden") {
        return [];
      }
      const adjustedLane = Number((source.lane + laneDelta).toFixed(6));
      const adjustedBeat = Math.max(0, Number((source.beat + beatDelta).toFixed(6)));
      const adjustedNote = {
        ...source,
        lane: adjustedLane,
        beat: adjustedBeat,
      };
      const spanLanes = getNoteSpanLanes(adjustedNote);
      const isDirectional = isDirectionalNoteType(source.type);
      const directionalStartLane = noteLaneSpanStart(source.type, adjustedLane, spanLanes);
      const widthValue =
        isHabahiroEnabled && isRhythmWidthEditableType(source.type)
          ? normalizeRhythmWidth(source.width)
          : 1;
      const layers = getSpriteLayers(source.type, { width: widthValue });
      if (!layers.base && !layers.overlay) {
        return [];
      }
      const aspectRatio = getSpriteAspectRatio(layers);
      const label = NOTE_SPECS[source.type]?.label ?? source.type;
      return [{
        key: `${source.id}-${index}`,
        type: source.type,
        x: (laneToColumn(directionalStartLane) + spanLanes / 2) * LANE_WIDTH,
        y: getNoteDisplayY?.(adjustedNote, adjustedBeat) ?? beatToY(adjustedBeat),
        spanLanes,
        isDirectional,
        layers,
        aspectRatio,
        label,
      }];
    });
    const bpmYPositions = copiedChartPayload.bpmEvents
      .map((event: any) => beatToY(Math.max(0, Number((event.beat + beatDelta).toFixed(6)))))
      .filter((value: number) => Number.isFinite(value));
    const svYPositions = copiedChartPayload.svEvents
      .map((event: any) => beatToY(Math.max(0, Number((event.beat + beatDelta).toFixed(6)))))
      .filter((value: number) => Number.isFinite(value));
    return {
      notes: previewNotes,
      bpmYPositions,
      svYPositions,
    };
  }, [
    LANE_WIDTH,
    NOTE_SPECS,
    beatToY,
    copiedChartPayload,
    cursorPreview,
    getNoteDisplayY,
    getNoteSpanLanes,
    getSpriteAspectRatio,
    getSpriteLayers,
    isDirectionalNoteType,
    isHabahiroEnabled,
    isPasteToolSelected,
    isRhythmWidthEditableType,
    laneToColumn,
    normalizeRhythmWidth,
  ]);
  const updateCanvasInteractionWindow = useCallback((scrollTop: number, clientHeight: number) => {
    const rawTop = Math.max(0, scrollTop - CANVAS_INTERACTION_OVERSCAN_PX);
    const rawBottom = Math.min(effectiveScrollContentHeight, scrollTop + clientHeight + CANVAS_INTERACTION_OVERSCAN_PX);
    const top = Math.max(0, Math.floor(rawTop / CANVAS_INTERACTION_SNAP_PX) * CANVAS_INTERACTION_SNAP_PX);
    const bottom = Math.max(
      top + 1,
      Math.min(effectiveScrollContentHeight, Math.ceil(rawBottom / CANVAS_INTERACTION_SNAP_PX) * CANVAS_INTERACTION_SNAP_PX),
    );
    interactionWindow.set({ top, bottom });
  }, [effectiveScrollContentHeight]);
  useEffect(() => {
    const playfield = playfieldRef?.current;
    if (!playfield) {
      return;
    }
    updateCanvasInteractionWindow(playfield.scrollTop, playfield.clientHeight);
  }, [effectiveScrollContentHeight, playfieldRef, updateCanvasInteractionWindow]);
  const handlePlayfieldScrollInternal = useCallback((event: any) => {
    playfieldScroll.set(event.currentTarget.scrollTop);
    handlePlayfieldScroll(event);
    updateCanvasInteractionWindow(event.currentTarget.scrollTop, event.currentTarget.clientHeight);
    selectionOverlayRef.current?.sync();
  }, [handlePlayfieldScroll, updateCanvasInteractionWindow]);

  useEffect(() => {
    let rafId = 0;
    const hide = (element: HTMLDivElement | null) => {
      if (!element) {
        return;
      }
      if (element.style.display !== "none") {
        element.style.display = "none";
      }
    };
    const show = (element: HTMLDivElement | null) => {
      if (!element) {
        return;
      }
      if (element.style.display !== "block") {
        element.style.display = "block";
      }
    };
    const applyPos = (element: HTMLDivElement | null, x: number, y: number) => {
      if (!element) {
        return;
      }
      const nextLeft = `${x}px`;
      const nextTop = `${y}px`;
      if (element.style.left !== nextLeft) {
        element.style.left = nextLeft;
      }
      if (element.style.top !== nextTop) {
        element.style.top = nextTop;
      }
    };
    const hideAll = () => {
      hide(canvasBpmCursorPreviewRef.current);
      hide(canvasBpmSnapPreviewRef.current);
      hide(canvasSvCursorPreviewRef.current);
      hide(canvasSvSnapPreviewRef.current);
      hide(canvasNoteCursorPreviewRef.current);
      hide(canvasNoteSnapPreviewRef.current);
      hide(canvasNoteReplacePreviewRef.current);
      hide(canvasDirectionalWidenPreviewRef.current);
    };

    const tick = () => {
      const livePreview = cursorPreviewRef?.current ?? null;
      if (!isToolArmed || !livePreview) {
        hideAll();
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (tool === "bpm" || tool === "sv") {
        hide(canvasNoteCursorPreviewRef.current);
        hide(canvasNoteSnapPreviewRef.current);
        hide(canvasNoteReplacePreviewRef.current);
        hide(canvasDirectionalWidenPreviewRef.current);
        const cursorRef = tool === "bpm" ? canvasBpmCursorPreviewRef : canvasSvCursorPreviewRef;
        const snapRef = tool === "bpm" ? canvasBpmSnapPreviewRef : canvasSvSnapPreviewRef;
        const inactiveCursorRef = tool === "bpm" ? canvasSvCursorPreviewRef : canvasBpmCursorPreviewRef;
        const inactiveSnapRef = tool === "bpm" ? canvasSvSnapPreviewRef : canvasBpmSnapPreviewRef;
        hide(inactiveCursorRef.current);
        hide(inactiveSnapRef.current);
        show(cursorRef.current);
        applyPos(cursorRef.current, 0, livePreview.y);
        if (livePreview.snappedBeat !== null) {
          show(snapRef.current);
          applyPos(snapRef.current, 0, beatToY(livePreview.snappedBeat));
        } else {
          hide(snapRef.current);
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      hide(canvasBpmCursorPreviewRef.current);
      hide(canvasBpmSnapPreviewRef.current);
      hide(canvasSvCursorPreviewRef.current);
      hide(canvasSvSnapPreviewRef.current);
      if (!canvasPreviewHasSprite) {
        hide(canvasNoteCursorPreviewRef.current);
        hide(canvasNoteSnapPreviewRef.current);
        hide(canvasNoteReplacePreviewRef.current);
        hide(canvasDirectionalWidenPreviewRef.current);
        rafId = requestAnimationFrame(tick);
        return;
      }

      show(canvasNoteCursorPreviewRef.current);
      applyPos(canvasNoteCursorPreviewRef.current, livePreview.x, livePreview.y);
      if (livePreview.snappedLane !== null && livePreview.snappedBeat !== null) {
        const snappedStartLane = noteLaneSpanStart(canvasPreviewType ?? "single", livePreview.snappedLane, canvasPreviewSpanLanes);
        const snappedX = (laneToColumn(snappedStartLane) + canvasPreviewSpanLanes / 2) * LANE_WIDTH;
        const snappedY = beatToY(livePreview.snappedBeat);
        show(canvasNoteSnapPreviewRef.current);
        applyPos(canvasNoteSnapPreviewRef.current, snappedX, snappedY);
        const snapNode = canvasNoteSnapPreviewRef.current;
        if (snapNode) {
          const useColorAssist =
            isColorAssistEnabled
            && canvasPreviewType === "single"
            && !isHalfBeatAligned(livePreview.snappedBeat);
          const nextMode = useColorAssist ? "on" : "off";
          if (snapNode.dataset.colorAssist !== nextMode) {
            snapNode.dataset.colorAssist = nextMode;
          }
        }
      } else {
        hide(canvasNoteSnapPreviewRef.current);
      }

      const noteReplacePreview = resolveNoteReplacePreviewAt?.(livePreview.x, livePreview.y) ?? null;
      if (
        noteReplacePreview &&
        canvasPreviewType === noteReplacePreview.type
      ) {
        show(canvasNoteReplacePreviewRef.current);
        applyPos(canvasNoteReplacePreviewRef.current, noteReplacePreview.x, noteReplacePreview.y);
        const replaceNode = canvasNoteReplacePreviewRef.current;
        if (replaceNode) {
          const nextWidth = isDirectionalNoteType(noteReplacePreview.type)
            ? `${noteReplacePreview.spanLanes * LANE_WIDTH}px`
            : (
              noteReplacePreview.spanLanes > 1
                ? `${editorNoteTokenWidth(noteReplacePreview.spanLanes, false, LANE_WIDTH, noteVisualScale)}px`
                : ""
            );
          if (replaceNode.style.width !== nextWidth) {
            replaceNode.style.width = nextWidth;
          }
          const nextLaneWidth = `${LANE_WIDTH}px`;
          if (replaceNode.style.getPropertyValue("--lane-width") !== nextLaneWidth) {
            replaceNode.style.setProperty("--lane-width", nextLaneWidth);
          }
          const nextAspectRatio = `${canvasPreviewAspectRatio}`;
          if (replaceNode.style.getPropertyValue("--sprite-aspect-ratio") !== nextAspectRatio) {
            replaceNode.style.setProperty("--sprite-aspect-ratio", nextAspectRatio);
          }
        }
      } else {
        hide(canvasNoteReplacePreviewRef.current);
      }

      const directionalWidenPreview = resolveDirectionalWidenPreviewAt?.(livePreview.x, livePreview.y) ?? null;
      if (
        directionalWidenPreview &&
        canvasPreviewType === directionalWidenPreview.type &&
        canvasPreviewIsDirectional
      ) {
        show(canvasDirectionalWidenPreviewRef.current);
        applyPos(canvasDirectionalWidenPreviewRef.current, directionalWidenPreview.x, directionalWidenPreview.y);
      } else {
        hide(canvasDirectionalWidenPreviewRef.current);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      hide(canvasBpmCursorPreviewRef.current);
      hide(canvasBpmSnapPreviewRef.current);
      hide(canvasSvCursorPreviewRef.current);
      hide(canvasSvSnapPreviewRef.current);
      hide(canvasNoteCursorPreviewRef.current);
      hide(canvasNoteSnapPreviewRef.current);
      hide(canvasNoteReplacePreviewRef.current);
      hide(canvasDirectionalWidenPreviewRef.current);
    };
  }, [
    LANE_WIDTH,
    beatToY,
    canvasPreviewHasSprite,
    canvasPreviewAspectRatio,
    canvasPreviewIsDirectional,
    canvasPreviewSingleAssistLayers,
    canvasPreviewSpanLanes,
    canvasPreviewType,
    cursorPreviewRef,
    isColorAssistEnabled,
    isDirectionalNoteType,
    isToolArmed,
    laneToColumn,
    noteVisualScale,
    resolveDirectionalWidenPreviewAt,
    resolveNoteReplacePreviewAt,
    tool,
  ]);

  const noteInteractionRef = useRef<any>(null);
  noteInteractionRef.current = {
    noteById,
    isToolArmed,
    tool,
    slideBuildRef,
    pressSlideTool,
    slidePressRef,
    findNoteAtGridPoint,
    findNoteNearestAtBoardPoint,
    playfieldBoardRef,
    showDialog,
    beginSelectedNotesMove,
    suppressNextNoteClickRef,
    toggleSelectedNote,
    applyToolToPlacedNote,
    cancelSlideBuild,
    clearSelection,
    deleteRightClickedNotes,
    isSvPreviewEnabled,
    isNoteOutsideActiveTimingGroup,
    multiSelectModeRef: vm.multiSelectModeRef,
  };

  // The hover frame is the selection frame around the hovered note's button. A button that goes away (the note was
  // deleted or became Hidden) fires no mouseleave, so the frame is placed again from the button after every render.
  const hoverMarginRef = useRef(0);
  hoverMarginRef.current = SELECTION_FRAME_MARGIN * uiViewport.scale;
  const hoveredNoteIdRef = useRef<string | null>(null);
  const placeHoverFrame = useCallback(() => {
    const board = playfieldBoardRef.current, id = hoveredNoteIdRef.current;
    const button = id && board ? (board as HTMLElement).querySelector<HTMLElement>(`.note-token.note-hitbox[data-note-id="${CSS.escape(id)}"]`) : null;
    if (!board || !button) {
      hoveredNoteIdRef.current = null;
      selectionOverlayRef.current?.setHoverFrame(null);
      return;
    }
    const boardRect = board.getBoundingClientRect(), rect = button.getBoundingClientRect();
    const margin = hoverMarginRef.current;
    selectionOverlayRef.current?.setHoverFrame({ left: rect.left - boardRect.left - margin, top: rect.top - boardRect.top - margin,
      width: rect.width + 2 * margin, height: rect.height + 2 * margin });
  }, [playfieldBoardRef]);
  // With a placing tool, the hover frame is around the note a press would act on: the one in the grid cell under the
  // pointer (findNoteAtGridPoint), not the note whose button the pointer is over.
  const placingToolHovers = () => {
    const runtime = noteInteractionRef.current;
    return Boolean(runtime?.isToolArmed && runtime.tool !== "copy" && runtime.tool !== "paste");
  };
  // The hover frame follows the pointer over the board (updateGridHoverFrame), not a button's enter and leave.
  const handleSharedNoteMouseEnter = useCallback(() => {}, []);
  const updateGridHoverFrame = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const runtime = noteInteractionRef.current;
    if (!runtime) return;
    const point = boardPointOf(runtime, event);
    const id = !point ? null : placingToolHovers() ? runtime.findNoteAtGridPoint(point.x, point.y)?.id ?? null
      : runtime.findNoteNearestAtBoardPoint(point.x, point.y)?.id ?? null;
    if (id === hoveredNoteIdRef.current) return;
    hoveredNoteIdRef.current = id;
    placeHoverFrame();
  }, [placeHoverFrame]);
  const handleSharedNoteMouseLeave = useCallback(() => {}, []);
  useLayoutEffect(() => {
    if (hoveredNoteIdRef.current) placeHoverFrame();
  });
  const handleSharedNoteMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    const runtime = noteInteractionRef.current;
    const noteId = event.currentTarget.dataset.noteId;
    if (!runtime || !noteId) {
      return;
    }
    const note = pressedNoteOf(runtime, event, runtime.noteById?.get(noteId));
    if (!note) {
      return;
    }
    if (runtime.isNoteOutsideActiveTimingGroup?.(note)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (runtime.isSvPreviewEnabled) {
      return;
    }
    if (runtime.isToolArmed && (runtime.tool === "copy" || runtime.tool === "paste")) {
      return;
    }
    if (runtime.isToolArmed && (runtime.tool === "slide" || runtime.tool === "hidden")) {
      event.preventDefault();
      event.stopPropagation();
      // The press acts on the grid cell under it: this note, another note there, or blank board.
      const point = boardPointOf(runtime, event);
      runtime.slidePressRef.current = { clientX: event.clientX, clientY: event.clientY };
      runtime.pressSlideTool(point ? runtime.findNoteAtGridPoint(point.x, point.y) : note, point?.x ?? 0, point?.y ?? 0);
      return;
    }
    runtime.beginSelectedNotesMove(event, note.id);
  }, []);

  const handleSharedNoteClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    const runtime = noteInteractionRef.current;
    const noteId = event.currentTarget.dataset.noteId;
    if (!runtime || !noteId) {
      return;
    }
    const note = pressedNoteOf(runtime, event, runtime.noteById?.get(noteId));
    if (!note) {
      return;
    }
    if (runtime.isNoteOutsideActiveTimingGroup?.(note)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (runtime.isSvPreviewEnabled) {
      event.stopPropagation();
      if (event.metaKey || event.ctrlKey) {
        runtime.toggleSelectedNote(note.id);
        return;
      }
      runtime.clearSelection();
      runtime.toggleSelectedNote(note.id);
      return;
    }
    if (runtime.isToolArmed && (runtime.tool === "copy" || runtime.tool === "paste")) {
      return;
    }
    // A placing tool acts on the grid cell under the press: a note's button can reach into the cells next to it (notes
    // closer than their buttons are tall). A press in a cell with no note there is the board's, which places in it.
    let target = note;
    if (runtime.isToolArmed && runtime.tool !== "slide" && runtime.tool !== "hidden") {
      const point = boardPointOf(runtime, event);
      const gridNote = point ? runtime.findNoteAtGridPoint(point.x, point.y) : note;
      if (!gridNote && !runtime.suppressNextNoteClickRef.current) {
        return;
      }
      target = gridNote ?? note;
    }
    event.stopPropagation();
    if (runtime.isToolArmed && (runtime.tool === "slide" || runtime.tool === "hidden")) {
      return;
    }
    if (runtime.suppressNextNoteClickRef.current) {
      runtime.suppressNextNoteClickRef.current = false;
      return;
    }
    // Ctrl/Cmd held, or multi-select mode, toggles the note in the selection.
    if (!runtime.isToolArmed && (event.metaKey || event.ctrlKey || runtime.multiSelectModeRef?.current === true)) {
      runtime.toggleSelectedNote(note.id);
      return;
    }
    runtime.applyToolToPlacedNote(target);
  }, []);

  const handleSharedNoteContextMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    const runtime = noteInteractionRef.current;
    const noteId = event.currentTarget.dataset.noteId;
    if (!runtime || !noteId) {
      return;
    }
    const note = pressedNoteOf(runtime, event, runtime.noteById?.get(noteId));
    if (!note) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (runtime.isNoteOutsideActiveTimingGroup?.(note)) {
      return;
    }
    // Right-click drops the Slide tool's start.
    if (runtime.slideBuildRef.current) {
      runtime.cancelSlideBuild();
      return;
    }
    runtime.deleteRightClickedNotes([note.id]);
  }, []);

  // Hidden nodes' marks (and the Hidden tool's preview) are painted in the slide among sprite's own colours.
  const hiddenMarkPaintStyle = useMemo(() => {
    const paint = hiddenMarkPaint(vm.hiddenMarkColors);
    return { "--hidden-mark-fill": paint.fill, "--hidden-mark-stroke": paint.stroke } as CSSProperties;
  }, [vm.hiddenMarkColors]);
  // Hidden nodes are drawn faint unless the Hidden tool is armed (a selected one is not).
  const isHiddenMarkIdle = !(isToolArmed && tool === "hidden");
  const renderedNoteButtons = useMemo(
    () =>
      renderNotes.map((note: any) => {
        if (note.type === "hidden") {
          // A Hidden node is a note one lane wide on the board, drawn as its mark (the skin's slide among body); off
          // the beat lines it is neither shown nor operable on a board too compressed for subdivision lines.
          if (!vm.isHiddenNodeShown(note)) return null;
          const span = getNoteSpanLanes(note);
          const { lane, beat } = getRenderedNotePlacement(note);
          const y = getNoteDisplayY?.(note, beat) ?? beatToY(beat);
          const mark = editorHiddenMarkGeometry(span, LANE_WIDTH, noteVisualScale, vm.hiddenMarkBoxAt(span));
          const isStart = isSlideBuilding && slideBuildSelectedIdSet.has(note.id);
          const muted = isNoteOutsideActiveTimingGroup?.(note) === true;
          return (
            <NoteWindowCull key={note.id} y={y}>
            <button key={note.id} type="button" data-note-id={note.id}
              className={`note-token note-hitbox hidden-node-token ${isHiddenMarkIdle ? "is-idle" : ""} ${selectedNoteIdSet.has(note.id) ? "selected" : ""} ${muted ? "timing-group-muted" : ""}`}
              style={{ left: (laneToColumn(lane) + 0.5) * LANE_WIDTH, top: y,
                width: editorNoteTokenWidth(span, false, LANE_WIDTH, noteVisualScale),
                height: editorHiddenButtonHeight(LANE_WIDTH, noteVisualScale) }}
              title={`Hidden | Lane ${note.lane} | Beat ${formatBeat(note.beat)}`}
              onMouseDown={handleSharedNoteMouseDown}
              onMouseEnter={handleSharedNoteMouseEnter}
              onMouseLeave={handleSharedNoteMouseLeave}
              onClick={handleSharedNoteClick}
              onContextMenu={handleSharedNoteContextMenu}
            >
              <span className={`hidden-node-handle${isStart ? " is-start" : ""}${selectedNoteIdSet.has(note.id) ? " is-selected" : ""}`}
                style={{ left: `calc(50% + ${mark.offsetX - mark.width / 2}px)`, top: `calc(50% + ${mark.offsetY - mark.height / 2}px)`,
                  width: mark.width, height: mark.height }} />
            </button>
            </NoteWindowCull>
          );
        }
        const spec = NOTE_SPECS[note.type];
        const isDirectional = isDirectionalNoteType(note.type);
        const spanLanes = getNoteSpanLanes(note);
        const { lane: renderLane, beat: renderBeat } = getRenderedNotePlacement(note);
        const renderY = getNoteDisplayY?.(note, renderBeat) ?? beatToY(renderBeat);
        const directionalStartLane = noteLaneSpanStart(note.type, renderLane, spanLanes);
        const resolved = resolvePlacedNoteLayers(note, { beat: renderBeat });
        if (!resolved.layers.base) {
          return null;
        }
        const spriteLayers = resolved.layers;
        const spriteAspectRatio = getSpriteAspectRatio(resolved.layers);
        const noteHeight = editorNoteHeight(LANE_WIDTH, noteVisualScale);
        const tokenWidth = editorNoteTokenWidth(spanLanes, isDirectional, LANE_WIDTH, noteVisualScale);
        // A Slide's middle node drawn as the skin's slide among (a thin bar) is pressed by a button as short as a
        // Hidden node's, so the line between close nodes stays pressable.
        const isAmongNode = !spriteLayers.overlay && spriteLayers.base === getSpriteLayers("single", {
          baseImageType: "slide_among", width: spanLanes, includeDirectionalOverlay: false, includeFlickOverlay: false,
        }).base;
        const style: CSSProperties = {
          left: (laneToColumn(directionalStartLane) + spanLanes / 2) * LANE_WIDTH,
          top: renderY,
          width: tokenWidth,
          ...(isAmongNode ? { height: editorHiddenButtonHeight(LANE_WIDTH, noteVisualScale) } : {}),
          "--lane-width": `${LANE_WIDTH}px`,
          "--directional-base-width": `${directionalBaseWidthPx}px`,
          "--note-visual-scale": `${noteVisualScale}`,
          "--note-sprite-height": `${noteHeight}px`,
          "--sprite-aspect-ratio": `${spriteAspectRatio}`,
        } as CSSProperties;
        const widthHint = isDirectionalNoteType(note.type)
          ? ` | Width ${note.width ?? 1}`
          : "";
        const isNoteSelected = selectedNoteIdSet.has(note.id)
          || (isSlideBuilding && slideBuildSelectedIdSet.has(note.id));
        const isTimingGroupMuted = isNoteOutsideActiveTimingGroup?.(note) === true;
        const noteTokenClassName = `note-token note-hitbox has-sprite ${spriteLayers.overlay ? "composite" : ""} ${isNoteSelected ? "selected" : ""} ${isDirectional ? "directional" : ""} ${isTimingGroupMuted ? "timing-group-muted" : ""}`;

        return (
          <NoteWindowCull key={note.id} y={renderY}>
          <button
            key={note.id}
            type="button"
            data-note-id={note.id}
            className={noteTokenClassName}
            style={style}
            title={`${spec.label} | Lane ${note.lane} | Beat ${formatBeat(note.beat)}${widthHint}`}
            onMouseDown={handleSharedNoteMouseDown}
            onMouseEnter={handleSharedNoteMouseEnter}
            onMouseLeave={handleSharedNoteMouseLeave}
            onClick={handleSharedNoteClick}
            onContextMenu={handleSharedNoteContextMenu}
          >
          </button>
          </NoteWindowCull>
        );
      }),
    [
      LANE_WIDTH,
      NOTE_SPECS,
      beatToY,
      formatBeat,
      getNoteSpanLanes,
      getRenderedNotePlacement,
      getNoteDisplayY,
      getSpriteAspectRatio,
      handleSharedNoteClick,
      handleSharedNoteContextMenu,
      handleSharedNoteMouseDown,
      handleSharedNoteMouseEnter,
      handleSharedNoteMouseLeave,
      isDirectionalNoteType,
      isNoteOutsideActiveTimingGroup,
      isSlideBuilding,
      laneToColumn,
      noteVisualScale,
      directionalBaseWidthPx,
      renderNotes,
      renderDirectionalSprite,
      renderSpriteStack,
      resolvePlacedNoteLayers,
      selectedNoteIdSet,
      slideBuildSelectedIdSet,
      vm.hiddenMarkBoxAt,
      isHiddenMarkIdle,
      vm.isHiddenNodeShown,
      getSpriteLayers,
      // vm's functions are stable wrappers: what isHiddenNodeShown reads (the Curve tool hides Hidden nodes) is listed.
      isToolArmed,
      tool,
    ],
  );
  return (
    <OriginalUiSoundProvider volumePercent={appOptionSettings.simulatorSettings.systemSeVolumePercent}
      masterPercent={appOptionSettings.simulatorSettings.masterVolumePercent} onError={message => vm.showDialog(`界面音效失败：${message}`, "error")}>
    <OriginalMenuBackground type={page === "live" ? (preparationMode.sessionMode === "rehearsal" ? 2 : 1)
      : page === "search" ? 1 : page === "song" || page === "songEdit" ? 257 : page === "entrance" ? "home" : "editor"} onError={message => vm.showDialog(message, "error")} />
    <main className={`app-shell ${mobileRuntime ? "is-mobile-runtime" : ""}`}
      data-ui-layout={uiViewport.stacked ? "stacked" : "columns"}
      >
      <input
        ref={jsonImportRef}
        type="file"
        accept=".json,application/json"
        className="hidden-input"
        onChange={(event) => {
          void handleJsonImport(event);
        }}
      />
      <input
        ref={bestdoriV2ImportRef}
        type="file"
        accept=".json,application/json"
        className="hidden-input"
        onChange={(event) => {
          void handleBestdoriV2Import(event);
        }}
      />

      <OriginalPageSwitch workspaceReady={vm.workspaceReady} open={page !== "editor"}
        onPageShown={setBackgroundPage}
        onRestorePage={(shown, key) => {
          // A cancelled or failed preparation returns to the page still shown (null is the editor).
          setPageStack(stack => returnToPage(stack, (shown ?? "editor") as AppPage));
          const source = key?.split(":")[1];
          if (shown === "search" && (source === "official" || source === "bestdori" || source === "ayachan")) vm.setMusicSelectionSource(source);
        }}
        onWorkspaceBack={() => setPageStack(popPage)}
        showPageBack={page !== "entrance" || !!returnToTitle}
        pageKey={pageSwitchKey(page, appOptionSettings.musicSelectionSource)}
        stackPageKeys={pageStack.slice(0, -1).filter(entry => entry !== "editor")
          .map(entry => pageSwitchKey(entry, appOptionSettings.musicSelectionSource))}
        pageId={page}
        section={page === "song" || page === "songEdit" ? "歌曲" : page === "entrance" ? "首页" : "演出"}
        title={page === "live" ? songDetailSource.wording[preparationMode.sessionMode === "rehearsal"
          ? "header_mainTitle_freeLivePracticeMode" : "header_mainTitle_freeLive"] : page === "song" ? "歌曲信息" : page === "songEdit" ? (songEditCreating ? "创建工程" : "编辑信息") : page === "search" ? "谱面搜索" : "选择功能"}
        onOpenMenu={openAppSettings} menuOpen={isAppSettingsOpen}
        onBack={() => {
          if (page === "entrance") handleReturnToTitle();
          else if (page === "songEdit") leaveSongEdit();
          else setPageStack(popPage);
        }} page={page === "live" ?
      <LivePreparationPage metadata={playSelection ? { ...metadata, title: playSelection.title,
        difficulty: playSelection.difficulty, difficultyLevel: playSelection.level } : metadata} mode={preparationMode} onModeChange={changePreparationMode}
        mvEnabled={playbackMvMode} hasMv={playSelection ? playSelection.hasMv : !!chartMediaSources.mv}
        hasSpecialNotes={playSelection ? playSelection.hasSpecialNotes : songHasSpecialNotes(notes, vm.slideChains)}
        onMvChange={setPlaybackMvMode} onSettings={() => setPreparationSettingsOpen(true)}
        resourcesReady={vm.settingsResourcesReady} onStart={startLive} /> : page === "search" ?
      <MusicSelectionPage source={appOptionSettings.musicSelectionSource} onSourceChange={vm.setMusicSelectionSource}
        persisted={appOptionSettings.officialMusicSelection} onPersist={vm.setOfficialMusicSelection}
        onResourceWarning={message => vm.showDialog(message, "error")} onPreview={(request, paused) => setPreview(current => current.request?.key === request?.key && current.paused === paused ? current : { request, paused })} onLoad={(source, id, progress, _destination, difficulty) => {
          vm.endPlaySession(); loadedPlay.current = null;
          return source === "official"
            ? vm.loadOfficialChart({ id, difficulty: difficulty!, preserveForPlay: false, progress }).then(Boolean) : source === "bestdori"
            ? vm.applyImportCommunityChart(id, false, { progress }) : vm.loadChartForPlay(source, id, { progress });
        }}
        onPlay={entry => { setPlaySelection(musicPlaySelection(entry)); setPageStack(stack => openDetailPage(stack, "live")); }}
        onReady={destination => {
          if (destination === "play") setPageStack(stack => openDetailPage(stack, "live"));
          else setPageStack(EDITOR_STACK);
        }} /> : page === "entrance" ?
      <LiveSelectionPage onFreeLive={() => {
          // Without a project in progress, a new one is made first (创建工程).
          if (vm.hasProjectContent) setPageStack(stack => pushPage(stack, "editor"));
          else setConfirmingCreate(true);
        }}
        onImportProject={() => vm.projectFiles.choose(() => setPageStack(EDITOR_STACK),
          () => vm.showDialog("未选择项目文件"))}
        onSearchCharts={() => setPageStack(stack => pushPage(stack, "search"))} /> : <SongInformationEditPage
        key={page === "songEdit" ? `edit-${songEditSession}` : "view"}
        mode={page === "song" ? "view" : songEditCreating ? "create" : "edit"}
        audioDurationSec={audioDurationSec}
        noteCount={visibleNoteCount}
        notes={notes}
        slideChains={vm.slideChains}
        metadata={page === "songEdit" && songEditCreating ? NEW_PROJECT_METADATA : metadata}
        mediaSources={page === "songEdit" && songEditCreating ? NO_MEDIA : chartMediaSources}
        optionSettings={appOptionSettings}
        habahiro={isHabahiroEnabled}
        onError={message => vm.showDialog(message, "error")}
        onNotice={message => vm.showDialog(message, "info")}
        onConfirm={songEditCreating ? vm.createSongProject : vm.applySongInformationEdit}
        onLeave={page === "song" ? () => setPageStack(popPage)
          : songEditCreating ? () => setPageStack(EDITOR_STACK) : () => setPageStack(popPage)}
        onCancel={leaveSongEdit}
        onEdit={() => openSongEdit(false, stack => pushPage(stack, "songEdit"))}
      />

      }>


      <section className={`workspace ${mobileRuntime ? "is-mobile-workspace" : ""}`}
        style={{ position: "relative", gap: SONG_INFORMATION_CONTENT_BOUNDS.columnGap * uiViewport.scale }}>
        <EditorOptionsButton onClick={() => setEditorOptionsOpen(true)} scale={uiViewport.scale}
          top={uiViewport.safeInsets.top - workspaceTop} right={uiViewport.safeInsets.right - viewportRight}
          leading={<EditorPlaybackClock getSeconds={vm.getPlaybackClockSec} maxSeconds={vm.audioDurationSec} />}
          leadingBottom={ORIGINAL_HEADER_TITLE_BOTTOM} />
        <EditorBpmDialog open={bpmEditOpen} title="BPM 编辑" value={bpmEditTarget?.bpm ?? 0}
          onClose={() => setBpmEditOpen(false)}
          onConfirm={value => { if (bpmEditTarget) vm.setBpmEventValue(bpmEditTarget.selectionId, value); }}
          onDelete={() => { if (bpmEditTarget) deleteTimelineEvent({ kind: "bpm", key: bpmEditTarget.key }); }}
          deleteDisabled={bpmEditTarget?.isBase ?? false} />
        <EditorSvDialog open={svEditOpen} title="SV 编辑" value={svEditTarget?.value ?? 1}
          timingGroup={svEditTarget?.timingGroup ?? GLOBAL_TIMING_GROUP_ID} timingGroups={vm.timingGroupIds}
          onClose={() => setSvEditOpen(false)} onAddTimingGroup={vm.addTimingGroup}
          onConfirm={(value, timingGroup) => { if (svEditTarget) vm.updateSvEvent(svEditTarget.id, value, timingGroup); }}
          onDelete={() => { if (svEditTarget) deleteTimelineEvent({ kind: "sv", key: svEditTarget.id }); }} />
        <SidebarPanel isSkinReady={isSkinReady} isToolArmed={isToolArmed} tool={tool}
          onPlay={sidebarPlay}
          onPreview={sidebarPreview}
          applyToolFromPalette={applyToolFromPalette} bpm={vm.activeBpmValue} onApplyBpm={vm.updateActiveBpm}
          onArmBpmTool={vm.applyBpmToolFromPalette} onArmLongTool={vm.applyLongToolFromPalette} onArmMiddleTool={vm.applyMiddleToolFromPalette} onDisarmTool={() => vm.setIsToolArmed(false)} getSpriteLayers={getPaletteSpriteLayers}
          getSpriteAspectRatio={getPaletteSpriteAspectRatio} renderSpriteStack={renderPaletteSpriteStack}
          historyTools={historyTools} mirrorTools={mirrorTools} directionalEnabled={vm.editorMode !== "basic"} longBodyTexture={longBodyTexture} curveSlideLineTexture={curveSlideLineTexture}
          curve={sidebarCurve}
          sv={vm.isExGarupaEnabled ? { value: vm.toolSvValue, timingGroup: vm.toolSvTimingGroup, timingGroups: vm.timingGroupIds,
            onArm: vm.applySvToolFromPalette, onApply: vm.applySvToolSetting, onAddTimingGroup: vm.addTimingGroup } : undefined} />
        <section ref={editorRegionRef} className="editor-viewport-region"
          style={{ "--editor-edge-softness": `${EDITOR_EDGE_SOFTNESS * uiViewport.scale}px`,
            marginTop: -editorRegionBleed.top, marginBottom: -editorRegionBleed.bottom } as CSSProperties}>
          <div className="editor-judge-anchor" aria-hidden="true" style={{ bottom: judgeInsetBottom }} />
          {isSkinReady && <div className="editor-track-viewport" aria-hidden="true"
            style={{ top: -viewportTop, height: viewportHeight }}>
            <div className="editor-track-zone-background" style={{ left: `calc(50% - ${vm.trackZoneWidth / 2}px + ${vm.trackZoneShiftX}px)`,
              width: vm.trackZoneWidth }} />
            {vm.settings.laneCount > 7 && <EditorLaneRangeGuides laneCount={vm.settings.laneCount}
              left={`calc(50% - ${vm.trackZoneWidth / 2}px + ${vm.trackZoneShiftX}px)`} width={vm.trackZoneWidth} />}
            <div className="editor-track-guides" style={{ width: boardWidth, left: vm.trackZoneShiftX }}>
              {flatTrackLane && <div className="editor-track-lane-tile" style={{ backgroundImage: `url("${flatTrackLane}")`, width: FIELD_WIDTH_LANES * LANE_WIDTH }} />}
            </div>
          </div>}
          {isPlaybackPlaying && <div className="playback-line" style={{ bottom: judgeInsetBottom + vm.playbackLinePositionPercent / 100 * (judgeBottomY - editorRegionBleed.top),
            left: `calc(50% - ${vm.trackZoneWidth / 2}px + ${vm.trackZoneShiftX}px)`, width: vm.trackZoneWidth }} />}
          {isSkinReady ? (
            <div
              className={`playfield-scroll ${selectionDrag?.isDragging ? "is-marquee-selecting" : ""} ${isToolArmed ? "is-tool-armed" : ""}`}
              ref={vm.attachViewport}
              style={{ top: -viewportTop, height: viewportHeight }}
              onScroll={handlePlayfieldScrollInternal}
              tabIndex={0}
              onMouseDown={(event) => {
                event.currentTarget.focus({ preventScroll: true });
              }}
            >
              <div
                className={`playfield-host ${selectionDrag?.isDragging ? "is-marquee-selecting" : ""} ${isSlideBuilding ? "is-slide-building" : ""} ${isToolArmed ? "is-tool-armed" : ""} canvas-render-backend`}
                style={{ height: scaledScrollContentHeight + judgeInsetBottom }}
                onMouseDown={handleBoardMouseDown}
                onMouseMove={handleBoardMouseMove}
                onMouseLeave={(event) => {
                  hoveredNoteIdRef.current = null;
                  selectionOverlayRef.current?.setHoverFrame(null);
                  handleBoardMouseLeave(event);
                }}
                onContextMenu={handleBoardContextMenu}
                // Event bubbles drawn on the canvas are the events' hit areas; only the BPM and SV tools act on them.
                onMouseDownCapture={(event) => {
                  const hit = eventBubbleHitAt(event);
                  if (!hit) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.button === 0) eventBubbleHandlers.press(hit);
                }}
                onClickCapture={(event) => {
                  if (eventBubbleHitAt(event)) event.stopPropagation();
                }}
                onContextMenuCapture={(event) => {
                  const hit = eventBubbleHitAt(event);
                  if (!hit) return;
                  event.preventDefault();
                  event.stopPropagation();
                  eventBubbleHandlers.remove(hit);
                }}
                onMouseMoveCapture={(event) => {
                  updateGridHoverFrame(event);
                  const hovering = eventBubbleHitAt(event) !== null;
                  if (event.currentTarget.classList.contains("is-over-event-bubble") !== hovering) {
                    event.currentTarget.classList.toggle("is-over-event-bubble", hovering);
                  }
                }}
              >
                <div
                  className="playfield-board-scale-layer"
                  style={{
                    width: scaledBoardWidth,
                    height: scaledScrollContentHeight,
                    // The host centres this layer with its margin, so twice the shift moves the board by the shift.
                    marginLeft: 2 * vm.trackZoneShiftX,
                  } as CSSProperties}
                >
                  <div
                    className="playfield-board-visual-layer"
                    style={{
                      width: boardWidth,
                      height: effectiveScrollContentHeight,
                    }}
                  >
                <div
                  className="bpm-overlay-layer"
                  style={{
                    height: effectiveScrollContentHeight,
                    "--timeline-label-x": `${timelineLabelX}px`,
                  } as CSSProperties}
                >
                                      <>
                      <div
                        ref={canvasBpmCursorPreviewRef}
                        className="bpm-marker bpm-preview bpm-preview-cursor"
                        style={{ display: "none" }}
                        aria-hidden="true"
                      >
                        <div className="bpm-line" />
                      </div>
                      <div
                        ref={canvasBpmSnapPreviewRef}
                        className="bpm-marker bpm-preview bpm-preview-snap"
                        style={{ display: "none" }}
                        aria-hidden="true"
                      >
                        <div className="bpm-line" />
                      </div>
                      <div
                        ref={canvasSvCursorPreviewRef}
                        className="bpm-marker sv-marker sv-preview sv-preview-cursor"
                        style={{ display: "none" }}
                        aria-hidden="true"
                      >
                        <div className="bpm-line sv-line" />
                      </div>
                      <div
                        ref={canvasSvSnapPreviewRef}
                        className="bpm-marker sv-marker sv-preview sv-preview-snap"
                        style={{ display: "none" }}
                        aria-hidden="true"
                      >
                        <div className="bpm-line sv-line" />
                      </div>
                    </>
                  
                  {isPasteToolSelected && pastePreviewVisuals.bpmYPositions.map((y: number, index: number) => (
                    <div
                      key={`paste-bpm-preview-${index}-${y.toFixed(3)}`}
                      className="bpm-marker bpm-preview bpm-preview-copy"
                      style={{ top: y }}
                      aria-hidden="true"
                    >
                      <div className="bpm-line" />
                    </div>
                  ))}
                  {isPasteToolSelected && pastePreviewVisuals.svYPositions.map((y: number, index: number) => (
                    <div
                      key={`paste-sv-preview-${index}-${y.toFixed(3)}`}
                      className="bpm-marker sv-marker sv-preview sv-preview-copy"
                      style={{ top: y }}
                      aria-hidden="true"
                    >
                      <div className="bpm-line sv-line" />
                    </div>
                  ))}
                  {isPlayToolSelected && !isPlaybackPlaying && (
                    <div ref={playbackGuideHostRef} className="playback-guide" style={{ display: "none" }}>
                      <div className="playback-guide-line" />
                      <div ref={playbackGuideLabelRef} className="playback-guide-label" aria-hidden="true" />
                    </div>
                  )}
                  {isPlayToolSelected && isPlaybackPlaying && (
                    <div ref={playbackRuntimeLineRef} className="playback-runtime-line-host" style={{ display: "none" }}>
                      <div className="playback-runtime-line" />
                    </div>
                  )}
                </div>
                <div
                  ref={playfieldBoardRef}
                  className={`playfield-board viewport-track-owned canvas-render-backend`}
                  style={{ width: boardWidth, height: effectiveScrollContentHeight, ...noteIconStyle } as CSSProperties}
                  onClick={handleBoardClick}
                  onContextMenu={handleBoardContextMenu}
                >
                                      <>
                      <canvas
                        ref={playfieldTrackCanvasRef}
                        className="playfield-canvas-layer playfield-canvas-track-layer"
                        width={1}
                        height={1}
                        aria-hidden="true"
                      />
                      <canvas
                        ref={playfieldNoteCanvasRef}
                        className="playfield-canvas-layer playfield-canvas-note-layer"
                        width={1}
                        height={1}
                        aria-hidden="true"
                      />
                                          </>
                  
                  
                  <div className="slide-chain-layer">
                    <SlideSegmentsLayer render={renderSlideSegments} />
                  </div>


                  <div className={`note-layer${isToolArmed && tool === "curve" ? " curve-armed" : ""}`} style={hiddenMarkPaintStyle}>
                    {renderedNoteButtons}

                    {canvasPreviewType && canvasPreviewSpec && canvasPreviewLayers && canvasPreviewHasSprite && (
                      <>
                        <div
                          ref={canvasNoteCursorPreviewRef}
                          className={`${canvasPreviewTokenClassName} preview-cursor`}
                          style={canvasPreviewTokenStyle}
                          aria-hidden="true"
                        >
                          {canvasPreviewHiddenMark ?? (canvasPreviewIsDirectional
                            ? renderDirectionalSprite(
                                canvasPreviewType as "directional_flick_left" | "directional_flick_right",
                                canvasPreviewLayers,
                                canvasPreviewSpanLanes,
                                canvasPreviewSpec.label,
                              )
                            : renderSpriteStack(
                                canvasPreviewLayers,
                                canvasPreviewSpec.label,
                                "note-sprite-stack",
                                canvasPreviewAspectRatio,
                              ))}
                        </div>
                        <div
                          ref={canvasNoteSnapPreviewRef}
                          className={`${canvasPreviewTokenClassName} preview-snap`}
                          style={canvasPreviewTokenStyle}
                          data-color-assist="off"
                          aria-hidden="true"
                        >
                          {canvasPreviewHiddenMark ?? (canvasPreviewIsDirectional
                            ? renderDirectionalSprite(
                                canvasPreviewType as "directional_flick_left" | "directional_flick_right",
                                canvasPreviewLayers,
                                canvasPreviewSpanLanes,
                                canvasPreviewSpec.label,
                              )
                            : (
                              canvasPreviewType === "single" && isColorAssistEnabled && canvasPreviewSingleAssistLayers?.base
                                ? (
                                  <>
                                    <span className="preview-snap-normal-layer">
                                      {renderSpriteStack(
                                        canvasPreviewLayers,
                                        canvasPreviewSpec.label,
                                        "note-sprite-stack",
                                        canvasPreviewAspectRatio,
                                      )}
                                    </span>
                                    <span className="preview-snap-assist-layer">
                                      {renderSpriteStack(
                                        canvasPreviewSingleAssistLayers,
                                        canvasPreviewSpec.label,
                                        "note-sprite-stack",
                                        getSpriteAspectRatio(canvasPreviewSingleAssistLayers),
                                      )}
                                    </span>
                                  </>
                                )
                                : renderSpriteStack(
                                    canvasPreviewLayers,
                                    canvasPreviewSpec.label,
                                    "note-sprite-stack",
                                    canvasPreviewAspectRatio,
                                  )
                            ))}
                        </div>
                        <div
                          ref={canvasNoteReplacePreviewRef}
                          className={`${canvasPreviewTokenClassName} preview-snap`}
                          style={canvasNoteReplaceTokenStyle}
                          aria-hidden="true"
                        >
                          {canvasPreviewHiddenMark ?? (canvasPreviewIsDirectional
                            ? renderDirectionalSprite(
                                canvasPreviewType as "directional_flick_left" | "directional_flick_right",
                                canvasPreviewLayers,
                                canvasPreviewSpanLanes,
                                `${canvasPreviewSpec.label} replace`,
                              )
                            : renderSpriteStack(
                                canvasPreviewLayers,
                                canvasPreviewSpec.label,
                                "note-sprite-stack",
                                canvasPreviewAspectRatio,
                              ))}
                        </div>
                        {canvasPreviewIsDirectional && (
                          <div
                            ref={canvasDirectionalWidenPreviewRef}
                            className={`${canvasPreviewTokenClassName} preview-snap`}
                            style={canvasDirectionalWidenTokenStyle}
                            aria-hidden="true"
                          >
                            {renderDirectionalSprite(
                              canvasPreviewType as "directional_flick_left" | "directional_flick_right",
                              canvasPreviewLayers,
                              1,
                              `${canvasPreviewSpec.label} widen`,
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {isPasteToolSelected && pastePreviewVisuals.notes.map((note: any) => {
                      const tokenWidth = note.isDirectional
                        ? note.spanLanes * LANE_WIDTH
                        : (
                          note.spanLanes > 1
                            ? editorNoteTokenWidth(note.spanLanes, false, LANE_WIDTH, noteVisualScale)
                            : undefined
                        );
                      const tokenHeight = editorNoteHeight(LANE_WIDTH, noteVisualScale);
                      const style: CSSProperties = {
                        left: note.x,
                        top: note.y,
                        ...(tokenWidth
                          ? ({
                              width: tokenWidth,
                              "--lane-width": `${LANE_WIDTH}px`,
                              "--directional-base-width": `${directionalBaseWidthPx}px`,
                              "--note-visual-scale": `${noteVisualScale}`,
                              "--note-sprite-height": `${tokenHeight}px`,
                              "--sprite-aspect-ratio": `${note.aspectRatio}`,
                            } as CSSProperties)
                          : ({
                              "--directional-base-width": `${directionalBaseWidthPx}px`,
                              "--note-visual-scale": `${noteVisualScale}`,
                              "--note-sprite-height": `${tokenHeight}px`,
                              "--sprite-aspect-ratio": `${note.aspectRatio}`,
                            } as CSSProperties)),
                      };
                      return (
                        <div
                          key={`paste-preview-note-${note.key}`}
                          className={`note-token has-sprite preview-token preview-snap paste-preview-token ${note.layers.overlay ? "composite" : ""} ${note.isDirectional ? "directional" : ""}`}
                          style={style}
                          aria-hidden="true"
                        >
                          {note.isDirectional
                            ? renderDirectionalSprite(
                                note.type as "directional_flick_left" | "directional_flick_right",
                                note.layers,
                                note.spanLanes,
                                note.label,
                              )
                            : renderSpriteStack(
                                note.layers,
                                note.label,
                                "note-sprite-stack",
                                note.aspectRatio,
                              )}
                        </div>
                      );
                    })}
                  </div>

                </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="playfield-loading">
              {isSkinApplying ? "皮肤下载中，完成后渲染可视化谱面。" : "当前皮肤不可用，无法渲染可视化谱面。"}
            </div>
          )}

        </section>
        <EditorSelectionOverlay ref={selectionOverlayRef} scrollRef={playfieldRef} boardRef={playfieldBoardRef}
          frame={selectionFrame}
          resize={canResizeSelection ? {
            hitWidth: SELECTION_RESIZE_HIT_WIDTH * uiViewport.scale,
            gripWidth: SELECTION_RESIZE_GRIP_WIDTH * uiViewport.scale,
            gripMaxHeight: SELECTION_RESIZE_GRIP_MAX_HEIGHT * uiViewport.scale,
            gripScale: SELECTION_RESIZE_GRIP_SCALE,
            gripInset: SELECTION_FRAME_MARGIN * uiViewport.scale,
            draggingEdge: selectionWidthDrag?.edge ?? null,
            // The notes are drawn at the dragged width as it changes; release commits it.
            onDrag(edge, deltaX) { previewSelectionWidth(edge, Math.round(deltaX / LANE_WIDTH)); },
            onEnd() { endSelectionWidth(); },
            onCancel() { cancelSelectionWidth(); },
          } : null}
          marquee={selectionDrag?.isDragging ? {
            left: Math.min(selectionDrag.startX, selectionDrag.currentX),
            top: Math.min(selectionDrag.startY, selectionDrag.currentY),
            width: Math.abs(selectionDrag.currentX - selectionDrag.startX),
            height: Math.abs(selectionDrag.currentY - selectionDrag.startY),
          } : null} />
        <EditorMinimap notes={vm.minimapNotes} segments={vm.minimapSegments} duration={vm.minimapDuration}
          laneCount={vm.settings.laneCount} axis={vm.minimapAxis} viewport={playfieldRef}
          getImage={vm.minimapGetImage} skinAssets={vm.minimapSkinAssets} resourcesVersion={vm.minimapResourceVersion}
          noteScale={noteVisualScale} width={vm.minimapWidth} top={0} />
        <EditorControlColumn width={ORIGINAL_HEADER_MENU_BOUNDS.width * uiViewport.scale}
          isPlaying={isPlaybackPlaying} onTogglePlayback={vm.togglePlaybackFromCurrentPosition}
          speed={{ label: vm.playbackSpeedLabel, canSlower: vm.canStepPlaybackSpeedDown,
            canFaster: vm.canStepPlaybackSpeedUp, step: vm.stepPlaybackSpeed }}
          // Half the gap between the header menu button's bottom and the workspace top; the play button sits that
          // whole gap higher, opening the space above the speed stepper.
          speedGap={headerToWorkspaceGap / 2} playRaise={headerToWorkspaceGap}
          // The SV view switch (ExGarupa, where SV exists) above the beat division, at the column's foot.
          bottom={{ inset: RIGHT_COLUMN_FOOT_INSET, node: <>
            {vm.isExGarupaEnabled && <SidebarActionButton label={vm.isSvPreviewEnabled ? "SV 开" : "SV 关"}
              ariaLabel={vm.isSvPreviewEnabled ? "SV 开" : "SV 关"}
              width={ORIGINAL_HEADER_MENU_BOUNDS.width} labelInset={RIGHT_COLUMN_LABEL_INSET} on={vm.isSvPreviewEnabled}
              onClick={() => vm.setIsSvPreviewEnabled(!vm.isSvPreviewEnabled)} />}
            <EditorBeatDivisionButton value={vm.settings.timeSignatureDenominator} onSave={vm.setBeatDivision}
              width={ORIGINAL_HEADER_MENU_BOUNDS.width} labelInset={RIGHT_COLUMN_LABEL_INSET}
              label={`1/${vm.settings.timeSignatureDenominator}`} />
          </> }}
 />
        <EditorNotePropertiesDialog open={notePropertiesOpen} properties={vm.selectedNoteProperties}
          laneRange={vm.laneRange}
          timingGroups={vm.isExGarupaEnabled ? vm.timingGroupIds : undefined} onAddTimingGroup={vm.addTimingGroup}
          onClose={() => setNotePropertiesOpen(false)} onSave={vm.applyNoteProperties} />
      </section>

      </OriginalPageSwitch>

      <BestdoriLoginModal
        open={isBestdoriLoginOpen}
        accountUsername={bestdoriUsernameDisplay}
        accountNickname={bestdoriNicknameDisplay}
        onLogout={() => void logoutBestdori()}
        username={bestdoriLoginUsernameInput}
        password={bestdoriLoginPasswordInput}
        submitting={bestdoriLoginSubmitting}
        errorMessage={bestdoriLoginErrorMessage}
        onUsernameChange={setBestdoriLoginUsernameInput}
        onPasswordChange={setBestdoriLoginPasswordInput}
        onSubmit={() => void submitBestdoriLogin()}
        onClose={closeBestdoriLoginModal}
      />

      <LiveInProgressCover song={liveSong} jacketUrl={vm.coverImageSrc} />
      <ResourceLoadErrorDialog open={launchFailed} onConfirm={() => setLaunchFailed(false)} />
      <MvDownloadDialog open={mvDownloadAnswer !== null} onCancel={() => answerMvDownload(false)}
        onConfirm={() => answerMvDownload(true)} />

      <AppSettingsModal
        onReturnToTitle={returnToTitle ? handleReturnToTitle : undefined}
        onNewProject={startNewProject}
        optionsOpen={preparationSettingsOpen} onOptionsClose={() => setPreparationSettingsOpen(false)}
        resourcesReady={vm.settingsResourcesReady}
        onSettingsError={message => vm.showDialog(`设置操作失败：${message}`, "error")}
        onSimulator={openSimulatorWindow} onSkinLibrary={openSkinSettings} onAccount={openBestdoriLoginModal}
        open={isAppSettingsOpen}
        onClose={() => setIsAppSettingsOpen(false)}
        windowPresetId={windowPresetId}
        playbackWindowPresetId={playbackWindowPresetId}
        playbackFps={playbackFps}
        playbackMvMode={playbackMvMode}
        playbackMvAlphaPercent={playbackMvAlphaPercent}
        playbackAllPerfectStatusDisplayMode={playbackAllPerfectStatusDisplayMode}
        windowPresets={WINDOW_SIZE_PRESETS}
        onWindowPresetIdChange={setWindowPresetId}
        onPlaybackWindowPresetIdChange={setPlaybackWindowPresetId}
        onPlaybackFpsChange={setPlaybackFps}
        onPlaybackMvModeChange={setPlaybackMvMode}
        onPlaybackMvAlphaPercentChange={setPlaybackMvAlphaPercent}
        onPlaybackAllPerfectStatusDisplayModeChange={setPlaybackAllPerfectStatusDisplayMode}
        onApplyWindowPreset={presetId => void applyWindowPresetById(presetId)}
        optionSettings={appOptionSettings}
        onApplyOptionSettings={applyAppOptionSettings}
      />

      <EditorOptionsDrawer open={isEditorOptionsOpen} onClose={() => setEditorOptionsOpen(false)}
        mode={vm.editorMode} onModeChange={mode => { void vm.setEditorMode(mode); }}
        habahiro={isHabahiroEnabled} onHabahiroChange={value => { void vm.setHabahiroMode(value); }}
        laneCount={vm.settings.laneCount} onLaneCountChange={vm.setLaneCount}
        timingGroupView={vm.isExGarupaEnabled ? { value: vm.timingGroupView, groups: vm.timingGroupIds,
          onChange: vm.setTimingGroupView } : undefined}
        onSongInformation={() => { setEditorOptionsOpen(false); setPageStack(stack => openDetailPage(stack, "song")); }}
        onEditSongInformation={() => { setEditorOptionsOpen(false); openSongEdit(false, stack => openDetailPage(stack, "songEdit")); }}
        onExportProject={() => { setEditorOptionsOpen(false); void vm.projectFiles.save(); }} exportBusy={vm.projectFiles.busy}
        onExportBestdoriV2={() => { setEditorOptionsOpen(false); void exportBestdoriV2ToFile(); }}
        onEditCode={() => { setEditorOptionsOpen(false); openImportJsonModal(); }}
        onPublishTestServer={() => { setEditorOptionsOpen(false); setConfirmingTestServer(true); }}
        onPublishBestdori={() => { setEditorOptionsOpen(false); setPublishTarget("upload"); downloadJson(); }}
        onPublishNotGarupa={() => { setEditorOptionsOpen(false); setPublishTarget("upload-server"); downloadJson(); }} />
      <OriginalChoiceDialog open={confirmingTestServer} title="发布到测试服" message="是否将当前谱面发布到测试服？"
        onClose={() => setConfirmingTestServer(false)} choices={[
          { label: "取消", action: () => setConfirmingTestServer(false) },
          { label: "确定", tone: "pink", action: () => { setConfirmingTestServer(false); void applyUploadTestServerChart(); } },
        ]} />
      <OriginalChoiceDialog open={confirmingCreate} title="创建工程" message="是否创建新的谱面工程？"
        onClose={() => setConfirmingCreate(false)} choices={[
          { label: "取消", action: () => setConfirmingCreate(false) },
          { label: "确定", tone: "pink", action: () => { setConfirmingCreate(false); openSongCreate(); } },
        ]} />
      <OriginalChoiceDialog open={confirmingCancelCreate} title="创建工程" message="是否取消创建工程？"
        onClose={() => setConfirmingCancelCreate(false)} choices={[
          { label: "返回", action: () => setConfirmingCancelCreate(false) },
          { label: "确定", tone: "pink", action: () => { setConfirmingCancelCreate(false); cancelSongCreate(); } },
        ]} />
      <OriginalChoiceDialog open={confirmingReplaceProject} title="新建工程"
        message="已有一个进行中的谱面，继续将会删除之前的工程。是否继续？"
        onClose={() => setConfirmingReplaceProject(false)} choices={[
          { label: "取消", action: () => setConfirmingReplaceProject(false) },
          { label: "确定", tone: "pink", action: () => { setConfirmingReplaceProject(false); openSongCreate(); } },
        ]} />
      <SkinSettingsModal
        open={isSkinSettingsOpen}
        onClose={() => setIsSkinSettingsOpen(false)}
        pendingSkinSelection={pendingSkinSelection}
        catalogStatus={bestdoriCatalogStatus}
        rhythmTypeTitle={isHabahiroEnabled ? "节奏图示样式（幅广）" : "节奏图示样式"}
        rhythmCatalogKind={isHabahiroEnabled ? "habahiroRhythm" : "rhythm"}
        onRhythmTypeChange={(value) =>
          setPendingSkinSelection((current: any) => {
            const kind = isHabahiroEnabled ? "habahiroRhythm" : "rhythm";
            const resource = catalogResource(kind, value);
            return normalizeSkinSelection({
              ...current,
              rhythmType: value,
              rhythmRipName: resource?.id ?? current.rhythmRipName,
              rhythmServer: resource?.server ?? current.rhythmServer,
            });
          })
        }
        onDirectionalTypeChange={(value) =>
          setPendingSkinSelection((current: any) => {
            const resource = catalogResource("directional", value);
            return normalizeSkinSelection({
              ...current,
              directionalType: value,
              directionalRipName: resource?.id ?? current.directionalRipName,
              directionalServer: resource?.server ?? current.directionalServer,
            });
          })
        }
        onRhythmSeTypeChange={(value) =>
          setPendingSkinSelection((current: any) => {
            const resource = catalogResource("rhythmSe", value);
            return normalizeSkinSelection({
              ...current,
              rhythmSeType: value,
              rhythmSeRipName: resource?.id ?? current.rhythmSeRipName,
              rhythmSeServer: resource?.server ?? current.rhythmSeServer,
            });
          })
        }
        onDirectionalSeTypeChange={(value) =>
          setPendingSkinSelection((current: any) => {
            const resource = catalogResource("directionalSe", value);
            return normalizeSkinSelection({
              ...current,
              directionalSeType: value,
              directionalSeRipName: resource?.id ?? current.directionalSeRipName,
              directionalSeServer: resource?.server ?? current.directionalSeServer,
            });
          })
        }
        onBgTypeChange={(value) =>
          setPendingSkinSelection((current: any) => {
            const resource = catalogResource("bg", value);
            return normalizeSkinSelection({
              ...current,
              bgType: value,
              bgSkinRipName: resource?.id ?? current.bgSkinRipName,
              bgSkinServer: resource?.server ?? current.bgSkinServer,
            });
          })
        }
        onFieldTypeChange={(value) =>
          setPendingSkinSelection((current: any) => {
            const resource = catalogResource("field", value);
            return normalizeSkinSelection({
              ...current,
              fieldType: value,
              fieldSkinRipName: resource?.id ?? current.fieldSkinRipName,
              fieldSkinServer: resource?.server ?? current.fieldSkinServer,
            });
          })
        }
        onJudgeTypeChange={(value) =>
          setPendingSkinSelection((current: any) => {
            const resource = catalogResource("judge", value);
            return normalizeSkinSelection({
              ...current,
              judgeType: value,
              judgeSkinRipName: resource?.id ?? current.judgeSkinRipName,
              judgeSkinServer: resource?.server ?? current.judgeSkinServer,
            });
          })
        }
        // HABAHIRO locks the note skin to the HABAHIRO skin the mode applied.
        rhythmSkinTypes={isHabahiroEnabled ? [pendingSkinSelection.rhythmType] : rhythmSkinTypes}
        directionalSkinTypes={directionalSkinTypes}
        rhythmSeSkinTypes={rhythmSeSkinTypes}
        directionalSeSkinTypes={directionalSeSkinTypes}
        bgSkinTypes={bgSkinTypes}
        fieldSkinTypes={fieldSkinTypes}
        judgeSkinTypes={judgeSkinTypes}
        formatTypeLabel={formatTypeLabel}
        isSkinApplying={isSkinApplying}
        onApplySkinSelection={() => void applyBestdoriSkinSelection(pendingSkinSelection, true)}
      />

      <input ref={vm.projectFiles.input} type="file" accept=".gcp" hidden onChange={vm.projectFiles.open} />
      {/* Opened from the drawer's 发布到 Bestdori or 发布到 NotGarupa: the description and tags, then 上传. */}
      <ExportJsonModal only={{ tab: publishTarget, title: publishTarget === "upload" ? "发布到 Bestdori" : "发布到 NotGarupa" }}
        onSaveProject={() => void vm.projectFiles.save()}
        projectBusy={vm.projectFiles.busy}
        open={isExportJsonModalOpen}
        jsonText={garupaChartJsonText}
        uploadCommunityPostContent={uploadCommunityPostContent}
        uploadChartAuthor={uploadChartAuthor}
        onUploadChartAuthorChange={setUploadChartAuthor}
        uploadCommunityPostTags={uploadCommunityPostTags}
        onClose={closeExportJsonModal}
        onSaveAs={() => void saveExportJsonToSelectedPath()}
        onExportBestdoriV2={() => void exportBestdoriV2ToFile()}
        onUploadCommunityPostContentChange={setUploadCommunityPostContent}
        onUploadCommunityPostTagsChange={setUploadCommunityPostTags}
        onApplyUploadCommunityChart={() => void applyUploadCommunityChart()}
        onApplyUploadNotGarupaServerChart={() => void applyUploadNotGarupaServerChart()}
        onApplyUploadTestServerChart={() => void applyUploadTestServerChart()}
      />

      <ChartCodeEditModal open={isImportJsonModalOpen} text={importJsonText} onTextChange={setImportJsonText}
        onImportBestdoriV2={triggerBestdoriV2Import} onApply={applyImportJsonText} onClose={closeImportJsonModal} />

      <OverlayDialogModal
        dialog={overlayDialog}
        onConfirm={confirmOverlayDialog}
        onCancel={cancelOverlayDialog}
      />

      <DownloadProgressModal
        visible={downloadProgress?.visible === true}
        blocking={downloadProgress?.blocking === true}
        percent={downloadProgress?.percent ?? 0}
        message={downloadProgress?.message ?? ""}
        logs={Array.isArray(downloadProgress?.logs) ? downloadProgress.logs : []}
      />
    </main>
    </OriginalUiSoundProvider>
  );
}
