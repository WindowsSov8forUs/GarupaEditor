import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  GLOBAL_TIMING_GROUP_ID,
  type ChartBpmEvent,
  type ChartMetadata,
  type ChartNote,
  type ChartSvEvent,
  normalizeNoteTimingGroup,
  type NoteType,
} from "../../chartCore";
import {
  isHabahiroRhythmRipName,
  type SkinSelection,
} from "../../skinLoader";
import { useApplicationResourceManager } from "../../resources/applicationResourceContext";
import {
  createBestdoriNetworkMediaDescriptor,
  createBestdoriNetworkResourceRef,
} from "../../resources/providers/bestdoriCatalogProvider";
import type { BestdoriAssetFamily, BestdoriAssetServer } from "../../services/bestdori/api";
import {
  decodeAppliedSkinResources,
  type AppliedSkinResources,
} from "../../skin/resourceSkinDecoder";
import {
  convertBestdoriV2ToGarupaChartJson,
  convertGarupaChartJsonToBestdoriV2,
  type GarupaChartJson,
  type GarupaChartJsonBpmItem,
  type GarupaChartJsonDirection,
  type GarupaChartJsonSlideConnection,
  type GarupaChartJsonSlideItem,
  type GarupaChartJsonSvItem,
  type GarupaChartJsonTopLevelNote,
} from "../../chart";
import {
  isChartUsingExGarupa,
  isChartUsingHabahiro,
  isChartUsingSpRhythm,
  regressChartWithoutExGarupa,
  regressChartWithoutHabahiro,
  regressChartWithoutSpRhythm,
  type ChartStateLike,
} from "../modeChartRegression";
import { applyHabahiroSlideWidths } from "../habahiroSlideWidth";
import {
  fetchBestdoriCommunityPostDetails,
  fetchBestdoriOfficialChartImportPayload,
  resolveBestdoriCommunitySongResourceUrls,
  type BestdoriPostTag,
} from "../../services/bestdori/api";
import {
  uploadNotGarupaLevelFlow,
  publishBestdoriCommunityChartFlow,
  uploadSonolusLevelFlow,
} from "../../services/bestdori/resourceFlows";
import { isTauriRuntimeEnvironment } from "../../services/bestdori/transport";

type ParsedJsonNote = {
  note: ChartNote;
  key: string;
};

type ShiftedBpmItem = {
  beat: number;
  value: number;
  sourceIndex: number;
};

type ShiftedSvItem = {
  beat: number;
  value: number;
  timingGroup: string;
  sourceIndex: number;
};

type AppliedGarupaChartJsonSummary = {
  visibleNoteCount: number;
  beatOffset: number;
  regressedExGarupa: boolean;
  regressedSpRhythm: boolean;
  regressedHabahiro: boolean;
};

type ImportJsonModalLevel = "chart" | "bestdori-v2";
type OfficialChartDifficulty = "EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL";
const OFFICIAL_CHART_DIFFICULTY_TO_API: Readonly<Record<OfficialChartDifficulty, "easy" | "normal" | "hard" | "expert" | "special">> = {
  EASY: "easy",
  NORMAL: "normal",
  HARD: "hard",
  EXPERT: "expert",
  SPECIAL: "special",
};
const COMMUNITY_POST_DIFF_TO_METADATA_DIFFICULTY: Readonly<Record<number, ChartMetadata["difficulty"]>> = {
  0: "EASY",
  1: "NORMAL",
  2: "HARD",
  3: "EXPERT",
  4: "SPECIAL",
};
const DOWNLOAD_PROGRESS_EVENT_NAME = "download-progress";

type DownloadProgressPayload = {
  operationId?: string;
  scopeId?: string;
  scopeLabel?: string;
  status?: string;
  message?: string;
  fileName?: string | null;
  fileIndex?: number | null;
  fileTotal?: number | null;
  fileRatio?: number | null;
  scopeRatio?: number;
};

type DownloadScopeProgressState = {
  scopeLabel: string;
  fileTotal: number;
  scopeRatio: number;
};

