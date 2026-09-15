import { encodeVirtualLanePosition, type VirtualLaneSource } from "../engine/chart/virtualLane";
import type {
  GarupaChartJson,
  GarupaChartJsonDirectionalNote,
  GarupaChartJsonSimpleNote,
  GarupaChartJsonSlideConnection,
  GarupaChartJsonSlideItem,
} from "../../chart";
import { freezeChartConstructionResult } from "../engine/chart/immutability";
import { registerMultiRangeSourceIdentity } from "../engine/chart/multiRangeSources";
import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  VirtualLaneDirection,
  type AfterNoteTypeValue,
  type ButtonTypeValue,
  type ChartConstructionResult,
  type FrontNoteTypeValue,
  type GameNoteAdditionalTypeValue,
  type GameNoteTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
  type NoteLaneSpan,
} from "../engine/chart/types";
import { integrityFailure, ok, type SimulatorResult } from "../engine/result";
import { registerConstructedChartRuntimeMetadata } from "../engine/runtime/chartRuntimeMetadata";
import {
  freezeGarupaProductChartProfile,
  registerGarupaProductChartProfile,
  type GarupaProductChartProfile,
  type GarupaProductNode,
  type GarupaProductSlideChain,
  type GarupaProductSvEvent,
  type GarupaProductTimingGroupId,
} from "../engine/garupa/productChartProfile";
import {
  createGarupaProductTimingGroupAxisProfile,
  registerGarupaProductTimingGroupAxisProfile,
} from "../engine/garupa/timingGroupAxis";

export const GARUPA_JSON_POSITION_UNITS_PER_BEAT = 48;
const POSITION_UNITS_PER_BAR = 192;
const MAX_POSITION = 0x7fffffff;
const LANE_COUNT = 7;
const CC_BY_LANE: readonly number[] = [16, 11, 12, 13, 14, 15, 18];

type RhythmConnection = GarupaChartJsonSimpleNote | GarupaChartJsonDirectionalNote;

interface PositionedRecord {
  readonly absolutePos: number;
  readonly sourceOrder: number;
  readonly localOrder: number;
  readonly note: NoteInformation;
}

interface PositionFields {
  readonly barIndex: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly absolutePos: number;
  readonly shortRhythmUnder8beat: boolean;
}

interface ButtonSpan {
  readonly virtualLane?: VirtualLaneSource;
  readonly laneSpan?: NoteLaneSpan;
  readonly buttons: readonly ButtonTypeValue[];
  readonly primary: ButtonTypeValue;
  readonly ccNums: readonly number[];
  readonly halfButtonIndex: number;
}

interface NoteKinds {
  readonly game: GameNoteTypeValue;
  readonly front: FrontNoteTypeValue;
  readonly after: AfterNoteTypeValue;
}

export function constructChartFromGarupaChartJson(
  chart: GarupaChartJson,
): SimulatorResult<ChartConstructionResult> {
  const profile = buildGarupaProductChartProfile(chart);
  if (profile.status !== "ok") return profile;
  const originalSources = new Map<string, NoteInformation>();
  const extensions = Object.freeze({ ...profile.value, originalSources });
  const constructed = constructGarupaNoteGraphs(chart, extensions, originalSources);
  if (constructed.status !== "ok") return constructed;
  const axis = createGarupaProductTimingGroupAxisProfile(constructed.value, profile.value);
  if (axis.status !== "ok") return axis;
  const roots = new Map<number, NoteInformation>();
  const membersByOrder = new Map<number, NoteInformation[]>();
  for (const batch of constructed.value.noteBatches) for (const source of batch.informationList) {
    const order = extensions.originalSourceOrder.get(source);
    if (order !== undefined) {
      if (!roots.has(order) || source.isSlideNoteHead || source.fireNoteType === FrontNoteType.Long) roots.set(order, source);
      const members = membersByOrder.get(order) ?? [];
      members.push(source); membersByOrder.set(order, members);
    }
  }
  const bound = freezeGarupaProductChartProfile({
    originalItemIndices: extensions.originalItemIndices, svEvents: [...extensions.svEvents],
    slideChains: [...extensions.slideChains],
    nodes: extensions.authoredNodes.map(node => {
      const root = roots.get(node.chartItemIndex);
      const source = originalSources.get(node.identity);
      return root === undefined || source === undefined ? node : { ...node,
        scoringSource: node.visible ? source : null, runtimeRoot: root,
        runtimeMembers: Object.freeze(membersByOrder.get(node.chartItemIndex)!.filter(member =>
          member === root || (member.directionalSlideConnection === undefined
            ? node.connectionIndex === null || node.connectionIndex === root.slideNoteList.length
            : member.directionalSlideConnection.connectionIndex === node.connectionIndex))),
        scoringPhase: node.connectionIndex === null || node.connectionIndex === 0 ? "head"
          : source === root || source === root.slideNoteList[root.slideNoteList.length - 1] ? "tail" : "intermediate" };
    }),
  });
  registerGarupaProductChartProfile(constructed.value, Object.freeze({ ...bound,
    originalSources, originalSourceOrder: extensions.originalSourceOrder }));
  registerGarupaProductTimingGroupAxisProfile(constructed.value, axis.value);
  return constructed;
}

