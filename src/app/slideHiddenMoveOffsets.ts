import type { ChartNote } from "../chartCore";

type SlideChainLike = { noteIds: string[]; long?: true };

type NoteOffset = {
  lane: number;
  beat: number;
};

type BuildSlideHiddenOffsetMapArgs = {
  notes: ChartNote[];
  slideChains: SlideChainLike[];
  selectedNoteIds: Set<string>;
  laneDelta: number;
  beatDelta: number;
  epsilon?: number;
};


/**
 * Long（Hold）链的头尾始终同轨：只选中其一端横向移动时，另一端跟随同样的轨道偏移，
 * 节拍保持不变（纵向移动仍只作用于被选中的一端）。
 */
function applyLongChainLaneCoupling(
  slideChains: SlideChainLike[],
  selectedNoteIds: Set<string>,
  offsetById: Map<string, NoteOffset>,
  epsilon: number,
): void {
  for (const chain of slideChains) {
    if (chain.long !== true || chain.noteIds.length < 2) {
      continue;
    }
    const headId = chain.noteIds[0];
    const tailId = chain.noteIds[chain.noteIds.length - 1];
    const headSelected = selectedNoteIds.has(headId);
    const tailSelected = selectedNoteIds.has(tailId);
    if (headSelected === tailSelected) {
      continue;
    }
    const sourceId = headSelected ? headId : tailId;
    const followerId = headSelected ? tailId : headId;
    const laneDelta = offsetById.get(sourceId)?.lane ?? 0;
    if (Math.abs(laneDelta) <= epsilon) {
      continue;
    }
    const previous = offsetById.get(followerId);
    offsetById.set(followerId, { lane: laneDelta, beat: previous?.beat ?? 0 });
  }
}

