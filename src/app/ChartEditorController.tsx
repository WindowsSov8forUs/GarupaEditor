
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import { ChartEditorLayout } from "../components/editor/ChartEditorLayout";
import {
  BASE_BPM_LINE_ID,
  DEFAULT_SPRITE_ASPECT_RATIO,
  EDITOR_MIN_WIDTH,
  isLastBeatOrderedBpmNegative,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  WORKSPACE_DIVIDER_WIDTH,
  formatEditorNumeric,
  normalizeEditorBpm,
  normalizeBaseBpmForWrite,
  normalizeEventBpmForWrite,
  parseNumericExpression,
  type SlideBuildState,
  type SlideChain,
} from "./editorHelpers";
import { useBoardInteractionActions } from "./hooks/useBoardInteractionActions";
import { useCanvasPlayfieldBackend } from "./hooks/useCanvasPlayfieldBackend";
import { useCanvasRenderResources } from "./hooks/useCanvasRenderResources";
import { useEditorGeometry } from "./hooks/useEditorGeometry";
import { useEditorIoAndShortcuts } from "./hooks/useEditorIoAndShortcuts";
import { useEditorSessionCache } from "./hooks/useEditorSessionCache";
import { useEditorRenderModel } from "./hooks/useEditorRenderModel";
import {
  useLongLineEditorSettings,
  type LongLineCurveType,
  type LongLineDivision,
  type LongLinePrecision,
  type LongLineShape,
} from "./hooks/useLongLineEditorSettings";
import { useLongLineActions } from "./hooks/useLongLineActions";
import { useEditorPointerLifecycle } from "./hooks/useEditorPointerLifecycle";
import { useEditorSelectionActions } from "./hooks/useEditorSelectionActions";
import { usePlayfieldRenderers } from "./hooks/usePlayfieldRenderers";
import { useSelectionAndEditorSync } from "./hooks/useSelectionAndEditorSync";
import { useSidebarResizeState } from "./hooks/useSidebarResizeState";
import { buildSelectionMirrorOffsetMap } from "./slideHiddenMoveOffsets";
import {
  useNotePaletteSpriteRendering,
  usePlayfieldSpriteRendering,
} from "./hooks/useSpriteRenderingHelpers";
import {
  isChartUsingHabahiro,
  isChartUsingSpRhythm,
  regressChartWithoutHabahiro,
  regressChartWithoutSpRhythm,
} from "./modeChartRegression";
import {
  BG_SKIN_TYPES,
  FIELD_SKIN_TYPES,
  JUDGE_SKIN_TYPES,
  DIRECTIONAL_SKIN_TYPES,
  DIRECTIONAL_SE_SKIN_TYPES,
  HABAHIRO_RHYTHM_RIP_NAME,
  HABAHIRO_RHYTHM_SKIN_TYPES,
  HABAHIRO_RHYTHM_TYPE,
  RHYTHM_SKIN_TYPES,
  RHYTHM_SE_SKIN_TYPES,
  downloadBestdoriBgSkinAssets,
  downloadBestdoriFieldSkinAssets,
  downloadBestdoriJudgeSkinAssets,
  downloadBestdoriDirectionalSeSkinAssets,
  downloadBestdoriDirectionalSkinAssets,
  downloadBestdoriRhythmSeSkinAssets,
  downloadBestdoriRhythmSkinAssets,
  formatTypeLabel,
  getRuntimeBgSkinAssets,
  getRuntimeFieldSkinAssets,
  getRuntimeJudgeSkinAssets,
  getRuntimeSeAssets,
  isHabahiroRhythmRipName,
  normalizeSkinSelection,
  projectCanvasRenderResourceRuntimeAssets,
  readSkinSelectionFromStorage,
  resolveHabahiroRhythmRipNameFromType,
  resolveBgSkinRipNameFromType,
  resolveDirectionalSeRipNameFromType,
  resolveDirectionalRipNameFromType,
  resolveFieldSkinRipNameFromType,
  resolveJudgeSkinRipNameFromType,
  resolveRhythmSeRipNameFromType,
  resolveRhythmRipNameFromType,
  writeSkinSelectionToStorage,
  type SeSkinAssets,
  type SkinAssets,
  type SkinSelection,
} from "../skinLoader";
import {
  BEAT_HEIGHT,
  DEFAULT_EDITOR_OPTION_SETTINGS,
  DEFAULT_METADATA,
  DEFAULT_SETTINGS,
  LANE_WIDTH,
  NOTE_SPECS,
  NOTE_TYPES,
  WINDOW_SIZE_PRESETS,
  approxEq,
  beatToSeconds,
  buildBpmTimeline,
  clamp,
  createId,
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
  normalizeMetadata,
  normalizeEditorOptionSettings,
  normalizeNote,
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
  type EditorOptionSettings,
  type ChartSettings,
  type EditorTool,
  type NoteType,
} from "../chartCore";
import defaultCoverImage from "../assets/default-cover.png";
import undoActionIcon from "../assets/icons/undo-action.svg";
import clearActionIcon from "../assets/icons/clear-action.svg";
import applyActionIcon from "../assets/icons/apply-action.svg";
import copyActionIcon from "../assets/icons/copy-action.svg";
import pasteActionIcon from "../assets/icons/paste-action.svg";
import mirrorActionIcon from "../assets/icons/mirror-action.svg";
import "../App.css";
import { type OverlayDialogState } from "../components/OverlayDialogModal";
import type { StaticRenderPayload } from "./staticRenderTypes";
import {
  SIMULATOR_WINDOW_PAYLOAD_EVENT,
  SIMULATOR_WINDOW_READY_EVENT,
  type SimulatorLaunchPayload,
  type SimulatorWindowReadyPayload,
} from "../simulator/launchPayload";

const TIMELINE_REFERENCE_BPM = 120;
const RENDER_BACKEND_MODE =
  String((import.meta as any).env?.VITE_PLAYFIELD_RENDER_BACKEND ?? "canvas").toLowerCase() === "dom"
    ? "dom"
    : "canvas";
const PLAYBACK_SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
const PLAYBACK_SE_POOL_SIZE = 8;
const PLAYBACK_SE_TRIGGER_LEAD_SEC = 0.02;
const PLAYBACK_VIEWPORT_EDGE_TOLERANCE_PX = 8;
const MIRROR_AXIS_LANE = 3;
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

