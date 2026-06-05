import { useCallback } from "react";

export function useEditorSelectionActions(params: any) {
  const {
    metadata,
    setMetadata,
    setSettings,
    setNotes,
    setBpmEvents,
    setSvEvents,
    normalizeSettings,
    normalizeNote,
    normalizeBpmEvent,
    isLastBeatOrderedBpmNegative,
    sortNotes,
    sortBpmEvents,
    selectedBpmEventId,
    BASE_BPM_LINE_ID,
    bpmEvents,
    normalizeEditorBpm,
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    toFinite,
    approxEq,
    hasBeatEditableSelection,
    applySelectedOffset,
    commitSelectedNoteTransform,
    minSelectedBeat,
    isEditingPlacedBpm,
    selectedBpmEvent,
    isBaseBpmSelected,
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
    isEditingPlacedSv,
    selectedSvEvent,
    normalizeTimingGroup,
    sortSvEvents,
    isLaneSettingLocked,
    laneInputText,
    setLaneInputText,
    widthInputText,
    setWidthInputText,
    deleteNotesWithSlideHiddenFallback,
    clearSelectedNotes,
    selectedNoteIds,
    setStatusMessage,
    selectedBpmEventIds,
    selectedSvEventIds,
    selectedSvEventId,
    setSelectedNoteIds,
    setSelectedBpmEventIds,
    setSelectedBpmEventId,
    setSelectedSvEventIds,
    setSelectedSvEventId,
    selectedLongLineSegmentId,
    deleteSelectedLongLineSegment,
    setSelectedLongLineSegmentId,
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

  const updateSelectedBpmEvent = (patch: any) => {
    if (!selectedBpmEventId) {
      return;
    }

    if (selectedBpmEventId === BASE_BPM_LINE_ID) {
      if (typeof patch.bpm !== "undefined") {
        const nextBpm = normalizeBaseBpmForWrite(patch.bpm, metadata.bpm);
        if (nextBpm === null) {
          setStatusMessage("基础 BPM 必须大于 0。");
          return;
        }
        if (isLastBeatOrderedBpmNegative(nextBpm, bpmEvents)) {
          setStatusMessage("已阻止：按 Beat 顺序最后一个 BPM 不能为负数。");
          return;
        }
        setMetadata((current: any) => ({ ...current, bpm: nextBpm }));
      }
      return;
    }

    setBpmEvents((previous: any[]) => {
      const current = previous.find((event) => event.id === selectedBpmEventId);
      if (!current) {
        return previous;
      }

      const nextBeat =
        typeof patch.beat === "undefined"
          ? current.beat
          : Math.max(0, Number(toFinite(patch.beat, current.beat).toFixed(6)));
      if (typeof patch.beat !== "undefined" && approxEq(nextBeat, 0)) {
        setStatusMessage("非基础 BPM 的 Beat 必须大于 0。");
        return previous;
      }
      const nextBpmCandidate =
        typeof patch.bpm === "undefined" ? current.bpm : normalizeEventBpmForWrite(patch.bpm, current.bpm);
      if (typeof patch.bpm !== "undefined" && nextBpmCandidate === null) {
        setStatusMessage("非基础 BPM 不能为 0。");
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
        setStatusMessage("已阻止：按 Beat 顺序最后一个 BPM 不能为负数。");
        return previous;
      }
      return sortBpmEvents(nextEvents);
    });
  };

  const updateActiveBeat = (raw: unknown) => {
    const nextBeat = Math.max(0, Number(toFinite(raw, activeBeatValue).toFixed(6)));
    if (hasBeatEditableSelection) {
      applySelectedOffset(0, nextBeat - minSelectedBeat, "已更新选中对象 Beat。", {
        quantizeBeatDelta: false,
      });
      return;
    }

    if (isEditingPlacedBpm && selectedBpmEvent) {
      if (isBaseBpmSelected) {
        return;
      }
      updateSelectedBpmEvent({ beat: nextBeat });
      setSelectedBpmEventId(selectedBpmEvent.id);
      return;
    }

    if (isEditingPlacedSv && selectedSvEvent) {
      setSvEvents((previous: any[]) => {
        const selectedTimingGroup = normalizeTimingGroup(selectedSvEvent.timingGroup, "#Global");
        const filtered = previous.filter((event) =>
          event.id === selectedSvEvent.id ||
          !(
            normalizeTimingGroup(event.timingGroup, "#Global") === selectedTimingGroup &&
            approxEq(event.beat, nextBeat)
          ),
        );
        return sortSvEvents(filtered.map((event) =>
          event.id === selectedSvEvent.id ? { ...event, beat: nextBeat } : event,
        ));
      });
      setSelectedSvEventId(selectedSvEvent.id);
    }
  };

  const updateActiveLane = (raw: unknown) => {
    const nextLane = Number(toFinite(raw, activeLaneValue).toFixed(6));
    if (hasNoteSelection) {
      applySelectedOffset(nextLane - minSelectedLane, 0, "已更新选中音符轨道。");
      return;
    }
    setToolLane(nextLane);
    setUseToolLaneOverride(true);
  };

  const updateActiveBpm = (raw: unknown) => {
    const nextBpm = normalizeEditorBpm(raw, activeBpmValue);
    if (isEditingPlacedBpm && selectedBpmEvent) {
      if (isBaseBpmSelected) {
        const allowedBaseBpm = normalizeBaseBpmForWrite(nextBpm, selectedBpmEvent.bpm);
        if (allowedBaseBpm === null) {
          setStatusMessage("基础 BPM 必须大于 0。");
          return false;
        }
        updateSelectedBpmEvent({ bpm: allowedBaseBpm });
        return true;
      }

      const allowedEventBpm = normalizeEventBpmForWrite(nextBpm, selectedBpmEvent.bpm);
      if (allowedEventBpm === null) {
        setStatusMessage("非基础 BPM 不能为 0。");
        return false;
      }
      updateSelectedBpmEvent({ bpm: allowedEventBpm });
      return true;
    }
    setToolBpmValue(nextBpm);
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
          `已更新选中 DirectionalFlick 宽度为 ${nextWidth}。`,
        );
        return;
      }

      setToolDirectionalWidth(nextWidth);
      setStatusMessage(`已设置 DirectionalFlick 默认宽度为 ${nextWidth}。`);
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
          `已更新选中音符宽度为 ${nextWidth}。`,
        );
        return;
      }

      setToolRhythmWidth(nextWidth);
      setStatusMessage(`已设置默认宽度为 ${nextWidth}。`);
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
        `已更新选中 DirectionalFlick 方向为${direction === "left" ? "左" : "右"}。`,
      );
      return;
    }

    setTool(nextType);
    setStatusMessage(`已设置 DirectionalFlick 默认方向为${direction === "left" ? "左" : "右"}。`);
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
    setSelectedSvEventId,
    setSvEvents,
    sortSvEvents,
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

  const deleteSelectedNotes = useCallback(() => {
    if (selectedNoteIds.length === 0) {
      return;
    }

    const { removedCount, hiddenCount } = deleteNotesWithSlideHiddenFallback(selectedNoteIds);
    clearSelectedNotes();

    if (removedCount > 0 && hiddenCount > 0) {
      setStatusMessage(`已删除 ${removedCount} 个音符，并将 ${hiddenCount} 个 Slide 节点设为 Hidden。`);
      return;
    }
    if (hiddenCount > 0) {
      setStatusMessage(
        hiddenCount > 1
          ? `已将 ${hiddenCount} 个 Slide 节点设为 Hidden。`
          : "已将选中 Slide 节点设为 Hidden。",
      );
      return;
    }

    setStatusMessage(removedCount > 1 ? `已删除 ${removedCount} 个选中音符。` : "已删除选中音符。");
  }, [clearSelectedNotes, deleteNotesWithSlideHiddenFallback, selectedNoteIds, setStatusMessage]);

  const deleteCurrentSelection = () => {
    if (selectedLongLineSegmentId) {
      const deleted = deleteSelectedLongLineSegment(selectedLongLineSegmentId);
      if (deleted) {
        setSelectedLongLineSegmentId(null);
        return;
      }
      setStatusMessage("选中的 longLine 已失效，请重新选择后重试。");
      return;
    }

    const noteIdsToDelete = selectedNoteIds;
    const bpmIdsToDelete = selectedBpmEventIds;
    const svIdsToDelete = selectedSvEventIds;
    let removedNoteCount = noteIdsToDelete.length;
    let hiddenNoteCount = 0;
    let removedBpmCount = bpmIdsToDelete.length;
    let removedSvCount = svIdsToDelete.length;

    if (removedNoteCount === 0 && removedBpmCount === 0 && removedSvCount === 0) {
      if (selectedBpmEventId && selectedBpmEventId !== BASE_BPM_LINE_ID) {
        setBpmEvents((previous: any[]) => previous.filter((event) => event.id !== selectedBpmEventId));
        setSelectedBpmEventId(null);
        setStatusMessage("已删除 BPM 线。");
      } else if (selectedBpmEventId === BASE_BPM_LINE_ID) {
        setStatusMessage("Beat 0 的基础 BPM 线不可删除。");
      } else if (selectedSvEventId) {
        setSvEvents((previous: any[]) => previous.filter((event) => event.id !== selectedSvEventId));
        setSelectedSvEventId(null);
        setStatusMessage("已删除 SV 线。");
      }
      return;
    }

    if (removedNoteCount > 0) {
      const noteDeleteResult = deleteNotesWithSlideHiddenFallback(noteIdsToDelete);
      removedNoteCount = noteDeleteResult.removedCount;
      hiddenNoteCount = noteDeleteResult.hiddenCount;
      setSelectedNoteIds([]);
    }

    if (removedBpmCount > 0) {
      const selectedBpmSet = new Set(bpmIdsToDelete);
      setBpmEvents((previous: any[]) => previous.filter((event) => !selectedBpmSet.has(event.id)));
      setSelectedBpmEventIds([]);
      if (selectedBpmEventId && selectedBpmSet.has(selectedBpmEventId)) {
        setSelectedBpmEventId(null);
      }
    }

    if (removedSvCount > 0) {
      const selectedSvSet = new Set(svIdsToDelete);
      setSvEvents((previous: any[]) => previous.filter((event) => !selectedSvSet.has(event.id)));
      setSelectedSvEventIds([]);
      if (selectedSvEventId && selectedSvSet.has(selectedSvEventId)) {
        setSelectedSvEventId(null);
      }
    }

    if (removedNoteCount > 0 && hiddenNoteCount > 0 && removedBpmCount > 0) {
      setStatusMessage(`已删除 ${removedNoteCount} 个音符、${removedBpmCount} 条 BPM 线，并将 ${hiddenNoteCount} 个 Slide 节点设为 Hidden。`);
      return;
    }
    if (removedNoteCount > 0 && removedBpmCount > 0) {
      setStatusMessage(`已删除 ${removedNoteCount} 个音符、${removedBpmCount} 条 BPM 线。`);
      return;
    }
    if (hiddenNoteCount > 0 && removedBpmCount > 0) {
      setStatusMessage(`已删除 ${removedBpmCount} 条 BPM 线，并将 ${hiddenNoteCount} 个 Slide 节点设为 Hidden。`);
      return;
    }
    if (removedNoteCount > 0 && hiddenNoteCount > 0) {
      setStatusMessage(`已删除 ${removedNoteCount} 个音符，并将 ${hiddenNoteCount} 个 Slide 节点设为 Hidden。`);
      return;
    }
    if (removedNoteCount > 0) {
      setStatusMessage(removedNoteCount > 1 ? `已删除 ${removedNoteCount} 个选中音符。` : "已删除选中音符。");
      return;
    }
    if (hiddenNoteCount > 0) {
      setStatusMessage(
        hiddenNoteCount > 1
          ? `已将 ${hiddenNoteCount} 个 Slide 节点设为 Hidden。`
          : "已将选中 Slide 节点设为 Hidden。",
      );
      return;
    }
    if (removedBpmCount > 0) {
      setStatusMessage(removedBpmCount > 1 ? `已删除 ${removedBpmCount} 条 BPM 线。` : "已删除 BPM 线。");
      return;
    }
    if (removedSvCount > 0) {
      setStatusMessage(removedSvCount > 1 ? `已删除 ${removedSvCount} 条 SV 线。` : "已删除 SV 线。");
    }
  };

  const deleteNote = (noteId: string) => {
    deleteNotesWithSlideHiddenFallback([noteId]);
    setSelectedNoteIds((previous: string[]) => previous.filter((id) => id !== noteId));
  };

  return {
    applySettingsPatch,
    stepActiveLane,
    stepActiveWidth,
    setActiveDirectionalType,
    commitBeatInput,
    commitBpmInput,
    commitLaneInput,
    commitWidthInput,
    deleteSelectedNotes,
    deleteCurrentSelection,
    deleteNote,
  };
}