function buildSlideHiddenOffsetMap(args: BuildSlideHiddenOffsetMapArgs): Map<string, NoteOffset> {
  const {
    notes,
    slideChains,
    selectedNoteIds,
    laneDelta,
    beatDelta,
    epsilon = 1e-6,
  } = args;

  const toFixed6 = (value: number): number => Number(value.toFixed(6));
  const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
  const samePosition = (left: ChartNote, right: ChartNote): boolean =>
    Math.abs(left.lane - right.lane) <= epsilon && Math.abs(left.beat - right.beat) <= epsilon;
  const noteMap = new Map(notes.map((note) => [note.id, note] as const));
  const hiddenOffsetById = new Map<string, NoteOffset>();
  const exactFollowHiddenIds = new Set<string>();

  const setHiddenOffsetByMagnitude = (noteId: string, nextOffset: NoteOffset) => {
    const previousOffset = hiddenOffsetById.get(noteId);
    if (!previousOffset) {
      hiddenOffsetById.set(noteId, nextOffset);
      return;
    }
    const previousMagnitude = Math.abs(previousOffset.lane) + Math.abs(previousOffset.beat);
    const nextMagnitude = Math.abs(nextOffset.lane) + Math.abs(nextOffset.beat);
    if (nextMagnitude > previousMagnitude) {
      hiddenOffsetById.set(noteId, nextOffset);
    }
  };

  for (const chain of slideChains) {
    const chainNotes = chain.noteIds
      .map((id) => noteMap.get(id))
      .filter((note): note is ChartNote => note !== undefined);
    for (let index = 0; index < chainNotes.length; index += 1) {
      const note = chainNotes[index];
      if (note.type === "hidden" || !selectedNoteIds.has(note.id)) {
        continue;
      }

      const exactOffset = { lane: toFixed6(laneDelta), beat: toFixed6(beatDelta) };
      const previous = chainNotes[index - 1];
      if (previous?.type === "hidden" && samePosition(note, previous)) {
        hiddenOffsetById.set(previous.id, exactOffset);
        exactFollowHiddenIds.add(previous.id);
      }

      const next = chainNotes[index + 1];
      if (next?.type === "hidden" && samePosition(note, next)) {
        hiddenOffsetById.set(next.id, exactOffset);
        exactFollowHiddenIds.add(next.id);
      }
    }

    if (chainNotes.length < 3) {
      continue;
    }

    const visibleIndices: number[] = [];
    for (let index = 0; index < chainNotes.length; index += 1) {
      if (chainNotes[index].type !== "hidden") {
        visibleIndices.push(index);
      }
    }
    if (visibleIndices.length < 2) {
      continue;
    }

    for (let pairIndex = 0; pairIndex < visibleIndices.length - 1; pairIndex += 1) {
      const leftIndex = visibleIndices[pairIndex];
      const rightIndex = visibleIndices[pairIndex + 1];
      if (rightIndex - leftIndex <= 1) {
        continue;
      }

      const leftNote = chainNotes[leftIndex];
      const rightNote = chainNotes[rightIndex];
      const leftMoved = selectedNoteIds.has(leftNote.id);
      const rightMoved = selectedNoteIds.has(rightNote.id);
      if (!leftMoved && !rightMoved) {
        continue;
      }

      const leftLaneDelta = leftMoved ? laneDelta : 0;
      const leftBeatDelta = leftMoved ? beatDelta : 0;
      const rightLaneDelta = rightMoved ? laneDelta : 0;
      const rightBeatDelta = rightMoved ? beatDelta : 0;
      const middleCount = rightIndex - leftIndex - 1;
      const beatSpan = rightNote.beat - leftNote.beat;
      const hasBeatSpan = Math.abs(beatSpan) > epsilon;

      for (let middleIndex = 1; middleIndex <= middleCount; middleIndex += 1) {
        const noteIndex = leftIndex + middleIndex;
        const note = chainNotes[noteIndex];
        if (note.type !== "hidden" || selectedNoteIds.has(note.id) || exactFollowHiddenIds.has(note.id)) {
          continue;
        }

        let ratio = hasBeatSpan
          ? (note.beat - leftNote.beat) / beatSpan
          : middleIndex / (middleCount + 1);
        if (!Number.isFinite(ratio)) {
          ratio = middleIndex / (middleCount + 1);
        }
        ratio = clamp01(ratio);

        const noteLaneDelta = toFixed6(leftLaneDelta * (1 - ratio) + rightLaneDelta * ratio);
        const noteBeatDelta = toFixed6(leftBeatDelta * (1 - ratio) + rightBeatDelta * ratio);
        if (Math.abs(noteLaneDelta) <= epsilon && Math.abs(noteBeatDelta) <= epsilon) {
          continue;
        }

        setHiddenOffsetByMagnitude(note.id, { lane: noteLaneDelta, beat: noteBeatDelta });
      }
    }
  }

  return hiddenOffsetById;
}

export function buildSelectionMoveOffsetMap(args: BuildSlideHiddenOffsetMapArgs): Map<string, NoteOffset> {
  const {
    notes,
    slideChains,
    selectedNoteIds,
    laneDelta,
    beatDelta,
    epsilon,
  } = args;

  const offsetById = new Map<string, NoteOffset>();
  for (const note of notes) {
    if (!selectedNoteIds.has(note.id)) {
      continue;
    }
    offsetById.set(note.id, { lane: laneDelta, beat: beatDelta });
  }

  const hiddenOffsetById = buildSlideHiddenOffsetMap({
    notes,
    slideChains,
    selectedNoteIds,
    laneDelta,
    beatDelta,
    epsilon,
  });
  hiddenOffsetById.forEach((offset, id) => {
    const previous = offsetById.get(id);
    if (!previous) {
      offsetById.set(id, offset);
      return;
    }
    const previousMagnitude = Math.abs(previous.lane) + Math.abs(previous.beat);
    const nextMagnitude = Math.abs(offset.lane) + Math.abs(offset.beat);
    if (nextMagnitude > previousMagnitude) {
      offsetById.set(id, offset);
    }
  });
  applyLongChainLaneCoupling(slideChains, selectedNoteIds, offsetById, epsilon ?? 1e-6);

  return offsetById;
}
