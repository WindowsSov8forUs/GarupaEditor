import { startTransition, useCallback, useEffect, useRef, type MouseEvent } from "react";
import {
  GLOBAL_TIMING_GROUP_ID,
  laneForReplacement,
  normalizeNoteTimingGroup,
  noteLaneSpanStart,
  normalizeTimingGroup,
  type ChartNote,
  type EditorTool,
  type NoteType,
} from "../../chartCore";
import { isLastBeatOrderedBpmNegative } from "../editorHelpers";
import { applyHabahiroLongWidthToNoteIds } from "../habahiroLongWidth";
import { dropNoteIdsFromChains } from "../slideChainCleanup";
import { canUseHabahiro, canUseSpRhythm, canUseSv, normalizeSlideNodeForMode } from "../modeChartRegression";
import { connectSlideNodes } from "../slideConnect";

/** Length of the Long the Long tool places, in beats. */
const LONG_TOOL_LENGTH_BEATS = 0.5;

export function useBoardInteractionActions(params: any) {
  const {
    setTool,
    setIsToolArmed,
    clearSelection,
    showDialog,
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
    tool,
    noteById,
    slideBuildRef,
    setSlideBuildState,
    setSlideBuildCursor,
    setSlideConnectTarget,
    findNoteAtGridPoint,
    getNoteCenterAt: _getNoteCenterAt,
    deleteRightClickedNotes,
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
    toolSvValue,
    toolTimingGroup,
    toolSvTimingGroup,
    selectedNoteIds,
    playfieldBoardRef,
    selectionMoveRef,
    cursorPreview,
    findNoteAtBoardPoint: _findNoteAtBoardPoint,
    resolveBoardPlacement,
    findPlacementOverlaps,
    selectionDragRef,
    isToolArmed,
    setSelectionDrag,
    selectedNoteIdSet,
    notes,
    setSelectionMovePreview,
    selectedNotes,
    commitSelectedNoteTransform,
    toolLaneShift,
    isPasteToolReady,
    isPasteLaneAnchorEnabled,
    applyPasteAtPlacement,
    isSvPreviewEnabled,
    exGarupaEnabled,
    pressCurveToolOnNoteRef,
    multiSelectModeRef,
    selectedSegmentKeys,
  } = params;
  const scheduleAfterFrame = useCallback((task: () => void) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => task());
      return;
    }
    setTimeout(task, 0);
  }, []);

  const switchToolState = useCallback((nextTool: EditorTool) => {
    const hasAnySelection = selectedNoteIds.length > 0;
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
          clearSelection();
        }
      });
    });
  }, [
    clearSelection,
    isToolArmed,
    scheduleAfterFrame,
    selectedNoteIds.length,
    setIsToolArmed,
    setTool,
    tool,
  ]);

  const applyToolFromPalette = useCallback((nextType: NoteType) => {
    if (isDirectionalNoteType(nextType) && !canUseSpRhythm(modeOptions)) {
      showDialog("SP 音符模式关闭时不可使用 Directional Flick。");
      return;
    }
    switchToolState(nextType);
  }, [isDirectionalNoteType, modeOptions, showDialog, switchToolState]);

  const applyLongToolFromPalette = useCallback(() => {
    switchToolState("long");
  }, [switchToolState]);

  const applyMiddleToolFromPalette = useCallback(() => {
    switchToolState("middle");
  }, [switchToolState]);

  const applyCurveToolFromPalette = useCallback(() => {
    switchToolState("curve");
  }, [switchToolState]);

  const applyBpmToolFromPalette = useCallback(() => {
    switchToolState("bpm");
  }, [switchToolState]);

  const applySvToolFromPalette = useCallback(() => {
    if (!canUseSv(modeOptions)) {
      showDialog("ExGarupa 模式关闭时不可使用 SV。");
      return;
    }
    switchToolState("sv");
  }, [modeOptions, showDialog, switchToolState]);

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
    options?: { preserveToolLaneOverride?: boolean; selectPlaced?: boolean; oneLaneWide?: boolean },
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
          canUseHabahiro(settings) && isRhythmWidthEditableType(noteTool)
            ? {
              width: options?.oneLaneWide ? 1 : normalizeRhythmWidth(toolRhythmWidth),
            }
            : {}
        )
      ),
    };

    const normalized = normalizeNote(draft, settings);
    if (!normalized) {
      return null;
    }

    // A placement overwrites what it covers; an overwritten slide node leaves its chain.
    const overwrittenIds = new Set<string>(
      findPlacementOverlaps(normalized.lane, normalized.beat, {
        type: noteTool,
        ...(typeof normalized.width === "number"
          ? (isDirectionalNoteType(noteTool) ? { directionalWidth: normalized.width } : { rhythmWidth: normalized.width })
          : {}),
      }).map((note: ChartNote) => note.id),
    );
    setNotes((previous: ChartNote[]) =>
      sortNotes([...previous.filter((note) => !overwrittenIds.has(note.id)), normalized]));
    if (overwrittenIds.size > 0) {
      const remainingNotes = notes.filter((note: ChartNote) => !overwrittenIds.has(note.id));
      setSlideChains((previous: any[]) => dropNoteIdsFromChains(previous, overwrittenIds, remainingNotes));
    }

    if (!(options?.preserveToolLaneOverride ?? false)) {
      setToolLane(normalized.lane);
      setUseToolLaneOverride(false);
    }
    if (options?.selectPlaced ?? false) {
      setSingleSelectedNote(normalized.id);
    }
    return normalized;
  };

  const placeNote = (lane: number, beat: number) => {
    if (tool === "long" || tool === "middle" || tool === "curve" || tool === "bpm" || tool === "sv" || tool === "copy"
      || tool === "paste") {
      return null;
    }
    return placeNoteWithType(tool, lane, beat);
  };

  /** Long tool: a head and a tail on one lane, half a beat apart, chained as a Long. */
  const placeLongNote = (lane: number, beat: number) => {
    const headBeat = quantizeBeat(beat, beatDivision);
    const headLane = Number(toFinite(useToolLaneOverride ? toolLane : lane, lane).toFixed(6));
    const tailBeat = Number((headBeat + LONG_TOOL_LENGTH_BEATS).toFixed(6));
    const head = placeNoteWithType("single", headLane, headBeat);
    if (!head) {
      return;
    }
    const tail = placeNoteWithType("single", head.lane, tailBeat);
    if (!tail) {
      setNotes((previous: ChartNote[]) => previous.filter((note) => note.id !== head.id));
      return;
    }
    const noteIds = [head.id, tail.id];
    setSlideChains((previous: any[]) => [
      ...previous,
      { id: createId(), noteIds, timingGroup: head.timingGroup, long: true as const },
    ]);
    if (canUseHabahiro(settings)) {
      setNotes((previous: ChartNote[]) => applyHabahiroLongWidthToNoteIds(previous, noteIds));
    }
  };

  /**
   * Middle tool on blank board (ExGarupa): a lone middle node, chained as [hidden, single, hidden] on one beat and lane,
   * so it is a Slide's middle node with no connection line drawn.
   */
  /** The Middle tool on blank board (ExGarupa): [Hidden, Single, Hidden] on one beat and lane, one lane wide. */
  const placeLoneMiddleNode = (lane: number, beat: number) => {
    const node = placeNoteWithType("single", lane, beat, { oneLaneWide: true });
    if (!node) {
      return;
    }
    const hidden = (): ChartNote | null => normalizeNote({
      id: createId(), type: "hidden", lane: node.lane, beat: node.beat, width: 1, timingGroup: node.timingGroup,
    }, settings);
    const head = hidden(), tail = hidden();
    if (!head || !tail) {
      return;
    }
    setNotes((previous: ChartNote[]) => sortNotes([...previous, head, tail]));
    setSlideChains((previous: any[]) => [
      ...previous,
      { id: createId(), noteIds: [head.id, node.id, tail.id], timingGroup: node.timingGroup },
    ]);
  };

  /*
   * The Slide tool: every press is one connection. The first press picks a start (a note, or a Single placed on blank
   * board); every later press connects the start to the pressed note (or a Single placed there) and makes it the
   * start. A press dragged to another place and released there connects to that place too. Right-click, Esc or
   * another tool drops the start (and a start this tool placed but never connected). The start is the Slide build
   * state's only node; the board draws it highlighted, with a connection line following the pointer.
   */
  const setSlideStart = useCallback((noteId: string | null, createdHeadId: string | null = null) => {
    const next = noteId === null ? null : { noteIds: [noteId], createdHeadId, mode: "drag" as const, persistUntilRightClick: false };
    slideBuildRef.current = next;
    setSlideBuildState(next);
    setSlideConnectTarget(null);
    if (next === null) setSlideBuildCursor(null);
  }, [setSlideBuildCursor, setSlideBuildState, setSlideConnectTarget, slideBuildRef]);

  /** Drops the start, and the Single the tool placed for it if it was never connected. */
  const cancelSlideBuild = useCallback(() => {
    const current = slideBuildRef.current;
    if (!current) {
      return;
    }
    setSlideStart(null);
    suppressNextBoardClickRef.current = true;
    suppressNextNoteClickRef.current = true;
    if (current.createdHeadId) {
      setNotes((previous: ChartNote[]) => previous.filter((note) => note.id !== current.createdHeadId));
      removeNoteIdsFromSlideChains([current.createdHeadId]);
    }
  }, [removeNoteIdsFromSlideChains, setNotes, setSlideStart, slideBuildRef, suppressNextBoardClickRef, suppressNextNoteClickRef]);

  /** Connects the start to `target` ("the start's next node is `target`"); false when it cannot (not later in time,
   * or already its next node). */
  const connectSlideStartTo = useCallback((target: ChartNote): boolean => {
    const start = slideBuildRef.current;
    const from = start ? noteById.get(start.noteIds[0]) : undefined;
    if (!from || target.id === from.id || !(target.beat > from.beat + 1e-6)) {
      return false;
    }
    const timingGroup = normalizeNoteTimingGroup(exGarupaEnabled ? toolTimingGroup : GLOBAL_TIMING_GROUP_ID);
    const result = connectSlideNodes(Array.from(committedSlideChainById.values()) as any[], from.id, target.id,
      createId, timingGroup);
    if (!result) {
      return false;
    }
    const joined = result.chains.find((chain: any) => chain.id === result.joinedId)!;
    // Each node takes the type its place allows outside ExGarupa (a head is not a Flick, a middle node is a Single).
    const typeById = new Map<string, ChartNote>();
    joined.noteIds.forEach((id: string, index: number) => {
      const note = id === target.id ? target : noteById.get(id);
      if (!note) return;
      const role = index === 0 ? "head" : index === joined.noteIds.length - 1 ? "tail" : "middle";
      const normalized = normalizeSlideNodeForMode(note, role, exGarupaEnabled);
      if (normalized !== note) typeById.set(id, normalized);
    });
    const detached = new Set(result.detachedIds);
    setNotes((previous: ChartNote[]) => sortNotes(previous
      .filter((note) => !(detached.has(note.id) && note.type === "hidden"))
      .map((note) => typeById.get(note.id) ?? note)));
    setSlideChains(result.chains);
    setSlideStart(target.id);
    return true;
  }, [committedSlideChainById, createId, exGarupaEnabled, noteById, setNotes, setSlideChains, setSlideStart, slideBuildRef,
    sortNotes, toolTimingGroup]);

  /**
   * One press of the Hidden tool, which connects nothing: on a visible node of a Slide (not a Long's) it turns the node
   * Hidden in place, a Slide's head or tail only under ExGarupa; on a Hidden node it does nothing; on blank board, under
   * ExGarupa only, it places a Slide of two Hidden nodes on the lane pressed, half a beat long. (A press on a Slide's
   * line inserts a Hidden node there: see insertHiddenNodeOnConnection.)
   */
  const pressHiddenTool = (hit: ChartNote | null, boardX: number, boardY: number) => {
    if (hit) {
      if (hit.type === "hidden") return;
      const role = committedSlideRoleByNoteId.get(hit.id);
      if (!role || committedSlideChainById.get(role.chainId)?.long) return;
      const isEnd = role.index === 0 || role.index === role.length - 1;
      if (isEnd && !exGarupaEnabled) return;
      clearSelection();
      setNotes((previous: ChartNote[]) => previous.map((note) => note.id !== hit.id ? note
        : { id: note.id, type: "hidden" as const, lane: note.lane, beat: note.beat,
          width: typeof note.width === "number" && Number.isFinite(note.width) ? note.width : 1,
          ...(note.timingGroup === undefined ? {} : { timingGroup: note.timingGroup }) }));
      return;
    }
    if (!exGarupaEnabled) return;
    const placement = resolveBoardPlacement(boardX, boardY, { type: "single" });
    if (!placement) return;
    const beat = quantizeBeat(placement.beat, beatDivision);
    const node = (at: number): ChartNote | null => normalizeNote({ id: createId(), type: "hidden",
      lane: Number(toFinite(placement.lane, 0).toFixed(6)), beat: Number(at.toFixed(6)), width: 1,
      timingGroup: normalizeNoteTimingGroup(toolTimingGroup) }, settings);
    const head = node(beat), tail = node(beat + 0.5);
    if (!head || !tail) return;
    clearSelection();
    setNotes((previous: ChartNote[]) => sortNotes([...previous, head, tail]));
    setSlideChains((previous: any[]) => [...previous,
      { id: createId(), noteIds: [head.id, tail.id], timingGroup: head.timingGroup }]);
  };

  /** One press of the Slide tool (or the Hidden tool, see pressHiddenTool) on `hit` (a note) or else on blank board at
   * (boardX, boardY). */
  const pressSlideTool = useCallback((hit: ChartNote | null, boardX: number, boardY: number) => {
    if (tool === "hidden") {
      setCursorPreview(null);
      pressHiddenTool(hit, boardX, boardY);
      return;
    }
    clearSelection();
    setCursorPreview(null);
    const start = slideBuildRef.current;
    if (hit) {
      if (!start) setSlideStart(hit.id);
      else connectSlideStartTo(hit);
      return;
    }
    const placement = resolveBoardPlacement(boardX, boardY, { type: "single" });
    if (!placement) {
      return;
    }
    const from = start ? noteById.get(start.noteIds[0]) : undefined;
    if (from && !(placement.beat > from.beat + 1e-6)) {
      return;
    }
    const created = placeNoteWithType("single", placement.lane,
      placement.beat, {
      selectPlaced: false,
      preserveToolLaneOverride: true,
    });
    if (!created) {
      return;
    }
    if (!start) setSlideStart(created.id, created.id);
    else if (!connectSlideStartTo(created)) setNotes((previous: ChartNote[]) => previous.filter((note) => note.id !== created.id));
    // pressHiddenTool is a plain function of this render: the callback is renewed with what it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSelection, committedSlideChainById, committedSlideRoleByNoteId, connectSlideStartTo, exGarupaEnabled,
    noteById, placeNoteWithType, resolveBoardPlacement, setCursorPreview, setNotes, setSlideChains,
    setSlideStart, settings, slideBuildRef, tool, toolTimingGroup]);

  /** Where the last Slide or Hidden tool press was, to tell a release elsewhere (a drag) from a click. */
  const slidePressRef = useRef<{ clientX: number; clientY: number } | null>(null);

  /** A release of the Slide or Hidden tool's press: dragged away from the press, it connects the start to the release
   * point (a Hidden node is moved as a selected note, without a tool). */
  const releaseSlideConnection = useCallback((clientX: number, clientY: number) => {
    const press = slidePressRef.current;
    slidePressRef.current = null;
    const board = playfieldBoardRef.current;
    if (!press || !board || !slideBuildRef.current || Math.hypot(clientX - press.clientX, clientY - press.clientY) < 6) {
      return;
    }
    const rect = board.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    pressSlideTool(findNoteAtGridPoint(x, y), x, y);
  }, [findNoteAtGridPoint, playfieldBoardRef, pressSlideTool, slideBuildRef]);

  // Another tool, or no tool, drops the start.
  useEffect(() => {
    if (slideBuildRef.current && !(isToolArmed && tool === "slide")) cancelSlideBuild();
  }, [cancelSlideBuild, isToolArmed, slideBuildRef, tool]);

  // Esc drops the start; without one it puts the tool down.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector(".modal-transition-mask")) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (slideBuildRef.current) cancelSlideBuild();
      else if (isToolArmed) setIsToolArmed(false);
      // Without a tool it drops the selection (the way out of a multi-select).
      else if (selectedNoteIds.length > 0 || (selectedSegmentKeys?.length ?? 0) > 0) clearSelection();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelSlideBuild, clearSelection, isToolArmed, selectedNoteIds, selectedSegmentKeys, setIsToolArmed, slideBuildRef]);

  const placeBpmEvent = (beat: number) => {
    const quantizedBeat = quantizeBeat(beat, beatDivision);

    if (approxEq(quantizedBeat, 0)) {
      const bpm = normalizeBaseBpmForWrite(toolBpmValue, metadata.bpm);
      if (bpm === null) {
        return;
      }
      if (isLastBeatOrderedBpmNegative(bpm, bpmEvents)) {
        showDialog("谱面不合法：\n末尾 BPM 不可为负数", "error");
        return;
      }
      setMetadata((current: any) => ({ ...current, bpm }));
      setBpmEvents((previous: any[]) => previous.filter((event) => !approxEq(event.beat, 0)));
      clearSelection();
      return;
    }

    const bpm = normalizeEventBpmForWrite(toolBpmValue, metadata.bpm);
    if (bpm === null) {
      return;
    }
    const nextEvents = [
      ...bpmEvents.filter((event: any) => !approxEq(event.beat, quantizedBeat)),
      { beat: quantizedBeat, bpm },
    ];
    if (isLastBeatOrderedBpmNegative(metadata.bpm, nextEvents)) {
      showDialog("谱面不合法：\n末尾 BPM 不可为负数", "error");
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
    clearSelection();
  };

  const placeSvEvent = (beat: number) => {
    const quantizedBeat = quantizeBeat(beat, beatDivision);
    // The SV tool places into its own timing group (#0 unless chosen in its setting).
    const timingGroup = normalizeTimingGroup(toolSvTimingGroup, GLOBAL_TIMING_GROUP_ID);
    const value = Number(toFinite(toolSvValue, 1).toFixed(6));
    if (!Number.isFinite(value)) {
      showDialog("SV 值必须为有限数字。");
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
    clearSelection();
  };

  /**
   * Where a Long's tail goes when a tool turns it into `nextType` (`width` wide): a Directional tail's root on the head's
   * centre lane (garupaLongCenterLane), any other tail on the head's lanes, so the Long keeps its shape. Null for a
   * note that is no Long's tail.
   */
  const longTailPlacement = (target: ChartNote, nextType: NoteType, width: number | undefined)
    : { lane: number; width?: number } | null => {
    const role = committedSlideRoleByNoteId.get(target.id);
    const chain = role ? committedSlideChainById.get(role.chainId) : undefined;
    const head = chain?.long === true && role!.index === 1 ? noteById.get(chain.noteIds[0]) : undefined;
    if (!head) return null;
    const habahiro = canUseHabahiro(settings);
    const headWidth = habahiro ? normalizeRhythmWidth(head.width) : 1;
    if (isDirectionalNoteType(nextType)) {
      const first = noteLaneSpanStart(head.type, head.lane, headWidth);
      return { lane: Number((first + Math.floor((headWidth - 1) / 2)).toFixed(6)), ...(width === undefined ? {} : { width }) };
    }
    return { lane: head.lane, ...(habahiro ? { width: headWidth } : {}) };
  };

  const applyToolToPlacedNote = (target: ChartNote) => {
    if (!isToolArmed) {
      setToolLane(target.lane);
      setUseToolLaneOverride(false);
      setSingleSelectedNote(target.id);
      return;
    }

    if (tool === "bpm") {
      placeBpmEvent(target.beat);
      return;
    }

    if (tool === "sv") {
      if (!canUseSv(modeOptions)) {
        showDialog("ExGarupa 模式关闭时不可使用 SV。");
        return;
      }
      placeSvEvent(target.beat);
      return;
    }

    if (tool === "long") {
      placeLongNote(target.lane, target.beat);
      return;
    }

    // The Middle tool turns a pressed Hidden node into a Single in place (without ExGarupa on a whole lane) and leaves
    // other notes alone; the curve tool works on Slide segments (see the board's press).
    if (tool === "middle") {
      if (target.type !== "hidden") return;
      const habahiro = canUseHabahiro(settings);
      const half = (habahiro ? normalizeRhythmWidth(target.width) - 1 : 0) / 2;
      const replacement = normalizeNote({ ...target, type: "single",
        ...(habahiro ? {} : { width: undefined }),
        lane: exGarupaEnabled ? target.lane : Number((Math.round(target.lane - half) + half).toFixed(6)) }, settings);
      if (!replacement) return;
      setNotes((previous: ChartNote[]) => sortNotes(previous.map((note) => note.id === target.id ? replacement : note)));
      clearSelection();
      return;
    }
    if (tool === "curve") {
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
        commitSelectedNoteTransform((note: ChartNote) => ({ ...note, width: nextWidth }));
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
              canUseHabahiro(settings) && isRhythmWidthEditableType(nextType)
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
        return normalizeNote({ ...replacementDraft,
          lane: laneForReplacement(note, nextType, replacementDraft.width, canUseHabahiro(settings)),
          ...longTailPlacement(note, nextType, replacementDraft.width) }, settings);
      });
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
          canUseHabahiro(settings) && isRhythmWidthEditableType(nextType)
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

    const replacement = normalizeNote({ ...replacementDraft,
      lane: laneForReplacement(target, nextType, replacementDraft.width, canUseHabahiro(settings)),
      // A Long's tail lines up with its head, so the Long keeps its shape.
      ...longTailPlacement(target, nextType, replacementDraft.width) }, settings);
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
  };

  const handleBoardContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    // Right-click drops the Slide tool's start: the current connection, not the ones made.
    if (slideBuildRef.current) {
      event.preventDefault();
      cancelSlideBuild();
      return;
    }
    // The Hidden tool's right-click on a Hidden node's handle removes it from its Slide.
    if (isToolArmed && tool === "hidden" && playfieldBoardRef.current) {
      const rect = playfieldBoardRef.current.getBoundingClientRect();
      const node = findNoteAtGridPoint(event.clientX - rect.left, event.clientY - rect.top);
      if (node?.type === "hidden") {
        event.preventDefault();
        deleteRightClickedNotes([node.id]);
        return;
      }
    }
    if (event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    const hadSelection = selectedNoteIds.length > 0 || (selectedSegmentKeys?.length ?? 0) > 0;
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
          clearSelection();
        }
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
      const hit = findNoteAtGridPoint(x, y);
      const from = noteById.get(activeSlideBuild.noteIds[0]);
      // Where a press on blank board would place the node the start connects to.
      if (!hit) {
        const placement = resolveBoardPlacement(x, y, { type: "single" });
        setSlideConnectTarget(placement && from && placement.beat > from.beat + 1e-6 ? "new" : null);
        if (tool === "hidden") {
          if (cursorPreview !== null) setCursorPreview(null);
          return;
        }
        const canPreviewSnap = placement !== null;
        setCursorPreview({
          x,
          y,
          snappedLane: canPreviewSnap && placement ? placement.lane : null,
          snappedBeat: canPreviewSnap && placement ? placement.beat : null,
        });
      } else {
        setSlideConnectTarget(hit.id);
        if (cursorPreview !== null) setCursorPreview(null);
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
    const canPreviewSnap = placement !== null;

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
      showDialog("SV 预览为只读模式，请关闭后再编辑。");
      return;
    }
    if (suppressNextBoardClickRef.current) {
      suppressNextBoardClickRef.current = false;
      return;
    }

    // Without a tool, a click on blank board drops every selection, except in multi-select mode (or with Ctrl/Cmd
    // held), where a press only toggles what it reaches. Notes and line segments stop their own clicks, and the click
    // that ends a marquee or a drag is suppressed above.
    if (!isToolArmed) {
      if (!(event.ctrlKey || event.metaKey || multiSelectModeRef?.current === true)) clearSelection();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    if (tool === "copy") {
      return;
    }

    // The curve tool takes the Slide segment after the node pressed (its line itself is pressed as the segment).
    if (tool === "curve") {
      pressCurveToolOnNoteRef?.current?.(findNoteAtGridPoint(clickX, clickY), event.ctrlKey || event.metaKey);
      return;
    }

    if (tool === "paste") {
      if (!isPasteToolReady) {
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
        showDialog("ExGarupa 模式关闭时不可使用 SV。");
        return;
      }
      placeSvEvent(placement.beat);
      return;
    }

    // The Slide and Hidden tools act on the press (pressSlideTool), not the click.
    if (tool === "slide" || tool === "hidden") {
      return;
    }

    if (tool === "long") {
      placeLongNote(placement.lane, placement.beat);
      return;
    }

    if (tool === "middle") {
      // Lone middle nodes are an ExGarupa structure (hidden head and tail); elsewhere the tool only inserts into Slides.
      if (exGarupaEnabled) {
        placeLoneMiddleNode(placement.lane, placement.beat);
      }
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
      // The lane the move snaps to whole lanes by: a wide note's first lane (its lane is its centre).
      anchorLane: anchor === null ? null : isDirectionalNoteType(anchor.type) ? anchor.lane
        : noteLaneSpanStart(anchor.type, anchor.lane,
          canUseHabahiro(settings) ? normalizeRhythmWidth(anchor.width) : 1),
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
      if (!targetElement?.closest(".note-token")) {
        event.preventDefault();
        showDialog("SV 预览为只读模式，请关闭后再编辑。");
        return;
      }
    }
    if (event.button !== 0) {
      return;
    }

    const targetElement = event.target as HTMLElement | null;
    const isNoteTarget = Boolean(targetElement?.closest(".note-token"));
    if (isNoteTarget && !(isToolArmed && (tool === "slide" || tool === "hidden"))) {
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

    if (isToolArmed && (tool === "slide" || tool === "hidden")) {
      event.preventDefault();
      slidePressRef.current = { clientX: event.clientX, clientY: event.clientY };
      pressSlideTool(findNoteAtGridPoint(boardX, boardY), boardX, boardY);
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
    applyToolFromPalette,
    applyLongToolFromPalette,
    applyMiddleToolFromPalette,
    applyCurveToolFromPalette,
    applyBpmToolFromPalette,
    applySvToolFromPalette,
    applyCopyToolFromPalette,
    applyPasteToolFromPalette,
    placeNoteWithType,
    placeNote,
    pressSlideTool,
    slidePressRef,
    cancelSlideBuild,
    releaseSlideConnection,
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








