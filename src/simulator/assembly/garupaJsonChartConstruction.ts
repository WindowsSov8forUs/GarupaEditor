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
} from "../engine/chart/types";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import { registerConstructedChartRuntimeMetadata } from "../engine/runtime/chartRuntimeMetadata";
import type {
  SimulatorGarupaChartDirectionalNote,
  SimulatorGarupaChartJson,
  SimulatorGarupaChartSimpleNote,
  SimulatorGarupaChartSlideConnection,
  SimulatorGarupaChartSlideItem,
} from "../public/contracts";

export const GARUPA_JSON_POSITION_UNITS_PER_BEAT = 48;
const POSITION_UNITS_PER_BAR = 192;
const MAX_POSITION = 0x7fffffff;
const LANE_COUNT = 7;
const CC_BY_LANE: readonly number[] = [16, 11, 12, 13, 14, 15, 18];

type RhythmConnection = SimulatorGarupaChartSimpleNote | SimulatorGarupaChartDirectionalNote;

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

export function constructChartFromSimulatorGarupaJson(
  chart: SimulatorGarupaChartJson,
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
      value: item.value,
      text: String(item.value),
    }));
  }
  bpmItems.sort((left, right) => left.absolutePos - right.absolutePos || left.sourceOrder - right.sourceOrder);
  const baseItems = bpmItems.filter((item) => item.absolutePos === 0);
  if (baseItems.length !== 1) {
    return invalidBpm("Garupa JSON requires exactly one positive BPM whose evidenced target position is zero.");
  }
  for (let index = 1; index < bpmItems.length; index += 1) {
    if (bpmItems[index - 1]!.absolutePos === bpmItems[index]!.absolutePos) {
      return invalidBpm("Two BPM records quantize to the same target position; the runtime first-match behavior cannot preserve both.");
    }
  }

  let nextIndex = 0;
  let slideOrdinal = 0;
  let isMultiRangeNotes = false;
  const records: PositionedRecord[] = [];
  for (let sourceOrder = 0; sourceOrder < chart.length; sourceOrder += 1) {
    const item = chart[sourceOrder];
    if (item === undefined || item.type === "SV" || item.type === "BPM") continue;
    if (item.type === "Slide") {
      const slide = createSlide(item, sourceOrder, slideOrdinal, nextIndex);
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
      slideOrdinal += 1;
      isMultiRangeNotes ||= slide.value.isMultiRange;
      continue;
    }
    const position = positionFields(item.beat);
    if (position.status !== "ok") return position;
    if (item.type === "Directional") {
      const span = directionalSpan(item);
      if (span.status !== "ok") return span;
      const multiple = span.value.buttons.length > 1;
      isMultiRangeNotes ||= multiple;
      for (let localOrder = 0; localOrder < span.value.buttons.length; localOrder += 1) {
        const button = span.value.buttons[localOrder]!;
        const note = createBaseNote({
          index: nextIndex++,
          position: position.value,
          span: singleButtonSpan(button),
          kinds: directionalKinds(item.direction, multiple),
          additional: GameNoteAdditionalType.None,
        });
        records.push(Object.freeze({ absolutePos: note.absolutePos, sourceOrder, localOrder, note }));
      }
      continue;
    }
    const span = rhythmSpan(item);
    if (span.status !== "ok") return span;
    isMultiRangeNotes ||= span.value.buttons.length > 1;
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
  const noteBatches = createBatches(records);
  const changeItems = bpmItems.filter((item) => item.absolutePos > 0);
  const result = freezeChartConstructionResult({
    noteBatches,
    startBpm: baseItems[0]!.value,
    startBpmString: baseItems[0]!.text,
    bpmChangeRealValueList: changeItems.map((item) => item.value),
    bpmChangeStringRealValueList: changeItems.map((item) => item.text),
    isMultiRangeNotes,
    habahiroChangeAbsolutePos: -1,
  });
  registerConstructedChartRuntimeMetadata(result, false);
  return ok(result);
}

export function garupaBeatToAbsolutePosition(beat: number): SimulatorResult<number> {
  if (!Number.isFinite(beat) || beat < 0) {
    return invalidPosition("Garupa JSON beat must be finite and nonnegative.");
  }
  const scaled = beat * GARUPA_JSON_POSITION_UNITS_PER_BEAT;
  if (!Number.isFinite(scaled) || scaled > MAX_POSITION + 1) {
    return invalidPosition("Garupa JSON beat exceeds the evidenced signed Int32 target position domain.");
  }
  const absolutePos = Math.floor(scaled);
  return absolutePos <= MAX_POSITION
    ? ok(absolutePos)
    : invalidPosition("Garupa JSON beat floors outside the evidenced signed Int32 target position domain.");
}

