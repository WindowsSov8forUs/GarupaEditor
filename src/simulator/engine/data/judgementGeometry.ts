import type { NoteInformation, NoteLaneSpan } from "../chart/types";

/**
 * Resolve geometry once, before publishing the event to any output consumer. spanButtonTypes are
 * the fixed lanes of the judged span, which GarupaEditor's particle routing reads; buttonTypes is
 * OneFrameData's array, the same lanes unless the caller passes the original's array.
 */
export function judgementGeometry(source: NoteInformation, buttons: readonly number[], projectedSpan = source.laneSpan,
  originalButtons?: readonly number[]): {
  readonly laneSpan: NoteLaneSpan;
  readonly rangeLength: number;
  readonly spanButtonTypes: readonly number[];
  readonly buttonTypes: readonly number[];
} {
  const geometry = spanGeometry(buttons, projectedSpan);
  return { ...geometry, spanButtonTypes: geometry.buttonTypes,
    buttonTypes: originalButtons === undefined ? geometry.buttonTypes : Object.freeze([...originalButtons]) };
}

/** The fixed lanes a note itself covers, as its own ButtonTypes. */
export function noteButtonTypes(source: NoteInformation): readonly number[] {
  return spanGeometry(source.buttonTypesArray, source.laneSpan).buttonTypes;
}

function spanGeometry(buttons: readonly number[], projectedSpan: NoteLaneSpan | undefined) {
  if (projectedSpan === undefined) {
    return {
      laneSpan: Object.freeze({ start: Math.min(...buttons), end: Math.max(...buttons) }),
      rangeLength: buttons.length,
      buttonTypes: Object.freeze([...buttons]),
    };
  }
  const laneSpan = projectedSpan;
  // Fixed stage receivers observe the reference lanes contained by the span.
  // Continuous geometry remains intact for consumers that project positions.
  return {
    laneSpan,
    rangeLength: laneSpan.width ?? laneSpan.end - laneSpan.start + 1,
    buttonTypes: Object.freeze([0, 1, 2, 3, 4, 5, 6].filter(
      lane => laneSpan.start <= lane && lane <= laneSpan.end,
    )),
  };
}
