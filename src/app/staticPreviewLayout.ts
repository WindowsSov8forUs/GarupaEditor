import { beatToSeconds } from "../chartCore";
import { FIELD_WIDTH_LANES } from "../components/editor/previewLaneStrip";
import { editorNoteHeight } from "./editorNoteMetrics";
import type { StaticRenderPayload } from "./staticRenderTypes";

/*
 * The preview window's layout: the chart cut into columns of equal duration, laid side by side. The reference scale
 * (zoom 1) is PREVIEW_UNITS_PER_SECOND design units a second and PREVIEW_LANE_UNITS a lane (the editor's lane); the
 * actual zoom is the one that fits `span` seconds in a column of the window's height, both axes alike.
 *
 * A column is the standard track (lanes 0-6, the lane art centred on it) with a margin of COLUMN_MARGIN_LANES lanes
 * each side, measured from the track's edges as the editor's; the margins are the space between the columns. A column
 * in which a note sits on a lane outside 0-6 (its lane, not its width) is widened by as many lanes each side, in its
 * margins: the lane art and the lane width stay as they are.
 */

/** Design units per second at the reference scale (the editor's board: 1000). */
export const PREVIEW_UNITS_PER_SECOND = 500;
/** Design units per lane at the reference scale: the editor's lane at the standard 1334 × 750 design resolution
 * (7 lanes ≈ 666 units, measured). */
export const PREVIEW_LANE_UNITS = 95.13;
/** Seconds a column holds: at first, and the zoom's range. */
export const PREVIEW_SPAN_DEFAULT = 8;
export const PREVIEW_SPAN_MIN = 4;
export const PREVIEW_SPAN_MAX = 16;
export const STANDARD_LANE_COUNT = 7;
const COLUMN_MARGIN_LANES = 2;
/** Labels at their full size up to PREVIEW_SPAN_DEFAULT seconds a column, smaller beyond, down to this share. */
const LABEL_MIN_SCALE = 0.75;
/** Room before the first column's track for its left labels (design units, at the labels' full size). */
const LEADING_LABEL_UNITS = 64;
/** The chart starts this far (in note heights, plus LEAD_FIXED_UNITS) above the first column's bottom, so a note at
 * 0 s shows whole. The columns follow on each other with no overlap: a note on a cut shows half in each. */
const LEAD_NOTES = 0.75;
const LEAD_FIXED_UNITS = 6;

export type PreviewColumn = {
  /** From the strip's first column's left edge, CSS px. */
  left: number;
  width: number;
  /** Lanes added each side for notes outside lanes 0-6. */
  extra: number;
  /** The standard track's left edge (lane 0's) and the lane art's, from the column's left edge. */
  boardLeft: number;
  artLeft: number;
};

export type PreviewLayout = {
  /** CSS px per design unit. */
  scale: number;
  /** Against the reference scale. */
  zoom: number;
  /** The labels' size against their design size. */
  labelScale: number;
  /** CSS px per lane and per second. */
  lane: number;
  pixelsPerSecond: number;
  /** A column's height, CSS px. */
  height: number;
  /** Seconds between the first column's bottom and 0 s. */
  leadTime: number;
  /** The standard track (7 lanes) and the lane art, CSS px. */
  trackWidth: number;
  artWidth: number;
  /** Lanes from the chart board's left edge (the payload's x) to lane 0's left edge. */
  laneOffset: number;
  /** Seconds each column covers. */
  span: number;
  columns: PreviewColumn[];
  /** Space before the first column (CSS px), and the strip's whole width with it. */
  inset: number;
  totalWidth: number;
  /** The chart's last drawn time. */
  endTime: number;
};

/** The last time anything of the chart is drawn at: its last note, line or event. */
export function previewEndTime(payload: StaticRenderPayload): number {
  let end = 0;
  for (const note of payload.noteVisuals) end = Math.max(end, note.timeSec);
  for (const segment of payload.connectionSegments) end = Math.max(end, segment.maxY);
  const eventTime = (beat: number) => beatToSeconds(beat, payload.bpmTimeline);
  for (const line of payload.bpmVisualLines) end = Math.max(end, eventTime(line.beat));
  for (const line of payload.svVisualLines) end = Math.max(end, eventTime(line.beat));
  for (const line of payload.laneChangeVisualLines) end = Math.max(end, eventTime(line.beat));
  return end;
}

