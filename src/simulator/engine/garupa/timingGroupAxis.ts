import type { ChartConstructionResult } from "../chart/types";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import type {
  GarupaProductChartProfile,
  GarupaProductTimingGroupId,
} from "./productChartProfile";

const EPSILON = 1e-9;
const POSITION_UNITS_PER_BEAT = 48;
const axisProfileByChart = new WeakMap<ChartConstructionResult, GarupaProductTimingGroupAxisProfile>();

export interface GarupaProductBpmSegment {
  readonly absolutePosition: number;
  readonly millisecondsAtPosition: number;
  readonly bpm: number;
}

export interface GarupaProductAxisChange {
  readonly absolutePosition: number;
  readonly atMilliseconds: number;
  readonly speed: number;
  readonly intercept: number;
  readonly sourceOrder: number;
  readonly owner: "group" | "global";
}

export interface GarupaProductTimingGroupAxis {
  readonly id: GarupaProductTimingGroupId;
  readonly changes: readonly GarupaProductAxisChange[];
}

export interface GarupaProductVisibilityWindow {
  readonly fromMilliseconds: number;
  readonly toMilliseconds: number;
}

export interface GarupaProductTimingGroupAxisProfile {
  readonly bpmSegments: readonly GarupaProductBpmSegment[];
  readonly groups: readonly GarupaProductTimingGroupAxis[];
  readonly groupById: ReadonlyMap<GarupaProductTimingGroupId, GarupaProductTimingGroupAxis>;
  readonly positionToMilliseconds: (absolutePosition: number) => SimulatorResult<number>;
  readonly axisAtMilliseconds: (
    timingGroup: GarupaProductTimingGroupId,
    milliseconds: number,
  ) => SimulatorResult<number>;
  readonly displacementAtPosition: (
    timingGroup: GarupaProductTimingGroupId,
    noteAbsolutePosition: number,
    currentAbsolutePosition: number,
  ) => SimulatorResult<number>;
  readonly findVisibilityWindows: (
    timingGroup: GarupaProductTimingGroupId,
    noteAbsolutePosition: number,
    travelAxisMilliseconds: number,
    viewportBottomAxisMilliseconds: number,
    chartStartMilliseconds: number,
    chartEndMilliseconds: number,
  ) => SimulatorResult<readonly GarupaProductVisibilityWindow[]>;
}

export function registerGarupaProductTimingGroupAxisProfile(
  chart: ChartConstructionResult,
  profile: GarupaProductTimingGroupAxisProfile,
): void {
  axisProfileByChart.set(chart, profile);
}

export function getGarupaProductTimingGroupAxisProfile(
  chart: ChartConstructionResult,
): GarupaProductTimingGroupAxisProfile | undefined {
  return axisProfileByChart.get(chart);
}

