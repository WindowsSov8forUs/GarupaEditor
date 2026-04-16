import type {
  SimulatorChartBpmEvent,
  SimulatorChartNote,
  SimulatorChartPayload,
  SimulatorChartSlideChain,
  SimulatorChartSvEvent,
} from "../launchPayload";
import { LEGACY_TIMING_FPS, legacyOffsetToMs } from "./legacyMath";
import { isJudgedType } from "./score";
import type { ChartEvent, ParsedChart, SimulatorSettings, TimingGroupDef } from "./types";

interface BpmSegment {
  beatStart: number;
  msAtStart: number;
  bpm: number;
}

interface SlideNoteRole {
  timingGroup: number;
  predecessorNoteId: string | null;
}

interface NoteDescriptor {
  noteId: string;
  beat: number;
  lane: number;
  type: number;
  timingGroup: number;
  predecessorNoteId: string | null;
  order: number;
}

interface InternalEvent {
  event: ChartEvent;
  order: number;
  atMs: number;
  noteId: string | null;
  predecessorNoteId: string | null;
}

interface SvRuntimeEvent {
  atMs: number;
  speed: number;
  order: number;
}

const BEAT_EPSILON = 1e-6;

function toFinite(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeBeat(value: unknown): number {
  return Math.max(0, Number(toFinite(value, 0).toFixed(6)));
}

function normalizeLane(value: unknown): number {
  // Legacy simulator coordinates are 1-based lanes (1..7 visible),
  // while editor chart lanes are 0-based. Convert here to keep geometry parity.
  return Number((toFinite(value, 0) + 1).toFixed(6));
}

function normalizeTimingGroup(value: unknown): number {
  return Math.max(0, Math.round(toFinite(value, 0)));
}

function normalizeDirectionalWidth(value: unknown): number {
  return Math.max(1, Math.min(9, Math.round(toFinite(value, 1))));
}

function mapDirectionalType(note: SimulatorChartNote): number | null {
  const width = normalizeDirectionalWidth(note.width);
  if (note.type === "directional_flick_left") {
    return 50 + width;
  }
  if (note.type === "directional_flick_right") {
    return 60 + width;
  }
  return null;
}

function mapTopLevelType(note: SimulatorChartNote): number | null {
  const directional = mapDirectionalType(note);
  if (directional !== null) {
    return directional;
  }
  if (note.type === "single") {
    return 1;
  }
  if (note.type === "flick") {
    return 2;
  }
  if (note.type === "skill") {
    return 11;
  }
  return null;
}

function mapSlideType(note: SimulatorChartNote, index: number, length: number): number | null {
  const directional = mapDirectionalType(note);
  if (directional !== null) {
    return directional;
  }
  if (note.type === "hidden") {
    return 77;
  }
  if (length <= 1) {
    if (note.type === "single") {
      return 1;
    }
    if (note.type === "flick") {
      return 2;
    }
    if (note.type === "skill") {
      return 11;
    }
    return null;
  }

  if (index === 0) {
    if (note.type === "skill") {
      return 75;
    }
    return 71;
  }

  if (index === length - 1) {
    if (note.type === "flick") {
      return 74;
    }
    if (note.type === "skill") {
      return 76;
    }
    return 73;
  }

  if (note.type === "skill") {
    return 75;
  }
  return 72;
}

function buildBpmSegments(baseBpm: number, events: SimulatorChartBpmEvent[]): BpmSegment[] {
  const normalizedBase = Number(baseBpm.toFixed(6));
  const ordered = events
    .map((event, order) => ({
      beat: normalizeBeat(event.beat),
      bpm: Number(toFinite(event.bpm, normalizedBase).toFixed(6)),
      order,
    }))
    .filter((event) => event.beat > BEAT_EPSILON)
    .sort((a, b) => (Math.abs(a.beat - b.beat) > BEAT_EPSILON ? a.beat - b.beat : a.order - b.order));

  const segments: BpmSegment[] = [{ beatStart: 0, msAtStart: 0, bpm: normalizedBase }];
  let previousBeat = 0;
  let previousBpm = normalizedBase;
  let accumulatedMs = 0;

  for (const change of ordered) {
    if (change.beat < previousBeat) {
      continue;
    }
    accumulatedMs += (change.beat - previousBeat) * (60000 / previousBpm);
    segments.push({
      beatStart: change.beat,
      msAtStart: accumulatedMs,
      bpm: change.bpm,
    });
    previousBeat = change.beat;
    previousBpm = change.bpm;
  }

  return segments;
}

function beatToMs(segments: BpmSegment[], beat: number): number {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].beatStart <= beat) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const segment = segments[Math.max(0, high)];
  return segment.msAtStart + (beat - segment.beatStart) * (60000 / segment.bpm);
}

