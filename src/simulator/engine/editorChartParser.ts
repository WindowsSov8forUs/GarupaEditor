import type {
  SimulatorChartBpmEvent,
  SimulatorChartNote,
  SimulatorChartPayload,
  SimulatorChartSlideChain,
  SimulatorChartSvEvent,
} from "../launchPayload";
import { SIMULATOR_TIMING_FPS } from "./simulatorTiming";
import { frameDeltaFromJudgeToPercent } from "./noteMotion";
import { isJudgedEvent } from "./score";
import { calculateStageGeometry } from "./stageGeometry";
import type {
  ChartEvent,
  NoteChartEvent,
  ParsedChart,
  RuntimeNoteSemantic,
  RuntimeSlideRole,
  SimulatorSettings,
  SimultaneousGroup,
} from "./types";
import {
  axisAtMs,
  buildTimingGroupDefs,
  findVisibilityWindows,
  normalizeSvValue,
  type TimingGroupSourceEvent,
} from "./timingGroup";

interface BpmSegment {
  beatStart: number;
  msAtStart: number;
  bpm: number;
}

interface SlideNoteRole {
  timingGroup: string;
  predecessorNoteId: string | null;
}

interface NoteDescriptor {
  noteId: string;
  beat: number;
  lane: number;
  note: RuntimeNoteSemantic;
  timingGroup: string;
  predecessorNoteId: string | null;
  slideChainId: string | null;
  slideChainNodeIndex: number;
  order: number;
}

interface InternalEvent {
  event: ChartEvent;
  order: number;
  atMs: number;
  noteId: string | null;
  predecessorNoteId: string | null;
  slideChainId: string | null;
}

interface SamelineGroupItem {
  event: NoteChartEvent;
  eventIndex: number;
  lane: number;
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
  return Number(toFinite(value, 0).toFixed(6));
}

function normalizeTimingGroup(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === "#Global") {
      return "#Global";
    }
    if (/^#[A-Za-z0-9 -]+$/.test(trimmed)) {
      return trimmed;
    }
    return "#Global";
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "#Global";
  }
  const normalized = Math.max(0, Math.round(numeric));
  return normalized === 0 ? "#Global" : `#${normalized}`;
}

function normalizeDirectionalWidth(value: unknown): number {
  return Math.max(1, Math.round(toFinite(value, 1)));
}

function normalizeRhythmWidth(value: unknown, settings: SimulatorSettings): number {
  if (!settings.habahiro) {
    return 1;
  }
  return Math.max(1, Math.min(7, Math.round(toFinite(value, 1))));
}

function buildTopLevelSemantic(
  note: SimulatorChartNote,
  settings: SimulatorSettings,
): RuntimeNoteSemantic | null {
  if (note.type === "single" || note.type === "flick" || note.type === "skill") {
    return {
      baseType: note.type,
      slideRole: "none",
      directionalWidth: 1,
      rhythmWidth: normalizeRhythmWidth(note.width, settings),
    };
  }
  if (note.type === "directional_flick_left" || note.type === "directional_flick_right") {
    return {
      baseType: note.type,
      slideRole: "none",
      directionalWidth: normalizeDirectionalWidth(note.width),
      rhythmWidth: 1,
    };
  }
  return null;
}

function resolveSlideRoleForChainNote(
  note: SimulatorChartNote,
  index: number,
  length: number,
): RuntimeSlideRole {
  if (note.type === "directional_flick_left" || note.type === "directional_flick_right") {
    return "none";
  }
  if (note.type === "hidden") {
    return "hidden";
  }
  if (length <= 1) {
    return "none";
  }
  if (index === 0) {
    return "start";
  }
  if (index === length - 1) {
    return "end";
  }
  return "middle";
}

