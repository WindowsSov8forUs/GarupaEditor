import type { ChartNote } from "../chartCore";

type SlideChainLike = { noteIds: string[] };

type NoteOffset = {
  lane: number;
  beat: number;
};

type BuildSelectionMirrorOffsetMapArgs = {
  notes: ChartNote[];
  slideChains: SlideChainLike[];
  selectedNoteIds: Set<string>;
  selectedOffsetById: Map<string, NoteOffset>;
  resolveMirrorLaneDelta: (note: ChartNote) => number;
  epsilon?: number;
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

  return offsetById;
}

export function buildSelectionMirrorOffsetMap(args: BuildSelectionMirrorOffsetMapArgs): Map<string, NoteOffset> {
  const {
    notes,
    slideChains,
    selectedNoteIds,
    selectedOffsetById,
    resolveMirrorLaneDelta,
    epsilon = 1e-6,
  } = args;

  const toFixed6 = (value: number): number => Number(value.toFixed(6));
  const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
  const noteMap = new Map(notes.map((note) => [note.id, note] as const));
  const offsetById = new Map<string, NoteOffset>();

  const setOffsetByMagnitude = (noteId: string, laneDeltaRaw: number, beatDeltaRaw = 0) => {
    const laneDelta = toFixed6(laneDeltaRaw);
    const beatDelta = toFixed6(beatDeltaRaw);
    if (Math.abs(laneDelta) <= epsilon && Math.abs(beatDelta) <= epsilon) {
      return;
    }
    const previous = offsetById.get(noteId);
    if (!previous) {
      offsetById.set(noteId, { lane: laneDelta, beat: beatDelta });
      return;
    }
    const previousMagnitude = Math.abs(previous.lane) + Math.abs(previous.beat);
    const nextMagnitude = Math.abs(laneDelta) + Math.abs(beatDelta);
    if (nextMagnitude > previousMagnitude) {
      offsetById.set(noteId, { lane: laneDelta, beat: beatDelta });
    }
  };

  selectedOffsetById.forEach((offset, noteId) => {
    if (!selectedNoteIds.has(noteId)) {
      return;
    }
    offsetById.set(noteId, {
      lane: toFixed6(offset.lane),
      beat: toFixed6(offset.beat),
    });
  });

  const applyHiddenMirrorRange = (
    chainNotes: ChartNote[],
    startIndexInclusive: number,
    endIndexExclusive: number,
  ) => {
    for (let index = startIndexInclusive; index < endIndexExclusive; index += 1) {
      const note = chainNotes[index];
      if (note.type !== "hidden" || selectedNoteIds.has(note.id)) {
        continue;
      }
      setOffsetByMagnitude(note.id, resolveMirrorLaneDelta(note), 0);
    }
  };

  const applyWholeChainHiddenMirror = (chainNotes: ChartNote[]) => {
    applyHiddenMirrorRange(chainNotes, 0, chainNotes.length);
  };

  for (const chain of slideChains) {
    const chainNotes = chain.noteIds
      .map((id) => noteMap.get(id))
      .filter((note): note is ChartNote => note !== undefined);
    if (chainNotes.length === 0) {
      continue;
    }

    const visibleIndexes: number[] = [];
    for (let index = 0; index < chainNotes.length; index += 1) {
      if (chainNotes[index].type !== "hidden") {
        visibleIndexes.push(index);
      }
    }
    if (visibleIndexes.length === 0) {
      continue;
    }

    const headNote = chainNotes[0];
    const tailNote = chainNotes[chainNotes.length - 1];
    const headVisible = headNote.type !== "hidden";
    const tailVisible = tailNote.type !== "hidden";
    const headSelected = headVisible && selectedNoteIds.has(headNote.id);
    const tailSelected = tailVisible && selectedNoteIds.has(tailNote.id);
    const isSingleVisibleEndpointSelected =
      (headVisible && !tailVisible && headSelected) ||
      (!headVisible && tailVisible && tailSelected);
    if (isSingleVisibleEndpointSelected) {
      applyWholeChainHiddenMirror(chainNotes);
      continue;
    }

    if (visibleIndexes.length === 1) {
      const onlyVisible = chainNotes[visibleIndexes[0]];
      if (!selectedNoteIds.has(onlyVisible.id)) {
        continue;
      }
      applyWholeChainHiddenMirror(chainNotes);
      continue;
    }

    const firstVisibleIndex = visibleIndexes[0];
    const lastVisibleIndex = visibleIndexes[visibleIndexes.length - 1];
    const firstVisibleNote = chainNotes[firstVisibleIndex];
    const lastVisibleNote = chainNotes[lastVisibleIndex];

    if (selectedNoteIds.has(firstVisibleNote.id) && firstVisibleIndex > 0) {
      applyHiddenMirrorRange(chainNotes, 0, firstVisibleIndex);
    }

    if (selectedNoteIds.has(lastVisibleNote.id) && lastVisibleIndex < chainNotes.length - 1) {
      applyHiddenMirrorRange(chainNotes, lastVisibleIndex + 1, chainNotes.length);
    }

    for (let pairIndex = 0; pairIndex < visibleIndexes.length - 1; pairIndex += 1) {
      const leftIndex = visibleIndexes[pairIndex];
      const rightIndex = visibleIndexes[pairIndex + 1];
      if (rightIndex - leftIndex <= 1) {
        continue;
      }

      const leftNote = chainNotes[leftIndex];
      const rightNote = chainNotes[rightIndex];
      const leftSelected = selectedNoteIds.has(leftNote.id);
      const rightSelected = selectedNoteIds.has(rightNote.id);
      if (!leftSelected && !rightSelected) {
        continue;
      }

      const middleCount = rightIndex - leftIndex - 1;
      const beatSpan = rightNote.beat - leftNote.beat;
      const hasBeatSpan = Math.abs(beatSpan) > epsilon;
      const leftLaneDelta = leftSelected
        ? (selectedOffsetById.get(leftNote.id)?.lane ?? 0)
        : 0;
      const rightLaneDelta = rightSelected
        ? (selectedOffsetById.get(rightNote.id)?.lane ?? 0)
        : 0;

      for (let middleIndex = 1; middleIndex <= middleCount; middleIndex += 1) {
        const noteIndex = leftIndex + middleIndex;
        const note = chainNotes[noteIndex];
        if (note.type !== "hidden" || selectedNoteIds.has(note.id)) {
          continue;
        }

        if (leftSelected && rightSelected) {
          setOffsetByMagnitude(note.id, resolveMirrorLaneDelta(note), 0);
          continue;
        }

        let ratio = hasBeatSpan
          ? (note.beat - leftNote.beat) / beatSpan
          : middleIndex / (middleCount + 1);
        if (!Number.isFinite(ratio)) {
          ratio = middleIndex / (middleCount + 1);
        }
        ratio = clamp01(ratio);

        const laneDelta = leftLaneDelta * (1 - ratio) + rightLaneDelta * ratio;
        setOffsetByMagnitude(note.id, laneDelta, 0);
      }
    }
  }

  return offsetById;
}
