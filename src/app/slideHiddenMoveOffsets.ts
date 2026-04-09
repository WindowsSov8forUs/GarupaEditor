import type { ChartNote } from "../chartCore";

type SlideChainLike = { noteIds: string[] };

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
  const noteMap = new Map(notes.map((note) => [note.id, note] as const));
  const hiddenOffsetById = new Map<string, NoteOffset>();

  for (const chain of slideChains) {
    const chainNotes = chain.noteIds
      .map((id) => noteMap.get(id))
      .filter((note): note is ChartNote => note !== undefined);
    if (chainNotes.length < 3) {
      continue;
    }

    const visibleIndexes: number[] = [];
    for (let index = 0; index < chainNotes.length; index += 1) {
      if (chainNotes[index].type !== "hidden") {
        visibleIndexes.push(index);
      }
    }
    if (visibleIndexes.length < 2) {
      continue;
    }

    for (let pairIndex = 0; pairIndex < visibleIndexes.length - 1; pairIndex += 1) {
      const leftIndex = visibleIndexes[pairIndex];
      const rightIndex = visibleIndexes[pairIndex + 1];
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
        if (note.type !== "hidden" || selectedNoteIds.has(note.id)) {
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

        const previousOffset = hiddenOffsetById.get(note.id);
        if (!previousOffset) {
          hiddenOffsetById.set(note.id, { lane: noteLaneDelta, beat: noteBeatDelta });
        } else {
          const previousMagnitude = Math.abs(previousOffset.lane) + Math.abs(previousOffset.beat);
          const nextMagnitude = Math.abs(noteLaneDelta) + Math.abs(noteBeatDelta);
          if (nextMagnitude > previousMagnitude) {
            hiddenOffsetById.set(note.id, { lane: noteLaneDelta, beat: noteBeatDelta });
          }
        }
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

  return offsetById;
}