function createSlide(
  slide: SimulatorGarupaChartSlideItem,
  sourceOrder: number,
  slideOrdinal: number,
  firstIndex: number,
): SimulatorResult<{
  readonly root: NoteInformation;
  readonly additionalRoots: readonly NoteInformation[];
  readonly nextIndex: number;
  readonly isMultiRange: boolean;
}> {
  if (slide.connections.length < 2) {
    return unsupportedSlide(`chart[${sourceOrder}] Slide requires at least two connections.`);
  }
  const head = slide.connections[0]!;
  const tail = slide.connections[slide.connections.length - 1]!;
  if (head.type !== "Single" && head.type !== "Skill") {
    return unsupportedSlide(`chart[${sourceOrder}] Slide head ${head.type} has no lossless runtime projection.`);
  }
  if (tail.type === "Hidden") {
    return unsupportedSlide(`chart[${sourceOrder}] Hidden Slide tail has no playable terminal owner.`);
  }
  for (let index = 1; index + 1 < slide.connections.length; index += 1) {
    const type = slide.connections[index]!.type;
    if (type !== "Single" && type !== "Hidden") {
      return unsupportedSlide(`chart[${sourceOrder}] Slide interior ${type} has no lossless runtime projection.`);
    }
  }

  const positions: PositionFields[] = [];
  for (const connection of slide.connections) {
    const position = positionFields(connection.beat);
    if (position.status !== "ok") return position;
    if (positions.length > 0 && position.value.absolutePos <= positions[positions.length - 1]!.absolutePos) {
      return unsupportedSlide(`chart[${sourceOrder}] Slide connections must remain strictly increasing after original target truncation.`);
    }
    positions.push(position.value);
  }

  if (tail.type === "Directional" && tail.width > 3) {
    return unsupportedSlide(`chart[${sourceOrder}] Directional Slide tail width exceeds the confirmed root-plus-two-side group.`);
  }
  const familyA = slideOrdinal % 2 === 0;
  const familyFront = familyA ? FrontNoteType.SlideA : FrontNoteType.SlideB;
  const familyGame = familyA ? GameNoteType.SlideA : GameNoteType.SlideB;
  const headSpan = rhythmSpan(head);
  if (headSpan.status !== "ok") return headSpan;
  let nextIndex = firstIndex;
  let isMultiRange = headSpan.value.buttons.length > 1;
  const children: NoteInformation[] = [];
  for (let index = 1; index < slide.connections.length; index += 1) {
    const connection = slide.connections[index]!;
    const isTerminal = index === slide.connections.length - 1;
    const fullSpan = connection.type === "Directional"
      ? directionalSpan(connection)
      : rhythmSpan(connection);
    if (fullSpan.status !== "ok") return fullSpan;
    isMultiRange ||= fullSpan.value.buttons.length > 1;
    const span = isTerminal && connection.type === "Directional"
      ? singleButtonSpan(connection.lane as ButtonTypeValue)
      : fullSpan.value;
    const terminalKinds = isTerminal
      ? slideTerminalKinds(connection, familyA, fullSpan.value.buttons.length > 1)
      : Object.freeze({ game: familyGame, front: familyFront, after: AfterNoteType.None });
    const child = createBaseNote({
      index: nextIndex + index,
      position: positions[index]!,
      span,
      kinds: terminalKinds,
      additional: connection.type === "Skill" ? GameNoteAdditionalType.Skill : GameNoteAdditionalType.None,
      invisible: connection.type === "Hidden",
    });
    children.push(child);
  }
  const terminal = children[children.length - 1]!;
  const terminalAdditional = tail.type === "Skill" ? GameNoteAdditionalType.Skill : GameNoteAdditionalType.None;
  const root = createBaseNote({
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
    slideNoteList: children,
    terminalAdditional,
  });
  const additionalRoots: NoteInformation[] = [];
  if (tail.type === "Directional" && tail.width > 1) {
    const tailSpan = requireDirectionalSpan(tail);
    const helperFront = familyA
      ? FrontNoteType.SlideAMultipleDirectionalFlickAdd
      : FrontNoteType.SlideBMultipleDirectionalFlickAdd;
    for (const button of tailSpan.buttons) {
      if (button === tail.lane) continue;
      additionalRoots.push(createBaseNote({
        index: nextIndex + slide.connections.length + additionalRoots.length,
        position: positions[positions.length - 1]!,
        span: singleButtonSpan(button),
        kinds: Object.freeze({
          game: GameNoteType.SlideAddDirectionalFlick,
          front: helperFront,
          after: AfterNoteType.None,
        }),
        additional: GameNoteAdditionalType.None,
        afterNoteAbsolutePos: terminal.absolutePos,
      }));
    }
  }
  registerMultiRangeSourceIdentity(root, {
    ccNums: headSpan.value.ccNums,
    afterCcNums: tail.type === "Directional"
      ? requireDirectionalSpan(tail).ccNums
      : terminal.buttonTypes.map(ccForButton),
  });
  nextIndex += slide.connections.length + additionalRoots.length;
  return ok(Object.freeze({
    root,
    additionalRoots: Object.freeze(additionalRoots),
    nextIndex,
    isMultiRange,
  }));
}