function constructGarupaNoteGraphs(
  chart: GarupaChartJson,
  extensions: GarupaProductChartProfile,
  originalSources: Map<string, NoteInformation>,
): SimulatorResult<ChartConstructionResult> {
  const bpmItems: Array<{ readonly sourceOrder: number; readonly absolutePos: number; readonly value: number; readonly text: string }> = [];
  for (let sourceOrder = 0; sourceOrder < chart.length; sourceOrder += 1) {
    const item = chart[sourceOrder];
    if (item === undefined || item.type !== "BPM") continue;
    const position = garupaBeatToAbsolutePosition(item.beat);
    if (position.status !== "ok") return position;
    if (!isRuntimeBpm(item.value)) {
      return invalidBpm(`chart[${sourceOrder}] BPM must remain positive and finite after binary32 conversion.`);
    }
    bpmItems.push(Object.freeze({
      sourceOrder,
      absolutePos: position.value,
      value: Math.fround(item.value),
      text: String(item.value),
    }));
  }
  bpmItems.sort((left, right) => left.absolutePos - right.absolutePos || left.sourceOrder - right.sourceOrder);
  const baseItems = bpmItems.filter((item) => item.absolutePos === 0);
  if (baseItems.length === 0) {
    return invalidBpm("Garupa JSON requires an explicit positive initial BPM at position zero.");
  }
  // Initial BPM maps to the original header scalar: each valid header overwrites it.
  const baseBpm = baseItems[baseItems.length - 1]!;
  // Keep same-position changes in authored order. Activation, BPM lookup and
  // the SV clock consume the same first CC 3/8 command from each batch.

  // Every input is constructed in the same NoteInformation/scoring namespace.
  let nextIndex = 0;
  let slideOrdinal = 0;
  const records: PositionedRecord[] = [];
  for (let sourceOrder = 0; sourceOrder < chart.length; sourceOrder += 1) {
    const item = chart[sourceOrder];
    if (item === undefined || item.type === "SV" || item.type === "BPM") continue;
    const projected = !extensions.originalItemIndices.has(sourceOrder);
    if (item.type === "Slide") {
      const long = isLongShape(item);
      const slide = long ? createLong(item, nextIndex, projected) : createSlide(item, sourceOrder, slideOrdinal, nextIndex, projected);
      if (slide.status !== "ok") return slide;
      records.push(Object.freeze({
        absolutePos: slide.value.root.absolutePos,
        sourceOrder,
        localOrder: 0,
        note: slide.value.root,
      }));
      for (let helperIndex = 0; helperIndex < slide.value.additionalRoots.length; helperIndex += 1) {
        const helper = slide.value.additionalRoots[helperIndex]!;
        records.push(Object.freeze({
          absolutePos: helper.absolutePos,
          sourceOrder,
          localOrder: helperIndex + 1,
          note: helper,
        }));
      }
      nextIndex = slide.value.nextIndex;
      if (!long) slideOrdinal += 1;
      continue;
    }
    const position = positionFields(item.beat);
    if (position.status !== "ok") return position;
    if (item.type === "Directional") {
      const span = directionalSpan(item, projected);
      if (span.status !== "ok") return span;
      const multiple = item.width > 1;
      const directionalMemberRootIndex = item.width > LANE_COUNT ? nextIndex : undefined;
      for (let localOrder = 0; localOrder < item.width; localOrder += 1) {
        const lane = (item.direction === "Left" ? item.lane - item.width + 1 : item.lane) + localOrder;
        const note = createBaseNote({
          directionalMemberRootIndex,
          ...(directionalMemberRootIndex === undefined ? {} : { directionalMemberOffset: localOrder }),
          index: nextIndex++,
          position: position.value,
          span: projectedSpan(lane, 1, projected),
          kinds: directionalKinds(item.direction, multiple),
          additional: GameNoteAdditionalType.None,
        });
        records.push(Object.freeze({ absolutePos: note.absolutePos, sourceOrder, localOrder, note }));
      }
      continue;
    }
    const span = rhythmSpan(item, projected);
    if (span.status !== "ok") return span;
    const note = createBaseNote({
      index: nextIndex++,
      position: position.value,
      span: span.value,
      kinds: simpleKinds(item.type),
      additional: item.type === "Skill" ? GameNoteAdditionalType.Skill : GameNoteAdditionalType.None,
    });
    records.push(Object.freeze({ absolutePos: note.absolutePos, sourceOrder, localOrder: 0, note }));
  }

  for (const bpm of bpmItems) {
    if (bpm.absolutePos === 0) continue;
    const position = positionFieldsFromAbsolute(bpm.absolutePos);
    const note = createBaseNote({
      index: nextIndex++,
      position,
      span: commandSpan(),
      kinds: Object.freeze({ game: GameNoteType.LongEndFlick, front: FrontNoteType.None, after: AfterNoteType.None }),
      additional: GameNoteAdditionalType.None,
      bpm: bpm.value,
      bpmString: bpm.text,
      ccNum: 8,
    });
    records.push(Object.freeze({
      absolutePos: bpm.absolutePos,
      sourceOrder: bpm.sourceOrder,
      localOrder: 0x7fffffff,
      note,
    }));
  }

  records.sort((left, right) =>
    left.absolutePos - right.absolutePos ||
    left.sourceOrder - right.sourceOrder ||
    left.localOrder - right.localOrder);
  for (const record of records) extensions.originalSourceOrder.set(record.note, record.sourceOrder);
  const noteBatches = createBatches(records);
  const roots = new Map(records.filter((record) => record.localOrder === 0).map((record) => [record.sourceOrder, record.note]));
  for (const node of extensions.authoredNodes) {
    const root = roots.get(node.chartItemIndex);
    if (root === undefined) continue;
    const source = node.connectionIndex === null || node.connectionIndex === 0 || root.fireNoteType === FrontNoteType.Long
      ? root : root.slideNoteList[node.connectionIndex - 1];
    if (source !== undefined) originalSources.set(node.identity, source);
  }
  const changeItems = bpmItems.filter((item) => item.absolutePos > 0);
  const result = freezeChartConstructionResult({
    noteBatches,
    startBpm: baseBpm.value,
    startBpmString: baseBpm.text,
    bpmChangeRealValueList: changeItems.map((item) => item.value),
    bpmChangeStringRealValueList: changeItems.map((item) => item.text),
    // Garupa JSON has no #HABAHIRO mode marker; note widths are independent geometry.
    isMultiRangeNotes: false,
    habahiroChangeAbsolutePos: -1,
  });
  registerConstructedChartRuntimeMetadata(result);
  return ok(result);
}

