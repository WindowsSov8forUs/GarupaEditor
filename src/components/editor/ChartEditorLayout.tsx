import { AppSettingsModal } from "../AppSettingsModal";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { CommandBar } from "../CommandBar";
import { ExportJsonModal } from "../ExportJsonModal";
import { ImportJsonModal } from "../ImportJsonModal";
import { MetadataEditorModal } from "../MetadataEditorModal";
import { DownloadProgressModal } from "../DownloadProgressModal";
import { OverlayDialogModal } from "../OverlayDialogModal";
import { SkinSettingsModal } from "../SkinSettingsModal";
import { SidebarPanel } from "./SidebarPanel";
import { TimelineStrip } from "./TimelineStrip";

type ChartEditorLayoutProps = {
  vm: any;
};

const CANVAS_INTERACTION_OVERSCAN_PX = 240;
const CANVAS_INTERACTION_SNAP_PX = 96;

function isHalfBeatAligned(value: number): boolean {
  if (!Number.isFinite(value)) {
    return true;
  }
  const snapped = Math.round(value * 2) / 2;
  return Math.abs(snapped - value) <= 1e-6;
}

export function ChartEditorLayout({ vm }: ChartEditorLayoutProps) {
  const {
    jsonImportRef,
    handleJsonImport,
    triggerJsonImport,
    openImportJsonModal,
    downloadJson,
    openStaticRenderWindow,
    openSimulatorWindow,
    exportJson,
    isImportJsonModalOpen,
    importJsonModalLevel,
    importJsonText,
    importBestdoriV2Text,
    setImportJsonText,
    setImportBestdoriV2Text,
    applyImportJsonText,
    applyImportBestdoriV2Text,
    closeImportJsonModal,
    backToImportJsonModalChartLevel,
    openImportJsonModalBestdoriV2Level,
    isExportJsonModalOpen,
    closeExportJsonModal,
    saveExportJsonToSelectedPath,
    exportBestdoriV2ToClipboard,
    overlayDialog,
    confirmOverlayDialog,
    cancelOverlayDialog,
    openAppSettings,
    openSkinSettings,
    workspaceRef,
    sidebarWidth,
    metadata,
    coverImageSrc,
    audioDurationSec,
    visibleNoteCount,
    openMetadataEditor,
    isCoverLoadFailed,
    setIsCoverLoadFailed,
    isSkinReady,
    isToolArmed,
    tool,
    applyToolFromPalette,
    applyBpmToolFromPalette,
    applyCopyToolFromPalette,
    applyPasteToolFromPalette,
    onTogglePlayTool,
    isPlayToolSelected,
    isPlaybackPlaying,
    getPlaybackNowLabel,
    playbackTotalLabel,
    playbackSpeedLabel,
    playbackVolumeLabel,
    playbackPositionLabel,
    isPlaybackFollowEnabled,
    setPlaybackFollowEnabled,
    canStepPlaybackSpeedDown,
    canStepPlaybackSpeedUp,
    canStepPlaybackVolumeDown,
    canStepPlaybackVolumeUp,
    canStepPlaybackPositionDown,
    canStepPlaybackPositionUp,
    stepPlaybackSpeed,
    stepPlaybackVolume,
    stepPlaybackPosition,
    getPaletteSpriteLayers,
    getPaletteSpriteAspectRatio,
    renderPaletteSpriteStack,
    getSpriteLayers,
    getSpriteAspectRatio,
    renderSpriteStack,
    clearAllSelections,
    setStatusMessage,
    undoLastNote,
    redoLastNote,
    canUndoLastOperation,
    canRedoLastOperation,
    mirrorSelectedNotes,
    canMirrorSelection,
    clearAllNotes,
    notes,
    noteById,
    mirrorActionIcon,
    undoActionIcon,
    copyActionIcon,
    pasteActionIcon,
    clearActionIcon,
    applyActionIcon,
    showBeatSetting,
    isBeatSettingLocked,
    beatInputText,
    setBeatInputText,
    beatInputEditingRef,
    commitBeatInput,
    showBpmSetting,
    bpmInputText,
    setBpmInputText,
    bpmInputEditingRef,
    commitBpmInput,
    showLaneSetting,
    isLaneSettingLocked,
    stepActiveLane,
    laneInputText,
    setLaneInputText,
    laneInputEditingRef,
    commitLaneInput,
    showWidthSetting,
    stepActiveWidth,
    widthInputText,
    setWidthInputText,
    widthInputEditingRef,
    commitWidthInput,
    showDirectionSetting,
    activeDirectionalValue,
    setActiveDirectionalType,
    hideSettingsPanel,
    showSlideSegmentSetting,
    slideShape,
    slideCurveType,
    slidePrecision,
    slideDivision,
    slideVibration,
    slideVibrationInputText,
    setSlideVibrationInputText,
    slideVibrationInputEditingRef,
    commitSlideVibrationInput,
    isSlideCurveTypeDisabled,
    isSlideDivisionDisabled,
    setSlideShape,
    setSlideCurveType,
    stepSlidePrecision,
    stepSlideDivision,
    stepSlideVibration,
    canStepSlidePrecisionDown,
    canStepSlidePrecisionUp,
    canStepSlideDivisionDown,
    canStepSlideDivisionUp,
    canDeleteSelection,
    canApplyLongLineSettings,
    applyCurrentLongLineSettings,
    deleteCurrentSelection,
    startSidebarResize,
    settings,
    applySettingsPatch,
    playfieldRef,
    handlePlayfieldScroll,
    selectionDrag,
    isSlideBuilding,
    handleBoardMouseDown,
    handleBoardMouseMove,
    handleBoardMouseLeave,
    handleBoardContextMenu,
    boardHeight,
    renderBackendMode,
    renderBpmLines,
    cursorPreview,
    cursorPreviewRef,
    resolveDirectionalWidenPreviewAt,
    resolveNoteReplacePreviewAt,
    beatToY,
    playfieldTrackCanvasRef,
    playfieldNoteCanvasRef,
    playfieldPlaybackCanvasRef,
    playfieldBoardRef,
    boardWidth,
    handleBoardClick,
    renderLaneGuides,
    renderGridLines,
    renderSimultaneousSegments,
    renderSlideSegments,
    slideBuildCommittedGuideLines,
    slideBuildGuideLine,
    NOTE_SPECS,
    resolvePlacedNoteLayers,
    isDirectionalNoteType,
    getNoteSpanLanes,
    LANE_WIDTH,
    getRenderedNotePlacement,
    laneToColumn,
    formatBeat,
    selectedNoteIdSet,
    slideBuildSelectedIdSet,
    slideBuildRef,
    appendSlideBuildNote,
    setSlideBuildMode,
    startSlideBuildFromSeedNote,
    beginSelectedNotesMove,
    suppressNextNoteClickRef,
    toggleSelectedNote,
    clearSelectedBpmEvents,
    setSelectedBpmEventId,
    applyToolToPlacedNote,
    finalizeSlideBuild,
    cancelSlideBuild,
    deleteSelectedNotes,
    deleteNote,
    toolDirectionalWidth,
    toolRhythmWidth,
    normalizeDirectionalWidth,
    normalizeRhythmWidth,
    isRhythmWidthEditableType,
    isHabahiroEnabled,
    renderDirectionalSprite,
    statusMessage,
    isSkinApplying,
    isMetadataEditorOpen,
    setMetadata,
    audioObjectUrl,
    setIsMetadataEditorOpen,
    handleCoverUpload,
    handleAudioUpload,
    handleMvUpload,
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
    WINDOW_SIZE_PRESETS,
    setWindowPresetId,
    setPlaybackWindowPresetId,
    setPlaybackFps,
    setPlaybackMvMode,
    setPlaybackMvAlphaPercent,
    pendingSkinSelection,
    setPendingSkinSelection,
    normalizeSkinSelection,
    resolveHabahiroRhythmRipNameFromType,
    resolveRhythmRipNameFromType,
    resolveDirectionalRipNameFromType,
    resolveRhythmSeRipNameFromType,
    resolveDirectionalSeRipNameFromType,
    HABAHIRO_RHYTHM_SKIN_TYPES,
    RHYTHM_SKIN_TYPES,
    DIRECTIONAL_SKIN_TYPES,
    RHYTHM_SE_SKIN_TYPES,
    DIRECTIONAL_SE_SKIN_TYPES,
    formatTypeLabel,
    applyWindowPreset,
    applyAppOptionSettings,
    applyBestdoriSkinSelection,
    downloadProgress,
    playbackRuntimeLineRef,
    playbackGuideHostRef,
    playbackGuideLabelRef,
    noteVisualScale,
    copiedChartPayload,
  } = vm;
  const isColorAssistEnabled = appOptionSettings?.colorAssistEnabled === true;
  const isCanvasRenderBackend = renderBackendMode === "canvas";
  const canvasBpmCursorPreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasBpmSnapPreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasNoteCursorPreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasNoteSnapPreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasNoteReplacePreviewRef = useRef<HTMLDivElement | null>(null);
  const canvasDirectionalWidenPreviewRef = useRef<HTMLDivElement | null>(null);

  const isPlacementNoteTool = isToolArmed && tool !== "bpm" && tool !== "copy" && tool !== "paste";
  const isPasteToolSelected = isToolArmed && tool === "paste";
  const canvasPreviewType = isPlacementNoteTool ? tool : null;
  const canvasPreviewRhythmWidth = canvasPreviewType && isHabahiroEnabled && isRhythmWidthEditableType(canvasPreviewType)
    ? normalizeRhythmWidth(toolRhythmWidth)
    : 1;
  const canvasPreviewSpec = canvasPreviewType ? NOTE_SPECS[canvasPreviewType] : null;
  const canvasPreviewLayers = useMemo(() => {
    if (!isCanvasRenderBackend || !canvasPreviewType) {
      return null;
    }
    return getSpriteLayers(canvasPreviewType, { width: canvasPreviewRhythmWidth });
  }, [canvasPreviewRhythmWidth, canvasPreviewType, getSpriteLayers, isCanvasRenderBackend]);
  const canvasPreviewSingleAssistLayers = useMemo(() => {
    if (!isCanvasRenderBackend || canvasPreviewType !== "single" || !isColorAssistEnabled) {
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
    isCanvasRenderBackend,
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
  const noteSpriteHeightPx = 24 * noteVisualScale;
  const directionalBaseWidthPx = Math.max(LANE_WIDTH * 1.34, 60) * noteVisualScale;
  const canvasPreviewTokenWidth = canvasPreviewIsDirectional
    ? canvasPreviewSpanLanes * LANE_WIDTH
    : (
      canvasPreviewSpanLanes > 1
        ? LANE_WIDTH * (canvasPreviewSpanLanes + 0.25) * noteVisualScale
        : undefined
    );
  const canvasPreviewTokenClassName = `note-token has-sprite preview-token ${canvasPreviewLayers?.overlay ? "composite" : ""} ${canvasPreviewIsDirectional ? "directional" : ""}`;
  const canvasPreviewTokenStyle: CSSProperties = useMemo(
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
      const directionalStartLane =
        source.type === "directional_flick_left"
          ? adjustedLane - spanLanes + 1
          : adjustedLane;
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
        y: beatToY(adjustedBeat),
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
    return {
      notes: previewNotes,
      bpmYPositions,
    };
  }, [
    LANE_WIDTH,
    NOTE_SPECS,
    beatToY,
    copiedChartPayload,
    cursorPreview,
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
  const [canvasInteractionWindow, setCanvasInteractionWindow] = useState(() => ({
    top: 0,
    bottom: boardHeight,
  }));
  const updateCanvasInteractionWindow = useCallback((scrollTop: number, clientHeight: number) => {
    if (!isCanvasRenderBackend) {
      return;
    }
    const rawTop = Math.max(0, scrollTop - CANVAS_INTERACTION_OVERSCAN_PX);
    const rawBottom = Math.min(boardHeight, scrollTop + clientHeight + CANVAS_INTERACTION_OVERSCAN_PX);
    const top = Math.max(0, Math.floor(rawTop / CANVAS_INTERACTION_SNAP_PX) * CANVAS_INTERACTION_SNAP_PX);
    const bottom = Math.max(
      top + 1,
      Math.min(boardHeight, Math.ceil(rawBottom / CANVAS_INTERACTION_SNAP_PX) * CANVAS_INTERACTION_SNAP_PX),
    );
    setCanvasInteractionWindow((previous) => {
      if (Math.abs(previous.top - top) < 1e-6 && Math.abs(previous.bottom - bottom) < 1e-6) {
        return previous;
      }
      return { top, bottom };
    });
  }, [boardHeight, isCanvasRenderBackend]);
  useEffect(() => {
    if (!isCanvasRenderBackend) {
      return;
    }
    const playfield = playfieldRef?.current;
    if (!playfield) {
      return;
    }
    updateCanvasInteractionWindow(playfield.scrollTop, playfield.clientHeight);
  }, [boardHeight, isCanvasRenderBackend, playfieldRef, updateCanvasInteractionWindow]);
  const handlePlayfieldScrollInternal = useCallback((event: any) => {
    handlePlayfieldScroll(event);
    updateCanvasInteractionWindow(event.currentTarget.scrollTop, event.currentTarget.clientHeight);
  }, [handlePlayfieldScroll, updateCanvasInteractionWindow]);

  useEffect(() => {
    if (!isCanvasRenderBackend) {
      return;
    }
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

      if (tool === "bpm") {
        hide(canvasNoteCursorPreviewRef.current);
        hide(canvasNoteSnapPreviewRef.current);
        hide(canvasNoteReplacePreviewRef.current);
        hide(canvasDirectionalWidenPreviewRef.current);
        show(canvasBpmCursorPreviewRef.current);
        applyPos(canvasBpmCursorPreviewRef.current, 0, livePreview.y);
        if (livePreview.snappedBeat !== null) {
          show(canvasBpmSnapPreviewRef.current);
          applyPos(canvasBpmSnapPreviewRef.current, 0, beatToY(livePreview.snappedBeat));
        } else {
          hide(canvasBpmSnapPreviewRef.current);
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      hide(canvasBpmCursorPreviewRef.current);
      hide(canvasBpmSnapPreviewRef.current);
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
        const snappedStartLane =
          tool === "directional_flick_left"
            ? livePreview.snappedLane - canvasPreviewSpanLanes + 1
            : livePreview.snappedLane;
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
                ? `${LANE_WIDTH * (noteReplacePreview.spanLanes + 0.25) * noteVisualScale}px`
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
    isCanvasRenderBackend,
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
    appendSlideBuildNote,
    setSlideBuildMode,
    setStatusMessage,
    startSlideBuildFromSeedNote,
    beginSelectedNotesMove,
    suppressNextNoteClickRef,
    toggleSelectedNote,
    clearSelectedBpmEvents,
    setSelectedBpmEventId,
    applyToolToPlacedNote,
    finalizeSlideBuild,
    cancelSlideBuild,
    selectedNoteIdSet,
    deleteSelectedNotes,
    clearAllSelections,
    deleteNote,
  };

  const handleSharedNoteMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    const runtime = noteInteractionRef.current;
    const noteId = event.currentTarget.dataset.noteId;
    if (!runtime || !noteId) {
      return;
    }
    const note = runtime.noteById?.get(noteId);
    if (!note) {
      return;
    }
    if (runtime.isToolArmed && (runtime.tool === "copy" || runtime.tool === "paste")) {
      return;
    }
    if (runtime.isToolArmed && runtime.tool === "slide") {
      event.preventDefault();
      event.stopPropagation();
      const activeSlideBuild = runtime.slideBuildRef.current;
      if (activeSlideBuild) {
        if (activeSlideBuild.mode === "append") {
          const result = runtime.appendSlideBuildNote(note.id);
          if (result.blocked) {
            runtime.setStatusMessage("仅可连接到其他 Slide 序列的头部。");
            return;
          }
          if (result.appended) {
            runtime.setSlideBuildMode("drag");
            runtime.setStatusMessage(
              result.merged
                ? "已合并序列并切换到拖动连接，可继续从新序列尾部连接。"
                : "Slide 拖动连接中：移动经过音符即可追加，松开左键返回追加模式，右键完成。",
            );
          }
          return;
        }
        runtime.appendSlideBuildNote(note.id);
        return;
      }
      runtime.startSlideBuildFromSeedNote(note);
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
    const note = runtime.noteById?.get(noteId);
    if (!note) {
      return;
    }
    if (runtime.isToolArmed && (runtime.tool === "copy" || runtime.tool === "paste")) {
      return;
    }
    event.stopPropagation();
    if (runtime.isToolArmed && runtime.tool === "slide") {
      return;
    }
    if (runtime.suppressNextNoteClickRef.current) {
      runtime.suppressNextNoteClickRef.current = false;
      return;
    }
    if (!runtime.isToolArmed && (event.metaKey || event.ctrlKey)) {
      runtime.toggleSelectedNote(note.id);
      runtime.clearSelectedBpmEvents();
      runtime.setSelectedBpmEventId(null);
      return;
    }
    runtime.applyToolToPlacedNote(note);
  }, []);

  const handleSharedNoteContextMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    const runtime = noteInteractionRef.current;
    const noteId = event.currentTarget.dataset.noteId;
    if (!runtime || !noteId) {
      return;
    }
    const note = runtime.noteById?.get(noteId);
    if (!note) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const activeSlideBuild = runtime.slideBuildRef.current;
    if (activeSlideBuild) {
      if (activeSlideBuild.persistUntilRightClick) {
        runtime.finalizeSlideBuild({ disarmTool: true, statusMessage: "已完成 Slide 创建。" });
      } else {
        runtime.cancelSlideBuild("已取消 Slide 创建并取消 Slide 工具。");
      }
      return;
    }
    if (runtime.selectedNoteIdSet.has(note.id)) {
      runtime.deleteSelectedNotes();
      return;
    }
    runtime.clearAllSelections();
    runtime.deleteNote(note.id);
    runtime.setStatusMessage("已删除目标音符。");
  }, []);

  const renderedNoteButtons = useMemo(
    () =>
      notes.map((note: any) => {
        if (note.type === "hidden") {
          return null;
        }
        const spec = NOTE_SPECS[note.type];
        const isDirectional = isDirectionalNoteType(note.type);
        const spanLanes = getNoteSpanLanes(note);
        const { lane: renderLane, beat: renderBeat } = getRenderedNotePlacement(note);
        const renderY = beatToY(renderBeat);
        if (
          isCanvasRenderBackend
          && (renderY < canvasInteractionWindow.top - 48 || renderY > canvasInteractionWindow.bottom + 48)
        ) {
          return null;
        }
        const directionalStartLane =
          note.type === "directional_flick_left"
            ? renderLane - spanLanes + 1
            : renderLane;
        const resolved = resolvePlacedNoteLayers(note, { beat: renderBeat });
        if (!resolved.layers.base) {
          return null;
        }
        const spriteLayers = resolved.layers;
        const spriteAspectRatio = getSpriteAspectRatio(resolved.layers);
        const noteHitboxCoreWidth = Math.max(1, LANE_WIDTH * (spanLanes + 0.25));
        const scaledHitboxCoreWidth = noteHitboxCoreWidth * noteVisualScale;
        const scaledHitboxCoreHeight = 24 * noteVisualScale;
        const tokenWidth = isDirectional
          ? spanLanes * LANE_WIDTH
          : scaledHitboxCoreWidth;
        const style: CSSProperties = {
          left: (laneToColumn(directionalStartLane) + spanLanes / 2) * LANE_WIDTH,
          top: renderY,
          width: tokenWidth,
          "--lane-width": `${LANE_WIDTH}px`,
          "--directional-base-width": `${directionalBaseWidthPx}px`,
          "--note-visual-scale": `${noteVisualScale}`,
          "--note-sprite-height": `${scaledHitboxCoreHeight}px`,
          "--sprite-aspect-ratio": `${spriteAspectRatio}`,
          "--note-hitbox-core-width": `${scaledHitboxCoreWidth}px`,
          "--note-hitbox-core-height": `${scaledHitboxCoreHeight}px`,
        } as CSSProperties;
        const widthHint = isDirectionalNoteType(note.type)
          ? ` | Width ${note.width ?? 1}`
          : "";
        const isNoteSelected = selectedNoteIdSet.has(note.id)
          || (isSlideBuilding && slideBuildSelectedIdSet.has(note.id));
        const noteTokenClassName = `note-token note-hitbox has-sprite ${spriteLayers.overlay ? "composite" : ""} ${isNoteSelected ? "selected" : ""} ${isDirectional ? "directional" : ""}`;

        return (
          <button
            key={note.id}
            type="button"
            data-note-id={note.id}
            className={noteTokenClassName}
            style={style}
            title={`${spec.label} | Lane ${note.lane} | Beat ${formatBeat(note.beat)}${widthHint}`}
            onMouseDown={handleSharedNoteMouseDown}
            onClick={handleSharedNoteClick}
            onContextMenu={handleSharedNoteContextMenu}
          >
            {!isCanvasRenderBackend && spriteLayers && (
              isDirectional
                ? renderDirectionalSprite(
                    note.type as "directional_flick_left" | "directional_flick_right",
                    spriteLayers,
                    spanLanes,
                    spec.label,
                  )
                : renderSpriteStack(
                    spriteLayers,
                    spec.label,
                    "note-sprite-stack",
                    spriteAspectRatio,
                  )
            )}
          </button>
        );
      }),
    [
      LANE_WIDTH,
      NOTE_SPECS,
      beatToY,
      canvasInteractionWindow.bottom,
      canvasInteractionWindow.top,
      formatBeat,
      getNoteSpanLanes,
      getRenderedNotePlacement,
      getSpriteAspectRatio,
      handleSharedNoteClick,
      handleSharedNoteContextMenu,
      handleSharedNoteMouseDown,
      isCanvasRenderBackend,
      isDirectionalNoteType,
      isSlideBuilding,
      laneToColumn,
      noteVisualScale,
      directionalBaseWidthPx,
      notes,
      renderDirectionalSprite,
      renderSpriteStack,
      resolvePlacedNoteLayers,
      selectedNoteIdSet,
      slideBuildSelectedIdSet,
    ],
  );

  return (
    <main className="app-shell">
      <input
        ref={jsonImportRef}
        type="file"
        accept=".json,application/json"
        className="hidden-input"
        onChange={(event) => {
          void handleJsonImport(event);
        }}
      />

      <CommandBar
        onImportJson={openImportJsonModal}
        onExportJson={downloadJson}
        onOpenStaticRender={openStaticRenderWindow}
        onOpenSimulator={openSimulatorWindow}
        onOpenSkinSettings={openSkinSettings}
        onOpenAppSettings={openAppSettings}
      />

      <section
        ref={workspaceRef}
        className="workspace"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <SidebarPanel
          metadata={metadata}
          coverImageSrc={coverImageSrc}
          audioDurationSec={audioDurationSec}
          visibleNoteCount={visibleNoteCount}
          openMetadataEditor={openMetadataEditor}
          isCoverLoadFailed={isCoverLoadFailed}
          setIsCoverLoadFailed={setIsCoverLoadFailed}
          isSkinReady={isSkinReady}
          isToolArmed={isToolArmed}
          tool={tool}
          applyToolFromPalette={applyToolFromPalette}
          getSpriteLayers={getPaletteSpriteLayers}
          getSpriteAspectRatio={getPaletteSpriteAspectRatio}
          renderSpriteStack={renderPaletteSpriteStack}
          onSelectBpmTool={applyBpmToolFromPalette}
          onSelectCopyTool={applyCopyToolFromPalette}
          onSelectPasteTool={applyPasteToolFromPalette}
          onTogglePlayTool={onTogglePlayTool}
          isPlayToolSelected={isPlayToolSelected}
          isPlaybackPlaying={isPlaybackPlaying}
          getPlaybackNowLabel={getPlaybackNowLabel}
          playbackTotalLabel={playbackTotalLabel}
          playbackSpeedLabel={playbackSpeedLabel}
          playbackVolumeLabel={playbackVolumeLabel}
          playbackPositionLabel={playbackPositionLabel}
          isPlaybackFollowEnabled={isPlaybackFollowEnabled}
          setPlaybackFollowEnabled={setPlaybackFollowEnabled}
          canStepPlaybackSpeedDown={canStepPlaybackSpeedDown}
          canStepPlaybackSpeedUp={canStepPlaybackSpeedUp}
          canStepPlaybackVolumeDown={canStepPlaybackVolumeDown}
          canStepPlaybackVolumeUp={canStepPlaybackVolumeUp}
          canStepPlaybackPositionDown={canStepPlaybackPositionDown}
          canStepPlaybackPositionUp={canStepPlaybackPositionUp}
          stepPlaybackSpeed={stepPlaybackSpeed}
          stepPlaybackVolume={stepPlaybackVolume}
          stepPlaybackPosition={stepPlaybackPosition}
          undoLastNote={undoLastNote}
          redoLastNote={redoLastNote}
          canUndoLastOperation={canUndoLastOperation}
          canRedoLastOperation={canRedoLastOperation}
          mirrorSelectedNotes={mirrorSelectedNotes}
          canMirrorSelection={canMirrorSelection}
          clearAllNotes={clearAllNotes}
          notesLength={notes.length}
          mirrorActionIcon={mirrorActionIcon}
          undoActionIcon={undoActionIcon}
          copyActionIcon={copyActionIcon}
          pasteActionIcon={pasteActionIcon}
          clearActionIcon={clearActionIcon}
          applyActionIcon={applyActionIcon}
          showBeatSetting={showBeatSetting}
          isBeatSettingLocked={isBeatSettingLocked}
          beatInputText={beatInputText}
          setBeatInputText={setBeatInputText}
          beatInputEditingRef={beatInputEditingRef}
          commitBeatInput={commitBeatInput}
          showBpmSetting={showBpmSetting}
          bpmInputText={bpmInputText}
          setBpmInputText={setBpmInputText}
          bpmInputEditingRef={bpmInputEditingRef}
          commitBpmInput={commitBpmInput}
          showLaneSetting={showLaneSetting}
          isLaneSettingLocked={isLaneSettingLocked}
          stepActiveLane={stepActiveLane}
          laneInputText={laneInputText}
          setLaneInputText={setLaneInputText}
          laneInputEditingRef={laneInputEditingRef}
          commitLaneInput={commitLaneInput}
          showWidthSetting={showWidthSetting}
          stepActiveWidth={stepActiveWidth}
          widthInputText={widthInputText}
          setWidthInputText={setWidthInputText}
          widthInputEditingRef={widthInputEditingRef}
          commitWidthInput={commitWidthInput}
          showDirectionSetting={showDirectionSetting}
          activeDirectionalValue={activeDirectionalValue}
          setActiveDirectionalType={setActiveDirectionalType}
          hideSettingsPanel={hideSettingsPanel}
          showSlideSegmentSetting={showSlideSegmentSetting}
          slideShape={slideShape}
          slideCurveType={slideCurveType}
          slidePrecision={slidePrecision}
          slideDivision={slideDivision}
          slideVibration={slideVibration}
          slideVibrationInputText={slideVibrationInputText}
          setSlideVibrationInputText={setSlideVibrationInputText}
          slideVibrationInputEditingRef={slideVibrationInputEditingRef}
          commitSlideVibrationInput={commitSlideVibrationInput}
          isSlideCurveTypeDisabled={isSlideCurveTypeDisabled}
          isSlideDivisionDisabled={isSlideDivisionDisabled}
          setSlideShape={setSlideShape}
          setSlideCurveType={setSlideCurveType}
          stepSlidePrecision={stepSlidePrecision}
          stepSlideDivision={stepSlideDivision}
          stepSlideVibration={stepSlideVibration}
          canStepSlidePrecisionDown={canStepSlidePrecisionDown}
          canStepSlidePrecisionUp={canStepSlidePrecisionUp}
          canStepSlideDivisionDown={canStepSlideDivisionDown}
          canStepSlideDivisionUp={canStepSlideDivisionUp}
          canDeleteSelection={canDeleteSelection}
          canApplyLongLineSettings={canApplyLongLineSettings}
          applyCurrentLongLineSettings={applyCurrentLongLineSettings}
          deleteCurrentSelection={deleteCurrentSelection}
        />
        <div
          className="workspace-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整左右区域宽度"
          onMouseDown={startSidebarResize}
        />

        <section className="editor-panel">
          <TimelineStrip settings={settings} applySettingsPatch={applySettingsPatch} />

          {isSkinReady ? (
            <div
              className="playfield-scroll"
              ref={playfieldRef}
              onScroll={handlePlayfieldScrollInternal}
              tabIndex={0}
              onMouseDown={(event) => {
                event.currentTarget.focus({ preventScroll: true });
              }}
            >
              <div
                className={`playfield-host ${selectionDrag?.isDragging ? "is-marquee-selecting" : ""} ${isSlideBuilding ? "is-slide-building" : ""} ${isCanvasRenderBackend ? "canvas-render-backend" : ""}`}
                onMouseDown={handleBoardMouseDown}
                onMouseMove={handleBoardMouseMove}
                onMouseLeave={handleBoardMouseLeave}
                onContextMenu={handleBoardContextMenu}
              >
                <div className="bpm-overlay-layer" style={{ height: boardHeight }}>
                  {renderBpmLines()}
                  {!isCanvasRenderBackend && isToolArmed && tool === "bpm" && cursorPreview && (
                    <>
                      <div className="bpm-marker bpm-preview bpm-preview-cursor" style={{ top: cursorPreview.y }}>
                        <div className="bpm-line" />
                      </div>
                      {cursorPreview.snappedBeat !== null && (
                        <div
                          className="bpm-marker bpm-preview bpm-preview-snap"
                          style={{ top: beatToY(cursorPreview.snappedBeat) }}
                        >
                          <div className="bpm-line" />
                        </div>
                      )}
                    </>
                  )}
                  {isCanvasRenderBackend && (
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
                    </>
                  )}
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
                  className={`playfield-board ${isCanvasRenderBackend ? "canvas-render-backend" : ""}`}
                  style={{ width: boardWidth, height: boardHeight }}
                  onClick={handleBoardClick}
                  onContextMenu={handleBoardContextMenu}
                >
                  {isCanvasRenderBackend && (
                    <>
                      <canvas
                        ref={playfieldTrackCanvasRef}
                        className="playfield-canvas-layer playfield-canvas-track-layer"
                        width={boardWidth}
                        height={boardHeight}
                        aria-hidden="true"
                      />
                      <canvas
                        ref={playfieldNoteCanvasRef}
                        className="playfield-canvas-layer playfield-canvas-note-layer"
                        width={boardWidth}
                        height={boardHeight}
                        aria-hidden="true"
                      />
                      <canvas
                        ref={playfieldPlaybackCanvasRef}
                        className="playfield-canvas-layer playfield-canvas-playback-layer"
                        width={boardWidth}
                        height={boardHeight}
                        aria-hidden="true"
                      />
                    </>
                  )}
                  <div className="judge-line" />

                  <div className="grid-layer">
                    {renderLaneGuides()}
                    {renderGridLines()}
                  </div>

                  <div className="simultaneous-layer">
                    {renderSimultaneousSegments()}
                  </div>

                  <div className="slide-chain-layer">
                    {renderSlideSegments(isCanvasRenderBackend ? canvasInteractionWindow : null)}
                  </div>

                  {!isCanvasRenderBackend && (slideBuildCommittedGuideLines.length > 0 || slideBuildGuideLine) && (
                    <svg className="slide-build-guide-layer" width={boardWidth} height={boardHeight} aria-hidden="true">
                      {slideBuildCommittedGuideLines.map((line: any) => (
                        <line
                          key={line.key}
                          x1={line.x1}
                          y1={line.y1}
                          x2={line.x2}
                          y2={line.y2}
                        />
                      ))}
                      {slideBuildGuideLine && (
                        <line
                          x1={slideBuildGuideLine.x1}
                          y1={slideBuildGuideLine.y1}
                          x2={slideBuildGuideLine.x2}
                          y2={slideBuildGuideLine.y2}
                        />
                      )}
                    </svg>
                  )}

                  <div className="note-layer">
                    {renderedNoteButtons}

                    {!isCanvasRenderBackend && isPlacementNoteTool && cursorPreview && (() => {
                      const previewType = tool;
                      const previewSpec = NOTE_SPECS[previewType];
                      const previewWidthValue =
                        isHabahiroEnabled && isRhythmWidthEditableType(previewType)
                          ? normalizeRhythmWidth(toolRhythmWidth)
                          : 1;
                      const previewLayers = getSpriteLayers(previewType, { width: previewWidthValue });
                      if (!previewLayers.base) {
                        return null;
                      }

                      const previewAspectRatio = getSpriteAspectRatio(previewLayers);
                      const useSnappedColorAssist =
                        isColorAssistEnabled
                        && previewType === "single"
                        && cursorPreview.snappedBeat !== null
                        && !isHalfBeatAligned(cursorPreview.snappedBeat);
                      const snappedPreviewLayers = useSnappedColorAssist
                        ? getSpriteLayers("single", {
                            baseImageType: "single16",
                            includeDirectionalOverlay: false,
                            includeFlickOverlay: false,
                            width: previewWidthValue,
                          })
                        : previewLayers;
                      const snappedPreviewAspectRatio = getSpriteAspectRatio(snappedPreviewLayers);
                      const isPreviewDirectional = isDirectionalNoteType(previewType);
                      const previewSpanLanes = isPreviewDirectional
                        ? normalizeDirectionalWidth(toolDirectionalWidth)
                        : previewWidthValue;
                      const previewTokenWidth = isPreviewDirectional
                        ? previewSpanLanes * LANE_WIDTH
                        : (
                          previewSpanLanes > 1
                            ? LANE_WIDTH * (previewSpanLanes + 0.25) * noteVisualScale
                            : undefined
                        );
                      const previewTokenHeight = 24 * noteVisualScale;

                      const followStyle: CSSProperties = {
                        left: cursorPreview.x,
                        top: cursorPreview.y,
                        ...(previewTokenWidth
                          ? ({
                              width: previewTokenWidth,
                              "--lane-width": `${LANE_WIDTH}px`,
                              "--directional-base-width": `${directionalBaseWidthPx}px`,
                              "--note-visual-scale": `${noteVisualScale}`,
                              "--note-sprite-height": `${previewTokenHeight}px`,
                              "--sprite-aspect-ratio": `${previewAspectRatio}`,
                            } as CSSProperties)
                          : ({
                              "--directional-base-width": `${directionalBaseWidthPx}px`,
                              "--note-visual-scale": `${noteVisualScale}`,
                              "--note-sprite-height": `${previewTokenHeight}px`,
                              "--sprite-aspect-ratio": `${previewAspectRatio}`,
                            } as CSSProperties)),
                      };

                      const snappedStyle: CSSProperties | null =
                        cursorPreview.snappedLane === null || cursorPreview.snappedBeat === null
                          ? null
                          : (() => {
                              const snappedStartLane =
                                previewType === "directional_flick_left"
                                  ? cursorPreview.snappedLane - previewSpanLanes + 1
                                  : cursorPreview.snappedLane;
                              return {
                                left: (laneToColumn(snappedStartLane) + previewSpanLanes / 2) * LANE_WIDTH,
                                top: beatToY(cursorPreview.snappedBeat),
                                ...(previewTokenWidth
                                  ? ({
                                      width: previewTokenWidth,
                                      "--lane-width": `${LANE_WIDTH}px`,
                                      "--directional-base-width": `${directionalBaseWidthPx}px`,
                                      "--note-visual-scale": `${noteVisualScale}`,
                                      "--note-sprite-height": `${previewTokenHeight}px`,
                                      "--sprite-aspect-ratio": `${previewAspectRatio}`,
                                    } as CSSProperties)
                                  : ({
                                      "--directional-base-width": `${directionalBaseWidthPx}px`,
                                      "--note-visual-scale": `${noteVisualScale}`,
                                      "--note-sprite-height": `${previewTokenHeight}px`,
                                      "--sprite-aspect-ratio": `${previewAspectRatio}`,
                                    } as CSSProperties)),
                              } as CSSProperties;
                            })();

                      const previewTokenClassName = `note-token has-sprite preview-token ${previewLayers.overlay ? "composite" : ""} ${isPreviewDirectional ? "directional" : ""}`;

                      return (
                        <>
                          <div className={`${previewTokenClassName} preview-cursor`} style={followStyle} aria-hidden="true">
                            {isPreviewDirectional
                              ? renderDirectionalSprite(
                                  previewType as "directional_flick_left" | "directional_flick_right",
                                  previewLayers,
                                  previewSpanLanes,
                                  previewSpec.label,
                                )
                              : renderSpriteStack(
                                  previewLayers,
                                  previewSpec.label,
                                  "note-sprite-stack",
                                  previewAspectRatio,
                                )}
                          </div>

                          {snappedStyle && (
                            <div className={`${previewTokenClassName} preview-snap`} style={snappedStyle} aria-hidden="true">
                              {isPreviewDirectional
                                ? renderDirectionalSprite(
                                    previewType as "directional_flick_left" | "directional_flick_right",
                                    snappedPreviewLayers,
                                    previewSpanLanes,
                                    previewSpec.label,
                                  )
                                : renderSpriteStack(
                                    snappedPreviewLayers,
                                    previewSpec.label,
                                    "note-sprite-stack",
                                    snappedPreviewAspectRatio,
                                  )}
                            </div>
                          )}
                        </>
                      );
                    })()}
                    {!isCanvasRenderBackend && isPlacementNoteTool && cursorPreview && (() => {
                      const replacePreview = resolveNoteReplacePreviewAt?.(cursorPreview.x, cursorPreview.y) ?? null;
                      if (!replacePreview) {
                        return null;
                      }
                      const previewLayers = getSpriteLayers(replacePreview.type, { width: replacePreview.width });
                      if (!previewLayers.base) {
                        return null;
                      }
                      const previewSpec = NOTE_SPECS[replacePreview.type];
                      const previewAspectRatio = getSpriteAspectRatio(previewLayers);
                      const isPreviewDirectional = isDirectionalNoteType(replacePreview.type);
                      const tokenWidth = isPreviewDirectional
                        ? replacePreview.spanLanes * LANE_WIDTH
                        : (
                          replacePreview.spanLanes > 1
                            ? LANE_WIDTH * (replacePreview.spanLanes + 0.25) * noteVisualScale
                            : undefined
                        );
                      const tokenHeight = 24 * noteVisualScale;
                      const style: CSSProperties = {
                        left: replacePreview.x,
                        top: replacePreview.y,
                        ...(tokenWidth
                          ? ({
                              width: tokenWidth,
                              "--lane-width": `${LANE_WIDTH}px`,
                              "--directional-base-width": `${directionalBaseWidthPx}px`,
                              "--note-visual-scale": `${noteVisualScale}`,
                              "--note-sprite-height": `${tokenHeight}px`,
                              "--sprite-aspect-ratio": `${previewAspectRatio}`,
                            } as CSSProperties)
                          : ({
                              "--directional-base-width": `${directionalBaseWidthPx}px`,
                              "--note-visual-scale": `${noteVisualScale}`,
                              "--note-sprite-height": `${tokenHeight}px`,
                              "--sprite-aspect-ratio": `${previewAspectRatio}`,
                            } as CSSProperties)),
                      };
                      return (
                        <div
                          className={`note-token has-sprite preview-token preview-snap ${previewLayers.overlay ? "composite" : ""} ${isPreviewDirectional ? "directional" : ""}`}
                          style={style}
                          aria-hidden="true"
                        >
                          {isPreviewDirectional
                            ? renderDirectionalSprite(
                                replacePreview.type as "directional_flick_left" | "directional_flick_right",
                                previewLayers,
                                replacePreview.spanLanes,
                                previewSpec.label,
                              )
                            : renderSpriteStack(
                                previewLayers,
                                previewSpec.label,
                                "note-sprite-stack",
                                previewAspectRatio,
                              )}
                        </div>
                      );
                    })()}
                    {!isCanvasRenderBackend && isPlacementNoteTool && isDirectionalNoteType(tool) && cursorPreview && (() => {
                      const widenPreview = resolveDirectionalWidenPreviewAt?.(cursorPreview.x, cursorPreview.y) ?? null;
                      if (!widenPreview) {
                        return null;
                      }
                      const previewLayers = getSpriteLayers(widenPreview.type);
                      if (!previewLayers.base) {
                        return null;
                      }
                      const previewSpec = NOTE_SPECS[widenPreview.type];
                      const previewAspectRatio = getSpriteAspectRatio(previewLayers);
                      const tokenHeight = 24 * noteVisualScale;
                      const style: CSSProperties = {
                        left: widenPreview.x,
                        top: widenPreview.y,
                        width: LANE_WIDTH,
                        "--lane-width": `${LANE_WIDTH}px`,
                        "--directional-base-width": `${directionalBaseWidthPx}px`,
                        "--note-visual-scale": `${noteVisualScale}`,
                        "--note-sprite-height": `${tokenHeight}px`,
                        "--sprite-aspect-ratio": `${previewAspectRatio}`,
                      } as CSSProperties;
                      return (
                        <div
                          className={`note-token has-sprite preview-token preview-snap ${previewLayers.overlay ? "composite" : ""} directional`}
                          style={style}
                          aria-hidden="true"
                        >
                          {renderDirectionalSprite(widenPreview.type, previewLayers, 1, previewSpec.label)}
                        </div>
                      );
                    })()}
                    {isCanvasRenderBackend && canvasPreviewType && canvasPreviewSpec && canvasPreviewLayers && canvasPreviewHasSprite && (
                      <>
                        <div
                          ref={canvasNoteCursorPreviewRef}
                          className={`${canvasPreviewTokenClassName} preview-cursor`}
                          style={canvasPreviewTokenStyle}
                          aria-hidden="true"
                        >
                          {canvasPreviewIsDirectional
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
                              )}
                        </div>
                        <div
                          ref={canvasNoteSnapPreviewRef}
                          className={`${canvasPreviewTokenClassName} preview-snap`}
                          style={canvasPreviewTokenStyle}
                          data-color-assist="off"
                          aria-hidden="true"
                        >
                          {canvasPreviewIsDirectional
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
                            )}
                        </div>
                        <div
                          ref={canvasNoteReplacePreviewRef}
                          className={`${canvasPreviewTokenClassName} preview-snap`}
                          style={canvasNoteReplaceTokenStyle}
                          aria-hidden="true"
                        >
                          {canvasPreviewIsDirectional
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
                              )}
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
                            ? LANE_WIDTH * (note.spanLanes + 0.25) * noteVisualScale
                            : undefined
                        );
                      const tokenHeight = 24 * noteVisualScale;
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

                  {!isCanvasRenderBackend && selectionDrag?.isDragging && (
                    <div
                      className="selection-rect"
                      style={{
                        left: Math.min(selectionDrag.startX, selectionDrag.currentX),
                        top: Math.min(selectionDrag.startY, selectionDrag.currentY),
                        width: Math.abs(selectionDrag.currentX - selectionDrag.startX),
                        height: Math.abs(selectionDrag.currentY - selectionDrag.startY),
                      }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="playfield-loading">
              {isSkinApplying ? "皮肤下载中，完成后渲染可视化谱面。" : "当前皮肤不可用，无法渲染可视化谱面。"}
            </div>
          )}

          <div className="status-strip" title={statusMessage}>{statusMessage}</div>
        </section>
      </section>

      <MetadataEditorModal
        open={isMetadataEditorOpen}
        metadata={metadata}
        setMetadata={setMetadata}
        audioObjectUrl={audioObjectUrl}
        onClose={() => setIsMetadataEditorOpen(false)}
        onCoverUpload={handleCoverUpload}
        onAudioUpload={handleAudioUpload}
        onMvUpload={handleMvUpload}
      />

      <AppSettingsModal
        open={isAppSettingsOpen}
        onClose={() => setIsAppSettingsOpen(false)}
        windowPresetId={windowPresetId}
        playbackWindowPresetId={playbackWindowPresetId}
        playbackFps={playbackFps}
        playbackMvMode={playbackMvMode}
        playbackMvAlphaPercent={playbackMvAlphaPercent}
        windowPresets={WINDOW_SIZE_PRESETS}
        onWindowPresetIdChange={setWindowPresetId}
        onPlaybackWindowPresetIdChange={setPlaybackWindowPresetId}
        onPlaybackFpsChange={setPlaybackFps}
        onPlaybackMvModeChange={setPlaybackMvMode}
        onPlaybackMvAlphaPercentChange={setPlaybackMvAlphaPercent}
        onApplyWindowPreset={() => void applyWindowPreset()}
        optionSettings={appOptionSettings}
        onApplyOptionSettings={applyAppOptionSettings}
      />

      <SkinSettingsModal
        open={isSkinSettingsOpen}
        onClose={() => setIsSkinSettingsOpen(false)}
        pendingSkinSelection={pendingSkinSelection}
        rhythmTypeTitle={appOptionSettings.habahiro ? "节奏图示样式（幅广）" : "节奏图示样式"}
        onRhythmTypeChange={(value) =>
          setPendingSkinSelection((current: any) =>
            normalizeSkinSelection({
              ...current,
              rhythmType: value,
              rhythmRipName:
                resolveHabahiroRhythmRipNameFromType(value)
                ?? resolveRhythmRipNameFromType(value)
                ?? current.rhythmRipName,
            }),
          )
        }
        onDirectionalTypeChange={(value) =>
          setPendingSkinSelection((current: any) =>
            normalizeSkinSelection({
              ...current,
              directionalType: value,
              directionalRipName: resolveDirectionalRipNameFromType(value) ?? current.directionalRipName,
            }),
          )
        }
        onRhythmSeTypeChange={(value) =>
          setPendingSkinSelection((current: any) =>
            normalizeSkinSelection({
              ...current,
              rhythmSeType: value,
              rhythmSeRipName: resolveRhythmSeRipNameFromType(value) ?? current.rhythmSeRipName,
            }),
          )
        }
        onDirectionalSeTypeChange={(value) =>
          setPendingSkinSelection((current: any) =>
            normalizeSkinSelection({
              ...current,
              directionalSeType: value,
              directionalSeRipName: resolveDirectionalSeRipNameFromType(value) ?? current.directionalSeRipName,
            }),
          )
        }
        rhythmSkinTypes={appOptionSettings.habahiro ? HABAHIRO_RHYTHM_SKIN_TYPES : RHYTHM_SKIN_TYPES}
        directionalSkinTypes={DIRECTIONAL_SKIN_TYPES}
        rhythmSeSkinTypes={RHYTHM_SE_SKIN_TYPES}
        directionalSeSkinTypes={DIRECTIONAL_SE_SKIN_TYPES}
        formatTypeLabel={formatTypeLabel}
        isSkinApplying={isSkinApplying}
        onApplySkinSelection={() => void applyBestdoriSkinSelection(pendingSkinSelection, true)}
      />

      <ExportJsonModal
        open={isExportJsonModalOpen}
        jsonText={exportJson}
        onClose={closeExportJsonModal}
        onSaveAs={() => void saveExportJsonToSelectedPath()}
        onExportBestdoriV2={() => void exportBestdoriV2ToClipboard()}
      />

      <ImportJsonModal
        open={isImportJsonModalOpen}
        level={importJsonModalLevel}
        chartJsonText={importJsonText}
        bestdoriJsonText={importBestdoriV2Text}
        onChartJsonTextChange={setImportJsonText}
        onBestdoriJsonTextChange={setImportBestdoriV2Text}
        onApplyChartJson={applyImportJsonText}
        onApplyBestdoriV2={applyImportBestdoriV2Text}
        onImportJsonFile={triggerJsonImport}
        onOpenBestdoriV2={openImportJsonModalBestdoriV2Level}
        onBackToChart={backToImportJsonModalChartLevel}
        onClose={closeImportJsonModal}
      />

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
  );
}

