import {
  isDirectionalNoteType,
  normalizeRhythmWidth,
  type ChartNote,
} from "../chartCore";

type SlideChainLike = {
  id?: string;
  noteIds: string[];
};

function isRhythmWidthSlideNode(note: ChartNote | undefined): note is ChartNote {
  return !!note && !isDirectionalNoteType(note.type);
}

function findTargetWidthForNoteIds(
  noteIds: readonly string[],
  noteById: Map<string, ChartNote>,
  preferredWidth?: number,
): number | null {
  if (preferredWidth !== undefined) {
    return normalizeRhythmWidth(preferredWidth);
  }
  for (const noteId of noteIds) {
    const note = noteById.get(noteId);
    if (isRhythmWidthSlideNode(note)) {
      return normalizeRhythmWidth(note.width);
    }
  }
  return null;
}

export function applyHabahiroSlideWidthToNoteIds(
  notes: ChartNote[],
  noteIds: readonly string[],
  preferredWidth?: number,
): ChartNote[] {
  if (noteIds.length <= 1) {
    return notes;
  }

  const noteById = new Map(notes.map((note) => [note.id, note] as const));
  const targetWidth = findTargetWidthForNoteIds(noteIds, noteById, preferredWidth);
  if (targetWidth === null) {
    return notes;
  }

  const noteIdSet = new Set(noteIds);
  let changed = false;
  const next = notes.map((note) => {
    if (!noteIdSet.has(note.id) || isDirectionalNoteType(note.type)) {
      return note;
    }
    if (normalizeRhythmWidth(note.width) === targetWidth && note.width === targetWidth) {
      return note;
    }
    changed = true;
    return { ...note, width: targetWidth };
  });

  return changed ? next : notes;
}

export function inferPreferredHabahiroSlideWidths(
  previousNotes: readonly ChartNote[],
  nextNotes: readonly ChartNote[],
  slideChains: readonly SlideChainLike[],
): Map<string, number> {
  const previousById = new Map(previousNotes.map((note) => [note.id, note] as const));
  const changedWidthByNoteId = new Map<string, number>();

  for (const note of nextNotes) {
    if (isDirectionalNoteType(note.type)) {
      continue;
    }
    const previous = previousById.get(note.id);
    if (!previous || isDirectionalNoteType(previous.type)) {
      continue;
    }
    const previousWidth = normalizeRhythmWidth(previous.width);
    const nextWidth = normalizeRhythmWidth(note.width);
    if (previousWidth !== nextWidth) {
      changedWidthByNoteId.set(note.id, nextWidth);
    }
  }

  if (changedWidthByNoteId.size === 0) {
    return new Map();
  }

  const preferredByChainId = new Map<string, number>();
  slideChains.forEach((chain, index) => {
    const chainId = chain.id ?? `__chain_${index}`;
    for (const noteId of chain.noteIds) {
      const preferredWidth = changedWidthByNoteId.get(noteId);
      if (preferredWidth !== undefined) {
        preferredByChainId.set(chainId, preferredWidth);
        return;
      }
    }
  });
  return preferredByChainId;
}

export function applyHabahiroSlideWidths(
  notes: ChartNote[],
  slideChains: readonly SlideChainLike[],
  preferredByChainId: ReadonlyMap<string, number> = new Map(),
): ChartNote[] {
  let next = notes;
  slideChains.forEach((chain, index) => {
    const chainId = chain.id ?? `__chain_${index}`;
    next = applyHabahiroSlideWidthToNoteIds(
      next,
      chain.noteIds,
      preferredByChainId.get(chainId),
    );
  });
  return next;
}