function buildGarupaProductChartProfile(
  chart: GarupaChartJson,
): SimulatorResult<GarupaProductChartProfile> {
  const svEvents: GarupaProductSvEvent[] = [];
  const nodes: GarupaProductNode[] = [];
  const slideChains: GarupaProductSlideChain[] = [];
  let authoredOrder = 0;

  for (let sourceOrder = 0; sourceOrder < chart.length; sourceOrder += 1) {
    const item = chart[sourceOrder]!;
    if (item.type === "BPM") continue;
    if (item.type === "SV") {
      const position = garupaBeatToAbsolutePosition(item.beat);
      if (position.status !== "ok") return position;
      svEvents.push({
        sourceOrder,
        // SV is a visual-axis event, not an original integer judgement position.
        // Preserve sub-tick pulses; only the shared position unit is reused.
        absolutePosition: item.beat * GARUPA_JSON_POSITION_UNITS_PER_BEAT,
        value: normalizeProductSvValue(item.value),
        timingGroup: productTimingGroup(item.timingGroup),
      });
      continue;
    }
    if (item.type === "Slide") {
      if (item.connections.length < 2) {
        return unsupportedSlide(`chart[${sourceOrder}].connections requires at least two nodes.`);
      }
      const chainIdentity = `garupa-slide:${sourceOrder}`;
      const ownerGroup = productTimingGroup(item.timingGroup);
      const connectionIdentities: string[] = [];
      const visibleConnectionIdentities: string[] = [];
      let containsHidden = false;
      for (let connectionIndex = 0; connectionIndex < item.connections.length; connectionIndex += 1) {
        const connection = item.connections[connectionIndex]!;
        const built = buildProductNode(
          connection,
          sourceOrder,
          connectionIndex,
          chainIdentity,
          authoredOrder++,
          connection.timingGroup === undefined
            ? ownerGroup
            : productTimingGroup(connection.timingGroup),
        );
        if (built.status !== "ok") return built;
        nodes.push(built.value);
        connectionIdentities.push(built.value.identity);
        containsHidden ||= !built.value.visible;
        if (built.value.visible) {
          visibleConnectionIdentities.push(built.value.identity);
        }
      }
      slideChains.push({
        identity: chainIdentity,
        chartItemIndex: sourceOrder,
        timingGroup: ownerGroup,
        connectionIdentities,
        visibleConnectionIdentities,
        allHidden: visibleConnectionIdentities.length === 0,
        containsHidden,
      });
      continue;
    }
    const built = buildProductNode(
      item,
      sourceOrder,
      null,
      null,
      authoredOrder++,
      productTimingGroup(item.timingGroup),
    );
    if (built.status !== "ok") return built;
    nodes.push(built.value);
  }

  // A group name or a neutral SV does not change note behaviour. Only notes
  // whose own geometry, topology or effective axis needs an extension use it.
  const needsAxisExtension = (group: GarupaProductTimingGroupId): boolean =>
    svEvents.some((event) => (event.timingGroup === "#Global" || event.timingGroup === group) && event.value !== 1);
  const originalItemIndices = new Set<number>();
  for (const [index, item] of chart.entries()) {
    if (item.type === "BPM" || item.type === "SV") continue;
    const group = productTimingGroup(item.timingGroup);
    const compatible = item.type === "Slide"
      ? item.connections.slice(0, -1).every(node => node.type !== "Flick" && node.type !== "Directional") &&
        item.connections[0]!.type !== "Hidden" && item.connections[item.connections.length - 1]!.type !== "Hidden" &&
        item.connections.every((node) =>
          canUseFixedLaneGeometry(node) && !needsAxisExtension(
            node.timingGroup === undefined ? group : productTimingGroup(node.timingGroup)))
      : canUseFixedLaneGeometry(item) && !needsAxisExtension(group);
    if (compatible) originalItemIndices.add(index);
  }
  return ok(freezeGarupaProductChartProfile({
    originalItemIndices,
    svEvents,
    nodes,
    slideChains: slideChains.filter((chain) => !originalItemIndices.has(chain.chartItemIndex)),
  }));
}

