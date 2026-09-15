import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteType,
  type FrontNoteTypeValue,
  type NoteInformation,
} from "./types";

/** Commands have neither an original button nor an authored continuous span. */
export function isNonPlayableCommand(noteInformation: NoteInformation): boolean {
  return noteInformation.buttonType === ButtonType.None && noteInformation.laneSpan === undefined;
}

/** Original activation consumes only the first CC 3/8 command in a batch. */
export function isBpmCommand(note: NoteInformation): boolean {
  return note.ccNum === 3 || note.ccNum === 8;
}

export function findBatchBpmCommand(informationList: readonly NoteInformation[]): NoteInformation | undefined {
  return informationList.find(isBpmCommand);
}

export interface DirectionalGraphSource<B extends number = number> {
  readonly directionalSlideConnection?: NoteInformation["directionalSlideConnection"];
  readonly directionalMemberRootIndex?: number;
  readonly directionalMemberOffset?: number;
  readonly laneSpan?: { readonly start: number; readonly end: number };
  readonly absolutePos: number;
  readonly afterNoteAbsolutePos: number;
  readonly buttonType: B;
  readonly fireNoteType: number;
  readonly gameNoteType: number;
  readonly afterNoteType: number;
  readonly isInvisible: boolean;
  readonly slideNoteList: readonly { readonly absolutePos: number; readonly buttonType: B; readonly laneSpan?: { readonly start: number; readonly end: number } }[];
}

export function directionalEndpointPosition(note: DirectionalGraphSource): number {
  const terminal = note.slideNoteList[note.slideNoteList.length - 1];
  return terminal?.absolutePos ?? note.afterNoteAbsolutePos;
}

export function directionalEndpointButton<B extends number>(note: DirectionalGraphSource<B>): B {
  if (
    (note.fireNoteType === FrontNoteType.SlideA || note.fireNoteType === FrontNoteType.SlideB)
    && note.slideNoteList.length > 0
  ) {
    return note.slideNoteList[note.slideNoteList.length - 1]!.buttonType;
  }
  return note.buttonType;
}

/** Use the committed range representative, or its approved continuous coordinate. */
export function frontEndpointLane(note: Pick<DirectionalGraphSource, "buttonType" | "laneSpan">): number {
  return note.buttonType >= 0 && note.buttonType <= 6 || note.laneSpan === undefined ? note.buttonType
    : note.laneSpan.start + (note.laneSpan.end - note.laneSpan.start) / 2;
}

export function directionalMembersAdjacent(first: DirectionalGraphSource, second: DirectionalGraphSource): boolean {
  if (first.directionalMemberRootIndex !== undefined || second.directionalMemberRootIndex !== undefined)
    return first.directionalMemberRootIndex === second.directionalMemberRootIndex &&
      Math.abs(first.directionalMemberOffset! - second.directionalMemberOffset!) === 1;
  return Math.abs(frontEndpointLane(first) - frontEndpointLane(second)) === 1;
}

export function directionalEndpointLane(note: DirectionalGraphSource): number {
  const source = (note.fireNoteType === FrontNoteType.SlideA || note.fireNoteType === FrontNoteType.SlideB)
    ? note.slideNoteList[note.slideNoteList.length - 1] ?? note : note;
  return frontEndpointLane(source);
}

type Direction = "left" | "right";

interface DirectionalKind {
  readonly direction: Direction;
  readonly familyFireNoteType: FrontNoteTypeValue;
}

function directionalGroupKind(note: DirectionalGraphSource): DirectionalKind | null {
  const gameNoteType: number = note.gameNoteType;
  if (
    gameNoteType === GameNoteType.LongDirectionalFlickLeftAdd
    || gameNoteType === GameNoteType.LongAddDirectionFlick
    || note.afterNoteType === AfterNoteType.DirectionalFlickLeft
    || note.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft
  ) return { direction: "left", familyFireNoteType: FrontNoteType.Long };
  if (
    gameNoteType === GameNoteType.LongDirectionalFlickRightAdd
    || gameNoteType === GameNoteType.LongAddDirectionFlick
    || note.afterNoteType === AfterNoteType.DirectionalFlickRight
    || note.afterNoteType === AfterNoteType.MultipleDirectionalFlickRight
  ) return { direction: "right", familyFireNoteType: FrontNoteType.Long };
  if (
    gameNoteType === GameNoteType.SlideADirectionalFlickLeftAdd
    || gameNoteType === GameNoteType.SlideAddDirectionalFlick
    || ((note.afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft
      || note.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft)
      && note.fireNoteType === FrontNoteType.SlideA)
  ) return { direction: "left", familyFireNoteType: FrontNoteType.SlideA };
  if (
    gameNoteType === GameNoteType.SlideADirectionalFlickRightAdd
    || gameNoteType === GameNoteType.SlideAddDirectionalFlick
    || ((note.afterNoteType === AfterNoteType.SlideDirectionalFlickEndRight
      || note.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight)
      && note.fireNoteType === FrontNoteType.SlideA)
  ) return { direction: "right", familyFireNoteType: FrontNoteType.SlideA };
  if (
    gameNoteType === GameNoteType.SlideBDirectionalFlickLeftAdd
    || gameNoteType === GameNoteType.SlideAddDirectionalFlick
    || ((note.afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft
      || note.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft)
      && note.fireNoteType === FrontNoteType.SlideB)
  ) return { direction: "left", familyFireNoteType: FrontNoteType.SlideB };
  if (
    gameNoteType === GameNoteType.SlideBDirectionalFlickRightAdd
    || gameNoteType === GameNoteType.SlideAddDirectionalFlick
    || ((note.afterNoteType === AfterNoteType.SlideDirectionalFlickEndRight
      || note.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight)
      && note.fireNoteType === FrontNoteType.SlideB)
  ) return { direction: "right", familyFireNoteType: FrontNoteType.SlideB };
  return null;
}