function bpmAtBeat(segments: BpmSegment[], beat: number): number {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].beatStart <= beat) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return segments[Math.max(0, high)].bpm;
}

function buildSlideRoles(
  notesById: Map<string, SimulatorChartNote>,
  slideChains: SimulatorChartSlideChain[],
): Map<string, SlideNoteRole> {
  const roles = new Map<string, SlideNoteRole>();

  for (const chain of slideChains) {
    const chainTimingGroup = normalizeTimingGroup(chain.timingGroup);
    const validNoteIds = chain.noteIds.filter((noteId) => notesById.has(noteId));
    let previousNoteId: string | null = null;
    for (const noteId of validNoteIds) {
      roles.set(noteId, {
        timingGroup: chainTimingGroup,
        predecessorNoteId: previousNoteId,
      });
      previousNoteId = noteId;
    }
  }

  return roles;
}

function buildNoteDescriptors(
  notes: SimulatorChartNote[],
  slideChains: SimulatorChartSlideChain[],
): NoteDescriptor[] {
  const notesById = new Map<string, SimulatorChartNote>();
  for (const note of notes) {
    if (typeof note.id !== "string" || note.id.length === 0) {
      continue;
    }
    notesById.set(note.id, note);
  }

  const slideRoles = buildSlideRoles(notesById, slideChains);
  const descriptors: NoteDescriptor[] = [];
  let order = 0;

  for (const note of notes) {
    if (typeof note.id !== "string" || note.id.length === 0) {
      continue;
    }
    if (slideRoles.has(note.id)) {
      continue;
    }
    const mappedType = mapTopLevelType(note);
    if (mappedType === null) {
      continue;
    }
    descriptors.push({
      noteId: note.id,
      beat: normalizeBeat(note.beat),
      lane: normalizeLane(note.lane),
      type: mappedType,
      timingGroup: normalizeTimingGroup(note.timingGroup),
      predecessorNoteId: null,
      order,
    });
    order += 1;
  }

  for (const chain of slideChains) {
    const chainTimingGroup = normalizeTimingGroup(chain.timingGroup);
    const validNoteIds = chain.noteIds.filter((noteId) => notesById.has(noteId));
    const chainLength = validNoteIds.length;
    for (let index = 0; index < chainLength; index += 1) {
      const noteId = validNoteIds[index];
      const note = notesById.get(noteId);
      if (!note) {
        continue;
      }
      const mappedType = mapSlideType(note, index, chainLength);
      if (mappedType === null) {
        continue;
      }
      descriptors.push({
        noteId,
        beat: normalizeBeat(note.beat),
        lane: normalizeLane(note.lane),
        type: mappedType,
        timingGroup: chainTimingGroup,
        predecessorNoteId: index > 0 ? validNoteIds[index - 1] : null,
        order,
      });
      order += 1;
    }
  }

  return descriptors;
}

function buildSvRuntimeMap(
  svEvents: SimulatorChartSvEvent[],
  segments: BpmSegment[],
): Map<number, SvRuntimeEvent[]> {
  const grouped = new Map<number, SvRuntimeEvent[]>();
  for (let index = 0; index < svEvents.length; index += 1) {
    const sv = svEvents[index];
    const timingGroup = normalizeTimingGroup(sv.timingGroup);
    const beat = normalizeBeat(sv.beat);
    const speed = Number(toFinite(sv.value, 1).toFixed(6));
    const entry: SvRuntimeEvent = {
      atMs: beatToMs(segments, beat),
      speed,
      order: index,
    };
    const list = grouped.get(timingGroup) ?? [];
    list.push(entry);
    grouped.set(timingGroup, list);
  }

  for (const [timingGroup, list] of grouped.entries()) {
    list.sort((left, right) => {
      if (Math.abs(left.atMs - right.atMs) > 1e-9) {
        return left.atMs - right.atMs;
      }
      return left.order - right.order;
    });
    grouped.set(timingGroup, list);
  }

  return grouped;
}

