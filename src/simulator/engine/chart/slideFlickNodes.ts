import {
  AfterNoteType,
  GameNoteType,
  type AfterNoteTypeValue,
  type ButtonTypeValue,
  type GameNoteTypeValue,
  type NoteInformation,
} from "./types";

/**
 * Original Slide flick-tail family (AfterNoteType 8..12) of a Slide end game
 * type, or None. Original tails carry it on the root's afterNoteType; Garupa
 * gesture heads and intermediate nodes reuse the same tail game types.
 */
export function slideFlickAfterTypeOfGame(gameNoteType: GameNoteTypeValue): AfterNoteTypeValue {
  switch (gameNoteType) {
    case GameNoteType.SlideEndFlickA:
    case GameNoteType.SlideEndFlickB:
      return AfterNoteType.SlideFlickEnd;
    case GameNoteType.SlideADirectionalFlickLeft:
    case GameNoteType.SlideBDirectionalFlickLeft:
      return AfterNoteType.SlideDirectionalFlickEndLeft;
    case GameNoteType.SlideADirectionalFlickRight:
    case GameNoteType.SlideBDirectionalFlickRight:
      return AfterNoteType.SlideDirectionalFlickEndRight;
    case GameNoteType.SlideADirectionalFlickLeftAdd:
    case GameNoteType.SlideBDirectionalFlickLeftAdd:
      return AfterNoteType.SlideMultipleDirectionalFlickLeft;
    case GameNoteType.SlideADirectionalFlickRightAdd:
    case GameNoteType.SlideBDirectionalFlickRightAdd:
      return AfterNoteType.SlideMultipleDirectionalFlickRight;
    default:
      return AfterNoteType.None;
  }
}

/** Extension: a Slide head or intermediate node that carries an original flick-tail family. */
export function slideGestureAfterType(source: NoteInformation): AfterNoteTypeValue {
  if (source.isSlideNoteHead) {
    return source.slideHeadGestureGameType === undefined
      ? AfterNoteType.None : slideFlickAfterTypeOfGame(source.slideHeadGestureGameType);
  }
  return slideFlickAfterTypeOfGame(source.gameNoteType);
}

/** Callers decide terminal status; a terminal node follows its root afterNoteType instead. */
export function isSlideGestureNode(source: NoteInformation): boolean {
  return slideGestureAfterType(source) !== AfterNoteType.None;
}

/** Successful judgement type of a Slide flick family; Miss and timeout always use 8. */
export function slideFlickJudgeNoteType(afterNoteType: AfterNoteTypeValue): 5 | 6 | 7 | 8 {
  switch (afterNoteType) {
    case AfterNoteType.SlideFlickEnd:
      return 5;
    case AfterNoteType.SlideDirectionalFlickEndLeft:
    case AfterNoteType.SlideDirectionalFlickEndRight:
      return 6;
    case AfterNoteType.SlideMultipleDirectionalFlickLeft:
    case AfterNoteType.SlideMultipleDirectionalFlickRight:
      return 7;
    default:
      return 8;
  }
}

export function slideFlickDirection(afterNoteType: AfterNoteTypeValue): "Left" | "Right" | null {
  if (afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft ||
    afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft) return "Left";
  if (afterNoteType === AfterNoteType.SlideDirectionalFlickEndRight ||
    afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight) return "Right";
  return null;
}

/** Authored Directional width of a gesture node: its Add members plus the node itself. */
export function slideGestureWidth(source: NoteInformation): number {
  return Math.abs(source.slideExitOffset ?? 0) + 1;
}

/**
 * Buttons of a gesture node's own contact test. Flick and Directional use the
 * node's own buttons; a Multiple-Directional gesture uses its whole group span,
 * as the original Multiple-Directional tail tests its group buttons.
 */
export function slideGestureButtonTypes(source: NoteInformation): readonly ButtonTypeValue[] {
  const after = slideGestureAfterType(source);
  const offset = source.slideExitOffset ?? 0;
  if (offset === 0 || source.buttonType < 0 || (after !== AfterNoteType.SlideMultipleDirectionalFlickLeft &&
    after !== AfterNoteType.SlideMultipleDirectionalFlickRight)) return source.buttonTypesArray;
  const start = Math.min(source.buttonType, source.buttonType + offset);
  return Array.from({ length: Math.abs(offset) + 1 }, (_, index) => (start + index) as ButtonTypeValue);
}

/** Slide A/B family of an original Slide end game type. */
export function slideEndGameFamily(gameNoteType: GameNoteTypeValue): "A" | "B" | null {
  switch (gameNoteType) {
    case GameNoteType.SlideEndFlickA:
    case GameNoteType.SlideADirectionalFlickLeft:
    case GameNoteType.SlideADirectionalFlickRight:
    case GameNoteType.SlideADirectionalFlickLeftAdd:
    case GameNoteType.SlideADirectionalFlickRightAdd:
      return "A";
    case GameNoteType.SlideEndFlickB:
    case GameNoteType.SlideBDirectionalFlickLeft:
    case GameNoteType.SlideBDirectionalFlickRight:
    case GameNoteType.SlideBDirectionalFlickLeftAdd:
    case GameNoteType.SlideBDirectionalFlickRightAdd:
      return "B";
    default:
      return null;
  }
}