function buildProductNode(
  connection: GarupaChartJsonSlideConnection,
  chartItemIndex: number,
  connectionIndex: number | null,
  chainIdentity: string | null,
  authoredOrder: number,
  timingGroup: GarupaProductTimingGroupId,
): SimulatorResult<GarupaProductNode> {
  if (connection.type !== "Directional" && connection.width > LANE_COUNT) {
    const location = connectionIndex === null ? `chart[${chartItemIndex}]`
      : `chart[${chartItemIndex}].connections[${connectionIndex}]`;
    return invalidLane(`${location}: ${connection.type} width=${connection.width} exceeds the supported maximum of 7; only Directional may exceed it.`);
  }
  const position = positionFields(connection.beat);
  if (position.status !== "ok") return position;
  const spanStart = connection.type === "Directional" && connection.direction === "Left"
    ? connection.lane - connection.width + 1
    : connection.lane;
  const visible = connection.type !== "Hidden";
  const identity = connectionIndex === null
    ? `garupa-note:${chartItemIndex}`
    : `garupa-slide:${chartItemIndex}:connection:${connectionIndex}`;
  return ok(Object.freeze({
    identity,
    chartItemIndex,
    connectionIndex,
    chainIdentity,
    authoredOrder,
    type: connection.type,
    beat: connection.beat,
    absolutePosition: position.value.absolutePos,
    shortRhythmUnder8beat: position.value.shortRhythmUnder8beat,
    lane: connection.lane,
    width: connection.width,
    spanStart,
    spanEnd: spanStart + connection.width - 1,
    direction: connection.type === "Directional" ? connection.direction : null,
    timingGroup,
    visible,
    scoringSource: null,
  }));
}

function productTimingGroup(value: string | undefined): GarupaProductTimingGroupId {
  return value === undefined || value.trim() === "" || value === "#Global"
    ? "#Global"
    : value as GarupaProductTimingGroupId;
}

function normalizeProductSvValue(value: number): number {
  return Number(value.toFixed(6));
}

function canUseFixedLaneGeometry(connection: GarupaChartJsonSlideConnection): boolean {
  if (connection.type === "Hidden" && connection.width <= 7 &&
    encodeVirtualLanePosition(connection.lane, 7 - connection.width) !== null) return true;
  const start = connection.type === "Directional" && connection.direction === "Left"
    ? connection.lane - connection.width + 1
    : connection.lane;
  return Number.isInteger(connection.lane) && connection.width <= 7 &&
    start >= 0 && start + connection.width <= LANE_COUNT;
}

export function garupaBeatToAbsolutePosition(beat: number): SimulatorResult<number> {
  if (!Number.isFinite(beat) || beat < 0) {
    return invalidPosition("Garupa JSON beat must be finite and nonnegative.");
  }
  const scaled = beat * GARUPA_JSON_POSITION_UNITS_PER_BEAT;
  if (!Number.isFinite(scaled) || scaled > MAX_POSITION) {
    return invalidPosition("Garupa JSON beat exceeds the supported target position range.");
  }
  // Approved precision extension of the common position unit, not a second clock.
  return ok(scaled);
}

/** Garupa intentionally normalizes the indistinguishable straight Slide case.
 * Hidden/interior nodes and multi-lane directional gestures retain their Slide graph. */
function isLongShape(slide: GarupaChartJsonSlideItem): boolean {
  if (slide.connections.length !== 2) return false;
  const head = slide.connections[0]!, tail = slide.connections[1]!;
  return (head.type === "Single" || head.type === "Skill") &&
    (tail.type === "Single" || tail.type === "Skill" || tail.type === "Flick" ||
      tail.type === "Directional" && tail.width === 1) &&
    head.lane === tail.lane && head.width === tail.width &&
    tail.beat * GARUPA_JSON_POSITION_UNITS_PER_BEAT >
      head.beat * GARUPA_JSON_POSITION_UNITS_PER_BEAT;
}

