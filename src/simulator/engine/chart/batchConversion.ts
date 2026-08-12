import type {
  BMSBarData,
  BMSNoteMaterial,
} from "./bmsBuilder";
import { bmsNoteMaterialAbsolutePos } from "./bmsBuilder";
import {
  AfterNoteType,
  ButtonType,
  GameNoteAdditionalType,
  type ButtonTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
} from "./types";

export interface ResultDictionaryConversionOptions {
  readonly bpmChangeValueList?: readonly BMSNoteMaterial[];
  readonly isMultiRange?: boolean;
}

export function convertResultDictionary(
  resultDictionary: ReadonlyMap<number, BMSBarData>,
  options: ResultDictionaryConversionOptions = {},
): NoteBatchInformation[] {
  const batches: NoteBatchInformation[] = [];
  const orderedBars = [...resultDictionary.entries()]
    .sort(([leftBar], [rightBar]) => leftBar - rightBar);
  for (const [, barData] of orderedBars) {
    for (const buttonGroup of barData.bmsNoteList_) {
      for (const material of buttonGroup.noteList_) {
        const noteInformation = createNoteInformation(
          buttonGroup.buttonType_,
          material,
        );
        const batch = createNoteBatchInformation(material);
        insertNoteBatchInformation(batches, batch, noteInformation);
      }
    }
  }
  for (const material of options.bpmChangeValueList ?? []) {
    const noteInformation = createNoteInformation(ButtonType.None, material);
    const batch = createNoteBatchInformation(material);
    insertNoteBatchInformation(batches, batch, noteInformation);
  }
  return batches;
}

export function createNoteInformation(
  buttonType: ButtonTypeValue,
  material: BMSNoteMaterial,
): NoteInformation {
  const absolutePos = bmsNoteMaterialAbsolutePos(material);
  const buttonTypes = [buttonType];
  return {
    index: 0,
    isResult: false,
    isSlideNoteHead: false,
    isMultiRangeCombine: false,
    isInvisible: material.IsInvisible,
    buttonType,
    buttonTypes,
    buttonTypesArray: [...buttonTypes],
    gameNoteType: material.gameNoteType_,
    fireNoteType: material.fireNoteType_,
    afterNoteType: AfterNoteType.None,
    halfButtonIndex: -1,
    soundValue: material.soundValue,
    ccNum: material.ccNum,
    barIndex: material.barIndex,
    numerator: material.numerator_,
    denominator: material.denominator_,
    absolutePos,
    afterNoteAbsolutePos: -1,
    shortRhythmUnder8beat:
      8 * material.numerator_ % material.denominator_ > 0,
    afterNoteShortRhythmUnder8beat: false,
    bpm: material.Bpm,
    bpmString: material.BpmString,
    storedAbsolutePos: absolutePos,
    slideNoteList: [],
    soundValueList: [...material.soundValueList],
    gameNoteAdditionalType: material.gameNoteAdditionalType_,
    gameNoteAdditionalTypeLongNoteEnd: GameNoteAdditionalType.None,
    virtualLaneDirection: material.VirtualLaneDirection,
    virtualLaneDistance: material.VirtualLaneDistance,
  };
}

function createNoteBatchInformation(
  material: BMSNoteMaterial,
): NoteBatchInformation {
  return {
    barIndex: material.barIndex,
    numerator: material.numerator_,
    denominator: material.denominator_,
    absolutePos: bmsNoteMaterialAbsolutePos(material),
    informationList: [],
  };
}

function insertNoteBatchInformation(
  batches: NoteBatchInformation[],
  candidate: NoteBatchInformation,
  noteInformation: NoteInformation,
): void {
  let lower = 0;
  let upper = batches.length;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    const current = batches[middle];
    if (current === undefined) {
      throw new Error("batch binary-search index escaped the recovered list");
    }
    if (current.absolutePos < candidate.absolutePos) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  const existing = batches[lower];
  if (existing !== undefined && existing.absolutePos === candidate.absolutePos) {
    (existing.informationList as NoteInformation[]).push(noteInformation);
    return;
  }
  (candidate.informationList as NoteInformation[]).push(noteInformation);
  batches.splice(lower, 0, candidate);
}