function buildTimingGroupDefs(
  usedGroups: number[],
  groupedSv: Map<number, SvRuntimeEvent[]>,
): {
  timingGroups: TimingGroupDef[];
  internalToRuntimeGroup: Map<number, number>;
} {
  const internalToRuntimeGroup = new Map<number, number>();
  const timingGroups: TimingGroupDef[] = [];

  for (let index = 0; index < usedGroups.length; index += 1) {
    const internalGroup = usedGroups[index];
    internalToRuntimeGroup.set(internalGroup, index);

    const runtimeEvents = groupedSv.get(internalGroup) ?? [];
    const changes: TimingGroupDef["changes"] = [];
    let speed = 1;
    let pos = 0;
    for (const runtimeEvent of runtimeEvents) {
      pos = pos + runtimeEvent.atMs * speed;
      pos = pos - runtimeEvent.atMs * runtimeEvent.speed;
      speed = runtimeEvent.speed;
      changes.push({
        atMs: runtimeEvent.atMs,
        speed: runtimeEvent.speed,
        pos,
      });
    }

    timingGroups.push({
      id: index,
      changes,
    });
  }

  return {
    timingGroups,
    internalToRuntimeGroup,
  };
}

function timingGroupPosAt(
  runtimeEvents: SvRuntimeEvent[] | undefined,
  atMs: number,
): number {
  if (!runtimeEvents || runtimeEvents.length === 0) {
    return atMs;
  }
  let speed = 1;
  let pos = 0;
  for (const runtimeEvent of runtimeEvents) {
    if (runtimeEvent.atMs > atMs + 1e-9) {
      break;
    }
    pos = pos + runtimeEvent.atMs * speed;
    pos = pos - runtimeEvent.atMs * runtimeEvent.speed;
    speed = runtimeEvent.speed;
  }
  return pos + atMs * speed;
}