function createLong(slide: GarupaChartJsonSlideItem, firstIndex: number, projected = false) {
  const head = slide.connections[0]! as GarupaChartJsonSimpleNote;
  const tail = slide.connections[1]!;
  const span = rhythmSpan(head, projected);
  if (span.status !== "ok") return span;
  const start = positionFields(head.beat);
  if (start.status !== "ok") return start;
  const end = positionFields(tail.beat);
  if (end.status !== "ok") return end;
  const root = createBaseNote({
    index: firstIndex, position: start.value, span: span.value,
    kinds: { game: GameNoteType.Long, front: FrontNoteType.Long,
      after: tail.type === "Flick" ? AfterNoteType.Flick : tail.type === "Directional"
        ? tail.direction === "Left" ? AfterNoteType.DirectionalFlickLeft : AfterNoteType.DirectionalFlickRight
        : AfterNoteType.Normal },
    additional: head.type === "Skill" ? GameNoteAdditionalType.Skill : GameNoteAdditionalType.None,
    terminalAdditional: tail.type === "Skill" ? GameNoteAdditionalType.Skill : GameNoteAdditionalType.None,
    afterNoteAbsolutePos: end.value.absolutePos,
    afterNoteShortRhythmUnder8beat: end.value.shortRhythmUnder8beat,
    ccNum: ccForButton(span.value.primary) + 40,
  });
  const longChannels = span.value.ccNums.map(cc => cc + 40);
  registerMultiRangeSourceIdentity(root, { ccNums: longChannels, afterCcNums: longChannels });
  return ok({ root, additionalRoots: [] as readonly NoteInformation[], nextIndex: firstIndex + 1 });
}

function createSlide(
  slide: GarupaChartJsonSlideItem,
  sourceOrder: number,
  slideOrdinal: number,
  firstIndex: number,
  projected = false,
): SimulatorResult<{
  readonly root: NoteInformation;
  readonly additionalRoots: readonly NoteInformation[];
  readonly nextIndex: number;
}> {
  if (slide.connections.length < 2) {
    return unsupportedSlide(`chart[${sourceOrder}] Slide requires at least two connections.`);
  }
  const head = slide.connections[0]!;
  const tail = slide.connections[slide.connections.length - 1]!;
  const positions: PositionFields[] = [];
  for (const connection of slide.connections) {
    const position = positionFields(connection.beat);
    if (position.status !== "ok") return position;
    positions.push(position.value);
  }

  const familyA = slideOrdinal % 2 === 0;
  const familyFront = familyA ? FrontNoteType.SlideA : FrontNoteType.SlideB;
  const familyGame = familyA ? GameNoteType.SlideA : GameNoteType.SlideB;
  const headSpan = head.type === "Directional" ? ok(projectedSpan(head.lane, 1, projected)) : rhythmSpan(head, projected);
  if (headSpan.status !== "ok") return headSpan;
  let nextIndex = firstIndex;
  const children: NoteInformation[] = [];
  for (let index = 1; index < slide.connections.length; index += 1) {
    const connection = slide.connections[index]!;
    const isTerminal = index === slide.connections.length - 1;
    const fullSpan = connection.type === "Directional"
      ? directionalSpan(connection, projected)
      : rhythmSpan(connection, projected);
    if (fullSpan.status !== "ok") return fullSpan;
    const span = connection.type === "Directional"
      ? projectedSpan(connection.lane, 1, projected)
      : fullSpan.value;
    const terminalKinds = isTerminal
      ? slideTerminalKinds(connection, familyA, connection.width > 1)
      : Object.freeze({ game: familyGame, front: familyFront, after: AfterNoteType.None });
    const child = createBaseNote({
      index: nextIndex + index,
      position: positions[index]!,
      span,
      kinds: terminalKinds,
      additional: connection.type === "Skill" ? GameNoteAdditionalType.Skill : GameNoteAdditionalType.None,
      invisible: connection.type === "Hidden",
      ...(!isTerminal ? slideGestureFields(connection) : {}),
    });
    children.push(child);
  }
  const terminal = children[children.length - 1]!;
  const terminalAdditional = tail.type === "Skill" ? GameNoteAdditionalType.Skill : GameNoteAdditionalType.None;
  const directionalMemberRootIndex = tail.type === "Directional" && tail.width > 3
    ? nextIndex : undefined;
  const root = createBaseNote({
    directionalMemberRootIndex,
    ...(directionalMemberRootIndex === undefined ? {} : { directionalMemberOffset: tail.type === "Directional" && tail.direction === "Left" ? tail.width - 1 : 0 }),
    index: nextIndex,
    position: positions[0]!,
    span: headSpan.value,
    kinds: Object.freeze({
      game: familyGame,
      front: familyFront,
      after: slideRootAfterType(tail, tail.type === "Directional" && tail.width > 1),
    }),
    additional: head.type === "Skill" ? GameNoteAdditionalType.Skill : GameNoteAdditionalType.None,
    isSlideNoteHead: true,
    ...slideGestureFields(head),
    invisible: head.type === "Hidden",
    ...(head.type === "Hidden" || tail.type === "Hidden" ? { hiddenSlideEndpoints: true as const } : {}),
    slideNoteList: children,
    terminalAdditional,
  });
  const additionalRoots: NoteInformation[] = [];
  if (tail.type === "Directional" && tail.width > 1) {
    const tailStart = tail.direction === "Left" ? tail.lane - tail.width + 1 : tail.lane;
    const helperFront = familyA
      ? FrontNoteType.SlideAMultipleDirectionalFlickAdd
      : FrontNoteType.SlideBMultipleDirectionalFlickAdd;
    for (let offset = 0; offset < tail.width; offset += 1) {
      const lane = tailStart + offset;
      if (offset === (tail.direction === "Left" ? tail.width - 1 : 0)) continue;
      additionalRoots.push(createBaseNote({
        directionalMemberRootIndex,
        ...(directionalMemberRootIndex === undefined ? {} : { directionalMemberOffset: offset }),
        index: nextIndex + slide.connections.length + additionalRoots.length,
        position: positions[positions.length - 1]!,
        span: projectedSpan(lane, 1, projected),
        kinds: Object.freeze({
          game: familyA
            ? tail.direction === "Left" ? GameNoteType.SlideADirectionalFlickLeftAdd : GameNoteType.SlideADirectionalFlickRightAdd
            : tail.direction === "Left" ? GameNoteType.SlideBDirectionalFlickLeftAdd : GameNoteType.SlideBDirectionalFlickRightAdd,
          front: helperFront,
          after: tail.direction === "Left"
            ? AfterNoteType.SlideMultipleDirectionalFlickLeft : AfterNoteType.SlideMultipleDirectionalFlickRight,
        }),
        additional: GameNoteAdditionalType.None,
        afterNoteAbsolutePos: terminal.absolutePos,
      }));
    }
  }
  // One chart node and judgement owner; only its presentation gets Add members.
  for (let connectionIndex = 0; connectionIndex < slide.connections.length - 1; connectionIndex += 1) {
    const node = slide.connections[connectionIndex]!;
    if (node.type !== "Directional" || node.width <= 1) continue;
    const start = node.direction === "Left" ? node.lane - node.width + 1 : node.lane;
    for (let memberOffset = 0; memberOffset < node.width; memberOffset += 1) {
      if (memberOffset === (node.direction === "Left" ? node.width - 1 : 0)) continue;
      additionalRoots.push(createBaseNote({
        directionalSlideConnection: { rootIndex: root.index, connectionIndex, memberOffset },
        index: nextIndex + slide.connections.length + additionalRoots.length,
        position: positions[connectionIndex]!,
        span: projectedSpan(start + memberOffset, 1, true),
        kinds: { game: familyA
          ? node.direction === "Left" ? GameNoteType.SlideADirectionalFlickLeftAdd : GameNoteType.SlideADirectionalFlickRightAdd
          : node.direction === "Left" ? GameNoteType.SlideBDirectionalFlickLeftAdd : GameNoteType.SlideBDirectionalFlickRightAdd,
          front: familyA ? FrontNoteType.SlideAMultipleDirectionalFlickAdd : FrontNoteType.SlideBMultipleDirectionalFlickAdd,
          after: node.direction === "Left" ? AfterNoteType.SlideMultipleDirectionalFlickLeft : AfterNoteType.SlideMultipleDirectionalFlickRight },
        additional: GameNoteAdditionalType.None,
        afterNoteAbsolutePos: positions[connectionIndex]!.absolutePos,
      }));
    }
  }
  registerMultiRangeSourceIdentity(root, {
    ccNums: headSpan.value.ccNums,
    afterCcNums: tail.type === "Directional"
      ? projectedSpan(tail.direction === "Left" ? tail.lane - tail.width + 1 : tail.lane, tail.width, projected).ccNums
      : terminal.buttonTypes.map(ccForButton),
  });
  nextIndex += slide.connections.length + additionalRoots.length;
  return ok(Object.freeze({
    root,
    additionalRoots: Object.freeze(additionalRoots),
    nextIndex,
  }));
}

