import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { beatToSeconds, sanitizeFileName } from "../chartCore";
import backArrowIcon from "../assets/icons/back-arrow.svg";
import imageExportIcon from "../assets/icons/image-export.svg";
import { DownloadProgressModal } from "../components/DownloadProgressModal";
import { OverlayDialogModal, type OverlayDialogState } from "../components/OverlayDialogModal";
import { StepperIcon } from "../components/StepperIcon";
import {
  isMobileRuntime,
  navigateBackToEditor,
  readMobileRoutePayload,
  removeMobileRoutePayload,
} from "./mobileRuntime";
import type { RenderConnectionSegment, RenderSimultaneousSegment } from "./hooks/useEditorRenderModel";
import type { StaticBpmVisualLine, StaticNoteVisual, StaticRenderPayload, StaticSvVisualLine } from "./staticRenderTypes";

const GRID_COLOR = "rgb(26, 51, 59)";
const GRID_BEAT_COLOR = "rgb(0, 166, 166)";
const GRID_MEASURE_COLOR = "rgb(0, 166, 166)";
const LANE_GUIDE_COLOR = "rgba(98, 124, 162, 0.46)";
const BOARD_BG_COLOR = "#02050d";
const CONNECTION_SEGMENT_X_CONTINUITY_TOLERANCE_PX = 1;
const DIRECTIONAL_HEAD_INSET_RATIO = 0.55;
const DIRECTIONAL_HEAD_SCALE = 1.25;
const CONTENT_VERTICAL_MARGIN_PX = 96;
const SEGMENT_SIDE_EXPAND_LANES = 3;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP_PERCENT = 25;
const ZOOM_MIN_PERCENT = Math.round(ZOOM_MIN * 100);
const ZOOM_MAX_PERCENT = Math.round(ZOOM_MAX * 100);
const MAX_EXPORT_CANVAS_WIDTH = 32767;
const MAX_EXPORT_CANVAS_HEIGHT = 16384;
const MAX_EXPORT_CANVAS_PIXELS = 180_000_000;
const MIN_SLICE_HEIGHT_PX = 1;
const NOTE_COUNT_MILESTONE_STEP = 50;
const LABEL_EDGE_PADDING_PX = 8;

type SegmentEndpoints = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

type SegmentGeometry = {
  topX: number;
  topY: number;
  height: number;
  shearX: number;
};

type RenderBounds = {
  top: number;
  bottom: number;
};

type StaticPayloadEnvelope = {
  requestId: string;
  payload: StaticRenderPayload;
};

type PreviewLoadingState = {
  visible: boolean;
  blocking: boolean;
  percent: number;
  message: string;
  logs: string[];
};

type NoteCountMilestone = {
  y: number;
  count: number;
};

type HoverStatusLine = {
  segmentIndex: number;
  yPx: number;
  absoluteTimeSec: number;
  visibleNoteCount: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveDynamicExportWidthLimit(exportHeight: number): number {
  const safeHeight = Math.max(1, Math.floor(exportHeight));
  const widthByPixelBudget = Math.floor(MAX_EXPORT_CANVAS_PIXELS / safeHeight);
  return Math.max(1, Math.min(MAX_EXPORT_CANVAS_WIDTH, widthByPixelBudget));
}

function parseStaticRenderRouteParams(): { requestId: string; isMobileRoute: boolean } {
  if (typeof window === "undefined") {
    return { requestId: "", isMobileRoute: false };
  }
  const hash = window.location.hash ?? "";
  const queryIndex = hash.indexOf("?");
  if (queryIndex < 0) {
    return { requestId: "", isMobileRoute: false };
  }
  const query = hash.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  return {
    requestId: params.get("request") ?? "",
    isMobileRoute: params.get("mode") === "mobile",
  };
}

function formatTimeLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minute = Math.floor(total / 60);
  const second = total % 60;
  return `${minute}:${String(second).padStart(2, "0")}`;
}

function formatTimeLabelPrecise(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00.000";
  }
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const minute = Math.floor(totalMs / 60000);
  const second = Math.floor((totalMs % 60000) / 1000);
  const millisecond = totalMs % 1000;
  return `${minute}:${String(second).padStart(2, "0")}.${String(millisecond).padStart(3, "0")}`;
}