export function createGarupaProductTimingGroupAxisProfile(
  chart: ChartConstructionResult,
  product: GarupaProductChartProfile,
): SimulatorResult<GarupaProductTimingGroupAxisProfile> {
  const bpmSegmentsResult = buildBpmSegments(chart);
  if (bpmSegmentsResult.status !== "ok") return bpmSegmentsResult;
  const bpmSegments = bpmSegmentsResult.value;
  const positionToMilliseconds = (position: number): SimulatorResult<number> =>
    positionToMillisecondsFromSegments(bpmSegments, position);

  const usedGroups = new Set<GarupaProductTimingGroupId>(["#Global"]);
  for (const node of product.nodes) usedGroups.add(node.timingGroup);
  for (const event of product.svEvents) usedGroups.add(event.timingGroup);
  const orderedGroups = [...usedGroups].sort(compareTimingGroup);
  const globalEvents = product.svEvents.filter((event) => event.timingGroup === "#Global");
  const groups: GarupaProductTimingGroupAxis[] = [];

  for (const groupId of orderedGroups) {
    const ownedEvents = groupId === "#Global"
      ? []
      : product.svEvents.filter((event) => event.timingGroup === groupId);
    const merged = [
      ...ownedEvents.map((event) => ({ event, owner: "group" as const })),
      ...globalEvents.map((event) => ({ event, owner: "global" as const })),
    ].sort((left, right) =>
      left.event.absolutePosition - right.event.absolutePosition ||
      ownerOrder(left.owner) - ownerOrder(right.owner) ||
      left.event.sourceOrder - right.event.sourceOrder);
    let speed = 1;
    let intercept = 0;
    const changes: GarupaProductAxisChange[] = [];
    for (const mergedEvent of merged) {
      const at = positionToMilliseconds(mergedEvent.event.absolutePosition);
      if (at.status !== "ok") return at;
      const nextSpeed = mergedEvent.event.value;
      if (!Number.isFinite(nextSpeed)) return invalidAxis("SV speed must remain finite.");
      intercept = intercept + at.value * speed - at.value * nextSpeed;
      speed = nextSpeed;
      changes.push(Object.freeze({
        absolutePosition: mergedEvent.event.absolutePosition,
        atMilliseconds: at.value,
        speed,
        intercept,
        sourceOrder: mergedEvent.event.sourceOrder,
        owner: mergedEvent.owner,
      }));
    }
    groups.push(Object.freeze({ id: groupId, changes: Object.freeze(changes) }));
  }

  const frozenGroups = Object.freeze(groups);
  const groupById = new Map(frozenGroups.map((group) => [group.id, group] as const));
  const axisAtMilliseconds = (
    timingGroup: GarupaProductTimingGroupId,
    milliseconds: number,
  ): SimulatorResult<number> => {
    if (!Number.isFinite(milliseconds)) return invalidAxis("Axis sample time must be finite.");
    const group = groupById.get(timingGroup);
    if (group === undefined) return invalidAxis(`Unknown TimingGroup ${timingGroup}.`);
    const value = sampleAxis(group, milliseconds);
    return Number.isFinite(value)
      ? ok(value)
      : invalidAxis("TimingGroup axis sample became non-finite.");
  };
  const displacementAtPosition = (
    timingGroup: GarupaProductTimingGroupId,
    noteAbsolutePosition: number,
    currentAbsolutePosition: number,
  ): SimulatorResult<number> => {
    const noteTime = positionToMilliseconds(noteAbsolutePosition);
    if (noteTime.status !== "ok") return noteTime;
    const nowTime = positionToMilliseconds(currentAbsolutePosition);
    if (nowTime.status !== "ok") return nowTime;
    const noteAxis = axisAtMilliseconds(timingGroup, noteTime.value);
    if (noteAxis.status !== "ok") return noteAxis;
    const nowAxis = axisAtMilliseconds(timingGroup, nowTime.value);
    if (nowAxis.status !== "ok") return nowAxis;
    return ok(noteAxis.value - nowAxis.value);
  };
  const findWindows = (
    timingGroup: GarupaProductTimingGroupId,
    noteAbsolutePosition: number,
    travelAxisMilliseconds: number,
    viewportBottomAxisMilliseconds: number,
    chartStartMilliseconds: number,
    chartEndMilliseconds: number,
  ): SimulatorResult<readonly GarupaProductVisibilityWindow[]> => {
    const group = groupById.get(timingGroup);
    const noteTime = positionToMilliseconds(noteAbsolutePosition);
    if (group === undefined || noteTime.status !== "ok") {
      return noteTime.status !== "ok" ? noteTime : invalidAxis(`Unknown TimingGroup ${timingGroup}.`);
    }
    const windows = findWindowsForGroup(
      group,
      sampleAxis(group, noteTime.value),
      travelAxisMilliseconds,
      viewportBottomAxisMilliseconds,
      chartStartMilliseconds,
      chartEndMilliseconds,
    );
    return windows === null
      ? invalidAxis("Visibility-range inputs must remain finite and ordered.")
      : ok(Object.freeze(windows));
  };

  return ok(Object.freeze({
    bpmSegments,
    groups: frozenGroups,
    groupById,
    positionToMilliseconds,
    axisAtMilliseconds,
    displacementAtPosition,
    findVisibilityWindows: findWindows,
  }));
}

function buildBpmSegments(
  chart: ChartConstructionResult,
): SimulatorResult<readonly GarupaProductBpmSegment[]> {
  if (!Number.isFinite(chart.startBpm) || chart.startBpm <= 0) {
    return invalidAxis("The product visual clock requires one positive base BPM.");
  }
  const commands = chart.noteBatches.flatMap((batch) => batch.informationList)
    .filter((note) => note.buttonType === -1 && note.bpm > 0)
    .sort((left, right) => left.absolutePos - right.absolutePos || left.index - right.index);
  const segments: GarupaProductBpmSegment[] = [Object.freeze({
    absolutePosition: 0,
    millisecondsAtPosition: 0,
    bpm: chart.startBpm,
  })];
  let position = 0;
  let milliseconds = 0;
  let bpm = chart.startBpm;
  for (const command of commands) {
    if (!Number.isInteger(command.absolutePos) || command.absolutePos <= position ||
      !Number.isFinite(command.bpm) || command.bpm <= 0) {
      return invalidAxis("BPM commands must be positive and strictly increasing for the product visual clock.");
    }
    milliseconds += positionsToMilliseconds(command.absolutePos - position, bpm);
    position = command.absolutePos;
    bpm = command.bpm;
    segments.push(Object.freeze({ absolutePosition: position, millisecondsAtPosition: milliseconds, bpm }));
  }
  return ok(Object.freeze(segments));
}

