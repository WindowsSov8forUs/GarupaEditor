import {
  bakeNoteButtons,
} from "./noteGraph";
import {
  mergeMultiRangeSourceIdentity,
} from "./multiRangeSources";
import {
  ButtonType,
  GameNoteAdditionalType,
  GameNoteType,
  type NoteBatchInformation,
  type NoteInformation,
} from "./types";

type MutableNoteInformation = {
  -readonly [Key in keyof NoteInformation]: NoteInformation[Key];
};

export function combineMultiRangeBatches(
  batches: readonly NoteBatchInformation[],
  isMultiRange: boolean,
  isCommand: boolean,
): void {
  if (!isMultiRange || isCommand) {
    return;
  }
  for (const batch of batches) {
    combineMultiRangeBatch(batch);
  }
}

export function findHabahiroChangeAbsolutePos(
  batches: readonly NoteBatchInformation[],
): number {
  let absolutePos = -1;
  for (const batch of batches) {
    for (const note of batch.informationList) {
      if (note.gameNoteAdditionalType === GameNoteAdditionalType.LaneChange) {
        absolutePos = note.absolutePos;
      }
    }
  }
  return absolutePos;
}

function combineMultiRangeBatch(batch: NoteBatchInformation): void {
  const notes = batch.informationList as readonly MutableNoteInformation[];
  let previous: MutableNoteInformation | null = null;
  let runStart = 0;
  let previousIndex = -1;
  let runType: number = GameNoteType.None;
  for (let index = 0; index < notes.length; index += 1) {
    const current = notes[index];
    if (current === undefined) {
      throw new Error("multi-range batch index escaped the recovered sequence");
    }
    const excludedType = current.gameNoteType >= GameNoteType.SlideA
      && current.gameNoteType <= GameNoteType.SlideAddDirectionalFlick;
    if (excludedType) {
      if (runType !== GameNoteType.None) {
        combineMultiRangeRun(notes, runStart, previousIndex);
      }
      previous = null;
      runStart = 0;
      runType = GameNoteType.None;
      previousIndex = index;
      continue;
    }
    const ignoredLongPlaceholder = current.gameNoteType === GameNoteType.Long
      && current.buttonType === ButtonType.None;
    if (ignoredLongPlaceholder) {
      previousIndex = index;
      continue;
    }
    const continues = previous !== null
      && current.gameNoteType === runType
      && current.buttonType === previous.buttonType + 1;
    if (!continues) {
      if (runType !== GameNoteType.None) {
        combineMultiRangeRun(notes, runStart, previousIndex);
      }
      runStart = index;
      runType = current.gameNoteType;
    }
    previous = current;
    if (index === notes.length - 1) {
      combineMultiRangeRun(notes, runStart, index);
    }
    previousIndex = index;
  }
}

function combineMultiRangeRun(
  notes: readonly MutableNoteInformation[],
  startIndex: number,
  endIndex: number,
): void {
  if (startIndex > endIndex) {
    return;
  }
  const first = notes[startIndex];
  const last = notes[endIndex];
  if (first === undefined || last === undefined) {
    return;
  }
  const centerButton = Math.trunc((first.buttonType + last.buttonType) / 2);
  const representative = notes.find((note) => note.buttonType === centerButton);
  if (representative === undefined) {
    return;
  }
  const buttons = new Set(representative.buttonTypes);
  const soundValues = [...representative.soundValueList];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const source = notes[index];
    if (source === undefined || source === representative) {
      continue;
    }
    for (const button of source.buttonTypes) {
      buttons.add(button);
    }
    if (source.virtualLaneDirection !== 0) {
      representative.virtualLaneDirection = source.virtualLaneDirection;
    }
    if (source.virtualLaneDistance !== 0) {
      representative.virtualLaneDistance = source.virtualLaneDistance;
    }
    soundValues.push(...source.soundValueList);
    mergeMultiRangeSourceIdentity(representative, source);
    source.isMultiRangeCombine = true;
  }
  representative.buttonTypes = [...buttons].sort((left, right) => left - right);
  representative.soundValueList = soundValues;
  representative.isMultiRangeCombine = false;
  bakeNoteButtons(representative);
}
