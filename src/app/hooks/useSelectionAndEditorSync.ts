import { useCallback, useEffect } from "react";
import type { ChartBpmEvent, ChartNote, ChartSvEvent } from "../../chartCore";
import { type SlideBuildState } from "../editorHelpers";
import { buildSelectionMoveOffsetMap } from "../slideHiddenMoveOffsets";
import { cleanupSlideChainsHidden } from "../slideChainCleanup";

export function useSelectionAndEditorSync(params: any) {
  const {
    setSelectedNoteIds,
    setSelectedBpmEventIds,
    setSelectedBpmEventId,
    setSelectedSvEventIds,
    setSelectedSvEventId,
    setSelectedLongLineSegmentId,
    setSlideChains,
    setNotes,
    slideRoleByNoteId,
    noteById,
    sortNotes,
    allNotes,
    bpmEvents,
    svEvents,
    metadata,
    slideChains,
    setSlideBuildState,
    slideBuildRef,
    BASE_BPM_LINE_ID,
    selectedBpmEventId,
    selectedNoteIds,
    selectionMoveRef,
    setSelectionMovePreview,
    selectedBpmEventIds,
    selectedSvEventIds,
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
    setStatusMessage,
    toFinite,
    quantizeBeat,
    beatDivision,
    approxEq,
    setBpmEvents,
    setSvEvents,
    sortBpmEvents,
    sortSvEvents,
    isLastBeatOrderedBpmNegative,
    spRhythmNoteEnabled,
  } = params;

  const clearSelectedNotes = useCallback(() => {
    setSelectedNoteIds((previous: string[]) => (previous.length === 0 ? previous : []));
  }, [setSelectedNoteIds]);

  const clearSelectedBpmEvents = useCallback(() => {
    setSelectedBpmEventIds((previous: string[]) => (previous.length === 0 ? previous : []));
  }, [setSelectedBpmEventIds]);

  const clearAllSelections = useCallback(() => {
    clearSelectedNotes();
    clearSelectedBpmEvents();
    setSelectedBpmEventId(null);
    setSelectedSvEventIds((previous: string[]) => (previous.length === 0 ? previous : []));
    setSelectedSvEventId(null);
    setSelectedLongLineSegmentId(null);
  }, [clearSelectedBpmEvents, clearSelectedNotes, setSelectedBpmEventId, setSelectedLongLineSegmentId, setSelectedSvEventId, setSelectedSvEventIds]);

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

  const deleteNotesWithSlideHiddenFallback = useCallback((noteIds: string[]) => {
    const uniqueIds = Array.from(new Set(noteIds));
    if (uniqueIds.length === 0) {
      return { removedCount: 0, hiddenCount: 0 };
    }

    if (!spRhythmNoteEnabled) {
      const removeSet = new Set(uniqueIds);
      const removedCount = uniqueIds.reduce((count, id) => (noteById.has(id) ? count + 1 : count), 0);
      if (removedCount === 0) {
        return { removedCount: 0, hiddenCount: 0 };
      }

      setNotes((previous: ChartNote[]) =>
        sortNotes(previous.filter((note) => !removeSet.has(note.id))),
      );
      setSlideChains((previous: any[]) =>
        previous
          .map((chain) => ({
            ...chain,
            noteIds: chain.noteIds.filter((id: string) => !removeSet.has(id)),
          }))
          .filter((chain) => chain.noteIds.length >= 2),
      );

      return {
        removedCount,
        hiddenCount: 0,
      };
    }

    const toHiddenIds = uniqueIds.filter((id) => slideRoleByNoteId.has(id));
    const toRemoveIds = uniqueIds.filter((id) => !slideRoleByNoteId.has(id));
    const toHiddenSet = new Set(toHiddenIds);
    const toRemoveSet = new Set(toRemoveIds);
    const hiddenCount = toHiddenIds.reduce((count, id) => {
      const note = noteById.get(id);
      if (!note || note.type === "hidden") {
        return count;
      }
      return count + 1;
    }, 0);

    setNotes((previous: ChartNote[]) =>
      sortNotes(
        previous.flatMap((note) => {
          if (toHiddenSet.has(note.id)) {
            if (note.type === "hidden") {
              return [note];
            }
            return [
              {
                id: note.id,
                type: "hidden",
                lane: note.lane,
                beat: note.beat,
                width: typeof note.width === "number" && Number.isFinite(note.width) ? note.width : 1,
              } satisfies ChartNote,
            ];
          }
          if (toRemoveSet.has(note.id)) {
            return [];
          }
          return [note];
        }),
      ),
    );

    if (toHiddenIds.length > 0) {
      const projectedNoteById = new Map<string, ChartNote>();
      noteById.forEach((value: any, key: string) => {
        if (!value) {
          return;
        }
        projectedNoteById.set(key, value as ChartNote);
      });
      for (const id of toHiddenIds) {
        const source = projectedNoteById.get(id);
        if (!source) {
          continue;
        }
        projectedNoteById.set(id, {
          id,
          type: "hidden",
          lane: source.lane,
          beat: source.beat,
          width: typeof source.width === "number" && Number.isFinite(source.width) ? source.width : 1,
        } satisfies ChartNote);
      }

      setSlideChains((previous: any[]) =>
        cleanupSlideChainsHidden({
          chains: previous,
          noteMap: projectedNoteById,
          minLength: 1,
        }),
      );
    }

    if (toRemoveIds.length > 0) {
      removeNoteIdsFromSlideChains(toRemoveIds);
    }

    return {
      removedCount: toRemoveIds.length,
      hiddenCount,
    };
  }, [
    noteById,
    removeNoteIdsFromSlideChains,
    setNotes,
    setSlideChains,
    slideRoleByNoteId,
    sortNotes,
    spRhythmNoteEnabled,
  ]);

  const setSingleSelectedNote = useCallback((noteId: string | null) => {
    if (!noteId) {
      setSelectedNoteIds((previous: string[]) => (previous.length === 0 ? previous : []));
      return;
    }
    setSelectedNoteIds((previous: string[]) =>
      previous.length === 1 && previous[0] === noteId ? previous : [noteId],
    );
  }, [setSelectedNoteIds]);

  const setMultiSelectedNotes = useCallback((noteIds: string[], primaryId?: string | null) => {
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
  }, [setSelectedNoteIds]);

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

  const commitSelectedNoteTransform = useCallback(
    (
      transform: (note: ChartNote) => ChartNote | null,
      statusMessageText: string,
    ) => {
      if (selectedNoteIds.length === 0) {
        return;
      }

      const selectedSet = new Set(selectedNoteIds);
      setNotes((previous: ChartNote[]) => {
        const transformedById = new Map<string, ChartNote>();

        for (const note of previous) {
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
        const occupied = new Set(
          transformedNotes.map((note) => notePositionKey(note.lane, note.beat)),
        );
        const remained = previous.filter(
          (note) =>
            !selectedSet.has(note.id) &&
            !occupied.has(notePositionKey(note.lane, note.beat)),
        );

        return sortNotes([...remained, ...transformedNotes]);
      });
      setStatusMessage(statusMessageText);
    },
    [notePositionKey, normalizeNote, selectedNoteIds, setNotes, setStatusMessage, settings, sortNotes],
  );

  const applySelectedOffset = useCallback(
    (
      laneDeltaRaw: number,
      beatDeltaRaw: number,
      reason = "已批量移动选中音符。",
      options?: { quantizeBeatDelta?: boolean },
    ) => {
      if (selectedNoteIds.length === 0 && selectedBpmEventIds.length === 0 && selectedSvEventIds.length === 0) {
        return;
      }

      const laneDelta = Number(toFinite(laneDeltaRaw, 0).toFixed(6));
      const rawBeatDelta = toFinite(beatDeltaRaw, 0);
      const shouldQuantizeBeatDelta = options?.quantizeBeatDelta ?? true;
      const beatDelta = Number(
        (shouldQuantizeBeatDelta ? quantizeBeat(rawBeatDelta, beatDivision) : rawBeatDelta).toFixed(6),
      );
      if (laneDelta === 0 && approxEq(beatDelta, 0)) {
        return;
      }

      const shouldMoveSelectedBpmEvents = selectedBpmEventIds.length > 0 && !approxEq(beatDelta, 0);
      const shouldMoveSelectedSvEvents = selectedSvEventIds.length > 0 && !approxEq(beatDelta, 0);
      const selectedBpmSet = shouldMoveSelectedBpmEvents ? new Set(selectedBpmEventIds) : null;
      const selectedSvSet = shouldMoveSelectedSvEvents ? new Set(selectedSvEventIds) : null;
      const minEventBeat = Number((1 / beatDivision).toFixed(6));
      const buildShiftedBpmEvents = (source: ChartBpmEvent[]): ChartBpmEvent[] => {
        if (!shouldMoveSelectedBpmEvents || !selectedBpmSet) {
          return source;
        }
        const shiftedById = new Map<string, ChartBpmEvent>();
        for (const event of source) {
          if (!selectedBpmSet.has(event.id)) {
            continue;
          }
          shiftedById.set(event.id, {
            ...event,
            beat: Math.max(minEventBeat, Number((event.beat + beatDelta).toFixed(6))),
          });
        }
        const shiftedEvents = Array.from(shiftedById.values());
        const occupiedBeats = new Set(shiftedEvents.map((event) => event.beat.toFixed(6)));
        const remained = source.filter(
          (event) =>
            !selectedBpmSet.has(event.id) &&
            !occupiedBeats.has(event.beat.toFixed(6)),
        );
        return sortBpmEvents([...remained, ...shiftedEvents]);
      };
      const buildShiftedSvEvents = (source: ChartSvEvent[]): ChartSvEvent[] => {
        if (!shouldMoveSelectedSvEvents || !selectedSvSet) {
          return source;
        }
        const shiftedById = new Map<string, ChartSvEvent>();
        for (const event of source) {
          if (!selectedSvSet.has(event.id)) {
            continue;
          }
          shiftedById.set(event.id, {
            ...event,
            beat: Math.max(0, Number((event.beat + beatDelta).toFixed(6))),
          });
        }
        const shiftedEvents = Array.from(shiftedById.values());
        const occupiedKeys = new Set(
          shiftedEvents.map((event) => `${event.timingGroup}|${event.beat.toFixed(6)}`),
        );
        const remained = source.filter(
          (event) =>
            !selectedSvSet.has(event.id) &&
            !occupiedKeys.has(`${event.timingGroup}|${event.beat.toFixed(6)}`),
        );
        return sortSvEvents([...remained, ...shiftedEvents]);
      };

      if (shouldMoveSelectedBpmEvents) {
        const nextBpmEvents = buildShiftedBpmEvents(bpmEvents);
        if (isLastBeatOrderedBpmNegative(metadata.bpm, nextBpmEvents)) {
          setStatusMessage("已阻止：按 Beat 顺序最后一个 BPM 不能为负数。");
          return;
        }
      }

      if (selectedNoteIds.length > 0) {
        const selectedSet = new Set<string>(selectedNoteIds as string[]);
        const epsilon = 1e-6;
        const toFixed6 = (value: number): number => Number(value.toFixed(6));

        setNotes((previous: ChartNote[]) => {
          const offsetById = buildSelectionMoveOffsetMap({
            notes: previous,
            slideChains: slideChains as Array<{ noteIds: string[] }>,
            selectedNoteIds: selectedSet,
            laneDelta,
            beatDelta,
            epsilon,
          });

          const transformedById = new Map<string, ChartNote>();
          for (const note of previous) {
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
                ...note,
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
          const occupied = new Set(
            transformedNotes.map((note) => notePositionKey(note.lane, note.beat)),
          );
          const transformedIdSet = new Set(transformedById.keys());
          const remained = previous.filter(
            (note) =>
              !transformedIdSet.has(note.id) &&
              !occupied.has(notePositionKey(note.lane, note.beat)),
          );

          return sortNotes([...remained, ...transformedNotes]);
        });
      }

      if (shouldMoveSelectedBpmEvents) {
        setBpmEvents((previous: ChartBpmEvent[]) => buildShiftedBpmEvents(previous));
      }
      if (shouldMoveSelectedSvEvents) {
        setSvEvents((previous: ChartSvEvent[]) => buildShiftedSvEvents(previous));
      }

      setStatusMessage(reason);
    },
    [
      approxEq,
      bpmEvents,
      beatDivision,
      isLastBeatOrderedBpmNegative,
      metadata.bpm,
      notePositionKey,
      normalizeNote,
      quantizeBeat,
      selectedBpmEventIds,
      selectedSvEventIds,
      selectedNoteIds,
      setNotes,
      setBpmEvents,
      setSvEvents,
      setStatusMessage,
      settings,
      slideChains,
      sortBpmEvents,
      sortSvEvents,
      sortNotes,
      svEvents,
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
    setSelectedBpmEventIds((previous: string[]) => {
      if (previous.length === 0) {
        return previous;
      }
      const existing = new Set(bpmEvents.map((event: ChartBpmEvent) => event.id));
      const next = previous.filter((id) => existing.has(id));
      if (next.length === previous.length && next.every((id, index) => id === previous[index])) {
        return previous;
      }
      return next;
    });
  }, [bpmEvents, setSelectedBpmEventIds]);

  useEffect(() => {
    const existing = new Set(allNotes.map((note: ChartNote) => note.id));
    setSlideChains((previous: any[]) => {
      if (previous.length === 0) {
        return previous;
      }
      const next = previous
        .map((chain) => {
          const deduped = Array.from(new Set(chain.noteIds.filter((id: string) => existing.has(id))));
          return { ...chain, noteIds: deduped };
        })
        .filter((chain) => chain.noteIds.length > 0);
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
  }, [allNotes, setSlideBuildState, setSlideChains, slideBuildRef]);

  useEffect(() => {
    const slideNoteIdSet = new Set(slideChains.flatMap((chain: any) => chain.noteIds));
    setNotes((previous: ChartNote[]) => {
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
  }, [setNotes, slideChains]);

  useEffect(() => {
    if (!selectedBpmEventId || selectedBpmEventId === BASE_BPM_LINE_ID) {
      return;
    }
    if (!bpmEvents.some((event: ChartBpmEvent) => event.id === selectedBpmEventId)) {
      setSelectedBpmEventId(null);
    }
  }, [BASE_BPM_LINE_ID, bpmEvents, selectedBpmEventId, setSelectedBpmEventId]);

  useEffect(() => {
    if (selectedNoteIds.length > 0) {
      return;
    }
    selectionMoveRef.current = null;
    setSelectionMovePreview(null);
  }, [selectedNoteIds.length, selectionMoveRef, setSelectionMovePreview]);

  useEffect(() => {
    if (selectedNoteIds.length > 0 || selectedBpmEventIds.length > 0 || selectedBpmEventId !== null) {
      setSelectedLongLineSegmentId(null);
    }
  }, [selectedBpmEventId, selectedBpmEventIds.length, selectedNoteIds.length, setSelectedLongLineSegmentId]);

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
    clearSelectedNotes,
    clearSelectedBpmEvents,
    clearAllSelections,
    removeNoteIdsFromSlideChains,
    deleteNotesWithSlideHiddenFallback,
    setSingleSelectedNote,
    setMultiSelectedNotes,
    toggleSelectedNote,
    notePositionKey,
    commitSelectedNoteTransform,
    applySelectedOffset,
  };
}
