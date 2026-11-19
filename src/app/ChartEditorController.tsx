// @refresh reset
// This controller owns the editor hook tree; hot updates must not reuse an older hook layout.
import { minimapLaneVisible } from "./editorMinimapGeometry";
import { allowedSelectionWidthDelta, canResizeSelectionWidth, planSelectionWidthChange, type SelectionWidthContext, type SelectionWidthEdge } from "./selectionWidthDrag";
import { editorNoteHeight, editorNoteTokenWidth, editorSlideLineWidth, SELECTION_FRAME_MARGIN } from "./editorNoteMetrics";
import { useEditorScrollExtent } from "./hooks/useEditorScrollExtent";
import { useUiViewport } from "../components/useUiViewport";
import { TRACK_ZONE_WIDTH, trackZoneGeometry, useEditorViewportZoom } from "./hooks/useEditorViewportZoom";
import { holdAuxiliaryPreparation } from "./RoutePresentation";
import { useChartProjectFiles } from "./hooks/useChartProjectFiles";
import { projectDraft, type ChartProject, type ChartProjectDraft } from "../project/chartProject";
import { captureChartProject, rememberProjectMedia } from "../project/projectResources";
import { downloadBytes } from "../services/download";
import { appLog } from "../logging/applicationLogger";
import { stretchAudioBuffer } from "../audio/stretchAudioBuffer";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type SetStateAction,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import { ChartEditorLayout } from "../components/editor/ChartEditorLayout";
import { FIELD_WIDTH_LANES } from "../components/editor/previewLaneStrip";
import { createEditorDisplayAxis } from "./editorDisplayAxis";
import {
  BASE_BPM_LINE_ID,
  DEFAULT_SPRITE_ASPECT_RATIO,
  isLastBeatOrderedBpmNegative,
  formatEditorNumeric,
  normalizeEditorBpm,
  normalizeBaseBpmForWrite,
  normalizeEventBpmForWrite,
  parseNumericExpression,
  type SlideBuildState,
  type SlideChain,
} from "./editorHelpers";
import { useBoardInteractionActions } from "./hooks/useBoardInteractionActions";
import { useCanvasPlayfieldBackend, type EventBubbleHit } from "./hooks/useCanvasPlayfieldBackend";
import { useCanvasRenderResources } from "./hooks/useCanvasRenderResources";
import { useIsStartingApplication, useStartupReadiness } from "./startupReadiness";
import { useEditorGeometry } from "./hooks/useEditorGeometry";
import { useEditorIoAndShortcuts } from "./hooks/useEditorIoAndShortcuts";
import { useEditorSessionCache } from "./hooks/useEditorSessionCache";
import { useEditorRenderModel, type RenderConnectionSegment } from "./hooks/useEditorRenderModel";
import { useStableEvents } from "./hooks/useStableEvents";
import { EDITOR_EDGE_SOFTNESS } from "./editorEdgeMask";
import { DEFAULT_SLIDE_FIT_SETTINGS, type SlideFitSettings } from "./slideFitShapes";
import { useSlideSegmentActions } from "./hooks/useSlideSegmentActions";
import { useEditorPointerLifecycle } from "./hooks/useEditorPointerLifecycle";
import { useEditorSelectionActions } from "./hooks/useEditorSelectionActions";
import { usePlayfieldRenderers } from "./hooks/usePlayfieldRenderers";
import { useSelectionAndEditorSync } from "./hooks/useSelectionAndEditorSync";
import { isMobileRuntime, setMobileSimulatorImmersive, writeMobileRoutePayload } from "./mobileRuntime";
import { canMirrorSelection, mirrorSelection, type MirrorAxis, type SelectionMirrorContext } from "./selectionMirror";
import { cleanupSlideChainsHidden, dropNoteIdsFromChains } from "./slideChainCleanup";
import { parseSlideSegmentId } from "./slideSegments";
import {
  useNotePaletteSpriteRendering,
  usePlayfieldSpriteRendering,
} from "./hooks/useSpriteRenderingHelpers";
import {
  canUseExGarupa,
  canUseHabahiro,
  canUseSpRhythm,
  isChartUsingExGarupa,
  isChartUsingHabahiro,
  isChartUsingSpRhythm,
  regressChartWithoutExGarupa,
  regressChartWithoutHabahiro,
  regressChartWithoutSpRhythm,
  type ChartStateLike,
} from "./modeChartRegression";
import {
  applyHabahiroLongWidths,
  inferPreferredHabahiroLongWidths,
} from "./habahiroLongWidth";
import {
  DEFAULT_SKIN_SELECTION,
  isHabahiroRhythmRipName,
  normalizeSkinSelection,
  type BestdoriCatalogKind,
  type BestdoriSkinCatalogOptions,
  type SeSkinAssets,
  type SkinAssets,
  type SkinSelection,
} from "../skinLoader";
import type { AppliedSkinResources } from "../skin/resourceSkinDecoder";
import {
  projectSkinRuntimeResourceMap,
  reverseSkinRuntimeResourceMap,
} from "../skin/resourceSkinProjection";
import {
  BEAT_HEIGHT,
  DEFAULT_EDITOR_OPTION_SETTINGS,
  DEFAULT_METADATA,
  DEFAULT_SETTINGS,
  GLOBAL_TIMING_GROUP_ID,
  NOTE_SPECS,
  NOTE_TYPES,
  WINDOW_SIZE_PRESETS,
  DEFAULT_WINDOW_PRESET_ID,
  DEFAULT_PLAYBACK_WINDOW_PRESET_ID,
  approxEq,
  beatToSeconds,
  buildBpmTimeline,
  clamp,
  createId,
  flattenTimingGroups,
  formatBeat,
  formatDuration,
  getLaneValues,
  isDirectionalNoteType,
  isNoteTool,
  isRhythmWidthEditableType,
  normalizeBpmEvent,
  normalizeSvEvent,
  normalizeDirectionalWidth,
  normalizeTimingGroup,
  normalizeRhythmWidth,
  ensureTimingGroups,
  normalizeMetadata,
  normalizeEditorOptionSettings,
  normalizeNote,
  normalizeNoteTimingGroup,
  normalizePositiveInt,
  normalizeSettings,
  parseSkinSelectionFromDocument,
  quantizeBeat,
  sanitizeFileName,
  secondsToBeat,
  secondsToBeatCandidates,
  sortBpmEvents,
  sortSvEvents,
  sortNotes,
  toFinite,
  type ChartBpmEvent,
  type ChartMetadata,
  type ChartNote,
  type ChartSvEvent,
  type ChartTimingGroupId,
  type ChartTimingGroupMap,
  type EditorOptionSettings,
  type ChartSettings,
  type EditorTool,
  type NoteType,
  normalizeLaneCount,
  renumberTimingGroups,
  nextTimingGroupId,
  GLOBAL_TIMING_GROUP_DISPLAY_NAME,
  sortTimingGroupIds,
  applySvEventsToTimingGroups,
} from "../chartCore";
import {
  useApplicationResourceManager,
  useApplicationResourceUrl,
} from "../resources/applicationResourceContext";
import type { ResourceConsumerLease } from "../resources/contracts";
import type { ChartMediaResources } from "../resources/selections";
import { useChartMediaLease } from "../resources/useChartMediaLease";
import { buildBestdoriSkinCatalogOptionsFromDescriptors } from "../services/bestdori/catalog";
import "../App.css";
import { type OverlayDialogState } from "../components/OverlayDialogModal";
import type { StaticRenderPayload } from "./staticRenderTypes";
import { buildSimulatorLaunchDescriptor, createSimulatorLaunchRequestId } from "./simulator/buildSimulatorLaunchDescriptor";
import { chartProjectionError } from "../project/projectChartAdapter";
import { SIMULATOR_PRE_ADAPTATION_DEFAULTS, type SimulatorModeSelection } from "./simulator/preAdaptationContract";
import {
  SIMULATOR_WINDOW_CLOSED_EVENT,
  SIMULATOR_WINDOW_PAYLOAD_EVENT,
  SIMULATOR_WINDOW_READY_EVENT,
  type SimulatorWindowClosedPayload,
  type SimulatorWindowExit,
  type SimulatorWindowReadyPayload,
} from "./simulator/transportContracts";
import {
  buildTimingGroupDefs,
  normalizeTimingGroupId,
  type TimingGroupDef,
} from "../chart";

const TIMELINE_REFERENCE_BPM = 120;
const PLAYBACK_SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
const PLAYBACK_SE_POOL_SIZE = 8;
const PLAYBACK_SE_TRIGGER_LEAD_SEC = 0.02;
const PLAYBACK_VIEWPORT_EDGE_TOLERANCE_PX = 8;
const STATIC_RENDER_WINDOW_READY_EVENT = "static-render:ready";
const STATIC_RENDER_WINDOW_PAYLOAD_EVENT = "static-render:payload";

function formatDurationPrecise(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) {
    return "0:00.000";
  }
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const minute = Math.floor(totalMs / 60000);
  const second = Math.floor((totalMs % 60000) / 1000);
  const millisecond = totalMs % 1000;
  return `${minute}:${second.toString().padStart(2, "0")}.${millisecond.toString().padStart(3, "0")}`;
}

