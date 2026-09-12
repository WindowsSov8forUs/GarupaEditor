import { ButtonType, type NoteInformation } from "./types";

export function hasContinuousNoteGeometry(source: NoteInformation): boolean {
  const span = source.laneSpan;
  return span !== undefined && span !== null && Number.isFinite(span.start) && Number.isFinite(span.end) &&
    span.end >= span.start && Number.isInteger(span.end - span.start + 1) &&
    source.buttonType === ButtonType.None &&
    Array.isArray(source.buttonTypes) && Array.isArray(source.buttonTypesArray) &&
    source.buttonTypes.length === 1 && source.buttonTypes[0] === ButtonType.None &&
    source.buttonTypesArray.length === 1 && source.buttonTypesArray[0] === ButtonType.None;
}
