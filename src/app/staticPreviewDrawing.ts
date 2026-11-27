import { beatToSeconds, GLOBAL_TIMING_GROUP_ID, normalizeTimingGroup, timingGroupDisplayName } from "../chartCore";
import { editorSimultaneousLineWidth, editorSlideLineWidth } from "./editorNoteMetrics";
import {
  drawConnectionSegment,
  drawNoteVisual,
  EVENT_BEAT_KEY_SCALE,
  GRID_SPAN_LANES,
  LANE_CHANGE_INEFFECTIVE_COLOR,
  resolveSegmentGeometry,
  SV_LINE_COLOR,
} from "./hooks/useCanvasPlayfieldBackend";
import type { RenderConnectionSegment } from "./hooks/useEditorRenderModel";
import { previewColumnStart, previewColumnTime, previewColumnY, type PreviewLayout } from "./staticPreviewLayout";
import type { StaticRenderPayload } from "./staticRenderTypes";

/*
 * One preview column, drawn as the editor draws its board (useCanvasPlayfieldBackend): the flat lane art, the lane
 * range guides of an extended lane count, measure lines, event lines, sync lines, Long and Slide lines and notes; then
 * (drawPreviewColumnLabels) time and event labels on the left and note counts on the right.
 */

/*
 * Three tiers of lines, as the preview is read: notes, Long/Slide lines and sync lines first (sync lines never thinner
 * than SYNC_LINE_MIN_WIDTH); event lines next (thin, slightly faded); measure lines last, a faint guide.
 */
const SYNC_LINE_MIN_WIDTH = 2;
const EVENT_LINE_WIDTH = 1;
const EVENT_LINE_ALPHA = 0.8;
const MEASURE_LINE_COLOR = "rgba(220, 230, 255, 0.3)";
const MEASURE_LINE_WIDTH = 1;
/** Beat lines (the beats between the measure lines): fainter still. */
const BEAT_LINE_COLOR = "rgba(220, 230, 255, 0.15)";
/** Extended lanes' guides: the range's edges as the measure lines, the borders between its lanes fainter. */
const LANE_INNER_GUIDE_COLOR = "rgba(220, 230, 255, 0.16)";
/** Event labels: in the event's colour (an inactive lane change's grey), one line per event. */
const EVENT_LABEL_LINE_HEIGHT = 14;
const LABEL_COLOR = "rgba(222, 229, 242, 0.84)";
const LABEL_OUTLINE_COLOR = "rgba(6, 12, 32, 0.85)";
const LABEL_FONT_SIZE = 12;
const LABEL_FONT_FAMILY = "'ChartUI', 'TTShinGoM', sans-serif";
const NOTE_COUNT_STEP = 50;
/** Seconds between time labels. */
const TIME_LABEL_STEP = 5;
/** Design px between a label and the track's outer edge. */
const LABEL_GAP = 6;
const CONNECTION_X_CONTINUITY_TOLERANCE_PX = 1;

type EventLabel = { text: string; color: string };
type PreviewEvent = { time: number; lines: EventLabel[]; color: string };

/** What every column draws from, worked out once per chart. */
export type PreviewScene = {
  payload: StaticRenderPayload;
  measureTimes: number[];
  /** The other whole beats' times. */
  beatTimes: number[];
  events: PreviewEvent[];
  orderedSegments: RenderConnectionSegment[];
  /** Every NOTE_COUNT_STEP-th note's time and count. */
  milestones: { time: number; count: number }[];
  /** Visible notes' times, sorted (for the note count up to a time). */
  noteTimes: number[];
};