function slideGestureFields(node: GarupaChartJsonSlideItem["connections"][number]): Pick<NoteInformation, "slideGesture" | "slideExitOffset"> {
  if (node.type !== "Flick" && node.type !== "Directional") return {};
  return { slideGesture: Object.freeze({ direction: node.type === "Directional" ? node.direction : null,
    width: node.width, noteType: node.type === "Flick" ? 3 : node.width > 1 ? 10 : 9 }),
    ...(node.type === "Directional" ? { slideExitOffset: (node.direction === "Left" ? -1 : 1) * (node.width - 1) } : {}) };
}

function createBaseNote(input: {
  readonly index: number;
  readonly position: PositionFields;
  readonly span: ButtonSpan;
  readonly kinds: NoteKinds;
  readonly additional: GameNoteAdditionalTypeValue;
  readonly invisible?: boolean;
  readonly hiddenSlideEndpoints?: true;
  readonly slideGesture?: NoteInformation["slideGesture"];
  readonly slideExitOffset?: number;
  readonly isSlideNoteHead?: boolean;
  readonly slideNoteList?: readonly NoteInformation[];
  readonly terminalAdditional?: GameNoteAdditionalTypeValue;
  readonly directionalSlideConnection?: NoteInformation["directionalSlideConnection"];
  readonly directionalMemberRootIndex?: number;
  readonly directionalMemberOffset?: number;
  readonly bpm?: number;
  readonly bpmString?: string;
  readonly ccNum?: number;
  readonly afterNoteAbsolutePos?: number;
  readonly afterNoteShortRhythmUnder8beat?: boolean;
}): NoteInformation {
  const note: NoteInformation = {
    ...(input.directionalSlideConnection === undefined ? {} : { directionalSlideConnection: input.directionalSlideConnection }),
    ...(input.directionalMemberRootIndex === undefined ? {} : { directionalMemberRootIndex: input.directionalMemberRootIndex, directionalMemberOffset: input.directionalMemberOffset }),
    ...(input.hiddenSlideEndpoints ? { hiddenSlideEndpoints: true as const } : {}),
    ...(input.slideGesture === undefined ? {} : { slideGesture: input.slideGesture }),
    ...(input.slideExitOffset === undefined ? {} : { slideExitOffset: input.slideExitOffset }),
    index: input.index,
    isResult: false,
    isSlideNoteHead: input.isSlideNoteHead ?? false,
    isMultiRangeCombine: false,
    isInvisible: input.invisible ?? false,
    ...(input.span.laneSpan === undefined ? {} : { laneSpan: input.span.laneSpan }),
    buttonType: input.span.primary,
    buttonTypes: [...input.span.buttons],
    buttonTypesArray: [...input.span.buttons],
    gameNoteType: input.kinds.game,
    fireNoteType: input.kinds.front,
    afterNoteType: input.kinds.after,
    halfButtonIndex: input.span.halfButtonIndex,
    soundValue: "",
    ccNum: input.ccNum ?? (input.span.primary === ButtonType.None ? 0 : ccForButton(input.span.primary)),
    barIndex: input.position.barIndex,
    numerator: input.position.numerator,
    denominator: input.position.denominator,
    absolutePos: input.position.absolutePos,
    afterNoteAbsolutePos: input.afterNoteAbsolutePos ?? -1,
    shortRhythmUnder8beat: input.position.shortRhythmUnder8beat,
    afterNoteShortRhythmUnder8beat: input.afterNoteShortRhythmUnder8beat ?? false,
    bpm: input.bpm ?? 0,
    bpmString: input.bpmString ?? "",
    storedAbsolutePos: input.position.absolutePos,
    slideNoteList: [...(input.slideNoteList ?? [])],
    soundValueList: [],
    gameNoteAdditionalType: input.additional,
    gameNoteAdditionalTypeLongNoteEnd: input.terminalAdditional ?? GameNoteAdditionalType.None,
    virtualLaneDirection: input.span.virtualLane?.virtualLaneDirection ?? VirtualLaneDirection.None,
    virtualLaneDistance: input.span.virtualLane?.virtualLaneDistance ?? 0,
  };
  registerMultiRangeSourceIdentity(note, { ccNums: input.span.ccNums, afterCcNums: [] });
  return note;
}

