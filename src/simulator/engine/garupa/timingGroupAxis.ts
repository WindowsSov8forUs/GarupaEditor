import { findBatchBpmCommand } from "../chart/noteGraph";
import type { ChartConstructionResult } from "../chart/types";
import { integrityFailure, ok, type SimulatorResult } from "../result";
import type {
  GarupaProductChartProfile,
  GarupaProductSvEvent,
  GarupaProductTimingGroupId,
} from "./productChartProfile";

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
  const groups: GarupaProductTimingGroupAxis[] = [];

  for (const groupId of orderedGroups) {
    const changes = mergeTimingGroupChanges(product.svEvents, groupId,
      (event) => positionToMilliseconds(event.absolutePosition));
    if (changes.status !== "ok") return changes;
    groups.push(Object.freeze({ id: groupId, changes: changes.value }));
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
  return ok(Object.freeze({
    bpmSegments,
    groups: frozenGroups,
    groupById,
    positionToMilliseconds,
    axisAtMilliseconds,
    displacementAtPosition,
  }));
}

/** Group-owned and global SV events in time order; the last event at a time wins. */
export function mergeTimingGroupChanges(
  events: readonly GarupaProductSvEvent[],
  groupId: GarupaProductTimingGroupId,
  timeOf: (event: GarupaProductSvEvent) => SimulatorResult<number>,
): SimulatorResult<readonly GarupaProductAxisChange[]> {
  const timed: { event: GarupaProductSvEvent; owner: "group" | "global"; at: number }[] = [];
  for (const event of events) {
    if (event.timingGroup !== "#Global" && (groupId === "#Global" || event.timingGroup !== groupId)) continue;
    const at = timeOf(event);
    if (at.status !== "ok") return at;
    timed.push({ event, owner: event.timingGroup === "#Global" ? "global" : "group", at: at.value });
  }
  timed.sort((left, right) =>
    left.at - right.at ||
    (left.event.authoredPosition ?? left.event.absolutePosition) - (right.event.authoredPosition ?? right.event.absolutePosition) ||
    ownerOrder(left.owner) - ownerOrder(right.owner) ||
    left.event.sourceOrder - right.event.sourceOrder);
  let speed = 1;
  let intercept = 0;
  const changes: GarupaProductAxisChange[] = [];
  for (const { event, owner, at } of timed) {
    const nextSpeed = event.value;
    if (!Number.isFinite(nextSpeed)) return invalidAxis("SV speed must remain finite.");
    intercept = intercept + at * speed - at * nextSpeed;
    speed = nextSpeed;
    changes.push(Object.freeze({
      absolutePosition: event.absolutePosition,
      atMilliseconds: at,
      speed,
      intercept,
      sourceOrder: event.sourceOrder,
      owner,
    }));
  }
  return ok(Object.freeze(changes));
}

/** True when SV can draw a note differently from the original linear axis:
 * a non-unit speed while it can be visible, or an earlier axis value that
 * would bring it into the field before its original launch. */
export function timingGroupAxisAffectsNote(
  changes: readonly GarupaProductAxisChange[],
  noteMilliseconds: number,
  arrivalMilliseconds: number,
  afterMilliseconds: number,
): boolean {
  const start = noteMilliseconds - arrivalMilliseconds;
  const end = noteMilliseconds + afterMilliseconds;
  const axisAt = (time: number): number => {
    let value = time;
    for (const change of changes) if (change.atMilliseconds <= time) value = change.intercept + change.speed * time;
    return value;
  };
  let supremum = changes.length === 0 ? start : Math.min(changes[0]!.atMilliseconds, start);
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index]!;
    const next = changes[index + 1]?.atMilliseconds ?? Infinity;
    if (next <= change.atMilliseconds) continue;
    if (change.speed !== 1 && change.atMilliseconds < end && next > start) return true;
    if (change.atMilliseconds < start) {
      const until = Math.min(next, start);
      const value = change.speed > 0 ? change.intercept + change.speed * until
        : change.speed < 0 ? change.intercept + change.speed * change.atMilliseconds : change.intercept;
      supremum = Math.max(supremum, value);
    }
  }
  return supremum > axisAt(start) + 1e-6;
}

function buildBpmSegments(
  chart: ChartConstructionResult,
): SimulatorResult<readonly GarupaProductBpmSegment[]> {
  if (!Number.isFinite(chart.startBpm) || chart.startBpm <= 0) {
    return invalidAxis("The product visual clock requires one positive base BPM.");
  }
  const commands = chart.noteBatches.flatMap((batch) => {
      const command = findBatchBpmCommand(batch.informationList);
      return command === undefined ? [] : [command];
    })
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
    if (!Number.isFinite(command.absolutePos) || command.absolutePos <= position ||
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
  // Negative runtime positions are events folded before music start.
  if (!Number.isFinite(absolutePosition)) {
    return invalidAxis("Product visual position must be finite.");
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
  let low = 0;
  let high = group.changes.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (group.changes[middle]!.atMilliseconds <= milliseconds) low = middle + 1;
    else high = middle - 1;
  }
  // Keep the last authored change at equal times, including group/global ties.
  const change = group.changes[high];
  return change === undefined ? milliseconds : change.intercept + change.speed * milliseconds;
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
  return integrityFailure(
    "simulator.garupa-extension.invalid-timing-axis",
    boundary,
  );
}
