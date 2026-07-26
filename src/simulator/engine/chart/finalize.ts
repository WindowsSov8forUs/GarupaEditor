import {
  AfterNoteType,
  ButtonType,
  GameNoteType,
  type NoteBatchInformation,
  type NoteInformation,
} from "./types";

const FIRST_PASS_GAME_NOTE_TYPES = new Set<number>([
  GameNoteType.Long,
  GameNoteType.LongEndFlick,
  GameNoteType.LongDirectionalFlickLeft,
  GameNoteType.LongDirectionalFlickRight,
]);

const CHECK_DELETE_EXCLUDED_GAME_NOTE_TYPES = new Set<number>([
  GameNoteType.Long,
  GameNoteType.LongEndFlick,
  GameNoteType.LongDirectionalFlickLeft,
  GameNoteType.LongDirectionalFlickRight,
]);

export const NOTE_FINALIZE_PASSES = [
  { name: "long-placeholder", predicate: shouldRemoveLongPlaceholder },
  { name: "unsupported-bgm", predicate: shouldDeleteUnsupportedBgmNote },
  { name: "slide-support", predicate: shouldRemoveSlideSupportRecord },
  { name: "multi-range-support", predicate: shouldRemoveMultiRangeSupportRecord },
] as const;

export function finalizeNoteBatches(
  batches: readonly NoteBatchInformation[],
): void {
  for (const batch of batches) {
    const informationList = batch.informationList as NoteInformation[];
    for (const pass of NOTE_FINALIZE_PASSES) {
      removeAllInPlace(informationList, pass.predicate);
    }
  }
  const mutableBatches = batches as NoteBatchInformation[];
  for (let index = mutableBatches.length - 1; index >= 0; index -= 1) {
    if (mutableBatches[index]?.informationList.length === 0) {
      mutableBatches.splice(index, 1);
    }
  }
}

export function shouldRemoveLongPlaceholder(note: NoteInformation): boolean {
  return note.buttonType === ButtonType.None
    && FIRST_PASS_GAME_NOTE_TYPES.has(note.gameNoteType)
    && !(
      note.gameNoteType === GameNoteType.LongEndFlick
      && (note.ccNum === 3 || note.ccNum === 8)
    );
}

export function shouldDeleteUnsupportedBgmNote(note: NoteInformation): boolean {
  if (hasAppendedButtonTypes(note) || hasSoundValues(note)) {
    return false;
  }
  if (
    note.afterNoteType === AfterNoteType.DirectionalFlickRight
    || note.afterNoteType === AfterNoteType.SlideFlickEnd
  ) {
    return false;
  }
  if (
    note.gameNoteType === GameNoteType.Normal
    && note.soundValue.length === 0
    && !hasSoundValues(note)
  ) {
    return true;
  }
  if (
    CHECK_DELETE_EXCLUDED_GAME_NOTE_TYPES.has(note.gameNoteType)
    || note.buttonType !== ButtonType.None
  ) {
    return false;
  }
  return true;
}

export function shouldRemoveSlideSupportRecord(note: NoteInformation): boolean {
  const gameNoteType = note.gameNoteType;
  const isSlideFamily = (
    gameNoteType >= GameNoteType.SlideA
    && gameNoteType <= GameNoteType.SlideEndFlickB
  ) || (
    gameNoteType >= GameNoteType.SlideADirectionalFlickLeft
    && gameNoteType <= GameNoteType.SlideBDirectionalFlickRight
  );
  return isSlideFamily && !note.isSlideNoteHead;
}

export function shouldRemoveMultiRangeSupportRecord(
  note: NoteInformation,
): boolean {
  return note.isMultiRangeCombine;
}

function hasAppendedButtonTypes(note: NoteInformation): boolean {
  return note.buttonTypes.some((button) => button !== note.buttonType);
}

function hasSoundValues(note: NoteInformation): boolean {
  return note.soundValueList.some((soundValue) => soundValue.length > 0);
}

function removeAllInPlace<T>(
  values: T[],
  predicate: (value: T) => boolean,
): void {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < values.length; readIndex += 1) {
    const value = values[readIndex];
    if (value === undefined || predicate(value)) {
      continue;
    }
    values[writeIndex] = value;
    writeIndex += 1;
  }
  values.length = writeIndex;
}
