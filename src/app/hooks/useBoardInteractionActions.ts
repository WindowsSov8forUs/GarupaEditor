import { startTransition, useCallback, type MouseEvent } from "react";
import {
  GLOBAL_TIMING_GROUP_ID,
  normalizeNoteTimingGroup,
  normalizeTimingGroup,
  type ChartNote,
  type EditorTool,
  type NoteType,
} from "../../chartCore";
import { isLastBeatOrderedBpmNegative } from "../editorHelpers";
import { applyHabahiroSlideWidthToNoteIds } from "../habahiroSlideWidth";
import { canUseHabahiro, canUseSpRhythm, canUseSv, normalizeSlideBuildForMode } from "../modeChartRegression";
import { cleanupSlideChainsHidden } from "../slideChainCleanup";

export function useBoardInteractionActions(params: any) {
  const {
    getSidebarResizeBounds,
    sidebarResizeRef,
    sidebarWidth,
    clamp,
    setTool,
    setIsToolArmed,
    clearAllSelections,
    setStatusMessage,
    NOTE_SPECS,
    useToolLaneOverride,
    quantizeBeat,
    beatDivision,
    toFinite,
    toolLane,
    toolDurationBeats,
    beatStep,
    createId,
    isDirectionalNoteType,
    normalizeDirectionalWidth,
    isRhythmWidthEditableType,
    normalizeRhythmWidth,
    modeOptions,
    toolDirectionalWidth,
    toolRhythmWidth,
    normalizeNote,
    settings,
    setNotes,
    approxEq,
    sortNotes,
    setToolLane,
    setUseToolLaneOverride,
    setSingleSelectedNote,
    clearSelectedBpmEvents,
    setSelectedBpmEventId,
    tool,
    noteById,
    slideBuildRef,
    setSlideBuildState,
    setSlideBuildCursor,
    setCursorPreview,
    committedSlideRoleByNoteId,
    committedSlideChainById,
    suppressNextBoardClickRef,
    suppressNextNoteClickRef,
    removeNoteIdsFromSlideChains,
    setSlideChains,
    normalizeBpmEvent,
    normalizeSvEvent,
    normalizeBaseBpmForWrite,
    normalizeEventBpmForWrite,
    toolBpmValue,
    metadata,
    setMetadata,
    setBpmEvents,
    setSvEvents,
    bpmEvents,
    BASE_BPM_LINE_ID,
    setSelectedBpmEventIds,
    setSelectedSvEventIds,
    setSelectedSvEventId,
    toolSvValue,
    toolTimingGroup,
    selectedNoteIds,
    selectedBpmEventIds,
    selectedBpmEventId,
    selectedSvEventIds,
    selectedSvEventId,
    selectedLongLineSegmentId,
    playfieldBoardRef,
    selectionMoveRef,
    cursorPreview,
    findNoteAtBoardPoint,
    resolveBoardPlacement,
    isPlacementBlocked,
    selectionDragRef,
    isToolArmed,
    setSelectionDrag,
    selectedNoteIdSet,
    notes,
    setSelectionMovePreview,
    clearSelectedNotes,
    selectedNotes,
    commitSelectedNoteTransform,
    toolLaneShift,
    isPasteToolReady,
    isPasteLaneAnchorEnabled,
    applyPasteAtPlacement,
    isSvPreviewEnabled,
    exGarupaEnabled,
  } = params;
  const startSidebarResize = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const { minWidth, maxWidth } = getSidebarResizeBounds();
    sidebarResizeRef.current = {
      startX: event.clientX,
      startWidth: Math.round(clamp(sidebarWidth, minWidth, maxWidth)),
    };
    document.body.classList.add("is-resizing-layout");
  };
  const scheduleAfterFrame = useCallback((task: () => void) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => task());
      return;
    }
    setTimeout(task, 0);
  }, []);

  const switchToolState = useCallback((nextTool: EditorTool) => {
    const hasAnySelection =
      selectedNoteIds.length > 0 ||
      selectedBpmEventIds.length > 0 ||
      selectedBpmEventId !== null ||
      selectedLongLineSegmentId !== null;
    const toolChanged = tool !== nextTool || !isToolArmed;
    if (!toolChanged && !hasAnySelection) {
      return;
    }

    if (tool !== nextTool) {
      setTool(nextTool);
    }
    if (!isToolArmed) {
      setIsToolArmed(true);
    }

    const shouldClear = hasAnySelection;
    if (!shouldClear) {
      return;
    }
    scheduleAfterFrame(() => {
      startTransition(() => {
        if (shouldClear) {
          clearAllSelections();
        }
      });
    });
  }, [
    clearAllSelections,
    isToolArmed,
    scheduleAfterFrame,
    selectedBpmEventId,
    selectedBpmEventIds.length,
    selectedLongLineSegmentId,
    selectedNoteIds.length,
    setIsToolArmed,
    setTool,
    tool,
  ]);

  const applyToolFromPalette = useCallback((nextType: NoteType) => {
    if (isDirectionalNoteType(nextType) && !canUseSpRhythm(modeOptions)) {
      setStatusMessage("SP rhythm mode is off; Directional Flick is unavailable.");
      return;
    }
    switchToolState(nextType);
  }, [isDirectionalNoteType, modeOptions, setStatusMessage, switchToolState]);

  const applyBpmToolFromPalette = useCallback(() => {
    switchToolState("bpm");
  }, [switchToolState]);

  const applySvToolFromPalette = useCallback(() => {
    if (!canUseSv(modeOptions)) {
      setStatusMessage("ExGarupa is off; SV is unavailable.");
      return;
    }
    switchToolState("sv");
  }, [modeOptions, setStatusMessage, switchToolState]);

  const applyCopyToolFromPalette = useCallback(() => {
    switchToolState("copy");
  }, [switchToolState]);

  const applyPasteToolFromPalette = useCallback(() => {
    switchToolState("paste");
  }, [switchToolState]);

  const placeNoteWithType = (
    noteTool: NoteType,
    lane: number,
    beat: number,
    options?: { silent?: boolean; preserveToolLaneOverride?: boolean; selectPlaced?: boolean },
  ): ChartNote | null => {
    const useLaneOverride = noteTool !== "slide" && useToolLaneOverride;
    const quantizedBeat = quantizeBeat(beat, beatDivision);
    const resolvedLane = Number(toFinite(useLaneOverride ? toolLane : lane, lane).toFixed(6));
    const duration = Math.max(beatStep, quantizeBeat(toolDurationBeats, beatDivision));

    const draft: ChartNote = {
      id: createId(),
      type: noteTool,
      lane: resolvedLane,
      beat: quantizedBeat,
      timingGroup: normalizeNoteTimingGroup(toolTimingGroup),
      ...(NOTE_SPECS[noteTool].hasTail
        ? {
          endBeat: quantizeBeat(quantizedBeat + duration, beatDivision),
          endLane: resolvedLane + toolLaneShift,
        }
        : {}),
      ...(isDirectionalNoteType(noteTool)
        ? {
          width: normalizeDirectionalWidth(toolDirectionalWidth),
        }
        : (
          canUseHabahiro(modeOptions) && isRhythmWidthEditableType(noteTool)
            ? {
              width: normalizeRhythmWidth(toolRhythmWidth),
            }
            : {}
        )
      ),
    };

    const normalized = normalizeNote(draft, settings);
    if (!normalized) {
      return null;
    }

    setNotes((previous: ChartNote[]) => {
      const filtered = previous.filter(
        (note) =>
          note.type === "hidden" ||
          !(note.lane === normalized.lane && approxEq(note.beat, normalized.beat)),
      );
      return sortNotes([...filtered, normalized]);
    });

    if (!(options?.preserveToolLaneOverride ?? false)) {
      setToolLane(normalized.lane);
      setUseToolLaneOverride(false);
    }
    if (options?.selectPlaced ?? false) {
      setSingleSelectedNote(normalized.id);
      clearSelectedBpmEvents();
      setSelectedBpmEventId(null);
    }
    if (!(options?.silent ?? false)) {
      setStatusMessage("状态已更新。");
    }
    return normalized;
  };

  const placeNote = (lane: number, beat: number) => {
    if (tool === "bpm" || tool === "sv" || tool === "copy" || tool === "paste") {
      return null;
    }
    return placeNoteWithType(tool, lane, beat);
  };

  const beginSlideBuild = useCallback(
    (
      headNoteId: string,
      createdHeadId: string | null = null,
      options?: {
        persistUntilRightClick?: boolean;
        mode?: "drag" | "append";
        initialNoteIds?: string[];
      },
    ) => {
      const persistUntilRightClick = options?.persistUntilRightClick ?? false;
      const mode = options?.mode ?? "drag";
      const seedNoteIds = Array.isArray(options?.initialNoteIds) && options.initialNoteIds.length > 0
        ? options.initialNoteIds
        : [headNoteId];
      const dedupedNoteIds = Array.from(
        new Set(
          seedNoteIds.filter((id) => noteById.has(id)),
        ),
      );
      if (!dedupedNoteIds.includes(headNoteId)) {
        dedupedNoteIds.push(headNoteId);
      }
      const next = {
        noteIds: dedupedNoteIds,
        createdHeadId,
        mode,
        persistUntilRightClick,
      };
      slideBuildRef.current = next;
      setSlideBuildState(next);
      setSlideBuildCursor(null);
      clearAllSelections();
      setCursorPreview(null);
      setStatusMessage("状态已更新。");
    },
    [clearAllSelections, noteById, setCursorPreview, setSlideBuildCursor, setSlideBuildState, setStatusMessage, slideBuildRef],
  );

  const setSlideBuildMode = useCallback((mode: "drag" | "append") => {
    setSlideBuildState((previous: any) => {
      if (!previous || previous.mode === mode) {
        slideBuildRef.current = previous;
        return previous;
      }
      const next = {
        ...previous,
        mode,
      };
      slideBuildRef.current = next;
      return next;
    });
  }, [setSlideBuildState, slideBuildRef]);

  const replaceCommittedSlideChainSegments = useCallback(
    (chain: any, segments: any[]) => {
      setSlideChains((previous: any[]) => {
        const replacementChains = cleanupSlideChainsHidden({
          chains: segments,
          noteMap: noteById,
          minLength: 2,
        });
        return previous.flatMap((currentChain) =>
          currentChain.id === chain.id ? replacementChains : [currentChain],
        );
      });
    },
    [noteById, setSlideChains],
  );

  const startSlideBuildFromSeedNote = useCallback((seedNote: ChartNote) => {
    const committedRole = committedSlideRoleByNoteId.get(seedNote.id);
    if (committedRole && committedRole.index > 0 && committedRole.index < committedRole.length - 1) {
      const chain = committedSlideChainById.get(committedRole.chainId);
      if (chain && chain.noteIds.length > 0) {
        const prefixIds = chain.noteIds.slice(0, committedRole.index + 1);
        const suffixIds = chain.noteIds.slice(committedRole.index + 1);
        replaceCommittedSlideChainSegments(chain, [
          {
            ...chain,
            noteIds: prefixIds,
          },
          {
            ...chain,
            id: createId(),
            noteIds: suffixIds,
          },
        ]);
        beginSlideBuild(seedNote.id, null, {
          persistUntilRightClick: false,
          mode: "drag",
          initialNoteIds: prefixIds,
        });
        setStatusMessage("状态已更新。");
        return;
      }
    }
    if (committedRole && committedRole.index === committedRole.length - 1) {
      const chain = committedSlideChainById.get(committedRole.chainId);
      if (chain && chain.noteIds.length > 0) {
        beginSlideBuild(seedNote.id, null, {
          persistUntilRightClick: false,
          mode: "drag",
          initialNoteIds: chain.noteIds,
        });
        setStatusMessage("状态已更新。");
        return;
      }
    }
    beginSlideBuild(seedNote.id, null, { persistUntilRightClick: false, mode: "drag" });
  }, [beginSlideBuild, committedSlideChainById, committedSlideRoleByNoteId, createId, replaceCommittedSlideChainSegments, setStatusMessage]);

  const appendSlideBuildNote = useCallback((noteId: string): { appended: boolean; merged: boolean; blocked: boolean } => {
    const previous = slideBuildRef.current;
    if (!previous) {
      return { appended: false, merged: false, blocked: false };
    }
    if (previous.noteIds[previous.noteIds.length - 1] === noteId) {
      return { appended: false, merged: false, blocked: false };
    }
    if (previous.noteIds.includes(noteId)) {
      return { appended: false, merged: false, blocked: false };
    }

    const existingRole = committedSlideRoleByNoteId.get(noteId);
    let nextIds = [...previous.noteIds];
    let merged = false;
    let blocked = false;

    if (existingRole) {
      const existingChain = committedSlideChainById.get(existingRole.chainId);
      if (existingChain && existingRole.index === 0) {
        for (const id of existingChain.noteIds) {
          if (!nextIds.includes(id)) {
            nextIds.push(id);
          }
        }
        merged = true;
      } else if (existingChain) {
        const beforeIds = existingChain.noteIds.slice(0, existingRole.index);
        const suffixIds = existingChain.noteIds.slice(existingRole.index);
        replaceCommittedSlideChainSegments(existingChain, [
          {
            ...existingChain,
            id: createId(),
            noteIds: beforeIds,
          },
          {
            ...existingChain,
            noteIds: suffixIds,
          },
        ]);
        for (const id of suffixIds) {
          if (!nextIds.includes(id)) {
            nextIds.push(id);
          }
        }
        merged = true;
      }
    } else {
      nextIds.push(noteId);
    }

    if (blocked) {
      return { appended: false, merged: false, blocked: true };
    }
    if (
      nextIds.length === previous.noteIds.length &&
      nextIds.every((id, index) => id === previous.noteIds[index])
    ) {
      return { appended: false, merged, blocked: false };
    }

    const next = {
      ...previous,
      noteIds: nextIds,
    };
    slideBuildRef.current = next;
    setSlideBuildState(next);
    if (canUseHabahiro(modeOptions)) {
      setNotes((currentNotes: ChartNote[]) => applyHabahiroSlideWidthToNoteIds(currentNotes, nextIds));
    }
    return { appended: true, merged, blocked: false };
  }, [
    committedSlideChainById,
    committedSlideRoleByNoteId,
    createId,
    modeOptions,
    replaceCommittedSlideChainSegments,
    setNotes,
    setSlideBuildState,
    slideBuildRef,
  ]);

  const cancelSlideBuild = useCallback(
    (message = "已取消 Slide 创建。") => {
      const current = slideBuildRef.current;
      if (!current) {
        return;
      }
      slideBuildRef.current = null;
      setSlideBuildState(null);
      setSlideBuildCursor(null);
      suppressNextBoardClickRef.current = true;
      suppressNextNoteClickRef.current = true;
      if (current.createdHeadId) {
        setNotes((previous: ChartNote[]) => previous.filter((note) => note.id !== current.createdHeadId));
        removeNoteIdsFromSlideChains([current.createdHeadId]);
      }
      clearAllSelections();
      setIsToolArmed(false);
      setStatusMessage(message);
    },
    [clearAllSelections, removeNoteIdsFromSlideChains, setIsToolArmed, setNotes, setSlideBuildCursor, setSlideBuildState, setStatusMessage, slideBuildRef, suppressNextBoardClickRef, suppressNextNoteClickRef],
  );

  const finalizeSlideBuild = useCallback((options?: { disarmTool?: boolean; statusMessage?: string }) => {
    const current = slideBuildRef.current;
    if (!current) {
      return;
    }
    slideBuildRef.current = null;
    setSlideBuildState(null);
    setSlideBuildCursor(null);
    suppressNextBoardClickRef.current = true;
    suppressNextNoteClickRef.current = true;

    const noteIds = Array.from(new Set(current.noteIds)) as string[];
    if (noteIds.length === 0) {
      setStatusMessage("状态已更新。");
      return;
    }

    const resolveChainTimingGroup = (): string => {
      const placementTimingGroup = normalizeTimingGroup(toolTimingGroup, GLOBAL_TIMING_GROUP_ID);
      if (placementTimingGroup !== GLOBAL_TIMING_GROUP_ID) {
        return placementTimingGroup;
      }
      for (const noteId of noteIds) {
        const committedRole = committedSlideRoleByNoteId.get(noteId);
        if (committedRole) {
          const committedChain = committedSlideChainById.get(committedRole.chainId);
          if (committedChain) {
            return normalizeTimingGroup(committedChain.timingGroup, GLOBAL_TIMING_GROUP_ID);
          }
        }
        const note = noteById.get(noteId);
        if (note) {
          return normalizeTimingGroup(note.timingGroup, GLOBAL_TIMING_GROUP_ID);
        }
      }
      return GLOBAL_TIMING_GROUP_ID;
    };
    const nextChainTimingGroup = resolveChainTimingGroup();

    const noteIdSet = new Set(noteIds);
    const buildNextChains = (previous: any[], normalizedChain: any | null) => {
      const cleaned = previous
        .map((chain) => ({
          ...chain,
          noteIds: chain.noteIds.filter((id: string) => !noteIdSet.has(id)),
        }))
        .filter((chain) => chain.noteIds.length > 0);
      return normalizedChain ? [...cleaned, normalizedChain] : cleaned;
    };

    const rawChain = {
      id: createId(),
      noteIds,
      timingGroup: normalizeNoteTimingGroup(nextChainTimingGroup),
    };
    const normalizedBuild = normalizeSlideBuildForMode(
      notes,
      rawChain,
      exGarupaEnabled,
    );
    const normalizedNoteById = new Map(normalizedBuild.notes.map((note) => [note.id, note] as const));
    const normalizedNoteIds = normalizedBuild.chain?.noteIds ?? [];

    const applyNextNotes = (previous: ChartNote[]) => {
      const nextNotes = sortNotes(
        previous.map((note) => normalizedNoteById.get(note.id) ?? note),
      );
      return canUseHabahiro(modeOptions)
        ? applyHabahiroSlideWidthToNoteIds(nextNotes, normalizedNoteIds)
        : nextNotes;
    };

    setSlideChains((previous: any[]) => {
      return buildNextChains(previous, normalizedBuild.chain);
    });
    setNotes((previous: ChartNote[]) => {
      return applyNextNotes(previous);
    });

    const selectionNoteIds = normalizedNoteIds.length > 0 ? normalizedNoteIds : noteIds;
    const tailId = [...selectionNoteIds]
      .reverse()
      .find((id) => (normalizedNoteById.get(id) ?? noteById.get(id))?.type !== "hidden")
      ?? (selectionNoteIds[selectionNoteIds.length - 1] ?? selectionNoteIds[0]);
    setSingleSelectedNote(tailId);
    clearSelectedBpmEvents();
    setSelectedBpmEventId(null);
    setStatusMessage("状态已更新。");
    if (options?.disarmTool) {
      setIsToolArmed(false);
    }
  }, [
    clearSelectedBpmEvents,
    committedSlideChainById,
    committedSlideRoleByNoteId,
    createId,
    modeOptions,
    exGarupaEnabled,
    noteById,
    notes,
    setIsToolArmed,
    setNotes,
    setSelectedBpmEventId,
    setSingleSelectedNote,
    setSlideBuildCursor,
    setSlideBuildState,
    setSlideChains,
    setStatusMessage,
    slideBuildRef,
    sortNotes,
    suppressNextBoardClickRef,
    suppressNextNoteClickRef,
    toolTimingGroup,
    toFinite,
  ]);

  const placeBpmEvent = (beat: number) => {
    const quantizedBeat = quantizeBeat(beat, beatDivision);

    if (approxEq(quantizedBeat, 0)) {
      const bpm = normalizeBaseBpmForWrite(toolBpmValue, metadata.bpm);
      if (bpm === null) {
        setStatusMessage("基础 BPM 必须大于 0。");
        return;
      }
      if (isLastBeatOrderedBpmNegative(bpm, bpmEvents)) {
        setStatusMessage("已阻止：按 Beat 顺序最后一个 BPM 不能为负数。");
        return;
      }
      setMetadata((current: any) => ({ ...current, bpm }));
      setBpmEvents((previous: any[]) => previous.filter((event) => !approxEq(event.beat, 0)));
      setSelectedBpmEventId(BASE_BPM_LINE_ID);
      clearSelectedNotes();
      clearSelectedBpmEvents();
      setStatusMessage("状态已更新。");
      return;
    }

    const bpm = normalizeEventBpmForWrite(toolBpmValue, metadata.bpm);
    if (bpm === null) {
      setStatusMessage("非基础 BPM 不能为 0。");
      return;
    }
    const nextEvents = [
      ...bpmEvents.filter((event: any) => !approxEq(event.beat, quantizedBeat)),
      { beat: quantizedBeat, bpm },
    ];
    if (isLastBeatOrderedBpmNegative(metadata.bpm, nextEvents)) {
      setStatusMessage("已阻止：按 Beat 顺序最后一个 BPM 不能为负数。");
      return;
    }

    const created = normalizeBpmEvent({ beat: quantizedBeat, bpm }, beatDivision, metadata.bpm);
    if (!created) {
      return;
    }

    setBpmEvents((previous: any[]) => {
      const filtered = previous.filter((event) => !approxEq(event.beat, created.beat));
      return params.sortBpmEvents([...filtered, created]);
    });
    setSelectedBpmEventId(created.id);
    clearSelectedNotes();
    setSelectedBpmEventIds([created.id]);
    setStatusMessage("状态已更新。");
  };

  const placeSvEvent = (beat: number) => {
    const quantizedBeat = quantizeBeat(beat, beatDivision);
    const timingGroup = normalizeTimingGroup(toolTimingGroup, GLOBAL_TIMING_GROUP_ID);
    const value = Number(toFinite(toolSvValue, 1).toFixed(6));
    if (!Number.isFinite(value)) {
      setStatusMessage("SV 值必须为有限数字。");
      return;
    }
    const created = normalizeSvEvent({ beat: quantizedBeat, value, timingGroup }, beatDivision, 1);
    if (!created) {
      return;
    }
    setSvEvents((previous: any[]) => {
      const filtered = previous.filter((event) =>
        !(normalizeTimingGroup(event.timingGroup, GLOBAL_TIMING_GROUP_ID) === timingGroup && approxEq(event.beat, created.beat)),
      );
      return params.sortSvEvents([...filtered, created]);
    });
    clearSelectedNotes();
    clearSelectedBpmEvents();
    setSelectedBpmEventId(null);
    setSelectedSvEventId(created.id);
    setSelectedSvEventIds([created.id]);
    setStatusMessage("状态已更新。");
  };

  const applyToolToPlacedNote = (target: ChartNote) => {
    if (!isToolArmed) {
      setToolLane(target.lane);
      setUseToolLaneOverride(false);
      setSingleSelectedNote(target.id);
      clearSelectedBpmEvents();
      setSelectedBpmEventId(null);
      setStatusMessage("状态已更新。");
      return;
    }

    if (tool === "bpm") {
      placeBpmEvent(target.beat);
      return;
    }

    if (tool === "sv") {
      if (!canUseSv(modeOptions)) {
        setStatusMessage("ExGarupa is off; SV is unavailable.");
        return;
      }
      placeSvEvent(target.beat);
      return;
    }

    if (tool === "copy" || tool === "paste") {
      return;
    }

    const nextType = isDirectionalNoteType(tool) && !canUseSpRhythm(modeOptions) ? "flick" : tool;
    const isBatchTarget = selectedNoteIds.length > 1 && selectedNoteIdSet.has(target.id);

    if (isBatchTarget) {
      if (isDirectionalNoteType(nextType) && selectedNotes.every((note: ChartNote) => note.type === nextType)) {
        const nextWidth = normalizeDirectionalWidth((target.width ?? 1) + 1);
        commitSelectedNoteTransform((note: ChartNote) => ({ ...note, width: nextWidth }), "状态已更新。");
        return;
      }

      commitSelectedNoteTransform((note: ChartNote) => {
        const replacementDraft: Partial<ChartNote> = {
          id: note.id,
          type: nextType,
          lane: note.lane,
          beat: note.beat,
          ...(isDirectionalNoteType(nextType)
            ? {
              width: isDirectionalNoteType(note.type)
                ? normalizeDirectionalWidth(note.width)
                : normalizeDirectionalWidth(toolDirectionalWidth),
            }
            : (
              canUseHabahiro(modeOptions) && isRhythmWidthEditableType(nextType)
                ? {
                  width: isRhythmWidthEditableType(note.type)
                    ? normalizeRhythmWidth(note.width)
                    : normalizeRhythmWidth(toolRhythmWidth),
                }
                : {}
            )),
          ...(NOTE_SPECS[nextType].hasTail
            ? {
              endBeat:
                  note.endBeat ??
                  quantizeBeat(note.beat + Math.max(beatStep, toolDurationBeats), beatDivision),
              endLane: note.endLane ?? note.lane + toolLaneShift,
            }
            : {}),
        };
        return normalizeNote(replacementDraft, settings);
      }, "状态已更新。");
      return;
    }

    if (isDirectionalNoteType(nextType) && target.type === nextType) {
      const nextWidth = normalizeDirectionalWidth((target.width ?? 1) + 1);
      setNotes((previous: ChartNote[]) =>
        sortNotes(
          previous.map((note) => {
            if (note.id !== target.id) {
              return note;
            }
            return normalizeNote({ ...note, width: nextWidth }, settings) ?? note;
          }),
        ),
      );
      setToolLane(target.lane);
      setUseToolLaneOverride(false);
      setSingleSelectedNote(target.id);
      clearSelectedBpmEvents();
      setSelectedBpmEventId(null);
      setStatusMessage("状态已更新。");
      return;
    }

    const replacementDraft: Partial<ChartNote> = {
      id: target.id,
      type: nextType,
      lane: target.lane,
      beat: target.beat,
      ...(isDirectionalNoteType(nextType)
        ? {
          width: isDirectionalNoteType(target.type)
            ? normalizeDirectionalWidth(target.width)
            : normalizeDirectionalWidth(toolDirectionalWidth),
        }
        : (
          canUseHabahiro(modeOptions) && isRhythmWidthEditableType(nextType)
            ? {
              width: isRhythmWidthEditableType(target.type)
                ? normalizeRhythmWidth(target.width)
                : normalizeRhythmWidth(toolRhythmWidth),
            }
            : {}
        )),
      ...(NOTE_SPECS[nextType].hasTail
        ? {
          endBeat:
              target.endBeat ??
              quantizeBeat(target.beat + Math.max(beatStep, toolDurationBeats), beatDivision),
          endLane: target.endLane ?? target.lane + toolLaneShift,
        }
        : {}),
    };

    const replacement = normalizeNote(replacementDraft, settings);
    if (!replacement) {
      return;
    }

    setNotes((previous: ChartNote[]) => {
      const filtered = previous.filter(
        (note) =>
          note.id !== target.id &&
          (
            note.type === "hidden" ||
            !(note.lane === replacement.lane && approxEq(note.beat, replacement.beat))
          ),
      );
      return sortNotes([...filtered, replacement]);
    });

    setToolLane(replacement.lane);
    setUseToolLaneOverride(false);
    setSingleSelectedNote(replacement.id);
    clearSelectedBpmEvents();
    setSelectedBpmEventId(null);
    setStatusMessage("状态已更新。");
  };

  const handleBoardContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const activeSlideBuild = slideBuildRef.current;
    if (activeSlideBuild) {
      event.preventDefault();
      if (activeSlideBuild.persistUntilRightClick) {
        finalizeSlideBuild({ disarmTool: true, statusMessage: "已完成 Slide 创建。" });
      } else {
        cancelSlideBuild("已取消 Slide 创建并取消 Slide 工具。");
      }
      return;
    }
    if (event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    const hadSelection =
      selectedNoteIds.length > 0 ||
      selectedBpmEventIds.length > 0 ||
      selectedBpmEventId !== null ||
      selectedSvEventIds.length > 0 ||
      selectedSvEventId !== null ||
      selectedLongLineSegmentId !== null;
    const hadToolArmed = isToolArmed;
    if (!hadSelection && !hadToolArmed) {
      return;
    }

    if (hadToolArmed) {
      setIsToolArmed(false);
    }

    scheduleAfterFrame(() => {
      startTransition(() => {
        if (hadSelection) {
          clearAllSelections();
        }
        setStatusMessage("状态已更新。");
      });
    });
  };

  const handleBoardMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const board = playfieldBoardRef.current;
    if (!board) {
      setCursorPreview(null);
      return;
    }

    const rect = board.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (selectionMoveRef.current) {
      if (cursorPreview !== null) {
        setCursorPreview(null);
      }
      return;
    }

    const activeSlideBuild = slideBuildRef.current;
    if (activeSlideBuild) {
      setSlideBuildCursor({ x, y });
      if (activeSlideBuild.mode === "drag" && (event.buttons & 1) === 1) {
        const hitNote = findNoteAtBoardPoint(x, y);
        if (hitNote) {
          appendSlideBuildNote(hitNote.id);
        }
      }

      if (activeSlideBuild.persistUntilRightClick && activeSlideBuild.mode === "append") {
        const placement = resolveBoardPlacement(x, y, { type: "single" });
        const canPreviewSnap =
          placement !== null &&
          !isPlacementBlocked(placement.lane, placement.beat, { type: "single" });
        setCursorPreview({
          x,
          y,
          snappedLane: canPreviewSnap && placement ? placement.lane : null,
          snappedBeat: canPreviewSnap && placement ? placement.beat : null,
        });
      } else if (cursorPreview !== null) {
        setCursorPreview(null);
      }
      return;
    }

    const activeSelection = selectionDragRef.current;
    if (activeSelection && (event.buttons & 1) === 1) {
      const moved =
        activeSelection.isDragging ||
        Math.hypot(x - activeSelection.startX, y - activeSelection.startY) >= 6;
      const nextSelection = {
        ...activeSelection,
        currentX: x,
        currentY: y,
        isDragging: moved,
      };
      selectionDragRef.current = nextSelection;
      setSelectionDrag(nextSelection);
      if (moved) {
        if (cursorPreview !== null) {
          setCursorPreview(null);
        }
        return;
      }
    }

    if (!isToolArmed) {
      if (cursorPreview !== null) {
        setCursorPreview(null);
      }
      return;
    }

    if (tool === "copy") {
      if (cursorPreview !== null) {
        setCursorPreview(null);
      }
      return;
    }

    if (tool === "paste") {
      if (!isPasteToolReady) {
        setCursorPreview({
          x,
          y,
          snappedLane: null,
          snappedBeat: null,
        });
        return;
      }
      const placement = resolveBoardPlacement(x, y, {
        ignoreLane: !isPasteLaneAnchorEnabled,
        type: "single",
      });
      setCursorPreview({
        x,
        y,
        snappedLane: placement && isPasteLaneAnchorEnabled ? placement.lane : null,
        snappedBeat: placement ? placement.beat : null,
      });
      return;
    }

    const isBpmTool = tool === "bpm";
    const placement = resolveBoardPlacement(x, y, { ignoreLane: isBpmTool });
    const canPreviewSnap = placement !== null && (isBpmTool || !isPlacementBlocked(placement.lane, placement.beat));

    setCursorPreview({
      x,
      y,
      snappedLane: canPreviewSnap && placement && !isBpmTool ? placement.lane : null,
      snappedBeat: canPreviewSnap && placement ? placement.beat : null,
    });
  };

  const handleBoardMouseLeave = () => {
    setCursorPreview(null);
    if (slideBuildRef.current) {
      setSlideBuildCursor(null);
    }
  };

  const handleBoardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isSvPreviewEnabled) {
      event.preventDefault();
      setStatusMessage("SV 预览为只读模式，请关闭后再编辑。");
      return;
    }
    if (suppressNextBoardClickRef.current) {
      suppressNextBoardClickRef.current = false;
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    if (!isToolArmed) {
      return;
    }

    if (tool === "copy") {
      return;
    }

    if (tool === "paste") {
      if (!isPasteToolReady) {
        setStatusMessage("暂无可粘贴内容，请先复制。");
        return;
      }
      const placement = resolveBoardPlacement(clickX, clickY, {
        ignoreLane: !isPasteLaneAnchorEnabled,
        type: "single",
      });
      if (!placement) {
        return;
      }
      applyPasteAtPlacement(placement);
      return;
    }

    const placement = resolveBoardPlacement(clickX, clickY, { ignoreLane: tool === "bpm" || tool === "sv" });
    if (!placement) {
      return;
    }

    if (tool === "bpm") {
      placeBpmEvent(placement.beat);
      return;
    }

    if (tool === "sv") {
      if (!canUseSv(modeOptions)) {
        setStatusMessage("ExGarupa is off; SV is unavailable.");
        return;
      }
      placeSvEvent(placement.beat);
      return;
    }

    if (tool === "slide") {
      return;
    }

    if (isPlacementBlocked(placement.lane, placement.beat)) {
      return;
    }

    placeNote(placement.lane, placement.beat);
  };

  const beginSelectedNotesMove = (event: MouseEvent<HTMLButtonElement>, noteId: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || !selectedNoteIdSet.has(noteId)) {
      return;
    }
    event.preventDefault();

    const board = playfieldBoardRef.current;
    if (!board) {
      return;
    }

    const rect = board.getBoundingClientRect();
    const anchor = notes.find((note: ChartNote) => note.id === noteId) ?? null;
    selectionMoveRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBoardY: event.clientY - rect.top,
      anchorNoteId: anchor?.id ?? null,
      anchorLane: anchor?.lane ?? null,
      anchorBeat: anchor?.beat ?? null,
      isDragging: false,
    };
    setSelectionMovePreview({
      laneDelta: 0,
      beatDelta: 0,
      isDragging: false,
    });
  };

  const handleBoardMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (isSvPreviewEnabled) {
      const targetElement = event.target as HTMLElement | null;
      if (!targetElement?.closest(".note-token, .bpm-line-button")) {
        event.preventDefault();
        setStatusMessage("SV 预览为只读模式，请关闭后再编辑。");
        return;
      }
    }
    if (event.button !== 0) {
      return;
    }

    const targetElement = event.target as HTMLElement | null;
    const isNoteTarget = Boolean(targetElement?.closest(".note-token"));
    const isBpmTarget = Boolean(targetElement?.closest(".bpm-line-button"));
    if (
      (isBpmTarget && !isToolArmed) ||
      (isNoteTarget && !(isToolArmed && tool === "slide"))
    ) {
      return;
    }

    const board = playfieldBoardRef.current;
    if (!board) {
      return;
    }

    const rect = board.getBoundingClientRect();
    const boardX = event.clientX - rect.left;
    const boardY = event.clientY - rect.top;

    if (isToolArmed && tool === "paste") {
      event.preventDefault();
      return;
    }

    if (isToolArmed && tool === "slide") {
      event.preventDefault();
      const activeSlideBuild = slideBuildRef.current;
      const hitNote = findNoteAtBoardPoint(boardX, boardY);
      if (activeSlideBuild) {
        if (activeSlideBuild.mode === "append") {
          if (hitNote) {
            const result = appendSlideBuildNote(hitNote.id);
            if (result.blocked) {
              setStatusMessage("状态已更新。");
              return;
            }
            if (result.appended) {
              setSlideBuildMode("drag");
              setStatusMessage("状态已更新。");
            }
            return;
          }

          const placement = resolveBoardPlacement(boardX, boardY, { type: "single" });
          if (!placement || isPlacementBlocked(placement.lane, placement.beat, { type: "single" })) {
            return;
          }
          const created = placeNoteWithType("single", placement.lane, placement.beat, {
            silent: true,
            selectPlaced: false,
            preserveToolLaneOverride: true,
          });
          if (!created) {
            return;
          }
          appendSlideBuildNote(created.id);
          setStatusMessage("状态已更新。");
          return;
        }

        if (hitNote) {
          appendSlideBuildNote(hitNote.id);
        }
        return;
      }

      if (hitNote) {
        startSlideBuildFromSeedNote(hitNote);
        return;
      }
      const placement = resolveBoardPlacement(boardX, boardY, { type: "single" });
      if (!placement || isPlacementBlocked(placement.lane, placement.beat, { type: "single" })) {
        return;
      }
      const created = placeNoteWithType("single", placement.lane, placement.beat, {
        silent: true,
        selectPlaced: false,
        preserveToolLaneOverride: true,
      });
      if (!created) {
        return;
      }
      beginSlideBuild(created.id, created.id, {
        persistUntilRightClick: true,
        mode: "drag",
      });
      return;
    }

    const nextSelection = {
      startX: boardX,
      startY: boardY,
      currentX: boardX,
      currentY: boardY,
      isDragging: false,
    };
    selectionDragRef.current = nextSelection;
    setSelectionDrag(nextSelection);
  };

  return {
    startSidebarResize,
    applyToolFromPalette,
    applyBpmToolFromPalette,
    applySvToolFromPalette,
    applyCopyToolFromPalette,
    applyPasteToolFromPalette,
    placeNoteWithType,
    placeNote,
    beginSlideBuild,
    setSlideBuildMode,
    startSlideBuildFromSeedNote,
    appendSlideBuildNote,
    cancelSlideBuild,
    finalizeSlideBuild,
    applyToolToPlacedNote,
    placeBpmEvent,
    placeSvEvent,
    handleBoardContextMenu,
    handleBoardMouseMove,
    handleBoardMouseLeave,
    handleBoardClick,
    beginSelectedNotesMove,
    handleBoardMouseDown,
  };
}