function matchesDirectionalKind(
  note: DirectionalGraphSource,
  kind: DirectionalKind,
): boolean {
  const gameNoteType: number = note.gameNoteType;
  if (kind.familyFireNoteType === FrontNoteType.Long) {
    if (gameNoteType === GameNoteType.LongAddDirectionFlick) return true;
    return kind.direction === "left"
      ? gameNoteType === GameNoteType.LongDirectionalFlickLeftAdd
        || note.afterNoteType === AfterNoteType.DirectionalFlickLeft
        || note.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft
      : gameNoteType === GameNoteType.LongDirectionalFlickRightAdd
        || note.afterNoteType === AfterNoteType.DirectionalFlickRight
        || note.afterNoteType === AfterNoteType.MultipleDirectionalFlickRight;
  }
  if (gameNoteType === GameNoteType.SlideAddDirectionalFlick) return true;
  const expectedGameNoteType = kind.familyFireNoteType === FrontNoteType.SlideA
    ? kind.direction === "left"
      ? GameNoteType.SlideADirectionalFlickLeftAdd
      : GameNoteType.SlideADirectionalFlickRightAdd
    : kind.direction === "left"
      ? GameNoteType.SlideBDirectionalFlickLeftAdd
      : GameNoteType.SlideBDirectionalFlickRightAdd;
  const afterMatches = kind.direction === "left"
    ? note.afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft
      || note.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft
    : note.afterNoteType === AfterNoteType.SlideDirectionalFlickEndRight
      || note.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight;
  return note.gameNoteType === expectedGameNoteType
    || (afterMatches && note.fireNoteType === kind.familyFireNoteType);
}

export function isSameDirectionalGroup(
  source: DirectionalGraphSource,
  target: DirectionalGraphSource,
): boolean {
  if (source.directionalSlideConnection !== undefined || target.directionalSlideConnection !== undefined) {
    const a = source.directionalSlideConnection, b = target.directionalSlideConnection;
    return a !== undefined && b !== undefined && a.rootIndex === b.rootIndex &&
      a.connectionIndex === b.connectionIndex && Math.abs(a.memberOffset - b.memberOffset) === 1;
  }
  const kind = directionalGroupKind(source);
  if (kind === null || !matchesDirectionalKind(target, kind)) {
    return false;
  }
  const difference = directionalEndpointLane(source) - directionalEndpointLane(target);
  if (source.directionalMemberRootIndex !== undefined || target.directionalMemberRootIndex !== undefined) {
    if (source.directionalMemberRootIndex !== target.directionalMemberRootIndex) return false;
    if (source.fireNoteType === kind.familyFireNoteType || target.fireNoteType === kind.familyFireNoteType) return source !== target;
    return Math.abs(source.directionalMemberOffset! - target.directionalMemberOffset!) === 1;
  }
  if (source.fireNoteType === kind.familyFireNoteType) {
    return kind.direction === "left"
      ? difference >= 1 && difference <= 2
      : difference >= -2 && difference <= -1;
  }
  if (target.fireNoteType === kind.familyFireNoteType) {
    return kind.direction === "left"
      ? difference >= -2 && difference <= -1
      : difference >= 1 && difference <= 2;
  }
  return Math.abs(difference) === 1;
}

export function groupMultipleDirectionalInformationList(
  informationList: readonly NoteInformation[],
): readonly (readonly NoteInformation[])[] {
  const groups: NoteInformation[][] = [];
  let currentGroup: NoteInformation[] = [];
  for (const information of informationList) {
    if (information.buttonType === ButtonType.None && information.laneSpan === undefined) {
      continue;
    }
    if (information.fireNoteType !== FrontNoteType.MultipleDirectionalFlick) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      continue;
    }
    const previous = currentGroup[currentGroup.length - 1];
    if (
      previous !== undefined &&
      previous.gameNoteType === information.gameNoteType &&
      (previous.laneSpan === undefined || previous.laneSpan.end === previous.laneSpan.start) &&
      (information.laneSpan === undefined || information.laneSpan.end === information.laneSpan.start) &&
      directionalMembersAdjacent(previous, information)
    ) {
      currentGroup.push(information);
      continue;
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    currentGroup = [information];
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  return groups;
}
