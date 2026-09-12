import type { NoteInformation, NoteLaneSpan } from "../chart/types";

/** Resolve geometry once, before publishing the event to any output consumer. */
export function judgementGeometry(source: NoteInformation, buttons: readonly number[]): {
  readonly laneSpan: NoteLaneSpan;
  readonly rangeLength: number;
  readonly buttonTypes: readonly number[];
} {
  if (source.laneSpan === undefined) {
    return {
      laneSpan: Object.freeze({ start: Math.min(...buttons), end: Math.max(...buttons) }),
      rangeLength: buttons.length,
      buttonTypes: Object.freeze([...buttons]),
    };
  }
  const laneSpan = source.laneSpan;
  // Fixed stage receivers observe the reference lanes contained by the span.
  // Continuous geometry remains intact for consumers that project positions.
  return {
    laneSpan,
    rangeLength: laneSpan.end - laneSpan.start + 1,
    buttonTypes: Object.freeze([0, 1, 2, 3, 4, 5, 6].filter(
      lane => laneSpan.start <= lane && lane <= laneSpan.end,
    )),
  };
}