function lowerBoundByTime<T>(
  list: T[],
  target: number,
  getTime: (item: T) => number,
): number {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (getTime(list[mid]) < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

type EditorConfigCacheKey = EditorSettingsTool;
type EditorSettingsTool = NoteType | "bpm";
type CursorPreviewState = {
  x: number;
  y: number;
  snappedLane: number | null;
  snappedBeat: number | null;
};
type DirectionalWidenPreviewState = {
  type: "directional_flick_left" | "directional_flick_right";
  x: number;
  y: number;
};
type NoteReplacePreviewState = {
  type: NoteType;
  x: number;
  y: number;
  spanLanes: number;
  width: number;
};
type EditorConfigCacheValue =
  | { type: "bpm"; bpmValue: number }
  | { type: "directional"; width: number; direction: "left" | "right" }
  | { type: "rhythm"; width: number };
type PlaybackLineMode = "follow" | "free";
type WidthSettingMode = "directional" | "rhythm" | null;
type ResolvedPlaybackSeSources = {
  single: string | null;
  skill: string | null;
  flick: string | null;
  directional1: string | null;
  directional2: string | null;
  directional3: string | null;
  longLoop: string | null;
};

type LoadingProgressState = {
  visible: boolean;
  blocking: boolean;
  percent: number;
  message: string;
  logs: string[];
};

type EditorUndoSnapshot = {
  notes: ChartNote[];
  slideChains: SlideChain[];
  bpmEvents: ChartBpmEvent[];
  timingGroups: ChartTimingGroupMap;
};

type CopiedSlideChain = {
  noteIds: string[];
  timingGroup?: ChartTimingGroupId;
};

type CopiedChartPayload = {
  notes: ChartNote[];
  bpmEvents: ChartBpmEvent[];
  svEvents: ChartSvEvent[];
  slideChains: CopiedSlideChain[];
  anchorBeat: number;
  anchorLane: number;
  laneAnchorEnabled: boolean;
};

const UNDO_STACK_LIMIT = 200;

/** Field values equal; edit rows are flat apart from a chain's noteIds, compared element by element. */
function sameField(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
}
/** Rows equal field by field; a field that is absent and one that is undefined are the same. */
function sameRow(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  if (left === right) return true;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (!sameField(left[key], right[key])) return false;
  }
  return true;
}
/**
 * The same rows, whatever their order: rows with ids are matched by id (the chart does not depend on the
 * order of its note, chain or event lists), other rows by position.
 */
function sameRows(a: readonly object[], b: readonly object[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const rows = (list: readonly object[]) => list as readonly Record<string, unknown>[];
  if (rows(a).every((row) => typeof row.id === "string" || typeof row.id === "number")) {
    const byId = new Map(rows(b).map((row) => [row.id, row]));
    if (byId.size !== b.length) return false;
    return rows(a).every((row) => { const other = byId.get(row.id); return other !== undefined && sameRow(row, other); });
  }
  return rows(a).every((row, index) => sameRow(row, rows(b)[index]!));
}
/** Whether two edit states hold the same chart content, whatever their array identities. */
function sameUndoContent(a: EditorUndoSnapshot, b: EditorUndoSnapshot): boolean {
  return sameRows(a.notes, b.notes) && sameRows(a.slideChains, b.slideChains) && sameRows(a.bpmEvents, b.bpmEvents)
    && (a.timingGroups === b.timingGroups || JSON.stringify(a.timingGroups) === JSON.stringify(b.timingGroups));
}

function resolvePlaybackSeSources(runtimeSe: SeSkinAssets): ResolvedPlaybackSeSources {
  return {
    single: runtimeSe.rhythm.perfect || null,
    skill: runtimeSe.tapSkill || null,
    flick: runtimeSe.rhythm.flick || null,
    directional1: runtimeSe.directional.directionalFL[1] || null,
    directional2: runtimeSe.directional.directionalFL[2] || null,
    directional3: runtimeSe.directional.directionalFL[3] || null,
    longLoop: null,
  };
}

// Tool BPM for placing BPM events. Lives for the whole app run (120 at launch) and is not part of any chart project.
let runtimeToolBpm = 120;

function ChartEditorController() {
  const resourceManager = useApplicationResourceManager();
  const defaultCoverImage = useApplicationResourceUrl("ui.default-cover");
  const undoActionIcon = useApplicationResourceUrl("ui.icon.undo-action");
  const clearActionIcon = useApplicationResourceUrl("ui.icon.clear-action");
  const applyActionIcon = useApplicationResourceUrl("ui.icon.apply-action");
  const copyActionIcon = useApplicationResourceUrl("ui.icon.copy-action");
  const pasteActionIcon = useApplicationResourceUrl("ui.icon.paste-action");
  const mirrorActionIcon = useApplicationResourceUrl("ui.icon.mirror-action");
  const [projectId, setProjectId] = useState<string>(() => crypto.randomUUID());
  const skipProjectWidthAdjustmentRef = useRef(false);
  const [metadata, setMetadataState] = useState<ChartMetadata>(DEFAULT_METADATA);
  const [chartMediaResources, setChartMediaResources] = useState<ChartMediaResources>(() => Object.freeze({
    bgm: null,
    cover: null,
    mv: null,
    illustBackground: null,
  }));
  const chartMediaLease = useChartMediaLease(resourceManager, chartMediaResources);
  const [settings, setSettingsState] = useState<ChartSettings>(DEFAULT_SETTINGS);
  const [appOptionSettings, setAppOptionSettings] = useState<EditorOptionSettings>(DEFAULT_EDITOR_OPTION_SETTINGS);
  const [notes, setNotesState] = useState<ChartNote[]>([]);
  const [slideChains, setSlideChainsState] = useState<SlideChain[]>([]);
  const [bpmEvents, setBpmEventsState] = useState<ChartBpmEvent[]>([]);
  const [timingGroups, setTimingGroupsState] = useState<ChartTimingGroupMap>(() => ensureTimingGroups(null));
  const svEvents = useMemo(() => flattenTimingGroups(timingGroups), [timingGroups]);
  const [tool, setTool] = useState<EditorTool>("single");
  const [isToolArmed, setIsToolArmed] = useState(true);
  const toolDurationBeats = 1;
  const toolLaneShift = 1;
  const [toolDirectionalWidth, setToolDirectionalWidth] = useState(1);
  const [toolRhythmWidth, setToolRhythmWidth] = useState(1);
  const [toolLane, setToolLane] = useState(0);
  const [useToolLaneOverride, setUseToolLaneOverride] = useState(false);
  const [toolBpmValue, setToolBpmValueState] = useState(runtimeToolBpm);
  const setToolBpmValue = useCallback((value: number) => {
    runtimeToolBpm = value;
    setToolBpmValueState(value);
  }, []);
  const [toolSvValue, setToolSvValue] = useState(1);
  /** The timing group new SV events go to; #0 (global) by default. */
  const [toolSvTimingGroup, setToolSvTimingGroup] = useState<ChartTimingGroupId>(GLOBAL_TIMING_GROUP_ID);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [selectedTimingGroupId, setSelectedTimingGroupId] = useState<ChartTimingGroupId>(GLOBAL_TIMING_GROUP_ID);
  const [isTimingGroupPanelOpen, setIsTimingGroupPanelOpen] = useState(false);
  const [isTimingGroupModeEnabled, setIsTimingGroupModeEnabled] = useState(false);
  const [isSvPreviewEnabled, setIsSvPreviewEnabled] = useState(false);
  const [svPreviewTimeSec, setSvPreviewTimeSec] = useState(0);
  const isSvPreviewEnabledRef = useRef(false);
  const svPreviewTimeSecRef = useRef(0);
  const [copiedChartPayload, setCopiedChartPayload] = useState<CopiedChartPayload | null>(null);
  const canUseSpRhythmMode = canUseSpRhythm(appOptionSettings);
  const isHabahiroEnabled = canUseHabahiro(settings);
  const isExGarupaEnabled = canUseExGarupa(appOptionSettings);
  const [cursorPreview, setCursorPreviewState] = useState<CursorPreviewState | null>(null);
  const [isPlayToolSelected, setIsPlayToolSelected] = useState(false);
  const [isPlaybackPlaying, setIsPlaybackPlaying] = useState(false);
  const [playbackSpeedIndex, setPlaybackSpeedIndex] = useState(() => PLAYBACK_SPEED_OPTIONS.indexOf(1));
  const [playbackVolumePercent, setPlaybackVolumePercent] = useState(100);
  const [playbackLinePositionPercent, setPlaybackLinePositionPercent] = useState(0);
  const [playbackBottomInsetRatio, setPlaybackBottomInsetRatio] = useState(0);
  const viewportPlaybackPositionPercent = 100 * playbackBottomInsetRatio
    + playbackLinePositionPercent * (1 - playbackBottomInsetRatio);
  const [isPlaybackFollowEnabled, setIsPlaybackFollowEnabledState] = useState(true);
  const [selectionDrag, setSelectionDrag] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isDragging: boolean;
  } | null>(null);

  const [previewLoadingProgress, setPreviewLoadingProgress] = useState<LoadingProgressState>({
    visible: false,
    blocking: false,
    percent: 0,
    message: "",
    logs: [],
  });
  const previewLoadingHideTimerRef = useRef<number | null>(null);

  const [isAppSettingsOpen, setIsAppSettingsOpen] = useState(false);
  const [isSkinSettingsOpen, setIsSkinSettingsOpen] = useState(false);
  const [overlayDialog, setOverlayDialog] = useState<OverlayDialogState | null>(null);
  const overlayDialogConfirmActionRef = useRef<(() => void) | null>(null);
  const overlayDialogCancelActionRef = useRef<(() => void) | null>(null);

  const closeOverlayDialog = useCallback(() => {
    overlayDialogConfirmActionRef.current = null;
    overlayDialogCancelActionRef.current = null;
    setOverlayDialog(null);
  }, []);

  const openOverlayDialog = useCallback((
    dialog: OverlayDialogState,
    handlers?: {
      onConfirm?: () => void;
      onCancel?: () => void;
    },
  ) => {
    overlayDialogConfirmActionRef.current = handlers?.onConfirm ?? null;
    overlayDialogCancelActionRef.current = handlers?.onCancel ?? null;
    setOverlayDialog(dialog);
  }, []);

  const confirmOverlayDialog = useCallback(() => {
    const onConfirm = overlayDialogConfirmActionRef.current;
    closeOverlayDialog();
    onConfirm?.();
  }, [closeOverlayDialog]);

  const cancelOverlayDialog = useCallback(() => {
    const onCancel = overlayDialogCancelActionRef.current;
    closeOverlayDialog();
    onCancel?.();
  }, [closeOverlayDialog]);

  /**
   * The editor's one dialog entry: every notice and confirmation goes through here and is logged.
   * A "warning" dialog also offers Cancel; `handlers` run after the user confirms or cancels.
   */
  const showDialog = useCallback((
    message: string,
    tone: OverlayDialogState["tone"] = "info",
    handlers?: { onConfirm?: () => void; onCancel?: () => void },
  ) => {
    appLog(tone === "error" ? "error" : "info", "editor.dialog", { tone, message });
    openOverlayDialog({ tone, message }, handlers);
  }, [openOverlayDialog]);

  const clearPreviewLoadingHideTimer = useCallback(() => {
    if (previewLoadingHideTimerRef.current !== null) {
      window.clearTimeout(previewLoadingHideTimerRef.current);
      previewLoadingHideTimerRef.current = null;
    }
  }, []);

  const hidePreviewLoadingProgress = useCallback((delayMs = 0) => {
    clearPreviewLoadingHideTimer();
    if (delayMs <= 0) {
      setPreviewLoadingProgress({
        visible: false,
        blocking: false,
        percent: 0,
        message: "",
        logs: [],
      });
      return;
    }
    previewLoadingHideTimerRef.current = window.setTimeout(() => {
      setPreviewLoadingProgress({
        visible: false,
        blocking: false,
        percent: 0,
        message: "",
        logs: [],
      });
      previewLoadingHideTimerRef.current = null;
    }, delayMs);
  }, [clearPreviewLoadingHideTimer]);

  const startPreviewLoadingProgress = useCallback((message: string) => {
    clearPreviewLoadingHideTimer();
    setPreviewLoadingProgress({
      visible: true,
      blocking: true,
      percent: 8,
      message,
      logs: [message],
    });
  }, [clearPreviewLoadingHideTimer]);

  const updatePreviewLoadingProgress = useCallback((
    percent: number,
    message: string,
    options?: { blocking?: boolean },
  ) => {
    setPreviewLoadingProgress((previous) => {
      const nextLogs =
        previous.logs.length > 0 && previous.logs[previous.logs.length - 1] === message
          ? previous.logs
          : [...previous.logs, message].slice(-2);
      return {
        visible: true,
        blocking: options?.blocking ?? previous.blocking,
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        message,
        logs: nextLogs,
      };
    });
  }, []);

  const completePreviewLoadingProgress = useCallback((message: string, delayMs = 420) => {
    updatePreviewLoadingProgress(100, message, { blocking: false });
    hidePreviewLoadingProgress(delayMs);
  }, [hidePreviewLoadingProgress, updatePreviewLoadingProgress]);

  useEffect(() => () => {
    clearPreviewLoadingHideTimer();
  }, [clearPreviewLoadingHideTimer]);

  const notesRef = useRef(notes);
  const slideChainsRef = useRef(slideChains);
  const bpmEventsRef = useRef(bpmEvents);
  const timingGroupsRef = useRef(timingGroups);
  const svEventsRef = useRef(svEvents);
  const undoStackRef = useRef<EditorUndoSnapshot[]>([]);
  const redoStackRef = useRef<EditorUndoSnapshot[]>([]);
  const isUndoRestoringRef = useRef(false);
  /** The committed edit state when the current operation's first edit was requested; one undo step per commit. */
  const pendingUndoSourcesRef = useRef<EditorUndoSnapshot | null>(null);
  const [undoVersion, setUndoVersion] = useState(0);

  const cloneUndoSnapshot = useCallback((snapshot: EditorUndoSnapshot): EditorUndoSnapshot => ({
    notes: snapshot.notes.map((note) => ({ ...note })),
    slideChains: snapshot.slideChains.map((chain) => ({ ...chain, noteIds: [...chain.noteIds] })),
    bpmEvents: snapshot.bpmEvents.map((event) => ({ ...event })),
    timingGroups: ensureTimingGroups(snapshot.timingGroups),
  }), []);

  const buildCurrentUndoSnapshot = useCallback((): EditorUndoSnapshot => (
    cloneUndoSnapshot({
      notes: notesRef.current,
      slideChains: slideChainsRef.current,
      bpmEvents: bpmEventsRef.current,
      timingGroups: timingGroupsRef.current,
    })
  ), [cloneUndoSnapshot]);

  /**
   * Called by an edit setter when it is called (never inside a state updater, which React may run late or more
   * than once): remembers the committed state the operation starts from. The step is recorded at the commit.
   */
  const requestUndoCapture = useCallback(() => {
    if (isUndoRestoringRef.current || pendingUndoSourcesRef.current) {
      return;
    }
    pendingUndoSourcesRef.current = {
      notes: notesRef.current,
      slideChains: slideChainsRef.current,
      bpmEvents: bpmEventsRef.current,
      timingGroups: timingGroupsRef.current,
    };
  }, []);

  useEffect(() => {
    notesRef.current = notes;
    slideChainsRef.current = slideChains;
    bpmEventsRef.current = bpmEvents;
    timingGroupsRef.current = timingGroups;
    svEventsRef.current = svEvents;
    // Every edit requested since the last commit is one step; edits that changed nothing record none.
    const sources = pendingUndoSourcesRef.current;
    if (!sources) {
      return;
    }
    // Derived updates (normalisations after an edit) may replace arrays without changing their content; such a
    // commit is not an edit, so the pending start state stays for the next real change.
    if (sameUndoContent(sources, { notes, slideChains, bpmEvents, timingGroups })) {
      return;
    }
    pendingUndoSourcesRef.current = null;
    const stack = undoStackRef.current;
    // A start state equal to the last recorded one would make an undo that changes nothing.
    const top = stack[stack.length - 1];
    if (top && sameUndoContent(top, sources)) {
      appLog("info", "editor.undo-duplicate-step-skipped", {});
      return;
    }
    stack.push(cloneUndoSnapshot(sources));
    if (stack.length > UNDO_STACK_LIMIT) {
      stack.splice(0, stack.length - UNDO_STACK_LIMIT);
    }
    redoStackRef.current = [];
    setUndoVersion((previous) => previous + 1);
  }, [bpmEvents, cloneUndoSnapshot, notes, slideChains, svEvents, timingGroups]);

  const resolveStateAction = useCallback(<T,>(
    action: SetStateAction<T>,
    previous: T,
  ): T => {
    if (typeof action === "function") {
      return (action as (current: T) => T)(previous);
    }
    return action;
  }, []);

  const setMetadata = useCallback((nextAction: SetStateAction<ChartMetadata>) => {
    setMetadataState((previous) => {
      const next = resolveStateAction(nextAction, previous);
      return next;
    });
  }, [resolveStateAction]);

  const setSettings = useCallback((nextAction: SetStateAction<ChartSettings>) => {
    setSettingsState((previous) => {
      const next = resolveStateAction(nextAction, previous);
      return next;
    });
  }, [resolveStateAction]);

  const setNotes = useCallback((nextAction: SetStateAction<ChartNote[]>) => {
    requestUndoCapture();
    setNotesState((previous) => {
      const rawNext = resolveStateAction(nextAction, previous);
      const next = isHabahiroEnabled
        ? applyHabahiroLongWidths(
          rawNext,
          slideChainsRef.current,
          inferPreferredHabahiroLongWidths(previous, rawNext, slideChainsRef.current),
        )
        : rawNext;
      return next;
    });
  }, [isHabahiroEnabled, requestUndoCapture, resolveStateAction]);

  const setSlideChains = useCallback((nextAction: SetStateAction<SlideChain[]>) => {
    requestUndoCapture();
    setSlideChainsState((previous) => {
      const next = resolveStateAction(nextAction, previous);
      return next;
    });
  }, [requestUndoCapture, resolveStateAction]);

  useEffect(() => {
    if (skipProjectWidthAdjustmentRef.current) { skipProjectWidthAdjustmentRef.current = false; return; }
    if (!isHabahiroEnabled || slideChains.length === 0) {
      return;
    }
    setNotesState((previous) => applyHabahiroLongWidths(previous, slideChains));
  }, [isHabahiroEnabled, slideChains]);

  const setBpmEvents = useCallback((nextAction: SetStateAction<ChartBpmEvent[]>) => {
    requestUndoCapture();
    setBpmEventsState((previous) => {
      const next = resolveStateAction(nextAction, previous);
      return next;
    });
  }, [requestUndoCapture, resolveStateAction]);

  const setTimingGroups = useCallback((nextAction: SetStateAction<ChartTimingGroupMap>) => {
    requestUndoCapture();
    setTimingGroupsState((previous) => {
      const next = ensureTimingGroups(resolveStateAction(nextAction, previous));
      return next;
    });
  }, [requestUndoCapture, resolveStateAction]);

  const setSvEvents = useCallback((nextAction: SetStateAction<ChartSvEvent[]>) => {
    requestUndoCapture();
    setTimingGroupsState((previousGroups) => {
      const previous = flattenTimingGroups(previousGroups);
      const next = resolveStateAction(nextAction, previous);
      // Only the groups this edit touched change; a group it empties is cleaned up unless a note or slide chain
      // still belongs to it.
      const belongs = (id: ChartTimingGroupId) => (item: { timingGroup?: string }) =>
        normalizeTimingGroup(item.timingGroup, GLOBAL_TIMING_GROUP_ID) === id;
      return next === previous ? previousGroups : applySvEventsToTimingGroups(previousGroups, next,
        (id) => notesRef.current.some(belongs(id)) || slideChainsRef.current.some(belongs(id)));
    });
  }, [requestUndoCapture, resolveStateAction]);

  const timingGroupIds = useMemo(() => sortTimingGroupIds(Object.keys(timingGroups)), [timingGroups]);

  const isTimingGroupModeActive =
    isTimingGroupModeEnabled && selectedTimingGroupId !== GLOBAL_TIMING_GROUP_ID;
  const activeTimingGroupId = isTimingGroupModeActive
    ? selectedTimingGroupId
    : GLOBAL_TIMING_GROUP_ID;
  const toolTimingGroup = activeTimingGroupId;
  const setTimingGroupPanelOpenForMode = useCallback((value: boolean) => {
    if (value && !isExGarupaEnabled) {
      showDialog("ExGarupa 模式关闭时不可使用 Timing Group。");
      return;
    }
    setIsTimingGroupPanelOpen(value);
  }, [isExGarupaEnabled, showDialog]);

  const normalizeObjectTimingGroup = useCallback(
    (value: unknown): ChartTimingGroupId => normalizeTimingGroup(value, GLOBAL_TIMING_GROUP_ID),
    [normalizeTimingGroup],
  );

  const createTimingGroup = useCallback(() => {
    if (!isExGarupaEnabled) {
      showDialog("ExGarupa 模式关闭时不可使用 Timing Group。");
      return;
    }
    setTimingGroups((previous) => {
      const id = nextTimingGroupId(Object.keys(previous));
      setSelectedTimingGroupId(id);
      setIsTimingGroupModeEnabled(true);
      return {
        ...previous,
        [id]: { sv: [] },
      };
    });
    setSelectedNoteIds([]);
  }, [
    isExGarupaEnabled,
    setSelectedNoteIds,
    showDialog,
    setTimingGroups,
  ]);

  /**
   * Adds the next numbered timing group (#n, filling gaps) and returns its id, without switching the editor into
   * timing group mode; the SV tool's group picker uses it. Null when ExGarupa is off.
   */
  const addTimingGroup = useCallback((): ChartTimingGroupId | null => {
    if (!isExGarupaEnabled) {
      showDialog("ExGarupa 模式关闭时不可使用 Timing Group。");
      return null;
    }
    const id = nextTimingGroupId(Object.keys(timingGroupsRef.current));
    setTimingGroups((previous) => (previous[id] ? previous : { ...previous, [id]: { sv: [] } }));
    return id;
  }, [isExGarupaEnabled, setTimingGroups, showDialog]);

  const deleteTimingGroup = useCallback((groupId: ChartTimingGroupId) => {
    if (!isExGarupaEnabled) {
      showDialog("ExGarupa 模式关闭时不可使用 Timing Group。");
      return;
    }
    const normalized = normalizeObjectTimingGroup(groupId);
    if (normalized === GLOBAL_TIMING_GROUP_ID) {
      showDialog(`${GLOBAL_TIMING_GROUP_DISPLAY_NAME} 不能删除。`);
      return;
    }
    setTimingGroups((previous) => {
      if (!previous[normalized]) {
        return previous;
      }
      const next: ChartTimingGroupMap = {};
      for (const [id, group] of Object.entries(previous)) {
        if (id !== normalized) {
          next[id] = group;
        }
      }
      return next;
    });
    setNotes((previous) => previous.map((note) =>
      normalizeObjectTimingGroup(note.timingGroup) === normalized
        ? { ...note, timingGroup: undefined }
        : note,
    ));
    setSlideChains((previous) => previous.map((chain) =>
      normalizeObjectTimingGroup(chain.timingGroup) === normalized
        ? { ...chain, timingGroup: undefined }
        : chain,
    ));
    setSelectedTimingGroupId(GLOBAL_TIMING_GROUP_ID);
    setIsTimingGroupModeEnabled(false);
    setSelectedNoteIds([]);
  }, [
    isExGarupaEnabled,
    normalizeObjectTimingGroup,
    setNotes,
    setSelectedNoteIds,
    setSlideChains,
    showDialog,
    setTimingGroups,
  ]);

  useEffect(() => {
    if (timingGroups[selectedTimingGroupId]) {
      return;
    }
    setSelectedTimingGroupId(GLOBAL_TIMING_GROUP_ID);
    setIsTimingGroupModeEnabled(false);
  }, [selectedTimingGroupId, timingGroups]);

  /**
   * Drops the whole undo/redo history, including the step the current operation is about to record. Used after a
   * mode switch regresses the chart: history from before it could restore features the new mode does not allow.
   */
  const discardUndoHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    pendingUndoSourcesRef.current = null;
    setUndoVersion((previous) => previous + 1);
  }, []);

  const canUndoLastOperation = useMemo(
    () => undoStackRef.current.length > 0,
    [undoVersion],
  );
  const canRedoLastOperation = useMemo(
    () => redoStackRef.current.length > 0,
    [undoVersion],
  );

  const undoLastOperation = useCallback((): boolean => {
    const stack = undoStackRef.current;
    // A recorded state equal to the current one would change nothing; it is dropped rather than spending a click.
    const current = buildCurrentUndoSnapshot();
    let snapshot = stack.pop();
    let skipped = 0;
    while (snapshot && sameUndoContent(snapshot, current)) {
      skipped += 1;
      snapshot = stack.pop();
    }
    if (skipped > 0) appLog("info", "editor.undo-noop-steps-skipped", { skipped });
    if (!snapshot) {
      setUndoVersion((previous) => previous + 1);
      return false;
    }

    isUndoRestoringRef.current = true;
    pendingUndoSourcesRef.current = null;
    const currentSnapshot = buildCurrentUndoSnapshot();
    redoStackRef.current.push(currentSnapshot);
    if (redoStackRef.current.length > UNDO_STACK_LIMIT) {
      redoStackRef.current.splice(0, redoStackRef.current.length - UNDO_STACK_LIMIT);
    }
    setNotesState(snapshot.notes.map((note) => ({ ...note })));
    setSlideChainsState(snapshot.slideChains.map((chain) => ({ ...chain, noteIds: [...chain.noteIds] })));
    setBpmEventsState(snapshot.bpmEvents.map((event) => ({ ...event })));
    setTimingGroupsState(ensureTimingGroups(snapshot.timingGroups));
    setSelectedNoteIds([]);
    setUndoVersion((previous) => previous + 1);

    queueMicrotask(() => {
      isUndoRestoringRef.current = false;
    });
    return true;
  }, [buildCurrentUndoSnapshot, showDialog]);

  const redoLastOperation = useCallback((): boolean => {
    const stack = redoStackRef.current;
    // A recorded state equal to the current one would change nothing; it is dropped rather than spending a click.
    const current = buildCurrentUndoSnapshot();
    let snapshot = stack.pop();
    let skipped = 0;
    while (snapshot && sameUndoContent(snapshot, current)) {
      skipped += 1;
      snapshot = stack.pop();
    }
    if (skipped > 0) appLog("info", "editor.redo-noop-steps-skipped", { skipped });
    if (!snapshot) {
      setUndoVersion((previous) => previous + 1);
      return false;
    }

    isUndoRestoringRef.current = true;
    pendingUndoSourcesRef.current = null;
    const currentSnapshot = buildCurrentUndoSnapshot();
    undoStackRef.current.push(currentSnapshot);
    if (undoStackRef.current.length > UNDO_STACK_LIMIT) {
      undoStackRef.current.splice(0, undoStackRef.current.length - UNDO_STACK_LIMIT);
    }
    setNotesState(snapshot.notes.map((note) => ({ ...note })));
    setSlideChainsState(snapshot.slideChains.map((chain) => ({ ...chain, noteIds: [...chain.noteIds] })));
    setBpmEventsState(snapshot.bpmEvents.map((event) => ({ ...event })));
    setTimingGroupsState(ensureTimingGroups(snapshot.timingGroups));
    setSelectedNoteIds([]);
    setUndoVersion((previous) => previous + 1);

    queueMicrotask(() => {
      isUndoRestoringRef.current = false;
    });
    return true;
  }, [buildCurrentUndoSnapshot, showDialog]);

  const [audioFileName, setAudioFileName] = useState("");
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const audioObjectUrl = chartMediaLease.urls.bgm ?? null;
  const [isCoverLoadFailed, setIsCoverLoadFailed] = useState(false);
  const [beatInputText, setBeatInputText] = useState("");
  const [bpmInputText, setBpmInputText] = useState("");
  const [svInputText, setSvInputText] = useState("");
  const [laneInputText, setLaneInputText] = useState("");
  const [widthInputText, setWidthInputText] = useState("");
  const [selectionMovePreview, setSelectionMovePreview] = useState<{
    laneDelta: number;
    beatDelta: number;
    isDragging: boolean;
  } | null>(null);
  const [slideBuildState, setSlideBuildState] = useState<SlideBuildState | null>(null);
  // The pointer during a Slide build, where its following connection line ends: kept out of React state, as the cursor preview is, so moving
  // the pointer redraws the playfield canvas without rendering the editor again.
  const slideBuildCursorRef = useRef<{ x: number; y: number } | null>(null);
  const setSlideBuildCursor = useCallback((next: { x: number; y: number } | null) => {
    slideBuildCursorRef.current = next;
  }, []);
  const beatInputEditingRef = useRef(false);
  const bpmInputEditingRef = useRef(false);
  const svInputEditingRef = useRef(false);
  const laneInputEditingRef = useRef(false);
  const widthInputEditingRef = useRef(false);

  const [windowPresetId, setWindowPresetId] = useState(DEFAULT_WINDOW_PRESET_ID);
  const [playbackWindowPresetId, setPlaybackWindowPresetId] = useState(DEFAULT_PLAYBACK_WINDOW_PRESET_ID);
  const [playbackFps, setPlaybackFps] = useState(60);
  const [playbackMvMode, setPlaybackMvMode] = useState(false);
  const [playbackMvAlphaPercent, setPlaybackMvAlphaPercent] = useState(100);
  const [playbackAllPerfectStatusDisplayMode, setPlaybackAllPerfectStatusDisplayMode] =
    useState(SIMULATOR_PRE_ADAPTATION_DEFAULTS.allPerfectStatusDisplayMode);
  const [skinSelection, setSkinSelection] = useState<SkinSelection>(() => normalizeSkinSelection(DEFAULT_SKIN_SELECTION));
  const [pendingSkinSelection, setPendingSkinSelection] = useState<SkinSelection>(() =>
    normalizeSkinSelection(DEFAULT_SKIN_SELECTION),
  );
  const [bestdoriSkinCatalogOptions, setBestdoriSkinCatalogOptions] = useState<BestdoriSkinCatalogOptions | null>(null);
  const [bestdoriCatalogStatus, setBestdoriCatalogStatus] = useState("正在加载资源站目录…");
  const formatTypeLabel = useCallback((kind: BestdoriCatalogKind | null, type: string): string => {
    const normalized = type.trim();
    if (normalized.length === 0) return "TYPE?";
    return kind === null
      ? normalized
      : bestdoriSkinCatalogOptions?.labels[kind]?.[normalized] ?? normalized;
  }, [bestdoriSkinCatalogOptions]);
  const [skinAssets, setSkinAssets] = useState<SkinAssets | null>(null);
  const [appliedSkinResources, setAppliedSkinResources] = useState<AppliedSkinResources | null>(null);
  const [isSkinApplying, setIsSkinApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const refreshed = await resourceManager.prepareCatalog("bestdori");
      if (refreshed.status === "rejected" || cancelled) {
        if (!cancelled) setBestdoriCatalogStatus("资源站目录不可用，且没有可用离线快照。");
        return;
      }
      setBestdoriCatalogStatus(refreshed.value.freshness === "offline-cached"
        ? `离线目录快照：${refreshed.value.observedAt ?? "时间未知"}`
        : `在线目录：${refreshed.value.observedAt ?? "刚刚"}`);
      const listed = await resourceManager.listResources({ origin: "network", provider: "bestdori" });
      if (listed.status === "rejected" || cancelled) return;
      setBestdoriSkinCatalogOptions(buildBestdoriSkinCatalogOptionsFromDescriptors(
        listed.value.filter((resource) => resource.origin === "network"),
      ));
    })();
    return () => {
      cancelled = true;
    };
  }, [resourceManager]);
  const [spriteAspectRatios, setSpriteAspectRatios] = useState<Record<string, number>>({});
  const isSkinReady = skinAssets !== null;

  const playfieldRef = useRef<HTMLDivElement | null>(null);
  const { verticalZoom, viewportWidth, attachViewport, viewportElement } = useEditorViewportZoom(playfieldRef, isSkinReady);
  const uiScale = useUiViewport().scale;
  const scrollPadding = useEditorScrollExtent(playfieldRef, viewportElement, viewportPlaybackPositionPercent);
  // The track always fills the track zone, which ends where the flat lane art (FIELD_WIDTH_LANES lanes, wider than
  // the lanes by its edge bars) meets the right mask.
  const trackZone = trackZoneGeometry(viewportWidth, EDITOR_EDGE_SOFTNESS * uiScale, FIELD_WIDTH_LANES / settings.laneCount);
  const trackWidth = trackZone.width;
  const trackZoneShiftX = trackZone.shift;
  const LANE_WIDTH = Math.max(1, trackWidth / settings.laneCount);
  // Half of one standard lane of the track zone. It must not follow the lane count: the minimap's width changes
  // the editor's width, which would move the track a frame after every lane count change.
  const minimapWidth = Math.max(1, TRACK_ZONE_WIDTH * viewportWidth / 7 / 2);
  const playfieldBoardRef = useRef<HTMLDivElement | null>(null);
  const playfieldTrackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Event bubble hit boxes from the last track frame: the bubbles are where events are selected and deleted. */
  const eventBubbleHitsRef = useRef<EventBubbleHit[]>([]);
  const playfieldNoteCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackTickRafRef = useRef<number | null>(null);
  const playbackTickLastNowMsRef = useRef<number | null>(null);
  const playbackViewportSyncStampRef = useRef(0);
  const playbackDurationLimitSecRef = useRef(0);
  const playbackHasAudioTrackRef = useRef(false);
  const playbackNowSecRef = useRef(0);
  const playbackStartSeqRef = useRef(0);
  const playbackIsPlayingRef = useRef(false);
  const playbackEventCursorRef = useRef(0);
  const playbackSlideStartCursorRef = useRef(0);
  const playbackSlideEndCursorRef = useRef(0);
  const playbackSePoolBySrcRef = useRef<Map<string, { players: HTMLAudioElement[]; nextIndex: number }>>(new Map());
  const playbackActiveSlideLoopIdSetRef = useRef<Set<string>>(new Set());
  const playbackLongLoopPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackLongLoopSrcRef = useRef<string | null>(null);
  const playbackSeAudioContextRef = useRef<AudioContext | null>(null);
  const playbackSeMasterGainRef = useRef<GainNode | null>(null);
  const playbackBgmGainRef = useRef<GainNode | null>(null);
  const playbackBgmBufferBySrcRef = useRef<Map<string, AudioBuffer>>(new Map());
  const playbackBgmDecodeTaskBySrcRef = useRef<Map<string, Promise<AudioBuffer | null>>>(new Map());
  const playbackBgmCacheSeqRef = useRef(0);
  const playbackBgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackBgmClockBaseSecRef = useRef(0);
  const playbackBgmClockBaseContextTimeSecRef = useRef(0);
  const playbackBgmPlaybackRateRef = useRef(1);
  /** The decoded BGM being played; the source may hold a time-stretched copy of it. */
  const playbackBgmOriginalBufferRef = useRef<AudioBuffer | null>(null);
  const playbackBgmSpeedChangeSeqRef = useRef(0);
  const playbackBgmDurationSecRef = useRef(0);
  const playbackSeBufferBySrcRef = useRef<Map<string, AudioBuffer>>(new Map());
  const playbackSeDecodeTaskBySrcRef = useRef<Map<string, Promise<AudioBuffer | null>>>(new Map());
  const playbackSeWebAudioOneshotSetRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playbackSeWebAudioLongLoopSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackSeWebAudioLongLoopSrcRef = useRef<string | null>(null);
  const playbackLineMode: PlaybackLineMode = isPlaybackFollowEnabled ? "follow" : "free";
  const playbackLineModeRef = useRef<PlaybackLineMode>(playbackLineMode);
  const playbackRuntimeLineRef = useRef<HTMLDivElement | null>(null);
  const playbackGuideHostRef = useRef<HTMLDivElement | null>(null);
  const playbackGuideLabelRef = useRef<HTMLDivElement | null>(null);
  const playbackGuidePendingRef = useRef<{ y: number; timeSec: number } | null>(null);
  const playbackGuideRafRef = useRef<number | null>(null);
  const playbackGuideTotalLabelRef = useRef("?");
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const resolveBoardPlacementRef = useRef<(
    (
      x: number,
      y: number,
      options?: {
        ignoreLane?: boolean;
        type?: NoteType;
        directionalWidth?: number;
        rhythmWidth?: number;
      },
    ) => { lane: number; beat: number } | null
  ) | null>(null);
  const activeToolRef = useRef<EditorTool>(tool);
  const canvasCursorPreviewRef = useRef<CursorPreviewState | null>(null);
  const cursorPreviewPendingRef = useRef<CursorPreviewState | null>(null);
  const cursorPreviewRafRef = useRef<number | null>(null);
  const selectionDragRef = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isDragging: boolean;
  } | null>(null);
  const selectionMoveRef = useRef<{
    startClientX: number;
    startClientY: number;
    startBoardY: number;
    anchorNoteId: string | null;
    anchorLane: number | null;
    anchorBeat: number | null;
    isDragging: boolean;
  } | null>(null);
  const slideBuildRef = useRef<SlideBuildState | null>(null);
  const suppressNextBoardClickRef = useRef(false);
  const suppressNextNoteClickRef = useRef(false);
  const jsonImportRef = useRef<HTMLInputElement | null>(null);
  const bestdoriV2ImportRef = useRef<HTMLInputElement | null>(null);
  const skinApplySeqRef = useRef(0);
  const simulatorHandoffLeasesRef = useRef<Map<string, ResourceConsumerLease>>(new Map());
  const applyBestdoriSkinSelectionRef = useRef<any>(async () => {});
  const lastStandardRhythmSkinRef = useRef<Pick<SkinSelection, "rhythmType" | "rhythmRipName" | "rhythmServer"> | null>(null);
  const syncingHabahiroSkinRef = useRef(false);
  const viewBottomTimeSecRef = useRef<number | null>(null);
  const didInitTimelineScrollRef = useRef(false);
  const editorConfigCacheRef = useRef<Partial<Record<EditorConfigCacheKey, EditorConfigCacheValue>>>({});
  const lastEditorConfigTypeRef = useRef<EditorConfigCacheKey | null>(null);
  const isApplyingEditorCacheRef = useRef(false);
  useEffect(() => {
    activeToolRef.current = tool;
  }, [tool]);
  useEffect(() => () => {
    for (const lease of simulatorHandoffLeasesRef.current.values()) void lease.release();
    simulatorHandoffLeasesRef.current.clear();
  }, []);
  const setCursorPreview = useCallback((next: CursorPreviewState | null) => {
    canvasCursorPreviewRef.current = next;
    const shouldSyncCanvasState = activeToolRef.current === "paste";
    if (!shouldSyncCanvasState) {
      return;
    }
    cursorPreviewPendingRef.current = next;
    if (cursorPreviewRafRef.current !== null) {
      return;
    }
    cursorPreviewRafRef.current = requestAnimationFrame(() => {
      cursorPreviewRafRef.current = null;
      setCursorPreviewState(cursorPreviewPendingRef.current);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (cursorPreviewRafRef.current !== null) {
        cancelAnimationFrame(cursorPreviewRafRef.current);
        cursorPreviewRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      lastPointerClientRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  useEffect(() => {
    setIsCoverLoadFailed(false);
  }, [chartMediaLease.urls.cover]);

  useEffect(() => {
    setMetadata((current) => {
      if (current.title !== "Untitled Song") {
        return current;
      }
      return { ...current, title: "Untitled" };
    });
  }, []);

  const laneValues = useMemo(() => getLaneValues(settings.laneCount), [settings.laneCount]);
  const laneMin = laneValues[0];
  const beatsPerMeasure = normalizePositiveInt(settings.timeSignatureNumerator, 4);
  const beatDivision = normalizePositiveInt(settings.timeSignatureDenominator, 4);
  const beatStep = 1 / beatDivision;
  const noteVisualScale = clamp(appOptionSettings.rhythmNoteSizePercent / 100, 0.1, 2);
  const longLineOpacityScale = clamp(appOptionSettings.longLineBrightnessPercent / 100, 0.1, 1);
  const verticalScale = clamp(appOptionSettings.verticalScalePercent / 100, 0.5, 2) * verticalZoom;
  const noteSeVolumeScale = clamp(appOptionSettings.noteSeVolumePercent / 100, 0, 1);
  const timelinePixelsPerSecond = (BEAT_HEIGHT * uiScale * verticalScale * TIMELINE_REFERENCE_BPM) / 60;
  const bpmTimeline = useMemo(
    () => buildBpmTimeline(metadata.bpm, bpmEvents),
    [metadata.bpm, bpmEvents],
  );

  const maxNoteBeat = useMemo(() => {
    let maxBeat = 0;
    for (const note of notes) {
      const tailBeat = typeof note.endBeat === "number" ? note.endBeat : note.beat;
      if (tailBeat > maxBeat) {
        maxBeat = tailBeat;
      }
    }
    return maxBeat;
  }, [notes]);

  const audioBeatByAbsoluteTime = useMemo(() => {
    if (!Number.isFinite(audioDurationSec) || audioDurationSec <= 0) {
      return 0;
    }
    return secondsToBeat(audioDurationSec, bpmTimeline);
  }, [audioDurationSec, bpmTimeline]);

  const totalBeats = useMemo(() => {
    const minimumBeats = beatsPerMeasure * 8;
    const fromAudio = audioBeatByAbsoluteTime;
    const fromNotes = maxNoteBeat + beatsPerMeasure;
    const required = Math.max(minimumBeats, fromAudio, fromNotes);
    const aligned = Math.ceil(required / beatsPerMeasure) * beatsPerMeasure;
    return aligned + beatsPerMeasure;
  }, [audioBeatByAbsoluteTime, beatsPerMeasure, maxNoteBeat]);

  const totalDurationSec = useMemo(() => {
    const durationFromTailBeat = beatToSeconds(totalBeats, bpmTimeline);
    const durationFromTimeline = bpmTimeline.reduce(
      (maxValue, node) => Math.max(maxValue, Number.isFinite(node.timeSec) ? node.timeSec : 0),
      0,
    );
    return Math.max(durationFromTailBeat, durationFromTimeline);
  }, [totalBeats, bpmTimeline]);

  const totalSteps = Math.max(1, Math.ceil(totalBeats * beatDivision));
  const boardWidth = settings.laneCount * LANE_WIDTH;
  const boardHeight = Math.max(1, totalDurationSec * timelinePixelsPerSecond);
  const hasUploadedAudio = chartMediaResources.bgm !== null;
  const chartPlayableDurationSec = useMemo(
    () => Math.max(0, beatToSeconds(maxNoteBeat, bpmTimeline)),
    [bpmTimeline, maxNoteBeat],
  );
  const playbackCeilingSec = hasUploadedAudio
    ? Math.max(
      Number.isFinite(audioDurationSec) && audioDurationSec > 0 ? audioDurationSec : 0,
      chartPlayableDurationSec,
    )
    : chartPlayableDurationSec;
  const currentPlaybackSpeed = PLAYBACK_SPEED_OPTIONS[Math.max(0, playbackSpeedIndex)] ?? 1;
  const playbackTotalLabel = hasUploadedAudio ? formatDuration(playbackCeilingSec) : "?";
  const playbackSpeedLabel = `${Number(currentPlaybackSpeed.toFixed(2))}x`;
  const playbackVolumeLabel = `${Math.round(playbackVolumePercent)}`;
  const playbackPositionLabel = `${Math.round(playbackLinePositionPercent)}%`;
  const getPlaybackNowLabel = useCallback(
    () => formatDuration(playbackNowSecRef.current),
    [formatDuration],
  );
  useEffect(() => {
    isSvPreviewEnabledRef.current = isSvPreviewEnabled;
    if (isSvPreviewEnabled) {
      const currentTimeSec = Math.max(0, playbackNowSecRef.current);
      svPreviewTimeSecRef.current = currentTimeSec;
      setSvPreviewTimeSec(currentTimeSec);
    }
  }, [isSvPreviewEnabled]);
  useEffect(() => {
    svPreviewTimeSecRef.current = svPreviewTimeSec;
  }, [svPreviewTimeSec]);
  useEffect(() => {
    playbackLineModeRef.current = playbackLineMode;
  }, [playbackLineMode]);
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note] as const)), [notes]);
  // While an edge of the selection frame is dragged, the notes are drawn as the drag would leave them. The
  // preview is render-only: the chart, its undo history and every interaction keep the committed notes.
  const [selectionWidthPreview, setSelectionWidthPreview] = useState<{
    edge: SelectionWidthEdge; delta: number; notes: ChartNote[] | null;
  } | null>(null);
  const displayNotes = selectionWidthPreview?.notes ?? notes;
  const displayNoteById = useMemo(
    () => displayNotes === notes ? noteById : new Map(displayNotes.map((note) => [note.id, note] as const)),
    [displayNotes, noteById, notes],
  );
  const visibleNoteCount = useMemo(
    () => notes.reduce((count, note) => (note.type === "hidden" ? count : count + 1), 0),
    [notes],
  );
  const committedSlideChainById = useMemo(
    () => new Map(slideChains.map((chain) => [chain.id, chain] as const)),
    [slideChains],
  );
  const committedSlideRoleByNoteId = useMemo(() => {
    const roleMap = new Map<string, { chainId: string; index: number; length: number }>();
    for (const chain of slideChains) {
      for (let index = 0; index < chain.noteIds.length; index += 1) {
        const noteId = chain.noteIds[index];
        if (roleMap.has(noteId)) {
          continue;
        }
        roleMap.set(noteId, {
          chainId: chain.id,
          index,
          length: chain.noteIds.length,
        });
      }
    }
    return roleMap;
  }, [slideChains]);
  const effectiveSlideChains = useMemo(() => {
    if (!slideBuildState) {
      return slideChains;
    }
    const buildingIds = Array.from(new Set(slideBuildState.noteIds)).filter((id) => noteById.has(id));
    const buildingSet = new Set(buildingIds);
    const cleaned = slideChains
      .map((chain) => ({
        ...chain,
        noteIds: chain.noteIds.filter((id) => !buildingSet.has(id)),
      }))
      .filter((chain) => chain.noteIds.length > 0);

    if (buildingIds.length === 0) {
      return cleaned;
    }

    return [
      ...cleaned,
      {
        id: "__slide_build_preview__",
        noteIds: buildingIds,
      },
    ];
  }, [noteById, slideBuildState, slideChains]);

  const slideRoleByNoteId = useMemo(() => {
    const roleMap = new Map<string, { chainId: string; index: number; length: number }>();
    for (const chain of effectiveSlideChains) {
      const ids = chain.noteIds.filter((id) => noteById.has(id));
      for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        if (roleMap.has(id)) {
          continue;
        }
        roleMap.set(id, { chainId: chain.id, index, length: ids.length });
      }
    }
    return roleMap;
  }, [effectiveSlideChains, noteById]);

  const selectedNoteId = selectedNoteIds[0] ?? null;
  const isSlideBuilding = slideBuildState !== null;
  const slideBuildSelectedIdSet = useMemo(
    () => new Set(slideBuildState?.noteIds ?? []),
    [slideBuildState],
  );
  const selectedNoteIdSet = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds]);
  const selectedNotes = useMemo(
    () => notes.filter((note) => selectedNoteIdSet.has(note.id)),
    [notes, selectedNoteIdSet],
  );
  const noteTimingGroupIdByNoteId = useMemo(() => {
    const map = new Map<string, ChartTimingGroupId>();
    for (const note of notes) {
      map.set(note.id, normalizeObjectTimingGroup(note.timingGroup));
    }
    for (const chain of slideChains) {
      const chainTimingGroup = normalizeObjectTimingGroup(chain.timingGroup);
      for (const noteId of chain.noteIds) {
        map.set(noteId, chainTimingGroup);
      }
    }
    return map;
  }, [normalizeObjectTimingGroup, notes, slideChains]);
  const selectedObjectTimingGroupId = useMemo(() => {
    if (selectedNotes.length === 0) {
      return GLOBAL_TIMING_GROUP_ID;
    }
    const groups = selectedNotes.map((note) =>
      noteTimingGroupIdByNoteId.get(note.id) ?? normalizeObjectTimingGroup(note.timingGroup),
    );
    const first = groups[0] ?? GLOBAL_TIMING_GROUP_ID;
    return groups.every((group) => group === first) ? first : GLOBAL_TIMING_GROUP_ID;
  }, [normalizeObjectTimingGroup, noteTimingGroupIdByNoteId, selectedNotes]);
  const visibleSvEvents = useMemo(() => {
    return svEvents.filter((event) => {
      const groupId = normalizeObjectTimingGroup(event.timingGroup);
      if (!isTimingGroupModeActive) {
        return groupId === GLOBAL_TIMING_GROUP_ID;
      }
      return groupId === GLOBAL_TIMING_GROUP_ID || groupId === selectedTimingGroupId;
    });
  }, [isTimingGroupModeActive, normalizeObjectTimingGroup, selectedTimingGroupId, svEvents]);
  const interactiveSvEvents = useMemo(
    () => visibleSvEvents.filter((event) => {
      if (!isTimingGroupModeActive) {
        return true;
      }
      return normalizeObjectTimingGroup(event.timingGroup) === selectedTimingGroupId;
    }),
    [isTimingGroupModeActive, normalizeObjectTimingGroup, selectedTimingGroupId, visibleSvEvents],
  );
  const isNoteOutsideActiveTimingGroup = useCallback((note: ChartNote): boolean => {
    if (!isTimingGroupModeActive) {
      return false;
    }
    const groupId = noteTimingGroupIdByNoteId.get(note.id) ?? normalizeObjectTimingGroup(note.timingGroup);
    return groupId !== selectedTimingGroupId;
  }, [
    isTimingGroupModeActive,
    normalizeObjectTimingGroup,
    noteTimingGroupIdByNoteId,
    selectedTimingGroupId,
  ]);
  const interactiveNotes = useMemo(
    () => notes.filter((note) => !isNoteOutsideActiveTimingGroup(note)),
    [isNoteOutsideActiveTimingGroup, notes],
  );
  const displayInteractiveNotes = useMemo(
    () => displayNotes === notes ? interactiveNotes : displayNotes.filter((note) => !isNoteOutsideActiveTimingGroup(note)),
    [displayNotes, interactiveNotes, isNoteOutsideActiveTimingGroup, notes],
  );
  useEffect(() => {
    if (!isTimingGroupModeActive) {
      return;
    }
    const interactiveIds = new Set(interactiveNotes.map((note) => note.id));
    setSelectedNoteIds((previous) => {
      const next = previous.filter((id) => interactiveIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [interactiveNotes, isTimingGroupModeActive]);
  const setSelectedObjectTimingGroupId = useCallback((nextGroup: ChartTimingGroupId) => {
    if (!isExGarupaEnabled) {
      showDialog("ExGarupa 模式关闭时不可使用 Timing Group。");
      return;
    }
    const normalizedGroup = normalizeObjectTimingGroup(nextGroup);
    const nextNoteTimingGroup = normalizedGroup === GLOBAL_TIMING_GROUP_ID ? undefined : normalizedGroup;
    const selectedSet = new Set(selectedNoteIds);
    if (selectedSet.size === 0) {
      return;
    }
    const chainIdsToUpdate = new Set<string>();
    for (const id of selectedSet) {
      const role = slideRoleByNoteId.get(id);
      if (role) {
        chainIdsToUpdate.add(role.chainId);
      }
    }
    setSlideChains((previous) =>
      previous.map((chain) =>
        chainIdsToUpdate.has(chain.id)
          ? { ...chain, timingGroup: nextNoteTimingGroup }
          : chain,
      ),
    );
    const chainNoteIds = new Set<string>();
    for (const chain of slideChains) {
      if (chainIdsToUpdate.has(chain.id)) {
        for (const id of chain.noteIds) {
          chainNoteIds.add(id);
        }
      }
    }
    setNotes((previous) =>
      previous.map((note) =>
        selectedSet.has(note.id) || chainNoteIds.has(note.id)
          ? { ...note, timingGroup: nextNoteTimingGroup }
          : note,
      ),
    );
  }, [
    isExGarupaEnabled,
    normalizeObjectTimingGroup,
    selectedNoteIds,
    setNotes,
    setSlideChains,
    showDialog,
    slideChains,
    slideRoleByNoteId,
  ]);
  const buildCopiedChartPayload = useCallback(
    (noteIds: string[], bpmIds: string[], svIds: string[] = []): CopiedChartPayload | null => {
      const selectedNoteIdSet = new Set(noteIds);
      const selectedBpmIdSet = new Set(bpmIds);
      const selectedSvIdSet = new Set(svIds);
      const copiedSvEvents = sortSvEvents(
        svEvents
          .filter((event) => selectedSvIdSet.has(event.id))
          .filter((event) => normalizeObjectTimingGroup(event.timingGroup) !== GLOBAL_TIMING_GROUP_ID)
          .map((event) => ({ ...event })),
      );
      const copiedSvGroupSet = new Set(
        copiedSvEvents.map((event) => normalizeObjectTimingGroup(event.timingGroup)),
      );
      const sanitizeCopiedNoteTimingGroup = (note: ChartNote): ChartNote => {
        const timingGroup = noteTimingGroupIdByNoteId.get(note.id) ?? normalizeObjectTimingGroup(note.timingGroup);
        return {
          ...note,
          timingGroup: copiedSvGroupSet.has(timingGroup) ? timingGroup : undefined,
        };
      };
      const copiedNoteById = new Map<string, ChartNote>();
      const copiedChains: CopiedSlideChain[] = [];

      for (const chain of slideChains) {
        const chainIds = chain.noteIds.filter((id) => noteById.has(id));
        if (chainIds.length === 0) {
          continue;
        }

        const visibleEntries = chainIds
          .map((id, chainIndex) => {
            const note = noteById.get(id);
            if (!note || note.type === "hidden") {
              return null;
            }
            return { id, chainIndex };
          })
          .filter((entry): entry is { id: string; chainIndex: number } => entry !== null)
          .map((entry, visibleIndex) => ({ ...entry, visibleIndex }));
        if (visibleEntries.length === 0) {
          continue;
        }

        const selectedVisibleEntries = visibleEntries.filter((entry) => selectedNoteIdSet.has(entry.id));
        if (selectedVisibleEntries.length === 0) {
          continue;
        }

        let groupStart = 0;
        const flushSelectedGroup = (endIndex: number) => {
          const first = selectedVisibleEntries[groupStart];
          const last = selectedVisibleEntries[endIndex];
          if (!first || !last) {
            return;
          }

          let rangeStart = first.chainIndex;
          let rangeEnd = last.chainIndex;
          if (first.visibleIndex === 0) {
            while (rangeStart > 0) {
              const previous = noteById.get(chainIds[rangeStart - 1]);
              if (!previous || previous.type !== "hidden") {
                break;
              }
              rangeStart -= 1;
            }
          }
          if (last.visibleIndex === visibleEntries.length - 1) {
            while (rangeEnd + 1 < chainIds.length) {
              const next = noteById.get(chainIds[rangeEnd + 1]);
              if (!next || next.type !== "hidden") {
                break;
              }
              rangeEnd += 1;
            }
          }

          const segmentIds = chainIds.slice(rangeStart, rangeEnd + 1);
          const visibleCount = segmentIds.reduce((count, id) => {
            const note = noteById.get(id);
            return note && note.type !== "hidden" ? count + 1 : count;
          }, 0);
          if (visibleCount === 0) {
            return;
          }

          for (const id of segmentIds) {
            const note = noteById.get(id);
            if (!note) {
              continue;
            }
            copiedNoteById.set(id, sanitizeCopiedNoteTimingGroup(note));
          }
          if (segmentIds.length >= 2) {
            const chainTimingGroup = normalizeObjectTimingGroup(chain.timingGroup);
            copiedChains.push({
              noteIds: [...segmentIds],
              timingGroup: copiedSvGroupSet.has(chainTimingGroup) ? chainTimingGroup : undefined,
            });
          }
        };

        for (let index = 1; index <= selectedVisibleEntries.length; index += 1) {
          const reachedEnd = index >= selectedVisibleEntries.length;
          const previous = selectedVisibleEntries[index - 1];
          const current = reachedEnd ? null : selectedVisibleEntries[index];
          const isConsecutive =
            previous &&
            current &&
            current.visibleIndex === previous.visibleIndex + 1;
          if (!reachedEnd && isConsecutive) {
            continue;
          }
          flushSelectedGroup(index - 1);
          groupStart = index;
        }
      }

      for (const id of selectedNoteIdSet) {
        if (copiedNoteById.has(id)) {
          continue;
        }
        const note = noteById.get(id);
        if (!note) {
          continue;
        }
        copiedNoteById.set(id, sanitizeCopiedNoteTimingGroup(note));
      }

      const copiedNotes = sortNotes(Array.from(copiedNoteById.values()));
      const copiedBpmEvents = sortBpmEvents(
        bpmEvents
          .filter((event) => selectedBpmIdSet.has(event.id))
          .map((event) => ({ ...event })),
      );
      if (copiedNotes.length === 0 && copiedBpmEvents.length === 0 && copiedSvEvents.length === 0) {
        return null;
      }

      const beatValues = [
        ...copiedNotes.map((note) => note.beat),
        ...copiedBpmEvents.map((event) => event.beat),
        ...copiedSvEvents.map((event) => event.beat),
      ];
      const anchorBeat = beatValues.reduce((minValue, beat) => Math.min(minValue, beat), beatValues[0] ?? 0);
      const notesAtAnchorBeat = copiedNotes.filter((note) => approxEq(note.beat, anchorBeat));
      const laneAnchorEnabled = notesAtAnchorBeat.length > 0;
      const anchorLane = laneAnchorEnabled
        ? notesAtAnchorBeat.reduce((minValue, note) => Math.min(minValue, note.lane), notesAtAnchorBeat[0].lane)
        : 0;

      return {
        notes: copiedNotes,
        bpmEvents: copiedBpmEvents,
        svEvents: copiedSvEvents,
        slideChains: copiedChains,
        anchorBeat,
        anchorLane,
        laneAnchorEnabled,
      };
    },
    [
      approxEq,
      bpmEvents,
      normalizeObjectTimingGroup,
      noteById,
      noteTimingGroupIdByNoteId,
      slideChains,
      sortBpmEvents,
      sortNotes,
      sortSvEvents,
      svEvents,
    ],
  );
  const copySelectionToClipboardPayload = useCallback(
    (noteIds: string[], bpmIds: string[], svIds: string[] = []) => {
      const payload = buildCopiedChartPayload(noteIds, bpmIds, svIds);
      if (!payload) {
        return;
      }
      setCopiedChartPayload(payload);
    },
    [buildCopiedChartPayload],
  );
  const applyCopiedPayloadAtPlacement = useCallback(
    (placement: { lane: number; beat: number }) => {
      if (!copiedChartPayload) {
        return;
      }

      const beatDelta = Number((placement.beat - copiedChartPayload.anchorBeat).toFixed(6));
      const laneDelta = copiedChartPayload.laneAnchorEnabled
        ? Number((placement.lane - copiedChartPayload.anchorLane).toFixed(6))
        : 0;
      const copiedGroupIds = Array.from(new Set(
        copiedChartPayload.svEvents
          .map((event) => normalizeObjectTimingGroup(event.timingGroup))
          .filter((groupId) => groupId !== GLOBAL_TIMING_GROUP_ID),
      ));
      const allocatedGroupIds = new Set(Object.keys(timingGroupsRef.current));
      const pastedGroupBySource = new Map<string, string>();
      for (const sourceGroupId of copiedGroupIds) {
        const nextGroupId = nextTimingGroupId(allocatedGroupIds);
        allocatedGroupIds.add(nextGroupId);
        pastedGroupBySource.set(sourceGroupId, nextGroupId);
      }
      const remapCopiedTimingGroup = (value: unknown): string | undefined => {
        const groupId = normalizeObjectTimingGroup(value);
        const mapped = pastedGroupBySource.get(groupId);
        return mapped && mapped !== GLOBAL_TIMING_GROUP_ID ? mapped : undefined;
      };
      const notePositionKey = (lane: number, beat: number) => `${lane.toFixed(6)}|${beat.toFixed(6)}`;
      const shouldPasteNoteOverlap = (left: ChartNote, right: ChartNote): boolean => {
        if (left.type === "hidden" || right.type === "hidden") {
          return false;
        }
        if (isDirectionalNoteType(left.type) || isDirectionalNoteType(right.type)) {
          return true;
        }
        return normalizeRhythmWidth(left.width) === normalizeRhythmWidth(right.width);
      };
      const sourceToPastedId = new Map<string, string>();
      const existingNotesByPosition = new Map<string, ChartNote[]>();
      for (const note of notesRef.current) {
        const positionKey = notePositionKey(note.lane, note.beat);
        const notesAtPosition = existingNotesByPosition.get(positionKey) ?? [];
        notesAtPosition.push(note);
        existingNotesByPosition.set(positionKey, notesAtPosition);
      }
      const overlappedExistingNoteIds = new Set<string>();
      const pastedNotes: ChartNote[] = [];

      for (const source of copiedChartPayload.notes) {
        const normalized = normalizeNote(
          {
            ...source,
            id: createId(),
            lane: Number((source.lane + laneDelta).toFixed(6)),
            beat: Math.max(0, Number((source.beat + beatDelta).toFixed(6))),
            ...(typeof source.endLane === "number"
              ? { endLane: Number((source.endLane + laneDelta).toFixed(6)) }
              : {}),
            ...(typeof source.endBeat === "number"
              ? { endBeat: Math.max(0, Number((source.endBeat + beatDelta).toFixed(6))) }
              : {}),
            timingGroup: remapCopiedTimingGroup(source.timingGroup),
          },
          settings,
        );
        if (!normalized) {
          continue;
        }
        const positionKey = notePositionKey(normalized.lane, normalized.beat);
        if (normalized.type !== "hidden") {
          const hasOverlappedPastedNote = pastedNotes.some(
            (note) =>
              note.type !== "hidden" &&
              notePositionKey(note.lane, note.beat) === positionKey &&
              shouldPasteNoteOverlap(note, normalized),
          );
          if (hasOverlappedPastedNote) {
            continue;
          }
        }
        const overlappedExistingNotes = existingNotesByPosition.get(positionKey) ?? [];
        for (const existingNote of overlappedExistingNotes) {
          if (shouldPasteNoteOverlap(existingNote, normalized)) {
            overlappedExistingNoteIds.add(existingNote.id);
          }
        }
        sourceToPastedId.set(source.id, normalized.id);
        pastedNotes.push(normalized);
      }

      const pastedNoteMap = new Map(pastedNotes.map((note) => [note.id, note] as const));
      const pastedSlideChains = cleanupSlideChainsHidden({
        chains: copiedChartPayload.slideChains
          .map((chain) => {
            const noteIds = chain.noteIds
              .map((id) => sourceToPastedId.get(id))
              .filter((id): id is string => typeof id === "string");
            const timingGroup = remapCopiedTimingGroup(chain.timingGroup);
            return {
              id: createId(),
              noteIds,
              ...(timingGroup ? { timingGroup } : {}),
            };
          }),
        noteMap: pastedNoteMap,
        minLength: 2,
      });

      const occupiedBpmBeatKeys = new Set(
        bpmEventsRef.current.map((event) => event.beat.toFixed(6)),
      );
      const pastedBpmEvents = copiedChartPayload.bpmEvents
        .map((event) => {
          const normalized = normalizeBpmEvent(
            {
              ...event,
              id: createId(),
              beat: Math.max(0, Number((event.beat + beatDelta).toFixed(6))),
            },
            beatDivision,
            metadata.bpm,
          );
          if (!normalized) {
            return null;
          }
          if (approxEq(normalized.beat, 0)) {
            return null;
          }
          const validatedBpm = normalizeEventBpmForWrite(normalized.bpm, metadata.bpm);
          if (validatedBpm === null) {
            return null;
          }
          return {
            ...normalized,
            bpm: validatedBpm,
          };
        })
        .filter((event): event is ChartBpmEvent => event !== null)
        .filter((event) => {
          const beatKey = event.beat.toFixed(6);
          if (occupiedBpmBeatKeys.has(beatKey)) {
            return false;
          }
          occupiedBpmBeatKeys.add(beatKey);
          return true;
        });

      if (pastedBpmEvents.length > 0) {
        const nextBpmEvents = [...bpmEventsRef.current, ...pastedBpmEvents];
        if (isLastBeatOrderedBpmNegative(metadata.bpm, nextBpmEvents)) {
          showDialog("谱面不合法：\n末尾 BPM 不可为负数", "error");
          return;
        }
      }

      const occupiedSvKeys = new Set(
        svEventsRef.current.map((event) => `${normalizeTimingGroup(event.timingGroup, "#Global")}|${event.beat.toFixed(6)}`),
      );
      const pastedSvEvents = copiedChartPayload.svEvents
        .map((event) => normalizeSvEvent(
          {
            ...event,
            id: createId(),
            beat: Math.max(0, Number((event.beat + beatDelta).toFixed(6))),
            timingGroup: remapCopiedTimingGroup(event.timingGroup) ?? GLOBAL_TIMING_GROUP_ID,
          },
          beatDivision,
          1,
        ))
        .filter((event): event is ChartSvEvent => event !== null)
        .filter((event) => {
          const key = `${normalizeTimingGroup(event.timingGroup, "#Global")}|${event.beat.toFixed(6)}`;
          if (occupiedSvKeys.has(key)) {
            return false;
          }
          occupiedSvKeys.add(key);
          return true;
        });

      if (pastedNotes.length === 0 && pastedSlideChains.length === 0 && pastedBpmEvents.length === 0 && pastedSvEvents.length === 0) {
        return;
      }

      if (pastedNotes.length > 0 || overlappedExistingNoteIds.size > 0) {
        setNotes((previous) => {
          const remainedNotes =
            overlappedExistingNoteIds.size > 0
              ? previous.filter((note) => !overlappedExistingNoteIds.has(note.id))
              : previous;
          const nextNotes = sortNotes([...remainedNotes, ...pastedNotes]);
          return isHabahiroEnabled
            ? applyHabahiroLongWidths(nextNotes, pastedSlideChains)
            : nextNotes;
        });
      }
      if (overlappedExistingNoteIds.size > 0) {
        const remainedNoteMap = new Map(
          notesRef.current
            .filter((note) => !overlappedExistingNoteIds.has(note.id))
            .map((note) => [note.id, note] as const),
        );
        setSlideChains((previous) =>
          cleanupSlideChainsHidden({
            chains: previous.map((chain) => ({
              ...chain,
              noteIds: chain.noteIds.filter((id) => !overlappedExistingNoteIds.has(id)),
            })),
            noteMap: remainedNoteMap,
            minLength: 2,
          }),
        );
      }
      if (pastedSlideChains.length > 0) {
        setSlideChains((previous) => [...previous, ...pastedSlideChains]);
      }
      if (pastedBpmEvents.length > 0) {
        setBpmEvents((previous) => sortBpmEvents([...previous, ...pastedBpmEvents]));
      }
      if (pastedSvEvents.length > 0) {
        setSvEvents((previous) => sortSvEvents([...previous, ...pastedSvEvents]));
      }

      const pastedVisibleNoteIds = pastedNotes
        .filter((note) => note.type !== "hidden")
        .map((note) => note.id);
      setSelectedNoteIds(pastedVisibleNoteIds);
    },
    [
      beatDivision,
      copiedChartPayload,
      createId,
      isHabahiroEnabled,
      approxEq,
      metadata.bpm,
      normalizeBaseBpmForWrite,
      normalizeBpmEvent,
      normalizeEventBpmForWrite,
      normalizeSvEvent,
      normalizeTimingGroup,
      normalizeObjectTimingGroup,
      isLastBeatOrderedBpmNegative,
      normalizeNote,
      setNotes,
      setBpmEvents,
      setSelectedNoteIds,
      setSlideChains,
      setSvEvents,
      showDialog,
      settings,
      sortBpmEvents,
      sortSvEvents,
      sortNotes,
    ],
  );
  const handleSelectionDragCompletedForCopyTool = useCallback(
    (payload: { noteIds: string[]; bpmIds: string[]; svIds?: string[] }) => {
      if (!isToolArmed || tool !== "copy") {
        return;
      }
      copySelectionToClipboardPayload(payload.noteIds, payload.bpmIds, payload.svIds ?? []);
    },
    [copySelectionToClipboardPayload, isToolArmed, tool],
  );
  const copyCurrentSelectionByShortcut = useCallback(() => {
    copySelectionToClipboardPayload(selectedNoteIds, [], []);
  }, [copySelectionToClipboardPayload, selectedNoteIds]);
  const pasteAtMousePositionByShortcut = useCallback(() => {
    if (!copiedChartPayload) {
      return;
    }
    const board = playfieldBoardRef.current;
    const pointer = lastPointerClientRef.current;
    if (!board || !pointer) {
      setIsToolArmed(false);
      return;
    }
    const rect = board.getBoundingClientRect();
    const x = pointer.x - rect.left;
    const y = pointer.y - rect.top;
    const insideBoard = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
    if (!insideBoard) {
      setIsToolArmed(false);
      return;
    }
    const resolver = resolveBoardPlacementRef.current;
    if (!resolver) {
      return;
    }
    const placement = resolver(x, y, {
      ignoreLane: !copiedChartPayload.laneAnchorEnabled,
      type: "single",
    });
    if (!placement) {
      return;
    }
    applyCopiedPayloadAtPlacement(placement);
  }, [applyCopiedPayloadAtPlacement, copiedChartPayload, setIsToolArmed]);
  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );
  const selectedNoteCount = selectedNoteIds.length;
  const hasNoteSelection = selectedNoteCount > 0;
  const minSelectedBeat = useMemo(
    () => selectedNotes.reduce((minValue, note) => Math.min(minValue, note.beat), selectedNotes[0]?.beat ?? 0),
    [selectedNotes],
  );
  const minSelectedLane = selectedNotes.length > 0
    ? selectedNotes.reduce((minValue, note) => Math.min(minValue, note.lane), selectedNotes[0].lane)
    : 0;
  const coverImageSrc = chartMediaLease.urls.cover && !isCoverLoadFailed
    ? chartMediaLease.urls.cover
    : defaultCoverImage;
  const playbackNoteHitEvents = useMemo(() => {
    const events: Array<{ id: string; note: ChartNote; timeSec: number }> = [];
    for (const note of notes) {
      if (note.type === "hidden") {
        continue;
      }
      const timeSec = beatToSeconds(note.beat, bpmTimeline);
      if (!Number.isFinite(timeSec)) {
        continue;
      }
      events.push({
        id: note.id,
        note,
        timeSec,
      });
    }
    events.sort((left, right) => left.timeSec - right.timeSec);
    return events;
  }, [bpmTimeline, notes]);
  const playbackSlideLoopRanges = useMemo(() => {
    const ranges: Array<{ chainId: string; startSec: number; endSec: number }> = [];
    for (const chain of slideChains) {
      const chainNotes = chain.noteIds
        .map((id) => noteById.get(id))
        .filter((note): note is ChartNote => note !== undefined);
      if (chainNotes.length < 2) {
        continue;
      }
      if (chainNotes.every((note) => note.type === "hidden")) {
        continue;
      }
      const beats = chainNotes
        .map((note) => note.beat)
        .filter((value) => Number.isFinite(value));
      if (beats.length === 0) {
        continue;
      }
      const startBeat = Math.min(...beats);
      const endBeat = Math.max(...beats);
      if (!(endBeat > startBeat)) {
        continue;
      }
      const startSec = beatToSeconds(startBeat, bpmTimeline);
      const endSec = beatToSeconds(endBeat, bpmTimeline);
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
        continue;
      }
      ranges.push({
        chainId: chain.id,
        startSec: Math.min(startSec, endSec),
        endSec: Math.max(startSec, endSec),
      });
    }
    return ranges;
  }, [bpmTimeline, noteById, slideChains]);
  const playbackSlideLoopRangesByStart = useMemo(
    () =>
      [...playbackSlideLoopRanges].sort((left, right) => {
        if (left.startSec !== right.startSec) {
          return left.startSec - right.startSec;
        }
        if (left.endSec !== right.endSec) {
          return left.endSec - right.endSec;
        }
        return left.chainId.localeCompare(right.chainId);
      }),
    [playbackSlideLoopRanges],
  );
  const playbackSlideLoopRangesByEnd = useMemo(
    () =>
      [...playbackSlideLoopRanges].sort((left, right) => {
        if (left.endSec !== right.endSec) {
          return left.endSec - right.endSec;
        }
        if (left.startSec !== right.startSec) {
          return left.startSec - right.startSec;
        }
        return left.chainId.localeCompare(right.chainId);
      }),
    [playbackSlideLoopRanges],
  );
  /** The curve tool's setting (the fit applied to a Slide segment), kept for the editor session. */
  const [curveToolSettings, setCurveToolSettings] = useState<SlideFitSettings>(DEFAULT_SLIDE_FIT_SETTINGS);
  const activeSettingsType: EditorSettingsTool | null = selectedNote
    ? selectedNote.type
    : (
      isToolArmed && (tool === "bpm" || isNoteTool(tool))
        ? tool
        : null
    );
  const isDirectionalToolSettings =
    !hasNoteSelection &&
    (activeSettingsType === "directional_flick_left" || activeSettingsType === "directional_flick_right");
  const hasDirectionalNoteSelection =
    selectedNotes.length > 0 && selectedNotes.every((note) => isDirectionalNoteType(note.type));
  const isRhythmWidthToolSettings =
    isHabahiroEnabled &&
    !hasNoteSelection &&
    activeSettingsType !== null &&
    isRhythmWidthEditableType(activeSettingsType as NoteType);
  const hasRhythmWidthNoteSelection =
    isHabahiroEnabled &&
    selectedNotes.length > 0 &&
    selectedNotes.every((note) => isRhythmWidthEditableType(note.type));
  const activeDirectionalValue: "left" | "right" | null = hasDirectionalNoteSelection
    ? (() => {
      const hasLeft = selectedNotes.some((note) => note.type === "directional_flick_left");
      const hasRight = selectedNotes.some((note) => note.type === "directional_flick_right");
      if (hasLeft === hasRight) {
        return null;
      }
      return hasLeft ? "left" : "right";
    })()
    : (isDirectionalToolSettings
      ? (activeSettingsType === "directional_flick_left" ? "left" : "right")
      : null);
  const showBeatSetting =
    hasNoteSelection ||
    (isExGarupaEnabled && isToolArmed && tool === "sv") ||
    (activeSettingsType !== null && activeSettingsType !== "slide");
  const showLaneSetting =
    hasNoteSelection ||
    (activeSettingsType !== null &&
      activeSettingsType !== "slide" &&
      activeSettingsType !== "bpm");
  const widthSettingMode: WidthSettingMode =
    hasDirectionalNoteSelection || isDirectionalToolSettings
      ? "directional"
      : hasRhythmWidthNoteSelection || isRhythmWidthToolSettings
        ? "rhythm"
        : null;
  const showWidthSetting = widthSettingMode !== null;
  const showDirectionSetting = hasDirectionalNoteSelection || isDirectionalToolSettings;
  const showBpmSetting = !hasNoteSelection && activeSettingsType === "bpm";
  const showSvSetting =
    isExGarupaEnabled &&
    !hasNoteSelection &&
    isToolArmed &&
    tool === "sv";
  const showTimingGroupSetting =
    isExGarupaEnabled &&
    (
      hasNoteSelection ||
      (activeSettingsType !== null && activeSettingsType !== "bpm" && activeSettingsType !== "slide")
    );
  const hideSettingsPanel =
    !hasNoteSelection &&
    (!isToolArmed || (tool === "slide" && !showWidthSetting) || tool === "copy" || tool === "paste" || tool === "curve");
  const isBeatSettingLocked = !hasNoteSelection;
  const isLaneSettingLocked = !hasNoteSelection;
  const isTimingGroupSettingLocked = !hasNoteSelection;

  const activeBeatValue = hasNoteSelection ? minSelectedBeat : 0;
  const activeLaneValue = hasNoteSelection ? minSelectedLane : toolLane;
  const activeWidthValue =
    widthSettingMode === "directional"
      ? (
        hasDirectionalNoteSelection
          ? selectedNotes.reduce(
            (minValue, note) => Math.min(minValue, normalizeDirectionalWidth(note.width)),
            normalizeDirectionalWidth(selectedNotes[0]?.width ?? 1),
          )
          : normalizeDirectionalWidth(toolDirectionalWidth)
      )
      : widthSettingMode === "rhythm"
        ? (
          hasRhythmWidthNoteSelection
            ? selectedNotes.reduce(
              (minValue, note) => Math.min(minValue, normalizeRhythmWidth(note.width)),
              normalizeRhythmWidth(selectedNotes[0]?.width ?? 1),
            )
            : normalizeRhythmWidth(toolRhythmWidth)
        )
        : 1;

  const currentEditorConfigType: EditorConfigCacheKey | null =
    hideSettingsPanel || activeSettingsType === null ? null : activeSettingsType;

  useEffect(() => {
    if (!currentEditorConfigType || isApplyingEditorCacheRef.current) {
      return;
    }
    switch (currentEditorConfigType) {
      case "bpm":
        editorConfigCacheRef.current.bpm = {
          type: "bpm",
          bpmValue: toolBpmValue,
        };
        break;
      case "directional_flick_left":
      case "directional_flick_right":
        editorConfigCacheRef.current[currentEditorConfigType] = {
          type: "directional",
          width: normalizeDirectionalWidth(activeWidthValue),
          direction: activeDirectionalValue ?? (currentEditorConfigType === "directional_flick_left" ? "left" : "right"),
        };
        break;
      case "single":
      case "flick":
      case "skill":
        if (isHabahiroEnabled) {
          editorConfigCacheRef.current[currentEditorConfigType] = {
            type: "rhythm",
            width: normalizeRhythmWidth(activeWidthValue),
          };
        }
        break;
      default:
        break;
    }
  }, [
    activeDirectionalValue,
    activeWidthValue,
    currentEditorConfigType,
    isHabahiroEnabled,
    normalizeDirectionalWidth,
    normalizeRhythmWidth,
    toolBpmValue,
  ]);

  useEffect(() => {
    if (lastEditorConfigTypeRef.current === currentEditorConfigType) {
      return;
    }
    lastEditorConfigTypeRef.current = currentEditorConfigType;
    if (!currentEditorConfigType) {
      return;
    }
    const cached = editorConfigCacheRef.current[currentEditorConfigType];
    if (!cached) {
      return;
    }

    isApplyingEditorCacheRef.current = true;
    try {
      if (cached.type === "directional" && !hasNoteSelection) {
        const nextWidth = normalizeDirectionalWidth(cached.width);
        if (nextWidth !== normalizeDirectionalWidth(toolDirectionalWidth)) {
          setToolDirectionalWidth(nextWidth);
        }
        const nextType: EditorTool = cached.direction === "left" ? "directional_flick_left" : "directional_flick_right";
        if (tool !== nextType) {
          setTool(nextType);
        }
      }

      if (
        cached.type === "rhythm"
        && isHabahiroEnabled
        && !hasNoteSelection
      ) {
        const nextWidth = normalizeRhythmWidth(cached.width);
        if (nextWidth !== normalizeRhythmWidth(toolRhythmWidth)) {
          setToolRhythmWidth(nextWidth);
        }
      }
    } finally {
      isApplyingEditorCacheRef.current = false;
    }
  }, [
    approxEq,
    currentEditorConfigType,
    hasNoteSelection,
    isHabahiroEnabled,
    isToolArmed,
    normalizeDirectionalWidth,
    normalizeEditorBpm,
    normalizeRhythmWidth,
    setTool,
    setToolDirectionalWidth,
    setToolRhythmWidth,
    tool,
    toolBpmValue,
    toolDirectionalWidth,
    toolRhythmWidth,
  ]);
  /** Whether a chart project is in progress: anything in it differs from a new one. */
  const hasProjectContent = notes.length > 0 || slideChains.length > 0 || bpmEvents.length > 0
    || Object.values(chartMediaResources).some(ref => ref !== null)
    || JSON.stringify(metadata) !== JSON.stringify(DEFAULT_METADATA);
  const canDeleteSelection = selectedNoteCount > 0;
  const {
    clearSelection,
    removeNoteIdsFromSlideChains,
    deleteNotes,
    setSingleSelectedNote,
    setMultiSelectedNotes,
    toggleSelectedNote,
    commitSelectedNoteTransform,
    applySelectedOffset,
  } = useSelectionAndEditorSync({
    setSelectedNoteIds,
    setSlideChains,
    normalizeSlideChains: setSlideChainsState,
    normalizeNotes: setNotesState,
    setNotes,
    slideRoleByNoteId,
    noteById,
    sortNotes,
    allNotes: notes,
    slideChains,
    setSlideBuildState,
    slideBuildRef,
    selectedNoteIds,
    selectionMoveRef,
    setSelectionMovePreview,
    showBeatSetting,
    isBeatSettingLocked,
    setBeatInputText,
    beatInputEditingRef,
    formatEditorNumeric,
    activeBeatValue,
    showBpmSetting,
    setBpmInputText,
    bpmInputEditingRef,
    activeBpmValue: toolBpmValue,
    showSvSetting,
    setSvInputText,
    svInputEditingRef,
    activeSvValue: toolSvValue,
    showLaneSetting,
    isLaneSettingLocked,
    setLaneInputText,
    laneInputEditingRef,
    activeLaneValue,
    showWidthSetting,
    setWidthInputText,
    widthInputEditingRef,
    activeWidthValue,
    isSkinReady,
    isToolArmed,
    tool,
    setCursorPreview,
    slideBuildState,
    setSlideBuildCursor,
    settings,
    normalizeNote,
    showDialog,
    toFinite,
    quantizeBeat,
    beatDivision,
    approxEq,
    setBpmEvents,
    setSvEvents,
    sortBpmEvents,
    sortSvEvents,
    isLastBeatOrderedBpmNegative,
    exGarupaEnabled: isExGarupaEnabled,
    modeOptions: appOptionSettings,
  });

  // Deleting a segment (cutting its Slide) is part of note deletion: see `planNoteDeletion`.
  const { applySlideSegmentSettings } = useSlideSegmentActions({
    slideChains,
    notes: interactiveNotes,
    isHabahiroEnabled,
    exGarupaEnabled: isExGarupaEnabled,
    setSlideChains,
    setNotes,
    sortNotes,
    showDialog,
    createId,
  });

  const {
    applySettingsPatch,
    stepActiveLane,
    stepActiveWidth,
    setActiveDirectionalType,
    commitBeatInput,
    commitBpmInput,
    updateActiveBpm,
    setBpmEventValue,
    commitLaneInput,
    commitWidthInput,
    deleteSelectedNotes,
    deleteRightClickedNotes,
  } = useEditorSelectionActions({
    metadata,
    setMetadata,
    setSettings,
    setNotes,
    setBpmEvents,
    normalizeSettings,
    normalizeNote,
    normalizeBpmEvent,
    isLastBeatOrderedBpmNegative,
    sortNotes,
    sortBpmEvents,
    BASE_BPM_LINE_ID,
    bpmEvents,
    normalizeEditorBpm,
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    toFinite,
    approxEq,
    applySelectedOffset,
    commitSelectedNoteTransform,
    minSelectedBeat,
    activeBeatValue,
    activeBpmValue: toolBpmValue,
    activeLaneValue,
    activeWidthValue,
    activeDirectionalValue,
    tool,
    hasNoteSelection,
    hasDirectionalNoteSelection,
    isRhythmWidthEditableType,
    minSelectedLane,
    setToolLane,
    setUseToolLaneOverride,
    setToolBpmValue,
    setTool,
    setToolDirectionalWidth,
    setToolRhythmWidth,
    isDirectionalNoteType,
    normalizeDirectionalWidth,
    normalizeRhythmWidth,
    widthSettingMode,
    isBeatSettingLocked,
    beatInputText,
    setBeatInputText,
    formatEditorNumeric,
    parseNumericExpression,
    bpmInputText,
    setBpmInputText,
    isLaneSettingLocked,
    laneInputText,
    setLaneInputText,
    widthInputText,
    setWidthInputText,
    deleteNotes,
    clearSelection,
    selectedNoteIds,
    showDialog,
    setSelectedNoteIds,
  });

  const project = useMemo<ChartProjectDraft>(() => ({ projectId, metadata,
    chart: { settings, notes, slideChains, bpmEvents, timingGroups }, mediaRefs: chartMediaResources,
    audioFileName, audioDurationSec,
  }), [projectId, metadata, settings, notes, slideChains, bpmEvents, timingGroups, chartMediaResources, audioFileName, audioDurationSec]);
  const restoreProject = useCallback((loaded: ChartProject) => {
    const draft = projectDraft(loaded);
    // Timing groups are #0 (global) and #1, #2, …; projects from before that scheme are renumbered.
    const next = { ...draft, chart: { ...draft.chart, ...renumberTimingGroups({
      notes: draft.chart.notes, slideChains: draft.chart.slideChains, timingGroups: draft.chart.timingGroups,
    }) } };
    rememberProjectMedia(resourceManager, loaded);
    skipProjectWidthAdjustmentRef.current = true;
    setProjectId(next.projectId);
    setMetadataState(next.metadata); setSettingsState(next.chart.settings);
    setNotesState(next.chart.notes); setSlideChainsState(next.chart.slideChains);
    setBpmEventsState(next.chart.bpmEvents); setTimingGroupsState(ensureTimingGroups(next.chart.timingGroups));
    setChartMediaResources(next.mediaRefs); setAudioFileName(next.audioFileName); setAudioDurationSec(next.audioDurationSec);
    clearSelection();
    undoStackRef.current = []; redoStackRef.current = []; pendingUndoSourcesRef.current = null; setUndoVersion(v => v + 1);
  }, [resourceManager, clearSelection]);

  const {
    garupaChartJsonText,
    undoLastNote,
    redoLastNote,
    clearAllNotes,
    downloadJson,
    isImportJsonModalOpen,
    importJsonModalLevel,
    importJsonText,
    importOfficialChartId,
    importOfficialChartDifficulty,
    importCommunityPostId,
    uploadCommunityPostContent,
    uploadChartAuthor,
    uploadCommunityPostTags,
    importJsonSelectedPath,
    importBestdoriV2SelectedPath,
    setImportJsonText,
    setImportOfficialChartId,
    setImportOfficialChartDifficulty,
    setImportCommunityPostId,
    setUploadCommunityPostContent,
    setUploadChartAuthor,
    setUploadCommunityPostTags,
    applyImportJsonText,
    applyImportOfficialChart,
    applyImportCommunityChart,
    loadChartForPlay,
    loadOfficialChart,
    applyUploadCommunityChart,
    applyUploadNotGarupaServerChart,
    applyUploadTestServerChart,
    openImportJsonModal,
    closeImportJsonModal,
    openImportJsonModalBestdoriV2Level,
    isExportJsonModalOpen,
    closeExportJsonModal,
    saveExportJsonToSelectedPath,
    exportBestdoriV2ToFile,
    triggerJsonImport,
    triggerBestdoriV2Import,
    handleJsonImport,
    handleBestdoriV2Import,
    openAppSettings,
    openSkinSettings,
    handleCoverUpload,
    handleAudioUpload,
    handleMvUpload,
    handleIllustBackgroundUpload,
    removeIllustBackground,
    applySongInformationEdit,
    applyWindowPresetById,
    applyBestdoriSkinSelection,
    downloadProgress,
  } = useEditorIoAndShortcuts({
    project,
    onNewProject: (preserveForPlay = false) => {
      if (preserveForPlay) skipProjectWidthAdjustmentRef.current = true;
      setProjectId(crypto.randomUUID());
    },
    metadata,
    appOptionSettings,
    settings,
    audioFileName,
    audioDurationSec,
    chartMediaResources,
    setChartMediaResources,
    chartMediaLease,
    skinSelection,
    bpmEvents,
    svEvents,
    slideChains,
    notes,
    sortBpmEvents,
    sortSvEvents,
    sortNotes,
    removeNoteIdsFromSlideChains,
    clearSelection,
    showDialog,
    setNotes,
    setSlideChains,
    setSettings,
    setMetadata,
    normalizeSettings,
    normalizeMetadata,
    normalizeNote,
    normalizeBpmEvent,
    createId,
    setBpmEvents,
    setTimingGroups,
    setSvEvents,
    setSingleSelectedNote,
    toFinite,
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    normalizeTimingGroup,
    normalizeSvEvent,
    isLastBeatOrderedBpmNegative,
    parseSkinSelectionFromDocument,
    setPendingSkinSelection,
    applyBestdoriSkinSelectionRef,
    setAudioDurationSec,
    setAudioFileName,
    jsonImportRef,
    bestdoriV2ImportRef,
    sanitizeFileName,
    setIsAppSettingsOpen,
    setIsSkinSettingsOpen,
    WINDOW_SIZE_PRESETS,
    LogicalSize,
    getCurrentWindow,
    normalizeSkinSelection,
    skinApplySeqRef,
    setSkinAssets,
    setAppliedSkinResources,
    setIsSkinApplying,
    setSkinSelection,
    approxEq,
    selectedNoteIds,
    deleteSelectedNotes,
    NOTE_TYPES,
    setTool,
    setIsToolArmed,
    NOTE_SPECS,
    undoLastOperation,
    redoLastOperation,
    copyCurrentSelectionByShortcut,
    pasteAtMousePositionByShortcut,
  });
  const projectFiles = useChartProjectFiles(resourceManager, project, loaded => {
    restoreProject(loaded); closeImportJsonModal();
  }, showDialog);
  // Charts picked for play from the chart list load through the editor state; keep the
  // editor's own chart aside (and out of the session cache) until the play flow ends.
  const playSessionBackupRef = useRef<ChartProject | null>(null);
  const [playSessionActive, setPlaySessionActive] = useState(false);
  const beginPlaySession = useCallback(async () => {
    if (playSessionBackupRef.current !== null) return;
    playSessionBackupRef.current = await captureChartProject(resourceManager, project);
    setPlaySessionActive(true);
  }, [resourceManager, project]);
  const endPlaySession = useCallback(() => {
    const backup = playSessionBackupRef.current;
    if (backup === null) return;
    playSessionBackupRef.current = null;
    restoreProject(backup);
    setPlaySessionActive(false);
  }, [restoreProject]);
  const settingsResourcesReady = useEditorSessionCache({
    project, restoreProject, playSessionActive,
    metadata,
    settings,
    appOptionSettings,
    notes,
    slideChains,
    bpmEvents,
    timingGroups,
    svEvents,
    audioFileName,
    audioDurationSec,
    chartMediaResources,
    setChartMediaResources,
    uploadCommunityPostContent,
    uploadCommunityPostTags,
    skinSelection,
    windowPresetId,
    playbackWindowPresetId,
    playbackFps,
    playbackMvMode,
    playbackMvAlphaPercent,
    playbackAllPerfectStatusDisplayMode,
    WINDOW_SIZE_PRESETS,
    normalizeMetadata,
    normalizeSettings,
    normalizeEditorOptionSettings,
    normalizeSkinSelection,
    normalizeNote,
    normalizeBpmEvent,
    normalizeSvEvent,
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    normalizeTimingGroup,
    isLastBeatOrderedBpmNegative,
    sortNotes,
    sortBpmEvents,
    sortSvEvents,
    approxEq,
    createId,
    setMetadata: setMetadataState,
    setSettings: setSettingsState,
    setAppOptionSettings,
    setNotes: setNotesState,
    setSlideChains: setSlideChainsState,
    setBpmEvents: setBpmEventsState,
    setTimingGroups: setTimingGroupsState,
    setSvEvents,
    setAudioFileName,
    setAudioDurationSec,
    setUploadCommunityPostContent,
    setUploadCommunityPostTags,
    setWindowPresetId,
    setPlaybackWindowPresetId,
    setPlaybackFps,
    setPlaybackMvMode,
    setPlaybackMvAlphaPercent,
    setPlaybackAllPerfectStatusDisplayMode,
    applyWindowPresetById,
    applyBestdoriSkinSelection,
    clearSelection,
    showDialog,
  });

  const svPreviewTimingGroups = useMemo(() => {
    const usedGroups = new Set<string>([GLOBAL_TIMING_GROUP_ID]);
    for (const note of notes) {
      usedGroups.add(normalizeTimingGroupId(note.timingGroup));
    }
    for (const chain of slideChains) {
      usedGroups.add(normalizeTimingGroupId(chain.timingGroup));
    }
    for (const event of svEvents) {
      usedGroups.add(normalizeTimingGroupId(event.timingGroup));
    }
    const sortedGroups = [...usedGroups].sort((left, right) => {
      if (left === GLOBAL_TIMING_GROUP_ID) {
        return -1;
      }
      if (right === GLOBAL_TIMING_GROUP_ID) {
        return 1;
      }
      return left.localeCompare(right, "en", { numeric: true });
    });
    const sortedSvEvents = sortSvEvents(svEvents);
    const globalSvEvents = sortedSvEvents.filter(
      (event) => normalizeTimingGroupId(event.timingGroup) === GLOBAL_TIMING_GROUP_ID,
    );
    const sourceEvents = sortedGroups.flatMap((groupId) => {
      const groupSvEvents = groupId === GLOBAL_TIMING_GROUP_ID
        ? []
        : sortedSvEvents.filter((event) => normalizeTimingGroupId(event.timingGroup) === groupId);
      return [...groupSvEvents, ...globalSvEvents].map((event, order) => ({
        timingGroup: groupId,
        atMs: beatToSeconds(event.beat, bpmTimeline) * 1000,
        value: event.value,
        order,
      }));
    });
    const built = buildTimingGroupDefs(
      sortedGroups,
      sourceEvents,
    );
    const byInternalGroup = new Map<string, TimingGroupDef>();
    for (const [internalGroup, runtimeGroup] of built.internalToRuntimeGroup.entries()) {
      const def = built.timingGroups[runtimeGroup];
      if (def) {
        byInternalGroup.set(internalGroup, def);
      }
    }
    return byInternalGroup;
  }, [beatToSeconds, bpmTimeline, notes, slideChains, sortSvEvents, svEvents]);
  const noteTimingGroupById = useMemo(() => {
    const map = new Map<string, string>();
    for (const note of notes) {
      map.set(note.id, normalizeTimingGroupId(note.timingGroup));
    }
    for (const chain of slideChains) {
      const chainTimingGroup = normalizeTimingGroupId(chain.timingGroup);
      for (const noteId of chain.noteIds ?? []) {
        map.set(noteId, chainTimingGroup);
      }
    }
    return map;
  }, [notes, slideChains]);
  const displayAxis = useMemo(() => createEditorDisplayAxis({
    enabled: isSvPreviewEnabled,
    padding: scrollPadding,
    totalDurationSec,
    pixelsPerSecond: timelinePixelsPerSecond,
    previewTimeSec: svPreviewTimeSec,
    mainGroup: svPreviewTimingGroups.get(GLOBAL_TIMING_GROUP_ID) ?? null,
  }), [
    scrollPadding,
    isSvPreviewEnabled,
    svPreviewTimeSec,
    svPreviewTimingGroups,
    timelinePixelsPerSecond,
    totalDurationSec,
  ]);
  const scrollContentHeight = Math.max(boardHeight, displayAxis.contentHeight);

  const {
    laneToColumn,
    beatToY,
    yToBeat,
    yToTime,
    timeToY,
    handlePlayfieldScroll,
    getNoteSpanLanes,
    getSlideAnchorLane,
    getRenderedNotePlacement,
    findNoteAtBoardPoint,
    findPlacementOverlaps,
    resolveBoardPlacement,
    finishSelectionDrag,
    calcSelectionMoveDelta,
  } = useEditorGeometry({
    playbackLinePositionPercent: viewportPlaybackPositionPercent,
    laneMin,
    bpmTimeline,
    boardHeight,
    displayAxis,
    isSvPreviewEnabled,
    isPlaybackPlaying,
    svPreviewTimeSecRef,
    setSvPreviewTimeSec,
    timelinePixelsPerSecond,
    totalDurationSec,
    playfieldRef,
    isSkinReady,
    didInitTimelineScrollRef,
    viewBottomTimeSecRef,
    beatDivision,
    boardWidth,
    laneValues,
    notes: interactiveNotes,
    slideChains,
    tool,
    toolDirectionalWidth,
    toolRhythmWidth,
    isDirectionalNoteType,
    normalizeDirectionalWidth,
    normalizeRhythmWidth,
    isRhythmWidthEditableType,
    isHabahiroEnabled,
    approxEq,
    clamp,
    quantizeBeat,
    beatToSeconds,
    secondsToBeat,
    secondsToBeatCandidates,
    selectionMovePreview,
    selectedNoteIdSet,
    selectionDragRef,
    playfieldBoardRef,
    bpmEvents,
    svEvents: interactiveSvEvents,
    clearSelection,
    showDialog,
    setMultiSelectedNotes,
    setToolLane,
    setUseToolLaneOverride,
    NOTE_SPECS,
    setSelectionDrag,
    selectionMoveRef,
    suppressNextBoardClickRef,
    LANE_WIDTH,
    noteVisualScale,
    onSelectionDragCompleted: handleSelectionDragCompletedForCopyTool,
  });
  resolveBoardPlacementRef.current = resolveBoardPlacement;

  /** Middle tool on a Slide's line: a single node inserted where it was pressed, between that segment's two nodes. */
  const insertSingleNodeOnConnection = useCallback((segment: any, event: ReactMouseEvent<HTMLElement>) => {
    if (!isToolArmed || tool !== "middle" || slideBuildRef.current) {
      return;
    }
    const board = playfieldBoardRef.current;
    if (!board) {
      return;
    }
    const rect = board.getBoundingClientRect();
    const placement = resolveBoardPlacement(
      event.clientX - rect.left,
      event.clientY - rect.top,
      { type: "single" },
    );
    if (!placement) {
      return;
    }

    const chainId = typeof segment?.chainId === "string" ? segment.chainId : null;
    const segmentIndex = Number(segment?.index);
    if (!chainId || !Number.isInteger(segmentIndex) || segmentIndex < 0) {
      return;
    }
    const chain = committedSlideChainById.get(chainId);
    if (chain?.long === true) {
      showDialog("Long 不能添加中间节点。");
      return;
    }
    const from = chain ? noteById.get(chain.noteIds[segmentIndex]) : undefined;
    const to = chain ? noteById.get(chain.noteIds[segmentIndex + 1]) : undefined;
    if (!chain || !from || !to) {
      return;
    }

    const normalized = normalizeNote(
      {
        id: createId(),
        type: "single",
        lane: Number(toFinite(placement.lane, 0).toFixed(6)),
        beat: quantizeBeat(placement.beat, beatDivision),
        timingGroup: normalizeNoteTimingGroup(chain.timingGroup),
      },
      settings,
    );
    if (!normalized) {
      return;
    }
    // A Hidden node of this Slide on that beat becomes the visible node in place, keeping its position: its lane as it
    // is under ExGarupa, rounded to a whole lane otherwise. (Deleting the node turns it back into a Hidden node, so a
    // fitted Slide can be split at one of its Hidden nodes and joined again.)
    const replacedHidden = chain.noteIds
      .map((id) => noteById.get(id))
      .filter((note): note is ChartNote => note?.type === "hidden" && approxEq(note.beat, normalized.beat))
      .sort((a, b) => Math.abs(a.lane - normalized.lane) - Math.abs(b.lane - normalized.lane))[0];
    if (replacedHidden) {
      const replacement = normalizeNote(
        {
          ...replacedHidden,
          type: "single",
          lane: isExGarupaEnabled ? replacedHidden.lane : Math.round(replacedHidden.lane),
          timingGroup: normalizeNoteTimingGroup(chain.timingGroup),
        },
        settings,
      );
      if (!replacement) {
        return;
      }
      const overwrittenIds = new Set(
        findPlacementOverlaps(replacement.lane, replacement.beat, { type: "single" })
          .map((note) => note.id)
          .filter((id) => id !== replacedHidden.id),
      );
      const remainingNotes = notes.flatMap((note) =>
        overwrittenIds.has(note.id) ? [] : [note.id === replacedHidden.id ? replacement : note]);
      setNotes((previous: ChartNote[]) => sortNotes(previous.flatMap((note) =>
        overwrittenIds.has(note.id) ? [] : [note.id === replacedHidden.id ? replacement : note])));
      if (overwrittenIds.size > 0) {
        setSlideChains((previous: SlideChain[]) => dropNoteIdsFromChains(previous, overwrittenIds, remainingNotes));
      }
      clearSelection();
      return;
    }

    // The snapped node must stay within the segment and not land on either end (it would overwrite that node).
    const beatEpsilon = 1e-6;
    const isEnd = (note: ChartNote) => approxEq(note.beat, normalized.beat) && approxEq(note.lane, normalized.lane);
    if (normalized.beat < Math.min(from.beat, to.beat) - beatEpsilon || normalized.beat > Math.max(from.beat, to.beat) + beatEpsilon
      || isEnd(from) || isEnd(to)) {
      return;
    }

    // The node overwrites what it covers; an overwritten slide node leaves its chain.
    const overwrittenIds = new Set(
      findPlacementOverlaps(normalized.lane, normalized.beat, { type: "single" }).map((note) => note.id),
    );
    const remainingNotes = [...notes.filter((note) => !overwrittenIds.has(note.id)), normalized];
    setNotes((previous: ChartNote[]) =>
      sortNotes([...previous.filter((note) => !overwrittenIds.has(note.id)), normalized]));
    setSlideChains((previous: SlideChain[]) => dropNoteIdsFromChains(
      previous.map((chain) => {
        if (chain.id !== chainId || segmentIndex >= chain.noteIds.length - 1) {
          return chain;
        }
        const nextNoteIds = [...chain.noteIds];
        nextNoteIds.splice(segmentIndex + 1, 0, normalized.id);
        return {
          ...chain,
          noteIds: nextNoteIds,
        };
      }),
      overwrittenIds,
      remainingNotes,
    ));
    clearSelection();
  }, [
    approxEq,
    committedSlideChainById,
    beatDivision,
    clearSelection,
    findPlacementOverlaps,
    isExGarupaEnabled,
    isToolArmed,
    noteById,
    notes,
    resolveBoardPlacement,
    setNotes,
    setSlideChains,
    showDialog,
    settings,
    tool,
  ]);

  const {
    applyToolFromPalette: applyToolFromPaletteRaw,
    applyLongToolFromPalette: applyLongToolFromPaletteRaw,
    applyMiddleToolFromPalette: applyMiddleToolFromPaletteRaw,
    applyCurveToolFromPalette: applyCurveToolFromPaletteRaw,
    applyBpmToolFromPalette: applyBpmToolFromPaletteRaw,
    applySvToolFromPalette: applySvToolFromPaletteRaw,
    applyCopyToolFromPalette: applyCopyToolFromPaletteRaw,
    applyPasteToolFromPalette: applyPasteToolFromPaletteRaw,
    setSlideBuildMode,
    startSlideBuildFromSeedNote,
    appendSlideBuildNote,
    cancelSlideBuild,
    finalizeSlideBuild,
    applyToolToPlacedNote,
    handleBoardContextMenu,
    handleBoardMouseMove: handleBoardMouseMoveRaw,
    handleBoardMouseLeave: handleBoardMouseLeaveRaw,
    handleBoardClick: handleBoardClickRaw,
    beginSelectedNotesMove,
    handleBoardMouseDown: handleBoardMouseDownRaw,
  } = useBoardInteractionActions({
    setTool,
    setIsToolArmed,
    clearSelection,
    showDialog,
    NOTE_SPECS,
    useToolLaneOverride,
    quantizeBeat,
    beatDivision,
    toFinite,
    toolLane,
    toolDurationBeats,
    beatStep,
    createId,
    isDirectionalNoteType,
    normalizeDirectionalWidth,
    isRhythmWidthEditableType,
    normalizeRhythmWidth,
    isHabahiroEnabled,
    toolDirectionalWidth,
    toolRhythmWidth,
    normalizeNote,
    settings,
    setNotes,
    approxEq,
    sortNotes,
    setToolLane,
    setUseToolLaneOverride,
    setSingleSelectedNote,
    formatBeat,
    tool,
    noteById,
    slideBuildRef,
    setSlideBuildState,
    setSlideBuildCursor,
    setCursorPreview,
    committedSlideRoleByNoteId,
    committedSlideChainById,
    suppressNextBoardClickRef,
    suppressNextNoteClickRef,
    removeNoteIdsFromSlideChains,
    setSlideChains,
    normalizeBpmEvent,
    normalizeSvEvent,
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    toolBpmValue,
    metadata,
    setMetadata,
    setBpmEvents,
    setSvEvents,
    bpmEvents,
    svEvents,
    toolSvValue,
    toolTimingGroup,
    toolSvTimingGroup,
    selectedNoteIds,
    playfieldBoardRef,
    selectionMoveRef,
    cursorPreview,
    findNoteAtBoardPoint,
    resolveBoardPlacement,
    findPlacementOverlaps,
    selectionDragRef,
    isToolArmed,
    selectionDrag,
    setSelectionDrag,
    selectedNoteIdSet,
    notes,
    slideChains,
    setSelectionMovePreview,
    selectedNotes,
    commitSelectedNoteTransform,
    toolLaneShift,
    sortBpmEvents,
    sortSvEvents,
    isPasteToolReady: copiedChartPayload !== null,
    isPasteLaneAnchorEnabled: copiedChartPayload?.laneAnchorEnabled === true,
    applyPasteAtPlacement: applyCopiedPayloadAtPlacement,
    isSvPreviewEnabled,
    exGarupaEnabled: isExGarupaEnabled,
    modeOptions: appOptionSettings,
  });

  const clearPlaybackTick = useCallback(() => {
    if (playbackTickRafRef.current !== null) {
      cancelAnimationFrame(playbackTickRafRef.current);
      playbackTickRafRef.current = null;
    }
  }, []);

  const clearPlaybackGuideFrame = useCallback(() => {
    if (playbackGuideRafRef.current !== null) {
      cancelAnimationFrame(playbackGuideRafRef.current);
      playbackGuideRafRef.current = null;
    }
  }, []);

  const hidePlaybackGuide = useCallback(() => {
    playbackGuidePendingRef.current = null;
    clearPlaybackGuideFrame();
    const host = playbackGuideHostRef.current;
    if (host && host.style.display !== "none") {
      host.style.display = "none";
    }
  }, [clearPlaybackGuideFrame]);

  const hidePlaybackRuntimeLine = useCallback(() => {
    const host = playbackRuntimeLineRef.current;
    if (host && host.style.display !== "none") {
      host.style.display = "none";
    }
  }, []);

  const updatePlaybackRuntimeLine = useCallback((timeSec: number) => {
    const host = playbackRuntimeLineRef.current;
    const playfield = playfieldRef.current;
    if (!host || !playfield || !isPlayToolSelected || !playbackIsPlayingRef.current) {
      if (host && host.style.display !== "none") {
        host.style.display = "none";
      }
      return;
    }

    const viewportHeight = Math.max(1, playfield.clientHeight);
    const viewportTop = playfield.scrollTop;
    const playbackWorldY = timeToY(timeSec);
    let localY = playbackWorldY - viewportTop;
    if (playbackLineModeRef.current === "follow") {
      const ratioFromBottom = clamp(viewportPlaybackPositionPercent / 100, 0, 1);
      const anchorInViewport = viewportHeight * (1 - ratioFromBottom);
      const yInViewport = playbackWorldY - viewportTop;
      const maxScrollTop = Math.max(0, scrollContentHeight - viewportHeight);
      const isViewportPinnedAtTop = viewportTop <= PLAYBACK_VIEWPORT_EDGE_TOLERANCE_PX;
      const isViewportPinnedAtBottom =
        viewportTop >= maxScrollTop - PLAYBACK_VIEWPORT_EDGE_TOLERANCE_PX;
      localY = (isViewportPinnedAtTop || isViewportPinnedAtBottom)
        ? Math.max(anchorInViewport, yInViewport)
        : anchorInViewport;
    }

    const dpr = Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const snappedLocalY = Math.round(localY * dpr) / dpr;
    if (snappedLocalY < -4 || snappedLocalY > viewportHeight + 4) {
      if (host.style.display !== "none") {
        host.style.display = "none";
      }
      return;
    }
    // Overlay lives in world-space layer; convert viewport-space Y back to world-space top.
    const worldTop = viewportTop + snappedLocalY;
    const nextTop = `${worldTop}px`;
    if (host.style.top !== nextTop) {
      host.style.top = nextTop;
    }
    if (host.style.display !== "block") {
      host.style.display = "block";
    }
  }, [clamp, isPlayToolSelected, viewportPlaybackPositionPercent, scrollContentHeight, timeToY]);

  const flushPlaybackGuide = useCallback(() => {
    playbackGuideRafRef.current = null;
    const host = playbackGuideHostRef.current;
    const label = playbackGuideLabelRef.current;
    const guide = playbackGuidePendingRef.current;
    if (!host || !guide || !isPlayToolSelected || playbackIsPlayingRef.current) {
      if (host && host.style.display !== "none") {
        host.style.display = "none";
      }
      return;
    }
    const top = `${guide.y}px`;
    if (host.style.top !== top) {
      host.style.top = top;
    }
    if (host.style.display !== "block") {
      host.style.display = "block";
    }
    if (label) {
      const nextLabel = `${formatDurationPrecise(guide.timeSec)}:${playbackGuideTotalLabelRef.current}`;
      if (label.textContent !== nextLabel) {
        label.textContent = nextLabel;
      }
    }
  }, [isPlayToolSelected]);

  const queuePlaybackGuide = useCallback(
    (guide: { y: number; timeSec: number } | null) => {
      playbackGuidePendingRef.current = guide;
      if (!guide) {
        hidePlaybackGuide();
        return;
      }
      if (playbackGuideRafRef.current !== null) {
        return;
      }
      playbackGuideRafRef.current = requestAnimationFrame(flushPlaybackGuide);
    },
    [flushPlaybackGuide, hidePlaybackGuide],
  );

  useEffect(() => {
    playbackGuideTotalLabelRef.current = hasUploadedAudio ? formatDurationPrecise(playbackCeilingSec) : "?";
    if (isPlayToolSelected && !playbackIsPlayingRef.current && playbackGuidePendingRef.current) {
      queuePlaybackGuide(playbackGuidePendingRef.current);
    }
  }, [hasUploadedAudio, isPlayToolSelected, playbackCeilingSec, queuePlaybackGuide]);

  useEffect(() => {
    if (!isPlayToolSelected || !isPlaybackPlaying) {
      hidePlaybackRuntimeLine();
    }
  }, [hidePlaybackRuntimeLine, isPlayToolSelected, isPlaybackPlaying]);

  const stopAllPlaybackSoundEffects = useCallback(() => {
    for (const pool of playbackSePoolBySrcRef.current.values()) {
      for (const player of pool.players) {
        try {
          player.pause();
        } catch {
          // ignore pause failure
        }
      }
    }

    const longLoopPlayer = playbackLongLoopPlayerRef.current;
    if (longLoopPlayer) {
      try {
        longLoopPlayer.pause();
      } catch {
        // ignore pause failure
      }
      longLoopPlayer.removeAttribute("src");
      playbackLongLoopPlayerRef.current = null;
    }
    playbackLongLoopSrcRef.current = null;

    const longLoopSource = playbackSeWebAudioLongLoopSourceRef.current;
    if (longLoopSource) {
      try {
        longLoopSource.stop();
      } catch {
        // ignore already-stopped source
      }
      try {
        longLoopSource.disconnect();
      } catch {
        // ignore disconnect failure
      }
      playbackSeWebAudioLongLoopSourceRef.current = null;
    }
    playbackSeWebAudioLongLoopSrcRef.current = null;

    for (const source of playbackSeWebAudioOneshotSetRef.current) {
      try {
        source.stop();
      } catch {
        // ignore already-stopped source
      }
      try {
        source.disconnect();
      } catch {
        // ignore disconnect failure
      }
    }
    playbackSeWebAudioOneshotSetRef.current.clear();

    playbackActiveSlideLoopIdSetRef.current.clear();
    playbackEventCursorRef.current = 0;
    playbackSlideStartCursorRef.current = 0;
    playbackSlideEndCursorRef.current = 0;
  }, []);

  const stopPlaybackBgmSource = useCallback(() => {
    const source = playbackBgmSourceRef.current;
    playbackBgmSourceRef.current = null;
    playbackBgmDurationSecRef.current = 0;
    if (!source) {
      return;
    }
    try {
      source.stop();
    } catch {
      // ignore already-stopped sources
    }
    try {
      source.disconnect();
    } catch {
      // ignore disconnect failure
    }
  }, []);

  const stopPlayback = useCallback(() => {
    clearPlaybackTick();
    playbackStartSeqRef.current += 1;
    stopPlaybackBgmSource();
    const audio = playbackAudioRef.current;
    if (audio) {
      audio.pause();
    }
    stopAllPlaybackSoundEffects();
    playbackTickLastNowMsRef.current = null;
    playbackDurationLimitSecRef.current = 0;
    playbackHasAudioTrackRef.current = false;
    playbackIsPlayingRef.current = false;
    setIsPlaybackPlaying(false);
    hidePlaybackGuide();
    hidePlaybackRuntimeLine();
    playbackNowSecRef.current = 0;
  }, [
    clearPlaybackTick,
    hidePlaybackGuide,
    hidePlaybackRuntimeLine,
    showDialog,
    stopAllPlaybackSoundEffects,
    stopPlaybackBgmSource,
  ]);

  const setActiveSvValue = useCallback((value: number) => {
    const nextValue = Number(toFinite(value, toolSvValue).toFixed(6));
    if (!Number.isFinite(nextValue)) {
      showDialog("SV 值必须为有限数字。");
      return;
    }
    setToolSvValue(nextValue);
  }, [showDialog, toFinite, toolSvValue]);

  /** The SV tool's setting: the value and timing group that new SV events get. */
  const applySvToolSetting = useCallback((value: number, timingGroup: ChartTimingGroupId) => {
    const nextValue = Number(toFinite(value, toolSvValue).toFixed(6));
    if (!Number.isFinite(nextValue)) {
      showDialog("SV 值必须为有限数字。");
      return;
    }
    setToolSvValue(nextValue);
    setToolSvTimingGroup(normalizeTimingGroup(timingGroup, GLOBAL_TIMING_GROUP_ID));
  }, [showDialog, toFinite, toolSvValue]);

  /** Writes one SV event's value and timing group; an SV event already on that beat in the target group is replaced. */
  const updateSvEvent = useCallback((eventId: string, value: number, timingGroup: ChartTimingGroupId) => {
    const nextValue = Number(toFinite(value, 1).toFixed(6));
    if (!Number.isFinite(nextValue)) {
      showDialog("SV 值必须为有限数字。");
      return;
    }
    const targetGroup = normalizeTimingGroup(timingGroup, GLOBAL_TIMING_GROUP_ID);
    setSvEvents((previous) => {
      const current = previous.find((event) => event.id === eventId);
      if (!current) {
        return previous;
      }
      const remaining = previous.filter((event) => event.id === eventId || !(
        normalizeTimingGroup(event.timingGroup, GLOBAL_TIMING_GROUP_ID) === targetGroup && approxEq(event.beat, current.beat)
      ));
      return sortSvEvents(remaining.map((event) =>
        event.id === eventId ? { ...event, value: nextValue, timingGroup: targetGroup } : event,
      ));
    });
  }, [approxEq, setSvEvents, showDialog, sortSvEvents, toFinite]);

  const commitSvInput = useCallback(() => {
    const text = svInputText.trim();
    const parsed = text === "" ? 0 : parseNumericExpression(text);
    if (parsed === null) {
      setSvInputText(formatEditorNumeric(toolSvValue));
      return;
    }
    const nextValue = Number(toFinite(parsed, toolSvValue).toFixed(6));
    setActiveSvValue(nextValue);
    setSvInputText(formatEditorNumeric(nextValue));
  }, [
    toolSvValue,
    parseNumericExpression,
    setActiveSvValue,
    svInputText,
    toFinite,
  ]);

  const getPlayfieldBottomTimeSec = useCallback(() => {
    const playfield = playfieldRef.current;
    if (!playfield) {
      return 0;
    }
    const bottomY = playfield.scrollTop + playfield.clientHeight;
    return clamp(yToTime(bottomY), 0, Math.max(0, playbackCeilingSec));
  }, [clamp, playbackCeilingSec, yToTime]);

  const syncPlaybackViewport = useCallback((timeSec: number) => {
    if (playbackLineModeRef.current !== "follow") {
      return;
    }
    const playfield = playfieldRef.current;
    if (!playfield) {
      return;
    }
    const nowMs = performance.now();
    if (nowMs - playbackViewportSyncStampRef.current < 16) {
      return;
    }
    playbackViewportSyncStampRef.current = nowMs;
    const viewportHeight = Math.max(1, playfield.clientHeight);
    // The DOM scroll range includes the editor bleed below the board, so use it rather than the board height.
    const maxScrollTop = Math.max(0, playfield.scrollHeight - playfield.clientHeight);
    const ratioFromBottom = clamp(playbackLinePositionPercent / 100, 0, 1);
    const playfieldTopClient = playfield.getBoundingClientRect().top;
  // Judge range: from the workspace top down to the Beat 0 limit (the anchor element sits on that edge).
  const judgeTopEl = document.querySelector<HTMLElement>(".editor-viewport-region")?.parentElement ?? null;
  const judgeBottomEl = document.querySelector<HTMLElement>(".editor-judge-anchor");
  const regionTopLocal = judgeTopEl ? judgeTopEl.getBoundingClientRect().top - playfieldTopClient : 0;
  const regionBottomLocal = judgeBottomEl ? judgeBottomEl.getBoundingClientRect().bottom - playfieldTopClient : viewportHeight;
  const anchorLocalY = regionBottomLocal + (regionTopLocal - regionBottomLocal) * ratioFromBottom;
    const worldY = timeToY(timeSec);
    const nextScrollTop = clamp(worldY - anchorLocalY, 0, maxScrollTop);
    if (Math.abs(playfield.scrollTop - nextScrollTop) > 0.5) {
      playfield.scrollTop = nextScrollTop;
    }
    viewBottomTimeSecRef.current = displayAxis.viewportTimeAtY(playfield.scrollTop + playfield.clientHeight);
  }, [clamp, displayAxis, playbackLinePositionPercent, scrollContentHeight, timeToY, viewBottomTimeSecRef]);

  const ensurePlaybackSeAudioContext = useCallback((): AudioContext | null => {
    const existingContext = playbackSeAudioContextRef.current;
    if (existingContext) {
      const existingGain = playbackSeMasterGainRef.current;
      if (existingGain) {
        existingGain.gain.value = clamp(playbackVolumePercent / 100, 0, 1) * noteSeVolumeScale;
      }
      return existingContext;
    }
    if (typeof window === "undefined") {
      return null;
    }
    const AudioContextCtor = (window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioContextCtor) {
      return null;
    }
    try {
      const context = new AudioContextCtor({ latencyHint: "interactive" });
      const masterGain = context.createGain();
      masterGain.gain.value = clamp(playbackVolumePercent / 100, 0, 1) * noteSeVolumeScale;
      masterGain.connect(context.destination);
      const bgmGain = context.createGain();
      bgmGain.gain.value = clamp(playbackVolumePercent / 100, 0, 1);
      bgmGain.connect(context.destination);
      playbackSeAudioContextRef.current = context;
      playbackSeMasterGainRef.current = masterGain;
      playbackBgmGainRef.current = bgmGain;
      return context;
    } catch {
      return null;
    }
  }, [clamp, noteSeVolumeScale, playbackVolumePercent]);

  const decodePlaybackAudioBuffer = useCallback(async (
    src: string,
    cacheRef: MutableRefObject<Map<string, AudioBuffer>>,
    taskRef: MutableRefObject<Map<string, Promise<AudioBuffer | null>>>,
  ): Promise<AudioBuffer | null> => {
    if (!src) {
      return null;
    }
    const cached = cacheRef.current.get(src);
    if (cached) {
      return cached;
    }
    const pending = taskRef.current.get(src);
    if (pending) {
      return pending;
    }
    const context = ensurePlaybackSeAudioContext();
    if (!context) {
      return null;
    }

    const task = (async () => {
      try {
        const binary = await downloadBytes(src);
        const decoded = await context.decodeAudioData(binary.slice(0));
        cacheRef.current.set(src, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        taskRef.current.delete(src);
      }
    })();

    taskRef.current.set(src, task);
    return task;
  }, [ensurePlaybackSeAudioContext]);

  const decodePlaybackSeBuffer = useCallback((src: string): Promise<AudioBuffer | null> => (
    decodePlaybackAudioBuffer(src, playbackSeBufferBySrcRef, playbackSeDecodeTaskBySrcRef)
  ), [decodePlaybackAudioBuffer]);

  const decodePlaybackBgmBuffer = useCallback(async (src: string): Promise<AudioBuffer | null> => {
    const cacheSeq = playbackBgmCacheSeqRef.current;
    const decoded = await decodePlaybackAudioBuffer(
      src,
      playbackBgmBufferBySrcRef,
      playbackBgmDecodeTaskBySrcRef,
    );
    return playbackBgmCacheSeqRef.current === cacheSeq ? decoded : null;
  }, [decodePlaybackAudioBuffer]);

  /** Plays `played` (`buffer` or its time-stretched copy at `playbackRate`) from chart time `offsetSec`. */
  const startPlaybackBgmAt = useCallback((
    buffer: AudioBuffer,
    played: AudioBuffer,
    offsetSec: number,
    playbackRate: number,
  ): number | null => {
    const context = ensurePlaybackSeAudioContext();
    if (!context || buffer.duration <= 0) {
      return null;
    }
    stopPlaybackBgmSource();
    const source = context.createBufferSource();
    const safeRate = Math.max(0.01, playbackRate);
    const safeOffset = clamp(offsetSec, 0, Math.max(0, buffer.duration - 0.001));
    const stretched = played !== buffer;
    source.buffer = played;
    // A stretched copy already runs at the chosen speed; only the original buffer is sped up by the source.
    source.playbackRate.value = stretched ? 1 : safeRate;
    playbackBgmOriginalBufferRef.current = buffer;
    source.connect(playbackBgmGainRef.current ?? context.destination);
    source.onended = () => {
      if (playbackBgmSourceRef.current === source) {
        playbackBgmSourceRef.current = null;
      }
    };
    source.start(0, stretched ? safeOffset * played.duration / buffer.duration : safeOffset);
    playbackBgmSourceRef.current = source;
    playbackBgmClockBaseSecRef.current = safeOffset;
    playbackBgmClockBaseContextTimeSecRef.current = context.currentTime;
    playbackBgmPlaybackRateRef.current = safeRate;
    playbackBgmDurationSecRef.current = buffer.duration;
    return safeOffset;
  }, [clamp, ensurePlaybackSeAudioContext, stopPlaybackBgmSource]);

  /** The BGM to play at `rate` with its pitch kept; the original (pitch shifted) if stretching fails. */
  const playbackBgmForSpeed = useCallback(async (buffer: AudioBuffer, rate: number): Promise<AudioBuffer> => {
    const context = ensurePlaybackSeAudioContext();
    if (!context || rate === 1) return buffer;
    const startedMs = performance.now();
    try {
      const stretched = await stretchAudioBuffer(context, buffer, rate);
      appLog("info", "editor.playback.bgm-stretched", { rate, durationSec: buffer.duration, elapsedMs: Math.round(performance.now() - startedMs) });
      return stretched;
    } catch (error) {
      appLog("warn", "editor.playback.bgm-stretch-failed", { rate, message: error instanceof Error ? error.message : String(error) });
      return buffer;
    }
  }, [ensurePlaybackSeAudioContext]);

  const getPlaybackBgmTimeSec = useCallback((): number | null => {
    const context = playbackSeAudioContextRef.current;
    const source = playbackBgmSourceRef.current;
    const duration = playbackBgmDurationSecRef.current;
    if (!context || !source || duration <= 0) {
      return null;
    }
    const elapsedSec = Math.max(0, context.currentTime - playbackBgmClockBaseContextTimeSecRef.current);
    return clamp(
      playbackBgmClockBaseSecRef.current + elapsedSec * playbackBgmPlaybackRateRef.current,
      0,
      duration,
    );
  }, [clamp]);

  const preloadPlaybackSeBuffers = useCallback(async (
    runtimeSe: SeSkinAssets | null,
    options?: { waitForReady?: boolean; timeoutMs?: number },
  ) => {
    if (!runtimeSe) {
      return;
    }
    const sources = resolvePlaybackSeSources(runtimeSe);
    const candidates = [
      sources.single,
      sources.skill,
      sources.flick,
      sources.directional1,
      sources.directional2,
      sources.directional3,
      sources.longLoop,
    ];
    const decodeTasks: Array<Promise<AudioBuffer | null>> = [];
    for (const src of candidates) {
      if (!src) {
        continue;
      }
      decodeTasks.push(decodePlaybackSeBuffer(src));
    }
    if (!options?.waitForReady || decodeTasks.length === 0) {
      return;
    }
    const settleTask = Promise.allSettled(decodeTasks);
    const timeoutMs = Math.max(0, options.timeoutMs ?? 240);
    if (timeoutMs <= 0) {
      await settleTask;
      return;
    }
    await Promise.race([
      settleTask,
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs);
      }),
    ]);
  }, [decodePlaybackSeBuffer]);

  const resetPlaybackSoundStateAt = useCallback((startSec: number) => {
    const EPS = 1e-6;
    playbackEventCursorRef.current = lowerBoundByTime(
      playbackNoteHitEvents,
      startSec + EPS,
      (event) => event.timeSec,
    );
    playbackSlideStartCursorRef.current = lowerBoundByTime(
      playbackSlideLoopRangesByStart,
      startSec + EPS,
      (range) => range.startSec,
    );
    playbackSlideEndCursorRef.current = lowerBoundByTime(
      playbackSlideLoopRangesByEnd,
      startSec + EPS,
      (range) => range.endSec,
    );
    playbackActiveSlideLoopIdSetRef.current.clear();
    for (const range of playbackSlideLoopRangesByStart) {
      if (range.startSec > startSec + EPS) {
        break;
      }
      if (range.endSec > startSec + EPS) {
        playbackActiveSlideLoopIdSetRef.current.add(range.chainId);
      }
    }
  }, [playbackNoteHitEvents, playbackSlideLoopRangesByEnd, playbackSlideLoopRangesByStart]);

  const processPlaybackSoundFrame = useCallback((prevTimeSec: number, nextTimeSec: number) => {
    if (!(nextTimeSec > prevTimeSec)) {
      return;
    }
    const runtimeSe = appliedSkinResources?.se ?? null;
    if (!runtimeSe) {
      return;
    }
    const sources = resolvePlaybackSeSources(runtimeSe);
    const oneShotVolume = clamp(playbackVolumePercent / 100, 0, 1) * noteSeVolumeScale;
    const audioContext = ensurePlaybackSeAudioContext();

    const getOneShotPlayer = (src: string): HTMLAudioElement => {
      let pool = playbackSePoolBySrcRef.current.get(src);
      if (!pool) {
        const players: HTMLAudioElement[] = Array.from({ length: PLAYBACK_SE_POOL_SIZE }, () => {
          const created = new Audio(src);
          created.preload = "auto";
          return created;
        });
        pool = { players, nextIndex: 0 };
        playbackSePoolBySrcRef.current.set(src, pool);
      }
      const player = pool.players[pool.nextIndex % pool.players.length];
      pool.nextIndex = (pool.nextIndex + 1) % pool.players.length;
      return player;
    };
    const playOneShotViaHtml = (src: string) => {
      const player = getOneShotPlayer(src);
      try {
        player.pause();
      } catch {
        // ignore pause failure
      }
      player.currentTime = 0;
      player.volume = oneShotVolume;
      player.playbackRate = 1;
      void player.play().catch(() => {
        // ignore browser playback policy or media errors
      });
    };
    const playOneShotViaWebAudio = (src: string): boolean => {
      if (!audioContext) {
        return false;
      }
      const buffer = playbackSeBufferBySrcRef.current.get(src);
      if (!buffer) {
        void decodePlaybackSeBuffer(src);
        return false;
      }
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      const target = playbackSeMasterGainRef.current ?? audioContext.destination;
      source.connect(target);
      playbackSeWebAudioOneshotSetRef.current.add(source);
      source.onended = () => {
        playbackSeWebAudioOneshotSetRef.current.delete(source);
        try {
          source.disconnect();
        } catch {
          // ignore disconnect failure
        }
      };
      try {
        source.start();
      } catch {
        playbackSeWebAudioOneshotSetRef.current.delete(source);
        try {
          source.disconnect();
        } catch {
          // ignore disconnect failure
        }
        return false;
      }
      return true;
    };
    const playOneShot = (src: string | null) => {
      if (!src) {
        return;
      }
      if (audioContext) {
        void playOneShotViaWebAudio(src);
        return;
      }
      playOneShotViaHtml(src);
    };
    const resolveNoteHitSe = (note: ChartNote): string | null => {
      if (note.type === "single") {
        return sources.single;
      }
      if (note.type === "skill") {
        return sources.skill;
      }
      if (note.type === "flick") {
        return sources.flick;
      }
      if (note.type === "directional_flick_left" || note.type === "directional_flick_right") {
        const width = normalizeDirectionalWidth(note.width);
        if (width <= 1) {
          return sources.directional1;
        }
        if (width === 2) {
          return sources.directional2;
        }
        return sources.directional3;
      }
      return null;
    };

    const EPS = 1e-6;
    const triggerWindowEndSec = nextTimeSec + PLAYBACK_SE_TRIGGER_LEAD_SEC;
    let noteIndex = playbackEventCursorRef.current;
    while (noteIndex < playbackNoteHitEvents.length) {
      const event = playbackNoteHitEvents[noteIndex];
      if (event.timeSec <= prevTimeSec + EPS) {
        noteIndex += 1;
        continue;
      }
      if (event.timeSec > triggerWindowEndSec + EPS) {
        break;
      }
      playOneShot(resolveNoteHitSe(event.note));
      noteIndex += 1;
    }
    playbackEventCursorRef.current = noteIndex;

    const activeIdSet = playbackActiveSlideLoopIdSetRef.current;
    let startCursor = playbackSlideStartCursorRef.current;
    while (startCursor < playbackSlideLoopRangesByStart.length) {
      const range = playbackSlideLoopRangesByStart[startCursor];
      if (range.startSec > triggerWindowEndSec + EPS) {
        break;
      }
      if (range.endSec > triggerWindowEndSec + EPS) {
        activeIdSet.add(range.chainId);
      }
      startCursor += 1;
    }
    playbackSlideStartCursorRef.current = startCursor;

    let endCursor = playbackSlideEndCursorRef.current;
    while (endCursor < playbackSlideLoopRangesByEnd.length) {
      const range = playbackSlideLoopRangesByEnd[endCursor];
      if (range.endSec > triggerWindowEndSec + EPS) {
        break;
      }
      activeIdSet.delete(range.chainId);
      endCursor += 1;
    }
    playbackSlideEndCursorRef.current = endCursor;

    const longLineLoopSrc = sources.longLoop;
    if (!longLineLoopSrc || activeIdSet.size === 0) {
      const webAudioLoop = playbackSeWebAudioLongLoopSourceRef.current;
      if (webAudioLoop) {
        try {
          webAudioLoop.stop();
        } catch {
          // ignore already-stopped source
        }
        try {
          webAudioLoop.disconnect();
        } catch {
          // ignore disconnect failure
        }
        playbackSeWebAudioLongLoopSourceRef.current = null;
      }
      playbackSeWebAudioLongLoopSrcRef.current = null;

      const existingPlayer = playbackLongLoopPlayerRef.current;
      if (existingPlayer) {
        try {
          existingPlayer.pause();
        } catch {
          // ignore pause failure
        }
        existingPlayer.currentTime = 0;
      }
      return;
    }

    if (audioContext) {
      const longBuffer = playbackSeBufferBySrcRef.current.get(longLineLoopSrc);
      if (!longBuffer) {
        void decodePlaybackSeBuffer(longLineLoopSrc);
      } else {
        const loopSrcChanged = playbackSeWebAudioLongLoopSrcRef.current !== longLineLoopSrc;
        let loopSource = playbackSeWebAudioLongLoopSourceRef.current;
        if (!loopSource || loopSrcChanged) {
          if (loopSource) {
            try {
              loopSource.stop();
            } catch {
              // ignore already-stopped source
            }
            try {
              loopSource.disconnect();
            } catch {
              // ignore disconnect failure
            }
          }
          loopSource = audioContext.createBufferSource();
          loopSource.buffer = longBuffer;
          loopSource.loop = true;
          const target = playbackSeMasterGainRef.current ?? audioContext.destination;
          loopSource.connect(target);
          try {
            loopSource.start();
            playbackSeWebAudioLongLoopSourceRef.current = loopSource;
            playbackSeWebAudioLongLoopSrcRef.current = longLineLoopSrc;
          } catch {
            try {
              loopSource.disconnect();
            } catch {
              // ignore disconnect failure
            }
            playbackSeWebAudioLongLoopSourceRef.current = null;
            playbackSeWebAudioLongLoopSrcRef.current = null;
          }
        }
      }
    }

    if (audioContext) {
      const fallbackPlayer = playbackLongLoopPlayerRef.current;
      if (fallbackPlayer) {
        try {
          fallbackPlayer.pause();
        } catch {
          // ignore pause failure
        }
        fallbackPlayer.currentTime = 0;
      }
      return;
    }

    let loopPlayer = playbackLongLoopPlayerRef.current;
    const loopSrcChanged = playbackLongLoopSrcRef.current !== longLineLoopSrc;
    if (!loopPlayer || loopSrcChanged) {
      if (loopPlayer) {
        try {
          loopPlayer.pause();
        } catch {
          // ignore pause failure
        }
      }
      loopPlayer = new Audio(longLineLoopSrc);
      loopPlayer.preload = "auto";
      loopPlayer.loop = true;
      playbackLongLoopPlayerRef.current = loopPlayer;
      playbackLongLoopSrcRef.current = longLineLoopSrc;
    }
    loopPlayer.volume = oneShotVolume;
    if (loopPlayer.paused) {
      void loopPlayer.play().catch(() => {
        // ignore playback policy or decode errors
      });
    }
  }, [
    appliedSkinResources,
    clamp,
    decodePlaybackSeBuffer,
    ensurePlaybackSeAudioContext,
    normalizeDirectionalWidth,
    playbackNoteHitEvents,
    playbackSlideLoopRangesByEnd,
    playbackSlideLoopRangesByStart,
    noteSeVolumeScale,
    playbackVolumePercent,
  ]);

  const playbackTickHandlerRef = useRef<() => void>(() => {});
  const runPlaybackTick = useCallback(() => {
    if (!playbackIsPlayingRef.current) {
      return;
    }
    const nowMs = performance.now();
    const previousMs = playbackTickLastNowMsRef.current ?? nowMs;
    playbackTickLastNowMsRef.current = nowMs;
    const deltaSec = Math.max(0, Math.min(0.1, (nowMs - previousMs) / 1000));
    const safeDuration = Math.max(
      0,
      playbackDurationLimitSecRef.current > 0 ? playbackDurationLimitSecRef.current : playbackCeilingSec,
    );
    const prevTimeSec = playbackNowSecRef.current;
    let nextTimeSec = clamp(prevTimeSec + deltaSec * currentPlaybackSpeed, 0, safeDuration);
    if (playbackHasAudioTrackRef.current) {
      const mediaLimit = playbackBgmDurationSecRef.current > 0
        ? Math.min(playbackBgmDurationSecRef.current, safeDuration)
        : safeDuration;
      const mediaTime = getPlaybackBgmTimeSec();
      if (mediaTime !== null && Number.isFinite(mediaTime)) {
        nextTimeSec = clamp(mediaTime, 0, mediaLimit);
      }
      if (nextTimeSec >= mediaLimit - 1e-3 && safeDuration > mediaLimit + 1e-3) {
        playbackHasAudioTrackRef.current = false;
        stopPlaybackBgmSource();
        playbackTickLastNowMsRef.current = nowMs;
      }
    }
    playbackNowSecRef.current = nextTimeSec;
    if (isSvPreviewEnabledRef.current) {
      svPreviewTimeSecRef.current = nextTimeSec;
      setSvPreviewTimeSec(nextTimeSec);
    }
    processPlaybackSoundFrame(prevTimeSec, nextTimeSec);
        syncPlaybackViewport(nextTimeSec);
      updatePlaybackRuntimeLine(nextTimeSec);
    if (nextTimeSec >= safeDuration - 1e-3) {
      stopPlayback();
      return;
    }
    playbackTickRafRef.current = requestAnimationFrame(() => playbackTickHandlerRef.current());
  }, [
    clamp,
    currentPlaybackSpeed,
    getPlaybackBgmTimeSec,
    playbackCeilingSec,
    processPlaybackSoundFrame,
    stopPlayback,
    stopPlaybackBgmSource,
    syncPlaybackViewport,
    updatePlaybackRuntimeLine,
  ]);

  useEffect(() => {
    playbackTickHandlerRef.current = runPlaybackTick;
  }, [runPlaybackTick]);

  const startPlaybackAt = useCallback(async (seconds: number) => {
    const startSeq = playbackStartSeqRef.current + 1;
    playbackStartSeqRef.current = startSeq;
    const isStartCurrent = () => playbackStartSeqRef.current === startSeq;
    const audio = playbackAudioRef.current;
    const safeDuration = Math.max(0, playbackCeilingSec);
    let safeSeconds = clamp(seconds, 0, safeDuration);
    const runtimeSe = appliedSkinResources?.se ?? null;
    await preloadPlaybackSeBuffers(runtimeSe, { waitForReady: true, timeoutMs: 240 });
    if (!isStartCurrent()) {
      return;
    }
    const seContext = ensurePlaybackSeAudioContext();
    if (seContext && seContext.state === "suspended") {
      try {
        await seContext.resume();
      } catch {
        // ignore resume failure
      }
    }
    if (!isStartCurrent()) {
      return;
    }
    clearPlaybackTick();
    playbackDurationLimitSecRef.current = safeDuration;
    playbackViewportSyncStampRef.current = 0;
    stopAllPlaybackSoundEffects();
    stopPlaybackBgmSource();
    playbackHasAudioTrackRef.current = false;
    if (hasUploadedAudio && audio) {
      audio.pause();
      const buffer = await decodePlaybackBgmBuffer(audio.src);
      if (!isStartCurrent()) {
        return;
      }
      if (!buffer) {
        showDialog("音频解码失败，请重试播放。", "error");
        return;
      }
      const shouldStartAudio = safeSeconds < buffer.duration - 1e-3;
      if (shouldStartAudio) {
        const played = await playbackBgmForSpeed(buffer, currentPlaybackSpeed);
        if (!isStartCurrent()) {
          return;
        }
        const startedAt = startPlaybackBgmAt(buffer, played, safeSeconds, currentPlaybackSpeed);
        if (startedAt === null) {
          showDialog("音频播放失败，请重试播放。", "error");
          return;
        }
        safeSeconds = startedAt;
        playbackHasAudioTrackRef.current = true;
      }
    }
    playbackNowSecRef.current = safeSeconds;
    if (isSvPreviewEnabledRef.current) {
      svPreviewTimeSecRef.current = safeSeconds;
      setSvPreviewTimeSec(safeSeconds);
    }
    resetPlaybackSoundStateAt(safeSeconds);
    syncPlaybackViewport(safeSeconds);
    playbackTickLastNowMsRef.current = performance.now();
    playbackIsPlayingRef.current = true;
    setIsPlaybackPlaying(true);
    hidePlaybackGuide();
    updatePlaybackRuntimeLine(safeSeconds);
    playbackTickRafRef.current = requestAnimationFrame(() => playbackTickHandlerRef.current());
  }, [
    appliedSkinResources,
    clamp,
    clearPlaybackTick,
    currentPlaybackSpeed,
    formatDuration,
    hasUploadedAudio,
    playbackCeilingSec,
    playbackTotalLabel,
    playbackVolumePercent,
    preloadPlaybackSeBuffers,
    decodePlaybackBgmBuffer,
    resetPlaybackSoundStateAt,
    ensurePlaybackSeAudioContext,
    showDialog,
    playbackBgmForSpeed,
    startPlaybackBgmAt,
    syncPlaybackViewport,
    hidePlaybackGuide,
    updatePlaybackRuntimeLine,
    stopAllPlaybackSoundEffects,
    stopPlaybackBgmSource,
  ]);

  const onTogglePlayTool = useCallback(() => {
    setIsPlayToolSelected((previous) => {
      const next = !previous;
      if (next) {
        setIsToolArmed(false);
        clearSelection();
        hidePlaybackGuide();
        hidePlaybackRuntimeLine();
      } else {
        hidePlaybackGuide();
        hidePlaybackRuntimeLine();
        if (isPlaybackPlaying) {
          stopPlayback();
        }
      }
      return next;
    });
  }, [clearSelection, hidePlaybackGuide, hidePlaybackRuntimeLine, isPlaybackPlaying, showDialog, stopPlayback]);

  const applyToolFromPalette = useCallback((nextType: NoteType) => {
    if (isPlayToolSelected) {
      setIsPlayToolSelected(false);
      hidePlaybackGuide();
      hidePlaybackRuntimeLine();
      if (isPlaybackPlaying) {
        stopPlayback();
      }
    }
    applyToolFromPaletteRaw(nextType);
  }, [applyToolFromPaletteRaw, hidePlaybackGuide, hidePlaybackRuntimeLine, isPlayToolSelected, isPlaybackPlaying, stopPlayback]);

  const applyMiddleToolFromPalette = useCallback(() => {
    if (isPlayToolSelected) {
      setIsPlayToolSelected(false);
      hidePlaybackGuide();
      hidePlaybackRuntimeLine();
      if (isPlaybackPlaying) {
        stopPlayback();
      }
    }
    applyMiddleToolFromPaletteRaw();
  }, [applyMiddleToolFromPaletteRaw, hidePlaybackGuide, hidePlaybackRuntimeLine, isPlayToolSelected, isPlaybackPlaying, stopPlayback]);

  /** The curve tool's dialog's 保存: keeps the fit (applied to each Slide segment pressed with the tool) and arms the
   * tool. */
  const saveCurveToolSettings = useCallback((next: SlideFitSettings) => {
    setCurveToolSettings(next);
    if (isPlayToolSelected) {
      setIsPlayToolSelected(false);
      hidePlaybackGuide();
      hidePlaybackRuntimeLine();
      if (isPlaybackPlaying) {
        stopPlayback();
      }
    }
    applyCurveToolFromPaletteRaw();
  }, [applyCurveToolFromPaletteRaw, hidePlaybackGuide, hidePlaybackRuntimeLine, isPlayToolSelected, isPlaybackPlaying,
    stopPlayback]);
  /** Its dialog's 取消: the preset is not kept and the curve tool does not stay armed (another armed tool does). */
  const cancelCurveTool = useCallback(() => {
    if (isToolArmed && tool === "curve") setIsToolArmed(false);
  }, [isToolArmed, tool]);
  /** The armed curve tool on a pressed Slide segment: its preset replaces the segment's Hidden nodes. A Long keeps its
   * shape. */
  const applyCurveToolOnConnection = useCallback((segment: RenderConnectionSegment) => {
    if (!isToolArmed || tool !== "curve") return;
    if (committedSlideChainById.get(segment.chainId)?.long === true) {
      showDialog("Long 不能应用形状预设。");
      return;
    }
    applySlideSegmentSettings(segment.slideSegmentId, curveToolSettings);
  }, [applySlideSegmentSettings, committedSlideChainById, curveToolSettings, isToolArmed, showDialog, tool]);

  const applyLongToolFromPalette = useCallback(() => {
    if (isPlayToolSelected) {
      setIsPlayToolSelected(false);
      hidePlaybackGuide();
      hidePlaybackRuntimeLine();
      if (isPlaybackPlaying) {
        stopPlayback();
      }
    }
    applyLongToolFromPaletteRaw();
  }, [applyLongToolFromPaletteRaw, hidePlaybackGuide, hidePlaybackRuntimeLine, isPlayToolSelected, isPlaybackPlaying, stopPlayback]);

  const applyBpmToolFromPalette = useCallback(() => {
    if (isPlayToolSelected) {
      setIsPlayToolSelected(false);
      hidePlaybackGuide();
      hidePlaybackRuntimeLine();
      if (isPlaybackPlaying) {
        stopPlayback();
      }
    }
    applyBpmToolFromPaletteRaw();
  }, [applyBpmToolFromPaletteRaw, hidePlaybackGuide, hidePlaybackRuntimeLine, isPlayToolSelected, isPlaybackPlaying, stopPlayback]);

  const applySvToolFromPalette = useCallback(() => {
    if (!isExGarupaEnabled) {
      showDialog("ExGarupa 模式关闭时不可使用 SV。");
      return;
    }
    if (isPlayToolSelected) {
      setIsPlayToolSelected(false);
      hidePlaybackGuide();
      hidePlaybackRuntimeLine();
      if (isPlaybackPlaying) {
        stopPlayback();
      }
    }
    applySvToolFromPaletteRaw();
  }, [applySvToolFromPaletteRaw, hidePlaybackGuide, hidePlaybackRuntimeLine, isExGarupaEnabled, isPlayToolSelected, isPlaybackPlaying, showDialog, stopPlayback]);

  const applyCopyToolFromPalette = useCallback(() => {
    if (isPlayToolSelected) {
      setIsPlayToolSelected(false);
      hidePlaybackGuide();
      hidePlaybackRuntimeLine();
      if (isPlaybackPlaying) {
        stopPlayback();
      }
    }
    applyCopyToolFromPaletteRaw();
  }, [applyCopyToolFromPaletteRaw, hidePlaybackGuide, hidePlaybackRuntimeLine, isPlayToolSelected, isPlaybackPlaying, stopPlayback]);

  const applyPasteToolFromPalette = useCallback(() => {
    if (isPlayToolSelected) {
      setIsPlayToolSelected(false);
      hidePlaybackGuide();
      hidePlaybackRuntimeLine();
      if (isPlaybackPlaying) {
        stopPlayback();
      }
    }
    applyPasteToolFromPaletteRaw();
  }, [
    applyPasteToolFromPaletteRaw,
    hidePlaybackGuide,
    hidePlaybackRuntimeLine,
    isPlayToolSelected,
    isPlaybackPlaying,
    showDialog,
    stopPlayback,
  ]);

  const canStepPlaybackSpeedDown = playbackSpeedIndex > 0;
  const canStepPlaybackSpeedUp = playbackSpeedIndex < PLAYBACK_SPEED_OPTIONS.length - 1;
  const canStepPlaybackVolumeDown = playbackVolumePercent > 0;
  const canStepPlaybackVolumeUp = playbackVolumePercent < 100;
  const canStepPlaybackPositionDown = playbackLinePositionPercent > 0;
  const canStepPlaybackPositionUp = playbackLinePositionPercent < 100;

  const stepPlaybackSpeed = useCallback((delta: number) => {
    setPlaybackSpeedIndex((previous) =>
      clamp(previous + delta, 0, PLAYBACK_SPEED_OPTIONS.length - 1),
    );
  }, [clamp]);

  const stepPlaybackVolume = useCallback((delta: number) => {
    setPlaybackVolumePercent((previous) => clamp(previous + delta * 5, 0, 100));
  }, [clamp]);

  const stepPlaybackPosition = useCallback((delta: number) => {
    setPlaybackLinePositionPercent((previous) => clamp(previous + delta, 0, 100));
  }, [clamp]);

  const setPlaybackFollowEnabled = useCallback((value: boolean) => {
    setIsPlaybackFollowEnabledState(value);
  }, []);

  useEffect(() => {
    if (isHabahiroRhythmRipName(skinSelection.rhythmRipName)) {
      return;
    }
    lastStandardRhythmSkinRef.current = {
      rhythmType: skinSelection.rhythmType,
      rhythmRipName: skinSelection.rhythmRipName,
      rhythmServer: skinSelection.rhythmServer,
    };
  }, [skinSelection.rhythmRipName, skinSelection.rhythmServer, skinSelection.rhythmType]);

  const buildHabahiroSkinSelection = useCallback((): SkinSelection => {
    const id = bestdoriSkinCatalogOptions?.habahiroRhythm[0];
    const resource = id === undefined
      ? null
      : bestdoriSkinCatalogOptions?.resources.habahiroRhythm[id] ?? null;
    if (resource === null) {
      throw new Error("Bestdori HABAHIRO catalog is unavailable; no fixed network candidate is substituted.");
    }
    return normalizeSkinSelection({
      ...skinSelection,
      rhythmType: resource.id,
      rhythmRipName: resource.id,
      rhythmServer: resource.server,
    });
  }, [bestdoriSkinCatalogOptions, normalizeSkinSelection, skinSelection]);

  const buildStandardRhythmSkinSelection = useCallback((): SkinSelection => {
    const remembered = lastStandardRhythmSkinRef.current;
    const fallbackType = bestdoriSkinCatalogOptions?.rhythm?.[0];
    if (!remembered && !fallbackType) {
      throw new Error("Bestdori rhythm catalog is unavailable; no fixed network candidate is substituted.");
    }
    const fallbackResource = fallbackType === undefined
      ? null
      : bestdoriSkinCatalogOptions?.resources.rhythm[fallbackType] ?? null;
    return normalizeSkinSelection({
      ...skinSelection,
      rhythmType: remembered?.rhythmType ?? fallbackResource!.id,
      rhythmRipName: remembered?.rhythmRipName ?? fallbackResource!.id,
      rhythmServer: remembered?.rhythmServer ?? fallbackResource!.server,
    });
  }, [bestdoriSkinCatalogOptions, normalizeSkinSelection, skinSelection]);

  const requestSpRhythmRegressionConfirm = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      showDialog(
        "切换到“基础”模式将对当前谱面执行不可逆修改（方向滑键回退为 Flick，hidden 节点将被移除），并清空撤销与重做记录。是否继续应用？",
        "warning",
        { onConfirm: () => resolve(true), onCancel: () => resolve(false) },
      );
    });
  }, [showDialog]);

  const requestExGarupaRegressionConfirm = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      showDialog(
        "关闭“ExGarupa”将对当前谱面执行不可逆修改（SV、非 Global Timing Group、无头/无尾 Slide 和扩展 Slide 节点将回退，超出 7 轨的音符移回轨道内，轨道数恢复为 7），并清空撤销与重做记录。是否继续应用？",
        "warning",
        { onConfirm: () => resolve(true), onCancel: () => resolve(false) },
      );
    });
  }, [showDialog]);

  const applyAppOptionSettings = useCallback(async (nextDraft: EditorOptionSettings) => {
    const normalizedNext = normalizeEditorOptionSettings(nextDraft);
    const turningOffSpRhythm =
      canUseSpRhythmMode
      && normalizedNext.spRhythmNoteEnabled === false;
    const turningOffExGarupa =
      isExGarupaEnabled
      && normalizedNext.exGarupaEnabled === false;
    let nextChartState: ChartStateLike = { notes, slideChains, svEvents, timingGroups };
    let shouldApplyRegressedChart = false;

    if (turningOffSpRhythm) {
      const chartUsesSpRhythm = isChartUsingSpRhythm(nextChartState);
      if (chartUsesSpRhythm) {
        const confirmed = await requestSpRhythmRegressionConfirm();
        if (!confirmed) {
          return false;
        }
      }
      nextChartState = regressChartWithoutSpRhythm(nextChartState);
      shouldApplyRegressedChart = true;
    }

    if (turningOffExGarupa) {
      const chartUsesExGarupa = isChartUsingExGarupa(nextChartState);
      if (chartUsesExGarupa) {
        const confirmed = await requestExGarupaRegressionConfirm();
        if (!confirmed) {
          return false;
        }
      }
      nextChartState = regressChartWithoutExGarupa(nextChartState);
      shouldApplyRegressedChart = true;
    }

    if (turningOffExGarupa) {
      // Extra lanes are an ExGarupa feature; the regression above moved their notes into lanes 0–6.
      setSettings((previous) => previous.laneCount === 7 ? previous : { ...previous, laneCount: 7 });
    }

    if (shouldApplyRegressedChart) {
      setNotes(sortNotes(nextChartState.notes));
      setSlideChains(nextChartState.slideChains);
      if (nextChartState.svEvents) {
        setSvEvents(nextChartState.svEvents);
      }
      if (nextChartState.timingGroups) {
        setTimingGroups(nextChartState.timingGroups);
      }
      clearSelection();
      setSelectedTimingGroupId(GLOBAL_TIMING_GROUP_ID);
      setIsTimingGroupModeEnabled(false);
      setIsTimingGroupPanelOpen(false);
      // The regression is not an undoable edit, and older history may hold features this mode removes.
      discardUndoHistory();
    }

    setAppOptionSettings(normalizedNext);
    return true;
  }, [
    canUseSpRhythmMode,
    isExGarupaEnabled,
    clearSelection,
    discardUndoHistory,
    normalizeEditorOptionSettings,
    setSettings,
    notes,
    requestExGarupaRegressionConfirm,
    requestSpRhythmRegressionConfirm,
    showDialog,
    setNotes,
    setSlideChains,
    setSvEvents,
    setTimingGroups,
    slideChains,
    sortNotes,
    svEvents,
    timingGroups,
  ]);

  /** Editor mode: 基础 (no SP, no ExGarupa), SP 音符 (SP) or ExGarupa (SP and ExGarupa). */
  const editorMode: "basic" | "special" | "exgarupa" = isExGarupaEnabled
    ? "exgarupa" : canUseSpRhythmMode ? "special" : "basic";
  const setEditorMode = useCallback((mode: "basic" | "special" | "exgarupa") => {
    // Leaving a mode regresses the chart through applyAppOptionSettings, which asks before irreversible changes.
    return applyAppOptionSettings({ ...appOptionSettings,
      spRhythmNoteEnabled: mode !== "basic", exGarupaEnabled: mode === "exgarupa" });
  }, [appOptionSettings, applyAppOptionSettings]);

  /** Lane count (7–13, step 2) sets the horizontal scale of the track; extra lanes are an ExGarupa feature. */
  const setLaneCount = useCallback((value: number) => {
    if (!isExGarupaEnabled) return;
    const laneCount = normalizeLaneCount(value);
    setSettings((previous) => previous.laneCount === laneCount ? previous : { ...previous, laneCount });
  }, [isExGarupaEnabled, setSettings]);

  const requestHabahiroRegressionConfirm = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      showDialog(
        "关闭“HABAHIRO”将对当前谱面执行不可逆修改（多宽音符回退为单宽，并移除变轨位置），并清空撤销与重做记录。是否继续应用？",
        "warning",
        { onConfirm: () => resolve(true), onCancel: () => resolve(false) },
      );
    });
  }, [showDialog]);

  /**
   * HABAHIRO adds the chart's #HABAHIRO header (wide notes, lane changes); the skin sync below switches the note
   * skin to the HABAHIRO skin while it is on and back when it is off. Turning it off removes the header.
   */
  const setHabahiroMode = useCallback(async (enabled: boolean) => {
    if (enabled === isHabahiroEnabled) return true;
    if (enabled) {
      setSettings((previous) => ({ ...previous, habahiro: true as const }));
      return true;
    }
    const chartState: ChartStateLike = { notes, slideChains, svEvents, timingGroups };
    const usesHabahiro = isChartUsingHabahiro(chartState) || (settings.laneChangeBeats?.length ?? 0) > 0;
    if (usesHabahiro && !await requestHabahiroRegressionConfirm()) return false;
    if (isChartUsingHabahiro(chartState)) {
      setNotes(sortNotes(regressChartWithoutHabahiro(chartState).notes));
      clearSelection();
    }
    setSettings((previous) => {
      const { habahiro: _habahiro, laneChangeBeats: _laneChangeBeats, ...rest } = previous;
      return rest;
    });
    // The regression is not an undoable edit, and older history may hold wide notes.
    discardUndoHistory();
    return true;
  }, [clearSelection, discardUndoHistory, isHabahiroEnabled, notes, requestHabahiroRegressionConfirm, setNotes, setSettings, showDialog,
    settings.laneChangeBeats, slideChains, sortNotes, svEvents, timingGroups]);

  useEffect(() => {
    // Session restore applies the saved skin first; syncing before it lands would apply a
    // second skin built on the default selection.
    if (!settingsResourcesReady || syncingHabahiroSkinRef.current) {
      return;
    }
    const skinIsHabahiro = isHabahiroRhythmRipName(skinSelection.rhythmRipName);
    if (isHabahiroEnabled && !skinIsHabahiro) {
      try {
        const next = buildHabahiroSkinSelection();
        syncingHabahiroSkinRef.current = true;
        void applyBestdoriSkinSelectionRef.current(next, true)
          .finally(() => {
            syncingHabahiroSkinRef.current = false;
          });
      } catch (error) {
        showDialog(error instanceof Error ? error.message : String(error), "error");
      }
      return;
    }
    if (!isHabahiroEnabled && skinIsHabahiro) {
      try {
        const next = buildStandardRhythmSkinSelection();
        syncingHabahiroSkinRef.current = true;
        void applyBestdoriSkinSelectionRef.current(next, true)
          .finally(() => {
            syncingHabahiroSkinRef.current = false;
          });
      } catch (error) {
        showDialog(error instanceof Error ? error.message : String(error), "error");
      }
    }
  }, [
    settingsResourcesReady,
    isHabahiroEnabled,
    buildHabahiroSkinSelection,
    buildStandardRhythmSkinSelection,
    showDialog,
    skinSelection.rhythmRipName,
  ]);

  useEffect(() => {
    if (!isPlaybackPlaying) {
      return;
    }
    const now = playbackNowSecRef.current;
    syncPlaybackViewport(now);
    updatePlaybackRuntimeLine(now);
  }, [isPlaybackFollowEnabled, isPlaybackPlaying, syncPlaybackViewport, updatePlaybackRuntimeLine]);

  useEffect(() => {
    const audio = playbackAudioRef.current;
    if (audio) {
      audio.playbackRate = currentPlaybackSpeed;
    }
    const buffer = playbackBgmOriginalBufferRef.current;
    const seq = ++playbackBgmSpeedChangeSeqRef.current;
    if (!buffer) {
      return;
    }
    // The current speed keeps playing until the BGM for the new speed is ready, then it continues from there.
    // While stopped this only prepares the stretched BGM so the next start does not wait for it.
    void playbackBgmForSpeed(buffer, currentPlaybackSpeed).then(played => {
      if (seq !== playbackBgmSpeedChangeSeqRef.current || !playbackBgmSourceRef.current
        || playbackBgmOriginalBufferRef.current !== buffer
        || playbackBgmPlaybackRateRef.current === currentPlaybackSpeed) {
        return;
      }
      const now = getPlaybackBgmTimeSec();
      if (now === null || now >= buffer.duration - 1e-3) {
        return;
      }
      startPlaybackBgmAt(buffer, played, now, currentPlaybackSpeed);
    });
  }, [currentPlaybackSpeed, getPlaybackBgmTimeSec, playbackBgmForSpeed, startPlaybackBgmAt]);

  useEffect(() => {
    const audio = playbackAudioRef.current;
    if (audio) {
      audio.volume = clamp(playbackVolumePercent / 100, 0, 1);
    }
    const seMasterGain = playbackSeMasterGainRef.current;
    if (seMasterGain) {
      seMasterGain.gain.value = clamp(playbackVolumePercent / 100, 0, 1) * noteSeVolumeScale;
    }
    const bgmGain = playbackBgmGainRef.current;
    if (bgmGain) {
      bgmGain.gain.value = clamp(playbackVolumePercent / 100, 0, 1);
    }
  }, [clamp, noteSeVolumeScale, playbackVolumePercent]);

  useEffect(() => {
    void preloadPlaybackSeBuffers(appliedSkinResources?.se ?? null);
  }, [appliedSkinResources, preloadPlaybackSeBuffers]);

  // Read at setup only: speed and volume changes are applied to the live audio by their own effects, and
  // must not stop playback or drop the decoded (and time-stretched) BGM.
  const playbackAudioSetupRef = useRef({ stopPlayback, speed: currentPlaybackSpeed, volumePercent: playbackVolumePercent });
  playbackAudioSetupRef.current = { stopPlayback, speed: currentPlaybackSpeed, volumePercent: playbackVolumePercent };
  useEffect(() => {
    const setup = playbackAudioSetupRef.current;
    setup.stopPlayback();
    playbackBgmCacheSeqRef.current += 1;
    playbackBgmOriginalBufferRef.current = null;
    playbackBgmBufferBySrcRef.current.clear();
    playbackBgmDecodeTaskBySrcRef.current.clear();
    const previous = playbackAudioRef.current;
    if (previous) {
      previous.pause();
      previous.removeAttribute("src");
      try {
        previous.load();
      } catch {
        // ignore teardown failures from media backend
      }
      playbackAudioRef.current = null;
    }
    if (!audioObjectUrl) {
      return;
    }
    const audio = new Audio(audioObjectUrl);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      setAudioDurationSec(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
    };
    audio.onerror = () => setAudioDurationSec(0);
    audio.playbackRate = setup.speed;
    audio.volume = clamp(setup.volumePercent / 100, 0, 1);
    playbackAudioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        // ignore teardown failures from media backend
      }
      if (playbackAudioRef.current === audio) {
        playbackAudioRef.current = null;
      }
    };
  }, [audioObjectUrl, clamp]);

  const startingApplication = useIsStartingApplication();
  const [startupAudio, setStartupAudio] = useState<{ key: string; error: string | null } | null>(null);
  const startupSeSources = appliedSkinResources?.se ? Object.values(resolvePlaybackSeSources(appliedSkinResources.se)).filter((src): src is string => typeof src === "string" && src.length > 0) : [];
  const startupAudioKey = JSON.stringify([audioObjectUrl, startupSeSources]);
  useStartupReadiness("editor-audio", startupAudio?.key === startupAudioKey && startupAudio.error === null,
    startupAudio?.key === startupAudioKey ? startupAudio.error : null);
  useEffect(() => {
    if (!startingApplication || !settingsResourcesReady || isSkinApplying || !appliedSkinResources) return;
    let active = true;
    void (async () => {
      const se = await Promise.all(startupSeSources.map(decodePlaybackSeBuffer));
      if (se.some(buffer => buffer === null)) throw new Error("编辑器音符音效解码失败。");
      if (audioObjectUrl && !await decodePlaybackBgmBuffer(audioObjectUrl)) throw new Error("当前谱面 BGM 解码失败。");
      if (active) setStartupAudio({ key: startupAudioKey, error: null });
    })().catch(error => { if (active) setStartupAudio({ key: startupAudioKey, error: String(error) }); });
    return () => { active = false; };
  }, [startingApplication, settingsResourcesReady, isSkinApplying, appliedSkinResources, startupAudioKey, audioObjectUrl, decodePlaybackSeBuffer, decodePlaybackBgmBuffer]);

  useEffect(() => {
    if (!isExGarupaEnabled) {
      setIsTimingGroupPanelOpen(false);
      setIsTimingGroupModeEnabled(false);
      setSelectedTimingGroupId(GLOBAL_TIMING_GROUP_ID);
      if (tool === "sv") {
        setIsToolArmed(false);
      }
    }
  }, [isExGarupaEnabled, tool]);

  // Shared by the Space shortcut and the toolbar play button: start from the playfield's current position, or stop.
  const togglePlaybackFromCurrentPosition = useCallback(() => {
    if (playbackIsPlayingRef.current) {
      stopPlayback();
      return;
    }
    void startPlaybackAt(getPlayfieldBottomTimeSec());
  }, [getPlayfieldBottomTimeSec, startPlaybackAt, stopPlayback]);
  // Playback clock while playing, otherwise the playfield position that playback would start from.
  const getPlaybackClockSec = useCallback(
    () => (playbackIsPlayingRef.current ? playbackNowSecRef.current : getPlayfieldBottomTimeSec()),
    [getPlayfieldBottomTimeSec],
  );

  useEffect(() => {
    if (isMobileRuntime()) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target?.isContentEditable === true;
      if (isTypingTarget) {
        return;
      }
      const playfield = playfieldRef.current;
      if (!playfield || document.activeElement !== playfield) {
        return;
      }
      event.preventDefault();
      togglePlaybackFromCurrentPosition();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlaybackFromCurrentPosition]);

  useEffect(() => {
    return () => {
      clearPlaybackTick();
      clearPlaybackGuideFrame();
      hidePlaybackRuntimeLine();
      stopAllPlaybackSoundEffects();
      const audio = playbackAudioRef.current;
      if (audio) {
        audio.pause();
      }
      const seContext = playbackSeAudioContextRef.current;
      if (seContext) {
        stopPlaybackBgmSource();
        void seContext.close().catch(() => {
          // ignore close failure
        });
        playbackSeAudioContextRef.current = null;
        playbackSeMasterGainRef.current = null;
        playbackBgmGainRef.current = null;
      }
    };
  }, [
    clearPlaybackGuideFrame,
    clearPlaybackTick,
    hidePlaybackRuntimeLine,
    stopAllPlaybackSoundEffects,
    stopPlaybackBgmSource,
  ]);

  const handleBoardMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (isPlayToolSelected) {
      if (playbackIsPlayingRef.current) {
        return;
      }
      const board = playfieldBoardRef.current;
      if (board) {
        const rect = board.getBoundingClientRect();
        const y = clamp(event.clientY - rect.top, 0, scrollContentHeight);
        const timeSec = clamp(yToTime(y), 0, Math.max(playbackCeilingSec, 0));
        if (isSvPreviewEnabledRef.current && Math.abs(svPreviewTimeSecRef.current - timeSec) > 1e-4) {
          svPreviewTimeSecRef.current = timeSec;
          setSvPreviewTimeSec(timeSec);
        }
        queuePlaybackGuide({ y, timeSec });
      }
      return;
    }
    handleBoardMouseMoveRaw(event);
  }, [clamp, handleBoardMouseMoveRaw, isPlayToolSelected, playbackCeilingSec, queuePlaybackGuide, scrollContentHeight, yToTime]);

  const handleBoardMouseLeave = useCallback(() => {
    if (isPlayToolSelected) {
      hidePlaybackGuide();
      return;
    }
    handleBoardMouseLeaveRaw();
  }, [handleBoardMouseLeaveRaw, hidePlaybackGuide, isPlayToolSelected]);

  const handleBoardClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (playbackIsPlayingRef.current || isPlayToolSelected) {
      event.preventDefault();
      return;
    }
    handleBoardClickRaw(event);
  }, [handleBoardClickRaw, isPlayToolSelected]);

  const handleBoardMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      handleBoardMouseDownRaw(event);
      return;
    }
    if (isPlayToolSelected) {
      event.preventDefault();
      if (playbackIsPlayingRef.current) {
        stopPlayback();
        return;
      }
      const board = playfieldBoardRef.current;
      if (!board) {
        return;
      }
      const rect = board.getBoundingClientRect();
      const y = clamp(event.clientY - rect.top, 0, scrollContentHeight);
      const seconds = clamp(yToTime(y), 0, Math.max(playbackCeilingSec, 0));
      void startPlaybackAt(seconds);
      return;
    }
    handleBoardMouseDownRaw(event);
  }, [clamp, handleBoardMouseDownRaw, isPlayToolSelected, playbackCeilingSec, scrollContentHeight, startPlaybackAt, stopPlayback, yToTime]);

  useEditorPointerLifecycle({
    slideBuildRef,
    setSlideBuildState,
    showDialog,
    finalizeSlideBuild,
    selectionMoveRef,
    calcSelectionMoveDelta,
    setSelectionMovePreview,
    setCursorPreview,
    suppressNextBoardClickRef,
    suppressNextNoteClickRef,
    applySelectedOffset,
    finishSelectionDrag,
  });

  const {
    getPaletteSpriteLayers,
    getPaletteSpriteAspectRatio,
    renderPaletteSpriteStack,
  } = useNotePaletteSpriteRendering({
    skinAssets,
    spriteAspectRatios,
    setSpriteAspectRatios,
    DEFAULT_SPRITE_ASPECT_RATIO,
  });
  const {
    getSpriteLayers,
    getSpriteAspectRatio,
    renderSpriteStack,
    renderDirectionalSprite,
    resolvePlacedNoteLayers,
  } = usePlayfieldSpriteRendering({
    skinAssets,
    spriteAspectRatios,
    setSpriteAspectRatios,
    slideRoleByNoteId,
    isColorAssistEnabled: appOptionSettings.colorAssistEnabled,
    DEFAULT_SPRITE_ASPECT_RATIO,
  });
  const getNoteDisplayY = useCallback((note: ChartNote, beat: number): number => {
    const hitSec = beatToSeconds(beat, bpmTimeline);
    const timingGroup = noteTimingGroupById.get(note.id) ?? normalizeTimingGroupId(note.timingGroup);
    const group = isSvPreviewEnabled
      ? (svPreviewTimingGroups.get(timingGroup) ?? svPreviewTimingGroups.get(GLOBAL_TIMING_GROUP_ID) ?? null)
      : null;
    return displayAxis.timeToGroupY(hitSec, group);
  }, [
    beatToSeconds,
    bpmTimeline,
    displayAxis,
    isSvPreviewEnabled,
    noteTimingGroupById,
    svPreviewTimingGroups,
  ]);
  const trackTimeToY = useCallback((timeSec: number): number => {
    const group = isSvPreviewEnabled
      ? (svPreviewTimingGroups.get(GLOBAL_TIMING_GROUP_ID) ?? null)
      : null;
    return displayAxis.timeToGroupY(timeSec, group);
  }, [
    displayAxis,
    isSvPreviewEnabled,
    svPreviewTimingGroups,
  ]);
  const getTrackDisplayY = useCallback((beat: number): number => (
    trackTimeToY(beatToSeconds(beat, bpmTimeline))
  ), [beatToSeconds, bpmTimeline, trackTimeToY]);
  const isSlideChainOutsideActiveTimingGroup = useCallback((chain: SlideChain): boolean => {
    if (!isTimingGroupModeActive) {
      return false;
    }
    return normalizeObjectTimingGroup(chain.timingGroup) !== selectedTimingGroupId;
  }, [isTimingGroupModeActive, normalizeObjectTimingGroup, selectedTimingGroupId]);
  const renderModel = useEditorRenderModel({
    bpmTimeline,
    totalBeats,
    beatToY,
    notes: displayInteractiveNotes,
    effectiveSlideChains,
    slideBuildState,
    noteById: displayNoteById,
    getRenderedNotePlacement,
    getNoteDisplayY,
    getSlideAnchorLane,
    laneToColumn,
    getNoteSpanLanes,
    LANE_WIDTH,
    longLineOpacityScale,
    isSimultaneousLineEnabled: appOptionSettings.simultaneousLineEnabled,
    isSlideChainMuted: isSlideChainOutsideActiveTimingGroup,
  });
  // A second projection of the same chart model, in seconds and lanes, with no SV transform.
  const minimapBeatToTime = useCallback((beat: number) => beatToSeconds(beat, bpmTimeline), [bpmTimeline]);
  const minimapRenderModel = useEditorRenderModel({
    bpmTimeline, totalBeats, beatToY: minimapBeatToTime, notes: interactiveNotes,
    effectiveSlideChains, noteById, getRenderedNotePlacement, getSlideAnchorLane,
    laneToColumn, getNoteSpanLanes, LANE_WIDTH: 1, longLineOpacityScale,
    isSimultaneousLineEnabled: false,
  });
  const resolveDirectionalWidenPreviewAt = useCallback(
    (x: number, y: number): DirectionalWidenPreviewState | null => {
      if (!isToolArmed || !isNoteTool(tool) || !isDirectionalNoteType(tool)) {
        return null;
      }
      const directionalTool = tool;
      if (directionalTool !== "directional_flick_left" && directionalTool !== "directional_flick_right") {
        return null;
      }

      const hitNote = findNoteAtBoardPoint(x, y);
      if (!hitNote || hitNote.type !== directionalTool) {
        return null;
      }

      const nextWidth = normalizeDirectionalWidth((hitNote.width ?? 1) + 1);
      const widened = normalizeNote({ ...hitNote, width: nextWidth }, settings);
      if (!widened || !isDirectionalNoteType(widened.type)) {
        return null;
      }

      const currentSpanLanes = getNoteSpanLanes(hitNote);
      const nextSpanLanes = getNoteSpanLanes(widened);
      if (nextSpanLanes <= currentSpanLanes) {
        return null;
      }

      const { lane: currentRenderLane, beat: currentRenderBeat } = getRenderedNotePlacement(hitNote);
      const { lane: nextRenderLane } = getRenderedNotePlacement(widened);
      const currentStartLane =
        hitNote.type === "directional_flick_left"
          ? currentRenderLane - currentSpanLanes + 1
          : currentRenderLane;
      const nextStartLane =
        widened.type === "directional_flick_left"
          ? nextRenderLane - nextSpanLanes + 1
          : nextRenderLane;
      const currentEndLane = currentStartLane + currentSpanLanes - 1;
      const nextEndLane = nextStartLane + nextSpanLanes - 1;
      const previewLane = directionalTool === "directional_flick_left" ? nextStartLane : nextEndLane;
      if (previewLane >= currentStartLane - 1e-6 && previewLane <= currentEndLane + 1e-6) {
        return null;
      }

      return {
        type: directionalTool,
        x: (laneToColumn(previewLane) + 0.5) * LANE_WIDTH,
        y: getNoteDisplayY(hitNote, currentRenderBeat),
      };
    },
    [
      LANE_WIDTH,
      findNoteAtBoardPoint,
      getNoteDisplayY,
      getNoteSpanLanes,
      getRenderedNotePlacement,
      isDirectionalNoteType,
      isToolArmed,
      laneToColumn,
      normalizeDirectionalWidth,
      normalizeNote,
      settings,
      tool,
    ],
  );
  const resolveNoteReplacePreviewAt = useCallback(
    (x: number, y: number): NoteReplacePreviewState | null => {
      if (!isToolArmed || !isNoteTool(tool) || tool === "slide") {
        return null;
      }
      const previewType = tool;
      const hitNote = findNoteAtBoardPoint(x, y);
      if (!hitNote) {
        return null;
      }

      if (isDirectionalNoteType(previewType) && hitNote.type === previewType) {
        return null;
      }

      const { lane: renderLane, beat: renderBeat } = getRenderedNotePlacement(hitNote);
      const previewWidth = isDirectionalNoteType(previewType)
        ? normalizeDirectionalWidth(toolDirectionalWidth)
        : (
          isHabahiroEnabled && isRhythmWidthEditableType(previewType)
            ? normalizeRhythmWidth(toolRhythmWidth)
            : 1
        );
      const spanLanes = isDirectionalNoteType(previewType)
        ? (
          isDirectionalNoteType(hitNote.type)
            ? getNoteSpanLanes(hitNote)
            : previewWidth
        )
        : previewWidth;
      const startLane = previewType === "directional_flick_left"
        ? renderLane - spanLanes + 1
        : renderLane;

      return {
        type: previewType,
        x: (laneToColumn(startLane) + spanLanes / 2) * LANE_WIDTH,
        y: getNoteDisplayY(hitNote, renderBeat),
        spanLanes,
        width: previewWidth,
      };
    },
    [
      LANE_WIDTH,
      findNoteAtBoardPoint,
      getNoteDisplayY,
      getNoteSpanLanes,
      getRenderedNotePlacement,
      isHabahiroEnabled,
      isDirectionalNoteType,
      isRhythmWidthEditableType,
      isToolArmed,
      laneToColumn,
      normalizeDirectionalWidth,
      normalizeRhythmWidth,
      tool,
      toolDirectionalWidth,
      toolRhythmWidth,
    ],
  );
  const canvasNoteVisuals = useMemo(() => {
    return displayNotes.flatMap((note) => {
      if (note.type === "hidden") {
        return [];
      }
      const { lane: renderLane, beat: renderBeat } = getRenderedNotePlacement(note);
      const spanLanes = getNoteSpanLanes(note);
      const directionalStartLane =
        note.type === "directional_flick_left"
          ? renderLane - spanLanes + 1
          : renderLane;
      const { layers } = resolvePlacedNoteLayers(note, { beat: renderBeat });
      if (!layers.base && !layers.overlay) {
        return [];
      }
      const isSelected = selectedNoteIdSet.has(note.id)
        || (isSlideBuilding && slideBuildSelectedIdSet.has(note.id));
      const muted = isNoteOutsideActiveTimingGroup(note);
      return [{
        id: note.id,
        type: note.type,
        x: (laneToColumn(directionalStartLane) + spanLanes / 2) * LANE_WIDTH,
        y: getNoteDisplayY(note, renderBeat),
        spanLanes,
        base: layers.base ?? null,
        overlay: layers.overlay ?? null,
        overlayMode: layers.overlayMode,
        selected: isSelected,
        muted,
      }];
    });
  }, [
    LANE_WIDTH,
    getNoteDisplayY,
    getNoteSpanLanes,
    getRenderedNotePlacement,
    isSlideBuilding,
    isNoteOutsideActiveTimingGroup,
    laneToColumn,
    displayNotes,
    resolvePlacedNoteLayers,
    selectedNoteIdSet,
    slideBuildSelectedIdSet,
  ]);
  // Slide segments (see slideSegments.ts) have no selection state of their own: a segment is selected when both its
  // end notes are.
  const effectiveChainById = useMemo(() => new Map(effectiveSlideChains.map(chain => [chain.id, chain] as const)),
    [effectiveSlideChains]);
  /** A Slide segment's two end notes, Hidden ones included. */
  const slideSegmentEndNoteIds = useCallback((segmentId: string): string[] => {
    const parsed = parseSlideSegmentId(segmentId);
    const chain = parsed ? effectiveChainById.get(parsed.chainId) : undefined;
    if (!parsed || !chain) return [];
    return [chain.noteIds[parsed.start], chain.noteIds[parsed.end]]
      .filter((id): id is string => id !== undefined && noteById.has(id));
  }, [effectiveChainById, noteById]);
  /** Pressing a Slide segment selects its end notes (Ctrl/Cmd adds them to the selection). */
  const selectSlideSegment = useCallback((segmentId: string, additive: boolean) => {
    const ids = slideSegmentEndNoteIds(segmentId);
    if (ids.length === 0) return;
    setMultiSelectedNotes(additive ? [...selectedNoteIds, ...ids] : ids, ids[0]);
  }, [slideSegmentEndNoteIds, selectedNoteIds, setMultiSelectedNotes]);
  /** The Slide segments whose end notes are both selected. */
  const selectedSlideSegmentIds = useMemo(() => {
    const segmentIds = new Set<string>();
    if (selectedNoteIdSet.size === 0) return segmentIds;
    for (const segment of renderModel.connectionSegments) {
      if (segment.isPreviewChain || segmentIds.has(segment.slideSegmentId)) continue;
      const ids = slideSegmentEndNoteIds(segment.slideSegmentId);
      if (ids.length > 0 && ids.every(id => selectedNoteIdSet.has(id))) segmentIds.add(segment.slideSegmentId);
    }
    return segmentIds;
  }, [renderModel.connectionSegments, slideSegmentEndNoteIds, selectedNoteIdSet]);
  /**
   * One frame around everything selected: the selected notes' buttons and the selected Slide segments,
   * grown by SELECTION_FRAME_MARGIN design px on each side. Board coordinates; null when nothing is selected.
   */
  const selectionFrame = useMemo(() => {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    const include = (x0: number, y0: number, x1: number, y1: number) => {
      left = Math.min(left, x0); top = Math.min(top, y0); right = Math.max(right, x1); bottom = Math.max(bottom, y1);
    };
    const tokenHeight = editorNoteHeight(LANE_WIDTH, noteVisualScale);
    for (const note of canvasNoteVisuals) {
      if (!note.selected) continue;
      const width = editorNoteTokenWidth(note.spanLanes, isDirectionalNoteType(note.type), LANE_WIDTH, noteVisualScale);
      include(note.x - width / 2, note.y - tokenHeight / 2, note.x + width / 2, note.y + tokenHeight / 2);
    }
    if (selectedSlideSegmentIds.size > 0) {
      for (const segment of renderModel.connectionSegments) {
        if (segment.isPreviewChain || !selectedSlideSegmentIds.has(segment.slideSegmentId)) continue;
        const halfWidth = editorSlideLineWidth(segment.spanLanes, LANE_WIDTH, noteVisualScale) / 2;
        include(Math.min(segment.fromX, segment.toX) - halfWidth, segment.minY,
          Math.max(segment.fromX, segment.toX) + halfWidth, segment.maxY);
      }
    }
    if (!Number.isFinite(left)) return null;
    const margin = SELECTION_FRAME_MARGIN * uiScale;
    return { left: left - margin, top: top - margin, width: right - left + 2 * margin, height: bottom - top + 2 * margin };
  }, [LANE_WIDTH, canvasNoteVisuals, noteVisualScale, renderModel.connectionSegments, selectedSlideSegmentIds, uiScale]);
  /** Dragging an edge of the selection frame widens or narrows the selected notes (see selectionWidthDrag). */
  const selectionWidthContext = useMemo<SelectionWidthContext>(() => ({
    notes, selectedNoteIds, slideChains, habahiro: isHabahiroEnabled,
    laneMin, laneMax: laneValues[laneValues.length - 1]!,
  }), [isHabahiroEnabled, laneMin, laneValues, notes, selectedNoteIds, slideChains]);
  const canResizeSelection = !isToolArmed && canResizeSelectionWidth(selectionWidthContext);
  /** Moves the dragged edge by `raw` lanes as far as the selection allows and draws the result. */
  const previewSelectionWidth = useCallback((edge: SelectionWidthEdge, raw: number) => {
    const delta = allowedSelectionWidthDelta(selectionWidthContext, edge, raw);
    setSelectionWidthPreview(previous => previous?.edge === edge && previous.delta === delta ? previous
      : { edge, delta, notes: delta === 0 ? null : planSelectionWidthChange(selectionWidthContext, edge, delta) });
  }, [selectionWidthContext]);
  /** Releasing the edge commits the previewed widths as one undo step. */
  const endSelectionWidth = useCallback(() => {
    if (selectionWidthPreview?.notes) setNotes(selectionWidthPreview.notes);
    setSelectionWidthPreview(null);
  }, [selectionWidthPreview, setNotes]);
  const cancelSelectionWidth = useCallback(() => setSelectionWidthPreview(null), []);
  /** Left-right / up-down mirror of the selection (several notes, or notes of a Slide with Hidden nodes). */
  const selectionMirrorContext = useMemo<SelectionMirrorContext<SlideChain>>(() => ({
    notes, slideChains, selectedNoteIds,
    habahiro: isHabahiroEnabled, exGarupa: isExGarupaEnabled, laneMin, laneMax: laneValues[laneValues.length - 1]!,
  }), [isExGarupaEnabled, isHabahiroEnabled, laneMin, laneValues, notes, selectedNoteIds, slideChains]);
  const canMirror = canMirrorSelection(selectionMirrorContext);
  const mirrorSelectionAlong = useCallback((axis: MirrorAxis) => {
    const result = mirrorSelection(selectionMirrorContext, axis);
    if (!result) return;
    if (!result.ok) {
      showDialog(result.reason === "overlap" ? "翻转后会与其他音符重叠，未翻转。"
        : result.reason === "out-of-board" ? "翻转后会超出轨道范围，未翻转。"
        : "翻转后 Slide 的结构不再合法，未翻转。");
      return;
    }
    setNotes(result.notes);
    setSlideChains(result.slideChains);
  }, [selectionMirrorContext, setNotes, setSlideChains, showDialog]);
  const minimapNotes = useMemo(() => notes.flatMap(note => {
    if (note.type === "hidden") return [];
    const placement = getRenderedNotePlacement(note);
    const spanLanes = getNoteSpanLanes(note);
    const start = note.type === "directional_flick_left" ? placement.lane - spanLanes + 1 : placement.lane;
    const { layers } = resolvePlacedNoteLayers(note, { beat: placement.beat });
    return [{ id: note.id, type: note.type, x: laneToColumn(start) + spanLanes / 2,
      y: minimapBeatToTime(placement.beat), spanLanes, base: layers.base ?? null, overlay: layers.overlay ?? null,
      overlayMode: layers.overlayMode, selected: false, muted: false }];
  }), [notes, getRenderedNotePlacement, getNoteSpanLanes, resolvePlacedNoteLayers, laneToColumn, minimapBeatToTime]);
  const minimapSegments = useMemo(() => {
    const validByChain = new Map(effectiveSlideChains.map(chain => [chain.id, chain.noteIds
      .map(id => noteById.get(id)).filter((note): note is ChartNote => !!note).map(note => {
        const placement = getRenderedNotePlacement(note), span = getNoteSpanLanes(note);
        const start = note.type === "directional_flick_left" ? placement.lane - span + 1 : placement.lane;
        return minimapLaneVisible(laneToColumn(start) + span / 2, span, laneValues.length);
      })]));
    return minimapRenderModel.connectionSegments.filter(segment => {
      const valid = validByChain.get(segment.chainId);
      return valid?.[segment.index] && valid[segment.index + 1];
    });
  }, [effectiveSlideChains, noteById, getRenderedNotePlacement, getNoteSpanLanes, laneToColumn, laneValues.length,
    minimapRenderModel.connectionSegments]);
  const minimapDuration = useMemo(() => notes.reduce((end, note) =>
    Math.max(end, minimapBeatToTime(getRenderedNotePlacement(note).beat)), Math.max(1, audioDurationSec || 0)),
    [notes, minimapBeatToTime, getRenderedNotePlacement, audioDurationSec]);
  const canvasBpmVisualLines = useMemo(() => {
    return (bpmTimeline ?? [])
      .filter((node: any) => node.beat >= 0 && node.beat <= totalBeats + 1e-6)
      .map((node: any, index: number) => {
        const isBaseLine = approxEq(node.beat, 0);
        const sourceEvent = isBaseLine
          ? null
          : (bpmEvents.find((event: any) => approxEq(event.beat, node.beat)) ?? null);
        return {
          key: isBaseLine
            ? "base"
            : (sourceEvent?.id ?? `bpm-${index}-${node.beat.toFixed(6)}-${node.bpm.toFixed(6)}`),
          beat: Math.max(0, node.beat),
          y: getTrackDisplayY(Math.max(0, node.beat)),
          bpm: node.bpm,
        };
      });
  }, [
    approxEq,
    bpmEvents,
    bpmTimeline,
    getTrackDisplayY,
    totalBeats,
  ]);
  // `#LANE_CHANGE` positions of a HABAHIRO chart; the original applies only the latest one.
  const canvasLaneChangeVisualLines = useMemo(() => {
    const beats = settings.habahiro ? settings.laneChangeBeats ?? [] : [];
    const latest = beats.length > 0 ? Math.max(...beats) : null;
    return beats
      .filter((beat) => beat >= 0 && beat <= totalBeats + 1e-6)
      .map((beat, index) => ({
        key: `lane-change-${index}-${beat.toFixed(6)}`,
        beat,
        y: getTrackDisplayY(beat),
        effective: beat === latest,
      }));
  }, [getTrackDisplayY, settings.habahiro, settings.laneChangeBeats, totalBeats]);
  const canvasSvVisualLines = useMemo(() => {
    return (visibleSvEvents ?? [])
      .filter((event: ChartSvEvent) => event.beat >= 0 && event.beat <= totalBeats + 1e-6)
      .map((event: ChartSvEvent) => {
        const timingGroup = normalizeTimingGroup(event.timingGroup, "#Global");
        return {
          key: event.id,
          beat: event.beat,
          y: getTrackDisplayY(event.beat),
          value: event.value,
          timingGroup,
        };
      });
  }, [getTrackDisplayY, visibleSvEvents, totalBeats]);
  const visibleSimultaneousSegments = useMemo(
    () => (appOptionSettings.simultaneousLineEnabled ? renderModel.simultaneousSegments : []),
    [appOptionSettings.simultaneousLineEnabled, renderModel.simultaneousSegments],
  );
  const {
    getImage: getCanvasResourceImage,
    isReady: isCanvasResourceReady,
    error: canvasResourceError,
    version: canvasResourceVersion,
  } = useCanvasRenderResources({
    enabled: true,
    skinAssets,
  });
  const startupMediaReady = Object.entries(chartMediaResources).every(([key, ref]) =>
    ref === null || Boolean(chartMediaLease.urls[key as keyof typeof chartMediaLease.urls]));
  useStartupReadiness("editor", settingsResourcesReady && !isSkinApplying && isSkinReady
    && isCanvasResourceReady && startupMediaReady,
    settingsResourcesReady && !isSkinApplying ? chartMediaLease.error ?? canvasResourceError
      ?? (!isSkinReady ? "当前编辑器皮肤未准备完成，请重试资源加载。" : null) : null);

  const {
    deleteTimelineEvent,
    describeBpmEvent,
    describeSvEvent,
    renderSlideSegments,
    slideBuildFollowStart,
  } = usePlayfieldRenderers({
    yToBeat,
    isSvPreviewEnabled,
    laneValues,
    LANE_WIDTH,
    totalSteps,
    beatDivision,
    beatsPerMeasure,
    verticalZoom,
    approxEq,
    beatToY: getTrackDisplayY,
    bpmTimeline,
    totalBeats,
    bpmEvents,
    svEvents: visibleSvEvents,
    BASE_BPM_LINE_ID,
    isTimingGroupModeActive,
    selectedTimingGroupId,
    clearSelection,
    showDialog,
    isToolArmed,
    tool,
    sortBpmEvents,
    setBpmEvents,
    setSvEvents,
    setMetadata,
    metadata,
    normalizeEditorBpm,
    toolBpmValue,
    toolSvValue,
    toolTimingGroup,
    slideBuildRef,
    finalizeSlideBuild,
    cancelSlideBuild,
    slideRoleByNoteId,
    noteById,
    getRenderedNotePlacement,
    getSlideAnchorLane,
    laneToColumn,
    simultaneousSegments: visibleSimultaneousSegments,
    selectedSlideSegmentIds,
    selectSlideSegment,
    slideSegmentEndNoteIds,
    deleteRightClickedNotes,
    settings,
    connectionSegments: renderModel.connectionSegments,
    skinAssets,
    slideBuildState,
    getNoteSpanLanes,
    longLineOpacityScale,
    noteVisualScale,
    isSimultaneousLineEnabled: appOptionSettings.simultaneousLineEnabled,
    onMiddleToolConnectionClick: insertSingleNodeOnConnection,
    onCurveToolConnectionClick: applyCurveToolOnConnection,
  });
  useCanvasPlayfieldBackend({
    enabled: isSkinReady && isCanvasResourceReady,
    trackCanvasRef: playfieldTrackCanvasRef,
    noteCanvasRef: playfieldNoteCanvasRef,
    playfieldRef,
    boardWidth,
    boardHeight: scrollContentHeight,
    laneValues,
    laneWidth: LANE_WIDTH,
    noteVisualScale,
    totalSteps,
    beatDivision,
    beatsPerMeasure,
    beatToY: getTrackDisplayY,
    yToBeat,
    yToTime,
    timeToY: trackTimeToY,
    totalDurationSec,
    bpmVisualLines: canvasBpmVisualLines,
    svVisualLines: canvasSvVisualLines,
    laneChangeVisualLines: canvasLaneChangeVisualLines,
    selectedSlideSegmentIds,
    simultaneousSegments: visibleSimultaneousSegments,
    connectionSegments: renderModel.connectionSegments,
    noteVisuals: canvasNoteVisuals,
    skinAssets,
    getImage: getCanvasResourceImage,
    slideBuildFollowStart,
    slideBuildCursorRef,
    selectionDrag,
    useFullGridScan: isSvPreviewEnabled,
    verticalZoom,
    bubbleEdgeInset: EDITOR_EDGE_SOFTNESS * uiScale,
    bubbleScale: uiScale,
    resourcesVersion: canvasResourceVersion,
    eventBubbleHitsRef,
  });

  const staticRenderResourceMap = useMemo(
    () => appliedSkinResources === null ? null : projectSkinRuntimeResourceMap(appliedSkinResources.note),
    [appliedSkinResources],
  );
  const staticRenderReverseResourceMap = useMemo(
    () => staticRenderResourceMap === null ? null : reverseSkinRuntimeResourceMap(staticRenderResourceMap),
    [staticRenderResourceMap],
  );
  const buildStaticRenderPayload = useCallback((): StaticRenderPayload | null => {
    if (appliedSkinResources === null || staticRenderResourceMap === null || staticRenderReverseResourceMap === null) {
      return null;
    }
    const keyForUrl = (url: string | null): string | null => {
      if (url === null) return null;
      const key = staticRenderReverseResourceMap.get(url);
      if (key === undefined) throw new Error("static render note references an unleased Skin derivative");
      return key;
    };
    return {
      schemaVersion: 2,
      resourceSnapshotId: appliedSkinResources.snapshotId,
      skinIdentities: appliedSkinResources.identities,
      chartTitle: metadata.title,
      boardWidth,
      boardHeight,
      laneValues: [...laneValues],
      laneWidth: LANE_WIDTH,
      noteVisualScale,
      totalSteps,
      beatDivision,
      beatsPerMeasure,
      totalDurationSec,
      timelinePixelsPerSecond,
      bpmTimeline: bpmTimeline.map((item: any) => ({
        beat: Number(item.beat),
        bpm: Number(item.bpm),
        timeSec: Number(item.timeSec),
      })),
      bpmVisualLines: canvasBpmVisualLines.map((line: any) => ({
        key: String(line.key),
        beat: Number(line.beat),
        bpm: Number(line.bpm),
      })),
      svVisualLines: canvasSvVisualLines.map((line: any) => ({
        key: String(line.key),
        beat: Number(line.beat),
        value: Number(line.value),
        timingGroup: String(line.timingGroup ?? GLOBAL_TIMING_GROUP_ID),
      })),
      simultaneousSegments: visibleSimultaneousSegments.map((segment) => ({ ...segment })),
      connectionSegments: renderModel.connectionSegments
        .filter((segment) => !segment.isPreviewChain)
        .map((segment) => ({ ...segment })),
      noteVisuals: canvasNoteVisuals.map((note) => ({
        id: note.id,
        type: note.type,
        x: note.x,
        y: note.y,
        spanLanes: note.spanLanes,
        baseResourceKey: keyForUrl(note.base),
        overlayResourceKey: keyForUrl(note.overlay),
        overlayMode: note.overlayMode,
      })),
      runtimeSkin: {
        longLineResourceKey: "line.long",
        curveSlideLineResourceKey: "line.long-special",
        simultaneousLineResourceKey: "line.simultaneous",
        directionalBackLineLeftResourceKey: "line.directional-back-left",
        directionalBackLineRightResourceKey: "line.directional-back-right",
      },
    };
  }, [
    LANE_WIDTH,
    appliedSkinResources,
    beatDivision,
    beatsPerMeasure,
    boardHeight,
    boardWidth,
    bpmTimeline,
    canvasBpmVisualLines,
    canvasNoteVisuals,
    canvasSvVisualLines,
    laneValues,
    metadata.title,
    noteVisualScale,
    renderModel.connectionSegments,
    staticRenderResourceMap,
    staticRenderReverseResourceMap,
    timelinePixelsPerSecond,
    totalDurationSec,
    totalSteps,
    visibleSimultaneousSegments,
  ]);

  const openStaticRenderWindow = useCallback(async () => {
    appLog("info", "editor.window.request", { kind: "openStaticRenderWindow" });
    if (previewLoadingProgress.visible) {
      hidePreviewLoadingProgress();
    }
    if (!isSkinReady || !isCanvasResourceReady) {
      showDialog("资源未加载，请稍后再试。");
      return;
    }
    const staticRenderPayload = buildStaticRenderPayload();
    if (!staticRenderPayload) {
      showDialog("数据未完成，请稍后再试。");
      return;
    }
    if (isLastBeatOrderedBpmNegative(metadata.bpm, bpmEvents)) {
      showDialog("谱面不合法：\n末尾 BPM 不可为负数", "error");
      return;
    }
    startPreviewLoadingProgress("正在准备预览数据…");

    const requestId = `static-render-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const windowLabel = requestId;
    let releasePreparation: (() => void) | undefined;
    let readyUnlisten: UnlistenFn | null = null;
    let timeoutId: number | null = null;
    let renderWindow: WebviewWindow | null = null;
    const clearReadySubscription = () => {
      if (readyUnlisten) {
        void readyUnlisten();
        readyUnlisten = null;
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    try {
      if (!isMobileRuntime()) releasePreparation = await holdAuxiliaryPreparation(requestId, message => { showDialog(`预览窗口显示失败：${message}`, "error"); void renderWindow?.close(); });
      readyUnlisten = await listen<{ requestId?: string; label?: string }>(
        STATIC_RENDER_WINDOW_READY_EVENT,
        async (event) => {
          const readyPayload = event.payload ?? {};
          if (readyPayload.requestId !== requestId || typeof readyPayload.label !== "string") {
            return;
          }
          clearReadySubscription();
          try {
            updatePreviewLoadingProgress(82, "正在同步预览数据…");
            await emitTo(
              readyPayload.label,
              STATIC_RENDER_WINDOW_PAYLOAD_EVENT,
              {
                requestId,
                payload: staticRenderPayload,
              },
            );
            completePreviewLoadingProgress("预览已就绪。");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            updatePreviewLoadingProgress(100, `预览数据发送失败：${message}`, { blocking: false });
            hidePreviewLoadingProgress(900);
            releasePreparation?.();
            void renderWindow?.close();
            showDialog(`预览数据发送失败：\n${message}`, "error");
          }
        },
      );
      updatePreviewLoadingProgress(24, "正在创建预览窗口…");

      const locationHref = typeof window !== "undefined"
        ? window.location.href
        : "http://localhost/";
      const targetUrl = new URL(locationHref);
      targetUrl.hash = `static-render?request=${encodeURIComponent(requestId)}`;

      if (isMobileRuntime()) {
        targetUrl.hash = `static-render?request=${encodeURIComponent(requestId)}&mode=mobile`;
        const wrotePayload = writeMobileRoutePayload(requestId, {
          requestId,
          payload: staticRenderPayload,
        });
        if (!wrotePayload) {
          throw new Error("移动端预览数据写入失败。");
        }
        completePreviewLoadingProgress("预览已就绪。");
        window.location.hash = targetUrl.hash;
        return;
      }

      renderWindow = new WebviewWindow(windowLabel, {
        visible: false,
        title: `${metadata.title} - preview`,
        width: 1440,
        height: 900,
        minWidth: 980,
        minHeight: 620,
        center: true,
        resizable: true,
        url: targetUrl.toString(),
      });

      renderWindow.once("tauri://created", () => {
        updatePreviewLoadingProgress(58, "预览窗口已创建，等待连接…");
      });
      renderWindow.once("tauri://error", (event) => {
        releasePreparation?.();
        clearReadySubscription();
        const message = event?.payload
          ? JSON.stringify(event.payload)
          : "未知错误";
        updatePreviewLoadingProgress(100, `预览窗口创建失败：${message}`, { blocking: false });
        hidePreviewLoadingProgress(900);
        showDialog(`预览创建失败：\n${message}`, "error");
      });
      renderWindow.once("tauri://destroyed", () => {
        releasePreparation?.();
        clearReadySubscription();
        hidePreviewLoadingProgress();
      });

      timeoutId = window.setTimeout(() => {
        if (!readyUnlisten) {
          return;
        }
        clearReadySubscription();
        updatePreviewLoadingProgress(100, "预览窗口连接超时。", { blocking: false });
        hidePreviewLoadingProgress(900);
        releasePreparation?.();
        void renderWindow?.close();
        showDialog("预览窗口握手超时，请重试。", "error");
      }, 15000);
    } catch (error) {
      clearReadySubscription();
      const message = error instanceof Error ? error.message : String(error);
      updatePreviewLoadingProgress(100, `预览启动失败：${message}`, { blocking: false });
      hidePreviewLoadingProgress(900);
      releasePreparation?.();
      void renderWindow?.close();
      showDialog(`预览启动失败：\n${message}`, "error");
    }
  }, [
    bpmEvents,
    completePreviewLoadingProgress,
    hidePreviewLoadingProgress,
    isCanvasResourceReady,
    isSkinReady,
    metadata.bpm,
    metadata.title,
    buildStaticRenderPayload,
    showDialog,
    startPreviewLoadingProgress,
    previewLoadingProgress.visible,
    updatePreviewLoadingProgress,
  ]);

  const openSimulatorWindow = useCallback(async (mode: SimulatorModeSelection = SIMULATOR_PRE_ADAPTATION_DEFAULTS,
    onExit?: (exit: SimulatorWindowExit) => void) => {
    appLog("info", "editor.window.request", { kind: "openSimulatorWindow", sessionMode: mode.sessionMode, inputMode: mode.inputMode });
    let exited = false;
    const exit = (value: SimulatorWindowExit) => {
      if (exited) return;
      exited = true;
      onExit?.(value);
    };
    const invalidChart = chartProjectionError(project);
    if (invalidChart !== null) {
      showDialog(invalidChart, "error");
      exit("blocked");
      return;
    }
    let releasePreparation: (() => void) | undefined;
    let readyUnlisten: UnlistenFn | null = null;
    let closedUnlisten: UnlistenFn | null = null;
    let timeoutId: number | null = null;
    let pendingLease: ResourceConsumerLease | null = null;
    let activeRequestId: string | null = null;
    let simulatorWindow: WebviewWindow | null = null;
    let abandoned = false;
    let readyLabel: string | null = null;
    let descriptor: Awaited<ReturnType<typeof buildSimulatorLaunchDescriptor>>["descriptor"] | null = null;
    let published = false;
    const clearReadySubscription = () => {
      if (readyUnlisten) { void readyUnlisten(); readyUnlisten = null; }
      if (timeoutId !== null) { window.clearTimeout(timeoutId); timeoutId = null; }
    };
    const clearClosedSubscription = () => {
      if (closedUnlisten) { void closedUnlisten(); closedUnlisten = null; }
    };
    const releaseHandoff = () => {
      if (activeRequestId === null) return;
      const lease = simulatorHandoffLeasesRef.current.get(activeRequestId);
      if (lease === undefined) return;
      simulatorHandoffLeasesRef.current.delete(activeRequestId);
      void lease.release();
    };
    const abandon = () => {
      releasePreparation?.();
      abandoned = true;
      clearReadySubscription();
      clearClosedSubscription();
      releaseHandoff();
    };
    const fail = (error: unknown) => {
      if (abandoned) return;
      // The opener's cover and notice settle before the start Loading is released.
      exit("failed");
      abandon();
      const message = error instanceof Error ? error.message : String(error);
      // A caller that owns the exit shows its own notice; the cause belongs in the log.
      if (onExit) appLog("error", "simulator.window.launch-failed", { message });
      else showDialog(`播放器窗口启动失败：\n${message}`, "error");
      if (simulatorWindow !== null) void simulatorWindow.close().catch((closeError: unknown) => {
        if (onExit) appLog("error", "simulator.window.close-failed", { message, closeError: String(closeError) });
        else showDialog(`播放器窗口启动失败：\n${message}；关闭窗口失败：${String(closeError)}`, "error");
      });
    };
    const publishDescriptor = async () => {
      if (abandoned || published || readyLabel === null || descriptor === null) return;
      published = true;
      await emitTo(readyLabel, SIMULATOR_WINDOW_PAYLOAD_EVENT, { requestId: activeRequestId, descriptor });
    };

    try {
      const requestId = createSimulatorLaunchRequestId();
      activeRequestId = requestId;
      const playbackPreset = WINDOW_SIZE_PRESETS.find((item) => item.id === playbackWindowPresetId)
        ?? WINDOW_SIZE_PRESETS[0] ?? WINDOW_SIZE_PRESETS[1];
      const width = Number(playbackPreset?.width ?? 1366);
      const height = Number(playbackPreset?.height ?? 768);
      const targetUrl = new URL(window.location.href);
      targetUrl.hash = `simulator?request=${encodeURIComponent(requestId)}`;
      closedUnlisten = await listen<SimulatorWindowClosedPayload>(SIMULATOR_WINDOW_CLOSED_EVENT, (event) => {
        if (event.payload?.requestId !== requestId) return;
        exit(event.payload.status === "rejected" ? "failed" : event.payload.reason === "play-again" ? "play-again" : "leave");
        abandon();
        if (event.payload.status === "rejected") {
          const capability = event.payload.capability ?? "app.simulator.action-unavailable";
          const boundary = event.payload.boundary?.trim() ?? "当前播放器动作不可用，编辑器状态未改变。";
          if (onExit) appLog("error", "simulator.window.launch-rejected", { capability, boundary });
          else showDialog(`播放器未启动：\n${boundary}`, "error");
        }
      });
      if (!isMobileRuntime()) {
        releasePreparation = await holdAuxiliaryPreparation(requestId, fail, "screen");
        readyUnlisten = await listen<SimulatorWindowReadyPayload>(SIMULATOR_WINDOW_READY_EVENT, (event) => {
          const readyPayload = event.payload ?? {};
          if (abandoned || readyPayload.requestId !== requestId || typeof readyPayload.label !== "string") return;
          readyLabel = readyPayload.label;
          clearReadySubscription();
          void publishDescriptor().catch(fail);
        });
        // Start the loading window before media availability, snapshot hashing
        // and transport preparation. Either readiness edge may arrive first.
        simulatorWindow = new WebviewWindow(requestId, {
          visible: false,
          title: `${metadata.title} - playing`,
          width, height, center: true, resizable: false,
          parent: getCurrentWebviewWindow(),
          url: targetUrl.toString(),
        });
        void simulatorWindow.once("tauri://error", (event) => {
          fail(event?.payload ? JSON.stringify(event.payload) : "播放器窗口创建失败");
        });
        // Closing the window from the system frame retires the live like the Pause menu.
        void simulatorWindow.once("tauri://destroyed", () => { exit("leave"); abandon(); });
        timeoutId = window.setTimeout(() => {
          if (readyLabel === null && !abandoned) fail("播放器窗口握手超时，请重试。");
        }, 15000);
      }
      const prepared = await buildSimulatorLaunchDescriptor({
        sessionMode: mode.sessionMode, inputMode: mode.inputMode,
        requestId,
        manager: resourceManager,
        project: await captureChartProject(resourceManager, project),
        mirror: appOptionSettings.mirrorEnabled,
        mvEnabled: mode.sessionMode === "live" && playbackMvMode && chartMediaResources.mv !== null,
        fps: playbackFps === 120 ? 120 : 60,
        noteSize: appOptionSettings.rhythmNoteSizePercent,
        noteSpeed: appOptionSettings.rhythmNoteSpeed,
        longNoteLineBrightness: appOptionSettings.longLineBrightnessPercent,
        lightModeBrightness: appOptionSettings.simulatorSettings.lightModeBrightness,
        suddenRate: appOptionSettings.simulatorSettings.suddenRate,
        suddenLane: appOptionSettings.simulatorSettings.suddenLane,
        hideFastSlow: appOptionSettings.simulatorSettings.hideFastSlow,
        displayStageEffect: appOptionSettings.simulatorSettings.displayStageEffect,
        hideCombo: appOptionSettings.simulatorSettings.hideCombo,
        displayComboPosition: appOptionSettings.simulatorSettings.displayComboPosition,
        syncLine: appOptionSettings.simultaneousLineEnabled,
        allPerfectStatusDisplayMode: playbackAllPerfectStatusDisplayMode,
        judgementAdjustValue: appOptionSettings.simulatorSettings.judgementAdjustValue,
        judgementAdjustValueB: appOptionSettings.simulatorSettings.judgementAdjustValueB,
        noteColor: appOptionSettings.colorAssistEnabled,
        visibleTapLaneEffect: appOptionSettings.clickEffectEnabled,
        mvDarkness: 100 - playbackMvAlphaPercent,
        skin: appOptionSettings.simulatorSettings.skin,
        masterGainPercent: appOptionSettings.simulatorSettings.masterVolumePercent,
        bgmGainPercent: playbackVolumePercent * appOptionSettings.simulatorSettings.musicVolumePercent / 100,
        seGainPercent: playbackVolumePercent * noteSeVolumeScale,
        requestedWindowWidth: width,
        requestedWindowHeight: height,
      });
      pendingLease = prepared.handoffLease;
      if (abandoned) { await pendingLease.release(); pendingLease = null; return; }
      descriptor = prepared.descriptor;
      simulatorHandoffLeasesRef.current.set(requestId, pendingLease);
      pendingLease = null;
      if (isMobileRuntime()) {
        if (!writeMobileRoutePayload(requestId, { requestId, descriptor })) {
          throw new Error("移动端播放器数据写入失败。");
        }
        setMobileSimulatorImmersive(true);
        window.location.hash = targetUrl.hash;
        return;
      }
      await publishDescriptor();
    } catch (error) {
      if (pendingLease !== null) void pendingLease.release();
      fail(error);
    }
  }, [
    WINDOW_SIZE_PRESETS,
    appOptionSettings,
    playbackMvAlphaPercent,
    appOptionSettings.mirrorEnabled,
    appOptionSettings.rhythmNoteSizePercent,
    appOptionSettings.rhythmNoteSpeed,
    appOptionSettings.simultaneousLineEnabled,
    chartMediaResources,
    project,
    metadata,
    noteSeVolumeScale,
    playbackFps,
    playbackMvMode,
    playbackAllPerfectStatusDisplayMode,
    playbackVolumePercent,
    playbackWindowPresetId,
    resourceManager,
    showDialog,
  ]);

  /**
   * 创建工程's 确定: a new project in place of the current one (the program's cached project with it), holding what
   * the page set: its metadata and media, an empty chart. Nothing changes when a medium fails to import.
   */
  const createSongProject = useCallback((edit: Parameters<typeof applySongInformationEdit>[0]) =>
    applySongInformationEdit(edit, { beforeApply: () => {
      skipProjectWidthAdjustmentRef.current = true;
      setProjectId(crypto.randomUUID());
      setSettingsState(DEFAULT_SETTINGS);
      setNotesState([]); setSlideChainsState([]); setBpmEventsState([]); setTimingGroupsState(ensureTimingGroups(null));
      setChartMediaResources(Object.freeze({ bgm: null, cover: null, mv: null, illustBackground: null }));
      setAudioFileName(""); setAudioDurationSec(0);
      clearSelection();
      undoStackRef.current = []; redoStackRef.current = []; pendingUndoSourcesRef.current = null; setUndoVersion(v => v + 1);
    } }), [applySongInformationEdit, clearSelection]);
  const layoutVm = useStableEvents({
        settingsResourcesReady,
        workspaceReady: settingsResourcesReady && !isSkinApplying && isSkinReady && isCanvasResourceReady && startupMediaReady,
        jsonImportRef,
        bestdoriV2ImportRef,
        handleJsonImport,
        handleBestdoriV2Import,
        triggerJsonImport,
        triggerBestdoriV2Import,
        openImportJsonModal,
        downloadJson,
        openStaticRenderWindow,
        openSimulatorWindow,
        garupaChartJsonText,
        projectFiles,
        isImportJsonModalOpen,
        importJsonModalLevel,
        importJsonText,
        importOfficialChartId,
        importOfficialChartDifficulty,
        importCommunityPostId,
        uploadCommunityPostContent,
        uploadChartAuthor,
        uploadCommunityPostTags,
        importJsonSelectedPath,
        importBestdoriV2SelectedPath,
        setImportJsonText,
        setImportOfficialChartId,
        setImportOfficialChartDifficulty,
        setImportCommunityPostId,
        setUploadCommunityPostContent,
        setUploadChartAuthor,
        setUploadCommunityPostTags,
        applyImportJsonText,
        applyImportOfficialChart,
        applyImportCommunityChart,
    loadChartForPlay,
    beginPlaySession,
    endPlaySession,
        loadOfficialChart,
        applyUploadCommunityChart,
        applyUploadNotGarupaServerChart,
        applyUploadTestServerChart,
        closeImportJsonModal,
        openImportJsonModalBestdoriV2Level,
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
        chartMediaSources: Object.freeze({
          cover: chartMediaLease.urls.cover ?? null,
          audio: chartMediaLease.urls.bgm ?? null,
          mv: chartMediaLease.urls.mv ?? null,
          illustBackground: chartMediaLease.urls.illustBackground ?? null,
        }),
        chartMediaError: chartMediaLease.error,
        coverImageSrc,
        audioDurationSec,
        visibleNoteCount,
        isCoverLoadFailed,
        setIsCoverLoadFailed,
        isSkinReady,
        isToolArmed,
        tool,
        applyToolFromPalette,
        applyLongToolFromPalette,
        applyMiddleToolFromPalette,
        curveToolSettings,
        saveCurveToolSettings,
        cancelCurveTool,
        applyBpmToolFromPalette,
        applySvToolFromPalette,
        toolSvValue,
        toolSvTimingGroup,
        applySvToolSetting,
        updateSvEvent,
        isExGarupaEnabled,
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
        timingGroupIds,
        isTimingGroupPanelOpen,
        setIsTimingGroupPanelOpen: setTimingGroupPanelOpenForMode,
        selectedTimingGroupId,
        setSelectedTimingGroupId,
        isTimingGroupModeActive,
        setIsTimingGroupModeEnabled,
        createTimingGroup,
        addTimingGroup,
        deleteTimingGroup,
        showTimingGroupSetting,
        isTimingGroupSettingLocked,
        selectedObjectTimingGroupId,
        setSelectedObjectTimingGroupId,
        isNoteOutsideActiveTimingGroup,
        getPaletteSpriteLayers,
        getPaletteSpriteAspectRatio,
        renderPaletteSpriteStack,
        getSpriteLayers,
        getSpriteAspectRatio,
        renderSpriteStack,
        setTool,
        setIsToolArmed,
        clearSelection,
        showDialog,
        undoLastNote,
        redoLastNote,
        copyCurrentSelectionByShortcut,
        togglePlaybackFromCurrentPosition,
        getPlaybackClockSec,
        activeBpmValue: toolBpmValue,
        updateActiveBpm,
        setBpmEventValue,
            canUndoLastOperation,
        canRedoLastOperation,
        canMirror,
        mirrorSelectionAlong,
        clearAllNotes,
        notes,
        slideChains,
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
        svInputText,
        setSvInputText,
        svInputEditingRef,
        commitSvInput,
        showSvSetting,
        isSvPreviewEnabled,
        setIsSvPreviewEnabled,
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
        canDeleteSelection,
        deleteSelectedNotes,
        settings,
        applySettingsPatch,
        minimapNotes,
        minimapWidth,
        trackZoneShiftX,
        trackZoneWidth: trackWidth,
        minimapSegments,
        minimapDuration,
        minimapGetImage: getCanvasResourceImage,
        minimapResourceVersion: canvasResourceVersion,
        minimapSkinAssets: skinAssets,
        minimapAxis: displayAxis,
        attachViewport,
        setBeatDivision: (value: number) => setSettings(previous => ({ ...previous, timeSignatureDenominator: value })),
        setPlaybackBottomInsetRatio,
        playbackLinePositionPercent,
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
        cursorPreviewRef: canvasCursorPreviewRef,
        resolveDirectionalWidenPreviewAt,
        resolveNoteReplacePreviewAt,
        beatToY: getTrackDisplayY,
        getNoteDisplayY,
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
        laneToColumn,
        formatBeat,
        selectedNoteIdSet,
        slideBuildSelectedIdSet,
        selectionFrame,
        canResizeSelection,
        selectionWidthDrag: selectionWidthPreview && { edge: selectionWidthPreview.edge, delta: selectionWidthPreview.delta },
        previewSelectionWidth,
        endSelectionWidth,
        cancelSelectionWidth,
        renderNotes: displayNotes,
        slideBuildRef,
        appendSlideBuildNote,
        setSlideBuildMode,
        startSlideBuildFromSeedNote,
        beginSelectedNotesMove,
        suppressNextNoteClickRef,
        toggleSelectedNote,
        applyToolToPlacedNote,
        finalizeSlideBuild,
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
        setMetadata,
        audioObjectUrl,
        handleCoverUpload,
        handleAudioUpload,
        handleMvUpload,
        handleIllustBackgroundUpload,
        removeIllustBackground,
        applySongInformationEdit,
        createSongProject,
        hasProjectContent,
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
        skinAssets,
        applyWindowPresetById,
        applyAppOptionSettings,
        editorMode,
        setEditorMode,
        setHabahiroMode,
        setLaneCount,
        setMusicSelectionSource: (musicSelectionSource: EditorOptionSettings["musicSelectionSource"]) =>
          setAppOptionSettings(value => ({ ...value, musicSelectionSource })),
        setOfficialMusicSelection: (officialMusicSelection: EditorOptionSettings["officialMusicSelection"]) =>
          setAppOptionSettings(value => JSON.stringify(value.officialMusicSelection) === JSON.stringify(officialMusicSelection)
            ? value : { ...value, officialMusicSelection }),
        applyBestdoriSkinSelection,
        downloadProgress,
        playbackRuntimeLineRef,
        playbackGuideHostRef,
        playbackGuideLabelRef,
        noteVisualScale,
        copiedChartPayload,
  });
  return (
    <ChartEditorLayout vm={layoutVm} />
  );
}

export default ChartEditorController;






