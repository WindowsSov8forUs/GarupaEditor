import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  type AfterNoteTypeValue,
  type ButtonTypeValue,
  type FrontNoteTypeValue,
  type GameNoteTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
} from "./types";
import {
  mergeMultiRangeSourceIdentity,
  setMultiRangeAfterSourceIdentity,
} from "./multiRangeSources";

type MutableNoteInformation = {
  -readonly [Key in keyof NoteInformation]: NoteInformation[Key];
};

const LONG_NOTE_TYPES = new Set<number>([
  GameNoteType.Long,
  GameNoteType.LongEndFlick,
  GameNoteType.LongDirectionalFlickLeft,
  GameNoteType.LongDirectionalFlickRight,
]);
const SLIDE_A_NOTE_TYPES = new Set<number>([
  GameNoteType.SlideA,
  GameNoteType.SlideEndA,
  GameNoteType.SlideEndFlickA,
  GameNoteType.SlideADirectionalFlickLeft,
  GameNoteType.SlideADirectionalFlickRight,
]);
const SLIDE_B_NOTE_TYPES = new Set<number>([
  GameNoteType.SlideB,
  GameNoteType.SlideEndB,
  GameNoteType.SlideEndFlickB,
  GameNoteType.SlideBDirectionalFlickLeft,
  GameNoteType.SlideBDirectionalFlickRight,
]);
const SLIDE_TERMINAL_AFTER_TYPES = new Map<number, AfterNoteTypeValue>([
  [GameNoteType.SlideEndA, AfterNoteType.None],
  [GameNoteType.SlideEndB, AfterNoteType.None],
  [GameNoteType.SlideEndFlickA, AfterNoteType.SlideFlickEnd],
  [GameNoteType.SlideEndFlickB, AfterNoteType.SlideFlickEnd],
  [GameNoteType.SlideADirectionalFlickLeft, AfterNoteType.SlideDirectionalFlickEndLeft],
  [GameNoteType.SlideBDirectionalFlickLeft, AfterNoteType.SlideDirectionalFlickEndLeft],
  [GameNoteType.SlideADirectionalFlickRight, AfterNoteType.SlideDirectionalFlickEndRight],
  [GameNoteType.SlideBDirectionalFlickRight, AfterNoteType.SlideDirectionalFlickEndRight],
]);

export function setupLongAndSlideNoteGraphs(
  batches: readonly NoteBatchInformation[],
  isMultiRange: boolean,
): void {
  const notes = flattenNotes(batches);
  setupLongNotePairs(notes, isMultiRange);
  setupSlideNoteFamily(notes, SLIDE_A_NOTE_TYPES, isMultiRange);
  setupSlideNoteFamily(notes, SLIDE_B_NOTE_TYPES, isMultiRange);
}

function flattenNotes(
  batches: readonly NoteBatchInformation[],
): MutableNoteInformation[] {
  const notes: MutableNoteInformation[] = [];
  for (const batch of batches) {
    for (const note of batch.informationList) {
      notes.push(note as MutableNoteInformation);
    }
  }
  return notes;
}

function setupLongNotePairs(
  notes: readonly MutableNoteInformation[],
  isMultiRange: boolean,
): void {
  const groups = new Map<string, MutableNoteInformation[]>();
  for (const note of notes) {
    if (!LONG_NOTE_TYPES.has(note.gameNoteType)) {
      continue;
    }
    const key = isMultiRange
      ? `${note.buttonType}:${note.ccNum}`
      : String(note.buttonType);
    const group = groups.get(key) ?? [];
    group.push(note);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    for (let index = 0; index + 1 < group.length; index += 2) {
      const root = group[index];
      const terminal = group[index + 1];
      if (root === undefined || terminal === undefined) {
        throw new Error("Long pair escaped the recovered group");
      }
      root.afterNoteType = longTerminalAfterType(terminal.gameNoteType);
      root.afterNoteAbsolutePos = terminal.absolutePos;
      root.afterNoteShortRhythmUnder8beat = terminal.shortRhythmUnder8beat;
      root.gameNoteAdditionalTypeLongNoteEnd = terminal.gameNoteAdditionalType;
      if (terminal.gameNoteAdditionalType === GameNoteAdditionalType.Skill) {
        root.skillAfterNoteIndex = terminal.skillNoteIndex;
      }
      setMultiRangeAfterSourceIdentity(root, terminal);
      terminal.buttonType = ButtonType.None;
    }
  }
}

