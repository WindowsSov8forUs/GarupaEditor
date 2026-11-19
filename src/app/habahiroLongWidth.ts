import {
  isDirectionalNoteType,
  normalizeRhythmWidth,
  type ChartNote,
} from "../chartCore";

type SlideChainLike = {
  id?: string;
  noteIds: string[];
  long?: true;
};

/*
 * HABAHIRO: a Long (Hold) keeps one width, as the original's Long has only its root's buttons. A Slide keeps each
 * node's own width, as in the original; nothing here touches it.
 */

function isRhythmWidthNode(note: ChartNote | undefined): note is ChartNote {
  return !!note && note.type !== "hidden" && !isDirectionalNoteType(note.type);
}

/** Gives the Long's non-Directional notes one width: `preferredWidth`, else its first such note's width. */
export function applyHabahiroLongWidthToNoteIds(
  notes: ChartNote[],
  noteIds: readonly string[],
  preferredWidth?: number,
): ChartNote[] {
  if (noteIds.length <= 1) {
    return notes;
  }
  const noteById = new Map(notes.map((note) => [note.id, note] as const));
  let targetWidth: number | null = preferredWidth === undefined ? null : normalizeRhythmWidth(preferredWidth);
  for (const noteId of noteIds) {
    if (targetWidth !== null) break;
    const note = noteById.get(noteId);
    if (isRhythmWidthNode(note)) targetWidth = normalizeRhythmWidth(note.width);
  }
  if (targetWidth === null) {
    return notes;
  }
  const noteIdSet = new Set(noteIds);
  let changed = false;
  const next = notes.map((note) => {
    if (!noteIdSet.has(note.id) || isDirectionalNoteType(note.type) || note.width === targetWidth) {
      return note;
    }
    changed = true;
    return { ...note, width: targetWidth };
  });
  return changed ? next : notes;
}

/** For each Long one of whose notes changed width between `previousNotes` and `nextNotes`, that new width. */
export function inferPreferredHabahiroLongWidths(
  previousNotes: readonly ChartNote[],
  nextNotes: readonly ChartNote[],
  slideChains: readonly SlideChainLike[],
): Map<string, number> {
  const previousById = new Map(previousNotes.map((note) => [note.id, note] as const));
  const changedWidthByNoteId = new Map<string, number>();
  for (const note of nextNotes) {
    const previous = previousById.get(note.id);
    if (!previous || isDirectionalNoteType(note.type) || isDirectionalNoteType(previous.type)) {
      continue;
    }
    const nextWidth = normalizeRhythmWidth(note.width);
    if (normalizeRhythmWidth(previous.width) !== nextWidth) {
      changedWidthByNoteId.set(note.id, nextWidth);
    }
  }
  const preferredByChainId = new Map<string, number>();
  if (changedWidthByNoteId.size === 0) {
    return preferredByChainId;
  }
  slideChains.forEach((chain, index) => {
    if (chain.long !== true) return;
    for (const noteId of chain.noteIds) {
      const preferredWidth = changedWidthByNoteId.get(noteId);
      if (preferredWidth !== undefined) {
        preferredByChainId.set(chain.id ?? `__chain_${index}`, preferredWidth);
        return;
      }
    }
  });
  return preferredByChainId;
}

/** Keeps every Long at one width; a Long named in `preferredByChainId` takes that width (a width edit on one end). */
export function applyHabahiroLongWidths(
  notes: ChartNote[],
  slideChains: readonly SlideChainLike[],
  preferredByChainId: ReadonlyMap<string, number> = new Map(),
): ChartNote[] {
  let next = notes;
  slideChains.forEach((chain, index) => {
    if (chain.long !== true) return;
    next = applyHabahiroLongWidthToNoteIds(next, chain.noteIds, preferredByChainId.get(chain.id ?? `__chain_${index}`));
  });
  return next;
}
