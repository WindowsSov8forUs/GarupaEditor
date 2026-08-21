export interface TimingGroupSourceEvent {
  timingGroup?: string | number;
  atMs: number;
  value: number;
  order: number;
}

export interface TimingGroupChange {
  atMs: number;
  speed: number;
  pos: number;
}

export interface TimingGroupDef {
  id: number;
  changes: TimingGroupChange[];
}

export interface VisibilityWindow {
  startMs: number;
  endMs: number;
}

const EPSILON = 1e-9;

export function normalizeTimingGroupId(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === "#Global") return "#Global";
    return /^#[A-Za-z0-9 -]+$/.test(trimmed) ? trimmed : "#Global";
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "#Global";
  const normalized = Math.max(0, Math.round(numeric));
  return normalized === 0 ? "#Global" : `#${normalized}`;
}

export function normalizeSvValue(value: unknown, fallback = 1): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(6)) : fallback;
}

export function axisAtMs(group: TimingGroupDef | null | undefined, elapsedMs: number): number {
  if (!group) return elapsedMs;
  let speed = 1;
  let pos = 0;
  for (const change of group.changes) {
    if (elapsedMs + EPSILON < change.atMs) break;
    speed = change.speed;
    pos = change.pos;
  }
  return pos + speed * elapsedMs;
}

export function buildTimingGroupDefs(
  usedGroups: string[],
  sourceEvents: TimingGroupSourceEvent[],
): { timingGroups: TimingGroupDef[]; internalToRuntimeGroup: Map<string, number> } {
  const grouped = new Map<string, TimingGroupSourceEvent[]>();
  for (const event of sourceEvents) {
    const timingGroup = normalizeTimingGroupId(event.timingGroup);
    const atMs = Number(event.atMs);
    const speed = normalizeSvValue(event.value, 1);
    if (!Number.isFinite(atMs) || !Number.isFinite(speed)) continue;
    const list = grouped.get(timingGroup) ?? [];
    list.push({ ...event, timingGroup, atMs, value: speed });
    grouped.set(timingGroup, list);
  }
  for (const [timingGroup, list] of grouped.entries()) {
    list.sort((left, right) => Math.abs(left.atMs - right.atMs) > EPSILON
      ? left.atMs - right.atMs
      : left.order - right.order);
    grouped.set(timingGroup, list);
  }
  const internalToRuntimeGroup = new Map<string, number>();
  const timingGroups: TimingGroupDef[] = [];
  for (let index = 0; index < usedGroups.length; index += 1) {
    const internalGroup = usedGroups[index]!;
    internalToRuntimeGroup.set(internalGroup, index);
    const changes: TimingGroupChange[] = [];
    let speed = 1;
    let pos = 0;
    for (const event of grouped.get(internalGroup) ?? []) {
      pos += event.atMs * speed;
      pos -= event.atMs * event.value;
      speed = event.value;
      changes.push({ atMs: event.atMs, speed: event.value, pos });
    }
    timingGroups.push({ id: index, changes });
  }
  return { timingGroups, internalToRuntimeGroup };
}

function pushWindow(windows: VisibilityWindow[], startMs: number, endMs: number): void {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
  const start = Math.min(startMs, endMs);
  const end = Math.max(startMs, endMs);
  if (end - start <= EPSILON) return;
  const last = windows[windows.length - 1];
  if (last && start <= last.endMs + EPSILON) {
    last.endMs = Math.max(last.endMs, end);
    return;
  }
  windows.push({ startMs: start, endMs: end });
}

export function findVisibilityWindows(
  group: TimingGroupDef | null | undefined,
  noteAxisMs: number,
  travelAxisMs: number,
  viewportBottomAxisMs: number,
  chartStartMs: number,
  chartEndMs: number,
): VisibilityWindow[] {
  const startLimit = Math.min(chartStartMs, chartEndMs);
  const endLimit = Math.max(chartStartMs, chartEndMs);
  if (!Number.isFinite(noteAxisMs) || !Number.isFinite(travelAxisMs) || !Number.isFinite(viewportBottomAxisMs) || endLimit <= startLimit) return [];
  const lower = noteAxisMs - Math.abs(travelAxisMs);
  const upper = noteAxisMs + Math.max(0, viewportBottomAxisMs);
  const boundaries = [
    startLimit,
    ...(group?.changes ?? []).map((change) => change.atMs).filter((atMs) => atMs > startLimit && atMs < endLimit),
    endLimit,
  ].sort((a, b) => a - b);
  const windows: VisibilityWindow[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startMs = boundaries[index]!;
    const endMs = boundaries[index + 1]!;
    const startAxis = axisAtMs(group, startMs);
    const endAxis = axisAtMs(group, endMs);
    const delta = endAxis - startAxis;
    if (Math.abs(delta) <= EPSILON) {
      if (startAxis >= lower - EPSILON && startAxis <= upper + EPSILON) pushWindow(windows, startMs, endMs);
      continue;
    }
    const t0 = (lower - startAxis) / delta;
    const t1 = (upper - startAxis) / delta;
    const lo = Math.max(0, Math.min(t0, t1));
    const hi = Math.min(1, Math.max(t0, t1));
    if (hi + EPSILON < 0 || lo - EPSILON > 1 || hi - lo <= EPSILON) continue;
    pushWindow(windows, startMs + (endMs - startMs) * lo, startMs + (endMs - startMs) * hi);
  }
  return windows;
}