export function buildPreviewScene(payload: StaticRenderPayload): PreviewScene {
  const timeOf = (beat: number) => beatToSeconds(beat, payload.bpmTimeline);
  const measureTimes: number[] = [];
  const measure = Math.max(1, payload.beatsPerMeasure);
  const beatTimes: number[] = [];
  for (let beat = 0; beat <= payload.totalBeats + 1e-6; beat += 1) (beat % measure === 0 ? measureTimes : beatTimes).push(timeOf(beat));

  // As the editor: events merged per beat value, one line and one bubble listing them in BPM, SV, lane-change order;
  // the line takes a normal event's colour over an inactive one's. Each event is one line of its label here.
  type Item = { beat: number; line: EventLabel; color: string; rank: number };
  const items: Item[] = [];
  for (const line of payload.bpmVisualLines) {
    items.push({ beat: line.beat, rank: 1, color: SV_LINE_COLOR,
      line: { text: `BPM ${Number(line.bpm.toFixed(2))}`, color: SV_LINE_COLOR } });
  }
  for (const line of payload.svVisualLines) {
    // The global group's SV is its value alone; another group's is prefixed with its name.
    const group = normalizeTimingGroup(line.timingGroup, GLOBAL_TIMING_GROUP_ID);
    const value = `×${Number(line.value.toFixed(2))}`;
    items.push({ beat: line.beat, rank: 1, color: SV_LINE_COLOR, line: {
      text: group === GLOBAL_TIMING_GROUP_ID ? value : `${timingGroupDisplayName(group)} ${value}`, color: SV_LINE_COLOR } });
  }
  for (const line of payload.laneChangeVisualLines) {
    const color = line.effective ? SV_LINE_COLOR : LANE_CHANGE_INEFFECTIVE_COLOR;
    items.push({ beat: line.beat, rank: line.effective ? 1 : 0, color, line: { text: "LANE CHANGE", color } });
  }
  const groups = new Map<number, Item[]>();
  for (const item of items) {
    const key = Math.round(item.beat * EVENT_BEAT_KEY_SCALE);
    const group = groups.get(key);
    if (group) group.push(item); else groups.set(key, [item]);
  }
  const events = [...groups.values()].map(group => {
    const lead = group.reduce((best, item) => item.rank > best.rank ? item : best);
    return { time: timeOf(group[0]!.beat), lines: group.map(item => item.line), color: lead.color };
  });

  const orderedSegments = [...payload.connectionSegments].sort((left, right) =>
    left.chainId !== right.chainId ? left.chainId.localeCompare(right.chainId) : left.index - right.index);

  const visible = payload.noteVisuals.filter(note => note.type !== "hidden")
    .sort((left, right) => left.timeSec - right.timeSec || left.x - right.x || left.id.localeCompare(right.id));
  const milestones: PreviewScene["milestones"] = [];
  for (let index = NOTE_COUNT_STEP - 1; index < visible.length; index += NOTE_COUNT_STEP) {
    milestones.push({ time: visible[index]!.timeSec, count: index + 1 });
  }
  return { payload, measureTimes, beatTimes, events, orderedSegments, milestones, noteTimes: visible.map(note => note.timeSec) };
}

/** How many visible notes are at or before `time`. */
export function noteCountUpTo(scene: PreviewScene, time: number): number {
  let low = 0, high = scene.noteTimes.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (scene.noteTimes[mid]! <= time + 1e-6) low = mid + 1; else high = mid;
  }
  return low;
}

export type PreviewImages = {
  /** A skin image by its payload resource key. */
  image(key: string | null | undefined): HTMLImageElement | null;
  /** By URL (drawNoteVisual's lookup). */
  byUrl(url: string | null | undefined): HTMLImageElement | null;
  url(key: string | null | undefined): string | null;
  /** The flat lane art, or null while it is not ready: `after` from `swapTimeSec` on (a HABAHIRO lane change). */
  laneArt: { before: CanvasImageSource; after: CanvasImageSource | null; swapTimeSec: number | null } | null;
};