function upperBoundByTime(sortedTimes: number[], target: number): number {
  let low = 0;
  let high = sortedTimes.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sortedTimes[mid] <= target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function isDirectionalVisual(type: string): boolean {
  return type === "directional_flick_left" || type === "directional_flick_right";
}

function snapToDevicePixel(value: number, pixelRatio: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const ratio = Math.max(1, pixelRatio);
  return Math.round(value * ratio) / ratio;
}

function resolveSegmentEndpoints(
  segment: RenderConnectionSegment,
  pixelRatio: number,
  overrideFrom?: { x: number; y: number } | null,
): SegmentEndpoints {
  const rawFromX = overrideFrom ? overrideFrom.x : segment.fromX;
  const rawFromY = overrideFrom ? overrideFrom.y : segment.fromY;
  return {
    fromX: rawFromX,
    fromY: snapToDevicePixel(rawFromY, pixelRatio),
    toX: segment.toX,
    toY: snapToDevicePixel(segment.toY, pixelRatio),
  };
}

function resolveSegmentGeometry(endpoints: SegmentEndpoints): SegmentGeometry | null {
  const { fromX, fromY, toX, toY } = endpoints;
  const deltaY = toY - fromY;
  if (!Number.isFinite(deltaY) || Math.abs(deltaY) <= 1e-6) {
    return null;
  }
  const topIsFrom = fromY <= toY;
  const topX = topIsFrom ? fromX : toX;
  const topY = topIsFrom ? fromY : toY;
  const bottomX = topIsFrom ? toX : fromX;
  const bottomY = topIsFrom ? toY : fromY;
  const height = bottomY - topY;
  if (!Number.isFinite(height) || height <= 1e-6) {
    return null;
  }
  const horizontalOffset = bottomX - topX;
  return {
    topX,
    topY,
    height,
    shearX: horizontalOffset / height,
  };
}

function drawConnectionSegment(
  context: CanvasRenderingContext2D,
  segment: RenderConnectionSegment,
  geometry: SegmentGeometry,
  laneWidth: number,
  texture: HTMLImageElement,
) {
  context.save();
  context.imageSmoothingEnabled = false;
  context.globalAlpha = segment.opacity;
  context.translate(geometry.topX, geometry.topY);
  context.transform(1, 0, geometry.shearX, 1, 0, 0);
  context.drawImage(texture, -laneWidth * 0.5, 0, laneWidth, geometry.height);
  context.restore();
}

function drawNoteVisual(
  context: CanvasRenderingContext2D,
  note: StaticNoteVisual,
  laneWidth: number,
  noteVisualScale: number,
  getImage: (url: string | undefined | null) => HTMLImageElement | null,
) {
  const baseImage = getImage(note.base);
  const overlayImage = getImage(note.overlay);
  if (!baseImage && !overlayImage) {
    return;
  }

  const noteHeight = 24 * noteVisualScale;
  const centerX = note.x;
  const centerY = note.y;
  const directional = isDirectionalVisual(note.type);
  const tokenWidth = directional
    ? note.spanLanes * laneWidth
    : Math.max(1, laneWidth * (Math.max(1, note.spanLanes) + 0.25) * noteVisualScale);
  const tokenLeft = centerX - tokenWidth * 0.5;
  const tokenTop = centerY - noteHeight * 0.5;

  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (directional) {
    const laneCount = Math.max(1, Math.round(note.spanLanes));
    const segmentWidth = Math.max(laneWidth * 1.34 * noteVisualScale, 60 * noteVisualScale);
    const headSegmentIndex = note.type === "directional_flick_right" ? laneCount - 1 : 0;
    const headSegmentCenterX = tokenLeft + ((headSegmentIndex + 0.5) / laneCount) * tokenWidth;
    const headSegmentLeft = headSegmentCenterX - segmentWidth * 0.5;
    const headSegmentRight = headSegmentCenterX + segmentWidth * 0.5;

    if (baseImage) {
      for (let index = 0; index < laneCount; index += 1) {
        const segmentCenterX = tokenLeft + ((index + 0.5) / laneCount) * tokenWidth;
        const segmentLeft = segmentCenterX - segmentWidth * 0.5;
        context.drawImage(
          baseImage,
          segmentLeft,
          tokenTop,
          segmentWidth,
          noteHeight,
        );
      }
    }

    if (overlayImage && note.overlayMode === "directional") {
      const headAspectRatio =
        overlayImage.naturalHeight > 0
          ? overlayImage.naturalWidth / overlayImage.naturalHeight
          : 1;
      const headHeight = noteHeight * DIRECTIONAL_HEAD_SCALE;
      const headWidth = Math.max(1, headHeight * headAspectRatio);
      const headInset = headWidth * DIRECTIONAL_HEAD_INSET_RATIO;
      const headLeft = note.type === "directional_flick_right"
        ? headSegmentRight - headInset
        : headSegmentLeft - headWidth + headInset;
      const headTop = tokenTop - (headHeight - noteHeight) * 0.5;
      context.drawImage(
        overlayImage,
        headLeft,
        headTop,
        headWidth,
        headHeight,
      );
    }
  } else {
    if (baseImage) {
      context.drawImage(
        baseImage,
        tokenLeft,
        tokenTop,
        tokenWidth,
        noteHeight,
      );
    }
    if (overlayImage) {
      if (note.overlayMode === "flick") {
        const overlayAspectRatio =
          overlayImage.naturalHeight > 0
            ? overlayImage.naturalWidth / overlayImage.naturalHeight
            : 1;
        const overlayHeight = noteHeight;
        const overlayWidth = Math.max(1, overlayHeight * overlayAspectRatio);
        const overlayLeft = centerX - overlayWidth * 0.5;
        const overlayTop = tokenTop + noteHeight * 0.25 - overlayHeight * 0.91;
        context.drawImage(
          overlayImage,
          overlayLeft,
          overlayTop,
          overlayWidth,
          overlayHeight,
        );
      } else {
        context.drawImage(
          overlayImage,
          tokenLeft,
          tokenTop,
          tokenWidth,
          noteHeight,
        );
      }
    }
  }
  context.restore();
}

function beatToY(payload: StaticRenderPayload, beat: number): number {
  const sec = beatToSeconds(beat, payload.bpmTimeline as any);
  return payload.boardHeight - sec * payload.timelinePixelsPerSecond - 1;
}

function timeToY(payload: StaticRenderPayload, timeSec: number): number {
  return payload.boardHeight - timeSec * payload.timelinePixelsPerSecond - 1;
}

function yToTime(payload: StaticRenderPayload, y: number): number {
  if (!Number.isFinite(y) || payload.timelinePixelsPerSecond <= 0) {
    return 0;
  }
  const timeSec = (payload.boardHeight - y - 1) / payload.timelinePixelsPerSecond;
  return clamp(timeSec, 0, payload.totalDurationSec);
}

function computeRenderBounds(payload: StaticRenderPayload): RenderBounds {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasRenderableContent = false;
  const noteHalfHeight = 12 * payload.noteVisualScale;

  for (const note of payload.noteVisuals) {
    minY = Math.min(minY, note.y - noteHalfHeight);
    maxY = Math.max(maxY, note.y + noteHalfHeight);
    hasRenderableContent = true;
  }
  for (const segment of payload.connectionSegments) {
    minY = Math.min(minY, segment.minY);
    maxY = Math.max(maxY, segment.maxY);
    hasRenderableContent = true;
  }
  for (const segment of payload.simultaneousSegments) {
    minY = Math.min(minY, segment.y - 8);
    maxY = Math.max(maxY, segment.y + 8);
    hasRenderableContent = true;
  }

  if (!hasRenderableContent) {
    const zeroBeatY = beatToY(payload, 0);
    return {
      top: Math.max(0, zeroBeatY - CONTENT_VERTICAL_MARGIN_PX),
      bottom: Math.min(payload.boardHeight, zeroBeatY + CONTENT_VERTICAL_MARGIN_PX),
    };
  }

  const top = clamp(minY - CONTENT_VERTICAL_MARGIN_PX, 0, payload.boardHeight);
  const bottom = clamp(maxY + CONTENT_VERTICAL_MARGIN_PX, 0, payload.boardHeight);
  if (bottom - top <= 1e-6) {
    return {
      top: Math.max(0, top - CONTENT_VERTICAL_MARGIN_PX),
      bottom: Math.min(payload.boardHeight, bottom + CONTENT_VERTICAL_MARGIN_PX),
    };
  }
  return { top, bottom };
}

function sortConnectionSegments(segments: RenderConnectionSegment[]): RenderConnectionSegment[] {
  return [...segments].sort((left, right) => {
    if (left.chainId !== right.chainId) {
      return left.chainId.localeCompare(right.chainId);
    }
    return left.index - right.index;
  });
}

function drawSegmentFrame(args: {
  context: CanvasRenderingContext2D;
  payload: StaticRenderPayload;
  segmentTop: number;
  segmentBottom: number;
  windowHeight: number;
  windowWidth: number;
  boardXOffset: number;
  zoom: number;
  orderedSegments: RenderConnectionSegment[];
  noteCountMilestones: NoteCountMilestone[];
  getImage: (url: string | undefined | null) => HTMLImageElement | null;
}) {
  const {
    context,
    payload,
    segmentTop,
    segmentBottom,
    windowHeight,
    windowWidth,
    boardXOffset,
    zoom,
    orderedSegments,
    noteCountMilestones,
    getImage,
  } = args;
  const logicalBoardWidth = payload.boardWidth;
  const laneCount = payload.laneValues.length;
  const pixelRatio = Math.max(1, zoom);
  const toLocalY = (worldY: number) => worldY - segmentTop;
  const clampLabelY = (localY: number) =>
    clamp(localY, LABEL_EDGE_PADDING_PX, Math.max(LABEL_EDGE_PADDING_PX, windowHeight - LABEL_EDGE_PADDING_PX));

  context.fillStyle = BOARD_BG_COLOR;
  context.fillRect(0, 0, windowWidth, windowHeight);

  for (let column = 0; column < laneCount; column += 1) {
    context.fillStyle = column % 2 === 0 ? "rgba(8, 15, 26, 0.72)" : "rgba(12, 20, 32, 0.72)";
    context.fillRect(
      boardXOffset + column * payload.laneWidth,
      0,
      payload.laneWidth,
      windowHeight,
    );
  }

  for (let column = 1; column < laneCount; column += 1) {
    const x = boardXOffset + column * payload.laneWidth;
    context.strokeStyle = LANE_GUIDE_COLOR;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, windowHeight);
    context.stroke();
  }
  context.fillStyle = GRID_BEAT_COLOR;
  context.fillRect(boardXOffset - 9, 0, 9, windowHeight);
  context.fillRect(boardXOffset + logicalBoardWidth, 0, 9, windowHeight);

  for (let step = 0; step <= payload.totalSteps; step += 1) {
    const beat = step / payload.beatDivision;
    const yWorld = beatToY(payload, beat);
    if (yWorld < segmentTop - 2 || yWorld > segmentBottom + 2) {
      continue;
    }
    const y = toLocalY(yWorld);
    const roundedBeat = Math.round(beat);
    const isWholeBeat = Math.abs(beat - roundedBeat) < 1e-6;
    const isMeasureStart = isWholeBeat && roundedBeat % payload.beatsPerMeasure === 0;
    context.strokeStyle = isMeasureStart
      ? GRID_MEASURE_COLOR
      : isWholeBeat
        ? GRID_BEAT_COLOR
        : GRID_COLOR;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(boardXOffset, y);
    context.lineTo(boardXOffset + logicalBoardWidth, y);
    context.stroke();
  }

  const simultaneousTexture = getImage(payload.runtimeSkin.simultaneousLine);
  if (simultaneousTexture) {
    const lineHeight = Math.max(1, simultaneousTexture.naturalHeight / 3);
    const halfHeight = lineHeight * 0.5;
    for (const segment of payload.simultaneousSegments as RenderSimultaneousSegment[]) {
      if (segment.y < segmentTop - lineHeight || segment.y > segmentBottom + lineHeight) {
        continue;
      }
      if (!Number.isFinite(segment.width) || segment.width <= 1e-6) {
        continue;
      }
      context.drawImage(
        simultaneousTexture,
        boardXOffset + segment.fromX,
        toLocalY(segment.y) - halfHeight,
        segment.width,
        lineHeight,
      );
    }
  } else {
    context.save();
    context.strokeStyle = "rgba(174, 209, 255, 0.75)";
    context.lineWidth = 2;
    for (const segment of payload.simultaneousSegments as RenderSimultaneousSegment[]) {
      if (segment.y < segmentTop - 3 || segment.y > segmentBottom + 3) {
        continue;
      }
      context.beginPath();
      context.moveTo(boardXOffset + segment.fromX, toLocalY(segment.y));
      context.lineTo(boardXOffset + segment.toX, toLocalY(segment.y));
      context.stroke();
    }
    context.restore();
  }

  const longLineTexture = getImage(payload.runtimeSkin.longLine);
  const slideLineTexture = getImage(payload.runtimeSkin.longLineSpecial);
  const chainTailById = new Map<string, { index: number; x: number }>();
  for (const segment of orderedSegments) {
    if (segment.maxY < segmentTop - 3 || segment.minY > segmentBottom + 3) {
      continue;
    }
    const previousTail = chainTailById.get(segment.chainId);
    const rawEndpoints = resolveSegmentEndpoints(segment, pixelRatio);
    const localRawEndpoints: SegmentEndpoints = {
      fromX: boardXOffset + rawEndpoints.fromX,
      fromY: toLocalY(rawEndpoints.fromY),
      toX: boardXOffset + rawEndpoints.toX,
      toY: toLocalY(rawEndpoints.toY),
    };
    const isContinuousChain = previousTail && previousTail.index + 1 === segment.index;
    const shouldKeepContinuousX = Boolean(
      isContinuousChain
      && Math.abs((previousTail?.x ?? 0) - localRawEndpoints.fromX)
        <= CONNECTION_SEGMENT_X_CONTINUITY_TOLERANCE_PX,
    );
    const shiftX = shouldKeepContinuousX
      ? (previousTail?.x ?? localRawEndpoints.fromX) - localRawEndpoints.fromX
      : snapToDevicePixel(localRawEndpoints.fromX, pixelRatio) - localRawEndpoints.fromX;
    const alignedEndpoints: SegmentEndpoints = {
      fromX: localRawEndpoints.fromX + shiftX,
      fromY: localRawEndpoints.fromY,
      toX: localRawEndpoints.toX + shiftX,
      toY: localRawEndpoints.toY,
    };
    const geometry = resolveSegmentGeometry(alignedEndpoints);
    if (!geometry) {
      continue;
    }
    chainTailById.set(segment.chainId, {
      index: segment.index,
      x: alignedEndpoints.toX,
    });
    const texture = segment.textureKind === "slide" ? slideLineTexture : longLineTexture;
    const lineWidth = payload.laneWidth * Math.max(1, segment.spanLanes) * payload.noteVisualScale;
    if (texture) {
      drawConnectionSegment(context, segment, geometry, lineWidth, texture);
      continue;
    }
    context.save();
    context.globalAlpha = clamp(segment.opacity, 0, 1);
    context.strokeStyle = segment.textureKind === "slide" ? "rgba(98, 229, 145, 0.8)" : "rgba(74, 186, 255, 0.8)";
    context.lineWidth = Math.max(1, lineWidth);
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(alignedEndpoints.fromX, alignedEndpoints.fromY);
    context.lineTo(alignedEndpoints.toX, alignedEndpoints.toY);
    context.stroke();
    context.restore();
  }

  for (const note of payload.noteVisuals) {
    if (note.y < segmentTop - 48 || note.y > segmentBottom + 48) {
      continue;
    }
    drawNoteVisual(
      context,
      {
        ...note,
        x: boardXOffset + note.x,
        y: toLocalY(note.y),
      },
      payload.laneWidth,
      payload.noteVisualScale,
      getImage,
    );
  }

  context.save();
  context.strokeStyle = "rgb(217, 13, 35)";
  context.fillStyle = "rgb(217, 13, 35)";
  context.lineWidth = 1;
  context.font = "12px 'TTShinGoM', 'GB18030', sans-serif";
  context.textAlign = "right";
  context.textBaseline = "alphabetic";
  const bpmLabelX = Math.max(18, boardXOffset - 12);
  for (const line of payload.bpmVisualLines as StaticBpmVisualLine[]) {
    const yWorld = beatToY(payload, line.beat);
    if (yWorld < segmentTop - 24 || yWorld > segmentBottom + 24) {
      continue;
    }
    const y = toLocalY(yWorld);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(windowWidth, y);
    context.stroke();
    context.fillText(`BPM ${line.bpm.toFixed(2)}`, bpmLabelX, y - 6);
  }
  context.restore();

  context.save();
  context.lineWidth = 1;
  context.font = "12px 'TTShinGoM', 'GB18030', sans-serif";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  const svLabelX = Math.min(windowWidth - 18, boardXOffset + payload.boardWidth + 12);
  for (const line of (payload.svVisualLines ?? []) as StaticSvVisualLine[]) {
    const yWorld = beatToY(payload, line.beat);
    if (yWorld < segmentTop - 24 || yWorld > segmentBottom + 24) {
      continue;
    }
    const y = toLocalY(yWorld);
    const isNonGlobal = line.timingGroup !== "#Global";
    context.strokeStyle = isNonGlobal ? "rgb(87, 150, 255)" : "rgb(42, 188, 116)";
    context.fillStyle = isNonGlobal ? "rgb(87, 150, 255)" : "rgb(42, 188, 116)";
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(windowWidth, y);
    context.stroke();
    context.fillText(`×${line.value.toFixed(2)}`, svLabelX, y + 13);
  }
  context.restore();

  context.save();
  context.fillStyle = "rgba(222, 229, 242, 0.84)";
  context.font = "12px 'TTShinGoM', 'GB18030', sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";
  const timeLabelX = Math.max(18, boardXOffset - 12);
  const maxSecond = Math.ceil(payload.totalDurationSec);
  for (let second = 0; second <= maxSecond; second += 1) {
    const yWorld = timeToY(payload, second);
    if (yWorld < segmentTop - LABEL_EDGE_PADDING_PX || yWorld > segmentBottom + LABEL_EDGE_PADDING_PX) {
      continue;
    }
    context.fillText(formatTimeLabel(second), timeLabelX, clampLabelY(toLocalY(yWorld)));
  }
  context.restore();

  if (noteCountMilestones.length <= 0) {
    return;
  }

  context.save();
  context.fillStyle = "rgba(222, 229, 242, 0.84)";
  context.font = "12px 'TTShinGoM', 'GB18030', sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  const noteCountLabelX = Math.min(windowWidth - 10, boardXOffset + logicalBoardWidth + 12);
  for (const milestone of noteCountMilestones) {
    if (
      milestone.y < segmentTop - LABEL_EDGE_PADDING_PX
      || milestone.y > segmentBottom + LABEL_EDGE_PADDING_PX
    ) {
      continue;
    }
    context.fillText(String(milestone.count), noteCountLabelX, clampLabelY(toLocalY(milestone.y)));
  }
  context.restore();
}