function createBatches(records: readonly PositionedRecord[]): NoteBatchInformation[] {
  const batches: NoteBatchInformation[] = [];
  for (const record of records) {
    const existing = batches[batches.length - 1];
    if (existing !== undefined && existing.absolutePos === record.absolutePos) {
      (existing.informationList as NoteInformation[]).push(record.note);
      continue;
    }
    const fields = positionFieldsFromAbsolute(record.absolutePos);
    batches.push({
      barIndex: fields.barIndex,
      numerator: fields.numerator,
      denominator: fields.denominator,
      absolutePos: fields.absolutePos,
      informationList: [record.note],
    });
  }
  return batches;
}

function positionFields(beat: number): SimulatorResult<PositionFields> {
  const absolute = garupaBeatToAbsolutePosition(beat);
  return absolute.status === "ok" ? ok(Object.freeze({
    ...positionFieldsFromAbsolute(absolute.value),
    // Original (8 * numerator) % denominator is evaluated before target quantization.
    shortRhythmUnder8beat: !Number.isInteger(beat * 2),
  })) : absolute;
}

function positionFieldsFromAbsolute(absolutePos: number): PositionFields {
  const barIndex = Math.floor(absolutePos / POSITION_UNITS_PER_BAR);
  const relative = absolutePos - barIndex * POSITION_UNITS_PER_BAR;
  const divisor = Number.isInteger(relative) ? greatestCommonDivisor(relative, POSITION_UNITS_PER_BAR) : 1;
  const numerator = relative / divisor;
  const denominator = POSITION_UNITS_PER_BAR / divisor;
  return Object.freeze({
    barIndex,
    numerator,
    denominator,
    absolutePos,
    shortRhythmUnder8beat: (8 * numerator) % denominator > 0,
  });
}

function rhythmSpan(connection: GarupaChartJsonSimpleNote, projected = false): SimulatorResult<ButtonSpan> {
  if (connection.type === "Hidden" && connection.width <= 7) {
    const lane = encodeVirtualLanePosition(connection.lane, 7 - connection.width);
    if (lane !== null) {
      const span = spanFromStart(lane.baseLane, connection.width);
      if (span.status !== "ok") return span;
      return ok({ ...span.value, virtualLane: lane });
    }
  }
  return projected ? ok(projectedSpan(connection.lane, connection.width, true)) : spanFromStart(connection.lane, connection.width);
}

function directionalSpan(connection: GarupaChartJsonDirectionalNote, projected = false): SimulatorResult<ButtonSpan> {
  const start = connection.direction === "Left"
    ? connection.lane - connection.width + 1
    : connection.lane;
  return projected ? ok(projectedSpan(start, connection.width, true)) : spanFromStart(start, connection.width);
}

function projectedSpan(start: number, width: number, projected: boolean): ButtonSpan {
  const native = spanFromStart(start, width);
  if (!projected && native.status === "ok") return native.value;
  return { ...(native.status === "ok" ? native.value : commandSpan()),
    laneSpan: Object.freeze({ start, end: start + width - 1, width }) };
}

