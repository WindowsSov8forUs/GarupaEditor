import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  type ChartBpmEvent,
  type ChartJson,
  type ChartJsonBpmItem,
  type ChartJsonDirection,
  type ChartJsonSlideConnection,
  type ChartJsonSlideItem,
  type ChartJsonTopLevelNote,
  type ChartMetadata,
  type ChartNote,
  type NoteType,
} from "../../chartCore";
import {
  combineSkinAssets,
  ensureCommonTapSkillSeAsset,
  setRuntimeSeAssets,
  type SeSkinAssets,
  type DirectionalSkinAssets,
  type AnyRhythmSkinAssets,
  type SkinSelection,
} from "../../skinLoader";
import {
  convertBestdoriV2ToCurrentChartJson,
  convertCurrentChartJsonToBestdoriV2,
} from "../../chartFormatConverter";
import {
  isChartUsingHabahiro,
  isChartUsingSpRhythm,
  regressChartWithoutHabahiro,
  regressChartWithoutSpRhythm,
} from "../modeChartRegression";

type ParsedJsonNote = {
  note: ChartNote;
  key: string;
};

type ShiftedBpmItem = {
  beat: number;
  value: number;
};

type AppliedChartJsonSummary = {
  visibleNoteCount: number;
  beatOffset: number;
  regressedSpRhythm: boolean;
  regressedHabahiro: boolean;
};

type ImportJsonModalLevel = "chart" | "bestdori-v2";
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

function isTauriEnvironment(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const tauriWindow = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  if ("__TAURI_INTERNALS__" in tauriWindow || "__TAURI__" in tauriWindow) {
    return true;
  }
  if (typeof window.location?.protocol === "string" && window.location.protocol === "tauri:") {
    return true;
  }
  if (typeof navigator !== "undefined" && /\btauri\b/i.test(navigator.userAgent ?? "")) {
    return true;
  }
  return false;
}

