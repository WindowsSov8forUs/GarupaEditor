import { useCallback, useEffect } from "react";
import {
  createId,
  isDirectionalNoteType,
  normalizeRhythmWidth,
  type ChartNote,
} from "../../chartCore";
import { type SlideBuildState } from "../editorHelpers";
import { buildSelectionMoveOffsetMap } from "../slideHiddenMoveOffsets";
import { canUseSpRhythm } from "../modeChartRegression";
import { dropRemovedNotesFromChains } from "../slideChainCleanup";
import { planNoteDeletion, planSlideSegmentDeletion } from "../noteDeletion";

export function useSelectionAndEditorSync(params: any) {
  const {
    setSelectedNoteIds,
    setSelectedSegmentKeys,
    setSlideChains,
    normalizeSlideChains,
    normalizeNotes,
    setNotes,
    sortNotes,
    allNotes,
    slideChains,
    setSlideBuildState,
    slideBuildRef,
    selectedNoteIds,
    selectionMoveRef,
    setSelectionMovePreview,
    showBeatSetting,
    isBeatSettingLocked,
    setBeatInputText,
    beatInputEditingRef,
    formatEditorNumeric,
    activeBeatValue,
    showBpmSetting,
    setBpmInputText,
    bpmInputEditingRef,
    activeBpmValue,
    showSvSetting,
    setSvInputText,
    svInputEditingRef,
    activeSvValue,
    showLaneSetting,
    isLaneSettingLocked,
    setLaneInputText,
    laneInputEditingRef,
    activeLaneValue,
    showWidthSetting,
    setWidthInputText,
    widthInputEditingRef,
    activeWidthValue,
    isSkinReady,
    isToolArmed,
    tool,
    setCursorPreview,
    slideBuildState,
    setSlideBuildCursor,
    settings,
    normalizeNote,
    toFinite,
    quantizeBeat,
    beatDivision,
    approxEq,
    modeOptions,
    exGarupaEnabled,
  } = params;

  /** Drops every selection: notes and Slide segments. */
  const clearSelection = useCallback(() => {
    setSelectedNoteIds((previous: string[]) => (previous.length === 0 ? previous : []));
    setSelectedSegmentKeys((previous: string[]) => (previous.length === 0 ? previous : []));
  }, [setSelectedNoteIds, setSelectedSegmentKeys]);


  const removeNoteIdsFromSlideChains = useCallback((noteIds: string[]) => {
    if (noteIds.length === 0) {
      return;
    }
    const removeSet = new Set(noteIds);
    setSlideChains((previous: any[]) =>
      previous
        .map((chain) => ({
          ...chain,
          noteIds: chain.noteIds.filter((id: string) => !removeSet.has(id)),
        }))
        .filter((chain) => chain.noteIds.length > 0),
    );
  }, [setSlideChains]);

  /** Deletes Slide segments (by key) and then notes; every delete input comes here (see noteDeletion.ts for the
   * rules). One history step. */
  const deleteNotes = useCallback((noteIds: string[], segmentKeys: readonly string[] = []) => {
    const exGarupa = exGarupaEnabled === true;
    const cut = segmentKeys.length > 0
      ? planSlideSegmentDeletion({ notes: allNotes, slideChains, segmentKeys, exGarupa, createId })
      : null;
    const base = cut ?? { notes: allNotes, slideChains };
    const plan = planNoteDeletion({
      notes: base.notes,
      slideChains: base.slideChains,
      noteIds,
      spRhythm: canUseSpRhythm(modeOptions),
      exGarupa,
      createId,
    }) ?? cut;
    if (!plan) return;
    setNotes(sortNotes(plan.notes));
    setSlideChains(plan.slideChains);
  }, [allNotes, exGarupaEnabled, modeOptions, setNotes, setSlideChains, slideChains, sortNotes]);


  // Selecting notes this way drops the selected Slide segments.
  const setSingleSelectedNote = useCallback((noteId: string | null) => {
    setSelectedSegmentKeys((previous: string[]) => (previous.length === 0 ? previous : []));
    if (!noteId) {
      setSelectedNoteIds((previous: string[]) => (previous.length === 0 ? previous : []));
      return;
    }
    setSelectedNoteIds((previous: string[]) =>
      previous.length === 1 && previous[0] === noteId ? previous : [noteId],
    );
  }, [setSelectedNoteIds, setSelectedSegmentKeys]);

  /** Selects `noteIds`; the selected Slide segments go unless `keepSegments` (a multi-select's marquee). */
  const setMultiSelectedNotes = useCallback((noteIds: string[], primaryId?: string | null,
    options?: { keepSegments?: boolean }) => {
    if (!options?.keepSegments) setSelectedSegmentKeys((previous: string[]) => (previous.length === 0 ? previous : []));
    const uniqueIds = Array.from(new Set(noteIds));
    if (uniqueIds.length === 0) {
      setSelectedNoteIds([]);
      return;
    }

    const primary =
      primaryId && uniqueIds.includes(primaryId)
        ? primaryId
        : uniqueIds[0];
    setSelectedNoteIds([primary, ...uniqueIds.filter((id) => id !== primary)]);
  }, [setSelectedNoteIds, setSelectedSegmentKeys]);

  const toggleSelectedNote = useCallback((noteId: string) => {
    setSelectedNoteIds((previous: string[]) => {
      if (previous.includes(noteId)) {
        const next = previous.filter((id) => id !== noteId);
        return next;
      }
      return [noteId, ...previous];
    });
  }, [setSelectedNoteIds]);

  const notePositionKey = useCallback(
    (lane: number, beat: number): string => `${lane.toFixed(6)}|${beat.toFixed(6)}`,
    [],
  );

  const shouldNotesOverlap = useCallback((left: ChartNote, right: ChartNote): boolean => {
    if (left.type === "hidden" || right.type === "hidden") {
      return false;
    }
    if (notePositionKey(left.lane, left.beat) !== notePositionKey(right.lane, right.beat)) {
      return false;
    }
    if (isDirectionalNoteType(left.type) || isDirectionalNoteType(right.type)) {
      return true;
    }
    return normalizeRhythmWidth(left.width) === normalizeRhythmWidth(right.width);
  }, [notePositionKey]);

  const commitSelectedNoteTransform = useCallback(
    (
      transform: (note: ChartNote) => ChartNote | null,
    ) => {
      if (selectedNoteIds.length === 0) {
        return;
      }

      const selectedSet = new Set(selectedNoteIds);
      const transformedById = new Map<string, ChartNote>();

      for (const note of allNotes) {
        if (!selectedSet.has(note.id)) {
          continue;
        }
        const transformed = transform(note);
        if (!transformed) {
          continue;
        }
        const normalized = normalizeNote(transformed, settings);
        if (!normalized) {
          continue;
        }
        transformedById.set(normalized.id, normalized);
      }

      const transformedNotes = Array.from(transformedById.values());
      const remained = allNotes.filter(
        (note: ChartNote) =>
          !selectedSet.has(note.id) &&
          !transformedNotes.some((transformed) => shouldNotesOverlap(note, transformed)),
      );

      const nextNotes = sortNotes([...remained, ...transformedNotes]);
      setNotes(nextNotes);
      setSlideChains((previous: any[]) => dropRemovedNotesFromChains(previous, nextNotes));
    },
    [allNotes, normalizeNote, selectedNoteIds, setNotes, setSlideChains, settings, shouldNotesOverlap, sortNotes],
  );

  const applySelectedOffset = useCallback(
    (
      laneDeltaRaw: number,
      beatDeltaRaw: number,
      options?: {
        quantizeBeatDelta?: boolean;
        /** Applied to each selected note before the move (its other properties: width, type), in the same edit. */
        transform?: (note: ChartNote) => ChartNote;
      },
    ) => {
      if (selectedNoteIds.length === 0) {
        return;
      }

      const laneDelta = Number(toFinite(laneDeltaRaw, 0).toFixed(6));
      const rawBeatDelta = toFinite(beatDeltaRaw, 0);
      const shouldQuantizeBeatDelta = options?.quantizeBeatDelta ?? true;
      const beatDelta = Number(
        (shouldQuantizeBeatDelta ? quantizeBeat(rawBeatDelta, beatDivision) : rawBeatDelta).toFixed(6),
      );
      if (laneDelta === 0 && approxEq(beatDelta, 0) && !options?.transform) {
        return;
      }

      {
        const selectedSet = new Set<string>(selectedNoteIds as string[]);
        const epsilon = 1e-6;
        const toFixed6 = (value: number): number => Number(value.toFixed(6));

        const offsetById = buildSelectionMoveOffsetMap({
          notes: allNotes,
          slideChains: slideChains as Array<{ noteIds: string[]; long?: true }>,
          selectedNoteIds: selectedSet,
          laneDelta,
          beatDelta,
          epsilon,
        });

        const transformedById = new Map<string, ChartNote>();
        for (const note of allNotes) {
          const offset = offsetById.get(note.id);
          if (!offset) {
            continue;
          }
          const isSelected = selectedSet.has(note.id);
          const nextBeat = Math.max(0, toFixed6(note.beat + offset.beat));
          const nextEndBeat = isSelected && typeof note.endBeat === "number"
            ? Math.max(0, toFixed6(note.endBeat + beatDelta))
            : undefined;
          const nextEndLane = isSelected && typeof note.endLane === "number"
            ? toFixed6(note.endLane + laneDelta)
            : undefined;
          const transformed = normalizeNote(
            {
              ...(isSelected && options?.transform ? options.transform(note) : note),
              lane: toFixed6(note.lane + offset.lane),
              beat: nextBeat,
              ...(typeof nextEndBeat === "number" ? { endBeat: nextEndBeat } : { endBeat: undefined }),
              ...(typeof nextEndLane === "number" ? { endLane: nextEndLane } : { endLane: undefined }),
            },
            settings,
          );
          if (transformed) {
            transformedById.set(transformed.id, transformed);
          }
        }

        const transformedNotes = Array.from(transformedById.values());
        const transformedIdSet = new Set(transformedById.keys());
        const remained = allNotes.filter(
          (note: ChartNote) =>
            !transformedIdSet.has(note.id) &&
            !transformedNotes.some((transformed) => shouldNotesOverlap(note, transformed)),
        );

        const nextNotes = sortNotes([...remained, ...transformedNotes]);
        setNotes(nextNotes);
        setSlideChains((previous: any[]) => dropRemovedNotesFromChains(previous, nextNotes));
      }
    },
    [
      allNotes,
      approxEq,
      beatDivision,
      normalizeNote,
      quantizeBeat,
      selectedNoteIds,
      setNotes,
      setSlideChains,
      settings,
      shouldNotesOverlap,
      slideChains,
      sortNotes,
      toFinite,
    ],
  );

  useEffect(() => {
    setSelectedNoteIds((previous: string[]) => {
      if (previous.length === 0) {
        return previous;
      }
      const existing = new Set(allNotes.map((note: ChartNote) => note.id));
      const next = previous.filter((id) => existing.has(id));
      if (next.length === previous.length && next.every((id, index) => id === previous[index])) {
        return previous;
      }
      return next;
    });
  }, [allNotes, setSelectedNoteIds]);

  useEffect(() => {
    const existing = new Set(allNotes.map((note: ChartNote) => note.id));
    // Derived cleanup after notes change: it belongs to the edit that changed the notes, not a step of its own.
    normalizeSlideChains((previous: any[]) => {
      if (previous.length === 0) {
        return previous;
      }
      const next = previous
        .map((chain) => {
          const deduped = Array.from(new Set(chain.noteIds.filter((id: string) => existing.has(id))));
          return { ...chain, noteIds: deduped };
        })
        .filter((chain) => chain.noteIds.length >= 2);
      if (
        next.length === previous.length &&
        next.every((chain, index) => chain.id === previous[index].id && chain.noteIds.join("|") === previous[index].noteIds.join("|"))
      ) {
        return previous;
      }
      return next;
    });
    setSlideBuildState((previous: SlideBuildState | null) => {
      if (!previous) {
        slideBuildRef.current = null;
        return previous;
      }
      const nextIds = previous.noteIds.filter((id) => existing.has(id));
      if (nextIds.length === 0) {
        slideBuildRef.current = null;
        return null;
      }
      const next: SlideBuildState = {
        ...previous,
        noteIds: Array.from(new Set(nextIds)),
      };
      slideBuildRef.current = next;
      if (
        next.createdHeadId === previous.createdHeadId &&
        next.mode === previous.mode &&
        next.persistUntilRightClick === previous.persistUntilRightClick &&
        next.noteIds.length === previous.noteIds.length &&
        next.noteIds.every((id, index) => id === previous.noteIds[index])
      ) {
        return previous;
      }
      return next;
    });
  }, [allNotes, normalizeSlideChains, setSlideBuildState, slideBuildRef]);

  useEffect(() => {
    const slideNoteIdSet = new Set(slideChains.flatMap((chain: any) => chain.noteIds));
    // Derived cleanup after chains change: removing orphaned hidden points belongs to the edit that orphaned
    // them, not a step of its own (undoing such a step would restore points this cleanup removes at once).
    normalizeNotes((previous: ChartNote[]) => {
      let changed = false;
      const next = previous.filter((note) => {
        if (note.type === "hidden" && !slideNoteIdSet.has(note.id)) {
          changed = true;
          return false;
        }
        return true;
      });
      return changed ? next : previous;
    });
  }, [normalizeNotes, slideChains]);

  useEffect(() => {
    if (selectedNoteIds.length > 0) {
      return;
    }
    selectionMoveRef.current = null;
    setSelectionMovePreview(null);
  }, [selectedNoteIds.length, selectionMoveRef, setSelectionMovePreview]);

  useEffect(() => {
    if (!showBeatSetting || isBeatSettingLocked) {
      setBeatInputText("");
      return;
    }
    if (beatInputEditingRef.current) {
      return;
    }
    setBeatInputText(formatEditorNumeric(activeBeatValue));
  }, [activeBeatValue, formatEditorNumeric, isBeatSettingLocked, setBeatInputText, showBeatSetting]);

  useEffect(() => {
    if (!showBpmSetting) {
      setBpmInputText("");
      return;
    }
    if (bpmInputEditingRef.current) {
      return;
    }
    setBpmInputText(formatEditorNumeric(activeBpmValue));
  }, [activeBpmValue, formatEditorNumeric, setBpmInputText, showBpmSetting]);

  useEffect(() => {
    if (!showSvSetting) {
      setSvInputText("");
      return;
    }
    if (svInputEditingRef.current) {
      return;
    }
    setSvInputText(formatEditorNumeric(activeSvValue));
  }, [activeSvValue, formatEditorNumeric, setSvInputText, showSvSetting, svInputEditingRef]);

  useEffect(() => {
    if (!showLaneSetting || isLaneSettingLocked) {
      setLaneInputText("");
      return;
    }
    if (laneInputEditingRef.current) {
      return;
    }
    setLaneInputText(String(activeLaneValue));
  }, [activeLaneValue, isLaneSettingLocked, setLaneInputText, showLaneSetting]);

  useEffect(() => {
    if (!showWidthSetting) {
      setWidthInputText("");
      return;
    }
    if (widthInputEditingRef.current) {
      return;
    }
    setWidthInputText(String(activeWidthValue));
  }, [activeWidthValue, setWidthInputText, showWidthSetting, widthInputEditingRef]);

  useEffect(() => {
    if (!isSkinReady || !isToolArmed || tool === "bpm") {
      setCursorPreview(null);
    }
  }, [isSkinReady, isToolArmed, setCursorPreview, tool]);

  useEffect(() => {
    if (!slideBuildState) {
      setSlideBuildCursor(null);
    }
  }, [setSlideBuildCursor, slideBuildState]);

  return {
    clearSelection,
    removeNoteIdsFromSlideChains,
    deleteNotes,
    setSingleSelectedNote,
    setMultiSelectedNotes,
    toggleSelectedNote,
    notePositionKey,
    commitSelectedNoteTransform,
    applySelectedOffset,
  };
}