function longTerminalAfterType(gameNoteType: number): AfterNoteTypeValue {
  if (gameNoteType === GameNoteType.LongEndFlick) {
    return AfterNoteType.Flick;
  }
  if (gameNoteType === GameNoteType.LongDirectionalFlickLeft) {
    return AfterNoteType.DirectionalFlickLeft;
  }
  if (gameNoteType === GameNoteType.LongDirectionalFlickRight) {
    return AfterNoteType.DirectionalFlickRight;
  }
  return AfterNoteType.Normal;
}

function setupSlideNoteFamily(
  notes: readonly MutableNoteInformation[],
  familyTypes: ReadonlySet<number>,
  isMultiRange: boolean,
): void {
  const family = notes.filter((note) => familyTypes.has(note.gameNoteType));
  let active: MutableNoteInformation[] = [];
  for (let index = 0; index < family.length; index += 1) {
    const note = family[index];
    if (note === undefined) {
      throw new Error("Slide family index escaped the recovered sequence");
    }
    if (active.length === 0) {
      if (
        note.gameNoteType !== GameNoteType.SlideA
        && note.gameNoteType !== GameNoteType.SlideB
      ) {
        continue;
      }
      active = [note];
      continue;
    }

    const matchingIndex = isMultiRange
      ? active.findIndex((candidate) => candidate.absolutePos === note.absolutePos)
      : -1;
    if (matchingIndex >= 0) {
      const matching = active[matchingIndex];
      if (matching === undefined) {
        throw new Error("multi-range Slide match escaped the active path");
      }
      const buttons = uniqueSortedButtons([
        ...matching.buttonTypes,
        ...note.buttonTypes,
      ]);
      matching.buttonTypes = buttons;
      matching.buttonTypesArray = [...buttons];
      mergeMultiRangeSourceIdentity(matching, note);
      if (note.skillNoteIndex !== 0) {
        matching.skillNoteIndex = note.skillNoteIndex;
      }
      note.isMultiRangeCombine = true;
    } else {
      const previous = active[active.length - 1];
      if (previous === undefined) {
        throw new Error("Slide path lost its previous node");
      }
      previous.gameNoteAdditionalTypeLongNoteEnd = note.gameNoteAdditionalType;
      previous.afterNoteShortRhythmUnder8beat = note.shortRhythmUnder8beat;
      active.push(note);
    }

    const terminalAfterType = SLIDE_TERMINAL_AFTER_TYPES.get(note.gameNoteType);
    if (terminalAfterType === undefined) {
      continue;
    }
    const root = active[0];
    if (root === undefined) {
      throw new Error("Slide terminal has no active root");
    }
    root.isSlideNoteHead = true;
    root.afterNoteType = terminalAfterType;
    root.slideNoteList = active.slice(1);
    bakeSlideButtons(root);
    const next = family[index + 1];
    if (next === undefined || next.gameNoteType !== note.gameNoteType) {
      active = [];
    }
  }
}

function uniqueSortedButtons(
  buttons: readonly ButtonTypeValue[],
): ButtonTypeValue[] {
  return [...new Set(buttons)].sort((left, right) => left - right);
}

function bakeSlideButtons(root: MutableNoteInformation): void {
  bakeNoteButtons(root);
  for (const node of root.slideNoteList) {
    bakeNoteButtons(node as MutableNoteInformation);
  }
}