export function parseEditorChart(
  chartData: SimulatorChartPayload,
  settings: SimulatorSettings,
): ParsedChart {
  const baseBpm = Number(toFinite(chartData.baseBpm, 120).toFixed(6));
  if (!(baseBpm > 0)) {
    throw new Error("Invalid chartData.baseBpm: must be > 0.");
  }

  const notes = Array.isArray(chartData.notes) ? chartData.notes : [];
  const slideChains = Array.isArray(chartData.slideChains) ? chartData.slideChains : [];
  const bpmEvents = Array.isArray(chartData.bpmEvents) ? chartData.bpmEvents : [];
  const svEvents = Array.isArray(chartData.svEvents) ? chartData.svEvents : [];

  const segments = buildBpmSegments(baseBpm, bpmEvents);
  const noteDescriptors = buildNoteDescriptors(notes, slideChains);
  const groupedSv = buildSvRuntimeMap(svEvents, segments);
  const hasNonZeroTimingGroupNote = noteDescriptors.some((descriptor) => descriptor.timingGroup !== 0);
  const hasSv = svEvents.length > 0;
  const useTimingGroups = hasSv || hasNonZeroTimingGroupNote;

  const usedGroupSet = new Set<number>();
  if (useTimingGroups) {
    usedGroupSet.add(0);
    for (const descriptor of noteDescriptors) {
      usedGroupSet.add(normalizeTimingGroup(descriptor.timingGroup));
    }
    for (const sv of svEvents) {
      usedGroupSet.add(normalizeTimingGroup(sv.timingGroup));
    }
  }
  const usedGroups = Array.from(usedGroupSet.values()).sort((a, b) => a - b);
  const { timingGroups, internalToRuntimeGroup } = buildTimingGroupDefs(usedGroups, groupedSv);

  const offsetMs = legacyOffsetToMs(settings.offset);
  const travelMs = settings.noteSpeedFrames * 1000 / LEGACY_TIMING_FPS;
  const musicStartMs = offsetMs;

  const internalEvents: InternalEvent[] = [];

  // Always synthesize a music-start event so BGM can start in payload-driven mode.
  internalEvents.push({
    event: {
      beat: 0,
      type: 0,
      lane: 0,
      slideId: 0,
      tgId: -1,
      tgPos: 0,
      startMs: musicStartMs,
      samelineLane: -1,
      bpm: bpmAtBeat(segments, 0),
      parentEventIndex: -1,
    },
    order: -3,
    atMs: 0,
    noteId: null,
    predecessorNoteId: null,
  });

  for (let index = 0; index < bpmEvents.length; index += 1) {
    const source = bpmEvents[index];
    const beat = normalizeBeat(source.beat);
    if (beat <= BEAT_EPSILON) {
      continue;
    }
    const atMs = beatToMs(segments, beat);
    const bpm = Number(toFinite(source.bpm, baseBpm).toFixed(6));
    internalEvents.push({
      event: {
        beat,
        type: 20,
        lane: 0,
        slideId: 0,
        tgId: -1,
        tgPos: 0,
        startMs: atMs + offsetMs - travelMs,
        samelineLane: -1,
        bpm,
        parentEventIndex: -1,
      },
      order: -2 + index / 1000000,
      atMs,
      noteId: null,
      predecessorNoteId: null,
    });
  }

  for (const descriptor of noteDescriptors) {
    const atMs = beatToMs(segments, descriptor.beat);
    const normalizedTimingGroup = normalizeTimingGroup(descriptor.timingGroup);
    const tgId = useTimingGroups
      ? (internalToRuntimeGroup.get(normalizedTimingGroup) ?? 0)
      : -1;
    const tgRuntimeEvents = groupedSv.get(normalizedTimingGroup);
    const tgPos = useTimingGroups ? timingGroupPosAt(tgRuntimeEvents, atMs) : 0;
    const startMs = useTimingGroups ? (atMs + offsetMs) : (atMs + offsetMs - travelMs);

    internalEvents.push({
      event: {
        beat: descriptor.beat,
        type: descriptor.type,
        lane: descriptor.lane,
        slideId: 0,
        tgId,
        tgPos,
        startMs,
        samelineLane: -1,
        bpm: bpmAtBeat(segments, descriptor.beat),
        parentEventIndex: -1,
      },
      order: descriptor.order,
      atMs,
      noteId: descriptor.noteId,
      predecessorNoteId: descriptor.predecessorNoteId,
    });
  }

  internalEvents.sort((left, right) => {
    if (Math.abs(left.event.startMs - right.event.startMs) > 1e-9) {
      return left.event.startMs - right.event.startMs;
    }
    if (Math.abs(left.atMs - right.atMs) > 1e-9) {
      return left.atMs - right.atMs;
    }
    return left.order - right.order;
  });

  const noteIndexById = new Map<string, number>();
  for (let index = 0; index < internalEvents.length; index += 1) {
    const noteId = internalEvents[index].noteId;
    if (noteId) {
      noteIndexById.set(noteId, index);
    }
  }

  const events: ChartEvent[] = internalEvents.map((entry) => {
    const parentEventIndex =
      entry.predecessorNoteId && noteIndexById.has(entry.predecessorNoteId)
        ? (noteIndexById.get(entry.predecessorNoteId) ?? -1)
        : -1;
    return {
      ...entry.event,
      parentEventIndex,
    };
  });

  let noteCount = 0;
  let maxTimeMs = 10;
  for (let index = 0; index < internalEvents.length; index += 1) {
    const { event, atMs } = internalEvents[index];
    if (isJudgedType(event.type)) {
      noteCount += 1;
    }
    if (atMs > maxTimeMs) {
      maxTimeMs = atMs;
    }
  }

  const maxRenderTimeMs = Math.max(maxTimeMs + 2000, musicStartMs + 2000);

  return {
    musicOffset: settings.offset,
    initialBpm: baseBpm,
    events,
    noteCount,
    maxTimeMs: maxRenderTimeMs,
    musicStartMs,
    hasTimingGroup: useTimingGroups,
    timingGroups,
  };
}
