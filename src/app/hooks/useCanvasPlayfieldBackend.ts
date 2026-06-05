import { useMemo, useRef, type RefObject } from "react";
import {
  projectCanvasRenderResourceRuntimeAssets,
  type CanvasRenderResourceRuntimeAssets,
  type SkinAssets,
} from "../../skinLoader";
import { useEditorMainLoop, type EditorMainLoopFrame } from "./useEditorMainLoop";
import type { RenderConnectionSegment, RenderSimultaneousSegment } from "./useEditorRenderModel";

const GRID_COLOR = "rgb(26, 51, 59)";
const GRID_BEAT_COLOR = "rgb(0, 166, 166)";
const GRID_MEASURE_COLOR = "rgb(0, 166, 166)";
const LANE_GUIDE_COLOR = "rgba(98, 124, 162, 0.46)";
const BOARD_BG_COLOR = "#02050d";
const BOARD_OVERSCAN_PX = 280;
const BOARD_HORIZONTAL_OVERSCAN_PX = 160;
const PLAYBACK_BOARD_OVERSCAN_PX = 160;
const PLAYBACK_BOARD_HORIZONTAL_OVERSCAN_PX = 96;
const RENDER_WINDOW_SNAP_PX = 96;
const PLAYBACK_RENDER_DPR_CAP = 1;
const MAX_RENDER_DPR = 2;
const PLAYBACK_LINE_CLEAR_HALF_BAND_PX = 4;
const PLAYBACK_VIEWPORT_EDGE_TOLERANCE_PX = 8;
const CONNECTION_SEGMENT_X_CONTINUITY_TOLERANCE_PX = 1;
const DIRECTIONAL_HEAD_INSET_RATIO = 0.55;
const DIRECTIONAL_HEAD_SCALE = 1.25;

type SegmentGeometry = {
  topX: number;
  topY: number;
  height: number;
  shearX: number;
};

type SegmentEndpoints = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

type CanvasOverlayMode = "none" | "flick" | "directional";

type CanvasNoteVisual = {
  id: string;
  type: string;
  x: number;
  y: number;
  spanLanes: number;
  base: string | null;
  overlay: string | null;
  overlayMode: CanvasOverlayMode;
  selected: boolean;
  muted?: boolean;
};

type CanvasBpmVisual = {
  key: string;
  beat: number;
  y?: number;
  bpm: number;
  selected: boolean;
};

type CanvasSvVisual = {
  key: string;
  beat: number;
  y?: number;
  value: number;
  timingGroup: string;
  selected: boolean;
};

function formatTimeLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minute = Math.floor(total / 60);
  const second = total % 60;
  return `${minute}:${String(second).padStart(2, "0")}`;
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
  xOffset: number,
  overrideFrom?: { x: number; y: number } | null,
): SegmentEndpoints {
  const rawFromX = (overrideFrom ? overrideFrom.x : segment.fromX) + xOffset;
  const rawFromY = overrideFrom ? overrideFrom.y : segment.fromY;
  return {
    fromX: rawFromX,
    fromY: snapToDevicePixel(rawFromY, pixelRatio),
    toX: segment.toX + xOffset,
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
  // B-test: force non-smoothed texture sampling for long-line segments.
  context.imageSmoothingEnabled = false;
  context.globalAlpha = segment.opacity * (segment.muted ? 0.36 : 1);
  context.translate(geometry.topX, geometry.topY);
  context.transform(1, 0, geometry.shearX, 1, 0, 0);
  context.drawImage(texture, -laneWidth * 0.5, 0, laneWidth, geometry.height);
  context.restore();
}

function isDirectionalVisual(type: string): boolean {
  return type === "directional_flick_left" || type === "directional_flick_right";
}

function drawNoteVisual(
  context: CanvasRenderingContext2D,
  note: CanvasNoteVisual,
  boardXOffset: number,
  laneWidth: number,
  noteVisualScale: number,
  getImage: (url: string | undefined | null) => HTMLImageElement | null,
  alpha = 1,
) {
  const baseImage = getImage(note.base);
  const overlayImage = getImage(note.overlay);
  if (!baseImage && !overlayImage) {
    return;
  }

  const NOTE_HEIGHT = 24 * noteVisualScale;
  const centerX = note.x + boardXOffset;
  const centerY = note.y;
  const directional = isDirectionalVisual(note.type);
  const tokenWidth = directional
    ? note.spanLanes * laneWidth
    : Math.max(1, laneWidth * (Math.max(1, note.spanLanes) + 0.25) * noteVisualScale);
  const tokenLeft = centerX - tokenWidth * 0.5;
  const tokenTop = centerY - NOTE_HEIGHT * 0.5;

  context.save();
  context.globalAlpha *= alpha;
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
          NOTE_HEIGHT,
        );
      }
    }

    if (overlayImage && note.overlayMode === "directional") {
      const headAspectRatio =
        overlayImage.naturalHeight > 0
          ? overlayImage.naturalWidth / overlayImage.naturalHeight
          : 1;
      const headHeight = NOTE_HEIGHT * DIRECTIONAL_HEAD_SCALE;
      const headWidth = Math.max(1, headHeight * headAspectRatio);
      const headInset = headWidth * DIRECTIONAL_HEAD_INSET_RATIO;
      const headLeft = note.type === "directional_flick_right"
        ? headSegmentRight - headInset
        : headSegmentLeft - headWidth + headInset;
      const headTop = tokenTop - (headHeight - NOTE_HEIGHT) * 0.5;
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
        NOTE_HEIGHT,
      );
    }

    if (overlayImage) {
      if (note.overlayMode === "flick") {
        const overlayAspectRatio =
          overlayImage.naturalHeight > 0
            ? overlayImage.naturalWidth / overlayImage.naturalHeight
            : 1;
        const overlayHeight = NOTE_HEIGHT;
        const overlayWidth = Math.max(1, overlayHeight * overlayAspectRatio);
        const overlayLeft = centerX - overlayWidth * 0.5;
        const overlayTop = tokenTop + NOTE_HEIGHT * 0.25 - overlayHeight * 0.91;
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
          NOTE_HEIGHT,
        );
      }
    }
  }

  context.restore();

}