export function bakeNoteButtons(note: MutableNoteInformation): void {
  const buttons = uniqueSortedButtons(note.buttonTypes);
  note.buttonTypes = buttons;
  note.buttonTypesArray = [...buttons];
  if (buttons.length === 0) {
    return;
  }
  note.halfButtonIndex = buttons.length % 2 === 0
    ? Math.trunc(buttons.reduce<number>((sum, button) => sum + button, 0) / buttons.length)
    : -1;
}

export function setupMultipleDirectionalFlickNotes(
  batches: readonly NoteBatchInformation[],
): void {
  const groupRoots: MutableNoteInformation[] = [];
  for (const batch of batches) {
    const notes = batch.informationList as readonly MutableNoteInformation[];
    for (let index = 0; index < notes.length; index += 1) {
      const current = notes[index];
      if (current === undefined || !isDirectionalFlick(current)) {
        continue;
      }
      const currentButton = current.buttonType;
      for (const source of groupRoots) {
        if (directionalEndpointPosition(source) < current.absolutePos) {
          continue;
        }
        if (!isSameDirectionalGroup(source, current)) {
          continue;
        }
        const replacement = multipleDirectionalTypes(source);
        if (replacement === null) {
          continue;
        }
        const sourceButton = source.isSlideNoteHead && source.slideNoteList.length > 0
          ? source.slideNoteList[source.slideNoteList.length - 1]!.buttonType
          : source.buttonType;
        if (currentButton === sourceButton) {
          continue;
        }
        source.afterNoteType = replacement.afterNoteType;
        current.afterNoteType = replacement.afterNoteType;
        if (replacement.replaceTypes) {
          current.gameNoteType = replacement.gameNoteType;
          current.fireNoteType = replacement.fireNoteType;
        }
      }

      for (let candidateIndex = index + 1; candidateIndex < notes.length; candidateIndex += 1) {
        const candidate = notes[candidateIndex];
        if (
          candidate !== undefined
          && candidate.gameNoteType === current.gameNoteType
          && (candidate.fireNoteType === FrontNoteType.DirectionalFlick
            || candidate.fireNoteType === FrontNoteType.MultipleDirectionalFlick)
          && Math.abs(candidate.buttonType - current.buttonType) === 1
        ) {
          current.fireNoteType = FrontNoteType.MultipleDirectionalFlick;
          candidate.fireNoteType = FrontNoteType.MultipleDirectionalFlick;
        }
      }

      if (
        (current.gameNoteType < GameNoteType.LongDirectionalFlickLeftAdd
          || current.gameNoteType > GameNoteType.SlideBDirectionalFlickRightAdd)
        && current.afterNoteType !== AfterNoteType.None
      ) {
        groupRoots.push(current);
      }
    }
  }
}

function isDirectionalFlick(note: NoteInformation): boolean {
  return (
    note.fireNoteType >= FrontNoteType.DirectionalFlick
    || note.afterNoteType === AfterNoteType.DirectionalFlickLeft
    || note.afterNoteType === AfterNoteType.DirectionalFlickRight
    || note.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft
    || note.afterNoteType === AfterNoteType.MultipleDirectionalFlickRight
    || note.afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft
    || note.afterNoteType === AfterNoteType.SlideDirectionalFlickEndRight
    || note.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft
    || note.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight
    || note.gameNoteType === GameNoteType.LongAddDirectionFlick
    || note.gameNoteType === GameNoteType.SlideAddDirectionalFlick
  );
}

export function directionalEndpointPosition(note: NoteInformation): number {
  const terminal = note.slideNoteList[note.slideNoteList.length - 1];
  return terminal?.absolutePos ?? note.afterNoteAbsolutePos;
}

