import { approxEq } from "../chartCore";

type GridWindow = {
  top: number; bottom: number; totalSteps: number; beatDivision: number; beatsPerMeasure: number; verticalZoom: number;
  beatToY: (beat: number) => number; yToBeat: (y: number) => number;
  fullScan: boolean;
};

export type GridLineKind = "measure" | "beat" | "subdivision";
export type GridLine = { step: number; y: number; kind: GridLineKind };

/** Below this vertical zoom the subdivision lines (分音线) are too dense to read, so they are not drawn. */
const SUBDIVISION_LINE_MIN_VERTICAL_ZOOM = 0.2;

/** Whether subdivision lines are hidden at this vertical zoom; the canvas backend uses it to decide when to redraw. */
export function isSubdivisionLineHidden(verticalZoom: number): boolean {
  return verticalZoom < SUBDIVISION_LINE_MIN_VERTICAL_ZOOM;
}

export function gridLineKind(step: number, beatDivision: number, beatsPerMeasure: number): GridLineKind {
  const beat = step / beatDivision;
  const roundedBeat = Math.round(beat);
  if (!approxEq(beat, roundedBeat)) return "subdivision";
  return roundedBeat % beatsPerMeasure === 0 ? "measure" : "beat";
}

// Only materialize visible grid lines; extrapolate the endpoint spacing outside the chart.
export function editorGridWindow(o: GridWindow): GridLine[] {
  const hideSubdivisions = isSubdivisionLineHidden(o.verticalZoom);
  const lines: GridLine[] = [];
  const add = (step: number, y: number) => {
    if (step < 0 && Math.abs(step / o.beatDivision - Math.round(step / o.beatDivision)) > 1e-6) return;
    if (!Number.isFinite(y) || y < o.top - 24 || y > o.bottom + 24) return;
    const kind = gridLineKind(step, o.beatDivision, o.beatsPerMeasure);
    if (kind === "subdivision" && hideSubdivisions) return;
    lines.push({ step, y, kind });
  };
  const first = o.fullScan ? 0 : Math.max(0, Math.floor(Math.min(o.yToBeat(o.top), o.yToBeat(o.bottom)) * o.beatDivision) - o.beatDivision);
  const last = o.fullScan ? o.totalSteps : Math.min(o.totalSteps, Math.ceil(Math.max(o.yToBeat(o.top), o.yToBeat(o.bottom)) * o.beatDivision) + o.beatDivision);
  for (let step = first; step <= last; step++) add(step, o.beatToY(step / o.beatDivision));
  const extend = (anchor: number, delta: number, direction: -1 | 1) => {
    const y = o.beatToY(anchor / o.beatDivision);
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-6) return;
    const a = (o.top - 24 - y) / delta, b = (o.bottom + 24 - y) / delta;
    const start = Math.max(1, Math.ceil(Math.min(a, b)));
    const end = Math.floor(Math.max(a, b));
    for (let n = start; n <= end; n++) add(anchor + direction * n, y + delta * n);
  };
  extend(0, o.beatToY(0) - o.beatToY(1 / o.beatDivision), -1);
  extend(o.totalSteps, o.beatToY((o.totalSteps + 1) / o.beatDivision) - o.beatToY(o.totalSteps / o.beatDivision), 1);
  return lines;
}