type DownloadProgressUiState = {
  visible: boolean;
  blocking: boolean;
  percent: number;
  message: string;
  logs: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireBestdoriRef(
  server: BestdoriAssetServer,
  family: BestdoriAssetFamily,
  nativeId: string,
) {
  const reference = createBestdoriNetworkResourceRef(server, family, nativeId);
  if (reference.status === "rejected") {
    throw new Error(`${reference.failure.capability}: ${reference.failure.boundary}`);
  }
  return reference.value;
}

export function useEditorIoAndShortcuts(params: any) {
  const {
    metadata,
    settings,
    appOptionSettings,
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
    clearSelectedNotes,
    setStatusMessage,
    openOverlayDialog,
    setNotes,
    setSlideChains,
    setMetadata,
    createId,
    setBpmEvents,
    setTimingGroups,
    setSvEvents,
    setToolBpmValue,
    setSingleSelectedNote,
    clearSelectedBpmEvents,
    setSelectedBpmEventId,
    toFinite,
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    normalizeTimingGroup,
    normalizeSvEvent,
    isLastBeatOrderedBpmNegative,
    setPendingSkinSelection,
    applyBestdoriSkinSelectionRef,
    setAudioDurationSec,
    setAudioFileName,
    audioFileName,
    jsonImportRef,
    bestdoriV2ImportRef,
    sanitizeFileName,
    setIsMetadataEditorOpen,
    setIsAppSettingsOpen,
    setIsSkinSettingsOpen,
    windowPresetId,
    WINDOW_SIZE_PRESETS,
    LogicalSize,
    getCurrentWindow,
    normalizeSkinSelection,
    skinApplySeqRef,
    setSkinAssets,
    setAppliedSkinResources,
    setIsSkinApplying,
    formatTypeLabel,
    setSkinSelection,
    didInitSkinRef,
    approxEq,
    selectedNoteIds,
    selectedBpmEventIds,
    selectedBpmEventId,
    selectedSvEventIds,
    selectedSvEventId,
    deleteCurrentSelection,
    NOTE_TYPES,
    setTool,
    setIsToolArmed,
    clearAllSelections,
    NOTE_SPECS,
    undoLastOperation,
    redoLastOperation,
    copyCurrentSelectionByShortcut,
    pasteAtMousePositionByShortcut,
  } = params;

  const resourceManager = useApplicationResourceManager();
  const appliedSkinResourcesRef = useRef<AppliedSkinResources | null>(null);
  const installBestdoriMedia = async (input: Parameters<typeof createBestdoriNetworkMediaDescriptor>[0]) => {
    const descriptor = createBestdoriNetworkMediaDescriptor(input);
    if (descriptor.status === "rejected") throw new Error(`${descriptor.failure.capability}: ${descriptor.failure.boundary}`);
    const registered = resourceManager.registerNetworkResource(descriptor.value);
    if (registered.status === "rejected") throw new Error(`${registered.failure.capability}: ${registered.failure.boundary}`);
    const installed = await resourceManager.ensureAvailable(descriptor.value.ref, { refresh: true });
    if (installed.status === "rejected") throw new Error(`${installed.failure.capability}: ${installed.failure.boundary}`);
    return descriptor.value.ref;
  };

  useEffect(() => () => {
    const applied = appliedSkinResourcesRef.current;
    appliedSkinResourcesRef.current = null;
    if (applied !== null) void applied.dispose();
  }, []);

  const toBeatValue = (value: unknown): number => Number(toFinite(value, 0).toFixed(6));
  const toLaneValue = (value: unknown): number => Number(toFinite(value, 0).toFixed(6));
  const toBpmValue = (value: unknown): number => Number(toFinite(value, metadata.bpm).toFixed(6));
  const toSvValue = (value: unknown): number => Number(toFinite(value, 1).toFixed(6));
  const toTimingGroupValue = (value: unknown): string => normalizeTimingGroup(value, GLOBAL_TIMING_GROUP_ID);
  const toOptionalTimingGroupValue = (value: unknown): string | undefined => {
    const normalized = toTimingGroupValue(value);
    return normalized === GLOBAL_TIMING_GROUP_ID ? undefined : normalized;
  };
  const toRhythmWidthValue = (value: unknown): number => Math.max(1, Math.round(toFinite(value, 1)));
  const toDirectionalWidthValue = (value: unknown): number => Math.max(1, Math.round(toFinite(value, 1)));

  const parseFiniteNumber = (value: unknown, label: string): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new Error(`${label} must be a finite number`);
    }
    return numeric;
  };

  const parseIntegerNumber = (value: unknown, label: string): number => {
    const numeric = parseFiniteNumber(value, label);
    if (!Number.isInteger(numeric)) {
      throw new Error(`${label} must be an integer`);
    }
    return numeric;
  };

  const parsePositiveIntegerNumber = (value: unknown, label: string): number => {
    const numeric = parseIntegerNumber(value, label);
    if (numeric < 1) {
      throw new Error(`${label} must be >= 1`);
    }
    return numeric;
  };

  const parseLaneNumber = (value: unknown, label: string): number => {
    return Number(parseFiniteNumber(value, label).toFixed(6));
  };

  const parseBeatNumber = (value: unknown, label: string): number => {
    return Number(parseFiniteNumber(value, label).toFixed(6));
  };

  const parseTimingGroupId = (value: unknown, _label: string, fallback = GLOBAL_TIMING_GROUP_ID): string => {
    if (value === undefined) {
      return fallback;
    }
    return normalizeTimingGroup(value, fallback);
  };

  const shiftAndClampBeat = (beat: number, offset: number): number => {
    const shifted = Number((beat - offset).toFixed(6));
    return shifted < 0 ? 0 : shifted;
  };

  const mapDirectionFromInternalType = (type: ChartNote["type"]): GarupaChartJsonDirection | null => {
    if (type === "directional_flick_left") {
      return "Left";
    }
    if (type === "directional_flick_right") {
      return "Right";
    }
    return null;
  };

  const mapTopLevelNoteToJson = (note: ChartNote): GarupaChartJsonTopLevelNote | null => {
    if (note.type === "single") {
      return {
        type: "Single",
        beat: toBeatValue(note.beat),
        lane: toLaneValue(note.lane),
        width: toRhythmWidthValue(note.width),
        timingGroup: toOptionalTimingGroupValue(note.timingGroup),
      };
    }
    if (note.type === "flick") {
      return {
        type: "Flick",
        beat: toBeatValue(note.beat),
        lane: toLaneValue(note.lane),
        width: toRhythmWidthValue(note.width),
        timingGroup: toOptionalTimingGroupValue(note.timingGroup),
      };
    }
    if (note.type === "skill") {
      return {
        type: "Skill",
        beat: toBeatValue(note.beat),
        lane: toLaneValue(note.lane),
        width: toRhythmWidthValue(note.width),
        timingGroup: toOptionalTimingGroupValue(note.timingGroup),
      };
    }
    const direction = mapDirectionFromInternalType(note.type);
    if (direction) {
      return {
        type: "Directional",
        beat: toBeatValue(note.beat),
        lane: toLaneValue(note.lane),
        width: toDirectionalWidthValue(note.width),
        direction,
        timingGroup: toOptionalTimingGroupValue(note.timingGroup),
      };
    }
    return null;
  };

  const mapSlideConnectionToJson = (note: ChartNote): GarupaChartJsonSlideConnection | null => {
    if (note.type === "hidden") {
      return {
        type: "Hidden",
        beat: toBeatValue(note.beat),
        lane: toLaneValue(note.lane),
        width: toRhythmWidthValue(note.width),
        timingGroup: toOptionalTimingGroupValue(note.timingGroup),
      };
    }
    const topLevel = mapTopLevelNoteToJson(note);
    return topLevel ? (topLevel as GarupaChartJsonSlideConnection) : null;
  };

  const buildExportItemKey = (
    item: GarupaChartJsonSlideConnection | GarupaChartJsonTopLevelNote,
  ): string => {
    const timingGroup = toTimingGroupValue((item as { timingGroup?: string }).timingGroup);
    if (item.type === "Directional") {
      return buildJsonNoteKey("Directional", item.beat, item.lane, item.width, item.direction, timingGroup);
    }
    return buildJsonNoteKey(item.type, item.beat, item.lane, item.width, undefined, timingGroup);
  };

  const buildJsonNoteKey = (
    type: "Single" | "Flick" | "Skill" | "Hidden" | "Directional",
    beat: number,
    lane: number,
    width?: number,
    direction?: GarupaChartJsonDirection,
    timingGroup = GLOBAL_TIMING_GROUP_ID,
  ): string => {
    const normalizedBeat = Number(beat.toFixed(6));
    if (type === "Directional") {
      return `${type}|${normalizedBeat}|${lane}|${width ?? 1}|${direction ?? "Left"}|${timingGroup}`;
    }
    return `${type}|${normalizedBeat}|${lane}|${width ?? 1}|${timingGroup}`;
  };

  const parseJsonNoteRecord = (
    source: Record<string, unknown>,
    label: string,
    allowHidden: boolean,
    fallbackTimingGroup = GLOBAL_TIMING_GROUP_ID,
  ): ParsedJsonNote => {
    const rawType = source.type;
    if (typeof rawType !== "string") {
      throw new Error(`${label}.type is required`);
    }

    if (rawType === "Directional") {
      const beat = parseBeatNumber(source.beat, `${label}.beat`);
      const lane = parseLaneNumber(source.lane, `${label}.lane`);
      const width = parsePositiveIntegerNumber(source.width, `${label}.width`);
      const timingGroup = parseTimingGroupId(source.timingGroup, `${label}.timingGroup`, fallbackTimingGroup);
      const rawDirection = source.direction;
      if (rawDirection !== "Left" && rawDirection !== "Right") {
        throw new Error(`${label}.direction must be Left or Right`);
      }

      return {
        note: {
          id: createId(),
          type: rawDirection === "Left" ? "directional_flick_left" : "directional_flick_right",
          beat,
          lane,
          width,
          timingGroup: normalizeNoteTimingGroup(timingGroup),
        },
        key: buildJsonNoteKey("Directional", beat, lane, width, rawDirection, timingGroup),
      };
    }

    if (rawType === "Hidden" && !allowHidden) {
      throw new Error(`${label}: Hidden is only allowed inside Slide.connections`);
    }

    if (rawType !== "Single" && rawType !== "Flick" && rawType !== "Skill" && rawType !== "Hidden") {
      throw new Error(`${label}.type is invalid: ${String(rawType)}`);
    }

    const beat = parseBeatNumber(source.beat, `${label}.beat`);
    const lane = parseLaneNumber(source.lane, `${label}.lane`);
    const timingGroup = parseTimingGroupId(source.timingGroup, `${label}.timingGroup`, fallbackTimingGroup);
    const width = source.width === undefined
      ? 1
      : parsePositiveIntegerNumber(source.width, `${label}.width`);

    const internalType: NoteType =
      rawType === "Single"
        ? "single"
        : rawType === "Flick"
          ? "flick"
          : rawType === "Skill"
            ? "skill"
            : "hidden";

    return {
      note: {
        id: createId(),
        type: internalType,
          beat,
          lane,
          width,
          timingGroup: normalizeNoteTimingGroup(timingGroup),
        },
      key: buildJsonNoteKey(rawType, beat, lane, width, undefined, timingGroup),
    };
  };

  const garupaChartJson = useMemo<GarupaChartJson>(() => {
    const sortedNotes = sortNotes(notes as ChartNote[]) as ChartNote[];
    const normalizedSlideChains = (slideChains as Array<{ noteIds: string[] }>) ?? [];
    const noteById = new Map(sortedNotes.map((note) => [note.id, note] as const));
    const slideNoteIdSet = new Set(
      normalizedSlideChains.flatMap((chain: { noteIds: string[] }) =>
        chain.noteIds.filter((id: string) => noteById.has(id)),
      ),
    );

    const bpmItems: GarupaChartJsonBpmItem[] = [
      { type: "BPM", beat: 0, value: toBpmValue(metadata.bpm) },
      ...(sortBpmEvents(bpmEvents as ChartBpmEvent[]) as ChartBpmEvent[])
        .filter((event: ChartBpmEvent) => !approxEq(event.beat, 0))
        .map((event: ChartBpmEvent) => ({
          type: "BPM" as const,
          beat: toBeatValue(event.beat),
          value: toBpmValue(event.bpm),
        })),
    ];

    const svItems: GarupaChartJsonSvItem[] = (sortSvEvents(svEvents as ChartSvEvent[]) as ChartSvEvent[]).map(
      (event: ChartSvEvent) => ({
        type: "SV",
        beat: toBeatValue(event.beat),
        value: toSvValue(event.value),
        timingGroup: toTimingGroupValue(event.timingGroup),
      }),
    );

    const slideConnectionKeySet = new Set<string>();
    const slideItems: GarupaChartJsonSlideItem[] = normalizedSlideChains
      .map((chain: { noteIds: string[]; timingGroup?: string }): GarupaChartJsonSlideItem | null => {
        const chainTimingGroup = toTimingGroupValue(chain.timingGroup);
        const connections: GarupaChartJsonSlideConnection[] = [];
        for (const id of chain.noteIds) {
          const note = noteById.get(id);
          if (!note) {
            continue;
          }
          const mapped = mapSlideConnectionToJson({ ...note, timingGroup: chainTimingGroup });
          if (!mapped) {
            continue;
          }
          connections.push({
            ...mapped,
            timingGroup: toOptionalTimingGroupValue(chainTimingGroup),
          });
        }

        for (const connection of connections) {
          if (connection.type === "Hidden") {
            continue;
          }
          slideConnectionKeySet.add(buildExportItemKey(connection));
        }

        if (connections.length === 0) {
          return null;
        }
        return {
          type: "Slide" as const,
          connections,
          timingGroup: toOptionalTimingGroupValue(chainTimingGroup),
        };
      })
      .filter((item: GarupaChartJsonSlideItem | null): item is GarupaChartJsonSlideItem => item !== null);

    const topLevelItems: GarupaChartJsonTopLevelNote[] = sortedNotes
      .filter((note) => note.type !== "hidden" && !slideNoteIdSet.has(note.id))
      .map((note) => mapTopLevelNoteToJson(note))
      .filter((item): item is GarupaChartJsonTopLevelNote => item !== null)
      .filter((item) => !slideConnectionKeySet.has(buildExportItemKey(item)));

    return [...bpmItems, ...svItems, ...topLevelItems, ...slideItems];
  }, [approxEq, bpmEvents, metadata.bpm, notes, slideChains, sortBpmEvents, sortNotes, sortSvEvents, svEvents]);

  const garupaChartJsonText = useMemo(() => JSON.stringify(garupaChartJson), [garupaChartJson]);
  const [isImportJsonModalOpen, setIsImportJsonModalOpen] = useState(false);
  const [importJsonModalLevel, setImportJsonModalLevel] = useState<ImportJsonModalLevel>("chart");
  const [importJsonText, setImportJsonText] = useState("");
  const [importOfficialChartId, setImportOfficialChartId] = useState("");
  const [importOfficialChartDifficulty, setImportOfficialChartDifficulty] = useState<OfficialChartDifficulty>("EASY");
  const [importCommunityPostId, setImportCommunityPostId] = useState("");
  const [uploadCommunityPostContent, setUploadCommunityPostContent] = useState("");
  const [uploadCommunityPostTags, setUploadCommunityPostTags] = useState<BestdoriPostTag[]>([]);
  const [importJsonSelectedPath, setImportJsonSelectedPath] = useState("");
  const [importBestdoriV2SelectedPath, setImportBestdoriV2SelectedPath] = useState("");
  const [isExportJsonModalOpen, setIsExportJsonModalOpen] = useState(false);
  const [isExportJsonSaving, setIsExportJsonSaving] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressUiState>({
    visible: false,
    blocking: false,
    percent: 0,
    message: "",
    logs: [],
  });
  const currentDownloadOperationIdRef = useRef<string | null>(null);
  const downloadScopeMapRef = useRef<Map<string, DownloadScopeProgressState>>(new Map());
  const downloadLogRef = useRef<string[]>([]);
  const downloadProgressHideTimerRef = useRef<number | null>(null);

  const getExportFileName = (): string => {
    const baseName = sanitizeFileName(metadata.title);
    return baseName.toLowerCase().endsWith(".json") ? baseName : `${baseName}.json`;
  };

  const clearDownloadProgressHideTimer = () => {
    if (downloadProgressHideTimerRef.current !== null) {
      window.clearTimeout(downloadProgressHideTimerRef.current);
      downloadProgressHideTimerRef.current = null;
    }
  };

  const hideDownloadProgress = (delayMs = 0) => {
    clearDownloadProgressHideTimer();
    if (delayMs <= 0) {
      setDownloadProgress((previous) =>
        previous.visible
          ? { visible: false, blocking: false, percent: 0, message: "", logs: [] }
          : previous,
      );
      return;
    }
    downloadProgressHideTimerRef.current = window.setTimeout(() => {
      setDownloadProgress({ visible: false, blocking: false, percent: 0, message: "", logs: [] });
      downloadProgressHideTimerRef.current = null;
    }, delayMs);
  };

  const startDownloadProgress = (operationId: string, message: string) => {
    clearDownloadProgressHideTimer();
    currentDownloadOperationIdRef.current = operationId;
    downloadScopeMapRef.current = new Map();
    downloadLogRef.current = [message];
    setDownloadProgress({
      visible: true,
      blocking: true,
      percent: 0,
      message,
      logs: [message],
    });
  };

  const completeDownloadProgress = (message: string, delayMs = 420) => {
    const nextLogs = [...downloadLogRef.current, message];
    const compactLogs = nextLogs.slice(-2);
    downloadLogRef.current = compactLogs;
    setDownloadProgress({
      visible: true,
      blocking: false,
      percent: 100,
      message,
      logs: compactLogs,
    });
    hideDownloadProgress(delayMs);
  };

  useEffect(() => {
    if (!isTauriRuntimeEnvironment()) {
      return;
    }

    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    const attach = async () => {
      try {
        unlisten = await listen<DownloadProgressPayload>(DOWNLOAD_PROGRESS_EVENT_NAME, (event) => {
          const payload = event.payload;
          if (!payload || typeof payload.operationId !== "string" || payload.operationId.length === 0) {
            return;
          }

          const currentOperationId = currentDownloadOperationIdRef.current;
          if (currentOperationId && payload.operationId !== currentOperationId) {
            return;
          }

          if (!currentOperationId) {
            currentDownloadOperationIdRef.current = payload.operationId;
          }

          const scopeId =
            typeof payload.scopeId === "string" && payload.scopeId.length > 0
              ? payload.scopeId
              : "default";
          const scopeLabel =
            typeof payload.scopeLabel === "string" && payload.scopeLabel.length > 0
              ? payload.scopeLabel
              : "下载资源";
          const fileTotal =
            typeof payload.fileTotal === "number" && Number.isFinite(payload.fileTotal) && payload.fileTotal > 0
              ? Math.round(payload.fileTotal)
              : (downloadScopeMapRef.current.get(scopeId)?.fileTotal ?? 1);
          const scopeRatio =
            typeof payload.scopeRatio === "number" && Number.isFinite(payload.scopeRatio)
              ? Math.max(0, Math.min(1, payload.scopeRatio))
              : (downloadScopeMapRef.current.get(scopeId)?.scopeRatio ?? 0);

          downloadScopeMapRef.current.set(scopeId, {
            scopeLabel,
            fileTotal,
            scopeRatio,
          });

          const scopeStates = Array.from(downloadScopeMapRef.current.values());
          const weightedTotal = scopeStates.reduce(
            (sum, scope) => sum + Math.max(1, scope.fileTotal),
            0,
          );
          const weightedProgress = scopeStates.reduce(
            (sum, scope) => sum + scope.scopeRatio * Math.max(1, scope.fileTotal),
            0,
          );
          const overallRatio = weightedTotal > 0 ? weightedProgress / weightedTotal : 0;
          const percent = Math.max(0, Math.min(100, Math.round(overallRatio * 100)));

          const message =
            typeof payload.message === "string" && payload.message.trim().length > 0
              ? payload.message.trim()
              : `${scopeLabel} 下载中…`;
          const previousLogs = downloadLogRef.current;
          const nextLogs = previousLogs[previousLogs.length - 1] === message
            ? previousLogs
            : [...previousLogs, message].slice(-2);
          downloadLogRef.current = nextLogs;

          setDownloadProgress((previous) => ({
            visible: true,
            blocking: previous.blocking,
            percent,
            message,
            logs: nextLogs,
          }));
        });
      } catch {
        // ignore listener failures in non-tauri or restricted runtime
      }
    };

    void attach();

    return () => {
      disposed = true;
      clearDownloadProgressHideTimer();
      if (unlisten) {
        void unlisten();
      }
      if (disposed) {
        currentDownloadOperationIdRef.current = null;
        downloadScopeMapRef.current = new Map();
        downloadLogRef.current = [];
      }
    };
  }, []);

  useEffect(() => {
    if (!downloadProgress.visible || !downloadProgress.blocking) {
      return;
    }

    const blockKeyboard = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", blockKeyboard, true);
    window.addEventListener("keypress", blockKeyboard, true);
    window.addEventListener("keyup", blockKeyboard, true);

    return () => {
      window.removeEventListener("keydown", blockKeyboard, true);
      window.removeEventListener("keypress", blockKeyboard, true);
      window.removeEventListener("keyup", blockKeyboard, true);
    };
  }, [downloadProgress.blocking, downloadProgress.visible]);

  const executeClearAllNotes = useCallback(() => {
    setNotes([]);
    setSlideChains([]);
    setSvEvents([]);
    clearSelectedNotes();
    setStatusMessage("已清空全部音符。");
  }, [clearSelectedNotes, setNotes, setSlideChains, setStatusMessage, setSvEvents]);

  const confirmClearAllNotes = useCallback(() => {
    if (typeof openOverlayDialog === "function") {
      openOverlayDialog(
        {
          tone: "warning",
          message: "确定清空所有音符吗？此操作不可撤销。",
        },
        {
          onConfirm: executeClearAllNotes,
        },
      );
      return;
    }
    if (!window.confirm("确定清空所有音符吗？")) {
      return;
    }
    executeClearAllNotes();
  }, [executeClearAllNotes, openOverlayDialog]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true;

      if (isTypingTarget) {
        return;
      }

      const primaryModifier = event.ctrlKey || event.metaKey;

      if (primaryModifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (typeof undoLastOperation === "function") {
          undoLastOperation();
        }
        return;
      }

      if (
        primaryModifier &&
        !event.altKey &&
        (
          (!event.shiftKey && event.key.toLowerCase() === "y")
          || (event.shiftKey && event.key.toLowerCase() === "z")
        )
      ) {
        event.preventDefault();
        if (typeof redoLastOperation === "function") {
          redoLastOperation();
        }
        return;
      }

      if (
        primaryModifier &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        if (typeof copyCurrentSelectionByShortcut === "function") {
          copyCurrentSelectionByShortcut();
        }
        return;
      }

      if (
        primaryModifier &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "v"
      ) {
        event.preventDefault();
        if (typeof pasteAtMousePositionByShortcut === "function") {
          pasteAtMousePositionByShortcut();
        }
        return;
      }

      if (
        primaryModifier &&
        !event.altKey &&
        event.shiftKey &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        confirmClearAllNotes();
        return;
      }

      if (
        event.key === "Delete" &&
        (selectedNoteIds.length > 0 || selectedBpmEventIds.length > 0 || selectedBpmEventId !== null || selectedSvEventIds.length > 0 || selectedSvEventId !== null)
      ) {
        event.preventDefault();
        deleteCurrentSelection();
        return;
      }

      const keyNumber = Number(event.key);
      if (Number.isInteger(keyNumber) && keyNumber >= 1 && keyNumber <= NOTE_TYPES.length + 1) {
        event.preventDefault();
        if (keyNumber === NOTE_TYPES.length + 1) {
          setTool("bpm");
          setIsToolArmed(true);
          clearAllSelections();
          setStatusMessage("工具切换为 BPM。");
          return;
        }
        const nextTool = NOTE_TYPES[keyNumber - 1] as NoteType;
        setTool(nextTool);
        setIsToolArmed(true);
        clearAllSelections();
        setStatusMessage(`工具切换为 ${NOTE_SPECS[nextTool].label}。`);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    NOTE_SPECS,
    NOTE_TYPES,
    clearAllSelections,
    clearSelectedNotes,
    confirmClearAllNotes,
    deleteCurrentSelection,
    selectedBpmEventId,
    selectedBpmEventIds,
    selectedNoteIds,
    setIsToolArmed,
    setStatusMessage,
    setTool,
    undoLastOperation,
    redoLastOperation,
    copyCurrentSelectionByShortcut,
    pasteAtMousePositionByShortcut,
  ]);

  const undoLastNote = () => {
    if (typeof undoLastOperation === "function") {
      undoLastOperation();
    }
  };

  const redoLastNote = () => {
    if (typeof redoLastOperation === "function") {
      redoLastOperation();
    }
  };

  const clearAllNotes = () => {
    confirmClearAllNotes();
  };

  const downloadJson = () => {
    setIsExportJsonModalOpen(true);
  };

  const closeExportJsonModal = () => {
    if (isExportJsonSaving) {
      return;
    }
    setIsExportJsonModalOpen(false);
  };

  const saveExportJsonToSelectedPath = async () => {
    if (isExportJsonSaving) {
      return;
    }

    const fileName = getExportFileName();

    if (!isTauriRuntimeEnvironment()) {
      const payload = new Blob([garupaChartJsonText], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(payload);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatusMessage(`已导出 ${fileName}`);
      return;
    }

    setIsExportJsonSaving(true);
    try {
      const savedPath = await invoke<string | null>("save_chart_json_via_dialog", {
        defaultFileName: fileName,
        jsonText: garupaChartJsonText,
      });

      if (!savedPath) {
        setStatusMessage("已取消导出。");
        return;
      }

      setStatusMessage(`已导出到 ${savedPath}`);
      setIsExportJsonModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`导出失败：${message}`);
    } finally {
      setIsExportJsonSaving(false);
    }
  };

  const exportBestdoriV2ToClipboard = async () => {
    try {
      const bestdori = convertGarupaChartJsonToBestdoriV2(garupaChartJson);
      const bestdoriJsonText = JSON.stringify(bestdori);

      if (isTauriRuntimeEnvironment()) {
        await writeClipboardText(bestdoriJsonText);
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(bestdoriJsonText);
      } else {
        throw new Error("clipboard API unavailable");
      }

      if (typeof openOverlayDialog === "function") {
        openOverlayDialog({
          tone: "info",
          message: "已导出谱面为 Bestdori 格式，可直接粘贴。",
        });
      } else {
        setStatusMessage("已导出 Bestdori V2 到剪贴板。");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (typeof openOverlayDialog === "function") {
        openOverlayDialog({
          tone: "error",
          message: `导出谱面为 Bestdori 格式代码失败：\n${message}`,
        });
      } else {
        setStatusMessage(`导出 Bestdori V2 失败：${message}`);
      }
    }
  };

  const triggerJsonImport = () => {
    jsonImportRef.current?.click();
  };

  const triggerBestdoriV2Import = () => {
    bestdoriV2ImportRef.current?.click();
  };

  const openImportJsonModal = () => {
    setImportJsonText(garupaChartJsonText);
    setImportJsonModalLevel("chart");
    setImportCommunityPostId("");
    setImportJsonSelectedPath("");
    setImportBestdoriV2SelectedPath("");
    setIsImportJsonModalOpen(true);
  };

  const closeImportJsonModal = () => {
    setImportJsonModalLevel("chart");
    setImportCommunityPostId("");
    setImportJsonSelectedPath("");
    setImportBestdoriV2SelectedPath("");
    setIsImportJsonModalOpen(false);
  };

  const openImportJsonModalBestdoriV2Level = () => {
    setImportOfficialChartId("");
    setImportOfficialChartDifficulty("EASY");
    setImportCommunityPostId("");
    setImportBestdoriV2SelectedPath("");
    setImportJsonModalLevel("bestdori-v2");
  };

  const applyParsedGarupaChartJson = (parsed: unknown): AppliedGarupaChartJsonSummary => {
    if (!Array.isArray(parsed)) {
      throw new Error("Chart JSON top-level must be an array.");
    }

    const topLevelParsedNotes: ParsedJsonNote[] = [];
    const slideParsedNotes: ParsedJsonNote[] = [];
    const nextSlideChains: Array<{ id: string; noteIds: string[]; timingGroup?: string }> = [];
    const rawBpmItems: ShiftedBpmItem[] = [];
    const rawSvItems: ShiftedSvItem[] = [];

    parsed.forEach((rawItem, itemIndex) => {
      if (!isRecord(rawItem)) {
        throw new Error(`item[${itemIndex}] must be an object`);
      }

      const itemType = rawItem.type;
      if (typeof itemType !== "string") {
        throw new Error(`item[${itemIndex}].type is required`);
      }

      if (itemType === "BPM") {
        const beat = parseBeatNumber(rawItem.beat, `item[${itemIndex}].beat`);
        const value = Number(parseFiniteNumber(rawItem.value, `item[${itemIndex}].value`).toFixed(6));
        rawBpmItems.push({ beat, value, sourceIndex: itemIndex });
        return;
      }

      if (itemType === "SV") {
        const beat = parseBeatNumber(rawItem.beat, `item[${itemIndex}].beat`);
        const value = Number(parseFiniteNumber(rawItem.value, `item[${itemIndex}].value`).toFixed(6));
        const timingGroup = parseTimingGroupId(rawItem.timingGroup, `item[${itemIndex}].timingGroup`, GLOBAL_TIMING_GROUP_ID);
        rawSvItems.push({ beat, value, timingGroup, sourceIndex: itemIndex });
        return;
      }

      if (itemType === "Slide") {
        const rawConnections = rawItem.connections;
        if (!Array.isArray(rawConnections)) {
          throw new Error(`item[${itemIndex}].connections must be an array`);
        }
        if (rawConnections.length === 0) {
          throw new Error(`item[${itemIndex}].connections cannot be empty`);
        }

        const chainTimingGroup = parseTimingGroupId(rawItem.timingGroup, `item[${itemIndex}].timingGroup`, GLOBAL_TIMING_GROUP_ID);
        const noteIds: string[] = [];
        rawConnections.forEach((rawConnection, connectionIndex) => {
          if (!isRecord(rawConnection)) {
            throw new Error(`item[${itemIndex}].connections[${connectionIndex}] must be an object`);
          }
          const parsedConnection = parseJsonNoteRecord(
            rawConnection,
            `item[${itemIndex}].connections[${connectionIndex}]`,
            true,
            chainTimingGroup,
          );
          parsedConnection.note.timingGroup = normalizeNoteTimingGroup(chainTimingGroup);
          slideParsedNotes.push(parsedConnection);
          noteIds.push(parsedConnection.note.id);
        });

        nextSlideChains.push({
          id: `slide-${itemIndex}-${createId()}`,
          noteIds,
          timingGroup: chainTimingGroup,
        });
        return;
      }

      if (itemType === "Hidden") {
        throw new Error(`item[${itemIndex}]: Hidden is only allowed inside Slide.connections`);
      }

      const parsedTopLevel = parseJsonNoteRecord(rawItem, `item[${itemIndex}]`, false);
      topLevelParsedNotes.push(parsedTopLevel);
    });

    if (rawBpmItems.length === 0) {
      throw new Error("Chart JSON must include at least one BPM item.");
    }

    const slideTopLevelConflictKeys = new Set(
      slideParsedNotes
        .filter(({ note }) => note.type !== "hidden")
        .map(({ key }) => key),
    );

    for (const parsedTopLevel of topLevelParsedNotes) {
      if (slideTopLevelConflictKeys.has(parsedTopLevel.key)) {
        throw new Error(
          "A note in Slide.connections cannot also appear at top-level with identical data.",
        );
      }
    }

    let baseBpmIndex = 0;
    for (let index = 1; index < rawBpmItems.length; index += 1) {
      if (rawBpmItems[index].beat < rawBpmItems[baseBpmIndex].beat) {
        baseBpmIndex = index;
      }
    }

    const beatOffset = rawBpmItems[baseBpmIndex].beat;
    const baseBpmSource = rawBpmItems[baseBpmIndex];
    const baseBpm = normalizeBaseBpmForWrite(baseBpmSource.value, metadata.bpm);
    if (baseBpm === null) {
      throw new Error(
        `item[${baseBpmSource.sourceIndex}].value must be > 0 when this BPM item is used as beat=0 base.`,
      );
    }

    for (let index = 0; index < rawBpmItems.length; index += 1) {
      if (index === baseBpmIndex) {
        continue;
      }
      const item = rawBpmItems[index];
      if (normalizeEventBpmForWrite(item.value, baseBpm) === null) {
        throw new Error(`item[${item.sourceIndex}].value cannot be 0 for non-base BPM.`);
      }
    }

    const shiftedBpmItems = rawBpmItems.map((item) => ({
      beat: shiftAndClampBeat(item.beat, beatOffset),
      value: item.value,
      sourceIndex: item.sourceIndex,
    }));
    const shiftedSvItems = rawSvItems.map((item) => ({
      beat: shiftAndClampBeat(item.beat, beatOffset),
      value: item.value,
      timingGroup: item.timingGroup,
      sourceIndex: item.sourceIndex,
    }));

    for (const parsedNote of topLevelParsedNotes) {
      parsedNote.note.beat = shiftAndClampBeat(parsedNote.note.beat, beatOffset);
    }
    for (const parsedNote of slideParsedNotes) {
      parsedNote.note.beat = shiftAndClampBeat(parsedNote.note.beat, beatOffset);
    }

    const nextMetadata: ChartMetadata = {
      ...metadata,
      bpm: baseBpm,
    };

    const nextNotes = sortNotes([
      ...topLevelParsedNotes.map(({ note }) => note),
      ...slideParsedNotes.map(({ note }) => note),
    ]);

    const dedupedBpmByBeat = new Map<string, { beat: number; bpm: number }>();
    for (let index = 0; index < shiftedBpmItems.length; index += 1) {
      if (index === baseBpmIndex) {
        continue;
      }
      const item = shiftedBpmItems[index];
      if (approxEq(item.beat, 0)) {
        continue;
      }
      const bpm = normalizeEventBpmForWrite(item.value, baseBpm);
      if (bpm === null) {
        continue;
      }
      dedupedBpmByBeat.set(item.beat.toFixed(6), {
        beat: item.beat,
        bpm,
      });
    }
    const nextBpmEvents = sortBpmEvents(
      Array.from(dedupedBpmByBeat.values()).map((item) => ({
        id: createId(),
        beat: item.beat,
        bpm: item.bpm,
      } as ChartBpmEvent)),
    );
    if (isLastBeatOrderedBpmNegative(baseBpm, nextBpmEvents)) {
      throw new Error("按 Beat 顺序最后一个 BPM 不能为负数。");
    }

    const dedupedSvByGroupBeat = new Map<string, ChartSvEvent>();
    for (const item of shiftedSvItems) {
      const normalized = normalizeSvEvent(
        {
          beat: item.beat,
          value: item.value,
          timingGroup: item.timingGroup,
        },
        settings.timeSignatureDenominator,
        1,
      );
      if (!normalized) {
        continue;
      }
      const key = `${normalized.timingGroup}|${normalized.beat.toFixed(6)}`;
      dedupedSvByGroupBeat.set(key, normalized);
    }
    const nextSvEvents = sortSvEvents(Array.from(dedupedSvByGroupBeat.values()));

    const shouldRegressExGarupaOnImport = appOptionSettings.exGarupaEnabled === false;
    const shouldRegressSpRhythmOnImport = appOptionSettings.spRhythmNoteEnabled === false;
    const shouldRegressHabahiroOnImport = appOptionSettings.habahiro === false;
    const nextChartState = { notes: nextNotes, slideChains: nextSlideChains, svEvents: nextSvEvents };
    let regressedChartState: ChartStateLike = nextChartState;
    let regressedExGarupa = false;
    let regressedSpRhythm = false;
    let regressedHabahiro = false;
    if (shouldRegressExGarupaOnImport && isChartUsingExGarupa(regressedChartState)) {
      regressedChartState = regressChartWithoutExGarupa(regressedChartState);
      regressedExGarupa = true;
    }
    if (shouldRegressSpRhythmOnImport && isChartUsingSpRhythm(regressedChartState)) {
      regressedChartState = regressChartWithoutSpRhythm(regressedChartState);
      regressedSpRhythm = true;
    }
    if (shouldRegressHabahiroOnImport && isChartUsingHabahiro(regressedChartState)) {
      regressedChartState = regressChartWithoutHabahiro(regressedChartState);
      regressedHabahiro = true;
    }
    const importedSlideChains = regressedChartState.slideChains;
    const importedSvEvents = regressedChartState.svEvents ?? nextSvEvents;
    const importedNotes = sortNotes(
      appOptionSettings.habahiro
        ? applyHabahiroSlideWidths(regressedChartState.notes, importedSlideChains)
        : regressedChartState.notes,
    );

    setMetadata(nextMetadata);
    setNotes(importedNotes);
    setSlideChains(importedSlideChains);
    setBpmEvents(nextBpmEvents);
    setSvEvents(importedSvEvents);
    if (regressedChartState.timingGroups && typeof setTimingGroups === "function") {
      setTimingGroups(regressedChartState.timingGroups);
    }
    setToolBpmValue(baseBpm);
    setSingleSelectedNote(importedNotes.find((note: ChartNote) => note.type !== "hidden")?.id ?? null);
    clearSelectedBpmEvents();
    setSelectedBpmEventId(null);

    const visibleNoteCount = importedNotes.reduce(
      (count: number, note: ChartNote) => (note.type === "hidden" ? count : count + 1),
      0,
    );

    return {
      visibleNoteCount,
      beatOffset,
      regressedExGarupa,
      regressedSpRhythm,
      regressedHabahiro,
    };
  };

  const applyChartImportStatus = (label: string, summary: AppliedGarupaChartJsonSummary) => {
    const regressionNotices = [
      summary.regressedSpRhythm ? "已按当前模式自动执行去SP节奏图示回退。" : "",
      summary.regressedHabahiro ? "已按当前模式自动执行去2026愚人节回退。" : "",
    ].filter((message) => message.length > 0);
    const regressionNotice = regressionNotices.length > 0 ? ` ${regressionNotices.join(" ")}` : "";
    const needsOffsetNotice = !approxEq(summary.beatOffset, 0);
    if (needsOffsetNotice) {
      setStatusMessage(
        `${label}：${summary.visibleNoteCount} 个可见音符，已按最小 BPM Beat=${summary.beatOffset} 执行整体偏移并强制 BPM@0。${regressionNotice}`,
      );
      return;
    }
    setStatusMessage(`${label}：${summary.visibleNoteCount} 个可见音符。${regressionNotice}`);
  };

  const applyImportJsonText = () => {
    try {
      const parsed: unknown = JSON.parse(importJsonText);
      const summary = applyParsedGarupaChartJson(parsed);
      applyChartImportStatus("已应用 JSON 文本", summary);
      setImportJsonModalLevel("chart");
      setIsImportJsonModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`应用 JSON 失败：${message}`);
    }
  };

  const resolveCommunityPostDifficulty = (diff: unknown): ChartMetadata["difficulty"] => {
    const parsedAsNumber = Number(diff);
    if (Number.isInteger(parsedAsNumber) && parsedAsNumber >= 0 && parsedAsNumber <= 4) {
      return COMMUNITY_POST_DIFF_TO_METADATA_DIFFICULTY[parsedAsNumber] ?? "EASY";
    }
    if (typeof diff === "string") {
      const normalized = diff.trim().toUpperCase();
      if (
        normalized === "EASY"
        || normalized === "NORMAL"
        || normalized === "HARD"
        || normalized === "EXPERT"
        || normalized === "SPECIAL"
      ) {
        return normalized;
      }
    }
    return "EASY";
  };

  const resolveCommunityPostCharter = (author: unknown): string => {
    if (!isRecord(author)) {
      return "";
    }
    const nickname = typeof author.nickname === "string" ? author.nickname.trim() : "";
    if (nickname.length > 0) {
      return nickname;
    }
    const username = typeof author.username === "string" ? author.username.trim() : "";
    if (username.length > 0) {
      return username;
    }
    return "";
  };

  const resolveTrimmedString = (value: unknown): string => {
    if (typeof value !== "string") {
      return "";
    }
    return value.trim();
  };

  const pushBlockingProgress = (operationId: string, percent: number, message: string) => {
    if (currentDownloadOperationIdRef.current !== operationId) {
      return;
    }
    const clampedPercent = Math.max(0, Math.min(99, Math.round(percent)));
    const previousLogs = downloadLogRef.current;
    const nextLogs = previousLogs[previousLogs.length - 1] === message
      ? previousLogs
      : [...previousLogs, message].slice(-2);
    downloadLogRef.current = nextLogs;
    setDownloadProgress({
      visible: true,
      blocking: true,
      percent: clampedPercent,
      message,
      logs: nextLogs,
    });
  };

  const hasVisiblePlayableNote = (chartItems: unknown): boolean => {
    if (!Array.isArray(chartItems)) {
      return false;
    }
    return chartItems.some((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const typedItem = item as { type?: unknown; connections?: unknown };
      if (typedItem.type === "Single" || typedItem.type === "Flick" || typedItem.type === "Skill" || typedItem.type === "Directional") {
        return true;
      }
      return typedItem.type === "Slide" && Array.isArray(typedItem.connections) && typedItem.connections.length > 0;
    });
  };

  const applyImportOfficialChart = async () => {
    const chartIdText = importOfficialChartId.trim();
    if (!/^\d+$/.test(chartIdText)) {
      setStatusMessage("官方谱面导入失败：ID 必须为正整数。");
      return;
    }
    const chartId = Number.parseInt(chartIdText, 10);
    if (!Number.isFinite(chartId) || chartId < 1) {
      setStatusMessage("官方谱面导入失败：ID 必须为正整数。");
      return;
    }

    const difficulty = importOfficialChartDifficulty;
    const importOperationId = `official-chart-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const pushImportProgress = (percent: number, message: string) =>
      pushBlockingProgress(importOperationId, percent, message);

    startDownloadProgress(importOperationId, "正在获取官方谱面数据…");
    try {
      pushImportProgress(15, "正在请求官方谱面与歌曲信息…");
      const payload = await fetchBestdoriOfficialChartImportPayload(chartId, OFFICIAL_CHART_DIFFICULTY_TO_API[difficulty]);
      pushImportProgress(42, "正在转换谱面结构…");
      const converted = convertBestdoriV2ToGarupaChartJson(payload.chart);
      const hasVisibleNote = hasVisiblePlayableNote(converted);
      if (!hasVisibleNote) {
        throw new Error("官方谱面解析成功，但未解析到可见音符。");
      }
      pushImportProgress(58, "正在应用谱面内容…");
      const summary = applyParsedGarupaChartJson(converted);
      pushImportProgress(70, "正在安装歌曲媒体资源…");
      const bgmRef = await installBestdoriMedia({
        server: payload.resources.server,
        purpose: "bgm",
        nativeId: `song-${chartId}-bgm`,
        title: payload.audioFileName,
        url: payload.resources.audioUrl,
      });
      const coverRef = await installBestdoriMedia({
        server: payload.resources.server,
        purpose: "cover",
        nativeId: `song-${chartId}-cover`,
        title: `${payload.metadata.title} cover`,
        url: payload.resources.jacketUrl,
      });
      const mvRef = payload.resources.mvUrl === null
        ? null
        : await installBestdoriMedia({
            server: payload.resources.server,
            purpose: "mv",
            nativeId: `song-${chartId}-mv`,
            title: `${payload.metadata.title} MV`,
            url: payload.resources.mvUrl,
          });
      setChartMediaResources((current: typeof chartMediaResources) => Object.freeze({
        ...current,
        bgm: bgmRef,
        cover: coverRef,
        mv: mvRef,
      }));
      setAudioFileName(payload.audioFileName);
      setAudioDurationSec(0);
      pushImportProgress(92, "正在写入谱面元信息…");
      setMetadata((current: ChartMetadata) => ({
        ...current,
        title: resolveTrimmedString(payload.metadata.title),
        artist: resolveTrimmedString(payload.metadata.artist),
        charter: resolveTrimmedString(payload.metadata.charter),
        difficulty: resolveCommunityPostDifficulty(payload.metadata.difficulty),
        difficultyLevel: resolveTrimmedString(payload.metadata.difficultyLevel),
        offsetMs: Number.isFinite(Number(payload.metadata.offsetMs))
          ? Math.round(Number(payload.metadata.offsetMs))
          : 0,
        mvOffsetMs: 0,
      }));
      const label = `已导入官方谱面 ${chartId}/${difficulty} 并同步歌曲信息`;
      applyChartImportStatus(label, summary);
      completeDownloadProgress("官方谱面导入完成。");
      setImportJsonModalLevel("chart");
      setIsImportJsonModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      completeDownloadProgress(`官方谱面导入失败：${message}`, 900);
      setStatusMessage(`官方谱面导入失败：${message}`);
    } finally {
      if (currentDownloadOperationIdRef.current === importOperationId) {
        currentDownloadOperationIdRef.current = null;
        downloadScopeMapRef.current = new Map();
      }
    }
  };

  const applyImportCommunityChart = async () => {
    const postIdText = importCommunityPostId.trim();
    if (!/^\d+$/.test(postIdText)) {
      setStatusMessage("社区谱面导入失败：谱面 ID 必须为正整数。");
      return;
    }
    const postId = Number.parseInt(postIdText, 10);
    if (!Number.isFinite(postId) || postId < 1) {
      setStatusMessage("社区谱面导入失败：谱面 ID 必须为正整数。");
      return;
    }

    const importOperationId = `community-chart-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const resolveFileNameFromUrl = (value: string, fallback: string): string => {
      try {
        const parsed = new URL(value);
        const tail = parsed.pathname.split("/").filter((item) => item.length > 0).pop();
        return tail && tail.trim().length > 0 ? tail : fallback;
      } catch {
        return fallback;
      }
    };
    const bestdoriServerFromUrl = (value: string): BestdoriAssetServer | null => {
      try {
        const parsed = new URL(value);
        const host = parsed.host.toLowerCase();
        if (host !== "bestdori.com" && host !== "www.bestdori.com") return null;
        const server = parsed.pathname.split("/").filter(Boolean)[1];
        return server === "jp" || server === "en" || server === "tw" || server === "cn" || server === "kr"
          ? server
          : "jp";
      } catch {
        return null;
      }
    };
    const pushImportProgress = (percent: number, message: string) =>
      pushBlockingProgress(importOperationId, percent, message);

    startDownloadProgress(importOperationId, "正在获取社区谱面数据…");
    try {
      pushImportProgress(12, "正在请求社区帖子详情…");
      const details = await fetchBestdoriCommunityPostDetails(postId);
      const post = details.post;
      if (!post || typeof post !== "object") {
        throw new Error("社区帖子详情缺失 post。");
      }
      if (post.categoryName !== "SELF_POST" || post.categoryId !== "chart") {
        throw new Error("该帖子不是社区谱面（仅支持 SELF_POST/chart）。");
      }
      if (!Array.isArray(post.chart)) {
        throw new Error("该帖子不包含可导入的谱面数据。");
      }

      pushImportProgress(34, "正在转换谱面结构…");
      const converted = convertBestdoriV2ToGarupaChartJson(post.chart);
      const hasVisibleNote = hasVisiblePlayableNote(converted);
      if (!hasVisibleNote) {
        throw new Error("社区谱面解析成功，但未解析到可见音符。");
      }

      pushImportProgress(54, "正在应用谱面内容…");
      const summary = applyParsedGarupaChartJson(converted);
      const songResources = await resolveBestdoriCommunitySongResourceUrls(post.song);

      const audioUrl = typeof songResources?.audioUrl === "string" ? songResources.audioUrl.trim() : "";
      const coverUrl = typeof songResources?.coverUrl === "string" ? songResources.coverUrl.trim() : "";
      const audioServer = audioUrl.length === 0 ? null : bestdoriServerFromUrl(audioUrl);
      const coverServer = coverUrl.length === 0 ? null : bestdoriServerFromUrl(coverUrl);
      if (audioUrl.length > 0 && audioServer === null) {
        throw new Error("社区歌曲音频不属于已注册Bestdori资源源，不能保留裸URL。");
      }
      if (coverUrl.length > 0 && coverServer === null) {
        throw new Error("社区歌曲封面不属于已注册Bestdori资源源，不能保留裸URL。");
      }
      pushImportProgress(66, "正在安装社区歌曲媒体…");
      const bgmRef = audioServer === null
        ? null
        : await installBestdoriMedia({
            server: audioServer,
            purpose: "bgm",
            nativeId: `community-${postId}-bgm`,
            title: resolveFileNameFromUrl(audioUrl, `community-post-${postId}.mp3`),
            url: audioUrl,
          });
      const coverRef = coverServer === null
        ? null
        : await installBestdoriMedia({
            server: coverServer,
            purpose: "cover",
            nativeId: `community-${postId}-cover`,
            title: `community-post-${postId}-cover`,
            url: coverUrl,
          });
      setChartMediaResources((current: typeof chartMediaResources) => Object.freeze({
        ...current,
        bgm: bgmRef,
        cover: coverRef,
        mv: null,
      }));
      setAudioFileName(bgmRef === null ? "" : resolveFileNameFromUrl(audioUrl, `community-post-${postId}.mp3`));
      setAudioDurationSec(0);

      pushImportProgress(92, "正在写入谱面元信息…");
      setMetadata((current: ChartMetadata) => ({
        ...current,
        title: resolveTrimmedString(post.title),
        artist: resolveTrimmedString(post.artists),
        charter: resolveCommunityPostCharter(post.author),
        difficulty: resolveCommunityPostDifficulty(post.diff),
        difficultyLevel: Number.isFinite(Number(post.level)) && Number(post.level) > 0
          ? String(Math.round(Number(post.level)))
          : "",
        offsetMs: 0,
        mvOffsetMs: 0,
      }));

      const label = audioUrl.length > 0
        ? `已导入社区谱面 ${postId} 并同步歌曲信息`
        : `已导入社区谱面 ${postId}`;
      applyChartImportStatus(label, summary);
      completeDownloadProgress("社区谱面导入完成。");
      setImportJsonModalLevel("chart");
      setIsImportJsonModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      completeDownloadProgress(`社区谱面导入失败：${message}`, 900);
      setStatusMessage(`社区谱面导入失败：${message}`);
    } finally {
      if (currentDownloadOperationIdRef.current === importOperationId) {
        currentDownloadOperationIdRef.current = null;
        downloadScopeMapRef.current = new Map();
      }
    }
  };

  const applyUploadCommunityChart = async () => {
    const uploadOperationId = `upload-community-chart-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const pushUploadProgress = (percent: number, message: string) =>
      pushBlockingProgress(uploadOperationId, percent, message);
    const progressByStage: Record<string, { percent: number; message: string }> = {
      "checking-login": { percent: 8, message: "正在校验 Bestdori 登录状态…" },
      "converting-chart": { percent: 28, message: "正在转换谱面结构…" },
      "resolving-audio": { percent: 42, message: "正在准备歌曲音频…" },
      "uploading-audio": { percent: 56, message: "正在上传歌曲音频…" },
      "resolving-cover": { percent: 68, message: "正在准备歌曲封面…" },
      "uploading-cover": { percent: 80, message: "正在上传歌曲封面…" },
      posting: { percent: 92, message: "正在发布社区谱面…" },
    };

    startDownloadProgress(uploadOperationId, "正在上传社区谱面…");
    try {
      const audioFileBytes = await chartMediaLease.readBytes("bgm");
      const coverFileBytes = await chartMediaLease.readBytes("cover");
      if (audioFileBytes === null || coverFileBytes === null) {
        throw new Error("社区谱面上传需要已安装的歌曲音频和封面资源。");
      }
      const parsedTags = uploadCommunityPostTags.length > 0 ? uploadCommunityPostTags : undefined;
      const result = await publishBestdoriCommunityChartFlow({
        garupaChartJson,
        metadata,
        audioFileBytes,
        audioFileName: resolveTrimmedString(audioFileName) || "song.mp3",
        audioMimeType: chartMediaLease.mediaTypes.bgm ?? "audio/mpeg",
        coverFileBytes,
        coverFileName: "cover.png",
        coverMimeType: chartMediaLease.mediaTypes.cover ?? "image/png",
        contentText: uploadCommunityPostContent,
        tags: parsedTags,
        onStage: (stage) => {
          const entry = progressByStage[stage];
          if (!entry) {
            return;
          }
          pushUploadProgress(entry.percent, entry.message);
        },
      });

      const svWarning = result.svDropped ? "（注意：SV 不支持，已在上传前转换时忽略）" : "";
      completeDownloadProgress("社区谱面上传完成。");
      if (typeof openOverlayDialog === "function") {
        openOverlayDialog({
          tone: "info",
          message: `社区谱面上传成功。\n${result.postUrl}${svWarning ? `\n${svWarning}` : ""}`,
        });
      } else {
        setStatusMessage(`社区谱面上传成功：${result.postUrl}${svWarning}`);
      }
      setImportJsonModalLevel("chart");
      setIsImportJsonModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      completeDownloadProgress(`社区谱面上传失败：${message}`, 900);
      if (typeof openOverlayDialog === "function") {
        openOverlayDialog({
          tone: "error",
          message: `社区谱面上传失败：\n${message}`,
        });
      } else {
        setStatusMessage(`社区谱面上传失败：${message}`);
      }
    } finally {
      if (currentDownloadOperationIdRef.current === uploadOperationId) {
        currentDownloadOperationIdRef.current = null;
        downloadScopeMapRef.current = new Map();
      }
    }
  };

  const applyUploadNotGarupaServerChart = async () => {
    const uploadOperationId = `upload-notgarupa-server-chart-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const pushUploadProgress = (percent: number, message: string) =>
      pushBlockingProgress(uploadOperationId, percent, message);
    const progressByStage: Record<string, { percent: number; message: string }> = {
      "converting-chart": { percent: 25, message: "正在准备 Garupa 谱面 JSON…" },
      "resolving-audio": { percent: 45, message: "正在准备歌曲音频…" },
      "resolving-cover": { percent: 65, message: "正在准备歌曲封面…" },
      uploading: { percent: 90, message: "正在上传至 NotGarupa 服务器…" },
    };

    startDownloadProgress(uploadOperationId, "正在上传至 NotGarupa 服务器…");
    try {
      const audioFileBytes = await chartMediaLease.readBytes("bgm");
      const coverFileBytes = await chartMediaLease.readBytes("cover");
      if (audioFileBytes === null || coverFileBytes === null) {
        throw new Error("NotGarupa上传需要已安装的歌曲音频和封面资源。");
      }
      const difficultyValue = Number(metadata.difficultyLevel);
      const resolvedDifficulty = Number.isFinite(difficultyValue) && difficultyValue >= 1
        ? Math.trunc(difficultyValue)
        : 1;
      const result = await uploadNotGarupaLevelFlow({
        garupaChartJson,
        metadata,
        audioFileBytes,
        audioFileName: resolveTrimmedString(audioFileName) || "song.mp3",
        audioMimeType: chartMediaLease.mediaTypes.bgm ?? "audio/mpeg",
        coverFileBytes,
        coverFileName: "cover.png",
        coverMimeType: chartMediaLease.mediaTypes.cover ?? "image/png",
        description: uploadCommunityPostContent,
        tags: uploadCommunityPostTags,
        difficulty: resolvedDifficulty,
        onStage: (stage) => {
          const entry = progressByStage[stage];
          if (!entry) {
            return;
          }
          pushUploadProgress(entry.percent, entry.message);
        },
      });

      completeDownloadProgress("NotGarupa 服务器谱面上传完成。");
      if (typeof openOverlayDialog === "function") {
        openOverlayDialog({
          tone: "info",
          message: `NotGarupa 服务器上传成功。\nID: ${result.uid}\n${result.levelUrl}`,
        });
      } else {
        setStatusMessage(`NotGarupa 服务器上传成功：ID ${result.uid}`);
      }
      setImportJsonModalLevel("chart");
      setIsImportJsonModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      completeDownloadProgress(`NotGarupa 服务器谱面上传失败：${message}`, 900);
      if (typeof openOverlayDialog === "function") {
        openOverlayDialog({
          tone: "error",
          message: `NotGarupa 服务器上传失败：\n${message}`,
        });
      } else {
        setStatusMessage(`NotGarupa 服务器上传失败：${message}`);
      }
    } finally {
      if (currentDownloadOperationIdRef.current === uploadOperationId) {
        currentDownloadOperationIdRef.current = null;
        downloadScopeMapRef.current = new Map();
      }
    }
  };

  const applyUploadTestServerChart = async () => {
    const uploadOperationId = `upload-test-server-chart-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const pushUploadProgress = (percent: number, message: string) =>
      pushBlockingProgress(uploadOperationId, percent, message);
    const progressByStage: Record<string, { percent: number; message: string }> = {
      "converting-chart": { percent: 30, message: "正在转换谱面结构…" },
      "resolving-audio": { percent: 55, message: "正在准备歌曲音频…" },
      uploading: { percent: 90, message: "正在上传到测试服…" },
    };

    startDownloadProgress(uploadOperationId, "正在上传到测试服…");
    try {
      const audioFileBytes = await chartMediaLease.readBytes("bgm");
      if (audioFileBytes === null) {
        throw new Error("测试服上传需要已安装的歌曲音频资源。");
      }
      const difficultyValue = Number(metadata.difficultyLevel);
      const resolvedDifficulty = Number.isFinite(difficultyValue) && difficultyValue >= 0
        ? Math.trunc(difficultyValue)
        : undefined;
      const result = await uploadSonolusLevelFlow({
        garupaChartJson,
        metadata,
        audioFileBytes,
        audioFileName: resolveTrimmedString(audioFileName) || "song.mp3",
        audioMimeType: chartMediaLease.mediaTypes.bgm ?? "audio/mpeg",
        difficulty: resolvedDifficulty,
        onStage: (stage) => {
          const entry = progressByStage[stage];
          if (!entry) {
            return;
          }
          pushUploadProgress(entry.percent, entry.message);
        },
      });

      const svWarning = result.svDropped ? "\n注意：SV 不支持，已在上传前转换时忽略。" : "";
      completeDownloadProgress("测试服谱面上传完成。");
      if (typeof openOverlayDialog === "function") {
        openOverlayDialog({
          tone: "info",
          message: `测试服上传成功。\nID: ${result.uid}${svWarning}`,
        });
      } else {
        setStatusMessage(`测试服上传成功：ID ${result.uid}`);
      }
      setImportJsonModalLevel("chart");
      setIsImportJsonModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      completeDownloadProgress(`测试服谱面上传失败：${message}`, 900);
      if (typeof openOverlayDialog === "function") {
        openOverlayDialog({
          tone: "error",
          message: `测试服上传失败：\n${message}`,
        });
      } else {
        setStatusMessage(`测试服上传失败：${message}`);
      }
    } finally {
      if (currentDownloadOperationIdRef.current === uploadOperationId) {
        currentDownloadOperationIdRef.current = null;
        downloadScopeMapRef.current = new Map();
      }
    }
  };

  const handleJsonImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const pickedPath = event.currentTarget.value;
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    const previousSelectedPath = importJsonSelectedPath;
    setImportJsonSelectedPath(pickedPath || file.name);

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const summary = applyParsedGarupaChartJson(parsed);
      applyChartImportStatus(`已导入 ${file.name}`, summary);
      setImportJsonModalLevel("chart");
      setIsImportJsonModalOpen(false);
    } catch (error) {
      setImportJsonSelectedPath(previousSelectedPath);
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`导入失败：${message}`);
    }
  };

  const handleBestdoriV2Import = async (event: ChangeEvent<HTMLInputElement>) => {
    const pickedPath = event.currentTarget.value;
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    const previousSelectedPath = importBestdoriV2SelectedPath;
    setImportBestdoriV2SelectedPath(pickedPath || file.name);

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const converted = convertBestdoriV2ToGarupaChartJson(parsed);
      setImportJsonText(JSON.stringify(converted));
      setImportJsonModalLevel("chart");
      setStatusMessage("已将 Bestdori V2 转换为Garupa 谱面 JSON，请在导入页点击“应用”。");
    } catch (error) {
      setImportBestdoriV2SelectedPath(previousSelectedPath);
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Bestdori V2 导入失败：${message}`);
    }
  };

  const openMetadataEditor = () => {
    setIsMetadataEditorOpen(true);
  };

  const openAppSettings = () => {
    setIsAppSettingsOpen(true);
  };

  const openSkinSettings = () => {
    setPendingSkinSelection(skinSelection);
    setIsSkinSettingsOpen(true);
  };

  const importUserMedia = async (
    purpose: "bgm" | "cover" | "mv" | "stage-backdrop",
    file: File,
  ) => {
    const imported = await resourceManager.importUserMedia({
      purpose,
      fileName: file.name,
      mediaType: file.type || "application/octet-stream",
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    if (imported.status === "rejected") {
      throw new Error(`${imported.failure.capability}: ${imported.failure.boundary}`);
    }
    return imported.value.ref;
  };

  const handleCoverUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void importUserMedia("cover", file).then((cover) => {
      setChartMediaResources((current: typeof chartMediaResources) => Object.freeze({ ...current, cover }));
      setStatusMessage("封面资源已导入。");
    }).catch((error) => setStatusMessage(`封面导入失败：${error instanceof Error ? error.message : String(error)}`));
  };

  const handleAudioUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void importUserMedia("bgm", file).then((bgm) => {
      setChartMediaResources((current: typeof chartMediaResources) => Object.freeze({ ...current, bgm }));
      setAudioFileName(file.name);
      setAudioDurationSec(0);
      setStatusMessage(`音频资源已导入：${file.name}`);
    }).catch((error) => setStatusMessage(`音频导入失败：${error instanceof Error ? error.message : String(error)}`));
  };

  const handleMvUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void importUserMedia("mv", file).then((mv) => {
      setChartMediaResources((current: typeof chartMediaResources) => Object.freeze({ ...current, mv }));
      setStatusMessage(`MV资源已导入：${file.name}`);
    }).catch((error) => setStatusMessage(`MV导入失败：${error instanceof Error ? error.message : String(error)}`));
  };

  const handleStageBackdropUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void importUserMedia("stage-backdrop", file).then((stageBackdrop) => {
      setChartMediaResources((current: typeof chartMediaResources) => Object.freeze({ ...current, stageBackdrop }));
      setStatusMessage(`舞台背景资源已导入：${file.name}`);
    }).catch((error) => setStatusMessage(`舞台背景导入失败：${error instanceof Error ? error.message : String(error)}`));
  };

  const applyWindowPresetById = async (
    presetId: string,
    options?: { silent?: boolean },
  ) => {
    const preset =
      WINDOW_SIZE_PRESETS.find((item: any) => item.id === presetId)
      ?? WINDOW_SIZE_PRESETS[0];
    if (!preset) {
      if (!options?.silent) {
        setStatusMessage("未找到可用分辨率预设。");
      }
      return;
    }

    try {
      const appWindow = getCurrentWindow();
      if (!appWindow) {
        if (!options?.silent) {
          setStatusMessage("当前窗口不可用，无法调整分辨率。");
        }
        return;
      }

      // Best-effort: some environments/capability sets may reject this.
      try {
        await appWindow.unmaximize();
      } catch {
        // ignore
      }

      const normalizePositivePixel = (value: unknown): number | null => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return null;
        }
        return Math.max(1, Math.floor(numeric));
      };
      const requestedWidth = normalizePositivePixel(preset.width) ?? 1;
      const requestedHeight = normalizePositivePixel(preset.height) ?? 1;

      let nonClientExtraWidth = 0;
      let nonClientExtraHeight = 0;
      try {
        const [innerSize, outerSize] = await Promise.all([
          typeof (appWindow as any).innerSize === "function" ? (appWindow as any).innerSize() : Promise.resolve(null),
          typeof (appWindow as any).outerSize === "function" ? (appWindow as any).outerSize() : Promise.resolve(null),
        ]);
        const innerWidth = normalizePositivePixel((innerSize as { width?: unknown } | null)?.width);
        const innerHeight = normalizePositivePixel((innerSize as { height?: unknown } | null)?.height);
        const outerWidth = normalizePositivePixel((outerSize as { width?: unknown } | null)?.width);
        const outerHeight = normalizePositivePixel((outerSize as { height?: unknown } | null)?.height);
        if (innerWidth !== null && outerWidth !== null) {
          nonClientExtraWidth = Math.max(0, outerWidth - innerWidth);
        }
        if (innerHeight !== null && outerHeight !== null) {
          nonClientExtraHeight = Math.max(0, outerHeight - innerHeight);
        }
      } catch {
        // ignore size probing failures
      }

      const screenAvailableWidth = normalizePositivePixel(window.screen?.availWidth);
      const screenAvailableHeight = normalizePositivePixel(window.screen?.availHeight);
      const maxLogicalInnerWidth = screenAvailableWidth !== null
        ? Math.max(320, screenAvailableWidth - nonClientExtraWidth)
        : null;
      const maxLogicalInnerHeight = screenAvailableHeight !== null
        ? Math.max(240, screenAvailableHeight - nonClientExtraHeight)
        : null;
      const nextWidth = maxLogicalInnerWidth !== null
        ? Math.min(requestedWidth, maxLogicalInnerWidth)
        : requestedWidth;
      const nextHeight = maxLogicalInnerHeight !== null
        ? Math.min(requestedHeight, maxLogicalInnerHeight)
        : requestedHeight;
      const wasClamped = nextWidth !== requestedWidth || nextHeight !== requestedHeight;

      let resized = false;
      try {
        await appWindow.setSize(new LogicalSize(nextWidth, nextHeight));
        resized = true;
      } catch {
        // Fallback for API/runtime differences.
        await appWindow.setSize({
          type: "Logical",
          width: nextWidth,
          height: nextHeight,
        } as any);
        resized = true;
      }

      if (!resized) {
        throw new Error("setSize was not applied.");
      }

      // Best-effort center, do not fail whole action if this step is blocked.
      try {
        await appWindow.center();
      } catch {
        // ignore
      }

      if (!options?.silent) {
        if (wasClamped) {
          setStatusMessage(`窗口分辨率已设置为 ${preset.label}（已按屏幕可用区域自动缩小）。`);
        } else {
          setStatusMessage(`窗口分辨率已设置为 ${preset.label}。`);
        }
      }
    } catch (error) {
      if (!options?.silent) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(`窗口分辨率设置失败：${message}`);
      }
    }
  };

  const applyWindowPreset = async () => {
    await applyWindowPresetById(windowPresetId);
  };

  const applyBestdoriSkinSelection = async (
    selection: SkinSelection,
    persist: boolean,
    announceSuccess = true,
  ) => {
    const normalized = normalizeSkinSelection(selection);
    const sequence = skinApplySeqRef.current + 1;
    skinApplySeqRef.current = sequence;
    const downloadOperationId = `skin-resource-${sequence}`;

    setIsSkinApplying(true);
    startDownloadProgress(downloadOperationId, "正在准备资源快照…");
    const rhythmCatalogKind = isHabahiroRhythmRipName(normalized.rhythmRipName) ? "habahiroRhythm" : "rhythm";
    setStatusMessage(
      `正在加载皮肤：节奏图示 ${formatTypeLabel(rhythmCatalogKind, normalized.rhythmType)}，方向滑键 ${formatTypeLabel("directional", normalized.directionalType)}，节奏图示SE ${formatTypeLabel("rhythmSe", normalized.rhythmSeType)}，方向滑键SE ${formatTypeLabel("directionalSe", normalized.directionalSeType)}，背景 ${formatTypeLabel("bg", normalized.bgType)}，轨道样式 ${formatTypeLabel("field", normalized.fieldType)}，判定样式 ${formatTypeLabel(null, normalized.judgeType)}。`,
    );

    try {
      const catalog = await resourceManager.refreshCatalog("bestdori");
      if (catalog.status === "rejected") {
        throw new Error(`${catalog.failure.capability}: ${catalog.failure.boundary}`);
      }
      const resourceRefs = {
        "skin.rhythm": requireBestdoriRef(normalized.rhythmServer, "noteskin", normalized.rhythmRipName),
        "skin.directional": requireBestdoriRef(normalized.directionalServer, "noteskin", normalized.directionalRipName),
        "skin.rhythm-se": requireBestdoriRef(normalized.rhythmSeServer, "tapseskin", normalized.rhythmSeRipName),
        "skin.directional-se": requireBestdoriRef(normalized.directionalSeServer, "tapseskin", normalized.directionalSeRipName),
        "skin.field": requireBestdoriRef(normalized.fieldSkinServer, "fieldskin", normalized.fieldSkinRipName),
        "skin.background": requireBestdoriRef(normalized.bgSkinServer, "bgskin", normalized.bgSkinRipName),
        "skin.judge": requireBestdoriRef(normalized.judgeSkinServer, "judgeskin", normalized.judgeSkinRipName),
        "skin.common-se": requireBestdoriRef(normalized.rhythmSeServer, "sound-common", "common"),
      } as const;
      const selected = resourceManager.replaceSelection(resourceRefs);
      if (selected.status === "rejected") {
        throw new Error(`${selected.failure.capability}: ${selected.failure.boundary}`);
      }
      const snapshot = await resourceManager.createSnapshot([
        "skin.rhythm",
        "skin.directional",
        "skin.rhythm-se",
        "skin.directional-se",
        "skin.field",
        "skin.background",
        "skin.judge",
        "skin.common-se",
      ]);
      if (snapshot.status === "rejected") {
        throw new Error(`${snapshot.failure.capability}: ${snapshot.failure.boundary}`);
      }
      const lease = await resourceManager.acquireSnapshot(snapshot.value.snapshotId);
      if (lease.status === "rejected") {
        throw new Error(`${lease.failure.capability}: ${lease.failure.boundary}`);
      }
      const nextApplied = await decodeAppliedSkinResources(lease.value, {
        rhythm: normalized.rhythmRipName,
        directional: normalized.directionalRipName,
        judge: normalized.judgeSkinRipName,
      });
      if (skinApplySeqRef.current !== sequence) {
        await nextApplied.dispose();
        return;
      }
      const previousApplied = appliedSkinResourcesRef.current;
      appliedSkinResourcesRef.current = nextApplied;
      setAppliedSkinResources(nextApplied);
      setSkinAssets(nextApplied.note);
      setSkinSelection(normalized);
      setPendingSkinSelection(normalized);
      await previousApplied?.dispose();

      void persist;

      completeDownloadProgress("资源下载完成。");

      if (announceSuccess) {
        setStatusMessage(
          `皮肤已生效：节奏图示 ${formatTypeLabel(rhythmCatalogKind, normalized.rhythmType)}，方向滑键 ${formatTypeLabel("directional", normalized.directionalType)}，节奏图示SE ${formatTypeLabel("rhythmSe", normalized.rhythmSeType)}，方向滑键SE ${formatTypeLabel("directionalSe", normalized.directionalSeType)}，背景 ${formatTypeLabel("bg", normalized.bgType)}，轨道样式 ${formatTypeLabel("field", normalized.fieldType)}，判定样式 ${formatTypeLabel(null, normalized.judgeType)}。`,
        );
      }
    } catch (error) {
      if (skinApplySeqRef.current !== sequence) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      completeDownloadProgress(`下载失败：${message}`, 900);
      setStatusMessage(`皮肤下载失败：${message}`);
    } finally {
      if (skinApplySeqRef.current === sequence) {
        setIsSkinApplying(false);
        currentDownloadOperationIdRef.current = null;
        downloadScopeMapRef.current = new Map();
      }
    }
  };

  useEffect(() => {
    applyBestdoriSkinSelectionRef.current = applyBestdoriSkinSelection;
  }, [applyBestdoriSkinSelection, applyBestdoriSkinSelectionRef]);

  useEffect(() => {
    if (didInitSkinRef.current) {
      return;
    }
    didInitSkinRef.current = true;
    void applyBestdoriSkinSelection(skinSelection, false);
  }, [applyBestdoriSkinSelection, didInitSkinRef, skinSelection]);

  return {
    garupaChartJson,
    garupaChartJsonText,
    isImportJsonModalOpen,
    importJsonModalLevel,
    importJsonText,
    importOfficialChartId,
    importOfficialChartDifficulty,
    importCommunityPostId,
    uploadCommunityPostContent,
    uploadCommunityPostTags,
    importJsonSelectedPath,
    importBestdoriV2SelectedPath,
    setImportJsonText,
    setImportOfficialChartId,
    setImportOfficialChartDifficulty,
    setImportCommunityPostId,
    setUploadCommunityPostContent,
    setUploadCommunityPostTags,
    applyImportJsonText,
    applyImportOfficialChart,
    applyImportCommunityChart,
    applyUploadCommunityChart,
    applyUploadNotGarupaServerChart,
    applyUploadTestServerChart,
    openImportJsonModal,
    closeImportJsonModal,
    openImportJsonModalBestdoriV2Level,
    isExportJsonModalOpen,
    closeExportJsonModal,
    saveExportJsonToSelectedPath,
    exportBestdoriV2ToClipboard,
    undoLastNote,
    redoLastNote,
    clearAllNotes,
    downloadJson,
    triggerJsonImport,
    triggerBestdoriV2Import,
    handleJsonImport,
    handleBestdoriV2Import,
    openMetadataEditor,
    openAppSettings,
    openSkinSettings,
    handleCoverUpload,
    handleAudioUpload,
    handleMvUpload,
    handleStageBackdropUpload,
    applyWindowPreset,
    applyWindowPresetById,
    applyBestdoriSkinSelection,
    downloadProgress,
  };
};