export function useCanvasPlayfieldBackend(params: {
  enabled: boolean;
  trackCanvasRef: RefObject<HTMLCanvasElement | null>;
  noteCanvasRef: RefObject<HTMLCanvasElement | null>;
  playbackCanvasRef: RefObject<HTMLCanvasElement | null>;
  playfieldRef: RefObject<HTMLDivElement | null>;
  boardWidth: number;
  boardHeight: number;
  laneValues: number[];
  laneWidth: number;
  noteVisualScale: number;
  totalSteps: number;
  beatDivision: number;
  beatsPerMeasure: number;
  beatToY: (beat: number) => number;
  yToBeat: (y: number) => number;
  yToTime: (y: number) => number;
  timeToY: (timeSec: number) => number;
  totalDurationSec: number;
  bpmVisualLines: CanvasBpmVisual[];
  svVisualLines: CanvasSvVisual[];
  selectedLongLineSegmentId: string | null;
  simultaneousSegments: RenderSimultaneousSegment[];
  connectionSegments: RenderConnectionSegment[];
  noteVisuals: CanvasNoteVisual[];
  skinAssets: SkinAssets | null;
  getImage: (url: string | undefined | null) => HTMLImageElement | null;
  slideBuildCommittedGuideLines: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }>;
  slideBuildGuideLine: { x1: number; y1: number; x2: number; y2: number } | null;
  selectionDrag: { isDragging: boolean; startX: number; startY: number; currentX: number; currentY: number } | null;
  playbackLineVisible: boolean;
  playbackCanvasLineEnabled: boolean;
  playbackLineMode: "follow" | "free";
  playbackLinePositionPercent: number;
  getPlaybackNowTimeSec: () => number;
  useFullGridScan: boolean;
  resourcesVersion: number;
}) {
  const {
    enabled,
    trackCanvasRef,
    noteCanvasRef,
    playbackCanvasRef,
    playfieldRef,
    boardWidth,
    boardHeight,
    laneValues,
    laneWidth,
    noteVisualScale,
    totalSteps,
    beatDivision,
    beatsPerMeasure,
    beatToY,
    yToBeat,
    yToTime,
    timeToY,
    totalDurationSec,
    bpmVisualLines,
    svVisualLines,
    selectedLongLineSegmentId,
    simultaneousSegments,
    connectionSegments,
    noteVisuals,
    skinAssets,
    getImage,
    slideBuildCommittedGuideLines,
    slideBuildGuideLine,
    selectionDrag,
    playbackLineVisible,
    playbackCanvasLineEnabled,
    playbackLineMode,
    playbackLinePositionPercent,
    getPlaybackNowTimeSec,
    useFullGridScan,
    resourcesVersion,
  } = params;
  const runtimeSkin = useMemo<CanvasRenderResourceRuntimeAssets | null>(
    () => (skinAssets ? projectCanvasRenderResourceRuntimeAssets(skinAssets) : null),
    [skinAssets],
  );

  const snapshotRef = useRef<{
    boardWidth: number;
    boardHeight: number;
    laneValues: number[];
    laneWidth: number;
    noteVisualScale: number;
    totalSteps: number;
    beatDivision: number;
    beatsPerMeasure: number;
    beatToY: (beat: number) => number;
    yToBeat: (y: number) => number;
    yToTime: (y: number) => number;
    timeToY: (timeSec: number) => number;
    totalDurationSec: number;
    bpmVisualLines: CanvasBpmVisual[];
    svVisualLines: CanvasSvVisual[];
    selectedLongLineSegmentId: string | null;
    simultaneousSegments: RenderSimultaneousSegment[];
    connectionSegments: RenderConnectionSegment[];
    noteVisuals: CanvasNoteVisual[];
    runtimeSkin: CanvasRenderResourceRuntimeAssets | null;
    getImage: (url: string | undefined | null) => HTMLImageElement | null;
    slideBuildCommittedGuideLines: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }>;
    slideBuildGuideLine: { x1: number; y1: number; x2: number; y2: number } | null;
    selectionDrag: { isDragging: boolean; startX: number; startY: number; currentX: number; currentY: number } | null;
    playbackLineVisible: boolean;
    playbackCanvasLineEnabled: boolean;
    playbackLineMode: "follow" | "free";
    playbackLinePositionPercent: number;
    getPlaybackNowTimeSec: () => number;
    useFullGridScan: boolean;
    resourcesVersion: number;
  } | null>(null);
  const trackRenderMemoRef = useRef<{
    viewportTop: number;
    viewportHeight: number;
    viewportWidth: number;
    windowTop: number;
    windowBottom: number;
    windowHeight: number;
    width: number;
    boardXOffset: number;
    logicalBoardWidth: number;
    boardHeight: number;
    renderDpr: number;
    laneValuesRef: number[];
    laneWidth: number;
    totalSteps: number;
    beatDivision: number;
    beatsPerMeasure: number;
    beatToYRef: (beat: number) => number;
    useFullGridScan: boolean;
    yToBeatRef: (y: number) => number;
  } | null>(null);
  const noteRenderMemoRef = useRef<{
    viewportTop: number;
    viewportHeight: number;
    viewportWidth: number;
    windowTop: number;
    windowBottom: number;
    windowHeight: number;
    width: number;
    boardXOffset: number;
    logicalBoardWidth: number;
    boardHeight: number;
    renderDpr: number;
    resourcesVersion: number;
    laneWidth: number;
    noteVisualScale: number;
    bpmVisualLinesRef: CanvasBpmVisual[];
    svVisualLinesRef: CanvasSvVisual[];
    selectedLongLineSegmentId: string | null;
    simultaneousSegmentsRef: RenderSimultaneousSegment[];
    connectionSegmentsRef: RenderConnectionSegment[];
    noteVisualsRef: CanvasNoteVisual[];
    runtimeSkinRef: CanvasRenderResourceRuntimeAssets | null;
    slideBuildCommittedGuideLinesRef: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }>;
    slideBuildGuideLineRef: { x1: number; y1: number; x2: number; y2: number } | null;
    selectionDragRef: { isDragging: boolean; startX: number; startY: number; currentX: number; currentY: number } | null;
  } | null>(null);
  const playbackRenderMemoRef = useRef<{
    viewportTop: number;
    viewportHeight: number;
    viewportWidth: number;
    windowTop: number;
    windowBottom: number;
    windowHeight: number;
    width: number;
    boardXOffset: number;
    logicalBoardWidth: number;
    boardHeight: number;
    renderDpr: number;
    playbackRenderDpr: number;
    playbackLineVisible: boolean;
    playbackLineMode: "follow" | "free";
    playbackLinePositionPercent: number;
    playbackLineTimeSec: number;
  } | null>(null);
  const playbackLastLineYRef = useRef<number | null>(null);
  const sortedConnectionSegmentsRef = useRef<{
    source: RenderConnectionSegment[] | null;
    sorted: RenderConnectionSegment[];
  }>({
    source: null,
    sorted: [],
  });

  snapshotRef.current = {
    boardWidth,
    boardHeight,
    laneValues,
    laneWidth,
    noteVisualScale,
    totalSteps,
    beatDivision,
    beatsPerMeasure,
    beatToY,
    yToBeat,
    yToTime,
    timeToY,
    totalDurationSec,
    bpmVisualLines,
    svVisualLines,
    selectedLongLineSegmentId,
    simultaneousSegments,
    connectionSegments,
    noteVisuals,
    runtimeSkin,
    getImage,
    slideBuildCommittedGuideLines,
    slideBuildGuideLine,
    selectionDrag,
    playbackLineVisible,
    playbackCanvasLineEnabled,
    playbackLineMode,
    playbackLinePositionPercent,
    getPlaybackNowTimeSec,
    useFullGridScan,
    resourcesVersion,
  };

  const drawFrame = useMemo(() => {
    return (_frame: EditorMainLoopFrame) => {
      const snapshot = snapshotRef.current;
      const trackCanvas = trackCanvasRef.current;
      const noteCanvas = noteCanvasRef.current;
      const playbackCanvas = playbackCanvasRef.current;
      if (!enabled || !snapshot || !trackCanvas || !noteCanvas || !playbackCanvas) {
        return;
      }

      const logicalBoardWidth = Math.max(1, Math.round(snapshot.boardWidth));
      const height = Math.max(1, Math.round(snapshot.boardHeight));
      const renderDprCap = snapshot.playbackLineVisible ? PLAYBACK_RENDER_DPR_CAP : MAX_RENDER_DPR;
      const renderDpr = Math.min(
        renderDprCap,
        Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
      );
      const playbackRenderDpr = Math.min(
        MAX_RENDER_DPR,
        Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
      );
      const playfield = playfieldRef.current;
      const viewportTop = playfield ? playfield.scrollTop : 0;
      const viewportHeight = playfield ? playfield.clientHeight : height;
      const viewportBottom = viewportTop + viewportHeight;
      const viewportWidth = playfield ? playfield.clientWidth : logicalBoardWidth;
      const verticalOverscan = snapshot.playbackLineVisible ? PLAYBACK_BOARD_OVERSCAN_PX : BOARD_OVERSCAN_PX;
      const horizontalOverscan = snapshot.playbackLineVisible
        ? PLAYBACK_BOARD_HORIZONTAL_OVERSCAN_PX
        : BOARD_HORIZONTAL_OVERSCAN_PX;
      const sidePad = Math.max(
        horizontalOverscan,
        Math.ceil((viewportWidth - logicalBoardWidth) / 2) + horizontalOverscan,
      );
      const width = Math.max(1, logicalBoardWidth + sidePad * 2);
      const boardXOffset = sidePad;
      const rawWindowTop = Math.max(0, viewportTop - verticalOverscan);
      const rawWindowBottom = Math.min(height, viewportBottom + verticalOverscan);
      const windowTop = Math.max(
        0,
        Math.floor(rawWindowTop / RENDER_WINDOW_SNAP_PX) * RENDER_WINDOW_SNAP_PX,
      );
      const windowBottom = Math.max(
        Math.min(height, Math.ceil(rawWindowBottom / RENDER_WINDOW_SNAP_PX) * RENDER_WINDOW_SNAP_PX),
        windowTop + 1,
      );
      const windowHeight = Math.max(1, windowBottom - windowTop);
      const pixelWidth = Math.max(1, Math.round(width * renderDpr));
      const pixelHeight = Math.max(1, Math.round(windowHeight * renderDpr));
      const playbackPixelWidth = Math.max(1, Math.round(width * playbackRenderDpr));
      const playbackPixelHeight = Math.max(1, Math.round(viewportHeight * playbackRenderDpr));
      const trackMemo = {
        viewportTop,
        viewportHeight,
        viewportWidth,
        windowTop,
        windowBottom,
        windowHeight,
        width,
        boardXOffset,
        logicalBoardWidth,
        boardHeight: height,
        renderDpr,
        laneValuesRef: snapshot.laneValues,
        laneWidth: snapshot.laneWidth,
        totalSteps: snapshot.totalSteps,
        beatDivision: snapshot.beatDivision,
        beatsPerMeasure: snapshot.beatsPerMeasure,
        beatToYRef: snapshot.beatToY,
        useFullGridScan: snapshot.useFullGridScan,
        yToBeatRef: snapshot.yToBeat,
      };
      const previousTrackMemo = trackRenderMemoRef.current;
      const shouldDrawTrack =
        !previousTrackMemo
        || previousTrackMemo.viewportWidth !== trackMemo.viewportWidth
        || previousTrackMemo.windowTop !== trackMemo.windowTop
        || previousTrackMemo.windowBottom !== trackMemo.windowBottom
        || previousTrackMemo.windowHeight !== trackMemo.windowHeight
        || previousTrackMemo.width !== trackMemo.width
        || previousTrackMemo.boardXOffset !== trackMemo.boardXOffset
        || previousTrackMemo.logicalBoardWidth !== trackMemo.logicalBoardWidth
        || previousTrackMemo.boardHeight !== trackMemo.boardHeight
        || previousTrackMemo.renderDpr !== trackMemo.renderDpr
        || previousTrackMemo.laneValuesRef !== trackMemo.laneValuesRef
        || previousTrackMemo.laneWidth !== trackMemo.laneWidth
        || previousTrackMemo.totalSteps !== trackMemo.totalSteps
        || previousTrackMemo.beatDivision !== trackMemo.beatDivision
        || previousTrackMemo.beatsPerMeasure !== trackMemo.beatsPerMeasure
        || previousTrackMemo.beatToYRef !== trackMemo.beatToYRef
        || previousTrackMemo.useFullGridScan !== trackMemo.useFullGridScan
        || previousTrackMemo.yToBeatRef !== trackMemo.yToBeatRef;

      const noteMemo = {
        viewportTop,
        viewportHeight,
        viewportWidth,
        windowTop,
        windowBottom,
        windowHeight,
        width,
        boardXOffset,
        logicalBoardWidth,
        boardHeight: height,
        renderDpr,
        resourcesVersion: snapshot.resourcesVersion,
        laneWidth: snapshot.laneWidth,
        noteVisualScale: snapshot.noteVisualScale,
        bpmVisualLinesRef: snapshot.bpmVisualLines,
        svVisualLinesRef: snapshot.svVisualLines,
        selectedLongLineSegmentId: snapshot.selectedLongLineSegmentId,
        simultaneousSegmentsRef: snapshot.simultaneousSegments,
        connectionSegmentsRef: snapshot.connectionSegments,
        noteVisualsRef: snapshot.noteVisuals,
        runtimeSkinRef: snapshot.runtimeSkin,
        slideBuildCommittedGuideLinesRef: snapshot.slideBuildCommittedGuideLines,
        slideBuildGuideLineRef: snapshot.slideBuildGuideLine,
        selectionDragRef: snapshot.selectionDrag,
      };
      const canvasPlaybackLineVisible = snapshot.playbackLineVisible && snapshot.playbackCanvasLineEnabled;
      const playbackMemo = {
        viewportTop,
        viewportHeight,
        viewportWidth,
        windowTop,
        windowBottom,
        windowHeight,
        width,
        boardXOffset,
        logicalBoardWidth,
        boardHeight: height,
        renderDpr,
        playbackRenderDpr,
        playbackLineVisible: canvasPlaybackLineVisible,
        playbackLineMode: snapshot.playbackLineMode,
        playbackLinePositionPercent: snapshot.playbackLinePositionPercent,
        playbackLineTimeSec: snapshot.getPlaybackNowTimeSec(),
      };
      const previousNoteMemo = noteRenderMemoRef.current;
      const previousPlaybackMemo = playbackRenderMemoRef.current;
      const shouldDrawNote =
        !previousNoteMemo
        || previousNoteMemo.viewportWidth !== noteMemo.viewportWidth
        || previousNoteMemo.windowTop !== noteMemo.windowTop
        || previousNoteMemo.windowBottom !== noteMemo.windowBottom
        || previousNoteMemo.windowHeight !== noteMemo.windowHeight
        || previousNoteMemo.width !== noteMemo.width
        || previousNoteMemo.boardXOffset !== noteMemo.boardXOffset
        || previousNoteMemo.logicalBoardWidth !== noteMemo.logicalBoardWidth
        || previousNoteMemo.boardHeight !== noteMemo.boardHeight
        || previousNoteMemo.renderDpr !== noteMemo.renderDpr
        || previousNoteMemo.resourcesVersion !== noteMemo.resourcesVersion
        || previousNoteMemo.laneWidth !== noteMemo.laneWidth
        || previousNoteMemo.noteVisualScale !== noteMemo.noteVisualScale
        || previousNoteMemo.bpmVisualLinesRef !== noteMemo.bpmVisualLinesRef
        || previousNoteMemo.svVisualLinesRef !== noteMemo.svVisualLinesRef
        || previousNoteMemo.selectedLongLineSegmentId !== noteMemo.selectedLongLineSegmentId
        || previousNoteMemo.simultaneousSegmentsRef !== noteMemo.simultaneousSegmentsRef
        || previousNoteMemo.connectionSegmentsRef !== noteMemo.connectionSegmentsRef
        || previousNoteMemo.noteVisualsRef !== noteMemo.noteVisualsRef
        || previousNoteMemo.runtimeSkinRef !== noteMemo.runtimeSkinRef
        || previousNoteMemo.slideBuildCommittedGuideLinesRef !== noteMemo.slideBuildCommittedGuideLinesRef
        || previousNoteMemo.slideBuildGuideLineRef !== noteMemo.slideBuildGuideLineRef
        || previousNoteMemo.selectionDragRef !== noteMemo.selectionDragRef;
      const shouldDrawPlayback =
        !previousPlaybackMemo
        || previousPlaybackMemo.viewportHeight !== playbackMemo.viewportHeight
        || previousPlaybackMemo.viewportWidth !== playbackMemo.viewportWidth
        || previousPlaybackMemo.width !== playbackMemo.width
        || previousPlaybackMemo.boardXOffset !== playbackMemo.boardXOffset
        || previousPlaybackMemo.logicalBoardWidth !== playbackMemo.logicalBoardWidth
        || previousPlaybackMemo.boardHeight !== playbackMemo.boardHeight
        || previousPlaybackMemo.renderDpr !== playbackMemo.renderDpr
        || previousPlaybackMemo.playbackRenderDpr !== playbackMemo.playbackRenderDpr
        || previousPlaybackMemo.playbackLineVisible !== playbackMemo.playbackLineVisible
        || previousPlaybackMemo.playbackLineMode !== playbackMemo.playbackLineMode
        || previousPlaybackMemo.playbackLinePositionPercent !== playbackMemo.playbackLinePositionPercent
        || (playbackMemo.playbackLineVisible
          && previousPlaybackMemo.playbackLineTimeSec !== playbackMemo.playbackLineTimeSec);
      const playbackGeometryChanged =
        !previousPlaybackMemo
        || previousPlaybackMemo.viewportHeight !== playbackMemo.viewportHeight
        || previousPlaybackMemo.viewportWidth !== playbackMemo.viewportWidth
        || previousPlaybackMemo.width !== playbackMemo.width
        || previousPlaybackMemo.boardXOffset !== playbackMemo.boardXOffset
        || previousPlaybackMemo.logicalBoardWidth !== playbackMemo.logicalBoardWidth
        || previousPlaybackMemo.boardHeight !== playbackMemo.boardHeight
        || previousPlaybackMemo.playbackRenderDpr !== playbackMemo.playbackRenderDpr
        || previousPlaybackMemo.playbackLineVisible !== playbackMemo.playbackLineVisible
        || previousPlaybackMemo.playbackLineMode !== playbackMemo.playbackLineMode
        || previousPlaybackMemo.playbackLinePositionPercent !== playbackMemo.playbackLinePositionPercent;

      const prepareCanvas = (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
        if (canvas.width !== pixelWidth) {
          canvas.width = pixelWidth;
        }
        if (canvas.height !== pixelHeight) {
          canvas.height = pixelHeight;
        }
        const nextLeft = `${-sidePad}px`;
        const nextTop = `${windowTop}px`;
        const nextWidth = `${width}px`;
        const nextHeight = `${windowHeight}px`;
        if (canvas.style.left !== nextLeft) {
          canvas.style.left = nextLeft;
        }
        if (canvas.style.top !== nextTop) {
          canvas.style.top = nextTop;
        }
        if (canvas.style.right !== "auto") {
          canvas.style.right = "auto";
        }
        if (canvas.style.bottom !== "auto") {
          canvas.style.bottom = "auto";
        }
        if (canvas.style.width !== nextWidth) {
          canvas.style.width = nextWidth;
        }
        if (canvas.style.height !== nextHeight) {
          canvas.style.height = nextHeight;
        }
        const context = canvas.getContext("2d");
        if (!context) {
          return null;
        }
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, pixelWidth, pixelHeight);
        context.restore();
        context.save();
        context.setTransform(renderDpr, 0, 0, renderDpr, 0, 0);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        return context;
      };
      const preparePlaybackCanvas = (fullClear: boolean): CanvasRenderingContext2D | null => {
        const styleLeft = `${-sidePad}px`;
        const styleTop = `${viewportTop}px`;
        const styleWidth = `${width}px`;
        const styleHeight = `${viewportHeight}px`;
        const sizeChanged =
          playbackCanvas.width !== playbackPixelWidth
          || playbackCanvas.height !== playbackPixelHeight;
        if (sizeChanged) {
          playbackCanvas.width = playbackPixelWidth;
          playbackCanvas.height = playbackPixelHeight;
        }
        if (playbackCanvas.style.left !== styleLeft) {
          playbackCanvas.style.left = styleLeft;
        }
        if (playbackCanvas.style.top !== styleTop) {
          playbackCanvas.style.top = styleTop;
        }
        if (playbackCanvas.style.right !== "auto") {
          playbackCanvas.style.right = "auto";
        }
        if (playbackCanvas.style.bottom !== "auto") {
          playbackCanvas.style.bottom = "auto";
        }
        if (playbackCanvas.style.width !== styleWidth) {
          playbackCanvas.style.width = styleWidth;
        }
        if (playbackCanvas.style.height !== styleHeight) {
          playbackCanvas.style.height = styleHeight;
        }
        const context = playbackCanvas.getContext("2d");
        if (!context) {
          return null;
        }
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        if (fullClear || sizeChanged) {
          context.clearRect(0, 0, playbackPixelWidth, playbackPixelHeight);
        }
        context.restore();
        context.save();
        context.setTransform(playbackRenderDpr, 0, 0, playbackRenderDpr, 0, 0);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        return context;
      };

      if (shouldDrawTrack) {
        const context = prepareCanvas(trackCanvas);
        if (!context) {
          return;
        }
        trackRenderMemoRef.current = trackMemo;
        context.fillStyle = BOARD_BG_COLOR;
        context.fillRect(0, 0, width, windowHeight);

        for (let column = 0; column < snapshot.laneValues.length; column += 1) {
          context.fillStyle = column % 2 === 0 ? "rgba(8, 15, 26, 0.72)" : "rgba(12, 20, 32, 0.72)";
          context.fillRect(
            boardXOffset + column * snapshot.laneWidth,
            0,
            snapshot.laneWidth,
            windowHeight,
          );
        }

        for (let column = 1; column < snapshot.laneValues.length; column += 1) {
          const x = boardXOffset + column * snapshot.laneWidth;
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

        const beatA = snapshot.yToBeat(windowBottom);
        const beatB = snapshot.yToBeat(windowTop);
        const minBeat = Math.max(0, Math.min(beatA, beatB));
        const maxBeat = Math.max(0, Math.max(beatA, beatB));
        const minStep = snapshot.useFullGridScan
          ? 0
          : Math.max(0, Math.floor(minBeat * snapshot.beatDivision) - snapshot.beatDivision);
        const maxStep = snapshot.useFullGridScan
          ? snapshot.totalSteps
          : Math.min(
              snapshot.totalSteps,
              Math.ceil(maxBeat * snapshot.beatDivision) + snapshot.beatDivision,
            );

        for (let step = minStep; step <= maxStep; step += 1) {
          const beat = step / snapshot.beatDivision;
          const yWorld = snapshot.beatToY(beat);
          if (yWorld < windowTop - 2 || yWorld > windowBottom + 2) {
            continue;
          }
          const y = yWorld - windowTop;
          const roundedBeat = Math.round(beat);
          const isWholeBeat = Math.abs(beat - roundedBeat) < 1e-6;
          const isMeasureStart = isWholeBeat && roundedBeat % snapshot.beatsPerMeasure === 0;
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

        context.restore();
      }

      if (shouldDrawNote) {
        const context = prepareCanvas(noteCanvas);
        if (!context) {
          return;
        }
        noteRenderMemoRef.current = noteMemo;
        const frameImageCache = new Map<string, HTMLImageElement | null>();
        const getFrameImage = (url: string | undefined | null): HTMLImageElement | null => {
          if (!url) {
            return null;
          }
          const cached = frameImageCache.get(url);
          if (cached !== undefined) {
            return cached;
          }
          const resolved = snapshot.getImage(url);
          frameImageCache.set(url, resolved);
          return resolved;
        };

      const simultaneousTexture = getFrameImage(snapshot.runtimeSkin?.simultaneousLine);
      if (simultaneousTexture) {
        const lineHeight = Math.max(1, simultaneousTexture.naturalHeight / 3);
        const halfHeight = lineHeight * 0.5;
        for (const segment of snapshot.simultaneousSegments) {
          if (segment.y < windowTop - lineHeight || segment.y > windowBottom + lineHeight) {
            continue;
          }
          if (!Number.isFinite(segment.width) || segment.width <= 1e-6) {
            continue;
          }
          context.drawImage(
            simultaneousTexture,
            segment.fromX + boardXOffset,
            segment.y - windowTop - halfHeight,
            segment.width,
            lineHeight,
          );
        }
      }

      const longLineTexture = getFrameImage(snapshot.runtimeSkin?.longLine);
      const slideLineTexture = getFrameImage(
        snapshot.runtimeSkin?.longLineSpecial,
      );
      const orderedSegments = (() => {
        const cached = sortedConnectionSegmentsRef.current;
        if (cached.source === snapshot.connectionSegments) {
          return cached.sorted;
        }
        const sorted = [...snapshot.connectionSegments].sort((left, right) => {
          if (left.chainId !== right.chainId) {
            return left.chainId.localeCompare(right.chainId);
          }
          return left.index - right.index;
        });
        sortedConnectionSegmentsRef.current = {
          source: snapshot.connectionSegments,
          sorted,
        };
        return sorted;
      })();
      const chainTailById = new Map<string, { index: number; x: number }>();
      for (const segment of orderedSegments) {
        const previousTail = chainTailById.get(segment.chainId);
        const rawEndpoints = resolveSegmentEndpoints(segment, renderDpr, boardXOffset);
        const localRawEndpoints: SegmentEndpoints = {
          fromX: rawEndpoints.fromX,
          fromY: rawEndpoints.fromY - windowTop,
          toX: rawEndpoints.toX,
          toY: rawEndpoints.toY - windowTop,
        };
        const isContinuousChain = previousTail && previousTail.index + 1 === segment.index;
        const shouldKeepContinuousX = Boolean(
          isContinuousChain
          && Math.abs((previousTail?.x ?? 0) - localRawEndpoints.fromX)
            <= CONNECTION_SEGMENT_X_CONTINUITY_TOLERANCE_PX,
        );
        const shiftX = shouldKeepContinuousX
          ? (previousTail?.x ?? localRawEndpoints.fromX) - localRawEndpoints.fromX
          : snapToDevicePixel(localRawEndpoints.fromX, renderDpr) - localRawEndpoints.fromX;
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

        if (segment.maxY < windowTop - 3 || segment.minY > windowBottom + 3) {
          continue;
        }
        const texture = segment.textureKind === "slide" ? slideLineTexture : longLineTexture;
        if (!texture) {
          continue;
        }
        const longLineWidth =
          snapshot.laneWidth * Math.max(1, segment.spanLanes) * snapshot.noteVisualScale;
        drawConnectionSegment(context, segment, geometry, longLineWidth, texture);

        if (
          snapshot.selectedLongLineSegmentId
          && !segment.isPreviewChain
          && segment.groupId === snapshot.selectedLongLineSegmentId
        ) {
          context.save();
          context.translate(geometry.topX, geometry.topY);
          context.transform(1, 0, geometry.shearX, 1, 0, 0);
          const left = -longLineWidth * 0.5 - 2;
          const right = longLineWidth * 0.5 + 2;
          context.strokeStyle = "rgba(255, 89, 145, 0.46)";
          context.lineWidth = 3;
          context.beginPath();
          context.moveTo(left, 0);
          context.lineTo(left, geometry.height);
          context.moveTo(right, 0);
          context.lineTo(right, geometry.height);
          if (segment.groupStart) {
            context.moveTo(left, geometry.height);
            context.lineTo(right, geometry.height);
          }
          if (segment.groupEnd) {
            context.moveTo(left, 0);
            context.lineTo(right, 0);
          }
          context.stroke();
          context.restore();
        }
      }

      const hasSlideGuide =
        snapshot.slideBuildCommittedGuideLines.length > 0 || snapshot.slideBuildGuideLine !== null;
      if (hasSlideGuide) {
        context.save();
        context.strokeStyle = "rgba(83, 232, 140, 0.95)";
        context.lineWidth = 2.5;
        for (const line of snapshot.slideBuildCommittedGuideLines) {
          context.beginPath();
          context.moveTo(line.x1 + boardXOffset, line.y1 - windowTop);
          context.lineTo(line.x2 + boardXOffset, line.y2 - windowTop);
          context.stroke();
        }
        if (snapshot.slideBuildGuideLine) {
          context.beginPath();
          context.moveTo(
            snapshot.slideBuildGuideLine.x1 + boardXOffset,
            snapshot.slideBuildGuideLine.y1 - windowTop,
          );
          context.lineTo(
            snapshot.slideBuildGuideLine.x2 + boardXOffset,
            snapshot.slideBuildGuideLine.y2 - windowTop,
          );
          context.stroke();
        }
        context.restore();
      }

      for (const note of snapshot.noteVisuals) {
        if (note.y < windowTop - 48 || note.y > windowBottom + 48) {
          continue;
        }
        const localNote: CanvasNoteVisual = {
          ...note,
          y: note.y - windowTop,
        };
        drawNoteVisual(
          context,
          localNote,
          boardXOffset,
          snapshot.laneWidth,
          snapshot.noteVisualScale,
          getFrameImage,
          note.muted ? 0.36 : 1,
        );
      }

      context.save();
      context.strokeStyle = "rgb(217, 13, 35)";
      context.fillStyle = "rgb(217, 13, 35)";
      context.lineWidth = 1;
      context.font = "12px 'TTShinGoM', 'GB18030', sans-serif";
      context.textAlign = "left";
      context.textBaseline = "alphabetic";
      const viewportLeftOnBoard = -Math.max(0, (viewportWidth - logicalBoardWidth) / 2);
      const bpmLabelX = boardXOffset + viewportLeftOnBoard + 8;
      for (const line of snapshot.bpmVisualLines) {
        const yWorld = Number.isFinite(line.y) ? Number(line.y) : snapshot.beatToY(line.beat);
        if (yWorld < windowTop - 24 || yWorld > windowBottom + 24) {
          continue;
        }
        const y = yWorld - windowTop;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
        context.fillText(`BPM ${line.bpm.toFixed(2)}`, bpmLabelX, y - 6);
      }
      context.restore();

      context.save();
      context.strokeStyle = "rgb(42, 188, 116)";
      context.fillStyle = "rgb(42, 188, 116)";
      context.lineWidth = 1;
      context.font = "12px 'TTShinGoM', 'GB18030', sans-serif";
      context.textAlign = "left";
      context.textBaseline = "alphabetic";
      for (const line of snapshot.svVisualLines) {
        const yWorld = Number.isFinite(line.y) ? Number(line.y) : snapshot.beatToY(line.beat);
        if (yWorld < windowTop - 24 || yWorld > windowBottom + 24) {
          continue;
        }
        const y = yWorld - windowTop;
        const isNonGlobal = line.timingGroup !== "#Global";
        if (line.selected) {
          context.strokeStyle = isNonGlobal ? "rgb(123, 180, 255)" : "rgb(45, 225, 145)";
          context.fillStyle = isNonGlobal ? "rgb(123, 180, 255)" : "rgb(45, 225, 145)";
        } else {
          context.strokeStyle = isNonGlobal ? "rgb(87, 150, 255)" : "rgb(42, 188, 116)";
          context.fillStyle = isNonGlobal ? "rgb(87, 150, 255)" : "rgb(42, 188, 116)";
        }
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
        context.fillText(`×${line.value.toFixed(2)}`, bpmLabelX, y + 13);
      }
      context.restore();

      if (snapshot.selectionDrag?.isDragging) {
        const left = Math.min(snapshot.selectionDrag.startX, snapshot.selectionDrag.currentX) + boardXOffset;
        const top = Math.min(snapshot.selectionDrag.startY, snapshot.selectionDrag.currentY) - windowTop;
        const widthRect = Math.abs(snapshot.selectionDrag.currentX - snapshot.selectionDrag.startX);
        const heightRect = Math.abs(snapshot.selectionDrag.currentY - snapshot.selectionDrag.startY);
        context.save();
        context.strokeStyle = "rgba(255, 115, 166, 0.92)";
        context.lineWidth = 2;
        context.fillStyle = "rgba(255, 115, 166, 0.16)";
        context.fillRect(left, top, widthRect, heightRect);
        context.strokeRect(left, top, widthRect, heightRect);
        context.restore();
      }

      const minTime = snapshot.yToTime(windowBottom);
      const maxTime = snapshot.yToTime(windowTop);
      const firstSecond = Math.max(0, Math.floor(minTime));
      const lastSecond = Math.min(Math.ceil(snapshot.totalDurationSec), Math.ceil(maxTime));
      context.fillStyle = "rgba(222, 229, 242, 0.84)";
      context.font = "11px 'TT Shin Go M', 'GB18030', sans-serif";
      context.textAlign = "left";
      context.textBaseline = "middle";
      for (let second = firstSecond; second <= lastSecond; second += 1) {
        const yWorld = snapshot.timeToY(second);
        if (yWorld < windowTop - 6 || yWorld > windowBottom + 6) {
          continue;
        }
        context.fillText(formatTimeLabel(second), 6, yWorld - windowTop - 7);
      }

        context.restore();
      }

      if (!shouldDrawPlayback) {
        return;
      }
      const playbackContext = preparePlaybackCanvas(playbackGeometryChanged);
      if (!playbackContext) {
        return;
      }
      playbackRenderMemoRef.current = playbackMemo;
      const clearPlaybackBand = (y: number) => {
        const bandTop = y - PLAYBACK_LINE_CLEAR_HALF_BAND_PX;
        const bandHeight = PLAYBACK_LINE_CLEAR_HALF_BAND_PX * 2 + 1;
        playbackContext.clearRect(0, bandTop, width, bandHeight);
      };
      if (!playbackMemo.playbackLineVisible) {
        playbackLastLineYRef.current = null;
        playbackContext.restore();
        return;
      }
      const playbackNowTimeSec = playbackMemo.playbackLineTimeSec;
      const playbackWorldY = snapshot.timeToY(playbackNowTimeSec);
      let localY = 0;
      if (snapshot.playbackLineMode === "follow") {
        const ratioFromBottom = Math.max(0, Math.min(1, snapshot.playbackLinePositionPercent / 100));
        const anchorInViewport = viewportHeight * (1 - ratioFromBottom);
        const yInViewport = playbackWorldY - viewportTop;
        const maxScrollTop = Math.max(0, height - viewportHeight);
        const isViewportPinnedAtTop = viewportTop <= PLAYBACK_VIEWPORT_EDGE_TOLERANCE_PX;
        const isViewportPinnedAtBottom =
          viewportTop >= maxScrollTop - PLAYBACK_VIEWPORT_EDGE_TOLERANCE_PX;
        // Keep edge transition (from bottom toward anchor) when viewport is clamped at edges.
        const effectiveYInViewport = (isViewportPinnedAtTop || isViewportPinnedAtBottom)
          ? Math.max(anchorInViewport, yInViewport)
          : anchorInViewport;
        localY = effectiveYInViewport;
      } else {
        localY = playbackWorldY - viewportTop;
      }
      localY = snapToDevicePixel(localY, playbackRenderDpr);
      if (!playbackGeometryChanged) {
        const previousLineY = playbackLastLineYRef.current;
        if (previousLineY !== null) {
          clearPlaybackBand(previousLineY);
        }
      } else {
        playbackLastLineYRef.current = null;
      }
      if (localY >= -4 && localY <= viewportHeight + 4) {
        playbackContext.save();
        playbackContext.strokeStyle = "rgba(79, 213, 255, 0.32)";
        playbackContext.lineWidth = 3;
        playbackContext.beginPath();
        playbackContext.moveTo(0, localY);
        playbackContext.lineTo(width, localY);
        playbackContext.stroke();
        playbackContext.strokeStyle = "rgba(79, 213, 255, 0.98)";
        playbackContext.lineWidth = 1;
        playbackContext.beginPath();
        playbackContext.moveTo(0, localY);
        playbackContext.lineTo(width, localY);
        playbackContext.stroke();
        playbackContext.restore();
        playbackLastLineYRef.current = localY;
      } else {
        playbackLastLineYRef.current = null;
      }
      playbackContext.restore();
    };
  }, [enabled, noteCanvasRef, playbackCanvasRef, playfieldRef, trackCanvasRef]);

  useEditorMainLoop({
    enabled,
    onFrame: drawFrame,
  });

  return {
    resourcesVersion,
  };
}