/** The layout whose columns, `height` CSS px tall, each hold `span` seconds. */
export function previewLayout(payload: StaticRenderPayload, scale: number, span: number, height: number,
  endTime: number): PreviewLayout {
  // Worked out in design units (the window's height over the UI scale), then drawn at the UI scale: a column of the
  // window's design height holds `span` seconds; the zoom is that against the reference scale.
  const designHeight = height / scale;
  const unitsPerSecond = designHeight / span;
  const zoom = Math.max(1e-3, unitsPerSecond / PREVIEW_UNITS_PER_SECOND);
  const laneUnits = PREVIEW_LANE_UNITS * zoom;
  const noteUnits = editorNoteHeight(laneUnits, payload.noteVisualScale);
  const leadTime = (noteUnits * LEAD_NOTES + LEAD_FIXED_UNITS) / unitsPerSecond;
  const lane = laneUnits * scale;
  const pixelsPerSecond = unitsPerSecond * scale;
  const trackWidth = STANDARD_LANE_COUNT * lane;
  const artWidth = FIELD_WIDTH_LANES * lane;
  const columnCount = Math.max(1, Math.ceil((endTime + leadTime) / span - 1e-9));

  // Each column's extra lanes: the farthest any note it shows (half a note past its ends included) sits outside lanes 0-6.
  const extras = new Array<number>(columnCount).fill(0);
  const halfNoteTime = noteUnits / 2 / unitsPerSecond;
  for (const { timeSec, lane: noteLane } of payload.noteLanes) {
    // To the nearest lane: a node a hair outside (a fitted curve's Hidden node at 6.01) does not widen the column.
    const outside = Math.round(Math.max(0, -noteLane, noteLane - (STANDARD_LANE_COUNT - 1)));
    if (outside <= 0) continue;
    const first = Math.max(0, Math.floor((timeSec + leadTime - halfNoteTime) / span));
    const last = Math.min(columnCount - 1, Math.floor((timeSec + leadTime + halfNoteTime) / span));
    for (let column = first; column <= last; column += 1) extras[column] = Math.max(extras[column]!, outside);
  }
  let left = 0;
  const columns = extras.map(extra => {
    const boardLeft = (COLUMN_MARGIN_LANES + extra) * lane;
    const column = { left, width: trackWidth + 2 * boardLeft, extra, boardLeft,
      artLeft: boardLeft + (trackWidth - artWidth) / 2 };
    left += column.width;
    return column;
  });
  const labelScale = Math.min(1, Math.max(LABEL_MIN_SCALE, PREVIEW_SPAN_DEFAULT / span));
  const first = columns[0]!;
  const inset = Math.max(0, LEADING_LABEL_UNITS * scale * labelScale
    - Math.min(first.artLeft, first.boardLeft - first.extra * lane));
  return {
    scale, zoom, labelScale, lane, pixelsPerSecond, height, leadTime, trackWidth, artWidth,
    laneOffset: (payload.laneCount - STANDARD_LANE_COUNT) / 2,
    span, columns, inset, totalWidth: inset + left, endTime,
  };
}

/** The column at x (CSS px from the strip's left edge, inset included), clamped to the first and last. */
export function previewColumnAt(layout: PreviewLayout, x: number): number {
  const target = x - layout.inset;
  let low = 0, high = layout.columns.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (layout.columns[mid]!.left <= target) low = mid; else high = mid - 1;
  }
  return low;
}

/** The time at column `column`'s bottom edge; it covers `span` seconds from there. */
export function previewColumnStart(layout: PreviewLayout, column: number): number {
  return column * layout.span - layout.leadTime;
}

/** The column time `timeSec` falls in. */
export function previewColumnOf(layout: PreviewLayout, timeSec: number): number {
  return Math.min(layout.columns.length - 1, Math.max(0, Math.floor((timeSec + layout.leadTime) / layout.span)));
}

/** The y of time `timeSec` in column `column` (CSS px from the column's top). */
export function previewColumnY(layout: PreviewLayout, column: number, timeSec: number): number {
  return layout.height - (timeSec - previewColumnStart(layout, column)) * layout.pixelsPerSecond;
}

/** The time at y in column `column`. */
export function previewColumnTime(layout: PreviewLayout, column: number, y: number): number {
  return previewColumnStart(layout, column) + (layout.height - y) / layout.pixelsPerSecond;
}
