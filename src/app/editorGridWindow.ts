type GridWindow = {
  top: number; bottom: number; totalSteps: number; beatDivision: number;
  beatToY: (beat: number) => number; yToBeat: (y: number) => number;
  fullScan: boolean;
};

// Only materialize visible grid lines; extrapolate the endpoint spacing outside the chart.
export function editorGridWindow(o: GridWindow): Array<{ step: number; y: number }> {
  const lines: Array<{ step: number; y: number }> = [];
  const add = (step: number, y: number) => {
    if (step < 0 && Math.abs(step / o.beatDivision - Math.round(step / o.beatDivision)) > 1e-6) return;
    if (Number.isFinite(y) && y >= o.top - 2 && y <= o.bottom + 2) lines.push({ step, y });
  };
  const first = o.fullScan ? 0 : Math.max(0, Math.floor(Math.min(o.yToBeat(o.top), o.yToBeat(o.bottom)) * o.beatDivision) - o.beatDivision);
  const last = o.fullScan ? o.totalSteps : Math.min(o.totalSteps, Math.ceil(Math.max(o.yToBeat(o.top), o.yToBeat(o.bottom)) * o.beatDivision) + o.beatDivision);
  for (let step = first; step <= last; step++) add(step, o.beatToY(step / o.beatDivision));
  const extend = (anchor: number, delta: number, direction: -1 | 1) => {
    const y = o.beatToY(anchor / o.beatDivision);
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-6) return;
    const a = (o.top - 2 - y) / delta, b = (o.bottom + 2 - y) / delta;
    const start = Math.max(1, Math.ceil(Math.min(a, b)));
    const end = Math.floor(Math.max(a, b));
    for (let n = start; n <= end; n++) add(anchor + direction * n, y + delta * n);
  };
  extend(0, o.beatToY(0) - o.beatToY(1 / o.beatDivision), -1);
  extend(o.totalSteps, o.beatToY((o.totalSteps + 1) / o.beatDivision) - o.beatToY(o.totalSteps / o.beatDivision), 1);
  return lines;
}