function createBaseNote(input: {
  readonly index: number;
  readonly position: PositionFields;
  readonly span: ButtonSpan;
  readonly kinds: NoteKinds;
  readonly additional: GameNoteAdditionalTypeValue;
  readonly invisible?: boolean;
  readonly isSlideNoteHead?: boolean;
  readonly slideNoteList?: readonly NoteInformation[];
  readonly terminalAdditional?: GameNoteAdditionalTypeValue;
  readonly bpm?: number;
  readonly bpmString?: string;
  readonly ccNum?: number;
  readonly afterNoteAbsolutePos?: number;
}): NoteInformation {
  const note: NoteInformation = {
    index: input.index,
    isResult: false,
    isSlideNoteHead: input.isSlideNoteHead ?? false,
    isMultiRangeCombine: false,
    isInvisible: input.invisible ?? false,
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
    afterNoteShortRhythmUnder8beat: false,
    bpm: input.bpm ?? 0,
    bpmString: input.bpmString ?? "",
    storedAbsolutePos: input.position.absolutePos,
    slideNoteList: [...(input.slideNoteList ?? [])],
    soundValueList: [],
    gameNoteAdditionalType: input.additional,
    gameNoteAdditionalTypeLongNoteEnd: input.terminalAdditional ?? GameNoteAdditionalType.None,
    virtualLaneDirection: VirtualLaneDirection.None,
    virtualLaneDistance: 0,
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
  return absolute.status === "ok" ? ok(positionFieldsFromAbsolute(absolute.value)) : absolute;
}

function positionFieldsFromAbsolute(absolutePos: number): PositionFields {
  const barIndex = Math.floor(absolutePos / POSITION_UNITS_PER_BAR);
  const relative = absolutePos - barIndex * POSITION_UNITS_PER_BAR;
  const divisor = greatestCommonDivisor(relative, POSITION_UNITS_PER_BAR);
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

function rhythmSpan(connection: SimulatorGarupaChartSimpleNote): SimulatorResult<ButtonSpan> {
  return spanFromStart(connection.lane, connection.width);
}

function directionalSpan(connection: SimulatorGarupaChartDirectionalNote): SimulatorResult<ButtonSpan> {
  const start = connection.direction === "Left"
    ? connection.lane - connection.width + 1
    : connection.lane;
  return spanFromStart(start, connection.width);
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

function requireDirectionalSpan(connection: SimulatorGarupaChartDirectionalNote): ButtonSpan {
  const span = directionalSpan(connection);
  if (span.status !== "ok") {
    throw new Error("validated directional span escaped direct Garupa chart construction");
  }
  return span.value;
}

function singleButtonSpan(button: ButtonTypeValue): ButtonSpan {
  return Object.freeze({
    buttons: Object.freeze([button]),
    primary: button,
    ccNums: Object.freeze([ccForButton(button)]),
    halfButtonIndex: -1,
  });
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
  tail: SimulatorGarupaChartSlideConnection,
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
  return evidenceRequired("simulator.garupa-json.invalid-position", ["GJP-E01", "GJP-E02", "GJP-D01"], boundary);
}
function invalidBpm<T>(boundary: string): SimulatorResult<T> {
  return evidenceRequired("simulator.garupa-json.invalid-bpm", ["GJP-E05", "GJP-E06", "GJP-E07"], boundary);
}
function invalidLane<T>(boundary: string): SimulatorResult<T> {
  return evidenceRequired("simulator.garupa-json.invalid-lane-span", [], boundary);
}
function unsupportedSlide<T>(boundary: string): SimulatorResult<T> {
  return evidenceRequired("simulator.garupa-json.unsupported-slide-shape", [], boundary);
}