function positionToMillisecondsFromSegments(
  segments: readonly GarupaProductBpmSegment[],
  absolutePosition: number,
): SimulatorResult<number> {
  if (!Number.isFinite(absolutePosition) || absolutePosition < 0) {
    return invalidAxis("Product visual position must be finite and nonnegative.");
  }
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (segments[middle]!.absolutePosition <= absolutePosition) low = middle + 1;
    else high = middle - 1;
  }
  const segment = segments[Math.max(0, high)]!;
  const value = segment.millisecondsAtPosition +
    positionsToMilliseconds(absolutePosition - segment.absolutePosition, segment.bpm);
  return Number.isFinite(value)
    ? ok(value)
    : invalidAxis("Product visual position-to-time integration became non-finite.");
}

function positionsToMilliseconds(positionDelta: number, bpm: number): number {
  return positionDelta * 60_000 / (bpm * POSITION_UNITS_PER_BEAT);
}

function sampleAxis(group: GarupaProductTimingGroupAxis, milliseconds: number): number {
  let speed = 1;
  let intercept = 0;
  for (const change of group.changes) {
    if (milliseconds + EPSILON < change.atMilliseconds) break;
    speed = change.speed;
    intercept = change.intercept;
  }
  return intercept + speed * milliseconds;
}

function findWindowsForGroup(
  group: GarupaProductTimingGroupAxis,
  noteAxis: number,
  travelAxis: number,
  viewportBottomAxis: number,
  chartStart: number,
  chartEnd: number,
): GarupaProductVisibilityWindow[] | null {
  if (![noteAxis, travelAxis, viewportBottomAxis, chartStart, chartEnd].every(Number.isFinite) ||
    chartEnd <= chartStart) return null;
  const lower = noteAxis - Math.abs(travelAxis);
  const upper = noteAxis + Math.max(0, viewportBottomAxis);
  const boundaries = [
    chartStart,
    ...group.changes.map((change) => change.atMilliseconds)
      .filter((at) => at > chartStart && at < chartEnd),
    chartEnd,
  ].sort((left, right) => left - right);
  const windows: GarupaProductVisibilityWindow[] = [];
  for (let index = 0; index + 1 < boundaries.length; index += 1) {
    const start = boundaries[index]!;
    const end = boundaries[index + 1]!;
    const startAxis = sampleAxis(group, start);
    const endAxis = sampleAxis(group, end);
    const delta = endAxis - startAxis;
    if (Math.abs(delta) <= EPSILON) {
      if (startAxis >= lower - EPSILON && startAxis <= upper + EPSILON) {
        pushWindow(windows, start, end);
      }
      continue;
    }
    const first = (lower - startAxis) / delta;
    const second = (upper - startAxis) / delta;
    const lo = Math.max(0, Math.min(first, second));
    const hi = Math.min(1, Math.max(first, second));
    if (hi + EPSILON < 0 || lo - EPSILON > 1 || hi - lo <= EPSILON) continue;
    pushWindow(windows, start + (end - start) * lo, start + (end - start) * hi);
  }
  return windows;
}

function pushWindow(
  windows: GarupaProductVisibilityWindow[],
  first: number,
  second: number,
): void {
  const start = Math.min(first, second);
  const end = Math.max(first, second);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start <= EPSILON) return;
  const previous = windows[windows.length - 1];
  if (previous !== undefined && start <= previous.toMilliseconds + EPSILON) {
    windows[windows.length - 1] = Object.freeze({
      fromMilliseconds: previous.fromMilliseconds,
      toMilliseconds: Math.max(previous.toMilliseconds, end),
    });
  } else {
    windows.push(Object.freeze({ fromMilliseconds: start, toMilliseconds: end }));
  }
}

function compareTimingGroup(
  left: GarupaProductTimingGroupId,
  right: GarupaProductTimingGroupId,
): number {
  if (left === "#Global") return right === "#Global" ? 0 : -1;
  if (right === "#Global") return 1;
  return left.localeCompare(right, "en", { numeric: true });
}

function ownerOrder(owner: "group" | "global"): number {
  return owner === "group" ? 0 : 1;
}

function invalidAxis<T>(boundary: string): SimulatorResult<T> {
  return evidenceRequired(
    "simulator.garupa-extension.invalid-timing-axis",
    [],
    boundary,
  );
}