export function directionalEndpointButton(note: NoteInformation): ButtonTypeValue {
  if (
    (note.fireNoteType === FrontNoteType.SlideA || note.fireNoteType === FrontNoteType.SlideB)
    && note.slideNoteList.length > 0
  ) {
    return note.slideNoteList[note.slideNoteList.length - 1]!.buttonType;
  }
  return note.buttonType;
}

type Direction = "left" | "right";

interface DirectionalKind {
  readonly direction: Direction;
  readonly familyFireNoteType: FrontNoteTypeValue;
}

function directionalGroupKind(note: NoteInformation): DirectionalKind | null {
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
  note: NoteInformation,
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
  source: NoteInformation,
  target: NoteInformation,
): boolean {
  const kind = directionalGroupKind(source);
  if (kind === null || !matchesDirectionalKind(target, kind)) {
    return false;
  }
  const difference = directionalEndpointButton(source) - directionalEndpointButton(target);
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

interface MultipleDirectionalReplacement {
  readonly afterNoteType: AfterNoteTypeValue;
  readonly gameNoteType: GameNoteTypeValue;
  readonly fireNoteType: FrontNoteTypeValue;
  readonly replaceTypes: boolean;
}

function multipleDirectionalTypes(
  source: NoteInformation,
): MultipleDirectionalReplacement | null {
  if (
    source.afterNoteType === AfterNoteType.DirectionalFlickLeft
    || source.afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft
  ) {
    return {
      afterNoteType: AfterNoteType.MultipleDirectionalFlickLeft,
      gameNoteType: GameNoteType.LongDirectionalFlickLeftAdd,
      fireNoteType: FrontNoteType.LongMultipleDirectionalFlickAdd,
      replaceTypes: true,
    };
  }
  if (
    source.afterNoteType === AfterNoteType.DirectionalFlickRight
    || source.afterNoteType === AfterNoteType.MultipleDirectionalFlickRight
  ) {
    return {
      afterNoteType: AfterNoteType.MultipleDirectionalFlickRight,
      gameNoteType: GameNoteType.LongDirectionalFlickRightAdd,
      fireNoteType: FrontNoteType.LongMultipleDirectionalFlickAdd,
      replaceTypes: true,
    };
  }
  if (
    source.afterNoteType === AfterNoteType.SlideDirectionalFlickEndLeft
    || source.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickLeft
  ) {
    return slideDirectionalReplacement(source, "left");
  }
  if (
    source.afterNoteType === AfterNoteType.SlideDirectionalFlickEndRight
    || source.afterNoteType === AfterNoteType.SlideMultipleDirectionalFlickRight
  ) {
    return slideDirectionalReplacement(source, "right");
  }
  return null;
}

function slideDirectionalReplacement(
  source: NoteInformation,
  direction: Direction,
): MultipleDirectionalReplacement {
  const afterNoteType = direction === "left"
    ? AfterNoteType.SlideMultipleDirectionalFlickLeft
    : AfterNoteType.SlideMultipleDirectionalFlickRight;
  if (source.fireNoteType === FrontNoteType.SlideA) {
    return {
      afterNoteType,
      gameNoteType: direction === "left"
        ? GameNoteType.SlideADirectionalFlickLeftAdd
        : GameNoteType.SlideADirectionalFlickRightAdd,
      fireNoteType: FrontNoteType.SlideAMultipleDirectionalFlickAdd,
      replaceTypes: true,
    };
  }
  if (source.fireNoteType === FrontNoteType.SlideB) {
    return {
      afterNoteType,
      gameNoteType: direction === "left"
        ? GameNoteType.SlideBDirectionalFlickLeftAdd
        : GameNoteType.SlideBDirectionalFlickRightAdd,
      fireNoteType: FrontNoteType.SlideBMultipleDirectionalFlickAdd,
      replaceTypes: true,
    };
  }
  return {
    afterNoteType,
    gameNoteType: GameNoteType.None,
    fireNoteType: FrontNoteType.None,
    replaceTypes: false,
  };
}