export function useEditorIoAndShortcuts(params: any) {
  const {
    metadata,
    appOptionSettings,
    skinSelection,
    bpmEvents,
    slideChains,
    notes,
    sortBpmEvents,
    sortNotes,
    clearSelectedNotes,
    setStatusMessage,
    openOverlayDialog,
    setNotes,
    setSlideChains,
    setMetadata,
    createId,
    setBpmEvents,
    setToolBpmValue,
    setSingleSelectedNote,
    clearSelectedBpmEvents,
    setSelectedBpmEventId,
    toFinite,
    setPendingSkinSelection,
    applyBestdoriSkinSelectionRef,
    setAudioDurationSec,
    setAudioFileName,
    jsonImportRef,
    sanitizeFileName,
    setIsMetadataEditorOpen,
    setIsAppSettingsOpen,
    setIsSkinSettingsOpen,
    setAudioObjectUrl,
    formatDuration,
    windowPresetId,
    WINDOW_SIZE_PRESETS,
    LogicalSize,
    getCurrentWindow,
    normalizeSkinSelection,
    skinApplySeqRef,
    setSkinAssets,
    setIsSkinApplying,
    formatTypeLabel,
    downloadBestdoriRhythmSkinAssets,
    downloadBestdoriDirectionalSkinAssets,
    downloadBestdoriRhythmSeSkinAssets,
    downloadBestdoriDirectionalSeSkinAssets,
    setSkinSelection,
    writeSkinSelectionToStorage,
    readSkinSelectionFromStorage,
    didInitSkinRef,
    approxEq,
    selectedNoteIds,
    selectedBpmEventIds,
    selectedBpmEventId,
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

  const rhythmSkinAssetsRef = useRef<AnyRhythmSkinAssets | null>(null);
  const directionalSkinAssetsRef = useRef<DirectionalSkinAssets | null>(null);
  const rhythmSeSkinAssetsRef = useRef<SeSkinAssets | null>(null);
  const directionalSeSkinAssetsRef = useRef<SeSkinAssets | null>(null);
  const commonTapSkillSeRef = useRef<string>("");

  const toBeatValue = (value: unknown): number => Number(toFinite(value, 0).toFixed(6));
  const toLaneValue = (value: unknown): number => Number(toFinite(value, 0).toFixed(6));
  const toBpmValue = (value: unknown): number => Number(toFinite(value, metadata.bpm).toFixed(6));
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

  const shiftAndClampBeat = (beat: number, offset: number): number => {
    const shifted = Number((beat - offset).toFixed(6));
    return shifted < 0 ? 0 : shifted;
  };

  const mapDirectionFromInternalType = (type: ChartNote["type"]): ChartJsonDirection | null => {
    if (type === "directional_flick_left") {
      return "Left";
    }
    if (type === "directional_flick_right") {
      return "Right";
    }
    return null;
  };

  const mapTopLevelNoteToJson = (note: ChartNote): ChartJsonTopLevelNote | null => {
    if (note.type === "single") {
      return {
        type: "Single",
        beat: toBeatValue(note.beat),
        lane: toLaneValue(note.lane),
        width: toRhythmWidthValue(note.width),
      };
    }
    if (note.type === "flick") {
      return {
        type: "Flick",
        beat: toBeatValue(note.beat),
        lane: toLaneValue(note.lane),
        width: toRhythmWidthValue(note.width),
      };
    }
    if (note.type === "skill") {
      return {
        type: "Skill",
        beat: toBeatValue(note.beat),
        lane: toLaneValue(note.lane),
        width: toRhythmWidthValue(note.width),
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
      };
    }
    return null;
  };

  const mapSlideConnectionToJson = (note: ChartNote): ChartJsonSlideConnection | null => {
    if (note.type === "hidden") {
      return {
        type: "Hidden",
        beat: toBeatValue(note.beat),
        lane: toLaneValue(note.lane),
        width: toRhythmWidthValue(note.width),
      };
    }
    const topLevel = mapTopLevelNoteToJson(note);
    return topLevel ? (topLevel as ChartJsonSlideConnection) : null;
  };

  const buildExportItemKey = (
    item: ChartJsonSlideConnection | ChartJsonTopLevelNote,
  ): string => {
    if (item.type === "Directional") {
      return buildJsonNoteKey("Directional", item.beat, item.lane, item.width, item.direction);
    }
    return buildJsonNoteKey(item.type, item.beat, item.lane, item.width);
  };

  const buildJsonNoteKey = (
    type: "Single" | "Flick" | "Skill" | "Hidden" | "Directional",
    beat: number,
    lane: number,
    width?: number,
    direction?: ChartJsonDirection,
  ): string => {
    const normalizedBeat = Number(beat.toFixed(6));
    if (type === "Directional") {
      return `${type}|${normalizedBeat}|${lane}|${width ?? 1}|${direction ?? "Left"}`;
    }
    return `${type}|${normalizedBeat}|${lane}|${width ?? 1}`;
  };

  const parseJsonNoteRecord = (
    source: Record<string, unknown>,
    label: string,
    allowHidden: boolean,
  ): ParsedJsonNote => {
    const rawType = source.type;
    if (typeof rawType !== "string") {
      throw new Error(`${label}.type is required`);
    }

    if (rawType === "Directional") {
      const beat = parseBeatNumber(source.beat, `${label}.beat`);
      const lane = parseLaneNumber(source.lane, `${label}.lane`);
      const width = parsePositiveIntegerNumber(source.width, `${label}.width`);
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
        },
        key: buildJsonNoteKey("Directional", beat, lane, width, rawDirection),
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
      },
      key: buildJsonNoteKey(rawType, beat, lane, width),
    };
  };

  const chartJson = useMemo<ChartJson>(() => {
    const sortedNotes = sortNotes(notes as ChartNote[]) as ChartNote[];
    const normalizedSlideChains = (slideChains as Array<{ noteIds: string[] }>) ?? [];
    const noteById = new Map(sortedNotes.map((note) => [note.id, note] as const));
    const slideNoteIdSet = new Set(
      normalizedSlideChains.flatMap((chain: { noteIds: string[] }) =>
        chain.noteIds.filter((id: string) => noteById.has(id)),
      ),
    );

    const bpmItems: ChartJsonBpmItem[] = [
      { type: "BPM", beat: 0, value: toBpmValue(metadata.bpm) },
      ...(sortBpmEvents(bpmEvents as ChartBpmEvent[]) as ChartBpmEvent[])
        .filter((event: ChartBpmEvent) => !approxEq(event.beat, 0))
        .map((event: ChartBpmEvent) => ({
          type: "BPM" as const,
          beat: toBeatValue(event.beat),
          value: toBpmValue(event.bpm),
        })),
    ];

    const slideConnectionKeySet = new Set<string>();
    const slideItems: ChartJsonSlideItem[] = normalizedSlideChains
      .map((chain: { noteIds: string[] }) => {
        const connections = chain.noteIds
          .map((id: string) => noteById.get(id))
          .filter((note: ChartNote | undefined): note is ChartNote => note !== undefined)
          .map((note: ChartNote) => mapSlideConnectionToJson(note))
          .filter((item: ChartJsonSlideConnection | null): item is ChartJsonSlideConnection => item !== null);

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
        };
      })
      .filter((item: ChartJsonSlideItem | null): item is ChartJsonSlideItem => item !== null);

    const topLevelItems: ChartJsonTopLevelNote[] = sortedNotes
      .filter((note) => note.type !== "hidden" && !slideNoteIdSet.has(note.id))
      .map((note) => mapTopLevelNoteToJson(note))
      .filter((item): item is ChartJsonTopLevelNote => item !== null)
      .filter((item) => !slideConnectionKeySet.has(buildExportItemKey(item)));

    return [...bpmItems, ...topLevelItems, ...slideItems];
  }, [approxEq, bpmEvents, metadata.bpm, notes, slideChains, sortBpmEvents, sortNotes]);

  const exportJson = useMemo(() => JSON.stringify(chartJson), [chartJson]);
  const [isImportJsonModalOpen, setIsImportJsonModalOpen] = useState(false);
  const [importJsonModalLevel, setImportJsonModalLevel] = useState<ImportJsonModalLevel>("chart");
  const [importJsonText, setImportJsonText] = useState("");
  const [importBestdoriV2Text, setImportBestdoriV2Text] = useState("");
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
    if (!isTauriEnvironment()) {
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
    clearSelectedNotes();
    setStatusMessage("已清空全部音符。");
  }, [clearSelectedNotes, setNotes, setSlideChains, setStatusMessage]);

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

      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (typeof undoLastOperation === "function") {
          undoLastOperation();
        }
        return;
      }

      if (
        event.ctrlKey &&
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
        event.ctrlKey &&
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
        event.ctrlKey &&
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
        event.ctrlKey &&
        event.shiftKey &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        confirmClearAllNotes();
        return;
      }

      if (
        event.key === "Delete" &&
        (selectedNoteIds.length > 0 || selectedBpmEventIds.length > 0 || selectedBpmEventId !== null)
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

    if (!isTauriEnvironment()) {
      const payload = new Blob([exportJson], { type: "application/json;charset=utf-8" });
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
        jsonText: exportJson,
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
      const bestdori = convertCurrentChartJsonToBestdoriV2(chartJson);
      const bestdoriJsonText = JSON.stringify(bestdori);

      if (isTauriEnvironment()) {
        await writeClipboardText(bestdoriJsonText);
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(bestdoriJsonText);
      } else {
        throw new Error("clipboard API unavailable");
      }

      if (typeof openOverlayDialog === "function") {
        openOverlayDialog({
          tone: "info",
          message: "已导出 Bestdori V2 并写入剪贴板。",
        });
      } else {
        setStatusMessage("已导出 Bestdori V2 到剪贴板。");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (typeof openOverlayDialog === "function") {
        openOverlayDialog({
          tone: "error",
          message: `导出 Bestdori V2 失败：${message}`,
        });
      } else {
        setStatusMessage(`导出 Bestdori V2 失败：${message}`);
      }
    }
  };

  const triggerJsonImport = () => {
    jsonImportRef.current?.click();
  };

  const openImportJsonModal = () => {
    setImportJsonText(exportJson);
    setImportJsonModalLevel("chart");
    setIsImportJsonModalOpen(true);
  };

  const closeImportJsonModal = () => {
    setImportJsonModalLevel("chart");
    setIsImportJsonModalOpen(false);
  };

  const backToImportJsonModalChartLevel = () => {
    setImportJsonModalLevel("chart");
  };

  const openImportJsonModalBestdoriV2Level = () => {
    setImportBestdoriV2Text("");
    setImportJsonModalLevel("bestdori-v2");
  };

  const applyParsedCurrentChartJson = (parsed: unknown): AppliedChartJsonSummary => {
    if (!Array.isArray(parsed)) {
      throw new Error("Chart JSON top-level must be an array.");
    }

    const topLevelParsedNotes: ParsedJsonNote[] = [];
    const slideParsedNotes: ParsedJsonNote[] = [];
    const nextSlideChains: Array<{ id: string; noteIds: string[] }> = [];
    const rawBpmItems: ShiftedBpmItem[] = [];

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
        rawBpmItems.push({ beat, value });
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

        const noteIds: string[] = [];
        rawConnections.forEach((rawConnection, connectionIndex) => {
          if (!isRecord(rawConnection)) {
            throw new Error(`item[${itemIndex}].connections[${connectionIndex}] must be an object`);
          }
          const parsedConnection = parseJsonNoteRecord(
            rawConnection,
            `item[${itemIndex}].connections[${connectionIndex}]`,
            true,
          );
          slideParsedNotes.push(parsedConnection);
          noteIds.push(parsedConnection.note.id);
        });

        nextSlideChains.push({
          id: `slide-${itemIndex}-${createId()}`,
          noteIds,
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
    const shiftedBpmItems = rawBpmItems.map((item) => ({
      beat: shiftAndClampBeat(item.beat, beatOffset),
      value: item.value,
    }));

    for (const parsedNote of topLevelParsedNotes) {
      parsedNote.note.beat = shiftAndClampBeat(parsedNote.note.beat, beatOffset);
    }
    for (const parsedNote of slideParsedNotes) {
      parsedNote.note.beat = shiftAndClampBeat(parsedNote.note.beat, beatOffset);
    }

    const baseBpm = toBpmValue(rawBpmItems[baseBpmIndex].value);
    const nextMetadata: ChartMetadata = {
      ...metadata,
      bpm: baseBpm,
    };

    const nextNotes = sortNotes([
      ...topLevelParsedNotes.map(({ note }) => note),
      ...slideParsedNotes.map(({ note }) => note),
    ]);

    const nextBpmEvents = sortBpmEvents(
      shiftedBpmItems
        .filter((_, index) => index !== baseBpmIndex)
        .filter((item) => !approxEq(item.beat, 0))
        .map((item) => ({
          id: createId(),
          beat: item.beat,
          bpm: item.value,
        } as ChartBpmEvent)),
    );

    const shouldRegressSpRhythmOnImport = appOptionSettings.spRhythmNoteEnabled === false;
    const shouldRegressHabahiroOnImport = appOptionSettings.habahiro === false;
    const nextChartState = { notes: nextNotes, slideChains: nextSlideChains };
    let regressedChartState = nextChartState;
    let regressedSpRhythm = false;
    let regressedHabahiro = false;
    if (shouldRegressSpRhythmOnImport && isChartUsingSpRhythm(regressedChartState)) {
      regressedChartState = regressChartWithoutSpRhythm(regressedChartState);
      regressedSpRhythm = true;
    }
    if (shouldRegressHabahiroOnImport && isChartUsingHabahiro(regressedChartState)) {
      regressedChartState = regressChartWithoutHabahiro(regressedChartState);
      regressedHabahiro = true;
    }
    const importedNotes = sortNotes(regressedChartState.notes);
    const importedSlideChains = regressedChartState.slideChains;

    setMetadata(nextMetadata);
    setNotes(importedNotes);
    setSlideChains(importedSlideChains);
    setBpmEvents(nextBpmEvents);
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
      regressedSpRhythm,
      regressedHabahiro,
    };
  };

  const applyChartImportStatus = (label: string, summary: AppliedChartJsonSummary) => {
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
      const summary = applyParsedCurrentChartJson(parsed);
      applyChartImportStatus("已应用 JSON 文本", summary);
      setImportJsonModalLevel("chart");
      setIsImportJsonModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`应用 JSON 失败：${message}`);
    }
  };

  const applyImportBestdoriV2Text = () => {
    try {
      const parsed: unknown = JSON.parse(importBestdoriV2Text);
      const converted = convertBestdoriV2ToCurrentChartJson(parsed);
      setImportJsonText(JSON.stringify(converted));
      setImportJsonModalLevel("chart");
      setStatusMessage("已将 Bestdori V2 转换为当前谱面 JSON，请在导入页点击“应用”。");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Bestdori V2 转换失败：${message}`);
    }
  };

  const handleJsonImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const summary = applyParsedCurrentChartJson(parsed);
      applyChartImportStatus(`已导入 ${file.name}`, summary);
      setImportJsonModalLevel("chart");
      setIsImportJsonModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`导入失败：${message}`);
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

  const handleCoverUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setMetadata((current: ChartMetadata) => ({ ...current, coverDataUrl: reader.result as string }));
        setStatusMessage("封面已更新。");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAudioUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setAudioObjectUrl((current: string | null) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return objectUrl;
    });
    setAudioFileName(file.name);

    const probe = new Audio(objectUrl);
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) {
        setAudioDurationSec(probe.duration);
        setStatusMessage(`音频已载入：${file.name}（${formatDuration(probe.duration)}）。`);
      } else {
        setAudioDurationSec(0);
      }
    };
    probe.onerror = () => {
      setStatusMessage("音频读取失败，请确认格式。");
    };
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

      let resized = false;
      try {
        await appWindow.setSize(new LogicalSize(preset.width, preset.height));
        resized = true;
      } catch {
        // Fallback for API/runtime differences.
        await appWindow.setSize({
          type: "Logical",
          width: preset.width,
          height: preset.height,
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
        setStatusMessage(`窗口分辨率已设置为 ${preset.label}。`);
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
    const downloadOperationId = `skin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    setIsSkinApplying(true);
    startDownloadProgress(downloadOperationId, "正在准备下载资源…");
    const shouldReloadRhythm =
      rhythmSkinAssetsRef.current === null ||
      normalized.rhythmRipName !== skinSelection.rhythmRipName;
    const shouldReloadDirectional =
      directionalSkinAssetsRef.current === null ||
      normalized.directionalRipName !== skinSelection.directionalRipName;
    const shouldReloadRhythmSe =
      rhythmSeSkinAssetsRef.current === null ||
      normalized.rhythmSeRipName !== skinSelection.rhythmSeRipName;
    const shouldReloadDirectionalSe =
      directionalSeSkinAssetsRef.current === null ||
      normalized.directionalSeRipName !== skinSelection.directionalSeRipName;

    setStatusMessage(
      `正在加载皮肤：节奏图示 ${formatTypeLabel(normalized.rhythmType)}，方向滑键 ${formatTypeLabel(normalized.directionalType)}，节奏图示SE ${formatTypeLabel(normalized.rhythmSeType)}，方向滑键SE ${formatTypeLabel(normalized.directionalSeType)}。`,
    );

    try {
      const [nextRhythm, nextDirectional, nextRhythmSe, nextDirectionalSe, commonTapSkillSe] = await Promise.all([
        shouldReloadRhythm
          ? downloadBestdoriRhythmSkinAssets(normalized, { operationId: downloadOperationId })
          : Promise.resolve(rhythmSkinAssetsRef.current),
        shouldReloadDirectional
          ? downloadBestdoriDirectionalSkinAssets(normalized, { operationId: downloadOperationId })
          : Promise.resolve(directionalSkinAssetsRef.current),
        shouldReloadRhythmSe
          ? downloadBestdoriRhythmSeSkinAssets(normalized, { operationId: downloadOperationId })
          : Promise.resolve(rhythmSeSkinAssetsRef.current),
        shouldReloadDirectionalSe
          ? downloadBestdoriDirectionalSeSkinAssets(normalized, { operationId: downloadOperationId })
          : Promise.resolve(directionalSeSkinAssetsRef.current),
        commonTapSkillSeRef.current
          ? Promise.resolve(commonTapSkillSeRef.current)
          : ensureCommonTapSkillSeAsset({ operationId: downloadOperationId }),
      ]);
      if (skinApplySeqRef.current !== sequence) {
        return;
      }

      if (!nextRhythm || !nextDirectional || !nextRhythmSe || !nextDirectionalSe || !commonTapSkillSe) {
        throw new Error("Skin assets incomplete after split loading.");
      }

      rhythmSkinAssetsRef.current = nextRhythm;
      directionalSkinAssetsRef.current = nextDirectional;
      rhythmSeSkinAssetsRef.current = nextRhythmSe;
      directionalSeSkinAssetsRef.current = nextDirectionalSe;
      commonTapSkillSeRef.current = commonTapSkillSe;
      setRuntimeSeAssets({
        rhythmSESkin: nextRhythmSe,
        directionalSESkin: nextDirectionalSe,
        SE_RHYTHM_TAP_SKILL: commonTapSkillSe,
      });
      setSkinAssets(combineSkinAssets(nextRhythm, nextDirectional));
      setSkinSelection(normalized);
      setPendingSkinSelection(normalized);

      if (persist) {
        writeSkinSelectionToStorage(normalized);
      }

      completeDownloadProgress("资源下载完成。");

      if (announceSuccess) {
        setStatusMessage(
          `皮肤已生效：节奏图示 ${formatTypeLabel(normalized.rhythmType)}，方向滑键 ${formatTypeLabel(normalized.directionalType)}，节奏图示SE ${formatTypeLabel(normalized.rhythmSeType)}，方向滑键SE ${formatTypeLabel(normalized.directionalSeType)}。`,
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
    const initial = readSkinSelectionFromStorage();
    void applyBestdoriSkinSelection(initial, true);
  }, [applyBestdoriSkinSelection, didInitSkinRef, readSkinSelectionFromStorage]);

  return {
    chartJson,
    exportJson,
    isImportJsonModalOpen,
    importJsonModalLevel,
    importJsonText,
    importBestdoriV2Text,
    setImportJsonText,
    setImportBestdoriV2Text,
    applyImportJsonText,
    applyImportBestdoriV2Text,
    openImportJsonModal,
    closeImportJsonModal,
    backToImportJsonModalChartLevel,
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
    handleJsonImport,
    openMetadataEditor,
    openAppSettings,
    openSkinSettings,
    handleCoverUpload,
    handleAudioUpload,
    applyWindowPreset,
    applyWindowPresetById,
    applyBestdoriSkinSelection,
    downloadProgress,
  };
};