function spanFromStart(start: number, width: number): SimulatorResult<ButtonSpan> {
  if (!Number.isInteger(start) || !Number.isInteger(width) || width <= 0 ||
    start < 0 || start + width > LANE_COUNT) {
    return invalidLane("Garupa JSON lane/width span must remain entirely inside playable lanes 0..6; Button 07 is unreachable.");
  }
  const buttons = Object.freeze(Array.from({ length: width }, (_, index) => (start + index) as ButtonTypeValue));
  const primary = buttons[Math.floor((buttons.length - 1) / 2)]!;
  return ok(Object.freeze({
    buttons,
    primary,
    ccNums: Object.freeze(buttons.map(ccForButton)),
    halfButtonIndex: buttons.length % 2 === 0
      ? Math.trunc(buttons.reduce<number>((sum, button) => sum + button, 0) / buttons.length)
      : -1,
  }));
}

function commandSpan(): ButtonSpan {
  return Object.freeze({
    buttons: Object.freeze([ButtonType.None]),
    primary: ButtonType.None,
    ccNums: Object.freeze([]),
    halfButtonIndex: -1,
  });
}

function simpleKinds(type: "Single" | "Flick" | "Skill"): NoteKinds {
  return type === "Flick"
    ? Object.freeze({ game: GameNoteType.Flick, front: FrontNoteType.Flick, after: AfterNoteType.None })
    : Object.freeze({ game: GameNoteType.Normal, front: FrontNoteType.Normal, after: AfterNoteType.None });
}

function directionalKinds(direction: "Left" | "Right", multiple: boolean): NoteKinds {
  return Object.freeze({
    game: direction === "Left" ? GameNoteType.DirectionalFlickLeft : GameNoteType.DirectionalFlickRight,
    front: multiple ? FrontNoteType.MultipleDirectionalFlick : FrontNoteType.DirectionalFlick,
    after: AfterNoteType.None,
  });
}

function slideTerminalKinds(
  connection: RhythmConnection,
  familyA: boolean,
  multipleDirectional: boolean,
): NoteKinds {
  if (connection.type === "Flick") {
    return Object.freeze({
      game: familyA ? GameNoteType.SlideEndFlickA : GameNoteType.SlideEndFlickB,
      front: FrontNoteType.None,
      after: AfterNoteType.None,
    });
  }
  if (connection.type === "Directional") {
    const left = connection.direction === "Left";
    const game = multipleDirectional
      ? familyA
        ? left ? GameNoteType.SlideADirectionalFlickLeftAdd : GameNoteType.SlideADirectionalFlickRightAdd
        : left ? GameNoteType.SlideBDirectionalFlickLeftAdd : GameNoteType.SlideBDirectionalFlickRightAdd
      : familyA
        ? left ? GameNoteType.SlideADirectionalFlickLeft : GameNoteType.SlideADirectionalFlickRight
        : left ? GameNoteType.SlideBDirectionalFlickLeft : GameNoteType.SlideBDirectionalFlickRight;
    return Object.freeze({ game, front: FrontNoteType.None, after: AfterNoteType.None });
  }
  return Object.freeze({
    game: familyA ? GameNoteType.SlideEndA : GameNoteType.SlideEndB,
    front: FrontNoteType.None,
    after: AfterNoteType.None,
  });
}

function slideRootAfterType(
  tail: GarupaChartJsonSlideConnection,
  multipleDirectional: boolean,
): AfterNoteTypeValue {
  if (tail.type === "Flick") return AfterNoteType.SlideFlickEnd;
  if (tail.type === "Directional") {
    if (multipleDirectional) {
      return tail.direction === "Left"
        ? AfterNoteType.SlideMultipleDirectionalFlickLeft
        : AfterNoteType.SlideMultipleDirectionalFlickRight;
    }
    return tail.direction === "Left"
      ? AfterNoteType.SlideDirectionalFlickEndLeft
      : AfterNoteType.SlideDirectionalFlickEndRight;
  }
  return AfterNoteType.None;
}

function ccForButton(button: ButtonTypeValue): number {
  if (button < 0 || button >= CC_BY_LANE.length) return 0;
  return CC_BY_LANE[button]!;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a === 0 ? right : a;
}

function isRuntimeBpm(value: number): boolean {
  return Number.isFinite(value) && Number.isFinite(Math.fround(value)) && Math.fround(value) > 0;
}

function invalidPosition<T>(boundary: string): SimulatorResult<T> {
  return integrityFailure("simulator.garupa-json.invalid-position", boundary);
}
function invalidBpm<T>(boundary: string): SimulatorResult<T> {
  return integrityFailure("simulator.garupa-json.invalid-bpm", boundary);
}
function invalidLane<T>(boundary: string): SimulatorResult<T> {
  return integrityFailure("simulator.garupa-json.invalid-lane-span", boundary);
}
function unsupportedSlide<T>(boundary: string): SimulatorResult<T> {
  return integrityFailure("simulator.garupa-json.unsupported-slide-shape", boundary);
}