async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  if (!response.ok) {
    throw new Error(`audio fetch failed: ${response.status}`);
  }
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("audio data URL encode failed"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("audio data URL encode failed"));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlobUrl(dataUrl: string): Promise<string> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`mv fetch failed: ${response.status}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
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

type EditorConfigCacheKey = EditorSettingsTool | "longline";
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
  | { type: "rhythm"; width: number }
  | {
    type: "longline";
    shape: LongLineShape;
    curveType: LongLineCurveType | null;
    precision: LongLinePrecision;
    division: LongLineDivision;
    vibration: number;
  };
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
  svEvents: ChartSvEvent[];
};

type CopiedSlideChain = {
  noteIds: string[];
};

type CopiedChartPayload = {
  notes: ChartNote[];
  bpmEvents: ChartBpmEvent[];
  slideChains: CopiedSlideChain[];
  anchorBeat: number;
  anchorLane: number;
  laneAnchorEnabled: boolean;
};

const UNDO_STACK_LIMIT = 200;

type StatusMessageRoute =
  | { channel: "ignore" }
  | { channel: "status"; message: string }
  | { channel: "dialog"; tone: "info" | "warning" | "error"; message: string };

const STATUS_MESSAGE_IGNORE_EXACT = new Set<string>([
  "左键放置音符，右键删除音符。数字键 1-7 切换工具，8 为 BPM。",
  "当前选择无可复制对象。",
  "暂无可粘贴内容，请先复制。",
  "粘贴失败：目标位置已被占用。",
  "当前状态暂不可粘贴。",
  "当前位置不可粘贴。",
  "当前没有可镜像的选中音符。",
  "选中的音符已失效，请重新框选后重试。",
  "已按 lane 3 轴镜像翻转选中音符。",
  "已选中播放工具。左键可开始/停止播放。",
  "已取消播放工具。",
  "已切换到粘贴工具。暂无可粘贴内容，请先复制。",
  "已应用选项设置。",
  "当前 longLine 不可应用样式，请重新选择后重试。",
  "状态已更新。",
  "基础 BPM 必须大于 0。",
  "非基础 BPM 的 Beat 必须大于 0。",
  "非基础 BPM 不能为 0。",
  "已取消 Slide 创建。",
  "已取消 Slide 创建并取消 Slide 工具。",
  "已拖拽移动选中音符。",
  "已更新选中对象 Beat。",
  "已更新选中音符轨道。",
  "已将选中 Slide 节点设为 Hidden。",
  "已删除选中音符。",
  "已删除 BPM 线。",
  "Beat 0 的基础 BPM 线不可删除。",
  "已批量移动选中音符。",
  "框选未命中对象。",
  "Slide 创建中：左键空白追加节点，左键音符进入拖动连接，右键完成。",
  "已选中 Slide 连接段。",
  "已删除全 Hidden 的 Slide 序列。",
  "已分割 Slide 并删除中段 longLine。",
  "已按选中 longLine 分割 Slide 序列。",
  "已应用当前 longLine 样式。",
  "仅可连接到其他 Slide 序列的头部。",
  "已合并序列并切换到拖动连接，可继续从新序列尾部连接。",
  "Slide 拖动连接中：移动经过音符即可追加，松开左键返回追加模式，右键完成。",
  "已删除目标音符。",
  "工具切换为 BPM。",
  "已取消导出。",
  "已将 Bestdori V2 转换为当前谱面 JSON，请在导入页点击“应用”。",
  "封面已更新。",
  "预览窗口已打开。",
]);

const STATUS_MESSAGE_IGNORE_PREFIXES = [
  "已复制 ",
  "已粘贴 ",
  "已导出 ",
  "无法定位鼠标当前位置，粘贴失败。",
  "鼠标不在可视编辑区内，粘贴失败。",
  "已选中 BPM 线：",
  "已将 ",
  "已更新选中 DirectionalFlick 宽度为 ",
  "已设置 DirectionalFlick 默认宽度为 ",
  "已更新选中音符宽度为 ",
  "已设置默认宽度为 ",
  "已更新选中 DirectionalFlick 方向为",
  "已设置 DirectionalFlick 默认方向为",
  "已删除 ",
  "框选选中 ",
  "工具切换为 ",
  "窗口分辨率已设置为 ",
  "正在加载皮肤：",
  "皮肤已生效：",
  "已恢复上次关闭前的编辑缓存",
];

function stripStatusPrefix(message: string, prefix: string): string {
  if (!message.startsWith(prefix)) {
    return message;
  }
  return message.slice(prefix.length).trim();
}

function routeStatusMessage(rawMessage: string): StatusMessageRoute {
  const message = rawMessage.trim();
  if (message.length <= 0) {
    return { channel: "ignore" };
  }

  if (message === "已停止播放。") {
    return { channel: "status", message: "播放中止。" };
  }
  if (message.startsWith("已开始播放：")) {
    return { channel: "status", message: "播放开始。" };
  }
  if (message === "已清空全部音符。") {
    return { channel: "status", message: "谱面已清空。" };
  }

  if (
    message === "粘贴失败：按 Beat 顺序最后一个 BPM 不能为负数。"
    || message === "按 Beat 顺序最后一个 BPM 为负数，已阻止预览。"
    || message === "已阻止：按 Beat 顺序最后一个 BPM 不能为负数。"
  ) {
    return { channel: "dialog", tone: "error", message: "谱面不合法：\n末尾 BPM 不可为负数" };
  }
  if (message.startsWith("音频播放失败，已切换为无音频播放：")) {
    const detail = stripStatusPrefix(message, "音频播放失败，已切换为无音频播放：");
    return { channel: "dialog", tone: "error", message: `音频播放失败：\n${detail}` };
  }
  if (message === "皮肤资源尚未就绪，无法打开预览窗口。") {
    return { channel: "dialog", tone: "info", message: "资源未加载，请稍后再试。" };
  }
  if (message === "预览数据尚未准备完成，请稍后重试。") {
    return { channel: "dialog", tone: "info", message: "数据未完成，请稍后再试。" };
  }
  if (message.startsWith("预览窗口数据发送失败：")) {
    const detail = stripStatusPrefix(message, "预览窗口数据发送失败：");
    return { channel: "dialog", tone: "error", message: `预览数据发送失败：\n${detail}` };
  }
  if (message.startsWith("预览窗口创建失败：")) {
    const detail = stripStatusPrefix(message, "预览窗口创建失败：");
    return { channel: "dialog", tone: "error", message: `预览创建失败：\n${detail}` };
  }
  if (message === "预览窗口握手超时，请重试。") {
    return { channel: "dialog", tone: "error", message };
  }
  if (message.startsWith("预览窗口启动失败：")) {
    const detail = stripStatusPrefix(message, "预览窗口启动失败：");
    return { channel: "dialog", tone: "error", message: `预览启动失败：\n${detail}` };
  }
  if (message.startsWith("播放器窗口创建失败：")) {
    const detail = stripStatusPrefix(message, "播放器窗口创建失败：");
    return { channel: "dialog", tone: "error", message: `播放器窗口创建失败：\n${detail}` };
  }
  if (message.startsWith("播放器窗口启动失败：")) {
    const detail = stripStatusPrefix(message, "播放器窗口启动失败：");
    return { channel: "dialog", tone: "error", message: `播放器窗口启动失败：\n${detail}` };
  }
  if (message.startsWith("导出失败：")) {
    const detail = stripStatusPrefix(message, "导出失败：");
    return { channel: "dialog", tone: "error", message: `导出谱面失败：\n${detail}` };
  }
  if (message.startsWith("已导出到 ")) {
    return { channel: "dialog", tone: "info", message };
  }
  if (message === "已导出 Bestdori V2 到剪贴板。") {
    return { channel: "dialog", tone: "info", message: "已导出谱面为 Bestdori 格式，可直接粘贴。" };
  }
  if (message.startsWith("导出 Bestdori V2 失败：")) {
    const detail = stripStatusPrefix(message, "导出 Bestdori V2 失败：");
    return { channel: "dialog", tone: "error", message: `导出谱面为 Bestdori 格式代码失败：\n${detail}` };
  }
  if (message.startsWith("应用 JSON 失败：")) {
    const detail = stripStatusPrefix(message, "应用 JSON 失败：");
    return { channel: "dialog", tone: "error", message: `导入谱面代码失败：\n${detail}` };
  }
  if (message.startsWith("Bestdori V2 转换失败：")) {
    const detail = stripStatusPrefix(message, "Bestdori V2 转换失败：");
    return { channel: "dialog", tone: "error", message: `转换 Bestdori 格式谱面代码失败：\n${detail}` };
  }
  if (message.startsWith("官方谱面导入失败：")) {
    const detail = stripStatusPrefix(message, "官方谱面导入失败：");
    return { channel: "dialog", tone: "error", message: `导入官方谱面失败：\n${detail}` };
  }
  if (message.startsWith("导入失败：")) {
    const detail = stripStatusPrefix(message, "导入失败：");
    return { channel: "dialog", tone: "error", message: `导入谱面失败：\n${detail}` };
  }
  if (message === "音频读取失败，请确认格式。") {
    return { channel: "dialog", tone: "error", message };
  }
  if (message === "未找到可用分辨率预设。") {
    return { channel: "dialog", tone: "info", message };
  }
  if (message === "当前窗口不可用，无法调整分辨率。") {
    return { channel: "dialog", tone: "info", message };
  }
  if (message.startsWith("窗口分辨率设置失败：")) {
    const detail = stripStatusPrefix(message, "窗口分辨率设置失败：");
    return { channel: "dialog", tone: "error", message: `窗口分辨率设置失败：\n${detail}` };
  }
  if (message.startsWith("皮肤下载失败：")) {
    const detail = stripStatusPrefix(message, "皮肤下载失败：");
    return { channel: "dialog", tone: "error", message: `皮肤下载失败：\n${detail}` };
  }
  if (message.startsWith("会话缓存恢复失败：")) {
    const detail = stripStatusPrefix(message, "会话缓存恢复失败：");
    return { channel: "dialog", tone: "error", message: `会话缓存恢复失败：\n${detail}` };
  }
  if (message.startsWith("音频缓存处理失败：")) {
    const detail = stripStatusPrefix(message, "音频缓存处理失败：");
    return { channel: "dialog", tone: "error", message: `音频缓存处理失败：\n${detail}` };
  }
  if (message.startsWith("会话缓存保存失败：")) {
    const detail = stripStatusPrefix(message, "会话缓存保存失败：");
    return { channel: "dialog", tone: "error", message: `会话缓存保存失败：\n${detail}` };
  }

  if (STATUS_MESSAGE_IGNORE_EXACT.has(message)) {
    return { channel: "ignore" };
  }
  if (message.includes("个可见音符")) {
    return { channel: "ignore" };
  }
  for (const prefix of STATUS_MESSAGE_IGNORE_PREFIXES) {
    if (message.startsWith(prefix)) {
      return { channel: "ignore" };
    }
  }

  return { channel: "status", message };
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

function ChartEditorController() {
  const [metadata, setMetadataState] = useState<ChartMetadata>(DEFAULT_METADATA);
  const [settings, setSettingsState] = useState<ChartSettings>(DEFAULT_SETTINGS);
  const [appOptionSettings, setAppOptionSettings] = useState<EditorOptionSettings>(DEFAULT_EDITOR_OPTION_SETTINGS);
  const [notes, setNotesState] = useState<ChartNote[]>([]);
  const [slideChains, setSlideChainsState] = useState<SlideChain[]>([]);
  const [bpmEvents, setBpmEventsState] = useState<ChartBpmEvent[]>([]);
  const [svEvents, setSvEventsState] = useState<ChartSvEvent[]>([]);
  const [tool, setTool] = useState<EditorTool>("single");
  const [isToolArmed, setIsToolArmed] = useState(true);
  const toolDurationBeats = 1;
  const toolLaneShift = 1;
  const [toolDirectionalWidth, setToolDirectionalWidth] = useState(1);
  const [toolRhythmWidth, setToolRhythmWidth] = useState(1);
  const [toolLane, setToolLane] = useState(0);
  const [useToolLaneOverride, setUseToolLaneOverride] = useState(false);
  const [toolBpmValue, setToolBpmValue] = useState(DEFAULT_METADATA.bpm);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [selectedBpmEventIds, setSelectedBpmEventIds] = useState<string[]>([]);
  const [selectedBpmEventId, setSelectedBpmEventId] = useState<string | null>(null);
  const [selectedLongLineSegmentId, setSelectedLongLineSegmentId] = useState<string | null>(null);
  const [copiedChartPayload, setCopiedChartPayload] = useState<CopiedChartPayload | null>(null);
  const [cursorPreview, setCursorPreviewState] = useState<CursorPreviewState | null>(null);
  const [isPlayToolSelected, setIsPlayToolSelected] = useState(false);
  const [isPlaybackPlaying, setIsPlaybackPlaying] = useState(false);
  const [playbackSpeedIndex, setPlaybackSpeedIndex] = useState(() => PLAYBACK_SPEED_OPTIONS.indexOf(1));
  const [playbackVolumePercent, setPlaybackVolumePercent] = useState(100);
  const [playbackLinePositionPercent, setPlaybackLinePositionPercent] = useState(0);
  const [isPlaybackFollowEnabled, setIsPlaybackFollowEnabledState] = useState(true);
  const [selectionDrag, setSelectionDrag] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isDragging: boolean;
  } | null>(null);

  const [statusMessage, setStatusMessageState] = useState("");
  const [previewLoadingProgress, setPreviewLoadingProgress] = useState<LoadingProgressState>({
    visible: false,
    blocking: false,
    percent: 0,
    message: "",
    logs: [],
  });
  const previewLoadingHideTimerRef = useRef<number | null>(null);

  const [isMetadataEditorOpen, setIsMetadataEditorOpen] = useState(false);
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

  const setStatusMessage = useCallback((nextMessage: string) => {
    const routed = routeStatusMessage(nextMessage);
    if (routed.channel === "ignore") {
      return;
    }
    if (routed.channel === "dialog") {
      openOverlayDialog({
        tone: routed.tone,
        message: routed.message,
      });
      return;
    }
    setStatusMessageState(routed.message);
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
  const svEventsRef = useRef(svEvents);
  const undoStackRef = useRef<EditorUndoSnapshot[]>([]);
  const redoStackRef = useRef<EditorUndoSnapshot[]>([]);
  const isUndoRestoringRef = useRef(false);
  const undoCaptureLockedRef = useRef(false);
  const undoCaptureUnlockScheduledRef = useRef(false);
  const [undoVersion, setUndoVersion] = useState(0);

  useEffect(() => {
    notesRef.current = notes;
    slideChainsRef.current = slideChains;
    bpmEventsRef.current = bpmEvents;
    svEventsRef.current = svEvents;
  }, [bpmEvents, notes, slideChains, svEvents]);

  const cloneUndoSnapshot = useCallback((snapshot: EditorUndoSnapshot): EditorUndoSnapshot => ({
    notes: snapshot.notes.map((note) => ({ ...note })),
    slideChains: snapshot.slideChains.map((chain) => ({ ...chain, noteIds: [...chain.noteIds] })),
    bpmEvents: snapshot.bpmEvents.map((event) => ({ ...event })),
    svEvents: snapshot.svEvents.map((event) => ({ ...event })),
  }), []);

  const buildCurrentUndoSnapshot = useCallback((): EditorUndoSnapshot => (
    cloneUndoSnapshot({
      notes: notesRef.current,
      slideChains: slideChainsRef.current,
      bpmEvents: bpmEventsRef.current,
      svEvents: svEventsRef.current,
    })
  ), [cloneUndoSnapshot]);

  const unlockUndoCaptureInMicrotask = useCallback(() => {
    if (undoCaptureUnlockScheduledRef.current) {
      return;
    }
    undoCaptureUnlockScheduledRef.current = true;
    queueMicrotask(() => {
      undoCaptureUnlockScheduledRef.current = false;
      undoCaptureLockedRef.current = false;
    });
  }, []);

  const pushUndoSnapshotIfNeeded = useCallback(() => {
    if (isUndoRestoringRef.current || undoCaptureLockedRef.current) {
      return;
    }
    const nextSnapshot = buildCurrentUndoSnapshot();
    const stack = undoStackRef.current;
    stack.push(nextSnapshot);
    if (stack.length > UNDO_STACK_LIMIT) {
      stack.splice(0, stack.length - UNDO_STACK_LIMIT);
    }
    if (redoStackRef.current.length > 0) {
      redoStackRef.current = [];
    }
    undoCaptureLockedRef.current = true;
    unlockUndoCaptureInMicrotask();
    setUndoVersion((previous) => previous + 1);
  }, [buildCurrentUndoSnapshot, unlockUndoCaptureInMicrotask]);

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
    setNotesState((previous) => {
      const next = resolveStateAction(nextAction, previous);
      if (!Object.is(previous, next)) {
        pushUndoSnapshotIfNeeded();
      }
      return next;
    });
  }, [pushUndoSnapshotIfNeeded, resolveStateAction]);

  const setSlideChains = useCallback((nextAction: SetStateAction<SlideChain[]>) => {
    setSlideChainsState((previous) => {
      const next = resolveStateAction(nextAction, previous);
      if (!Object.is(previous, next)) {
        pushUndoSnapshotIfNeeded();
      }
      return next;
    });
  }, [pushUndoSnapshotIfNeeded, resolveStateAction]);

  const setBpmEvents = useCallback((nextAction: SetStateAction<ChartBpmEvent[]>) => {
    setBpmEventsState((previous) => {
      const next = resolveStateAction(nextAction, previous);
      if (!Object.is(previous, next)) {
        pushUndoSnapshotIfNeeded();
      }
      return next;
    });
  }, [pushUndoSnapshotIfNeeded, resolveStateAction]);

  const setSvEvents = useCallback((nextAction: SetStateAction<ChartSvEvent[]>) => {
    setSvEventsState((previous) => {
      const next = resolveStateAction(nextAction, previous);
      if (!Object.is(previous, next)) {
        pushUndoSnapshotIfNeeded();
      }
      return next;
    });
  }, [pushUndoSnapshotIfNeeded, resolveStateAction]);

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
    const snapshot = stack.pop();
    if (!snapshot) {
      setStatusMessage("暂无可撤回操作。");
      return false;
    }

    isUndoRestoringRef.current = true;
    undoCaptureLockedRef.current = true;
    const currentSnapshot = buildCurrentUndoSnapshot();
    redoStackRef.current.push(currentSnapshot);
    if (redoStackRef.current.length > UNDO_STACK_LIMIT) {
      redoStackRef.current.splice(0, redoStackRef.current.length - UNDO_STACK_LIMIT);
    }
    setNotesState(snapshot.notes.map((note) => ({ ...note })));
    setSlideChainsState(snapshot.slideChains.map((chain) => ({ ...chain, noteIds: [...chain.noteIds] })));
    setBpmEventsState(snapshot.bpmEvents.map((event) => ({ ...event })));
    setSvEventsState(snapshot.svEvents.map((event) => ({ ...event })));
    setSelectedNoteIds([]);
    setSelectedBpmEventIds([]);
    setSelectedBpmEventId(null);
    setSelectedLongLineSegmentId(null);
    setStatusMessage("已撤回上一个操作。");
    setUndoVersion((previous) => previous + 1);

    queueMicrotask(() => {
      isUndoRestoringRef.current = false;
      undoCaptureLockedRef.current = false;
    });
    return true;
  }, [buildCurrentUndoSnapshot, setStatusMessage]);

  const redoLastOperation = useCallback((): boolean => {
    const stack = redoStackRef.current;
    const snapshot = stack.pop();
    if (!snapshot) {
      setStatusMessage("暂无可重做操作。");
      return false;
    }

    isUndoRestoringRef.current = true;
    undoCaptureLockedRef.current = true;
    const currentSnapshot = buildCurrentUndoSnapshot();
    undoStackRef.current.push(currentSnapshot);
    if (undoStackRef.current.length > UNDO_STACK_LIMIT) {
      undoStackRef.current.splice(0, undoStackRef.current.length - UNDO_STACK_LIMIT);
    }
    setNotesState(snapshot.notes.map((note) => ({ ...note })));
    setSlideChainsState(snapshot.slideChains.map((chain) => ({ ...chain, noteIds: [...chain.noteIds] })));
    setBpmEventsState(snapshot.bpmEvents.map((event) => ({ ...event })));
    setSvEventsState(snapshot.svEvents.map((event) => ({ ...event })));
    setSelectedNoteIds([]);
    setSelectedBpmEventIds([]);
    setSelectedBpmEventId(null);
    setSelectedLongLineSegmentId(null);
    setStatusMessage("已重做上一个操作。");
    setUndoVersion((previous) => previous + 1);

    queueMicrotask(() => {
      isUndoRestoringRef.current = false;
      undoCaptureLockedRef.current = false;
    });
    return true;
  }, [buildCurrentUndoSnapshot, setStatusMessage]);

  const [audioFileName, setAudioFileName] = useState("");
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);
  const [isCoverLoadFailed, setIsCoverLoadFailed] = useState(false);
  const [beatInputText, setBeatInputText] = useState("");
  const [bpmInputText, setBpmInputText] = useState("");
  const [laneInputText, setLaneInputText] = useState("");
  const [widthInputText, setWidthInputText] = useState("");
  const [slideVibrationInputText, setSlideVibrationInputText] = useState("");
  const [selectionMovePreview, setSelectionMovePreview] = useState<{
    laneDelta: number;
    beatDelta: number;
    isDragging: boolean;
  } | null>(null);
  const [slideBuildState, setSlideBuildState] = useState<SlideBuildState | null>(null);
  const [slideBuildCursor, setSlideBuildCursor] = useState<{ x: number; y: number } | null>(null);
  const beatInputEditingRef = useRef(false);
  const bpmInputEditingRef = useRef(false);
  const laneInputEditingRef = useRef(false);
  const widthInputEditingRef = useRef(false);
  const slideVibrationInputEditingRef = useRef(false);

  const [windowPresetId, setWindowPresetId] = useState(WINDOW_SIZE_PRESETS[1].id);
  const [playbackWindowPresetId, setPlaybackWindowPresetId] = useState(WINDOW_SIZE_PRESETS[0].id);
  const [playbackFps, setPlaybackFps] = useState(60);
  const [playbackMvMode, setPlaybackMvMode] = useState(false);
  const [playbackMvAlphaPercent, setPlaybackMvAlphaPercent] = useState(100);
  const [skinSelection, setSkinSelection] = useState<SkinSelection>(() => readSkinSelectionFromStorage());
  const [pendingSkinSelection, setPendingSkinSelection] = useState<SkinSelection>(() =>
    readSkinSelectionFromStorage(),
  );
  const [skinAssets, setSkinAssets] = useState<SkinAssets | null>(null);
  const [isSkinApplying, setIsSkinApplying] = useState(false);
  const [spriteAspectRatios, setSpriteAspectRatios] = useState<Record<string, number>>({});
  const isSkinReady = skinAssets !== null;

  const playfieldRef = useRef<HTMLDivElement | null>(null);
  const playfieldBoardRef = useRef<HTMLDivElement | null>(null);
  const playfieldTrackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playfieldNoteCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playfieldPlaybackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackTickRafRef = useRef<number | null>(null);
  const playbackTickLastNowMsRef = useRef<number | null>(null);
  const playbackViewportSyncStampRef = useRef(0);
  const playbackDurationLimitSecRef = useRef(0);
  const playbackHasAudioTrackRef = useRef(false);
  const playbackNowSecRef = useRef(0);
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
  const workspaceRef = useRef<HTMLElement | null>(null);
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
  const didInitSkinRef = useRef(false);
  const applyBestdoriSkinSelectionRef = useRef<any>(async () => {});
  const lastStandardRhythmSkinRef = useRef<Pick<SkinSelection, "rhythmType" | "rhythmRipName"> | null>(null);
  const syncingHabahiroSkinRef = useRef(false);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const viewBottomTimeSecRef = useRef<number | null>(null);
  const didInitTimelineScrollRef = useRef(false);
  const editorConfigCacheRef = useRef<Partial<Record<EditorConfigCacheKey, EditorConfigCacheValue>>>({});
  const lastEditorConfigTypeRef = useRef<EditorConfigCacheKey | null>(null);
  const isApplyingEditorCacheRef = useRef(false);
  useEffect(() => {
    activeToolRef.current = tool;
  }, [tool]);
  const setCursorPreview = useCallback((next: CursorPreviewState | null) => {
    canvasCursorPreviewRef.current = next;
    const shouldSyncCanvasState = activeToolRef.current === "paste";
    if (RENDER_BACKEND_MODE === "canvas" && !shouldSyncCanvasState) {
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
    return () => {
      if (audioObjectUrl) {
        URL.revokeObjectURL(audioObjectUrl);
      }
    };
  }, [audioObjectUrl]);

  useEffect(() => {
    setIsCoverLoadFailed(false);
  }, [metadata.coverDataUrl]);

  useEffect(() => {
    setMetadata((current) => {
      if (current.title !== "Untitled Song") {
        return current;
      }
      return { ...current, title: "Untitled" };
    });
  }, []);

  const { sidebarWidth, getSidebarResizeBounds } = useSidebarResizeState({
    workspaceRef,
    sidebarResizeRef,
    clamp,
    SIDEBAR_MIN_WIDTH,
    SIDEBAR_MAX_WIDTH,
    WORKSPACE_DIVIDER_WIDTH,
    EDITOR_MIN_WIDTH,
  });

  const laneValues = useMemo(() => getLaneValues(settings.laneCount), [settings.laneCount]);
  const laneMin = laneValues[0];
  const beatsPerMeasure = normalizePositiveInt(settings.timeSignatureNumerator, 4);
  const beatDivision = normalizePositiveInt(settings.timeSignatureDenominator, 4);
  const beatStep = 1 / beatDivision;
  const noteVisualScale = clamp(appOptionSettings.rhythmNoteSizePercent / 100, 0.1, 2);
  const longLineOpacityScale = clamp(appOptionSettings.longLineBrightnessPercent / 100, 0.1, 1);
  const verticalScale = clamp(appOptionSettings.verticalScalePercent / 100, 0.5, 2);
  const noteSeVolumeScale = clamp(appOptionSettings.noteSeVolumePercent / 100, 0, 1);
  const timelinePixelsPerSecond = (BEAT_HEIGHT * verticalScale * TIMELINE_REFERENCE_BPM) / 60;
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
  const trackPlayableBeats = Math.max(0, totalBeats - beatsPerMeasure);
  const trackPlayableDurationSec = useMemo(
    () => beatToSeconds(trackPlayableBeats, bpmTimeline),
    [bpmTimeline, trackPlayableBeats],
  );
  const hasUploadedAudio = Boolean(audioObjectUrl);
  const playbackDurationSec = Math.max(0, Number(Math.max(audioDurationSec, totalDurationSec).toFixed(6)));
  const playbackCeilingSec = hasUploadedAudio ? playbackDurationSec : trackPlayableDurationSec;
  const currentPlaybackSpeed = PLAYBACK_SPEED_OPTIONS[Math.max(0, playbackSpeedIndex)] ?? 1;
  const playbackTotalLabel = hasUploadedAudio ? formatDuration(playbackDurationSec) : "?";
  const playbackSpeedLabel = `${Number(currentPlaybackSpeed.toFixed(2))}x`;
  const playbackVolumeLabel = `${Math.round(playbackVolumePercent)}`;
  const playbackPositionLabel = `${Math.round(playbackLinePositionPercent)}%`;
  const getPlaybackNowTimeSec = useCallback(() => playbackNowSecRef.current, []);
  const getPlaybackNowLabel = useCallback(
    () => formatDuration(playbackNowSecRef.current),
    [formatDuration],
  );
  useEffect(() => {
    playbackLineModeRef.current = playbackLineMode;
  }, [playbackLineMode]);
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note] as const)), [notes]);
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
  const selectedBpmEventIdSet = useMemo(() => new Set(selectedBpmEventIds), [selectedBpmEventIds]);
  const selectedNotes = useMemo(
    () => notes.filter((note) => selectedNoteIdSet.has(note.id)),
    [notes, selectedNoteIdSet],
  );
  const selectedBpmEvents = useMemo(
    () => bpmEvents.filter((event) => selectedBpmEventIdSet.has(event.id)),
    [bpmEvents, selectedBpmEventIdSet],
  );
  const buildCopiedChartPayload = useCallback(
    (noteIds: string[], bpmIds: string[]): CopiedChartPayload | null => {
      const selectedNoteIdSet = new Set(noteIds);
      const selectedBpmIdSet = new Set(bpmIds);
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
            copiedNoteById.set(id, { ...note });
          }
          if (segmentIds.length >= 2) {
            copiedChains.push({ noteIds: [...segmentIds] });
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
        copiedNoteById.set(id, { ...note });
      }

      const copiedNotes = sortNotes(Array.from(copiedNoteById.values()));
      const copiedBpmEvents = sortBpmEvents(
        bpmEvents
          .filter((event) => selectedBpmIdSet.has(event.id))
          .map((event) => ({ ...event })),
      );
      if (copiedNotes.length === 0 && copiedBpmEvents.length === 0) {
        return null;
      }

      const beatValues = [
        ...copiedNotes.map((note) => note.beat),
        ...copiedBpmEvents.map((event) => event.beat),
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
        slideChains: copiedChains,
        anchorBeat,
        anchorLane,
        laneAnchorEnabled,
      };
    },
    [approxEq, bpmEvents, noteById, slideChains, sortBpmEvents, sortNotes],
  );
  const copySelectionToClipboardPayload = useCallback(
    (noteIds: string[], bpmIds: string[]) => {
      const payload = buildCopiedChartPayload(noteIds, bpmIds);
      if (!payload) {
        setStatusMessage("当前选择无可复制对象。");
        return;
      }
      setCopiedChartPayload(payload);

      const visibleNoteCount = payload.notes.reduce(
        (count, note) => (note.type === "hidden" ? count : count + 1),
        0,
      );
      const hiddenNoteCount = payload.notes.length - visibleNoteCount;
      const slideSegmentCount = payload.slideChains.length;
      const hiddenLabel = hiddenNoteCount > 0 ? ` + ${hiddenNoteCount} Hidden` : "";
      const slideLabel = slideSegmentCount > 0 ? `，${slideSegmentCount} 段 Slide` : "";
      setStatusMessage(
        `已复制 ${visibleNoteCount}${hiddenLabel} 个音符，${payload.bpmEvents.length} 条 BPM${slideLabel}。`,
      );
    },
    [buildCopiedChartPayload, setStatusMessage],
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
      const notePositionKey = (lane: number, beat: number) => `${lane.toFixed(6)}|${beat.toFixed(6)}`;
      const sourceToPastedId = new Map<string, string>();
      const existingNoteIdByPosition = new Map<string, string>();
      for (const note of notesRef.current) {
        existingNoteIdByPosition.set(notePositionKey(note.lane, note.beat), note.id);
      }
      const overlappedExistingNoteIds = new Set<string>();
      const pastedPositionKeys = new Set<string>();
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
          },
          settings,
        );
        if (!normalized) {
          continue;
        }
        const positionKey = notePositionKey(normalized.lane, normalized.beat);
        if (pastedPositionKeys.has(positionKey)) {
          continue;
        }
        pastedPositionKeys.add(positionKey);
        const overlappedExistingId = existingNoteIdByPosition.get(positionKey);
        if (typeof overlappedExistingId === "string" && overlappedExistingId.length > 0) {
          overlappedExistingNoteIds.add(overlappedExistingId);
        }
        sourceToPastedId.set(source.id, normalized.id);
        pastedNotes.push(normalized);
      }

      const pastedSlideChains = copiedChartPayload.slideChains
        .map((chain) => {
          const noteIds = chain.noteIds
            .map((id) => sourceToPastedId.get(id))
            .filter((id): id is string => typeof id === "string");
          if (noteIds.length < 2) {
            return null;
          }
          return {
            id: createId(),
            noteIds,
          };
        })
        .filter((chain): chain is SlideChain => chain !== null);

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
          setStatusMessage("粘贴失败：按 Beat 顺序最后一个 BPM 不能为负数。");
          return;
        }
      }

      if (pastedNotes.length === 0 && pastedSlideChains.length === 0 && pastedBpmEvents.length === 0) {
        return;
      }

      if (pastedNotes.length > 0 || overlappedExistingNoteIds.size > 0) {
        setNotes((previous) => {
          const remainedNotes =
            overlappedExistingNoteIds.size > 0
              ? previous.filter((note) => !overlappedExistingNoteIds.has(note.id))
              : previous;
          return sortNotes([...remainedNotes, ...pastedNotes]);
        });
      }
      if (overlappedExistingNoteIds.size > 0) {
        setSlideChains((previous) =>
          previous
            .map((chain) => ({
              ...chain,
              noteIds: chain.noteIds.filter((id) => !overlappedExistingNoteIds.has(id)),
            }))
            .filter((chain) => chain.noteIds.length >= 2),
        );
      }
      if (pastedSlideChains.length > 0) {
        setSlideChains((previous) => [...previous, ...pastedSlideChains]);
      }
      if (pastedBpmEvents.length > 0) {
        setBpmEvents((previous) => sortBpmEvents([...previous, ...pastedBpmEvents]));
      }

      const pastedVisibleNoteIds = pastedNotes
        .filter((note) => note.type !== "hidden")
        .map((note) => note.id);
      setSelectedNoteIds(pastedVisibleNoteIds);
      setSelectedBpmEventIds(pastedBpmEvents.map((event) => event.id));
      setSelectedBpmEventId(pastedBpmEvents[0]?.id ?? null);
      setSelectedLongLineSegmentId(null);

      const visibleNoteCount = pastedNotes.reduce((count, note) => (note.type === "hidden" ? count : count + 1), 0);
      const hiddenNoteCount = pastedNotes.length - visibleNoteCount;
      const hiddenLabel = hiddenNoteCount > 0 ? ` + ${hiddenNoteCount} Hidden` : "";
      setStatusMessage(
        `已粘贴 ${visibleNoteCount}${hiddenLabel} 个音符，${pastedBpmEvents.length} 条 BPM。`,
      );
    },
    [
      beatDivision,
      copiedChartPayload,
      createId,
      approxEq,
      metadata.bpm,
      normalizeBaseBpmForWrite,
      normalizeBpmEvent,
      normalizeEventBpmForWrite,
      isLastBeatOrderedBpmNegative,
      normalizeNote,
      setNotes,
      setBpmEvents,
      setSelectedBpmEventId,
      setSelectedBpmEventIds,
      setSelectedLongLineSegmentId,
      setSelectedNoteIds,
      setSlideChains,
      setStatusMessage,
      settings,
      sortBpmEvents,
      sortNotes,
    ],
  );
  const handleSelectionDragCompletedForCopyTool = useCallback(
    (payload: { noteIds: string[]; bpmIds: string[] }) => {
      if (!isToolArmed || tool !== "copy") {
        return;
      }
      copySelectionToClipboardPayload(payload.noteIds, payload.bpmIds);
    },
    [copySelectionToClipboardPayload, isToolArmed, tool],
  );
  const copyCurrentSelectionByShortcut = useCallback(() => {
    const bpmIds =
      selectedBpmEventIds.length > 0
        ? selectedBpmEventIds
        : (
          selectedBpmEventId && selectedBpmEventId !== BASE_BPM_LINE_ID
            ? [selectedBpmEventId]
            : []
        );
    copySelectionToClipboardPayload(selectedNoteIds, bpmIds);
  }, [
    BASE_BPM_LINE_ID,
    copySelectionToClipboardPayload,
    selectedBpmEventId,
    selectedBpmEventIds,
    selectedNoteIds,
  ]);
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
  const selectedBpmEventCount = selectedBpmEventIds.length;
  const hasNoteSelection = selectedNoteCount > 0;
  const hasOffsetSelection = hasNoteSelection || selectedBpmEventCount > 0;
  const minSelectedBeat = useMemo(() => {
    const beats: number[] = [];
    for (const note of selectedNotes) {
      beats.push(note.beat);
    }
    for (const event of selectedBpmEvents) {
      beats.push(event.beat);
    }
    if (selectedBpmEventId === BASE_BPM_LINE_ID) {
      beats.push(0);
    }
    if (beats.length === 0) {
      return 0;
    }
    return beats.reduce((minValue, beat) => Math.min(minValue, beat), beats[0]);
  }, [selectedBpmEventId, selectedBpmEvents, selectedNotes]);
  const minSelectedLane = selectedNotes.length > 0
    ? selectedNotes.reduce((minValue, note) => Math.min(minValue, note.lane), selectedNotes[0].lane)
    : 0;
  const coverImageSrc = metadata.coverDataUrl && !isCoverLoadFailed
    ? metadata.coverDataUrl
    : defaultCoverImage;
  const selectedBpmEvent = useMemo(
    () => {
      if (selectedBpmEventId === BASE_BPM_LINE_ID) {
        return {
          id: BASE_BPM_LINE_ID,
          beat: 0,
          bpm: metadata.bpm,
        };
      }
      return bpmEvents.find((event) => event.id === selectedBpmEventId) ?? null;
    },
    [bpmEvents, metadata.bpm, selectedBpmEventId],
  );
  const isBaseBpmSelected = selectedBpmEventId === BASE_BPM_LINE_ID;

  const isEditingPlacedBpm = selectedBpmEvent !== null;
  const isEditingPlacedObject = hasNoteSelection || isEditingPlacedBpm;
  const hasLongLineSelection = selectedLongLineSegmentId !== null;
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
  const {
    slideShape,
    slideCurveType,
    slidePrecision,
    slideDivision,
    slideVibration,
    isSlideCurveTypeDisabled,
    isSlideDivisionDisabled,
    setSlideShape,
    setSlideCurveType,
    stepSlidePrecision,
    stepSlideDivision,
    setSlideSettings,
    setSlideVibrationValue,
    stepSlideVibration,
    canStepSlidePrecisionDown,
    canStepSlidePrecisionUp,
    canStepSlideDivisionDown,
    canStepSlideDivisionUp,
  } = useLongLineEditorSettings(selectedLongLineSegmentId);
  const activeSettingsType: EditorSettingsTool | null = selectedBpmEvent
    ? "bpm"
    : selectedNote
    ? selectedNote.type
    : (
      isToolArmed && (tool === "bpm" || isNoteTool(tool))
        ? tool
        : null
    );
  const isHabahiroEnabled = appOptionSettings.habahiro === true;
  const isDirectionalToolSettings =
    !hasOffsetSelection &&
    !hasLongLineSelection &&
    !isEditingPlacedBpm &&
    (activeSettingsType === "directional_flick_left" || activeSettingsType === "directional_flick_right");
  const hasDirectionalNoteSelection =
    selectedNotes.length > 0 && selectedNotes.every((note) => isDirectionalNoteType(note.type));
  const isRhythmWidthToolSettings =
    isHabahiroEnabled &&
    !hasOffsetSelection &&
    !hasLongLineSelection &&
    !isEditingPlacedBpm &&
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
    !hasLongLineSelection &&
    (hasOffsetSelection || isEditingPlacedBpm || (activeSettingsType !== null && activeSettingsType !== "slide"));
  const showLaneSetting =
    hasNoteSelection ||
    (!hasLongLineSelection &&
      !isEditingPlacedBpm &&
      activeSettingsType !== null &&
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
  const showBpmSetting = !hasLongLineSelection && !hasNoteSelection && activeSettingsType === "bpm";
  const showSlideSegmentSetting =
    appOptionSettings.spRhythmNoteEnabled
    && hasLongLineSelection
    && !hasOffsetSelection
    && !showBpmSetting;
  const hideSettingsPanel =
    (hasLongLineSelection && !appOptionSettings.spRhythmNoteEnabled) ||
    (
      !hasOffsetSelection &&
      !hasLongLineSelection &&
      !isEditingPlacedBpm &&
      (!isToolArmed || tool === "slide" || tool === "copy" || tool === "paste")
    );
  const isBeatSettingLocked = hasOffsetSelection ? false : (!isEditingPlacedObject || isBaseBpmSelected);
  const isLaneSettingLocked = hasNoteSelection ? false : !isEditingPlacedObject;

  const activeBeatValue = hasOffsetSelection
    ? minSelectedBeat
    : isEditingPlacedBpm
    ? (selectedBpmEvent?.beat ?? 0)
    : 0;
  const activeBpmValue = isEditingPlacedBpm ? (selectedBpmEvent?.bpm ?? toolBpmValue) : toolBpmValue;
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

  const formatSlideVibrationText = useCallback((value: number): string => {
    const normalized = Number(value.toFixed(6));
    if (Object.is(normalized, -0)) {
      return "0";
    }
    return String(normalized);
  }, []);

  const commitSlideVibrationInput = useCallback(() => {
    const parsed = parseNumericExpression(slideVibrationInputText);
    if (parsed === null) {
      setSlideVibrationInputText(formatSlideVibrationText(slideVibration));
      return;
    }
    const nextValue = Number(toFinite(parsed, slideVibration).toFixed(6));
    setSlideVibrationValue(nextValue);
    setSlideVibrationInputText(formatSlideVibrationText(nextValue));
  }, [
    formatSlideVibrationText,
    parseNumericExpression,
    setSlideVibrationValue,
    slideVibration,
    slideVibrationInputText,
    toFinite,
  ]);

  useEffect(() => {
    if (!showSlideSegmentSetting) {
      setSlideVibrationInputText("");
      return;
    }
    if (slideVibrationInputEditingRef.current) {
      return;
    }
    setSlideVibrationInputText(formatSlideVibrationText(slideVibration));
  }, [formatSlideVibrationText, showSlideSegmentSetting, slideVibration]);
  const currentEditorConfigType: EditorConfigCacheKey | null = showSlideSegmentSetting
    ? "longline"
    : (hideSettingsPanel || activeSettingsType === null ? null : activeSettingsType);

  useEffect(() => {
    if (!currentEditorConfigType || isApplyingEditorCacheRef.current) {
      return;
    }
    switch (currentEditorConfigType) {
      case "bpm":
        editorConfigCacheRef.current.bpm = {
          type: "bpm",
          bpmValue: activeBpmValue,
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
      case "longline":
        editorConfigCacheRef.current.longline = {
          type: "longline",
          shape: slideShape,
          curveType: slideCurveType,
          precision: slidePrecision,
          division: slideDivision,
          vibration: slideVibration,
        };
        break;
      default:
        break;
    }
  }, [
    activeBpmValue,
    activeDirectionalValue,
    activeWidthValue,
    currentEditorConfigType,
    isHabahiroEnabled,
    normalizeDirectionalWidth,
    normalizeRhythmWidth,
    slideCurveType,
    slideDivision,
    slidePrecision,
    slideShape,
    slideVibration,
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
      if (cached.type === "bpm" && !isEditingPlacedBpm) {
        const normalizedCachedBpm = normalizeEditorBpm(cached.bpmValue, toolBpmValue);
        if (!approxEq(normalizedCachedBpm, toolBpmValue)) {
          setToolBpmValue(normalizedCachedBpm);
        }
      }

      if (cached.type === "directional" && !hasOffsetSelection && !hasLongLineSelection && !isEditingPlacedBpm) {
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
        && !hasOffsetSelection
        && !hasLongLineSelection
        && !isEditingPlacedBpm
      ) {
        const nextWidth = normalizeRhythmWidth(cached.width);
        if (nextWidth !== normalizeRhythmWidth(toolRhythmWidth)) {
          setToolRhythmWidth(nextWidth);
        }
      }

      if (cached.type === "longline" && hasLongLineSelection) {
        const nextCurveType = cached.shape === "line" ? null : (cached.curveType ?? "in");
        const needApply =
          slideShape !== cached.shape ||
          slideCurveType !== nextCurveType ||
          slidePrecision !== cached.precision ||
          slideDivision !== cached.division ||
          Number(slideVibration.toFixed(6)) !== Number((cached.vibration ?? 0).toFixed(6));
        if (needApply) {
          setSlideSettings({
            shape: cached.shape,
            curveType: nextCurveType,
            precision: cached.precision,
            division: cached.division,
            vibration: Number.isFinite(cached.vibration) ? cached.vibration : 0,
          });
        }
      }
    } finally {
      isApplyingEditorCacheRef.current = false;
    }
  }, [
    approxEq,
    currentEditorConfigType,
    hasLongLineSelection,
    hasOffsetSelection,
    isHabahiroEnabled,
    isEditingPlacedBpm,
    isToolArmed,
    normalizeDirectionalWidth,
    normalizeEditorBpm,
    normalizeRhythmWidth,
    setSlideCurveType,
    setSlideSettings,
    setSlideShape,
    setTool,
    setToolBpmValue,
    setToolDirectionalWidth,
    setToolRhythmWidth,
    slideCurveType,
    slideDivision,
    slidePrecision,
    slideShape,
    slideVibration,
    tool,
    toolBpmValue,
    toolDirectionalWidth,
    toolRhythmWidth,
  ]);
  const canDeleteSelection =
    selectedNoteCount > 0 ||
    selectedBpmEventCount > 0 ||
    (selectedBpmEventId !== null && selectedBpmEventId !== BASE_BPM_LINE_ID) ||
    hasLongLineSelection;
  const canMirrorSelection = selectedNoteCount > 0;
  const mirrorSelectedNotes = useCallback(() => {
    if (selectedNoteIds.length === 0) {
      setStatusMessage("当前没有可镜像的选中音符。");
      return;
    }
    if (!selectedNoteIds.some((id) => noteById.has(id))) {
      setStatusMessage("选中的音符已失效，请重新框选后重试。");
      return;
    }

    const selectedSet = new Set(selectedNoteIds);
    const toFixed6 = (value: number): number => Number(value.toFixed(6));
    const notePositionKey = (lane: number, beat: number): string => `${lane.toFixed(6)}|${beat.toFixed(6)}`;
    const mirrorLaneByNote = (note: Pick<ChartNote, "type" | "width">, lane: number): number => {
      const mirrored = toFixed6(2 * MIRROR_AXIS_LANE - lane);
      if (appOptionSettings.habahiro && !isDirectionalNoteType(note.type)) {
        const span = normalizeRhythmWidth(note.width);
        return toFixed6(mirrored - (span - 1));
      }
      return mirrored;
    };
    const mirrorLaneDeltaByNote = (note: ChartNote): number => {
      const mirroredLane = mirrorLaneByNote(note, note.lane);
      return toFixed6(mirroredLane - note.lane);
    };

    setNotes((previous: ChartNote[]) => {
      const selectedOffsetById = new Map<string, { lane: number; beat: number }>();
      for (const note of previous) {
        if (!selectedSet.has(note.id)) {
          continue;
        }
        selectedOffsetById.set(note.id, {
          lane: mirrorLaneDeltaByNote(note),
          beat: 0,
        });
      }
      if (selectedOffsetById.size === 0) {
        return previous;
      }

      const offsetById = buildSelectionMirrorOffsetMap({
        notes: previous,
        slideChains: slideChains as Array<{ noteIds: string[] }>,
        selectedNoteIds: selectedSet,
        selectedOffsetById,
        resolveMirrorLaneDelta: mirrorLaneDeltaByNote,
      });
      if (offsetById.size === 0) {
        return previous;
      }

      const transformedById = new Map<string, ChartNote>();
      for (const note of previous) {
        const offset = offsetById.get(note.id);
        if (!offset) {
          continue;
        }

        if (selectedSet.has(note.id)) {
          const mirroredType =
            note.type === "directional_flick_left"
              ? "directional_flick_right"
              : note.type === "directional_flick_right"
                ? "directional_flick_left"
                : note.type;
          const transformed = normalizeNote(
            {
              ...note,
              type: mirroredType,
              lane: mirrorLaneByNote(note, note.lane),
              ...(typeof note.endLane === "number"
                ? { endLane: mirrorLaneByNote(note, note.endLane) }
                : { endLane: undefined }),
            },
            settings,
          );
          if (transformed) {
            transformedById.set(transformed.id, transformed);
          }
          continue;
        }

        const transformed = normalizeNote(
          {
            ...note,
            lane: toFixed6(note.lane + offset.lane),
          },
          settings,
        );
        if (transformed) {
          transformedById.set(transformed.id, transformed);
        }
      }

      if (transformedById.size === 0) {
        return previous;
      }

      const transformedNotes = Array.from(transformedById.values());
      const occupied = new Set(transformedNotes.map((note) => notePositionKey(note.lane, note.beat)));
      const transformedIdSet = new Set(transformedById.keys());
      const remained = previous.filter(
        (note) =>
          !transformedIdSet.has(note.id) &&
          !occupied.has(notePositionKey(note.lane, note.beat)),
      );
      return sortNotes([...remained, ...transformedNotes]);
    });

    setStatusMessage("已按 lane 3 轴镜像翻转选中音符。");
  }, [
    appOptionSettings.habahiro,
    isDirectionalNoteType,
    normalizeNote,
    normalizeRhythmWidth,
    noteById,
    selectedNoteIds,
    setNotes,
    setStatusMessage,
    settings,
    slideChains,
    sortNotes,
  ]);
  const {
    clearSelectedNotes,
    clearSelectedBpmEvents,
    clearAllSelections,
    removeNoteIdsFromSlideChains,
    deleteNotesWithSlideHiddenFallback,
    setSingleSelectedNote,
    setMultiSelectedNotes,
    toggleSelectedNote,
    commitSelectedNoteTransform,
    applySelectedOffset,
  } = useSelectionAndEditorSync({
    setSelectedNoteIds,
    setSelectedBpmEventIds,
    setSelectedBpmEventId,
    setSelectedLongLineSegmentId,
    setSlideChains,
    setNotes,
    slideRoleByNoteId,
    noteById,
    sortNotes,
    notes,
    bpmEvents,
    metadata,
    slideChains,
    setSlideBuildState,
    slideBuildRef,
    BASE_BPM_LINE_ID,
    selectedBpmEventId,
    selectedNoteIds,
    selectionMoveRef,
    setSelectionMovePreview,
    selectedBpmEventIds,
    showBeatSetting,
    isBeatSettingLocked,
    setBeatInputText,
    beatInputEditingRef,
    formatEditorNumeric,
    activeBeatValue,
    showBpmSetting,
    setBpmInputText,
    bpmInputEditingRef,
    activeBpmValue,
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
    setStatusMessage,
    toFinite,
    quantizeBeat,
    beatDivision,
    approxEq,
    setBpmEvents,
    sortBpmEvents,
    isLastBeatOrderedBpmNegative,
    spRhythmNoteEnabled: appOptionSettings.spRhythmNoteEnabled,
  });

  const { splitLongLineSegment, deleteSelectedLongLineSegment, applyLongLineSettings } = useLongLineActions({
    slideChains,
    notes,
    spRhythmNoteEnabled: appOptionSettings.spRhythmNoteEnabled,
    setSlideChains,
    setNotes,
    sortNotes,
    setSelectedLongLineSegmentId,
    setStatusMessage,
    createId,
  });

  const {
    applySettingsPatch,
    stepActiveLane,
    stepActiveWidth,
    setActiveDirectionalType,
    commitBeatInput,
    commitBpmInput,
    commitLaneInput,
    commitWidthInput,
    deleteSelectedNotes,
    deleteCurrentSelection,
    deleteNote,
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
    selectedBpmEventId,
    BASE_BPM_LINE_ID,
    bpmEvents,
    normalizeEditorBpm,
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    toFinite,
    approxEq,
    hasOffsetSelection,
    applySelectedOffset,
    commitSelectedNoteTransform,
    minSelectedBeat,
    isEditingPlacedBpm,
    selectedBpmEvent,
    isBaseBpmSelected,
    activeBeatValue,
    activeBpmValue,
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
    deleteNotesWithSlideHiddenFallback,
    clearSelectedNotes,
    selectedNoteIds,
    setStatusMessage,
    selectedBpmEventIds,
    setSelectedNoteIds,
    setSelectedBpmEventIds,
    setSelectedBpmEventId,
    selectedLongLineSegmentId,
    deleteSelectedLongLineSegment,
    setSelectedLongLineSegmentId,
  });

  const {
    exportJson,
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
    applyUploadTestServerChart,
    openImportJsonModal,
    closeImportJsonModal,
    openImportJsonModalBestdoriV2Level,
    isExportJsonModalOpen,
    closeExportJsonModal,
    saveExportJsonToSelectedPath,
    exportBestdoriV2ToClipboard,
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
    applyWindowPreset,
    applyWindowPresetById,
    applyBestdoriSkinSelection,
    downloadProgress,
  } = useEditorIoAndShortcuts({
    metadata,
    appOptionSettings,
    settings,
    audioFileName,
    audioDurationSec,
    audioObjectUrl,
    skinSelection,
    bpmEvents,
    svEvents,
    slideChains,
    notes,
    sortBpmEvents,
    sortSvEvents,
    sortNotes,
    removeNoteIdsFromSlideChains,
    clearSelectedNotes,
    setStatusMessage,
    openOverlayDialog,
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
    parseSkinSelectionFromDocument,
    setPendingSkinSelection,
    applyBestdoriSkinSelectionRef,
    setAudioDurationSec,
    setAudioFileName,
    jsonImportRef,
    bestdoriV2ImportRef,
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
    downloadBestdoriBgSkinAssets,
    downloadBestdoriFieldSkinAssets,
    downloadBestdoriJudgeSkinAssets,
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
  });
  useEditorSessionCache({
    metadata,
    settings,
    appOptionSettings,
    notes,
    slideChains,
    bpmEvents,
    svEvents,
    audioFileName,
    audioDurationSec,
    audioObjectUrl,
    uploadCommunityPostContent,
    uploadCommunityPostTags,
    skinSelection,
    windowPresetId,
    playbackWindowPresetId,
    playbackFps,
    playbackMvMode,
    playbackMvAlphaPercent,
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
    setSvEvents: setSvEventsState,
    setToolBpmValue,
    setAudioFileName,
    setAudioDurationSec,
    setAudioObjectUrl,
    setUploadCommunityPostContent,
    setUploadCommunityPostTags,
    setWindowPresetId,
    setPlaybackWindowPresetId,
    setPlaybackFps,
    setPlaybackMvMode,
    setPlaybackMvAlphaPercent,
    applyWindowPresetById,
    applyBestdoriSkinSelection,
    clearAllSelections,
    setStatusMessage,
  });

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
    isPlacementBlocked,
    resolveBoardPlacement,
    finishSelectionDrag,
    calcSelectionMoveDelta,
  } = useEditorGeometry({
    laneMin,
    bpmTimeline,
    boardHeight,
    timelinePixelsPerSecond,
    totalDurationSec,
    playfieldRef,
    isSkinReady,
    didInitTimelineScrollRef,
    viewBottomTimeSecRef,
    beatDivision,
    boardWidth,
    laneValues,
    notes,
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
    clearAllSelections,
    setStatusMessage,
    setMultiSelectedNotes,
    setToolLane,
    setUseToolLaneOverride,
    clearSelectedNotes,
    setSelectedBpmEventIds,
    setSelectedBpmEventId,
    NOTE_SPECS,
    setSelectionDrag,
    selectionMoveRef,
    suppressNextBoardClickRef,
    LANE_WIDTH,
    noteVisualScale,
    onSelectionDragCompleted: handleSelectionDragCompletedForCopyTool,
  });
  resolveBoardPlacementRef.current = resolveBoardPlacement;
  const {
    startSidebarResize,
    applyToolFromPalette: applyToolFromPaletteRaw,
    applyBpmToolFromPalette: applyBpmToolFromPaletteRaw,
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
    getSidebarResizeBounds,
    sidebarResizeRef,
    sidebarWidth,
    clamp,
    setTool,
    setIsToolArmed,
    clearAllSelections,
    setStatusMessage,
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
    clearSelectedBpmEvents,
    setSelectedBpmEventId,
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
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    toolBpmValue,
    metadata,
    setMetadata,
    setBpmEvents,
    bpmEvents,
    BASE_BPM_LINE_ID,
    clearSelectedNotes,
    setSelectedBpmEventIds,
    selectedNoteIds,
    selectedBpmEventIds,
    selectedBpmEventId,
    selectedLongLineSegmentId,
    playfieldBoardRef,
    selectionMoveRef,
    cursorPreview,
    isCanvasRenderBackend: RENDER_BACKEND_MODE === "canvas",
    findNoteAtBoardPoint,
    resolveBoardPlacement,
    isPlacementBlocked,
    selectionDragRef,
    isToolArmed,
    selectionDrag,
    setSelectionDrag,
    selectedNoteIdSet,
    notes,
    setSelectionMovePreview,
    selectedNotes,
    commitSelectedNoteTransform,
    toolLaneShift,
    sortBpmEvents,
    isPasteToolReady: copiedChartPayload !== null,
    isPasteLaneAnchorEnabled: copiedChartPayload?.laneAnchorEnabled === true,
    applyPasteAtPlacement: applyCopiedPayloadAtPlacement,
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
      const ratioFromBottom = clamp(playbackLinePositionPercent / 100, 0, 1);
      const anchorInViewport = viewportHeight * (1 - ratioFromBottom);
      const yInViewport = playbackWorldY - viewportTop;
      const maxScrollTop = Math.max(0, boardHeight - viewportHeight);
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
  }, [boardHeight, clamp, isPlayToolSelected, playbackLinePositionPercent, timeToY]);

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
    playbackGuideTotalLabelRef.current = hasUploadedAudio ? formatDurationPrecise(playbackDurationSec) : "?";
    if (isPlayToolSelected && !playbackIsPlayingRef.current && playbackGuidePendingRef.current) {
      queuePlaybackGuide(playbackGuidePendingRef.current);
    }
  }, [hasUploadedAudio, isPlayToolSelected, playbackDurationSec, queuePlaybackGuide]);

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

  const stopPlayback = useCallback((message: string | null = "已停止播放。") => {
    clearPlaybackTick();
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
    if (message) {
      setStatusMessage(message);
    }
  }, [clearPlaybackTick, hidePlaybackGuide, hidePlaybackRuntimeLine, setStatusMessage, stopAllPlaybackSoundEffects]);

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
    const maxScrollTop = Math.max(0, boardHeight - viewportHeight);
    const ratioFromBottom = clamp(playbackLinePositionPercent / 100, 0, 1);
    const anchorLocalY = viewportHeight * (1 - ratioFromBottom);
    const worldY = timeToY(timeSec);
    const nextScrollTop = clamp(worldY - anchorLocalY, 0, maxScrollTop);
    if (Math.abs(playfield.scrollTop - nextScrollTop) > 0.5) {
      playfield.scrollTop = nextScrollTop;
    }
    viewBottomTimeSecRef.current = yToTime(playfield.scrollTop + playfield.clientHeight);
  }, [boardHeight, clamp, playbackLinePositionPercent, timeToY, viewBottomTimeSecRef, yToTime]);

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
      playbackSeAudioContextRef.current = context;
      playbackSeMasterGainRef.current = masterGain;
      return context;
    } catch {
      return null;
    }
  }, [clamp, noteSeVolumeScale, playbackVolumePercent]);

  const decodePlaybackSeBuffer = useCallback(async (src: string): Promise<AudioBuffer | null> => {
    if (!src) {
      return null;
    }
    const cached = playbackSeBufferBySrcRef.current.get(src);
    if (cached) {
      return cached;
    }
    const pending = playbackSeDecodeTaskBySrcRef.current.get(src);
    if (pending) {
      return pending;
    }
    const context = ensurePlaybackSeAudioContext();
    if (!context) {
      return null;
    }

    const task = (async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`fetch failed: ${response.status}`);
        }
        const binary = await response.arrayBuffer();
        const decoded = await context.decodeAudioData(binary.slice(0));
        playbackSeBufferBySrcRef.current.set(src, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        playbackSeDecodeTaskBySrcRef.current.delete(src);
      }
    })();

    playbackSeDecodeTaskBySrcRef.current.set(src, task);
    return task;
  }, [ensurePlaybackSeAudioContext]);

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
    const runtimeSe = getRuntimeSeAssets();
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
      const audio = playbackAudioRef.current;
      if (audio) {
        const mediaLimit = Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.min(audio.duration, safeDuration)
          : safeDuration;
        const mediaTime = clamp(audio.currentTime, 0, mediaLimit);
        if (Number.isFinite(mediaTime)) {
          nextTimeSec = Math.max(prevTimeSec, mediaTime);
        }
      }
    }
    playbackNowSecRef.current = nextTimeSec;
    processPlaybackSoundFrame(prevTimeSec, nextTimeSec);
    syncPlaybackViewport(nextTimeSec);
    updatePlaybackRuntimeLine(nextTimeSec);
    if (nextTimeSec >= safeDuration - 1e-3) {
      stopPlayback("播放结束。");
      return;
    }
    playbackTickRafRef.current = requestAnimationFrame(() => playbackTickHandlerRef.current());
  }, [
    clamp,
    currentPlaybackSpeed,
    playbackCeilingSec,
    processPlaybackSoundFrame,
    stopPlayback,
    syncPlaybackViewport,
    updatePlaybackRuntimeLine,
  ]);

  useEffect(() => {
    playbackTickHandlerRef.current = runPlaybackTick;
  }, [runPlaybackTick]);

  const startPlaybackAt = useCallback(async (seconds: number, announce = true) => {
    const audio = playbackAudioRef.current;
    const safeDuration = Math.max(0, playbackCeilingSec);
    const safeSeconds = clamp(seconds, 0, safeDuration);
    const runtimeSe = getRuntimeSeAssets();
    await preloadPlaybackSeBuffers(runtimeSe, { waitForReady: true, timeoutMs: 240 });
    const seContext = ensurePlaybackSeAudioContext();
    if (seContext && seContext.state === "suspended") {
      try {
        await seContext.resume();
      } catch {
        // ignore resume failure
      }
    }
    clearPlaybackTick();
    playbackDurationLimitSecRef.current = safeDuration;
    playbackTickLastNowMsRef.current = performance.now();
    playbackViewportSyncStampRef.current = 0;
    playbackNowSecRef.current = safeSeconds;
    stopAllPlaybackSoundEffects();
    resetPlaybackSoundStateAt(safeSeconds);
    syncPlaybackViewport(safeSeconds);
    playbackHasAudioTrackRef.current = false;
    if (hasUploadedAudio && audio) {
      const targetAudioTime =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? clamp(safeSeconds, 0, audio.duration)
          : safeSeconds;
      audio.currentTime = targetAudioTime;
      audio.playbackRate = currentPlaybackSpeed;
      audio.volume = clamp(playbackVolumePercent / 100, 0, 1);
      try {
        await audio.play();
        playbackHasAudioTrackRef.current = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(`音频播放失败，已切换为无音频播放：${message}`);
      }
    }
    playbackIsPlayingRef.current = true;
    setIsPlaybackPlaying(true);
    hidePlaybackGuide();
    updatePlaybackRuntimeLine(safeSeconds);
    if (announce) {
      setStatusMessage(`已开始播放：${formatDuration(safeSeconds)} / ${playbackTotalLabel}`);
    }
    playbackTickRafRef.current = requestAnimationFrame(() => playbackTickHandlerRef.current());
  }, [
    clamp,
    clearPlaybackTick,
    currentPlaybackSpeed,
    formatDuration,
    hasUploadedAudio,
    playbackCeilingSec,
    playbackTotalLabel,
    playbackVolumePercent,
    preloadPlaybackSeBuffers,
    resetPlaybackSoundStateAt,
    ensurePlaybackSeAudioContext,
    setStatusMessage,
    syncPlaybackViewport,
    hidePlaybackGuide,
    updatePlaybackRuntimeLine,
    stopAllPlaybackSoundEffects,
  ]);

  const onTogglePlayTool = useCallback(() => {
    setIsPlayToolSelected((previous) => {
      const next = !previous;
      if (next) {
        setIsToolArmed(false);
        clearAllSelections();
        hidePlaybackGuide();
        hidePlaybackRuntimeLine();
        setStatusMessage("已选中播放工具。左键可开始/停止播放。");
      } else {
        hidePlaybackGuide();
        hidePlaybackRuntimeLine();
        if (isPlaybackPlaying) {
          stopPlayback(null);
        }
        setStatusMessage("已取消播放工具。");
      }
      return next;
    });
  }, [clearAllSelections, hidePlaybackGuide, hidePlaybackRuntimeLine, isPlaybackPlaying, setStatusMessage, stopPlayback]);

  const applyToolFromPalette = useCallback((nextType: NoteType) => {
    if (isPlayToolSelected) {
      setIsPlayToolSelected(false);
      hidePlaybackGuide();
      hidePlaybackRuntimeLine();
      if (isPlaybackPlaying) {
        stopPlayback(null);
      }
    }
    applyToolFromPaletteRaw(nextType);
  }, [applyToolFromPaletteRaw, hidePlaybackGuide, hidePlaybackRuntimeLine, isPlayToolSelected, isPlaybackPlaying, stopPlayback]);

  const applyBpmToolFromPalette = useCallback(() => {
    if (isPlayToolSelected) {
      setIsPlayToolSelected(false);
      hidePlaybackGuide();
      hidePlaybackRuntimeLine();
      if (isPlaybackPlaying) {
        stopPlayback(null);
      }
    }
    applyBpmToolFromPaletteRaw();
  }, [applyBpmToolFromPaletteRaw, hidePlaybackGuide, hidePlaybackRuntimeLine, isPlayToolSelected, isPlaybackPlaying, stopPlayback]);

  const applyCopyToolFromPalette = useCallback(() => {
    if (isPlayToolSelected) {
      setIsPlayToolSelected(false);
      hidePlaybackGuide();
      hidePlaybackRuntimeLine();
      if (isPlaybackPlaying) {
        stopPlayback(null);
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
        stopPlayback(null);
      }
    }
    applyPasteToolFromPaletteRaw();
    if (!copiedChartPayload) {
      setStatusMessage("已切换到粘贴工具。暂无可粘贴内容，请先复制。");
    }
  }, [
    applyPasteToolFromPaletteRaw,
    copiedChartPayload,
    hidePlaybackGuide,
    hidePlaybackRuntimeLine,
    isPlayToolSelected,
    isPlaybackPlaying,
    setStatusMessage,
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
    };
  }, [skinSelection.rhythmRipName, skinSelection.rhythmType]);

  const buildHabahiroSkinSelection = useCallback((): SkinSelection => {
    return normalizeSkinSelection({
      ...skinSelection,
      rhythmType: HABAHIRO_RHYTHM_TYPE,
      rhythmRipName: HABAHIRO_RHYTHM_RIP_NAME,
    });
  }, [normalizeSkinSelection, skinSelection]);

  const buildStandardRhythmSkinSelection = useCallback((): SkinSelection => {
    const remembered = lastStandardRhythmSkinRef.current;
    const fallbackType = RHYTHM_SKIN_TYPES[0] ?? "TYPE1";
    const fallbackRip = resolveRhythmRipNameFromType(fallbackType) ?? "skin00";
    return normalizeSkinSelection({
      ...skinSelection,
      rhythmType: remembered?.rhythmType ?? fallbackType,
      rhythmRipName: remembered?.rhythmRipName ?? fallbackRip,
    });
  }, [normalizeSkinSelection, resolveRhythmRipNameFromType, skinSelection]);

  const requestSpRhythmRegressionConfirm = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      openOverlayDialog(
        {
          tone: "warning",
          message: "关闭“SP节奏图示”后将对当前谱面执行不可逆修改（DirectionalFlick 将回退为 Flick，Slide 中 Hidden 将被清除）。是否继续应用？",
        },
        {
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        },
      );
    });
  }, [openOverlayDialog]);

  const requestHabahiroRegressionConfirm = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      openOverlayDialog(
        {
          tone: "warning",
          message: "关闭“2026愚人节”后将对当前谱面执行不可逆修改（所有非 Directional 音符宽度将回退为 1）。是否继续应用？",
        },
        {
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        },
      );
    });
  }, [openOverlayDialog]);

  const applyAppOptionSettings = useCallback(async (nextDraft: EditorOptionSettings) => {
    const normalizedNext = normalizeEditorOptionSettings(nextDraft);
    const turningOffSpRhythm =
      appOptionSettings.spRhythmNoteEnabled === true
      && normalizedNext.spRhythmNoteEnabled === false;
    const turningOnHabahiro =
      appOptionSettings.habahiro === false
      && normalizedNext.habahiro === true;
    const turningOffHabahiro =
      appOptionSettings.habahiro === true
      && normalizedNext.habahiro === false;
    let nextChartState = { notes, slideChains };
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

    if (turningOffHabahiro) {
      const chartUsesHabahiro = isChartUsingHabahiro(nextChartState);
      if (chartUsesHabahiro) {
        const confirmed = await requestHabahiroRegressionConfirm();
        if (!confirmed) {
          return false;
        }
      }
      nextChartState = regressChartWithoutHabahiro(nextChartState);
      shouldApplyRegressedChart = true;
    }

    if (shouldApplyRegressedChart) {
      setNotes(sortNotes(nextChartState.notes));
      setSlideChains(nextChartState.slideChains);
      clearAllSelections();
    }

    if (turningOnHabahiro || turningOffHabahiro) {
      const nextSkinSelection = turningOnHabahiro
        ? buildHabahiroSkinSelection()
        : buildStandardRhythmSkinSelection();
      syncingHabahiroSkinRef.current = true;
      try {
        await applyBestdoriSkinSelectionRef.current(nextSkinSelection, true, false);
      } finally {
        syncingHabahiroSkinRef.current = false;
      }
    }

    setAppOptionSettings(normalizedNext);
    setStatusMessage("已应用选项设置。");
    return true;
  }, [
    appOptionSettings.habahiro,
    appOptionSettings.spRhythmNoteEnabled,
    buildHabahiroSkinSelection,
    buildStandardRhythmSkinSelection,
    clearAllSelections,
    normalizeEditorOptionSettings,
    notes,
    requestHabahiroRegressionConfirm,
    requestSpRhythmRegressionConfirm,
    setStatusMessage,
    setNotes,
    setSlideChains,
    slideChains,
    sortNotes,
  ]);

  useEffect(() => {
    if (syncingHabahiroSkinRef.current) {
      return;
    }
    const skinIsHabahiro = isHabahiroRhythmRipName(skinSelection.rhythmRipName);
    if (appOptionSettings.habahiro && !skinIsHabahiro) {
      syncingHabahiroSkinRef.current = true;
      void applyBestdoriSkinSelectionRef.current(buildHabahiroSkinSelection(), true, false)
        .finally(() => {
          syncingHabahiroSkinRef.current = false;
        });
      return;
    }
    if (!appOptionSettings.habahiro && skinIsHabahiro) {
      syncingHabahiroSkinRef.current = true;
      void applyBestdoriSkinSelectionRef.current(buildStandardRhythmSkinSelection(), true, false)
        .finally(() => {
          syncingHabahiroSkinRef.current = false;
        });
    }
  }, [
    appOptionSettings.habahiro,
    buildHabahiroSkinSelection,
    buildStandardRhythmSkinSelection,
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
  }, [currentPlaybackSpeed]);

  useEffect(() => {
    const audio = playbackAudioRef.current;
    if (audio) {
      audio.volume = clamp(playbackVolumePercent / 100, 0, 1);
    }
    const seMasterGain = playbackSeMasterGainRef.current;
    if (seMasterGain) {
      seMasterGain.gain.value = clamp(playbackVolumePercent / 100, 0, 1) * noteSeVolumeScale;
    }
  }, [clamp, noteSeVolumeScale, playbackVolumePercent]);

  useEffect(() => {
    const runtimeSe = getRuntimeSeAssets();
    void preloadPlaybackSeBuffers(runtimeSe);
  }, [
    preloadPlaybackSeBuffers,
    skinSelection.rhythmSeRipName,
    skinSelection.directionalSeRipName,
  ]);

  useEffect(() => {
    stopPlayback(null);
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
    audio.preload = "auto";
    audio.playbackRate = currentPlaybackSpeed;
    audio.volume = clamp(playbackVolumePercent / 100, 0, 1);
    playbackAudioRef.current = audio;
    const handleEnded = () => {
      if (playbackIsPlayingRef.current) {
        stopPlayback("播放结束。");
      }
    };
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("ended", handleEnded);
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
  }, [audioObjectUrl, clamp, currentPlaybackSpeed, playbackVolumePercent, stopPlayback]);

  useEffect(() => {
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
      if (playbackIsPlayingRef.current) {
        stopPlayback();
        return;
      }
      void startPlaybackAt(getPlayfieldBottomTimeSec(), false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [getPlayfieldBottomTimeSec, startPlaybackAt, stopPlayback]);

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
        void seContext.close().catch(() => {
          // ignore close failure
        });
        playbackSeAudioContextRef.current = null;
        playbackSeMasterGainRef.current = null;
      }
    };
  }, [clearPlaybackGuideFrame, clearPlaybackTick, hidePlaybackRuntimeLine, stopAllPlaybackSoundEffects]);

  const handleBoardMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (isPlayToolSelected) {
      if (playbackIsPlayingRef.current) {
        return;
      }
      const board = playfieldBoardRef.current;
      if (board) {
        const rect = board.getBoundingClientRect();
        const y = clamp(event.clientY - rect.top, 0, boardHeight);
        const timeSec = clamp(yToTime(y), 0, Math.max(playbackCeilingSec, 0));
        queuePlaybackGuide({ y, timeSec });
      }
      return;
    }
    handleBoardMouseMoveRaw(event);
  }, [boardHeight, clamp, handleBoardMouseMoveRaw, isPlayToolSelected, playbackCeilingSec, queuePlaybackGuide, yToTime]);

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
      const y = clamp(event.clientY - rect.top, 0, boardHeight);
      const seconds = clamp(yToTime(y), 0, Math.max(playbackCeilingSec, 0));
      void startPlaybackAt(seconds);
      return;
    }
    handleBoardMouseDownRaw(event);
  }, [boardHeight, clamp, handleBoardMouseDownRaw, isPlayToolSelected, playbackCeilingSec, startPlaybackAt, stopPlayback, yToTime]);

  useEditorPointerLifecycle({
    slideBuildRef,
    setSlideBuildState,
    setStatusMessage,
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
  const isCanvasRenderBackend = RENDER_BACKEND_MODE === "canvas";
  const renderModel = useEditorRenderModel({
    bpmTimeline,
    totalBeats,
    beatToY,
    notes,
    effectiveSlideChains,
    slideBuildState,
    noteById,
    getRenderedNotePlacement,
    getSlideAnchorLane,
    laneToColumn,
    getNoteSpanLanes,
    LANE_WIDTH,
    longLineOpacityScale,
    isSimultaneousLineEnabled: appOptionSettings.simultaneousLineEnabled,
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
        y: beatToY(currentRenderBeat),
      };
    },
    [
      LANE_WIDTH,
      beatToY,
      findNoteAtBoardPoint,
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
        y: beatToY(renderBeat),
        spanLanes,
        width: previewWidth,
      };
    },
    [
      LANE_WIDTH,
      beatToY,
      findNoteAtBoardPoint,
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
    return notes.flatMap((note) => {
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
      return [{
        id: note.id,
        type: note.type,
        x: (laneToColumn(directionalStartLane) + spanLanes / 2) * LANE_WIDTH,
        y: beatToY(renderBeat),
        spanLanes,
        base: layers.base ?? null,
        overlay: layers.overlay ?? null,
        overlayMode: layers.overlayMode,
        selected: isSelected,
      }];
    });
  }, [
    LANE_WIDTH,
    beatToY,
    getNoteSpanLanes,
    getRenderedNotePlacement,
    isSlideBuilding,
    laneToColumn,
    notes,
    resolvePlacedNoteLayers,
    selectedNoteIdSet,
    slideBuildSelectedIdSet,
  ]);
  const canvasBpmVisualLines = useMemo(() => {
    return (bpmTimeline ?? [])
      .filter((node: any) => node.beat >= 0 && node.beat <= totalBeats + 1e-6)
      .map((node: any, index: number) => {
        const isBaseLine = approxEq(node.beat, 0);
        const sourceEvent = isBaseLine
          ? null
          : (bpmEvents.find((event: any) => approxEq(event.beat, node.beat)) ?? null);
        const selectionId = isBaseLine ? BASE_BPM_LINE_ID : sourceEvent?.id ?? null;
        const bpmPreviewOffset =
          selectionMovePreview?.isDragging
          && selectionId !== null
          && selectionId !== BASE_BPM_LINE_ID
          && selectedBpmEventIdSet.has(selectionId)
            ? selectionMovePreview.beatDelta
            : 0;
        return {
          key: isBaseLine
            ? "base"
            : (sourceEvent?.id ?? `bpm-${index}-${node.beat.toFixed(6)}-${node.bpm.toFixed(6)}`),
          beat: Math.max(0, node.beat + bpmPreviewOffset),
          bpm: node.bpm,
          selected: selectionId === BASE_BPM_LINE_ID
            ? selectedBpmEventId === BASE_BPM_LINE_ID
            : selectionId !== null
              ? selectedBpmEventIdSet.has(selectionId)
              : false,
        };
      });
  }, [
    BASE_BPM_LINE_ID,
    approxEq,
    bpmEvents,
    bpmTimeline,
    selectedBpmEventId,
    selectedBpmEventIdSet,
    selectionMovePreview,
    totalBeats,
  ]);
  const visibleSimultaneousSegments = useMemo(
    () => (appOptionSettings.simultaneousLineEnabled ? renderModel.simultaneousSegments : []),
    [appOptionSettings.simultaneousLineEnabled, renderModel.simultaneousSegments],
  );
  const {
    getImage: getCanvasResourceImage,
    isReady: isCanvasResourceReady,
    version: canvasResourceVersion,
  } = useCanvasRenderResources({
    enabled: isCanvasRenderBackend,
    skinAssets,
  });

  const {
    renderLaneGuides,
    renderGridLines,
    renderSimultaneousSegments,
    renderBpmLines,
    renderSlideSegments,
    slideBuildCommittedGuideLines,
    slideBuildGuideLine,
  } = usePlayfieldRenderers({
    laneValues,
    LANE_WIDTH,
    totalSteps,
    beatDivision,
    beatsPerMeasure,
    approxEq,
    beatToY,
    bpmTimeline,
    totalBeats,
    bpmEvents,
    BASE_BPM_LINE_ID,
    selectionMovePreview,
    selectedBpmEventIdSet,
    selectedBpmEventId,
    selectedBpmEvents,
    setSelectedBpmEventId,
    clearSelectedNotes,
    clearSelectedBpmEvents,
    setStatusMessage,
    setIsToolArmed,
    isToolArmed,
    sortBpmEvents,
    setBpmEvents,
    setMetadata,
    metadata,
    normalizeEditorBpm,
    toolBpmValue,
    slideBuildRef,
    finalizeSlideBuild,
    cancelSlideBuild,
    slideRoleByNoteId,
    noteById,
    getRenderedNotePlacement,
    getSlideAnchorLane,
    laneToColumn,
    simultaneousSegments: visibleSimultaneousSegments,
    selectedLongLineSegmentId,
    setSelectedLongLineSegmentId,
    settings,
    clearAllSelections,
    connectionSegments: renderModel.connectionSegments,
    skinAssets,
    slideBuildState,
    slideBuildCursor,
    renderBackendMode: RENDER_BACKEND_MODE,
    noteVisualScale,
    isSimultaneousLineEnabled: appOptionSettings.simultaneousLineEnabled,
    setSelectedBpmEventIds,
    onLongLineContextAction: (segmentGroupId: string) =>
      splitLongLineSegment(segmentGroupId, { deleteMiddle: !appOptionSettings.spRhythmNoteEnabled }),
  });
  useCanvasPlayfieldBackend({
    enabled: isCanvasRenderBackend && isSkinReady && isCanvasResourceReady,
    trackCanvasRef: playfieldTrackCanvasRef,
    noteCanvasRef: playfieldNoteCanvasRef,
    playbackCanvasRef: playfieldPlaybackCanvasRef,
    playfieldRef,
    boardWidth,
    boardHeight,
    laneValues,
    laneWidth: LANE_WIDTH,
    noteVisualScale,
    totalSteps,
    beatDivision,
    beatsPerMeasure,
    beatToY,
    yToBeat,
    yToTime,
    timeToY,
    totalDurationSec,
    bpmVisualLines: canvasBpmVisualLines,
    selectedLongLineSegmentId,
    simultaneousSegments: visibleSimultaneousSegments,
    connectionSegments: renderModel.connectionSegments,
    noteVisuals: canvasNoteVisuals,
    skinAssets,
    getImage: getCanvasResourceImage,
    slideBuildCommittedGuideLines,
    slideBuildGuideLine,
    selectionDrag,
    playbackLineVisible: isPlaybackPlaying,
    playbackCanvasLineEnabled: false,
    playbackLineMode,
    playbackLinePositionPercent,
    getPlaybackNowTimeSec,
    resourcesVersion: canvasResourceVersion,
  });

  const staticRenderRuntimeSkin = useMemo(
    () => (skinAssets ? projectCanvasRenderResourceRuntimeAssets(skinAssets) : null),
    [skinAssets],
  );
  const buildStaticRenderPayload = useCallback((): StaticRenderPayload | null => {
    if (!staticRenderRuntimeSkin) {
      return null;
    }
    return {
      schemaVersion: 1,
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
        base: note.base,
        overlay: note.overlay,
        overlayMode: note.overlayMode,
      })),
      runtimeSkin: {
        longLine: staticRenderRuntimeSkin.longLine ?? null,
        longLineSpecial: staticRenderRuntimeSkin.longLineSpecial ?? null,
        simultaneousLine: staticRenderRuntimeSkin.simultaneousLine ?? null,
      },
    };
  }, [
    LANE_WIDTH,
    beatDivision,
    beatsPerMeasure,
    boardHeight,
    boardWidth,
    bpmTimeline,
    canvasBpmVisualLines,
    canvasNoteVisuals,
    laneValues,
    metadata.title,
    noteVisualScale,
    renderModel.connectionSegments,
    staticRenderRuntimeSkin,
    timelinePixelsPerSecond,
    totalDurationSec,
    totalSteps,
    visibleSimultaneousSegments,
  ]);

  const openStaticRenderWindow = useCallback(async () => {
    if (previewLoadingProgress.visible) {
      hidePreviewLoadingProgress();
    }
    if (!isSkinReady || !isCanvasResourceReady) {
      setStatusMessage("皮肤资源尚未就绪，无法打开预览窗口。");
      return;
    }
    const staticRenderPayload = buildStaticRenderPayload();
    if (!staticRenderPayload) {
      setStatusMessage("预览数据尚未准备完成，请稍后重试。");
      return;
    }
    if (isLastBeatOrderedBpmNegative(metadata.bpm, bpmEvents)) {
      setStatusMessage("按 Beat 顺序最后一个 BPM 为负数，已阻止预览。");
      return;
    }
    startPreviewLoadingProgress("正在准备预览数据…");

    const requestId = `static-render-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const windowLabel = requestId;
    let readyUnlisten: UnlistenFn | null = null;
    let timeoutId: number | null = null;
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
            setStatusMessage(`预览窗口数据发送失败：${message}`);
          }
        },
      );
      updatePreviewLoadingProgress(24, "正在创建预览窗口…");

      const locationHref = typeof window !== "undefined"
        ? window.location.href
        : "http://localhost/";
      const targetUrl = new URL(locationHref);
      targetUrl.hash = `static-render?request=${encodeURIComponent(requestId)}`;

      const renderWindow = new WebviewWindow(windowLabel, {
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
        clearReadySubscription();
        const message = event?.payload
          ? JSON.stringify(event.payload)
          : "未知错误";
        updatePreviewLoadingProgress(100, `预览窗口创建失败：${message}`, { blocking: false });
        hidePreviewLoadingProgress(900);
        setStatusMessage(`预览窗口创建失败：${message}`);
      });
      renderWindow.once("tauri://destroyed", () => {
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
        setStatusMessage("预览窗口握手超时，请重试。");
      }, 15000);
      setStatusMessage("预览窗口已打开。");
    } catch (error) {
      clearReadySubscription();
      const message = error instanceof Error ? error.message : String(error);
      updatePreviewLoadingProgress(100, `预览启动失败：${message}`, { blocking: false });
      hidePreviewLoadingProgress(900);
      setStatusMessage(`预览窗口启动失败：${message}`);
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
    setStatusMessage,
    startPreviewLoadingProgress,
    previewLoadingProgress.visible,
    updatePreviewLoadingProgress,
  ]);

  const openSimulatorWindow = useCallback(async () => {
    if (!skinAssets) {
      setStatusMessage("皮肤资源尚未就绪，无法打开播放器。");
      return;
    }
    let readyUnlisten: UnlistenFn | null = null;
    let timeoutId: number | null = null;
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
      const playbackPreset =
        WINDOW_SIZE_PRESETS.find((item) => item.id === playbackWindowPresetId)
        ?? WINDOW_SIZE_PRESETS[0]
        ?? WINDOW_SIZE_PRESETS[1];
      const playbackWidth = Math.max(1, Math.floor(Number(playbackPreset?.width ?? 1366)));
      const playbackHeight = Math.max(1, Math.floor(Number(playbackPreset?.height ?? 768)));
      const playbackFpsValue = playbackFps === 120 ? 120 : 60;
      const playbackNoteSizePercent = Math.max(
        10,
        Math.min(200, Math.round(appOptionSettings.rhythmNoteSizePercent)),
      );
      const playbackNoteSpeed = Number(
        clamp(toFinite(appOptionSettings.rhythmNoteSpeed, 9.7), 1, 12).toFixed(2),
      );
      const playbackMvAlpha = Math.round(
        clamp(toFinite(playbackMvAlphaPercent, 100), 30, 100) / 10,
      ) * 10;
      const playbackOffsetMs = Math.round(clamp(toFinite(metadata.offsetMs, 0), -5000, 5000));
      const playbackMvOffsetMs = Math.round(clamp(toFinite(metadata.mvOffsetMs, 0), -5000, 5000));
      const requestId = `simulator-launch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const windowLabel = requestId;
      const locationHref = typeof window !== "undefined"
        ? window.location.href
        : "http://localhost/";
      const targetUrl = new URL(locationHref);
      targetUrl.hash = `simulator?request=${encodeURIComponent(requestId)}`;

      let bgmDataUrl: string | null = null;
      if (audioObjectUrl) {
        try {
          bgmDataUrl = await blobUrlToDataUrl(audioObjectUrl);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatusMessage(`播放器音频资源转换失败：${message}`);
        }
      }
      let playbackMvDataUrl: string | null = metadata.mvDataUrl;
      if (
        typeof playbackMvDataUrl === "string"
        && playbackMvDataUrl.startsWith("data:video/")
      ) {
        try {
          playbackMvDataUrl = await dataUrlToBlobUrl(playbackMvDataUrl);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatusMessage(`播放器MV资源转换失败：${message}`);
        }
      }
      const runtimeSe = getRuntimeSeAssets();
      const runtimeFieldSkin = getRuntimeFieldSkinAssets();
      const runtimeBgSkin = getRuntimeBgSkinAssets();
      const runtimeJudgeSkin = getRuntimeJudgeSkinAssets();
      const audioPayload = runtimeSe
        ? {
            seRuntimeAssets: runtimeSe ?? null,
          }
        : null;
      const simulatorMetadata: ChartMetadata = {
        ...metadata,
        offsetMs: playbackOffsetMs,
        mvOffsetMs: playbackMvOffsetMs,
        bgmDataUrl: bgmDataUrl ?? null,
        mvDataUrl: playbackMvDataUrl,
      };
      const simulatorMetadataWithFallback = simulatorMetadata as ChartMetadata & { mvDataUrlFallback?: string | null };
      simulatorMetadataWithFallback.mvDataUrlFallback =
        playbackMvDataUrl !== metadata.mvDataUrl ? metadata.mvDataUrl : null;
      const normalizedPlaybackNotes = notes.map((note) => ({
        ...note,
        timingGroup: normalizeTimingGroup(note.timingGroup, 0),
      }));
      const playbackNoteById = new Map(normalizedPlaybackNotes.map((note) => [note.id, note] as const));
      const normalizedPlaybackSlideChains = slideChains
        .map((chain) => {
          const validNoteIds = chain.noteIds.filter((noteId) => playbackNoteById.has(noteId));
          if (validNoteIds.length < 2) {
            return null;
          }
          const headNote = playbackNoteById.get(validNoteIds[0]);
          const timingGroup = normalizeTimingGroup(chain.timingGroup ?? headNote?.timingGroup ?? 0, 0);
          return {
            id: chain.id,
            noteIds: validNoteIds,
            timingGroup,
          };
        })
        .filter((chain): chain is { id: string; noteIds: string[]; timingGroup: number } => chain !== null);

      const launchPayload: SimulatorLaunchPayload = {
        requestId,
        autoStart: true,
        metadata: simulatorMetadataWithFallback,
        settings: {
          windowWidth: playbackWidth,
          windowHeight: playbackHeight,
          fps: playbackFpsValue,
          noteSizePercent: playbackNoteSizePercent,
          noteSpeed: playbackNoteSpeed,
          offsetMs: playbackOffsetMs,
          sameline: appOptionSettings.simultaneousLineEnabled,
          colorAssist: appOptionSettings.colorAssistEnabled,
          mirror: appOptionSettings.mirrorEnabled,
          effectEnable: appOptionSettings.clickEffectEnabled,
          mvMode: playbackMvMode,
          mvAlphaPercent: playbackMvAlpha,
        },
        audio: audioPayload,
        skin: {
          noteSkin: skinAssets,
          fieldSkin: runtimeFieldSkin ?? null,
          bgSkin: runtimeBgSkin ?? null,
          judgeSkin: runtimeJudgeSkin ?? null,
        },
        chartData: {
          baseBpm: metadata.bpm,
          notes: normalizedPlaybackNotes,
          slideChains: normalizedPlaybackSlideChains,
          bpmEvents: sortBpmEvents(bpmEvents).map((event) => ({
            id: event.id,
            beat: event.beat,
            bpm: event.bpm,
          })),
          svEvents: sortSvEvents(svEvents).map((event) => ({
            id: event.id,
            beat: event.beat,
            value: event.value,
            timingGroup: normalizeTimingGroup(event.timingGroup, 0),
          })),
        },
      };

      readyUnlisten = await listen<SimulatorWindowReadyPayload>(
        SIMULATOR_WINDOW_READY_EVENT,
        async (event) => {
          const readyPayload = event.payload ?? {};
          if (readyPayload.requestId !== requestId || typeof readyPayload.label !== "string") {
            return;
          }
          clearReadySubscription();
          try {
            await emitTo(
              readyPayload.label,
              SIMULATOR_WINDOW_PAYLOAD_EVENT,
              {
                requestId,
                payload: launchPayload,
              },
            );
            setStatusMessage("播放器参数已同步。");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStatusMessage(`播放器参数发送失败：${message}`);
          }
        },
      );

      const simulatorWindow = new WebviewWindow(windowLabel, {
        title: `${metadata.title} - playing`,
        width: playbackWidth,
        height: playbackHeight,
        minWidth: 1100,
        minHeight: 680,
        center: true,
        resizable: true,
        url: targetUrl.toString(),
      });
      simulatorWindow.once("tauri://error", (event) => {
        clearReadySubscription();
        const message = event?.payload ? JSON.stringify(event.payload) : "未知错误";
        setStatusMessage(`播放器窗口创建失败：${message}`);
      });
      simulatorWindow.once("tauri://destroyed", () => {
        clearReadySubscription();
      });
      timeoutId = window.setTimeout(() => {
        if (!readyUnlisten) {
          return;
        }
        clearReadySubscription();
        setStatusMessage("播放器窗口握手超时，请重试。");
      }, 15000);
      setStatusMessage("播放器窗口已打开。");
    } catch (error) {
      clearReadySubscription();
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`播放器窗口启动失败：${message}`);
    }
  }, [
    WINDOW_SIZE_PRESETS,
    appOptionSettings.rhythmNoteSizePercent,
    appOptionSettings.rhythmNoteSpeed,
    appOptionSettings.clickEffectEnabled,
    appOptionSettings.simultaneousLineEnabled,
    appOptionSettings.colorAssistEnabled,
    appOptionSettings.mirrorEnabled,
    audioObjectUrl,
    clamp,
    metadata,
    notes,
    slideChains,
    bpmEvents,
    svEvents,
    sortBpmEvents,
    sortSvEvents,
    normalizeTimingGroup,
    playbackFps,
    playbackMvMode,
    playbackMvAlphaPercent,
    playbackWindowPresetId,
    skinAssets,
    setStatusMessage,
    toFinite,
  ]);

  const canApplyLongLineSettings = hasLongLineSelection && showSlideSegmentSetting;
  const applyCurrentLongLineSettings = () => {
    if (!selectedLongLineSegmentId) {
      return;
    }
    const applied = applyLongLineSettings(selectedLongLineSegmentId, {
      shape: slideShape,
      curveType: slideCurveType,
      precision: slidePrecision,
      division: slideDivision,
      vibration: slideVibration,
    });
    if (!applied) {
      setStatusMessage("当前 longLine 不可应用样式，请重新选择后重试。");
    }
  };

  return (
    <ChartEditorLayout
      vm={{
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
        exportJson,
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
        applyUploadTestServerChart,
        closeImportJsonModal,
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
        setTool,
        setIsToolArmed,
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
        setSlideVibrationValue,
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
        renderBackendMode: RENDER_BACKEND_MODE,
        renderBpmLines,
        cursorPreview,
        cursorPreviewRef: canvasCursorPreviewRef,
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
        resolveBgSkinRipNameFromType,
        resolveFieldSkinRipNameFromType,
        resolveJudgeSkinRipNameFromType,
        HABAHIRO_RHYTHM_SKIN_TYPES,
        RHYTHM_SKIN_TYPES,
        DIRECTIONAL_SKIN_TYPES,
        RHYTHM_SE_SKIN_TYPES,
        DIRECTIONAL_SE_SKIN_TYPES,
        BG_SKIN_TYPES,
        FIELD_SKIN_TYPES,
        JUDGE_SKIN_TYPES,
        formatTypeLabel,
        skinAssets,
        applyWindowPreset,
        applyAppOptionSettings,
        applyBestdoriSkinSelection,
        downloadProgress,
        playbackRuntimeLineRef,
        playbackGuideHostRef,
        playbackGuideLabelRef,
        noteVisualScale,
        copiedChartPayload,
      }}
    />
  );
}

export default ChartEditorController;