function buildSlideSemantic(
  note: SimulatorChartNote,
  index: number,
  length: number,
  settings: SimulatorSettings,
): RuntimeNoteSemantic | null {
  const slideRole = resolveSlideRoleForChainNote(note, index, length);
  if (note.type === "single" || note.type === "flick" || note.type === "skill") {
    return {
      baseType: note.type,
      slideRole,
      directionalWidth: 1,
      rhythmWidth: normalizeRhythmWidth(note.width, settings),
    };
  }
  if (note.type === "hidden") {
    return {
      baseType: "hidden",
      slideRole: "hidden",
      directionalWidth: 1,
      rhythmWidth: normalizeRhythmWidth(note.width, settings),
    };
  }
  if (note.type === "directional_flick_left" || note.type === "directional_flick_right") {
    return {
      baseType: note.type,
      slideRole: "none",
      directionalWidth: normalizeDirectionalWidth(note.width),
      rhythmWidth: 1,
    };
  }
  return null;
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
  settings: SimulatorSettings,
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
    const semantic = buildTopLevelSemantic(note, settings);
    if (semantic === null) {
      continue;
    }
    descriptors.push({
      noteId: note.id,
      beat: normalizeBeat(note.beat),
      lane: normalizeLane(note.lane),
      note: semantic,
      timingGroup: normalizeTimingGroup(note.timingGroup),
      predecessorNoteId: null,
      slideChainId: null,
      slideChainNodeIndex: -1,
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
      const semantic = buildSlideSemantic(note, index, chainLength, settings);
      if (semantic === null) {
        continue;
      }
      descriptors.push({
        noteId,
        beat: normalizeBeat(note.beat),
        lane: normalizeLane(note.lane),
        note: semantic,
        timingGroup: chainTimingGroup,
        predecessorNoteId: index > 0 ? validNoteIds[index - 1] : null,
        slideChainId: chain.id,
        slideChainNodeIndex: index,
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
): TimingGroupSourceEvent[] {
  const output: TimingGroupSourceEvent[] = [];
  for (let index = 0; index < svEvents.length; index += 1) {
    const sv = svEvents[index];
    const timingGroup = normalizeTimingGroup(sv.timingGroup);
    const beat = normalizeBeat(sv.beat);
    const speed = normalizeSvValue(sv.value, 1);
    output.push({
      timingGroup,
      atMs: beatToMs(segments, beat),
      value: speed,
      order: index,
    });
  }
  return output;
}

function shouldExcludeFromSameLine(event: ChartEvent): boolean {
  if (event.eventType !== "note" || !event.note) {
    return true;
  }
  if (event.note.baseType === "hidden") {
    return true;
  }
  return event.note.slideRole === "middle" || event.note.slideRole === "hidden";
}

function renderCenterLaneForEvent(event: NoteChartEvent): number {
  const note = event.note;
  if (note.baseType === "directional_flick_left" || note.baseType === "directional_flick_right") {
    return event.lane;
  }
  return event.lane + (Math.max(1, note.rhythmWidth) - 1) / 2;
}

function assignSamelineLanes(events: ChartEvent[], enabled: boolean): SimultaneousGroup[] {
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.eventType === "note") {
      event.samelineGroup = null;
    }
  }
  if (!enabled) {
    return [];
  }

  const samelineGroupByBeat = new Map<string, SamelineGroupItem[]>();
  const simultaneousGroups: SimultaneousGroup[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (shouldExcludeFromSameLine(event)) {
      continue;
    }
    if (event.eventType !== "note") {
      continue;
    }
    const item: SamelineGroupItem = {
      event,
      eventIndex: index,
      lane: renderCenterLaneForEvent(event),
    };
    const beatKey = event.beat.toFixed(6);
    const group = samelineGroupByBeat.get(beatKey);
    if (group) {
      group.push(item);
    } else {
      const nextGroup = [item];
      samelineGroupByBeat.set(beatKey, nextGroup);
    }
  }

  for (const group of samelineGroupByBeat.values()) {
    if (group.length < 2) {
      continue;
    }
    group.sort((left, right) => left.lane - right.lane);
    const groupIndex = simultaneousGroups.length;
    const simultaneousGroup: SimultaneousGroup = {
      groupIndex,
      eventIndices: group.map((item) => item.eventIndex),
    };
    for (const item of group) {
      item.event.samelineGroup = groupIndex;
    }
    simultaneousGroups.push(simultaneousGroup);
  }
  return simultaneousGroups;
}

function assignSlideTypes(events: ChartEvent[]): void {
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.eventType !== "slide" || event.nodeEventIndices.length < 2) {
      continue;
    }
    const allNodesHidden = event.nodeEventIndices.every((nodeEventIndex) => {
      const nodeEvent = events[nodeEventIndex];
      return nodeEvent?.eventType === "note" && nodeEvent.note.baseType === "hidden";
    });
    if (allNodesHidden) {
      event.slideType = "hidden";
      continue;
    }

    const headNodeEvent = events[event.headNodeEventIndex];
    const tailNodeEvent = events[event.tailNodeEventIndex];
    if (
      event.nodeEventIndices.length === 2
      && headNodeEvent?.eventType === "note"
      && tailNodeEvent?.eventType === "note"
      && headNodeEvent.lane === tailNodeEvent.lane
    ) {
      event.slideType = "long";
      continue;
    }

    event.slideType = "slide";
  }
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
  const noteDescriptors = buildNoteDescriptors(notes, slideChains, settings);
  const noteDescriptorById = new Map<string, NoteDescriptor>();
  for (const descriptor of noteDescriptors) {
    noteDescriptorById.set(descriptor.noteId, descriptor);
  }
  const groupedSv = buildSvRuntimeMap(svEvents, segments);
  const hasNonGlobalTimingGroupNote = noteDescriptors.some((descriptor) => descriptor.timingGroup !== "#Global");
  const hasSv = svEvents.length > 0;
  const useTimingGroups = hasSv || hasNonGlobalTimingGroupNote;

  const usedGroupSet = new Set<string>();
  if (useTimingGroups) {
    usedGroupSet.add("#Global");
    for (const descriptor of noteDescriptors) {
      usedGroupSet.add(normalizeTimingGroup(descriptor.timingGroup));
    }
    for (const sv of svEvents) {
      usedGroupSet.add(normalizeTimingGroup(sv.timingGroup));
    }
  }
  const usedGroups = Array.from(usedGroupSet.values()).sort((left, right) => {
    if (left === "#Global") {
      return -1;
    }
    if (right === "#Global") {
      return 1;
    }
    return left.localeCompare(right, "en", { numeric: true });
  });
  const sortedSvEvents = groupedSv.sort((left, right) => {
    if (Math.abs(left.atMs - right.atMs) > BEAT_EPSILON) {
      return left.atMs - right.atMs;
    }
    return left.order - right.order;
  });
  const globalSvEvents = sortedSvEvents.filter((event) => normalizeTimingGroup(event.timingGroup) === "#Global");
  const effectiveSvEvents = usedGroups.flatMap((groupId) => {
    const groupSvEvents = groupId === "#Global"
      ? []
      : sortedSvEvents.filter((event) => normalizeTimingGroup(event.timingGroup) === groupId);
    return [...groupSvEvents, ...globalSvEvents].map((event, order) => ({
      ...event,
      timingGroup: groupId,
      order,
    }));
  });
  const { timingGroups, internalToRuntimeGroup } = buildTimingGroupDefs(usedGroups, effectiveSvEvents);

  const offsetMs = settings.offsetMs;
  const travelMs = settings.noteSpeedFrames * 1000 / SIMULATOR_TIMING_FPS;
  const viewportBottomPercent = calculateStageGeometry(settings.windowX, settings.windowY).viewportBottomPercent;
  const viewportBottomAxisMs = Math.max(
    0,
    frameDeltaFromJudgeToPercent(viewportBottomPercent, settings.noteSpeedFrames)
      * 1000 / SIMULATOR_TIMING_FPS,
  );
  const noteTimes = noteDescriptors.map((descriptor) => beatToMs(segments, descriptor.beat));
  const chartSearchStartMs = Math.min(0, ...noteTimes) - travelMs - viewportBottomAxisMs - 1000;
  const chartSearchEndMs = Math.max(0, ...noteTimes) + travelMs + viewportBottomAxisMs + 10000;
  const musicStartMs = offsetMs;

  const internalEvents: InternalEvent[] = [];

  // Always synthesize a music-start event so BGM can start in payload-driven mode.
  internalEvents.push({
    event: {
      beat: 0,
      eventType: "music_start",
      startMs: musicStartMs,
      hitMs: musicStartMs,
      visibleEndMs: musicStartMs,
      bpm: bpmAtBeat(segments, 0),
    },
    order: -3,
    atMs: 0,
    noteId: null,
    predecessorNoteId: null,
    slideChainId: null,
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
        eventType: "bpm",
        startMs: atMs + offsetMs - travelMs,
        hitMs: atMs + offsetMs,
        visibleEndMs: atMs + offsetMs,
        bpm,
      },
      order: -2 + index / 1000000,
      atMs,
      noteId: null,
      predecessorNoteId: null,
      slideChainId: null,
    });
  }

  for (const descriptor of noteDescriptors) {
    const atMs = beatToMs(segments, descriptor.beat);
    const normalizedTimingGroup = normalizeTimingGroup(descriptor.timingGroup);
    const tgId = useTimingGroups
      ? (internalToRuntimeGroup.get(normalizedTimingGroup) ?? 0)
      : -1;
    const tgDef = tgId >= 0 ? timingGroups[tgId] : null;
    const tgPos = useTimingGroups ? axisAtMs(tgDef, atMs) : 0;
    const visibilityWindows = useTimingGroups
      ? findVisibilityWindows(
        tgDef,
        tgPos,
        travelMs,
        viewportBottomAxisMs,
        chartSearchStartMs,
        chartSearchEndMs,
      )
      : [];
    const startMs = visibilityWindows.length > 0
      ? Math.min(visibilityWindows[0].startMs + offsetMs, atMs + offsetMs)
      : atMs + offsetMs - travelMs;
    const visibleEndMs = atMs + offsetMs;
    const eventVisibilityWindows = visibilityWindows.map((window) => ({
      startMs: window.startMs + offsetMs,
      endMs: window.endMs + offsetMs,
    }));

    internalEvents.push({
      event: {
        beat: descriptor.beat,
        eventType: "note",
        note: descriptor.note,
        lane: descriptor.lane,
        tgId,
        tgPos,
        startMs,
        hitMs: atMs + offsetMs,
        visibleEndMs,
        visibilityWindows: eventVisibilityWindows,
        samelineGroup: null,
        prevSlideNodeEventIndex: -1,
        nextSlideNodeEventIndex: -1,
        slideChainEventIndex: -1,
      },
      order: descriptor.order,
      atMs,
      noteId: descriptor.noteId,
      predecessorNoteId: descriptor.predecessorNoteId,
      slideChainId: descriptor.slideChainId,
    });
  }

  for (const chain of slideChains) {
    const chainId = typeof chain.id === "string" ? chain.id : "";
    if (chainId.length === 0) {
      continue;
    }
    const validDescriptors = chain.noteIds
      .map((noteId) => noteDescriptorById.get(noteId) ?? null)
      .filter((descriptor): descriptor is NoteDescriptor => descriptor !== null && descriptor.slideChainId === chainId);
    if (validDescriptors.length === 0) {
      continue;
    }
    const headDescriptor = validDescriptors[0];
    const tailDescriptor = validDescriptors[validDescriptors.length - 1];
    const headAtMs = beatToMs(segments, headDescriptor.beat);
    const tailAtMs = beatToMs(segments, tailDescriptor.beat);
    const chainTimingGroup = normalizeTimingGroup(chain.timingGroup);
    const tgId = useTimingGroups
      ? (internalToRuntimeGroup.get(chainTimingGroup) ?? 0)
      : -1;
    const tgDef = tgId >= 0 ? timingGroups[tgId] : null;
    const tgPos = useTimingGroups ? axisAtMs(tgDef, headAtMs) : 0;
    const headStartMs = headAtMs + offsetMs - travelMs;
    const tailHitMs = tailAtMs + offsetMs;
    internalEvents.push({
      event: {
        beat: headDescriptor.beat,
        eventType: "slide",
        lane: headDescriptor.lane,
        tgId,
        tgPos,
        startMs: headStartMs,
        hitMs: headAtMs + offsetMs,
        visibleEndMs: tailHitMs,
        nodeEventIndices: [],
        headNodeEventIndex: -1,
        tailNodeEventIndex: -1,
        slideType: "slide",
      },
      order: headDescriptor.order - 0.5,
      atMs: headAtMs,
      noteId: null,
      predecessorNoteId: null,
      slideChainId: chainId,
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
  const slideIndexByChainId = new Map<string, number>();
  for (let index = 0; index < internalEvents.length; index += 1) {
    const internalEvent = internalEvents[index];
    const noteId = internalEvent.noteId;
    if (noteId) {
      noteIndexById.set(noteId, index);
    }
    if (internalEvent.event.eventType === "slide" && internalEvent.slideChainId) {
      slideIndexByChainId.set(internalEvent.slideChainId, index);
    }
  }

  const events: ChartEvent[] = internalEvents.map((entry) => {
    if (entry.event.eventType === "note") {
      const prevSlideNodeEventIndex =
        entry.predecessorNoteId && noteIndexById.has(entry.predecessorNoteId)
          ? (noteIndexById.get(entry.predecessorNoteId) ?? -1)
          : -1;
      return {
        ...entry.event,
        prevSlideNodeEventIndex,
        nextSlideNodeEventIndex: -1,
        slideChainEventIndex: entry.slideChainId ? slideIndexByChainId.get(entry.slideChainId) ?? -1 : -1,
      };
    }
    if (entry.event.eventType === "slide") {
      return {
        ...entry.event,
        nodeEventIndices: [],
        headNodeEventIndex: -1,
        tailNodeEventIndex: -1,
        slideType: "slide",
      };
    }
    return entry.event;
  });
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.eventType !== "note") {
      continue;
    }
    const prevSlideNodeEventIndex = event.prevSlideNodeEventIndex;
    if (prevSlideNodeEventIndex >= 0 && prevSlideNodeEventIndex < events.length) {
      const prevEvent = events[prevSlideNodeEventIndex];
      if (prevEvent.eventType === "note") {
        prevEvent.nextSlideNodeEventIndex = index;
      }
    }
  }
  for (const [chainId, slideChainEventIndex] of slideIndexByChainId) {
    const noteEventIndices = internalEvents
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.event.eventType === "note" && entry.slideChainId === chainId)
      .sort((left, right) => {
        const leftDescriptor = left.entry.noteId ? noteDescriptorById.get(left.entry.noteId) : null;
        const rightDescriptor = right.entry.noteId ? noteDescriptorById.get(right.entry.noteId) : null;
        return (leftDescriptor?.slideChainNodeIndex ?? 0) - (rightDescriptor?.slideChainNodeIndex ?? 0);
      })
      .map(({ index }) => index);
    const headEventIndex = noteEventIndices[0] ?? -1;
    const tailEventIndex = noteEventIndices[noteEventIndices.length - 1] ?? -1;
    const slideEvent = events[slideChainEventIndex];
    if (slideEvent.eventType === "slide") {
      slideEvent.nodeEventIndices = noteEventIndices;
      slideEvent.headNodeEventIndex = headEventIndex;
      slideEvent.tailNodeEventIndex = tailEventIndex;
    }
    for (const noteEventIndex of noteEventIndices) {
      const noteEvent = events[noteEventIndex];
      if (noteEvent.eventType !== "note") {
        continue;
      }
      noteEvent.slideChainEventIndex = slideChainEventIndex;
    }
  }
  assignSlideTypes(events);
  const simultaneousGroups = assignSamelineLanes(events, settings.sameline);

  let noteCount = 0;
  let maxTimeMs = 10;
  for (let index = 0; index < internalEvents.length; index += 1) {
    const { event, atMs } = internalEvents[index];
    if (isJudgedEvent(event)) {
      noteCount += 1;
    }
    const eventMaxMs = Math.max(atMs, event.hitMs, event.visibleEndMs);
    if (eventMaxMs > maxTimeMs) {
      maxTimeMs = eventMaxMs;
    }
  }

  const maxRenderTimeMs = Math.max(maxTimeMs + 2000, musicStartMs + 2000);

  return {
    initialBpm: baseBpm,
    events,
    noteCount,
    maxTimeMs: maxRenderTimeMs,
    timingGroups,
    simultaneousGroups,
  };
}
