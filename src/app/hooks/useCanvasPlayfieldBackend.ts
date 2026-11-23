import { editorGridWindow, isSubdivisionLineHidden, type GridLineKind } from "../editorGridWindow";
import {
  editorDirectionalBackLineWidth,
  editorDirectionalHeadGeometry,
  editorDirectionalSegmentWidth,
  editorFlickArrowGeometry,
  editorNoteHeight,
  editorNoteTokenWidth,
  editorSimultaneousLineWidth,
  editorSlideLineWidth,
  SELECTED_HIGHLIGHT_FILTER,
  SELECTED_SEGMENT_FILTER,
} from "../editorNoteMetrics";
import { useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import {
  projectCanvasRenderResourceRuntimeAssets,
  type CanvasRenderResourceRuntimeAssets,
  type SkinAssets,
} from "../../skinLoader";
import { svEventBubbleLines } from "../../chartCore";
import { spriteMeanColor } from "../spriteOpaqueBox";
import { useEditorMainLoop, type EditorMainLoopFrame } from "./useEditorMainLoop";
import type { RenderConnectionSegment, RenderSimultaneousSegment } from "./useEditorRenderModel";

const GRID_COLOR = "rgb(125, 125, 125)";
const GRID_BEAT_COLOR = "rgb(190, 190, 190)";
const GRID_MEASURE_COLOR = "rgb(255, 255, 255)";
const GRID_SPAN_LANES = 7;
const GRID_KIND_COLOR: Record<GridLineKind, string> = {
  measure: GRID_MEASURE_COLOR,
  beat: GRID_BEAT_COLOR,
  subdivision: GRID_COLOR,
};
const SV_LINE_COLOR = "rgb(255, 59, 114)";
const LANE_CHANGE_INEFFECTIVE_COLOR = "rgb(160, 160, 160)";
/** Beats closer than 1e-6 are the same beat value (float noise from the beat grid). */
const EVENT_BEAT_KEY_SCALE = 1e6;
/** Event bubble geometry in design px; drawn times the UI scale, like the editor region and its masks around it. */
const EVENT_BUBBLE_FONT_SIZE = 12;
const EVENT_BUBBLE_FONT_FAMILY = "'ChartUI', 'TTShinGoM', sans-serif";
const EVENT_BUBBLE_TAIL = 8;
const EVENT_BUBBLE_TAIL_HALF_HEIGHT = 5;
const EVENT_BUBBLE_PADDING_X = 6;
const EVENT_BUBBLE_PADDING_Y = 4;
const EVENT_BUBBLE_LINE_HEIGHT = 14;
const EVENT_BUBBLE_RADIUS = 6;
const EVENT_BUBBLE_BORDER = 2;
const EVENT_BUBBLE_RULE = 1;
/** Space taken by the rule between two events in a shared bubble, padding included. */
const EVENT_BUBBLE_SEPARATOR_GAP = EVENT_BUBBLE_PADDING_Y * 2;

/** One event's text in a bubble, drawn in that event's colour. */
/** The event a bubble section stands for: a BPM line ("base" for Beat 0, else its event id), an SV event or a lane change. */
export type TimelineEventTarget = { kind: "bpm" | "sv" | "laneChange"; key: string };
type EventBubbleSection = { lines: string[]; color: string; target: TimelineEventTarget };
/**
 * One bubble section's box in the track canvas (CSS px), as last drawn; bubbles are the events' only hit areas.
 * `bubble` lists every event of the bubble the section belongs to.
 */
export type EventBubbleHit = {
  left: number; right: number; top: number; bottom: number;
  target: TimelineEventTarget; bubble: TimelineEventTarget[];
};

/** The bubble section under a client point, from the hits of the last frame drawn on `canvas`. */
export function hitTestEventBubble(
  hits: readonly EventBubbleHit[],
  canvas: HTMLCanvasElement | null,
  clientX: number,
  clientY: number,
): EventBubbleHit | null {
  if (!canvas || hits.length === 0) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  const cssWidth = parseFloat(canvas.style.width) || rect.width;
  const cssHeight = parseFloat(canvas.style.height) || rect.height;
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const x = (clientX - rect.left) * cssWidth / rect.width;
  const y = (clientY - rect.top) * cssHeight / rect.height;
  // Later bubbles are drawn on top, so the last match wins.
  for (let index = hits.length - 1; index >= 0; index -= 1) {
    const hit = hits[index]!;
    if (x >= hit.left && x <= hit.right && y >= hit.top && y <= hit.bottom) {
      return hit;
    }
  }
  return null;
}

/**
 * Original-style speech bubble: white body, coloured border, tail pointing right at the event line.
 * Events on the same beat share one bubble; their sections are stacked top to bottom with a rule between them.
 */
function drawEventBubble(context: CanvasRenderingContext2D, tipX: number, centerY: number, sections: EventBubbleSection[], borderColor: string, leftLimit: number, scale: number): EventBubbleHit[] {
  const tail = EVENT_BUBBLE_TAIL * scale, tailHalf = EVENT_BUBBLE_TAIL_HALF_HEIGHT * scale;
  const paddingX = EVENT_BUBBLE_PADDING_X * scale, paddingY = EVENT_BUBBLE_PADDING_Y * scale;
  const lineHeight = EVENT_BUBBLE_LINE_HEIGHT * scale, separatorGap = EVENT_BUBBLE_SEPARATOR_GAP * scale;
  context.save();
  context.font = `${EVENT_BUBBLE_FONT_SIZE * scale}px ${EVENT_BUBBLE_FONT_FAMILY}`;
  const bodyRight = tipX - tail;
  const textWidth = Math.max(...sections.flatMap(section => section.lines.map(line => context.measureText(line).width)));
  // Widen toward the editor edge (the left limit is the fully opaque edge of the mask), but never narrower than the text.
  const bodyLeft = Math.min(leftLimit, bodyRight - Math.ceil(textWidth) - paddingX * 2);
  const lineCount = sections.reduce((count, section) => count + section.lines.length, 0);
  const height = paddingY * 2 + lineHeight * lineCount + separatorGap * (sections.length - 1);
  // The tail points at the vertical centre of the box.
  const top = centerY - height / 2;
  const bottom = top + height;
  const r = EVENT_BUBBLE_RADIUS * scale;
  context.beginPath();
  context.moveTo(bodyLeft + r, top);
  context.lineTo(bodyRight - r, top);
  context.arcTo(bodyRight, top, bodyRight, top + r, r);
  context.lineTo(bodyRight, centerY - tailHalf);
  context.lineTo(tipX, centerY);
  context.lineTo(bodyRight, centerY + tailHalf);
  context.lineTo(bodyRight, bottom - r);
  context.arcTo(bodyRight, bottom, bodyRight - r, bottom, r);
  context.lineTo(bodyLeft + r, bottom);
  context.arcTo(bodyLeft, bottom, bodyLeft, bottom - r, r);
  context.lineTo(bodyLeft, top + r);
  context.arcTo(bodyLeft, top, bodyLeft + r, top, r);
  context.closePath();
  context.fillStyle = "#FFFFFF";
  context.fill();
  context.lineWidth = EVENT_BUBBLE_BORDER * scale;
  context.strokeStyle = borderColor;
  context.stroke();
  context.textAlign = "left";
  context.textBaseline = "middle";
  let y = top + paddingY;
  // Each section's hit box runs from the rule above it (or the bubble top) to the rule below it (or the bottom).
  const hits: EventBubbleHit[] = [];
  const bubble = sections.map(section => section.target);
  let sectionTop = top;
  sections.forEach((section, index) => {
    if (index > 0) {
      const ruleY = y + separatorGap / 2;
      hits[hits.length - 1]!.bottom = ruleY;
      sectionTop = ruleY;
      context.beginPath();
      context.moveTo(bodyLeft + 1, ruleY);
      context.lineTo(bodyRight - 1, ruleY);
      context.lineWidth = EVENT_BUBBLE_RULE * scale;
      context.strokeStyle = borderColor;
      context.stroke();
      y += separatorGap;
    }
    hits.push({ left: bodyLeft, right: tipX, top: sectionTop, bottom, target: section.target, bubble });
    context.fillStyle = section.color;
    for (const line of section.lines) {
      context.fillText(line, bodyLeft + paddingX, y + lineHeight / 2);
      y += lineHeight;
    }
  });
  context.restore();
  return hits;
}
const BOARD_OVERSCAN_PX = 280;
const BOARD_HORIZONTAL_OVERSCAN_PX = 160;
const RENDER_WINDOW_SNAP_PX = 96;
const MAX_RENDER_DPR = 2;
const CONNECTION_SEGMENT_X_CONTINUITY_TOLERANCE_PX = 1;
/** How much of its opacity a connection segment keeps while the Slide tool's current connection would remove it. */
const SLIDE_CONNECT_BROKEN_ALPHA = 0.3;

type SegmentGeometry = {
  topX: number;
  topY: number;
  height: number;
  shearX: number;
  /** Whether the segment's from end is its top. */
  topIsFrom: boolean;
};

type SegmentEndpoints = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

type CanvasOverlayMode = "none" | "flick" | "directional";

export type CanvasNoteVisual = {
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
  /** How far down to draw the base sprite, as a fraction of the note's height: a Slide middle node's sprite is moved so
   * its opaque part, not the whole sprite, is centred on its time. */
  baseShiftY?: number;
};

type CanvasBpmVisual = {
  key: string;
  beat: number;
  y?: number;
  bpm: number;
};

type CanvasSvVisual = {
  key: string;
  beat: number;
  y?: number;
  value: number;
  timingGroup: string;
};

/** A `#LANE_CHANGE` command; `effective` is the latest one, the only one the original applies. */
type CanvasLaneChangeVisual = {
  key: string;
  beat: number;
  y?: number;
  effective: boolean;
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

export function resolveSegmentGeometry(endpoints: SegmentEndpoints): SegmentGeometry | null {
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
    topIsFrom,
  };
}

/**
 * A Slide or Long line segment, as the original's NoteMesh: `fromWidth` wide at its from end and `toWidth` at its to
 * end, the width running linearly between them, the texture stretched over its length and across each row's width.
 *
 * Joints are drawn as a GPU rasterizes meshes that share their vertices: each row of pixels belongs to one segment
 * whole. The strip runs a little past both ends and is clipped to its own rows (a band with horizontal edges, which
 * clips exactly), so no anti-aliased partial row is drawn by two segments (two semi-transparent partial coverages
 * show as a seam). Ends of differing widths are drawn one device-pixel row at a time, each row the texture's matching
 * row stretched to that row's width and clipped to that row.
 */
export function drawConnectionSegment(
  context: CanvasRenderingContext2D,
  segment: { opacity: number; muted?: boolean },
  geometry: SegmentGeometry,
  fromWidth: number,
  toWidth: number,
  texture: HTMLImageElement,
) {
  const topWidth = geometry.topIsFrom ? fromWidth : toWidth;
  const bottomWidth = geometry.topIsFrom ? toWidth : fromWidth;
  context.save();
  // B-test: force non-smoothed texture sampling for long-line segments.
  context.imageSmoothingEnabled = false;
  context.globalAlpha = segment.opacity * (segment.muted ? 0.36 : 1);
  const base = context.getTransform();
  const devicePixelsPerUnit = Math.max(1, Math.abs(base.d));
  const overrun = 2 / devicePixelsPerUnit;
  // The band is an axis-aligned rectangle in the unsheared space (exact on device rows), as narrow as the strip.
  const halfSpan = Math.max(topWidth, bottomWidth) * 0.5 + Math.abs(geometry.shearX) * geometry.height + 4;
  context.translate(geometry.topX, geometry.topY);
  context.transform(1, 0, geometry.shearX, 1, 0, 0);
  const sheared = context.getTransform();
  const clipRows = (top: number, height: number) => {
    context.setTransform(base);
    context.beginPath();
    context.rect(geometry.topX - halfSpan, geometry.topY + top, 2 * halfSpan, height);
    context.clip();
    context.setTransform(sheared);
  };
  if (Math.abs(topWidth - bottomWidth) <= 1e-3) {
    clipRows(0, geometry.height);
    context.drawImage(texture, -topWidth * 0.5, -overrun, topWidth, geometry.height + 2 * overrun);
  } else {
    const sourceHeight = texture.naturalHeight || texture.height;
    const sourceWidth = texture.naturalWidth || texture.width;
    const rows = Math.max(1, Math.ceil(geometry.height * devicePixelsPerUnit));
    const rowHeight = geometry.height / rows;
    for (let row = 0; row < rows; row += 1) {
      const start = row / rows;
      const width = topWidth + (bottomWidth - topWidth) * (row + 0.5) / rows;
      context.save();
      clipRows(geometry.height * start, rowHeight);
      context.drawImage(texture, 0, sourceHeight * start, sourceWidth, sourceHeight / rows,
        -width * 0.5, geometry.height * start - overrun, width, rowHeight + 2 * overrun);
      context.restore();
    }
  }
  context.restore();
}

function isDirectionalVisual(type: string): boolean {
  return type === "directional_flick_left" || type === "directional_flick_right";
}

export function drawNoteVisual(
  context: CanvasRenderingContext2D,
  note: CanvasNoteVisual,
  boardXOffset: number,
  laneWidth: number,
  noteVisualScale: number,
  getImage: (url: string | undefined | null) => HTMLImageElement | null,
  alpha = 1,
  /** The line joining a multi-lane Directional's lanes, by direction. */
  directionalBackLines?: { left?: string | null; right?: string | null },
) {
  const baseImage = getImage(note.base);
  const overlayImage = getImage(note.overlay);
  if (!baseImage && !overlayImage) {
    return;
  }

  // Sizes as the original draws a note stopped on the judge line (editorNoteMetrics).
  const NOTE_HEIGHT = editorNoteHeight(laneWidth, noteVisualScale);
  const centerX = note.x + boardXOffset;
  const centerY = note.y;
  const directional = isDirectionalVisual(note.type);
  const tokenWidth = editorNoteTokenWidth(note.spanLanes, directional, laneWidth, noteVisualScale);
  const tokenLeft = centerX - tokenWidth * 0.5;
  const tokenTop = centerY - NOTE_HEIGHT * 0.5;
  const aspectOf = (image: HTMLImageElement) => image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 1;

  context.save();
  context.globalAlpha *= alpha;
  // A selected note is drawn brighter than the rest.
  if (note.selected) context.filter = SELECTED_HIGHLIGHT_FILTER;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (directional) {
    const laneCount = Math.max(1, Math.round(note.spanLanes));
    const segmentWidth = editorDirectionalSegmentWidth(laneWidth, noteVisualScale);
    const laneCenterX = (index: number) => tokenLeft + ((index + 0.5) / laneCount) * tokenWidth;
    const headIndex = note.type === "directional_flick_right" ? laneCount - 1 : 0;

    // Behind the bodies, a line joins the first and last lanes' centres.
    const backLine = laneCount > 1
      ? getImage(note.type === "directional_flick_right" ? directionalBackLines?.right : directionalBackLines?.left)
      : null;
    if (backLine) {
      const thickness = editorDirectionalBackLineWidth(laneWidth, noteVisualScale);
      context.drawImage(backLine, laneCenterX(0), centerY - thickness * 0.5, laneCenterX(laneCount - 1) - laneCenterX(0), thickness);
    }

    if (baseImage) {
      for (let index = 0; index < laneCount; index += 1) {
        context.drawImage(baseImage, laneCenterX(index) - segmentWidth * 0.5, tokenTop, segmentWidth, NOTE_HEIGHT);
      }
    }

    // The arrow head, out from its lane's centre where its loop starts.
    if (overlayImage && note.overlayMode === "directional") {
      const head = editorDirectionalHeadGeometry(laneWidth, noteVisualScale);
      const headWidth = Math.max(1, head.height * aspectOf(overlayImage));
      const headCenterX = laneCenterX(headIndex) + (note.type === "directional_flick_right" ? head.offset : -head.offset);
      context.drawImage(overlayImage, headCenterX - headWidth * 0.5, centerY - head.height * 0.5, headWidth, head.height);
    }
  } else {
    if (baseImage) {
      context.drawImage(baseImage, tokenLeft, tokenTop + (note.baseShiftY ?? 0) * NOTE_HEIGHT, tokenWidth, NOTE_HEIGHT);
    }

    if (overlayImage) {
      if (note.overlayMode === "flick") {
        // The flick arrow, above the note where its loop starts.
        const arrow = editorFlickArrowGeometry(laneWidth, noteVisualScale);
        const arrowWidth = Math.max(1, arrow.height * aspectOf(overlayImage));
        context.drawImage(overlayImage, centerX - arrowWidth * 0.5, centerY - arrow.offset - arrow.height * 0.5,
          arrowWidth, arrow.height);
      } else {
        context.drawImage(overlayImage, tokenLeft, tokenTop, tokenWidth, NOTE_HEIGHT);
      }
    }
  }

  context.restore();

}

export function useCanvasPlayfieldBackend(params: {
  enabled: boolean;
  trackCanvasRef: RefObject<HTMLCanvasElement | null>;
  noteCanvasRef: RefObject<HTMLCanvasElement | null>;
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
  laneChangeVisualLines: CanvasLaneChangeVisual[];
  selectedSlideSegmentIds: ReadonlySet<string>;
  /** The Slide tool's current connection: the chains it involves (drawn brighter) and the connection segments it
   * would remove (`chainId:index`, drawn faded). */
  slideConnectHighlight: { chainIds: ReadonlySet<string>; broken: ReadonlySet<string> } | null;
  simultaneousSegments: RenderSimultaneousSegment[];
  connectionSegments: RenderConnectionSegment[];
  noteVisuals: CanvasNoteVisual[];
  skinAssets: SkinAssets | null;
  getImage: (url: string | undefined | null) => HTMLImageElement | null;
  /** A Slide build's last node: a connection line runs from it to `slideBuildCursorRef` while that holds a point. */
  slideBuildFollowStart: { x: number; y: number; spanLanes: number; textureKind: "long" | "curveSlide"; opacity: number } | null;
  slideBuildCursorRef: RefObject<{ x: number; y: number } | null>;
  selectionDrag: { isDragging: boolean; startX: number; startY: number; currentX: number; currentY: number } | null;
  useFullGridScan: boolean;
  verticalZoom: number;
  bubbleEdgeInset: number;
  /** UI scale: event bubbles are sized in design px. */
  bubbleScale: number;
  resourcesVersion: number;
  /** Receives the bubble sections' hit boxes after each track frame. */
  eventBubbleHitsRef: MutableRefObject<EventBubbleHit[]>;
}) {
  const {
    enabled,
    trackCanvasRef,
    noteCanvasRef,
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
    laneChangeVisualLines,
    selectedSlideSegmentIds,
    slideConnectHighlight,
    simultaneousSegments,
    connectionSegments,
    noteVisuals,
    skinAssets,
    getImage,
    slideBuildFollowStart,
    slideBuildCursorRef,
    selectionDrag,
    useFullGridScan,
    verticalZoom,
    bubbleEdgeInset,
    bubbleScale,
    resourcesVersion,
    eventBubbleHitsRef,
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
    laneChangeVisualLines: CanvasLaneChangeVisual[];
    selectedSlideSegmentIds: ReadonlySet<string>;
    slideConnectHighlight: { chainIds: ReadonlySet<string>; broken: ReadonlySet<string> } | null;
    simultaneousSegments: RenderSimultaneousSegment[];
    connectionSegments: RenderConnectionSegment[];
    noteVisuals: CanvasNoteVisual[];
    runtimeSkin: CanvasRenderResourceRuntimeAssets | null;
    getImage: (url: string | undefined | null) => HTMLImageElement | null;
    slideBuildFollowStart: { x: number; y: number; spanLanes: number; textureKind: "long" | "curveSlide"; opacity: number } | null;
    slideBuildCursorRef: RefObject<{ x: number; y: number } | null>;
    selectionDrag: { isDragging: boolean; startX: number; startY: number; currentX: number; currentY: number } | null;
    useFullGridScan: boolean;
    verticalZoom: number;
    bubbleEdgeInset: number;
    bubbleScale: number;
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
    hideSubdivisionLines: boolean;
    bubbleLeftLimit: number;
    bubbleScale: number;
    yToBeatRef: (y: number) => number;
    bpmVisualLinesRef: CanvasBpmVisual[];
    svVisualLinesRef: CanvasSvVisual[];
    laneChangeVisualLinesRef: CanvasLaneChangeVisual[];
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
    selectedSlideSegmentIds: ReadonlySet<string>;
    slideConnectHighlightRef: { chainIds: ReadonlySet<string>; broken: ReadonlySet<string> } | null;
    simultaneousSegmentsRef: RenderSimultaneousSegment[];
    connectionSegmentsRef: RenderConnectionSegment[];
    noteVisualsRef: CanvasNoteVisual[];
    runtimeSkinRef: CanvasRenderResourceRuntimeAssets | null;
    slideBuildFollowStartRef: { x: number; y: number; spanLanes: number; textureKind: "long" | "curveSlide"; opacity: number } | null;
    slideBuildCursorX: number | null;
    slideBuildCursorY: number | null;
    selectionDragRef: { isDragging: boolean; startX: number; startY: number; currentX: number; currentY: number } | null;
  } | null>(null);
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
    laneChangeVisualLines,
    selectedSlideSegmentIds,
    slideConnectHighlight,
    simultaneousSegments,
    connectionSegments,
    noteVisuals,
    runtimeSkin,
    getImage,
    slideBuildFollowStart,
    slideBuildCursorRef,
    selectionDrag,
    useFullGridScan,
    verticalZoom,
    bubbleEdgeInset,
    bubbleScale,
    resourcesVersion,
  };

  const drawFrame = useMemo(() => {
    return (_frame: EditorMainLoopFrame) => {
      const snapshot = snapshotRef.current;
      const trackCanvas = trackCanvasRef.current;
      const noteCanvas = noteCanvasRef.current;
      if (!enabled || !snapshot || !trackCanvas || !noteCanvas) {
        return;
      }

      const logicalBoardWidth = Math.max(1, Math.round(snapshot.boardWidth));
      const height = Math.max(1, Math.round(snapshot.boardHeight));
      const renderDprCap = MAX_RENDER_DPR;
      const renderDpr = Math.min(
        renderDprCap,
        Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
      );
            const playfield = playfieldRef.current;
      const viewportTop = playfield ? playfield.scrollTop : 0;
      const viewportHeight = playfield ? playfield.clientHeight : height;
      const viewportBottom = viewportTop + viewportHeight;
      const viewportWidth = playfield ? playfield.clientWidth : logicalBoardWidth;
      const verticalOverscan = BOARD_OVERSCAN_PX;
      const horizontalOverscan = BOARD_HORIZONTAL_OVERSCAN_PX;
      const sidePad = Math.max(
        horizontalOverscan,
        Math.ceil((viewportWidth - logicalBoardWidth) / 2) + horizontalOverscan,
      );
      const width = Math.max(1, logicalBoardWidth + sidePad * 2);
      const boardXOffset = sidePad;
      const rawWindowTop = Math.max(0, viewportTop - verticalOverscan);
      // Event bubbles at Beat 0 extend below the board bottom, so the window may overscan past it.
      const rawWindowBottom = Math.min(height + verticalOverscan, viewportBottom + verticalOverscan);
      const windowTop = Math.max(
        0,
        Math.floor(rawWindowTop / RENDER_WINDOW_SNAP_PX) * RENDER_WINDOW_SNAP_PX,
      );
      const windowBottom = Math.max(
        Math.min(height + verticalOverscan, Math.ceil(rawWindowBottom / RENDER_WINDOW_SNAP_PX) * RENDER_WINDOW_SNAP_PX),
        windowTop + 1,
      );
      const windowHeight = Math.max(1, windowBottom - windowTop);
      const pixelWidth = Math.max(1, Math.round(width * renderDpr));
      const pixelHeight = Math.max(1, Math.round(windowHeight * renderDpr));
      // Drawing coordinates start at the canvas's left edge, which sits left of the editor region; the bubble may
      // only widen to the region edge plus the mask's solid inset, otherwise the region clips it.
      // Measured against where this frame puts the canvas (left = -sidePad), not where the last frame left it:
      // a board width change moves the canvas, and a stale position would misplace the bubbles for one frame.
      const canvasRect = trackCanvas.getBoundingClientRect();
      const styledLeft = Number.parseFloat(trackCanvas.style.left) || 0;
      const styledWidth = Number.parseFloat(trackCanvas.style.width) || 0;
      const canvasScale = styledWidth > 0 && canvasRect.width > 0 ? canvasRect.width / styledWidth : 1;
      const canvasLeft = canvasRect.left + (-sidePad - styledLeft) * canvasScale;
      const regionLeftInCanvas = ((playfieldRef.current?.getBoundingClientRect().left ?? 0) - canvasLeft) / canvasScale;
      const bubbleLeftLimit = regionLeftInCanvas + snapshot.bubbleEdgeInset;
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
        hideSubdivisionLines: isSubdivisionLineHidden(snapshot.verticalZoom),
        bubbleLeftLimit,
        bubbleScale: snapshot.bubbleScale,
        yToBeatRef: snapshot.yToBeat,
        bpmVisualLinesRef: snapshot.bpmVisualLines,
        svVisualLinesRef: snapshot.svVisualLines,
        laneChangeVisualLinesRef: snapshot.laneChangeVisualLines,
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
        || previousTrackMemo.hideSubdivisionLines !== trackMemo.hideSubdivisionLines
        || previousTrackMemo.bubbleLeftLimit !== trackMemo.bubbleLeftLimit
        || previousTrackMemo.bubbleScale !== trackMemo.bubbleScale
        || previousTrackMemo.yToBeatRef !== trackMemo.yToBeatRef
        || previousTrackMemo.bpmVisualLinesRef !== trackMemo.bpmVisualLinesRef
        || previousTrackMemo.svVisualLinesRef !== trackMemo.svVisualLinesRef
        || previousTrackMemo.laneChangeVisualLinesRef !== trackMemo.laneChangeVisualLinesRef;

      const slideBuildCursor = snapshot.slideBuildFollowStart ? snapshot.slideBuildCursorRef.current : null;
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
        selectedSlideSegmentIds: snapshot.selectedSlideSegmentIds,
        slideConnectHighlightRef: snapshot.slideConnectHighlight,
        simultaneousSegmentsRef: snapshot.simultaneousSegments,
        connectionSegmentsRef: snapshot.connectionSegments,
        noteVisualsRef: snapshot.noteVisuals,
        runtimeSkinRef: snapshot.runtimeSkin,
        slideBuildFollowStartRef: snapshot.slideBuildFollowStart,
        slideBuildCursorX: slideBuildCursor?.x ?? null,
        slideBuildCursorY: slideBuildCursor?.y ?? null,
        selectionDragRef: snapshot.selectionDrag,
      };
      const previousNoteMemo = noteRenderMemoRef.current;
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
        || previousNoteMemo.selectedSlideSegmentIds !== noteMemo.selectedSlideSegmentIds
        || previousNoteMemo.slideConnectHighlightRef !== noteMemo.slideConnectHighlightRef
        || previousNoteMemo.simultaneousSegmentsRef !== noteMemo.simultaneousSegmentsRef
        || previousNoteMemo.connectionSegmentsRef !== noteMemo.connectionSegmentsRef
        || previousNoteMemo.noteVisualsRef !== noteMemo.noteVisualsRef
        || previousNoteMemo.runtimeSkinRef !== noteMemo.runtimeSkinRef
        || previousNoteMemo.slideBuildFollowStartRef !== noteMemo.slideBuildFollowStartRef
        || previousNoteMemo.slideBuildCursorX !== noteMemo.slideBuildCursorX
        || previousNoteMemo.slideBuildCursorY !== noteMemo.slideBuildCursorY
        || previousNoteMemo.selectionDragRef !== noteMemo.selectionDragRef;

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

      if (shouldDrawTrack) {
        const context = prepareCanvas(trackCanvas);
        const gridLeft = boardXOffset + (logicalBoardWidth - GRID_SPAN_LANES * snapshot.laneWidth) / 2;
        const gridRight = gridLeft + GRID_SPAN_LANES * snapshot.laneWidth;
        if (!context) {
          return;
        }
        trackRenderMemoRef.current = trackMemo;
        // Only in-track targets (grid, horizontal lines, notes) stop at the board bottom (Beat 0); bubbles are not clipped.
        context.save();
        context.beginPath();
        context.rect(0, 0, width, height - windowTop + 1);
        context.clip();

        for (const { y: yWorld, kind } of editorGridWindow({ top: windowTop, bottom: windowBottom,
          totalSteps: snapshot.totalSteps, beatDivision: snapshot.beatDivision, beatsPerMeasure: snapshot.beatsPerMeasure,
          verticalZoom: snapshot.verticalZoom,
          beatToY: snapshot.beatToY, yToBeat: snapshot.yToBeat, fullScan: snapshot.useFullGridScan })) {
          const y = yWorld - windowTop;
          context.strokeStyle = GRID_KIND_COLOR[kind];
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(gridLeft, y);
          context.lineTo(gridRight, y);
          context.stroke();
        }

        // Event lines span the track zone, which the board always fills.
        const eventLineWidth = logicalBoardWidth;
        const eventLineLeft = (width - eventLineWidth) / 2;
        // Events are collected first, then merged per beat value (not per time: equal times at different beats stay
        // apart). Each beat gets one line and one bubble listing its events in BPM, SV, lane-change order.
        // Colour priority for the shared line and border: normal, then inactive.
        type EditorEvent = { beat: number; y: number; section: EventBubbleSection; rank: number };
        const events: EditorEvent[] = [];
        const visibleY = (line: { y?: number; beat: number }) => {
          const yWorld = Number.isFinite(line.y) ? Number(line.y) : snapshot.beatToY(line.beat);
          return yWorld < windowTop - 24 || yWorld > windowBottom + 24 ? null : yWorld - windowTop;
        };
        for (const line of snapshot.bpmVisualLines) {
          const y = visibleY(line);
          if (y === null) continue;
          events.push({ beat: line.beat, y, rank: 1,
            section: { lines: ["BPM", String(Number(line.bpm.toFixed(2)))],
              color: SV_LINE_COLOR, target: { kind: "bpm", key: line.key } } });
        }
        for (const line of snapshot.svVisualLines) {
          const y = visibleY(line);
          if (y === null) continue;
          events.push({ beat: line.beat, y, rank: 1,
            section: { lines: svEventBubbleLines(line.timingGroup, line.value), color: SV_LINE_COLOR,
              target: { kind: "sv", key: line.key } } });
        }
        for (const line of snapshot.laneChangeVisualLines) {
          const y = visibleY(line);
          if (y === null) continue;
          // Only the latest command changes the lanes; earlier ones are drawn but muted.
          events.push({ beat: line.beat, y, rank: line.effective ? 1 : 0,
            section: { lines: ["LANE CHANGE"], color: line.effective ? SV_LINE_COLOR : LANE_CHANGE_INEFFECTIVE_COLOR,
              target: { kind: "laneChange", key: line.key } } });
        }
        const groups = new Map<number, EditorEvent[]>();
        for (const event of events) {
          const key = Math.round(event.beat * EVENT_BEAT_KEY_SCALE);
          const group = groups.get(key);
          if (group) group.push(event); else groups.set(key, [event]);
        }
        const eventBubbles: Array<{ y: number; sections: EventBubbleSection[]; color: string }> = [];
        context.save();
        context.lineWidth = 2;
        for (const group of groups.values()) {
          const lead = group.reduce((best, event) => event.rank > best.rank ? event : best);
          const y = group[0]!.y;
          context.strokeStyle = lead.section.color;
          context.beginPath();
          context.moveTo(eventLineLeft, y);
          context.lineTo(eventLineLeft + eventLineWidth, y);
          context.stroke();
          eventBubbles.push({ y, sections: group.map(event => event.section), color: lead.section.color });
        }
        context.restore();
        context.restore();
        const bubbleHits: EventBubbleHit[] = [];
        for (const bubble of eventBubbles) {
          bubbleHits.push(...drawEventBubble(context, eventLineLeft, bubble.y, bubble.sections, bubble.color, trackMemo.bubbleLeftLimit, trackMemo.bubbleScale));
        }
        eventBubbleHitsRef.current = bubbleHits;
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
        const lineHeight = Math.max(1, editorSimultaneousLineWidth(snapshot.laneWidth, snapshot.noteVisualScale));
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
      const curveSlideLineTexture = getFrameImage(
        snapshot.runtimeSkin?.curveSlideLine,
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
      // The selected Slide segments' glow, kept inside their lines: their outline (to clip to) and their side edges,
      // drawn at once once the lines are (no brighter spots where two segments meet).
      const selectedArea = new Path2D();
      const selectedEdges = new Path2D();
      let selectedGlowColor: [number, number, number] | null = null;
      let selectedGlowWidth = 0;
      for (const segment of orderedSegments) {
        const previousTail = chainTailById.get(segment.chainId);
        const rawEndpoints = resolveSegmentEndpoints(segment, renderDpr, boardXOffset);
        const localRawEndpoints: SegmentEndpoints = {
          fromX: rawEndpoints.fromX,
          // A joint's Y on a device pixel boundary: both segments then cover its rows whole, as a GPU rasterizes
          // two meshes sharing the joint's vertices (no anti-aliased partial rows drawn twice, which shows as a seam).
          fromY: snapToDevicePixel(rawEndpoints.fromY - windowTop, renderDpr),
          toX: rawEndpoints.toX,
          toY: snapToDevicePixel(rawEndpoints.toY - windowTop, renderDpr),
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
        const texture = segment.textureKind === "curveSlide" ? curveSlideLineTexture : longLineTexture;
        if (!texture) {
          continue;
        }
        const lineWidthAt = (lanes: number) => editorSlideLineWidth(lanes, snapshot.laneWidth, snapshot.noteVisualScale);
        // A selected Slide segment is drawn brighter (its end notes are not: they are not selected with it).
        // So is every segment of a chain the Slide tool's current connection involves; a segment that connection
        // would remove is drawn faded.
        const connect = snapshot.slideConnectHighlight;
        const broken = connect !== null && connect.broken.has(`${segment.chainId}:${segment.index}`);
        const selected = !segment.isPreviewChain && !broken && snapshot.selectedSlideSegmentIds.has(segment.slideSegmentId);
        const highlighted = selected
          || (!segment.isPreviewChain && !broken && connect !== null && connect.chainIds.has(segment.chainId));
        if (highlighted) {
          context.save();
          context.filter = selected ? SELECTED_SEGMENT_FILTER : SELECTED_HIGHLIGHT_FILTER;
        }
        drawConnectionSegment(context, broken ? { ...segment, opacity: segment.opacity * SLIDE_CONNECT_BROKEN_ALPHA }
          : selected ? { ...segment, opacity: 1 } : segment,
          geometry, lineWidthAt(segment.fromSpanLanes), lineWidthAt(segment.toSpanLanes), texture);
        if (highlighted) context.restore();
        if (selected) {
          const fromHalf = lineWidthAt(segment.fromSpanLanes) / 2, toHalf = lineWidthAt(segment.toSpanLanes) / 2;
          const topHalf = geometry.topIsFrom ? fromHalf : toHalf;
          const bottomHalf = geometry.topIsFrom ? toHalf : fromHalf;
          const bottomX = geometry.topX + geometry.shearX * geometry.height;
          const bottomY = geometry.topY + geometry.height;
          selectedArea.moveTo(geometry.topX - topHalf, geometry.topY);
          selectedArea.lineTo(geometry.topX + topHalf, geometry.topY);
          selectedArea.lineTo(bottomX + bottomHalf, bottomY);
          selectedArea.lineTo(bottomX - bottomHalf, bottomY);
          selectedArea.closePath();
          selectedEdges.moveTo(geometry.topX - topHalf, geometry.topY);
          selectedEdges.lineTo(bottomX - bottomHalf, bottomY);
          selectedEdges.moveTo(geometry.topX + topHalf, geometry.topY);
          selectedEdges.lineTo(bottomX + bottomHalf, bottomY);
          selectedGlowColor ??= spriteMeanColor(texture.currentSrc || texture.src) ?? [110, 230, 100];
          selectedGlowWidth = Math.max(selectedGlowWidth, Math.max(fromHalf, toHalf) * 0.7);
        }
      }
      if (selectedGlowColor) {
        // An inner glow along the lines' sides, in their own colour made as bright as it goes without changing hue
        // (its largest channel at 255), clipped to the lines.
        const [r, g, b] = selectedGlowColor;
        const scale = 255 / Math.max(1, r, g, b);
        context.save();
        context.clip(selectedArea);
        context.filter = `blur(${selectedGlowWidth * 0.35}px)`;
        context.lineWidth = selectedGlowWidth;
        context.lineCap = "butt";
        context.strokeStyle = `rgba(${Math.round(r * scale)}, ${Math.round(g * scale)}, ${Math.round(b * scale)}, 0.85)`;
        context.stroke(selectedEdges);
        context.restore();
      }

      // A Slide build's connection line from its last node to the pointer, as its other connection lines are drawn.
      const followStart = snapshot.slideBuildFollowStart;
      if (followStart && slideBuildCursor) {
        const texture = followStart.textureKind === "curveSlide" ? curveSlideLineTexture : longLineTexture;
        const geometry = resolveSegmentGeometry({
          fromX: followStart.x + boardXOffset,
          fromY: snapToDevicePixel(followStart.y - windowTop, renderDpr),
          toX: slideBuildCursor.x + boardXOffset,
          toY: snapToDevicePixel(slideBuildCursor.y - windowTop, renderDpr),
        });
        if (texture && geometry) {
          const lineWidthAt = (lanes: number) => editorSlideLineWidth(lanes, snapshot.laneWidth, snapshot.noteVisualScale);
          // The pointer end is a new node's width: the Slide tool places one-lane nodes.
          drawConnectionSegment(context, { opacity: followStart.opacity }, geometry, lineWidthAt(followStart.spanLanes),
            lineWidthAt(1), texture);
        }
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
          { left: snapshot.runtimeSkin?.directionalBackLineLeft, right: snapshot.runtimeSkin?.directionalBackLineRight },
        );
      }

      const minTime = snapshot.yToTime(windowBottom);
      const maxTime = snapshot.yToTime(windowTop);
      const firstSecond = Math.max(0, Math.floor(minTime));
      const lastSecond = Math.min(Math.ceil(snapshot.totalDurationSec), Math.ceil(maxTime));
      context.fillStyle = "rgba(222, 229, 242, 0.84)";
      context.font = "11px 'ChartUI', 'TTShinGoM', sans-serif";
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

    };
  }, [enabled, noteCanvasRef, playfieldRef, trackCanvasRef]);

  useEditorMainLoop({
    enabled,
    onFrame: drawFrame,
  });

  return {
    resourcesVersion,
  };
}
