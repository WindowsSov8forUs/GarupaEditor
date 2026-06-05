import type { ChartNote } from "../chartCore";

const HIDDEN_POSITION_EPSILON = 1e-6;
const HIDDEN_SAME_BEAT_EPSILON = 1e-4;

type SlideChainLike = { id: string; noteIds: string[] };

function isHidden(note: ChartNote | undefined | null): note is ChartNote & { type: "hidden" } {
  return !!note && note.type === "hidden";
}

function isSameHiddenPosition(
  left: ChartNote | undefined,
  right: ChartNote | undefined,
  positionEpsilon: number,
): boolean {
  if (!isHidden(left) || !isHidden(right)) {
    return false;
  }
  return Math.abs(Number(left.beat) - Number(right.beat)) <= positionEpsilon
    && Math.abs(Number(left.lane) - Number(right.lane)) <= positionEpsilon;
}

function collapseConsecutiveHiddenSameBeat(
  noteIds: string[],
  noteMap: Map<string, ChartNote>,
  beatEpsilon: number,
): string[] {
  const result: string[] = [];
  const total = noteIds.length;
  let index = 0;

  while (index < total) {
    const currentId = noteIds[index];
    const currentNote = noteMap.get(currentId);
    if (!isHidden(currentNote)) {
      result.push(currentId);
      index += 1;
      continue;
    }

    const runStart = index;
    const anchorBeat = Number(currentNote.beat);
    index += 1;
    while (index < total) {
      const nextId = noteIds[index];
      const nextNote = noteMap.get(nextId);
      if (!isHidden(nextNote)) {
        break;
      }
      if (Math.abs(Number(nextNote.beat) - anchorBeat) > beatEpsilon) {
        break;
      }
      index += 1;
    }

    const runEnd = index - 1;
    if (runEnd <= runStart + 1) {
      for (let keep = runStart; keep <= runEnd; keep += 1) {
        result.push(noteIds[keep]);
      }
      continue;
    }

    result.push(noteIds[runStart], noteIds[runEnd]);
  }

  return result;
}

function areAllHiddenAtSameBeat(
  noteIds: string[],
  noteMap: Map<string, ChartNote>,
  beatEpsilon: number,
): boolean {
  if (noteIds.length === 0) {
    return false;
  }
  const notes = noteIds
    .map((id) => noteMap.get(id))
    .filter((note): note is ChartNote => note !== undefined);
  if (notes.length === 0 || !notes.every((note) => note.type === "hidden")) {
    return false;
  }
  const anchorBeat = Number(notes[0].beat);
  return notes.every((note) => Math.abs(Number(note.beat) - anchorBeat) <= beatEpsilon);
}

export function cleanupSlideChainsHidden<T extends SlideChainLike>(args: {
  chains: T[];
  noteMap: Map<string, ChartNote>;
  minLength: number;
  beatEpsilon?: number;
  positionEpsilon?: number;
}): T[] {
  const {
    chains,
    noteMap,
    minLength,
    beatEpsilon = HIDDEN_SAME_BEAT_EPSILON,
    positionEpsilon = HIDDEN_POSITION_EPSILON,
  } = args;

  const cleanedChains: T[] = [];

  for (const chain of chains) {
    const existingIds = chain.noteIds.filter((id) => noteMap.has(id));
    if (existingIds.length === 0) {
      continue;
    }

    const dedupedPositionIds: string[] = [];
    for (const noteId of existingIds) {
      const currentNote = noteMap.get(noteId);
      const previousId = dedupedPositionIds[dedupedPositionIds.length - 1];
      const previousNote = previousId ? noteMap.get(previousId) : undefined;
      if (isSameHiddenPosition(previousNote, currentNote, positionEpsilon)) {
        continue;
      }
      dedupedPositionIds.push(noteId);
    }

    const dedupedIds = collapseConsecutiveHiddenSameBeat(dedupedPositionIds, noteMap, beatEpsilon);
    if (dedupedIds.length === 0) {
      continue;
    }

    if (dedupedIds.length === 1) {
      const onlyNote = noteMap.get(dedupedIds[0]);
      if (isHidden(onlyNote)) {
        continue;
      }
    }

    if (areAllHiddenAtSameBeat(dedupedIds, noteMap, beatEpsilon)) {
      continue;
    }

    if (dedupedIds.length < minLength) {
      continue;
    }

    cleanedChains.push({
      ...chain,
      noteIds: dedupedIds,
    });
  }

  return cleanedChains;
}