function renderSegmentCanvas(args: {
  canvas: HTMLCanvasElement;
  payload: StaticRenderPayload;
  orderedSegments: RenderConnectionSegment[];
  noteCountMilestones: NoteCountMilestone[];
  segmentTop: number;
  segmentBottom: number;
  windowHeight: number;
  windowWidth: number;
  boardXOffset: number;
  zoom: number;
  widthPx: number;
  heightPx: number;
  getImage: (url: string | undefined | null) => HTMLImageElement | null;
}) {
  const {
    canvas,
    payload,
    orderedSegments,
    noteCountMilestones,
    segmentTop,
    segmentBottom,
    windowHeight,
    windowWidth,
    boardXOffset,
    zoom,
    widthPx,
    heightPx,
    getImage,
  } = args;
  if (canvas.width !== widthPx) {
    canvas.width = widthPx;
  }
  if (canvas.height !== heightPx) {
    canvas.height = heightPx;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, widthPx, heightPx);
  context.restore();
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(zoom, zoom);
  drawSegmentFrame({
    context,
    payload,
    orderedSegments,
    segmentTop,
    segmentBottom,
    windowHeight,
    windowWidth,
    boardXOffset,
    zoom,
    getImage,
    noteCountMilestones,
  });
  context.restore();
}

export default function StaticChartRenderWindow() {
  const routeParams = useMemo(() => parseStaticRenderRouteParams(), []);
  const { requestId, isMobileRoute } = routeParams;
  const [payload, setPayload] = useState<StaticRenderPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [overlayDialog, setOverlayDialog] = useState<OverlayDialogState | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<PreviewLoadingState>({
    visible: true,
    blocking: true,
    percent: 8,
    message: "正在初始化预览窗口…",
    logs: ["正在初始化预览窗口…"],
  });
  const [zoom, setZoom] = useState(1);
  const [sliceHeightPx, setSliceHeightPx] = useState(640);
  const [isExporting, setIsExporting] = useState(false);
  const [hoverStatusLine, setHoverStatusLine] = useState<HoverStatusLine | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRefMap = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const imageMapRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [imageVersion, setImageVersion] = useState(0);
  const loadingHideTimerRef = useRef<number | null>(null);
  const didCompleteRenderRef = useRef(false);

  const showOverlayDialog = useCallback((dialog: OverlayDialogState) => {
    setOverlayDialog(dialog);
  }, []);

  const closeOverlayDialog = useCallback(() => {
    setOverlayDialog(null);
  }, []);

  const clearLoadingHideTimer = useCallback(() => {
    if (loadingHideTimerRef.current !== null) {
      window.clearTimeout(loadingHideTimerRef.current);
      loadingHideTimerRef.current = null;
    }
  }, []);

  const updateLoadingProgress = useCallback((
    percent: number,
    message: string,
    options?: { blocking?: boolean },
  ) => {
    setLoadingProgress((previous) => {
      const nextLogs =
        previous.logs.length > 0 && previous.logs[previous.logs.length - 1] === message
          ? previous.logs
          : [...previous.logs, message].slice(-2);
      return {
        visible: true,
        blocking: options?.blocking ?? previous.blocking,
        percent: clamp(Math.round(percent), 0, 100),
        message,
        logs: nextLogs,
      };
    });
  }, []);

  const completeLoadingProgress = useCallback((message: string, delayMs = 420) => {
    clearLoadingHideTimer();
    updateLoadingProgress(100, message, { blocking: false });
    loadingHideTimerRef.current = window.setTimeout(() => {
      setLoadingProgress({
        visible: false,
        blocking: false,
        percent: 0,
        message: "",
        logs: [],
      });
      loadingHideTimerRef.current = null;
    }, delayMs);
  }, [clearLoadingHideTimer, updateLoadingProgress]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void | Promise<void>) | null = null;

    const attach = async () => {
      if (!requestId) {
        setErrorMessage("缺少预览请求标识，无法接收数据。");
        completeLoadingProgress("预览初始化失败。", 900);
        return;
      }
      try {
        updateLoadingProgress(22, "正在等待主窗口连接…");
        const currentWindow = getCurrentWebviewWindow();
        unlisten = await currentWindow.listen<StaticPayloadEnvelope>("static-render:payload", (event) => {
          if (disposed) {
            return;
          }
          const envelope = event.payload;
          if (!envelope || envelope.requestId !== requestId || !envelope.payload) {
            return;
          }
          setPayload(envelope.payload);
          updateLoadingProgress(74, "正在生成预览画面…");
          setErrorMessage("");
        });
        updateLoadingProgress(36, "连接已建立，等待主窗口发送数据…");
        await emit("static-render:ready", {
          requestId,
          label: currentWindow.label,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!disposed) {
          setErrorMessage(`预览窗口初始化失败：${message}`);
          completeLoadingProgress(`预览初始化失败：${message}`, 900);
        }
      }
    };

    void attach();
    return () => {
      disposed = true;
      clearLoadingHideTimer();
      if (unlisten) {
        void unlisten();
      }
    };
  }, [clearLoadingHideTimer, completeLoadingProgress, isMobileRoute, requestId, updateLoadingProgress]);

  const updateSliceHeight = useCallback(() => {
    const host = previewViewportRef.current;
    if (!host) {
      return;
    }
    const style = window.getComputedStyle(host);
    const paddingTop = Number.parseFloat(style.paddingTop || "0");
    const paddingBottom = Number.parseFloat(style.paddingBottom || "0");
    // clientHeight already excludes horizontal scrollbar height when present.
    const viewportHeight = host.clientHeight - paddingTop - paddingBottom;
    const next = Math.max(MIN_SLICE_HEIGHT_PX, Math.floor(viewportHeight));
    setSliceHeightPx((current) => (current === next ? current : next));
  }, []);

  useEffect(() => {
    updateSliceHeight();
    const observer = new ResizeObserver(updateSliceHeight);
    if (previewViewportRef.current) {
      observer.observe(previewViewportRef.current);
    }
    window.addEventListener("resize", updateSliceHeight);
    return () => {
      window.removeEventListener("resize", updateSliceHeight);
      observer.disconnect();
    };
  }, [updateSliceHeight]);

  const imageUrls = useMemo(() => {
    if (!payload) {
      return [] as string[];
    }
    const urls = new Set<string>();
    const push = (value: string | null | undefined) => {
      if (typeof value === "string" && value.length > 0) {
        urls.add(value);
      }
    };

    push(payload.runtimeSkin.longLine);
    push(payload.runtimeSkin.longLineSpecial);
    push(payload.runtimeSkin.simultaneousLine);
    for (const note of payload.noteVisuals) {
      push(note.base);
      push(note.overlay);
    }
    return Array.from(urls.values());
  }, [payload]);

  useEffect(() => {
    for (const url of imageUrls) {
      if (imageMapRef.current.has(url)) {
        continue;
      }
      const image = new Image();
      image.decoding = "async";
      image.onload = () => setImageVersion((value) => value + 1);
      image.onerror = () => setImageVersion((value) => value + 1);
      image.src = url;
      imageMapRef.current.set(url, image);
    }
  }, [imageUrls]);

  const getImage = useCallback(
    (url: string | undefined | null): HTMLImageElement | null => {
      if (!url) {
        return null;
      }
      const image = imageMapRef.current.get(url);
      if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        return null;
      }
      return image;
    },
    [imageVersion],
  );

  const orderedSegments = useMemo(
    () => sortConnectionSegments(payload?.connectionSegments ?? []),
    [payload?.connectionSegments],
  );

  const bounds = useMemo<RenderBounds | null>(() => {
    if (!payload) {
      return null;
    }
    return computeRenderBounds(payload);
  }, [payload]);

  const tileHeightUnscaled = useMemo(
    () => Math.max(1, sliceHeightPx / zoom),
    [sliceHeightPx, zoom],
  );

  const segmentCount = useMemo(() => {
    if (!payload || !bounds) {
      return 0;
    }
    const contentHeight = Math.max(1, bounds.bottom - bounds.top);
    return Math.max(1, Math.ceil(contentHeight / tileHeightUnscaled));
  }, [bounds, payload, tileHeightUnscaled]);

  const segmentWidthPx = useMemo(() => {
    if (!payload) {
      return 1;
    }
    const sidePadding = payload.laneWidth * SEGMENT_SIDE_EXPAND_LANES;
    const segmentWidth = payload.boardWidth + sidePadding * 2;
    return Math.max(1, Math.round(segmentWidth * zoom));
  }, [payload, zoom]);
  const segmentSidePaddingPx = useMemo(
    () => (payload ? payload.laneWidth * SEGMENT_SIDE_EXPAND_LANES : 0),
    [payload],
  );
  const segmentBoardOffsetPx = useMemo(
    () => segmentSidePaddingPx * zoom,
    [segmentSidePaddingPx, zoom],
  );
  const segmentBoardWidthPx = useMemo(
    () => (payload ? payload.boardWidth * zoom : 1),
    [payload, zoom],
  );
  const segmentLogicalWidth = useMemo(
    () => (payload ? payload.boardWidth + segmentSidePaddingPx * 2 : 1),
    [payload, segmentSidePaddingPx],
  );

  const totalCanvasWidthPx = Math.max(1, segmentWidthPx * Math.max(1, segmentCount));

  const visibleNoteTimesSec = useMemo(() => {
    if (!payload) {
      return [] as number[];
    }
    const times: number[] = [];
    for (const note of payload.noteVisuals) {
      if (note.type === "hidden") {
        continue;
      }
      times.push(yToTime(payload, note.y));
    }
    times.sort((left, right) => left - right);
    return times;
  }, [payload]);

  const noteCountMilestones = useMemo<NoteCountMilestone[]>(() => {
    if (!payload) {
      return [];
    }
    const visibleNotes = payload.noteVisuals
      .filter((note) => note.type !== "hidden")
      .map((note) => ({
        id: note.id,
        x: note.x,
        y: note.y,
        timeSec: yToTime(payload, note.y),
      }))
      .sort((left, right) =>
        left.timeSec - right.timeSec
        || left.y - right.y
        || left.x - right.x
        || left.id.localeCompare(right.id),
      );
    const milestones: NoteCountMilestone[] = [];
    for (
      let index = NOTE_COUNT_MILESTONE_STEP - 1;
      index < visibleNotes.length;
      index += NOTE_COUNT_MILESTONE_STEP
    ) {
      const note = visibleNotes[index];
      milestones.push({
        y: note.y,
        count: index + 1,
      });
    }
    return milestones;
  }, [payload]);

  const segmentIndices = useMemo(
    () => Array.from({ length: segmentCount }, (_, index) => index),
    [segmentCount],
  );

  useEffect(() => {
    let framePrimary = 0;
    let frameSecondary = 0;
    framePrimary = window.requestAnimationFrame(() => {
      updateSliceHeight();
      frameSecondary = window.requestAnimationFrame(updateSliceHeight);
    });
    return () => {
      window.cancelAnimationFrame(framePrimary);
      window.cancelAnimationFrame(frameSecondary);
    };
  }, [segmentCount, totalCanvasWidthPx, updateSliceHeight, zoom]);

  useEffect(() => {
    if (!payload || !bounds || segmentCount <= 0) {
      return;
    }

    for (const index of segmentIndices) {
      const canvas = canvasRefMap.current.get(index);
      if (!canvas) {
        continue;
      }
      const segmentBottom = bounds.bottom - index * tileHeightUnscaled;
      const segmentTop = segmentBottom - tileHeightUnscaled;
      renderSegmentCanvas({
        canvas,
        payload,
        orderedSegments,
        noteCountMilestones,
        segmentTop,
        segmentBottom,
        windowHeight: tileHeightUnscaled,
        windowWidth: segmentLogicalWidth,
        boardXOffset: segmentSidePaddingPx,
        zoom,
        widthPx: segmentWidthPx,
        heightPx: sliceHeightPx,
        getImage,
      });
    }
  }, [
    bounds,
    getImage,
    noteCountMilestones,
    orderedSegments,
    payload,
    segmentCount,
    segmentIndices,
    segmentLogicalWidth,
    segmentSidePaddingPx,
    segmentWidthPx,
    sliceHeightPx,
    tileHeightUnscaled,
    zoom,
  ]);

  useEffect(() => {
    if (!payload || segmentCount <= 0 || didCompleteRenderRef.current) {
      return;
    }
    didCompleteRenderRef.current = true;
    completeLoadingProgress("预览已就绪。");
  }, [completeLoadingProgress, payload, segmentCount]);

  useEffect(() => {
    setHoverStatusLine(null);
  }, [payload, segmentCount, segmentBoardOffsetPx, segmentBoardWidthPx, segmentWidthPx, sliceHeightPx, zoom]);

  const normalizeZoomPercent = useCallback((percent: number) => {
    if (!Number.isFinite(percent)) {
      return ZOOM_MIN_PERCENT;
    }
    const clamped = clamp(Math.round(percent), ZOOM_MIN_PERCENT, ZOOM_MAX_PERCENT);
    const quantized = Math.round(clamped / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT;
    return clamp(quantized, ZOOM_MIN_PERCENT, ZOOM_MAX_PERCENT);
  }, []);

  const zoomPercent = useMemo(
    () => normalizeZoomPercent(zoom * 100),
    [normalizeZoomPercent, zoom],
  );

  const stepZoomByPercent = useCallback((deltaPercent: number) => {
    setZoom((current) => {
      const currentPercent = normalizeZoomPercent(current * 100);
      const nextPercent = normalizeZoomPercent(currentPercent + deltaPercent);
      return Number((nextPercent / 100).toFixed(4));
    });
  }, [normalizeZoomPercent]);

  const handleWheelZoom = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    const viewport = previewViewportRef.current ?? event.currentTarget;
    const primaryModifier = event.ctrlKey || event.metaKey;
    if (!primaryModifier) {
      const dominantDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (dominantDelta === 0) {
        return;
      }
      event.preventDefault();
      viewport.scrollLeft += dominantDelta;
      return;
    }
    event.preventDefault();
    if (event.deltaY === 0) {
      return;
    }
    const deltaPercent = event.deltaY < 0 ? ZOOM_STEP_PERCENT : -ZOOM_STEP_PERCENT;
    stepZoomByPercent(deltaPercent);
  }, [stepZoomByPercent]);

  const handleStripMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!payload || !bounds || segmentCount <= 0 || segmentWidthPx <= 0 || sliceHeightPx <= 0) {
      setHoverStatusLine(null);
      return;
    }
    const strip = event.currentTarget;
    const rect = strip.getBoundingClientRect();
    const relativeX = clamp(event.clientX - rect.left, 0, Math.max(0, rect.width - 1));
    const relativeY = clamp(event.clientY - rect.top, 0, Math.max(0, rect.height - 1));
    const segmentIndex = clamp(Math.floor(relativeX / segmentWidthPx), 0, segmentCount - 1);
    const segmentBottom = bounds.bottom - segmentIndex * tileHeightUnscaled;
    const segmentTop = segmentBottom - tileHeightUnscaled;
    const worldY = clamp(segmentTop + relativeY / zoom, bounds.top, bounds.bottom);
    const absoluteTimeSec = yToTime(payload, worldY);
    const visibleNoteCount = upperBoundByTime(visibleNoteTimesSec, absoluteTimeSec);
    const lineYPx = clamp((worldY - segmentTop) * zoom, 0, sliceHeightPx);
    setHoverStatusLine({
      segmentIndex,
      yPx: lineYPx,
      absoluteTimeSec,
      visibleNoteCount,
    });
  }, [
    bounds,
    payload,
    segmentCount,
    segmentWidthPx,
    sliceHeightPx,
    tileHeightUnscaled,
    visibleNoteTimesSec,
    zoom,
  ]);

  const handleStripMouseLeave = useCallback(() => {
    setHoverStatusLine(null);
  }, []);

  const handleExport = useCallback(async () => {
    if (!payload || !bounds || segmentCount <= 0) {
      showOverlayDialog({
        tone: "info",
        message: "当前没有可导出的预览内容。",
      });
      return;
    }
    const exportWidth = segmentWidthPx * segmentCount;
    const exportHeight = sliceHeightPx;
    const dynamicWidthLimit = resolveDynamicExportWidthLimit(exportHeight);
    const overHeightLimit = exportHeight > MAX_EXPORT_CANVAS_HEIGHT;
    const overWidthLimit = exportWidth > dynamicWidthLimit;
    if (overHeightLimit || overWidthLimit) {
      const reason = overHeightLimit
        ? `当前导出高度 ${exportHeight}px 超过限制 ${MAX_EXPORT_CANVAS_HEIGHT}px。`
        : `当前导出高度 ${exportHeight}px 下，最大可导出宽度为 ${dynamicWidthLimit}px（当前 ${exportWidth}px）。`;
      showOverlayDialog({
        tone: "error",
        message: `导出尺寸超过浏览器可处理上限。\n${reason}\n请降低缩放后重试。`,
      });
      return;
    }

    setIsExporting(true);
    try {
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = exportWidth;
      exportCanvas.height = exportHeight;
      const exportContext = exportCanvas.getContext("2d");
      if (!exportContext) {
        throw new Error("无法创建导出画布。");
      }

      for (let index = 0; index < segmentCount; index += 1) {
        const segmentCanvas = canvasRefMap.current.get(index);
        if (!segmentCanvas) {
          throw new Error(`缺失分段画布：${index + 1}`);
        }
        exportContext.drawImage(
          segmentCanvas,
          index * segmentWidthPx,
          0,
          segmentWidthPx,
          exportHeight,
        );
      }

      const dataUrl = exportCanvas.toDataURL("image/png");
      const base64Index = dataUrl.indexOf(",");
      if (base64Index < 0) {
        throw new Error("导出编码失败。");
      }
      const imageBase64 = dataUrl.slice(base64Index + 1);
      const defaultFileName = `${sanitizeFileName(payload.chartTitle)}-preview.png`;
      const savedPath = await invoke<string | null>("save_chart_png_via_dialog", {
        defaultFileName,
        pngBase64: imageBase64,
      });
      if (typeof savedPath === "string" && savedPath.length > 0) {
        showOverlayDialog({
          tone: "info",
          message: `导出完成：${savedPath}`,
        });
      } else {
        showOverlayDialog({
          tone: "info",
          message: "已取消导出。",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showOverlayDialog({
        tone: "error",
        message: `导出失败：${message}`,
      });
    } finally {
      setIsExporting(false);
    }
  }, [bounds, payload, segmentCount, segmentWidthPx, showOverlayDialog, sliceHeightPx]);

  return (
    <main className="static-render-page">
      <header className="static-render-toolbar">
        {isMobileRoute ? (
          <button
            type="button"
            className="command-icon-button static-render-mobile-back-button"
            onClick={navigateBackToEditor}
            title="返回编辑器"
            aria-label="返回编辑器"
          >
            <img src={backArrowIcon} alt="" aria-hidden="true" />
            <span className="sr-only">返回编辑器</span>
          </button>
        ) : null}
        <div className="static-render-toolbar-center">
          <div className="inline-stepper static-render-zoom-stepper" role="group" aria-label="缩放控制">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => stepZoomByPercent(-ZOOM_STEP_PERCENT)}
              disabled={zoomPercent <= ZOOM_MIN_PERCENT}
              title="缩小"
              aria-label="缩小"
            >
              <StepperIcon type="minus" />
            </button>
            <input
              type="text"
              className="stepper-input"
              value={`${zoomPercent}%`}
              readOnly
              tabIndex={-1}
              aria-label="缩放百分比"
            />
            <button
              type="button"
              className="stepper-btn"
              onClick={() => stepZoomByPercent(ZOOM_STEP_PERCENT)}
              disabled={zoomPercent >= ZOOM_MAX_PERCENT}
              title="放大"
              aria-label="放大"
            >
              <StepperIcon type="plus" />
            </button>
          </div>
          <button
            type="button"
            className="static-render-export-button"
            onClick={() => void handleExport()}
            disabled={!payload || isExporting}
            title={isExporting ? "导出中…" : "导出图片"}
            aria-label={isExporting ? "导出中" : "导出图片"}
          >
            <img src={imageExportIcon} alt="" aria-hidden="true" />
            <span className="sr-only">{isExporting ? "导出中…" : "导出图片"}</span>
          </button>
        </div>
      </header>

      <section
        ref={previewViewportRef}
        className="static-render-viewport"
        onWheel={handleWheelZoom}
      >
        {payload && !errorMessage ? (
          <div
            className="static-render-strip"
            onMouseMove={handleStripMouseMove}
            onMouseLeave={handleStripMouseLeave}
            style={{
              width: `${totalCanvasWidthPx}px`,
              height: `${sliceHeightPx}px`,
            }}
          >
            {segmentIndices.map((index) => (
              <canvas
                key={`render-segment-${index}`}
                className="static-render-segment-canvas"
                width={segmentWidthPx}
                height={sliceHeightPx}
                ref={(node) => {
                  if (node) {
                    canvasRefMap.current.set(index, node);
                  } else {
                    canvasRefMap.current.delete(index);
                  }
                }}
              />
            ))}
            {hoverStatusLine ? (
              <div
                className="static-render-hover-line"
                style={{
                  left: `${hoverStatusLine.segmentIndex * segmentWidthPx}px`,
                  top: `${hoverStatusLine.yPx}px`,
                  width: `${segmentWidthPx}px`,
                }}
              >
                <span
                  className="static-render-hover-label static-render-hover-label-left"
                  style={{ left: `${segmentBoardOffsetPx}px` }}
                >
                  {formatTimeLabelPrecise(hoverStatusLine.absoluteTimeSec)}
                </span>
                <span
                  className="static-render-hover-label static-render-hover-label-right"
                  style={{ left: `${segmentBoardOffsetPx + segmentBoardWidthPx}px` }}
                >
                  {String(hoverStatusLine.visibleNoteCount)}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="static-render-placeholder">
            {errorMessage || "等待预览数据…"}
          </div>
        )}
      </section>

      <DownloadProgressModal
        visible={loadingProgress.visible}
        blocking={loadingProgress.blocking}
        percent={loadingProgress.percent}
        message={loadingProgress.message}
        logs={loadingProgress.logs}
      />

      <OverlayDialogModal
        dialog={overlayDialog}
        onConfirm={closeOverlayDialog}
        onCancel={closeOverlayDialog}
      />

    </main>
  );
}
