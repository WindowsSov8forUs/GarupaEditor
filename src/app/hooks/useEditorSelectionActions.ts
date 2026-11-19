import { useCallback } from "react";

export function useEditorSelectionActions(params: any) {
  const {
    metadata,
    setMetadata,
    setSettings,
    setNotes,
    setBpmEvents,
    normalizeSettings,
    normalizeNote,
    normalizeBpmEvent,
    isLastBeatOrderedBpmNegative,
    sortNotes,
    sortBpmEvents,
    BASE_BPM_LINE_ID,
    bpmEvents,
    normalizeEditorBpm,
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    toFinite,
    approxEq,
    applySelectedOffset,
    commitSelectedNoteTransform,
    minSelectedBeat,
    activeBeatValue,
    activeBpmValue,
    activeLaneValue,
    activeWidthValue,
    activeDirectionalValue,
    tool,
    hasNoteSelection,
    hasDirectionalNoteSelection,
    isRhythmWidthEditableType,
    minSelectedLane,
    setToolLane,
    setUseToolLaneOverride,
    setToolBpmValue,
    setTool,
    setToolDirectionalWidth,
    setToolRhythmWidth,
    isDirectionalNoteType,
    normalizeDirectionalWidth,
    normalizeRhythmWidth,
    widthSettingMode,
    isBeatSettingLocked,
    beatInputText,
    setBeatInputText,
    formatEditorNumeric,
    parseNumericExpression,
    bpmInputText,
    setBpmInputText,
    isLaneSettingLocked,
    laneInputText,
    setLaneInputText,
    widthInputText,
    setWidthInputText,
    deleteNotes,
    clearSelection,
    selectedNoteIds,
    showDialog,
  } = params;

  const applySettingsPatch = (patch: any) => {
    setSettings((current: any) => {
      const next = normalizeSettings({ ...current, ...patch });
      setNotes((previous: any[]) =>
        sortNotes(
          previous
            .map((note) => normalizeNote(note, next))
            .filter((note): note is NonNullable<typeof note> => note !== null),
        ),
      );
      setBpmEvents((previous: any[]) =>
        sortBpmEvents(
          previous
            .map((event) => normalizeBpmEvent(event, next.timeSignatureDenominator, metadata.bpm))
            .filter((event): event is NonNullable<typeof event> => event !== null),
        ),
      );
      return next;
    });
  };

  /** Writes `patch` (beat, bpm) to one BPM event; BASE_BPM_LINE_ID is the Beat 0 base BPM, whose beat is fixed. */
  const updateBpmEvent = (selectionId: string, patch: any) => {
    if (selectionId === BASE_BPM_LINE_ID) {
      if (typeof patch.bpm !== "undefined") {
        const nextBpm = normalizeBaseBpmForWrite(patch.bpm, metadata.bpm);
        if (nextBpm === null) {
          return;
        }
        if (isLastBeatOrderedBpmNegative(nextBpm, bpmEvents)) {
          showDialog("谱面不合法：\n末尾 BPM 不可为负数", "error");
          return;
        }
        setMetadata((current: any) => ({ ...current, bpm: nextBpm }));
      }
      return;
    }

    setBpmEvents((previous: any[]) => {
      const current = previous.find((event) => event.id === selectionId);
      if (!current) {
        return previous;
      }

      const nextBeat =
        typeof patch.beat === "undefined"
          ? current.beat
          : Math.max(0, Number(toFinite(patch.beat, current.beat).toFixed(6)));
      if (typeof patch.beat !== "undefined" && approxEq(nextBeat, 0)) {
        return previous;
      }
      const nextBpmCandidate =
        typeof patch.bpm === "undefined" ? current.bpm : normalizeEventBpmForWrite(patch.bpm, current.bpm);
      if (typeof patch.bpm !== "undefined" && nextBpmCandidate === null) {
        return previous;
      }
      const nextBpm = nextBpmCandidate ?? current.bpm;

      const normalized = {
        id: current.id,
        beat: nextBeat,
        bpm: nextBpm,
      };

      const filtered = previous.filter(
        (event) => event.id === normalized.id || !approxEq(event.beat, normalized.beat),
      );
      const nextEvents = filtered.map((event) => (event.id === normalized.id ? normalized : event));
      if (isLastBeatOrderedBpmNegative(metadata.bpm, nextEvents)) {
        showDialog("谱面不合法：\n末尾 BPM 不可为负数", "error");
        return previous;
      }
      return sortBpmEvents(nextEvents);
    });
  };

  const updateActiveBeat = (raw: unknown) => {
    const nextBeat = Math.max(0, Number(toFinite(raw, activeBeatValue).toFixed(6)));
    if (hasNoteSelection) {
      applySelectedOffset(0, nextBeat - minSelectedBeat, {
        quantizeBeatDelta: false,
      });
    }
  };

  const updateActiveLane = (raw: unknown) => {
    const nextLane = Number(toFinite(raw, activeLaneValue).toFixed(6));
    if (hasNoteSelection) {
      applySelectedOffset(nextLane - minSelectedLane, 0);
      return;
    }
    setToolLane(nextLane);
    setUseToolLaneOverride(true);
  };

  /** Sets one BPM event's value, as the BPM editor opened from its bubble does. */
  const setBpmEventValue = (selectionId: string, raw: unknown) => {
    const current = selectionId === BASE_BPM_LINE_ID
      ? metadata.bpm
      : bpmEvents.find((event: any) => event.id === selectionId)?.bpm;
    if (typeof current !== "number") {
      return false;
    }
    const nextBpm = normalizeEditorBpm(raw, current);
    const allowed = selectionId === BASE_BPM_LINE_ID
      ? normalizeBaseBpmForWrite(nextBpm, current)
      : normalizeEventBpmForWrite(nextBpm, current);
    if (allowed === null) {
      return false;
    }
    updateBpmEvent(selectionId, { bpm: allowed });
    return true;
  };

  const updateActiveBpm = (raw: unknown) => {
    setToolBpmValue(normalizeEditorBpm(raw, activeBpmValue));
    return true;
  };

  const stepActiveLane = (delta: number) => {
    updateActiveLane(activeLaneValue + delta);
  };

  const updateActiveWidth = (raw: unknown) => {
    if (widthSettingMode === "directional") {
      const nextWidth = normalizeDirectionalWidth(raw);
      if (hasDirectionalNoteSelection) {
        commitSelectedNoteTransform(
          (note: any) => {
            if (!isDirectionalNoteType(note.type)) {
              return note;
            }
            return {
              ...note,
              width: nextWidth,
            };
          },
        );
        return;
      }

      setToolDirectionalWidth(nextWidth);
      return;
    }

    if (widthSettingMode === "rhythm") {
      const nextWidth = normalizeRhythmWidth(raw);
      if (hasNoteSelection) {
        commitSelectedNoteTransform(
          (note: any) => {
            if (!isRhythmWidthEditableType(note.type)) {
              return note;
            }
            return {
              ...note,
              width: nextWidth,
            };
          },
        );
        return;
      }

      setToolRhythmWidth(nextWidth);
      return;
    }
  };

  const stepActiveWidth = (delta: number) => {
    updateActiveWidth(activeWidthValue + delta);
  };

  const setActiveDirectionalType = (direction: "left" | "right") => {
    if (!hasDirectionalNoteSelection && !isDirectionalNoteType(tool)) {
      return;
    }
    if (activeDirectionalValue === direction) {
      return;
    }

    const nextType = direction === "left" ? "directional_flick_left" : "directional_flick_right";
    if (hasDirectionalNoteSelection) {
      commitSelectedNoteTransform(
        (note: any) => {
          if (!isDirectionalNoteType(note.type)) {
            return note;
          }
          return {
            ...note,
            type: nextType,
            width: normalizeDirectionalWidth(note.width),
          };
        },
      );
      return;
    }

    setTool(nextType);
  };

  const commitBeatInput = useCallback(() => {
    if (isBeatSettingLocked) {
      setBeatInputText("");
      return;
    }

    const text = beatInputText.trim();
    const parsed = text === "" ? 0 : parseNumericExpression(text);
    if (parsed === null) {
      setBeatInputText(formatEditorNumeric(activeBeatValue));
      return;
    }

    const nextBeat = Math.max(0, Number(toFinite(parsed, activeBeatValue).toFixed(6)));
    updateActiveBeat(nextBeat);
    setBeatInputText(formatEditorNumeric(nextBeat));
  }, [
    activeBeatValue,
    beatInputText,
    formatEditorNumeric,
    isBeatSettingLocked,
    parseNumericExpression,
    setBeatInputText,
    toFinite,
  ]);

  const commitBpmInput = useCallback(() => {
    const text = bpmInputText.trim();
    const parsed = text === "" ? 0 : parseNumericExpression(text);
    if (parsed === null) {
      setBpmInputText(formatEditorNumeric(activeBpmValue));
      return;
    }

    const nextBpm = normalizeEditorBpm(parsed, activeBpmValue);
    const applied = updateActiveBpm(nextBpm);
    setBpmInputText(formatEditorNumeric(applied ? nextBpm : activeBpmValue));
  }, [
    activeBpmValue,
    bpmInputText,
    formatEditorNumeric,
    normalizeEditorBpm,
    parseNumericExpression,
    setBpmInputText,
    updateActiveBpm,
  ]);

  const commitLaneInput = useCallback(() => {
    if (isLaneSettingLocked) {
      setLaneInputText("");
      return;
    }

    const text = laneInputText.trim();
    const parsed = text === "" ? 0 : parseNumericExpression(text);
    if (parsed === null) {
      setLaneInputText(String(activeLaneValue));
      return;
    }

    const nextLane = Number(toFinite(parsed, activeLaneValue).toFixed(6));
    updateActiveLane(nextLane);
    setLaneInputText(String(nextLane));
  }, [activeLaneValue, isLaneSettingLocked, laneInputText, parseNumericExpression, setLaneInputText, toFinite]);

  const commitWidthInput = useCallback(() => {
    if (widthSettingMode === null) {
      setWidthInputText("");
      return;
    }

    const text = widthInputText.trim();
    const parsed = text === "" ? 0 : parseNumericExpression(text);
    if (parsed === null) {
      setWidthInputText(String(activeWidthValue));
      return;
    }

    const nextWidth = widthSettingMode === "directional"
      ? normalizeDirectionalWidth(parsed)
      : normalizeRhythmWidth(parsed);
    updateActiveWidth(nextWidth);
    setWidthInputText(String(nextWidth));
  }, [
    activeWidthValue,
    normalizeDirectionalWidth,
    normalizeRhythmWidth,
    parseNumericExpression,
    setWidthInputText,
    widthSettingMode,
    widthInputText,
  ]);

  /** The delete button and the Delete key: deletes the selected notes. */
  const deleteSelectedNotes = useCallback(() => {
    if (selectedNoteIds.length === 0) {
      return;
    }
    deleteNotes(selectedNoteIds);
    clearSelection();
  }, [clearSelection, deleteNotes, selectedNoteIds]);

  /**
   * A right-click on a note or on a Slide segment; `noteIds` are the note, or the segment's end notes. When they are
   * all selected it deletes the selection, otherwise just them. The selection is cleared either way.
   */
  const deleteRightClickedNotes = useCallback((noteIds: string[]) => {
    if (noteIds.length === 0) {
      return;
    }
    const selected = new Set(selectedNoteIds);
    deleteNotes(noteIds.every((id) => selected.has(id)) ? selectedNoteIds : noteIds);
    clearSelection();
  }, [clearSelection, deleteNotes, selectedNoteIds]);

  return {
    applySettingsPatch,
    stepActiveLane,
    stepActiveWidth,
    setActiveDirectionalType,
    commitBeatInput,
    commitBpmInput,
    updateActiveBpm,
    setBpmEventValue,
    commitLaneInput,
    commitWidthInput,
    deleteSelectedNotes,
    deleteRightClickedNotes,
  };
}
