import { useCallback, useEffect, useMemo, type UIEvent } from "react";
import type { ChartNote, NoteType } from "../../chartCore";
import { buildSelectionMoveOffsetMap } from "../slideHiddenMoveOffsets";

const ZERO_BEAT_RENDER_OFFSET_PX = 4;

export function useEditorGeometry(params: any) {
  const {
    laneMin,
    bpmTimeline,
    boardHeight,
    timelinePixelsPerSecond,
    totalDurationSec,
    playfieldRef,
    isSkinReady,
    didInitTimelineScrollRef,
    viewBottomTimeSecRef,
    beatDivision,
    boardWidth,
    laneValues,
    notes,
    slideChains,
    tool,
    toolDirectionalWidth,
    toolRhythmWidth,
    isDirectionalNoteType,
    normalizeDirectionalWidth,
    normalizeRhythmWidth,
    isRhythmWidthEditableType,
    isHabahiroEnabled,
    approxEq,
    clamp,
    quantizeBeat,
    beatToSeconds,
    secondsToBeat,
    selectionMovePreview,
    selectedNoteIdSet,
    selectionDragRef,
    playfieldBoardRef,
    bpmEvents,
    clearAllSelections,
    setStatusMessage,
    setMultiSelectedNotes,
    setToolLane,
    setUseToolLaneOverride,
    clearSelectedNotes,
    setSelectedBpmEventIds,
    setSelectedBpmEventId,
    NOTE_SPECS,
    setSelectionDrag,
    selectionMoveRef,
    suppressNextBoardClickRef,
    LANE_WIDTH,
    noteVisualScale,
    onSelectionDragCompleted,
  } = params;

  const laneToColumn = useCallback((lane: number): number => lane - laneMin, [laneMin]);

  const beatToSec = useCallback(
    (beat: number): number => beatToSeconds(beat, bpmTimeline),
    [beatToSeconds, bpmTimeline],
  );

  const timeToY = useCallback(
    (timeSec: number): number => boardHeight - timeSec * timelinePixelsPerSecond - 1,
    [boardHeight, timelinePixelsPerSecond],
  );

  const yToTime = useCallback(
    (y: number): number => {
      const rawSec = (boardHeight + ZERO_BEAT_RENDER_OFFSET_PX - y - 1) / timelinePixelsPerSecond;
      const zeroBeatOffsetSec = ZERO_BEAT_RENDER_OFFSET_PX / timelinePixelsPerSecond;
      const normalizedSec = rawSec <= zeroBeatOffsetSec ? 0 : rawSec;
      return clamp(normalizedSec, 0, totalDurationSec);
    },
    [boardHeight, clamp, timelinePixelsPerSecond, totalDurationSec],
  );

  const beatToY = useCallback((beat: number): number => timeToY(beatToSec(beat)), [beatToSec, timeToY]);

  const yToBeat = useCallback(
    (y: number): number => secondsToBeat(yToTime(y), bpmTimeline),
    [bpmTimeline, secondsToBeat, yToTime],
  );

  useEffect(() => {
    if (!isSkinReady) {
      return;
    }

    const playfield = playfieldRef.current;
    if (!playfield) {
      return;
    }

    const maxScrollTop = Math.max(0, boardHeight - playfield.clientHeight);

    if (!didInitTimelineScrollRef.current) {
      const zeroBeatScrollTop = clamp(
        timeToY(beatToSec(0)) - playfield.clientHeight,
        0,
        maxScrollTop,
      );
      playfield.scrollTop = zeroBeatScrollTop;
      viewBottomTimeSecRef.current = 0;
      didInitTimelineScrollRef.current = true;
      return;
    }

    const targetBottomTime = clamp(
      Number.isFinite(viewBottomTimeSecRef.current) ? viewBottomTimeSecRef.current : 0,
      0,
      totalDurationSec,
    );
    const nextBottomY = timeToY(targetBottomTime);
    const nextScrollTop = clamp(nextBottomY - playfield.clientHeight, 0, maxScrollTop);
    playfield.scrollTop = nextScrollTop;
    viewBottomTimeSecRef.current = yToTime(playfield.scrollTop + playfield.clientHeight);
  }, [beatToSec, boardHeight, clamp, didInitTimelineScrollRef, isSkinReady, playfieldRef, timeToY, totalDurationSec, viewBottomTimeSecRef, yToTime]);

  const handlePlayfieldScroll = (event: UIEvent<HTMLDivElement>) => {
    const playfield = event.currentTarget;
    const maxScrollTop = Math.max(0, boardHeight - playfield.clientHeight);
    if (playfield.scrollTop > maxScrollTop) {
      playfield.scrollTop = maxScrollTop;
    }
    viewBottomTimeSecRef.current = yToTime(playfield.scrollTop + playfield.clientHeight);
  };

  const getNoteSpanLanes = (note: Pick<ChartNote, "type" | "lane" | "width">): number => {
    if (isDirectionalNoteType(note.type)) {
      return normalizeDirectionalWidth(note.width);
    }
    if (isHabahiroEnabled) {
      return normalizeRhythmWidth(note.width);
    }
    return 1;
  };

  const getLaneSpanBounds = (
    type: NoteType,
    lane: number,
    spanLanes: number,
  ): { start: number; end: number } => {
    if (type === "directional_flick_left") {
      return { start: lane - spanLanes + 1, end: lane };
    }
    if (type === "directional_flick_right") {
      return { start: lane, end: lane + spanLanes - 1 };
    }
    if (isHabahiroEnabled) {
      return { start: lane, end: lane + Math.max(1, spanLanes) - 1 };
    }
    return { start: lane, end: lane };
  };

  const resolvePreviewSpanLanes = (
    type: NoteType,
    options?: { directionalWidth?: number; rhythmWidth?: number },
  ): number => {
    if (isDirectionalNoteType(type)) {
      return normalizeDirectionalWidth(options?.directionalWidth ?? toolDirectionalWidth);
    }
    if (isHabahiroEnabled && isRhythmWidthEditableType(type)) {
      return normalizeRhythmWidth(options?.rhythmWidth ?? toolRhythmWidth);
    }
    return 1;
  };

  const getSlideAnchorLane = useCallback(
    (note: Pick<ChartNote, "type" | "lane" | "width">, mode: "incoming" | "outgoing"): number => {
      if (isDirectionalNoteType(note.type)) {
        const span = normalizeDirectionalWidth(note.width);
        if (mode === "incoming") {
          return note.lane;
        }
        if (note.type === "directional_flick_right") {
          return note.lane + span - 1;
        }
        return note.lane - span + 1;
      }
      if (isHabahiroEnabled) {
        const span = normalizeRhythmWidth(note.width);
        return note.lane + (span - 1) / 2;
      }
      return note.lane;
    },
    [isDirectionalNoteType, isHabahiroEnabled, normalizeDirectionalWidth, normalizeRhythmWidth],
  );

  const previewOffsetById = useMemo(() => {
    if (!selectionMovePreview?.isDragging) {
      return new Map<string, { lane: number; beat: number }>();
    }
    if (selectedNoteIdSet.size === 0) {
      return new Map<string, { lane: number; beat: number }>();
    }
    return buildSelectionMoveOffsetMap({
      notes,
      slideChains: slideChains as Array<{ noteIds: string[] }>,
      selectedNoteIds: selectedNoteIdSet,
      laneDelta: selectionMovePreview.laneDelta,
      beatDelta: selectionMovePreview.beatDelta,
    });
  }, [notes, selectedNoteIdSet, selectionMovePreview, slideChains]);

  const getRenderedNotePlacement = useCallback(
    (note: ChartNote): { lane: number; beat: number } => {
      const previewingMove = selectionMovePreview?.isDragging ?? false;
      if (!previewingMove) {
        return {
          lane: note.lane,
          beat: note.beat,
        };
      }

      const offset = previewOffsetById.get(note.id);
      const laneOffset = offset?.lane ?? 0;
      const beatOffset = offset?.beat ?? 0;
      return {
        lane: note.lane + laneOffset,
        beat: Math.max(0, note.beat + beatOffset),
      };
    },
    [previewOffsetById, selectionMovePreview],
  );

  const getNoteCenterAt = useCallback(
    (note: Pick<ChartNote, "type" | "lane" | "beat" | "width">) => {
      const spanLanes = getNoteSpanLanes(note);
      const directionalStartLane =
        note.type === "directional_flick_left" ? note.lane - spanLanes + 1 : note.lane;
      const x = (laneToColumn(directionalStartLane) + spanLanes / 2) * LANE_WIDTH;
      const y = beatToY(note.beat);
      return { x, y, spanLanes };
    },
    [LANE_WIDTH, beatToY, getNoteSpanLanes, laneToColumn],
  );

  const getNoteHitboxWidth = useCallback(
    (type: NoteType, spanLanes: number): number => {
      if (isDirectionalNoteType(type)) {
        const laneCount = Math.max(1, spanLanes);
        const directionalSegmentWidth = Math.max(LANE_WIDTH * 1.34, 60) * noteVisualScale;
        return Math.max(1, (laneCount - 1) * LANE_WIDTH + directionalSegmentWidth);
      }
      return LANE_WIDTH * (spanLanes + 0.25) * noteVisualScale;
    },
    [LANE_WIDTH, isDirectionalNoteType, noteVisualScale],
  );

  const findNoteAtBoardPoint = useCallback(
    (x: number, y: number): ChartNote | null => {
      for (let index = notes.length - 1; index >= 0; index -= 1) {
        const note = notes[index];
        if (note.type === "hidden") {
          continue;
        }
        const { x: centerX, y: centerY, spanLanes } = getNoteCenterAt(note);
        const tokenWidth = getNoteHitboxWidth(note.type, spanLanes);
        const tokenHeight = 24 * noteVisualScale;
        const left = centerX - tokenWidth / 2;
        const right = centerX + tokenWidth / 2;
        const top = centerY - tokenHeight / 2;
        const bottom = centerY + tokenHeight / 2;
        if (x >= left && x <= right && y >= top && y <= bottom) {
          return note;
        }
      }
      return null;
    },
    [getNoteCenterAt, getNoteHitboxWidth, noteVisualScale, notes],
  );

  const isPlacementBlocked = (
    lane: number,
    beat: number,
    options?: {
      type?: NoteType;
      directionalWidth?: number;
      rhythmWidth?: number;
    },
  ): boolean => {
    if (tool === "bpm" || tool === "copy" || tool === "paste") {
      return false;
    }

    const previewType = options?.type ?? tool;
    const previewSpanLanes = resolvePreviewSpanLanes(previewType, {
      directionalWidth: options?.directionalWidth,
      rhythmWidth: options?.rhythmWidth,
    });
    const previewBounds = getLaneSpanBounds(previewType, lane, previewSpanLanes);

    return notes.some((note: ChartNote) => {
      if (note.type === "hidden") {
        return false;
      }
      if (!approxEq(note.beat, beat)) {
        return false;
      }
      const noteSpan = getNoteSpanLanes(note);
      const noteBounds = getLaneSpanBounds(note.type, note.lane, noteSpan);
      return previewBounds.start <= noteBounds.end && noteBounds.start <= previewBounds.end;
    });
  };

  const resolveBoardPlacement = (
    x: number,
    y: number,
    options?: {
      ignoreLane?: boolean;
      type?: NoteType;
      directionalWidth?: number;
      rhythmWidth?: number;
    },
  ): { lane: number; beat: number } | null => {
    if (y < 0 || y > boardHeight) {
      return null;
    }

    const ignoreLane = options?.ignoreLane ?? false;
    if (!ignoreLane && (x < 0 || x > boardWidth)) {
      return null;
    }

    const snapType = options?.type ?? (
      tool === "bpm" || tool === "copy" || tool === "paste"
        ? null
        : tool
    );
    const snapSpan = snapType
      ? resolvePreviewSpanLanes(snapType, {
        directionalWidth: options?.directionalWidth,
        rhythmWidth: options?.rhythmWidth,
      })
      : 1;

    const laneCount = laneValues.length;
    const lane = (() => {
      if (
        snapType &&
        !isDirectionalNoteType(snapType) &&
        isHabahiroEnabled &&
        isRhythmWidthEditableType(snapType) &&
        snapSpan > 1
      ) {
        const rawColumn = x / LANE_WIDTH;
        const maxStartColumn = Math.max(0, laneCount - snapSpan);
        const snappedStartColumn = clamp(
          Math.round(rawColumn - snapSpan / 2),
          0,
          maxStartColumn,
        );
        return laneValues[snappedStartColumn];
      }

      const columnIndex = clamp(Math.floor(x / LANE_WIDTH), 0, laneCount - 1);
      return laneValues[columnIndex];
    })();

    const beat = Math.max(0, quantizeBeat(yToBeat(y), beatDivision));
    return { lane, beat };
  };

  const finishSelectionDrag = useCallback(
    (clientX?: number, clientY?: number) => {
      const currentDrag = selectionDragRef.current;
      if (!currentDrag) {
        return;
      }

      let finalizedDrag = currentDrag;
      const board = playfieldBoardRef.current;
      if (board && typeof clientX === "number" && typeof clientY === "number") {
        const rect = board.getBoundingClientRect();
        finalizedDrag = {
          ...currentDrag,
          currentX: clientX - rect.left,
          currentY: clientY - rect.top,
        };
      }

      selectionDragRef.current = null;
      setSelectionDrag(null);

      if (!finalizedDrag.isDragging) {
        return;
      }

      suppressNextBoardClickRef.current = true;

      const left = Math.min(finalizedDrag.startX, finalizedDrag.currentX);
      const right = Math.max(finalizedDrag.startX, finalizedDrag.currentX);
      const top = Math.min(finalizedDrag.startY, finalizedDrag.currentY);
      const bottom = Math.max(finalizedDrag.startY, finalizedDrag.currentY);
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      const includeBpm = left <= 0 && right >= boardWidth;

      const hitNotes: ChartNote[] = [];
      let picked: ChartNote | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const note of notes) {
        if (note.type === "hidden") {
          continue;
        }
        const spanLanes = getNoteSpanLanes(note);
        const directionalStartLane =
          note.type === "directional_flick_left" ? note.lane - spanLanes + 1 : note.lane;
        const noteCenterX = (laneToColumn(directionalStartLane) + spanLanes / 2) * LANE_WIDTH;
        const noteCenterY = beatToY(note.beat);
        const noteWidth = getNoteHitboxWidth(note.type, spanLanes);
        const noteHeight = 24 * noteVisualScale;
        const noteLeft = noteCenterX - noteWidth / 2;
        const noteRight = noteCenterX + noteWidth / 2;
        const noteTop = noteCenterY - noteHeight / 2;
        const noteBottom = noteCenterY + noteHeight / 2;
        const intersects =
          left <= noteRight && noteLeft <= right && top <= noteBottom && noteTop <= bottom;

        if (!intersects) {
          continue;
        }

        hitNotes.push(note);
        const distance = Math.hypot(noteCenterX - centerX, noteCenterY - centerY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          picked = note;
        }
      }

      const hitBpmIds = includeBpm
        ? bpmEvents
            .filter((event: any) => {
              const y = beatToY(event.beat);
              return y >= top && y <= bottom;
            })
            .map((event: any) => event.id)
        : [];

      if (hitNotes.length === 0 && hitBpmIds.length === 0) {
        clearAllSelections();
        setStatusMessage("框选未命中对象。");
        return;
      }

      if (hitNotes.length > 0 && picked) {
        setMultiSelectedNotes(
          hitNotes.map((note) => note.id),
          picked.id,
        );
        setToolLane(picked.lane);
        setUseToolLaneOverride(false);
      } else {
        clearSelectedNotes();
      }

      setSelectedBpmEventIds(hitBpmIds);
      setSelectedBpmEventId(hitBpmIds[0] ?? null);

      if (hitNotes.length > 0 && hitBpmIds.length > 0) {
        setStatusMessage(`框选选中 ${hitNotes.length} 个音符，${hitBpmIds.length} 条 BPM 线。`);
      } else if (hitNotes.length > 0 && picked) {
        setStatusMessage(
          hitNotes.length > 1
            ? `框选选中 ${hitNotes.length} 个音符。`
            : `框选选中 ${NOTE_SPECS[picked.type].label}。`,
        );
      } else {
        setStatusMessage(`框选选中 ${hitBpmIds.length} 条 BPM 线。`);
      }

      if (typeof onSelectionDragCompleted === "function") {
        onSelectionDragCompleted({
          noteIds: hitNotes.map((note) => note.id),
          bpmIds: hitBpmIds,
          primaryNoteId: picked?.id ?? null,
        });
      }
    },
    [
      LANE_WIDTH,
      NOTE_SPECS,
      beatToY,
      boardWidth,
      bpmEvents,
      clearAllSelections,
      clearSelectedNotes,
      getNoteHitboxWidth,
      laneToColumn,
      noteVisualScale,
      notes,
      playfieldBoardRef,
      selectionDragRef,
      setMultiSelectedNotes,
      setSelectedBpmEventId,
      setSelectedBpmEventIds,
      setSelectionDrag,
      setStatusMessage,
      setToolLane,
      setUseToolLaneOverride,
      suppressNextBoardClickRef,
      onSelectionDragCompleted,
    ],
  );

  const calcSelectionMoveDelta = useCallback(
    (clientX: number, clientY: number): { laneDelta: number; beatDelta: number; moved: boolean } | null => {
      const drag = selectionMoveRef.current;
      const board = playfieldBoardRef.current;
      if (!drag || !board) {
        return null;
      }

      const rect = board.getBoundingClientRect();
      const currentY = clientY - rect.top;
      const rawLaneDelta = (clientX - drag.startClientX) / LANE_WIDTH;
      const deltaLane = (() => {
        if (drag.anchorLane !== null) {
          const anchorLaneBase = Math.round(drag.anchorLane);
          const snappedAnchorLane = Math.round(anchorLaneBase + rawLaneDelta);
          return Number((snappedAnchorLane - drag.anchorLane).toFixed(6));
        }
        return Math.round(rawLaneDelta);
      })();
      const rawBeatDelta = yToBeat(currentY) - yToBeat(drag.startBoardY);
      const deltaBeat = (() => {
        if (drag.anchorBeat !== null) {
          const snappedAnchorBeat = quantizeBeat(drag.anchorBeat + rawBeatDelta, beatDivision);
          return Number((snappedAnchorBeat - drag.anchorBeat).toFixed(6));
        }
        return Number(quantizeBeat(rawBeatDelta, beatDivision).toFixed(6));
      })();
      const moved =
        drag.isDragging ||
        Math.abs(clientX - drag.startClientX) >= 4 ||
        Math.abs(clientY - drag.startClientY) >= 4;
      return {
        laneDelta: deltaLane,
        beatDelta: deltaBeat,
        moved,
      };
    },
    [LANE_WIDTH, beatDivision, playfieldBoardRef, quantizeBeat, selectionMoveRef, yToBeat],
  );

  return {
    laneToColumn,
    beatToSec,
    timeToY,
    yToTime,
    beatToY,
    yToBeat,
    handlePlayfieldScroll,
    getNoteSpanLanes,
    getLaneSpanBounds,
    getSlideAnchorLane,
    getRenderedNotePlacement,
    getNoteCenterAt,
    getNoteHitboxWidth,
    findNoteAtBoardPoint,
    isPlacementBlocked,
    resolveBoardPlacement,
    finishSelectionDrag,
    calcSelectionMoveDelta,
  };
}