function formatSecond(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function snap(value: number, ratio: number): number {
  return Math.round(value * ratio) / ratio;
}

/**
 * Draws column `column` with its left edge at `originX` (CSS px) on `context`, whose transform maps CSS px to device
 * px (`pixelRatio` device px each).
 */
export function drawPreviewColumn(context: CanvasRenderingContext2D, layout: PreviewLayout, scene: PreviewScene,
  images: PreviewImages, column: number, originX: number, pixelRatio: number) {
  const { payload } = scene;
  const { height, lane, scale } = layout;
  const info = layout.columns[column]!;
  // The standard track (lanes 0-6) and, with this column's extra lanes, the lane range it shows.
  const boardLeft = originX + info.boardLeft;
  const boardRight = boardLeft + layout.trackWidth;
  const rangeLeft = boardLeft - info.extra * lane, rangeRight = boardRight + info.extra * lane;
  const top = previewColumnTime(layout, column, -24 * scale), bottom = previewColumnTime(layout, column, height + 24 * scale);
  const inRange = (time: number, margin = 0) => time >= bottom - margin && time <= top + margin;
  const yOf = (time: number) => previewColumnY(layout, column, time);
  const xOf = (lanes: number) => boardLeft + (lanes - layout.laneOffset) * lane;
  const marginTime = 48 * scale / layout.pixelsPerSecond;

  context.save();
  context.beginPath();
  context.rect(originX, 0, info.width, height);
  context.clip();

  const art = images.laneArt;
  if (art) {
    const drawArt = (source: CanvasImageSource, top: number, bottom: number) => {
      if (bottom <= top) return;
      context.save();
      context.beginPath();
      context.rect(originX + info.artLeft, top, layout.artWidth, bottom - top);
      context.clip();
      context.drawImage(source, originX + info.artLeft, 0, layout.artWidth, height);
      context.restore();
    };
    // Earlier times are lower: the art before the swap below its y, the art after above it.
    const swapY = art.after && art.swapTimeSec !== null ? Math.min(height, Math.max(0, yOf(art.swapTimeSec))) : height;
    drawArt(art.before, swapY, height);
    if (art.after) drawArt(art.after, 0, swapY);
  }

  if (info.extra > 0) {
    // The lane range's edges and the borders between the outer lanes (the editor's EditorLaneRangeGuides), thin and
    // faint like the measure lines; on a device pixel column's centre, so they stay sharp.
    const extra = info.extra;
    const guide = (x: number, color: string) => {
      const snapped = (Math.floor(x * pixelRatio) + 0.5) / pixelRatio;
      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(snapped, 0);
      context.lineTo(snapped, height);
      context.stroke();
    };
    context.save();
    context.lineWidth = MEASURE_LINE_WIDTH;
    context.setLineDash([4, 4]);
    guide(rangeLeft, MEASURE_LINE_COLOR);
    guide(rangeRight, MEASURE_LINE_COLOR);
    for (let index = 1; index < extra; index += 1) {
      guide(rangeLeft + index * lane, LANE_INNER_GUIDE_COLOR);
      guide(rangeRight - index * lane, LANE_INNER_GUIDE_COLOR);
    }
    context.restore();
  }

  // Beat and measure lines across the standard seven lanes, as the editor's grid.
  const gridLeft = boardLeft;
  context.lineWidth = MEASURE_LINE_WIDTH;
  for (const [times, color] of [[scene.beatTimes, BEAT_LINE_COLOR], [scene.measureTimes, MEASURE_LINE_COLOR]] as const) {
    context.strokeStyle = color;
    for (const time of times) {
      if (!inRange(time)) continue;
      // On a device pixel row's centre, so the thin line stays sharp.
      const y = (Math.floor(yOf(time) * pixelRatio) + 0.5) / pixelRatio;
      context.beginPath();
      context.moveTo(gridLeft, y);
      context.lineTo(gridLeft + GRID_SPAN_LANES * lane, y);
      context.stroke();
    }
  }

  const visibleEvents = scene.events.filter(event => inRange(event.time));
  context.save();
  context.globalAlpha = EVENT_LINE_ALPHA;
  context.lineWidth = EVENT_LINE_WIDTH;
  for (const event of visibleEvents) {
    const y = (Math.floor(yOf(event.time) * pixelRatio) + 0.5) / pixelRatio;
    context.strokeStyle = event.color;
    context.beginPath();
    context.moveTo(rangeLeft, y);
    context.lineTo(rangeRight, y);
    context.stroke();
  }
  context.restore();

  const simultaneous = images.image(payload.runtimeSkin.simultaneousLineResourceKey);
  if (simultaneous) {
    const thickness = Math.max(SYNC_LINE_MIN_WIDTH, editorSimultaneousLineWidth(lane, payload.noteVisualScale));
    for (const segment of payload.simultaneousSegments) {
      if (!inRange(segment.y, marginTime) || !(segment.width > 1e-6)) continue;
      context.drawImage(simultaneous, xOf(segment.fromX), yOf(segment.y) - thickness / 2, segment.width * lane, thickness);
    }
  }

  const longLine = images.image(payload.runtimeSkin.longLineResourceKey);
  const curveLine = images.image(payload.runtimeSkin.curveSlideLineResourceKey);
  const lineWidthAt = (lanes: number) => editorSlideLineWidth(lanes, lane, payload.noteVisualScale);
  const chainTail = new Map<string, { index: number; x: number }>();
  for (const segment of scene.orderedSegments) {
    if (segment.maxY < bottom - marginTime || segment.minY > top + marginTime) continue;
    const texture = segment.textureKind === "curveSlide" ? curveLine : longLine;
    if (!texture) continue;
    const fromX = xOf(segment.fromX), toX = xOf(segment.toX);
    // A joint on a device pixel row and a chain's x kept continuous, as the editor draws them (no seams).
    const previous = chainTail.get(segment.chainId);
    const continuous = previous && previous.index + 1 === segment.index
      && Math.abs(previous.x - fromX) <= CONNECTION_X_CONTINUITY_TOLERANCE_PX;
    const shift = continuous ? previous!.x - fromX : snap(fromX, pixelRatio) - fromX;
    const geometry = resolveSegmentGeometry({ fromX: fromX + shift, fromY: snap(yOf(segment.fromY), pixelRatio),
      toX: toX + shift, toY: snap(yOf(segment.toY), pixelRatio) });
    if (!geometry) continue;
    chainTail.set(segment.chainId, { index: segment.index, x: toX + shift });
    drawConnectionSegment(context, { opacity: segment.opacity }, geometry, lineWidthAt(segment.fromSpanLanes),
      lineWidthAt(segment.toSpanLanes), texture);
  }

  const backLines = { left: images.url(payload.runtimeSkin.directionalBackLineLeftResourceKey),
    right: images.url(payload.runtimeSkin.directionalBackLineRightResourceKey) };
  for (const note of payload.noteVisuals) {
    if (!inRange(note.timeSec, marginTime)) continue;
    drawNoteVisual(context, {
      id: note.id, type: note.type, x: xOf(note.x), y: yOf(note.timeSec), spanLanes: note.spanLanes,
      base: images.url(note.baseResourceKey), overlay: images.url(note.overlayResourceKey), overlayMode: note.overlayMode,
      selected: false, ...(note.baseShiftY === undefined ? {} : { baseShiftY: note.baseShiftY }),
    }, 0, lane, payload.noteVisualScale, images.byUrl, 1, backLines);
  }

  context.restore();
}

/**
 * Column `column`'s labels, drawn after every column's track (drawPreviewColumn) and not clipped to the column: a label
 * may reach past its gutter. Time labels every TIME_LABEL_STEP seconds and event labels are right-aligned to the
 * track's outer left edge, note counts left-aligned to its outer right edge, each centred on its time and outlined; an
 * event's label takes the place of a time label it would cover.
 */
export function drawPreviewColumnLabels(context: CanvasRenderingContext2D, layout: PreviewLayout, scene: PreviewScene,
  column: number, originX: number) {
  const scale = layout.scale * layout.labelScale;
  const info = layout.columns[column]!;
  const extraWidth = info.extra * layout.lane;
  const outerRight = originX + Math.max(info.artLeft + layout.artWidth, info.boardLeft + layout.trackWidth + extraWidth)
    + LABEL_GAP * scale;
  context.save();
  context.strokeStyle = LABEL_OUTLINE_COLOR;
  context.lineWidth = 3 * scale;
  context.lineJoin = "round";
  context.font = `${LABEL_FONT_SIZE * scale}px ${LABEL_FONT_FAMILY}`;
  context.textBaseline = "middle";
  const label = (text: string, x: number, y: number, color: string) => {
    context.strokeText(text, x, y);
    context.fillStyle = color;
    context.fillText(text, x, y);
  };
  context.textAlign = "right";
  for (const item of leftLabels(context, layout, scene, column, originX)) label(item.text, item.right, item.y, item.color);
  // A note count gives way (a line up, then down) to the next column's left labels, which share its gap.
  const lineHeight = EVENT_LABEL_LINE_HEIGHT * scale;
  const next = column + 1 < layout.columns.length ? leftLabels(context, layout, scene, column + 1, originX + info.width) : [];
  const yOf = (time: number) => previewColumnY(layout, column, time);
  const range = columnLabelRange(layout, column);
  context.textAlign = "left";
  for (const milestone of scene.milestones) {
    if (milestone.time < range.bottom || milestone.time > range.top) continue;
    const text = String(milestone.count), right = outerRight + context.measureText(text).width;
    const clear = (y: number) => !next.some(item => item.left < right && item.right > outerRight
      && Math.abs(item.y - y) < lineHeight);
    const base = yOf(milestone.time);
    const y = [base, base - lineHeight, base + lineHeight].find(clear) ?? base;
    label(text, outerRight, y, LABEL_COLOR);
  }
  context.restore();
}

/** The times a column's labels are for: its own range, so a time on a cut is labelled once (in the later column). */
function columnLabelRange(layout: PreviewLayout, column: number) {
  const bottom = previewColumnStart(layout, column);
  return { bottom, top: bottom + layout.span - 1e-6 };
}

/**
 * A column's left labels (event labels, then the time labels they do not cover), right-aligned to its track's outer
 * left edge; `context` carries the label font, for their widths.
 */
function leftLabels(context: CanvasRenderingContext2D, layout: PreviewLayout, scene: PreviewScene, column: number,
  originX: number): { text: string; color: string; y: number; left: number; right: number }[] {
  const scale = layout.scale * layout.labelScale;
  const info = layout.columns[column]!;
  const right = originX + Math.min(info.artLeft, info.boardLeft - info.extra * layout.lane) - LABEL_GAP * scale;
  const { top, bottom } = columnLabelRange(layout, column);
  const yOf = (time: number) => previewColumnY(layout, column, time);
  const lineHeight = EVENT_LABEL_LINE_HEIGHT * scale;
  const labels: { text: string; color: string; y: number; left: number; right: number }[] = [];
  const add = (text: string, color: string, y: number) =>
    labels.push({ text, color, y, right, left: right - context.measureText(text).width });
  const taken: { top: number; bottom: number }[] = [];
  for (const event of scene.events) {
    if (event.time < bottom || event.time > top) continue;
    // Centred on its time, kept inside the column (an event at a column's start is at its bottom edge).
    const centred = yOf(event.time) - lineHeight * (event.lines.length - 1) / 2;
    const first = Math.min(Math.max(centred, lineHeight / 2), layout.height - lineHeight * (event.lines.length - 0.5));
    event.lines.forEach((line, index) => add(line.text, line.color, first + lineHeight * index));
    taken.push({ top: first - lineHeight / 2, bottom: first + lineHeight * (event.lines.length - 0.5) });
  }
  const lastLabel = Math.min(layout.endTime, top);
  for (let second = Math.max(0, Math.ceil(bottom / TIME_LABEL_STEP) * TIME_LABEL_STEP); second <= lastLabel;
    second += TIME_LABEL_STEP) {
    const y = yOf(second);
    if (taken.some(area => y + lineHeight / 2 > area.top && y - lineHeight / 2 < area.bottom)) continue;
    add(formatSecond(second), LABEL_COLOR, y);
  }
  return labels;
}
