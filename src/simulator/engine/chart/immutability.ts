import type {
  ChartConstructionResult,
  NoteInformation,
} from "./types";

export function freezeChartConstructionResult(
  result: ChartConstructionResult,
): ChartConstructionResult {
  const visitedNotes = new WeakSet<NoteInformation>();
  for (const batch of result.noteBatches) {
    for (const note of batch.informationList) {
      freezeNoteInformation(note, visitedNotes);
    }
    Object.freeze(batch.informationList);
    Object.freeze(batch);
  }
  Object.freeze(result.noteBatches);
  Object.freeze(result.bpmChangeRealValueList);
  Object.freeze(result.bpmChangeStringRealValueList);
  return Object.freeze(result);
}

function freezeNoteInformation(
  note: NoteInformation,
  visitedNotes: WeakSet<NoteInformation>,
): void {
  if (visitedNotes.has(note)) {
    return;
  }
  visitedNotes.add(note);
  for (const slideNote of note.slideNoteList) {
    freezeNoteInformation(slideNote, visitedNotes);
  }
  Object.freeze(note.buttonTypes);
  Object.freeze(note.buttonTypesArray);
  Object.freeze(note.slideNoteList);
  Object.freeze(note.soundValueList);
  Object.freeze(note);
}
