import { editorNoteHeight, editorDirectionalSegmentWidth, editorHiddenButtonHeight, editorNoteTokenWidth } from "../editorNoteMetrics";
import { useCallback, useEffect, useMemo, useRef, type UIEvent } from "react";
import { editorBeforeFrame } from "./useEditorMainLoop";
import { noteLaneSpanStart, toolPreviewNoteType, type ChartNote, type NoteType } from "../../chartCore";
import { buildSelectionMoveOffsetMap } from "../slideHiddenMoveOffsets";

const ZERO_BEAT_RENDER_OFFSET_PX = 4;

/** Distance (window px) from the viewport bottom up to the playback anchor: judge limit, raised by the playback position. */
function playbackAnchorFromBottom(playfield: HTMLElement, positionPercent: number): number {
  const anchor = document.querySelector<HTMLElement>(".editor-judge-anchor");
  const workspace = anchor?.closest(".editor-viewport-region")?.parentElement ?? null;
  if (!anchor || !workspace) return 0;
  const judgeBottom = anchor.getBoundingClientRect().bottom;
  const workspaceTop = workspace.getBoundingClientRect().top;
  const ratio = Math.min(1, Math.max(0, positionPercent / 100));
  return playfield.getBoundingClientRect().bottom - judgeBottom + ratio * (judgeBottom - workspaceTop);
}

/** How long the view must stay still before the SV preview time is committed, in ms. */
const SV_PREVIEW_SETTLE_MS = 150;
/** The SV view's wheel easing: the time constant of its approach to the wheel's target, in ms. */
const SV_WHEEL_EASE_MS = 45;

export function useEditorGeometry(params: any) {
  const {
    laneMin,
    isHiddenNodeShown,
    playbackLinePositionPercent,
    bpmTimeline,
    boardHeight,
    displayAxis,
    isSvPreviewEnabled,
    isPlaybackPlaying,
    svPreviewTimeSecRef,
    setSvPreviewTimeSec,
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
    secondsToBeatCandidates,
    selectionMovePreview,
    selectedNoteIdSet,
    selectionDragRef,
    playfieldBoardRef,
    bpmEvents,
    svEvents,
    clearSelection,
    showDialog,
    setMultiSelectedNotes,
    setToolLane,
    setUseToolLaneOverride,
    NOTE_SPECS,
    setSelectionDrag,
    selectionMoveRef,
    suppressNextBoardClickRef,
    LANE_WIDTH,
    noteVisualScale,
    onSelectionDragCompleted,
  } = params;
  const svPreviewScrollFrameRef = useRef<number | null>(null);
  const svPreviewSettleTimerRef = useRef<number | null>(null);
  const previousPlaybackPositionRef = useRef(playbackLinePositionPercent);

  const laneToColumn = useCallback((lane: number): number => lane - laneMin, [laneMin]);

  const beatToSec = useCallback(
    (beat: number): number => beatToSeconds(beat, bpmTimeline),
    [beatToSeconds, bpmTimeline],
  );

  const timeToY = useCallback(
    (timeSec: number): number => displayAxis?.timeToY(timeSec) ?? (boardHeight - timeSec * timelinePixelsPerSecond - 1),
    [boardHeight, displayAxis, timelinePixelsPerSecond],
  );

  const yToTime = useCallback(
    (y: number): number => {
      if (displayAxis?.yToTime) {
        return displayAxis.yToTime(y);
      }
      const rawSec = (boardHeight - y - 1) / timelinePixelsPerSecond;
      const zeroBeatOffsetSec = ZERO_BEAT_RENDER_OFFSET_PX / timelinePixelsPerSecond;
      const normalizedSec = rawSec <= zeroBeatOffsetSec ? 0 : rawSec;
      return clamp(normalizedSec, 0, totalDurationSec);
    },
    [boardHeight, clamp, displayAxis, timelinePixelsPerSecond, totalDurationSec],
  );

  const beatToY = useCallback((beat: number): number => timeToY(beatToSec(beat)), [beatToSec, timeToY]);

  const timeToInteractionBeat = useCallback(
    (timeSec: number): number => {
      const rawCandidates =
        typeof secondsToBeatCandidates === "function"
          ? secondsToBeatCandidates(timeSec, bpmTimeline)
          : [secondsToBeat(timeSec, bpmTimeline)];
      let hasCandidate = false;
      let maxBeat = 0;
      for (const rawBeat of rawCandidates ?? []) {
        const beat = Math.max(0, Number(rawBeat));
        if (!Number.isFinite(beat)) {
          continue;
        }
        if (!hasCandidate || beat > maxBeat) {
          maxBeat = beat;
          hasCandidate = true;
        }
      }
      if (hasCandidate) {
        return maxBeat;
      }
      return Math.max(0, secondsToBeat(timeSec, bpmTimeline));
    },
    [bpmTimeline, secondsToBeat, secondsToBeatCandidates],
  );

  const yToBeat = useCallback(
    (y: number): number => timeToInteractionBeat(yToTime(y)),
    [timeToInteractionBeat, yToTime],
  );

  /**
   * Moves the SV preview time to the viewport's. From a scroll (`settle`) it is committed once the view has stopped
   * for SV_PREVIEW_SETTLE_MS: while it moves the canvas draws each frame at the live preview time itself
   * (CanvasSvLiveScroll), and committing on every scroll would place the whole chart again each frame.
   */
  const syncSvPreviewTimeFromViewport = useCallback((timeSec: number, settle = false) => {
    if (!isSvPreviewEnabled || isPlaybackPlaying || typeof setSvPreviewTimeSec !== "function") {
      return;
    }
    const safeTimeSec = clamp(Number.isFinite(timeSec) ? timeSec : 0, 0, totalDurationSec);
    const currentTimeSec = Number(svPreviewTimeSecRef?.current ?? 0);
    if (Math.abs(currentTimeSec - safeTimeSec) <= 1e-4) {
      return;
    }
    if (svPreviewScrollFrameRef.current !== null) {
      cancelAnimationFrame(svPreviewScrollFrameRef.current);
      svPreviewScrollFrameRef.current = null;
    }
    if (settle) {
      if (svPreviewSettleTimerRef.current !== null) window.clearTimeout(svPreviewSettleTimerRef.current);
      svPreviewSettleTimerRef.current = window.setTimeout(() => {
        svPreviewSettleTimerRef.current = null;
        if (svPreviewTimeSecRef) svPreviewTimeSecRef.current = safeTimeSec;
        setSvPreviewTimeSec(safeTimeSec);
      }, SV_PREVIEW_SETTLE_MS);
      return;
    }
    svPreviewScrollFrameRef.current = requestAnimationFrame(() => {
      svPreviewScrollFrameRef.current = null;
      if (svPreviewTimeSecRef) {
        svPreviewTimeSecRef.current = safeTimeSec;
      }
      setSvPreviewTimeSec(safeTimeSec);
    });
  }, [
    clamp,
    isPlaybackPlaying,
    isSvPreviewEnabled,
    setSvPreviewTimeSec,
    svPreviewTimeSecRef,
    totalDurationSec,
  ]);

  useEffect(() => () => {
    if (svPreviewSettleTimerRef.current !== null) window.clearTimeout(svPreviewSettleTimerRef.current);
    if (svPreviewScrollFrameRef.current !== null) {
      cancelAnimationFrame(svPreviewScrollFrameRef.current);
      svPreviewScrollFrameRef.current = null;
    }
  }, []);

  // Playback anchor relative to the viewport bottom: the judge limit element, moved up by the playback position.
  const anchorTimeSecRef = useRef(0);
  // The scroll position maps to time linearly whatever the SV preview time is; the display axis is rebuilt on every
  // preview time change (each scroll under the SV view). The anchor is kept only when the layout itself changes:
  // re-anchoring on a preview change would set the scroll back to the anchor of the scroll before it while the
  // wheel or the minimap is still moving it, so the view would jerk back and forth.
  const axisLayoutKey = displayAxis ? `${displayAxis.contentHeight}:${displayAxis.timeToY(0)}` : "";
  const latestAxisRef = useRef({ timeToY, yToTime, displayAxis, syncSvPreviewTimeFromViewport });
  latestAxisRef.current = { timeToY, yToTime, displayAxis, syncSvPreviewTimeFromViewport };
  useEffect(() => {
    const { timeToY, yToTime, displayAxis, syncSvPreviewTimeFromViewport } = latestAxisRef.current;
    if (!isSkinReady) {
      return;
    }

    const playfield = playfieldRef.current;
    if (!playfield) {
      return;
    }

    // The DOM scroll range includes the editor bleed below Beat 0, so clamp to it rather than to the board height.
    const maxScrollTop = Math.max(0, playfield.scrollHeight - playfield.clientHeight);

    if (!didInitTimelineScrollRef.current) {
      previousPlaybackPositionRef.current = playbackLinePositionPercent;
      const zeroBeatAnchorFromBottom = playbackAnchorFromBottom(playfield, playbackLinePositionPercent);
      const zeroBeatScrollTop = clamp(
        timeToY(beatToSec(0)) - (playfield.clientHeight - zeroBeatAnchorFromBottom),
        0,
        maxScrollTop,
      );
      playfield.scrollTop = zeroBeatScrollTop;
      anchorTimeSecRef.current = 0;
      viewBottomTimeSecRef.current = -zeroBeatAnchorFromBottom / timelinePixelsPerSecond;
      syncSvPreviewTimeFromViewport(0);
      didInitTimelineScrollRef.current = true;
      return;
    }

    const positionDelta = playbackLinePositionPercent - previousPlaybackPositionRef.current;
    previousPlaybackPositionRef.current = playbackLinePositionPercent;
    // Keep the playback anchor on the same time while the layout (scale, zoom, scroll extent) changes.
    const anchorFromBottom = playbackAnchorFromBottom(playfield, playbackLinePositionPercent);
    const targetAnchorTime = anchorTimeSecRef.current - playfield.clientHeight * positionDelta / 100 / timelinePixelsPerSecond;
    const nextScrollTop = clamp(timeToY(targetAnchorTime) - (playfield.clientHeight - anchorFromBottom), 0, maxScrollTop);
    playfield.scrollTop = nextScrollTop;
    anchorTimeSecRef.current = targetAnchorTime;
    const bottomTimeSec = (displayAxis?.viewportTimeAtY ?? yToTime)(playfield.scrollTop + playfield.clientHeight);
    viewBottomTimeSecRef.current = bottomTimeSec;
    syncSvPreviewTimeFromViewport(bottomTimeSec);
  }, [timelinePixelsPerSecond, playbackLinePositionPercent, beatToSec, boardHeight, clamp, didInitTimelineScrollRef,
    axisLayoutKey, isSkinReady, isSvPreviewEnabled, playfieldRef, totalDurationSec, viewBottomTimeSecRef]);

  // Under the SV view the wheel scrolls the board here, on the main thread. The note canvas lies in the scrolled content
  // and is redrawn by the main thread; a wheel scroll the browser runs on its compositor would slide the drawn notes
  // as plain time for a frame before they are redrawn at their SV places (under a negative SV, the other way), and
  // they would jerk back and forth. A wheel step moves a target; each editor frame, before the board is drawn, the
  // view eases toward it (about the browser's own smooth wheel scroll); the canvas follows in the same frame.
  // Modifier wheels stay with the zoom; a scroll from elsewhere (the minimap) ends the easing.
  useEffect(() => {
    const playfield = playfieldRef.current;
    if (!isSvPreviewEnabled || !playfield) return;
    let target: number | null = null;
    let written: number | null = null;
    const stop = () => { target = null; written = null; editorBeforeFrame.delete(step); };
    const step = (deltaMs: number) => {
      const goal = target;
      if (goal === null) return stop();
      if (written !== null && Math.abs(playfield.scrollTop - written) > 1) return stop();
      const current = playfield.scrollTop;
      const remaining = goal - current;
      const arrived = Math.abs(remaining) < 0.5;
      playfield.scrollTop = arrived ? goal : current + remaining * (1 - Math.exp(-deltaMs / SV_WHEEL_EASE_MS));
      const now = playfield.scrollTop;
      written = now;
      // A goal the scroll cannot reach (past the end by a fraction) ends the easing once it stops moving.
      if (arrived || now === current) stop();
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? playfield.clientHeight : 1;
      const max = Math.max(0, playfield.scrollHeight - playfield.clientHeight);
      target = Math.max(0, Math.min(max, (target ?? playfield.scrollTop) + event.deltaY * unit));
      written = null;
      editorBeforeFrame.add(step);
    };
    playfield.addEventListener("wheel", wheel, { passive: false });
    return () => { playfield.removeEventListener("wheel", wheel); stop(); };
  }, [isSvPreviewEnabled, playfieldRef]);

  const handlePlayfieldScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const playfield = event.currentTarget;
    const anchorFromBottom = playbackAnchorFromBottom(playfield, playbackLinePositionPercent);
    anchorTimeSecRef.current = (displayAxis?.viewportTimeAtY ?? yToTime)(playfield.scrollTop + playfield.clientHeight - anchorFromBottom);
    const bottomTimeSec = (displayAxis?.viewportTimeAtY ?? yToTime)(playfield.scrollTop + playfield.clientHeight);
    viewBottomTimeSecRef.current = bottomTimeSec;
    syncSvPreviewTimeFromViewport(bottomTimeSec, true);
  }, [boardHeight, displayAxis, playbackLinePositionPercent, syncSvPreviewTimeFromViewport, viewBottomTimeSecRef, yToTime]);

  const getNoteSpanLanes = useCallback((note: Pick<ChartNote, "type" | "lane" | "width">): number => {
    if (isDirectionalNoteType(note.type)) {
      return normalizeDirectionalWidth(note.width);
    }
    if (isHabahiroEnabled) {
      return normalizeRhythmWidth(note.width);
    }
    return 1;
  }, [isDirectionalNoteType, isHabahiroEnabled, normalizeDirectionalWidth, normalizeRhythmWidth]);

  const getLaneSpanBounds = useCallback((
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
      const start = noteLaneSpanStart(type, lane, Math.max(1, spanLanes));
      return { start, end: start + Math.max(1, spanLanes) - 1 };
    }
    return { start: lane, end: lane };
  }, [isHabahiroEnabled]);

  const resolvePreviewSpanLanes = useCallback((
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
  }, [
    isDirectionalNoteType,
    isHabahiroEnabled,
    isRhythmWidthEditableType,
    normalizeDirectionalWidth,
    normalizeRhythmWidth,
    toolDirectionalWidth,
    toolRhythmWidth,
  ]);

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
      // Any other note's lane is its centre.
      return note.lane;
    },
    [isDirectionalNoteType, normalizeDirectionalWidth],
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
      slideChains: slideChains as Array<{ noteIds: string[]; long?: true }>,
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
        noteLaneSpanStart(note.type, note.lane, spanLanes);
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
        const directionalSegmentWidth = editorDirectionalSegmentWidth(LANE_WIDTH, noteVisualScale);
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
        const tokenHeight = editorNoteHeight(LANE_WIDTH, noteVisualScale);
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
    [LANE_WIDTH, getNoteCenterAt, getNoteHitboxWidth, noteVisualScale, notes],
  );

  /** Notes a note placed here would cover: the visible notes on its beat whose lane spans meet its span. */
  const findPlacementOverlaps = useCallback((
    lane: number,
    beat: number,
    options?: {
      type?: NoteType;
      directionalWidth?: number;
      rhythmWidth?: number;
    },
  ): ChartNote[] => {
    if (!options?.type && (tool === "bpm" || tool === "copy" || tool === "paste")) {
      return [];
    }

    const previewType = options?.type ?? (toolPreviewNoteType(tool) ?? tool);
    const previewSpanLanes = resolvePreviewSpanLanes(previewType, {
      directionalWidth: options?.directionalWidth,
      rhythmWidth: options?.rhythmWidth,
    });
    const previewBounds = getLaneSpanBounds(previewType, lane, previewSpanLanes);

    return notes.filter((note: ChartNote) => {
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
  }, [approxEq, getLaneSpanBounds, getNoteSpanLanes, notes, resolvePreviewSpanLanes, tool]);

  const resolveBoardPlacement = useCallback((
    x: number,
    y: number,
    options?: {
      ignoreLane?: boolean;
      type?: NoteType;
      directionalWidth?: number;
      rhythmWidth?: number;
    },
  ): { lane: number; beat: number } | null => {
    if (y < 0 || y > Math.max(boardHeight, displayAxis?.contentHeight ?? 0) || (displayAxis?.viewportTimeAtY?.(y) ?? 0) < -4 / timelinePixelsPerSecond) {
      return null;
    }

    const ignoreLane = options?.ignoreLane ?? false;
    if (!ignoreLane && (x < 0 || x > boardWidth)) {
      return null;
    }

    const snapType = options?.type ?? (
      tool === "bpm" || tool === "copy" || tool === "paste"
        ? null
        : toolPreviewNoteType(tool) ?? tool
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
        // A wide note's lane is its centre.
        return laneValues[snappedStartColumn] + (snapSpan - 1) / 2;
      }

      const columnIndex = clamp(Math.floor(x / LANE_WIDTH), 0, laneCount - 1);
      return laneValues[columnIndex];
    })();

    const beat = Math.max(0, quantizeBeat(yToBeat(y), beatDivision));
    return { lane, beat };
  }, [
    LANE_WIDTH,
    beatDivision,
    boardHeight,
    boardWidth,
    clamp,
    isDirectionalNoteType,
    isHabahiroEnabled,
    isRhythmWidthEditableType,
    laneValues,
    quantizeBeat,
    resolvePreviewSpanLanes,
    tool,
    displayAxis,
    timelinePixelsPerSecond,
    yToBeat,
  ]);

  /** Ends a marquee: it selects the notes it reaches, or with `additive` toggles them in the selection. */
  const finishSelectionDrag = useCallback(
    (clientX?: number, clientY?: number, additive = false) => {
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
      // Events are never selected; a full-width drag still hands them to the copy tool.
      const includeEvents = left <= 0 && right >= boardWidth;

      const hitNotes: ChartNote[] = [];
      let picked: ChartNote | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const note of notes) {
        // A Hidden node shown on the board is selected as a note one lane wide.
        const hidden = note.type === "hidden";
        if (hidden && !isHiddenNodeShown(note)) {
          continue;
        }
        const spanLanes = getNoteSpanLanes(note);
        const directionalStartLane =
          noteLaneSpanStart(note.type, note.lane, spanLanes);
        const noteCenterX = (laneToColumn(directionalStartLane) + spanLanes / 2) * LANE_WIDTH;
        const noteCenterY = beatToY(note.beat);
        const noteWidth = hidden ? editorNoteTokenWidth(spanLanes, false, LANE_WIDTH, noteVisualScale)
          : getNoteHitboxWidth(note.type, spanLanes);
        const noteHeight = hidden ? editorHiddenButtonHeight(LANE_WIDTH, noteVisualScale)
          : editorNoteHeight(LANE_WIDTH, noteVisualScale);
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

      const hitBpmIds = includeEvents
        ? bpmEvents
            .filter((event: any) => {
              const y = beatToY(event.beat);
              return y >= top && y <= bottom;
            })
            .map((event: any) => event.id)
        : [];
      const hitSvIds = includeEvents
        ? (svEvents ?? [])
            .filter((event: any) => {
              const y = beatToY(event.beat);
              return y >= top && y <= bottom;
            })
            .map((event: any) => event.id)
        : [];

      if (additive) {
        // Toggles what it reaches; the rest of the selection, Slide segments included, stays.
        if (hitNotes.length > 0 && picked) {
          const hitIds = new Set(hitNotes.map((note) => note.id));
          const kept = [...selectedNoteIdSet].filter((id) => !hitIds.has(id));
          const added = hitNotes.filter((note) => !selectedNoteIdSet.has(note.id)).map((note) => note.id);
          setMultiSelectedNotes([...kept, ...added], added.includes(picked.id) ? picked.id : null, { keepSegments: true });
        }
      } else if (hitNotes.length === 0 && hitBpmIds.length === 0 && hitSvIds.length === 0) {
        clearSelection();
        return;
      } else if (hitNotes.length > 0 && picked) {
        setMultiSelectedNotes(
          hitNotes.map((note) => note.id),
          picked.id,
        );
        setToolLane(picked.lane);
        setUseToolLaneOverride(false);
      } else {
        clearSelection();
      }

      if (typeof onSelectionDragCompleted === "function") {
        onSelectionDragCompleted({
          noteIds: hitNotes.map((note) => note.id),
          bpmIds: hitBpmIds,
          svIds: hitSvIds,
          primaryNoteId: picked?.id ?? null,
        });
      }
    },
    [
      selectedNoteIdSet,
      LANE_WIDTH,
      NOTE_SPECS,
      beatToY,
      boardWidth,
      bpmEvents,
      svEvents,
      clearSelection,
      getNoteHitboxWidth,
      isHiddenNodeShown,
      laneToColumn,
      noteVisualScale,
      notes,
      playfieldBoardRef,
      selectionDragRef,
      setMultiSelectedNotes,
      setSelectionDrag,
      showDialog,
      setToolLane,
      setUseToolLaneOverride,
      suppressNextBoardClickRef,
      onSelectionDragCompleted,
    ],
  );

  /**
   * The note a placing tool's press at (x, y) acts on: one whose button is under the point and that sits in the grid
   * cell the press snaps to (its beat, on the current division, and a lane it covers). A press on a note's button but
   * in another cell (notes closer than their buttons are tall) is a press on that cell, which places there.
   * A Hidden node shown on the board (isHiddenNodeShown) is reached the same way, as a note one lane wide (a node off
   * the lanes is in the cell of the lane it is nearest).
   */
  const findNoteAtGridPoint = useCallback(
    (x: number, y: number): ChartNote | null => {
      const placement = resolveBoardPlacement(x, y, { type: "single" });
      if (!placement) return null;
      // A visible note in the cell wins over a Hidden node there.
      let best: ChartNote | null = null, bestDistance = Infinity;
      let bestHidden: ChartNote | null = null, bestHiddenDistance = Infinity;
      for (const note of notes) {
        const hidden = note.type === "hidden";
        if (hidden && !isHiddenNodeShown(note)) continue;
        if (Math.abs(quantizeBeat(note.beat, beatDivision) - placement.beat) > 1e-6) continue;
        const span = getNoteSpanLanes(note);
        if (hidden) {
          if (Math.abs(placement.lane - note.lane) > span / 2 + 1e-6) continue;
        } else {
          const start = noteLaneSpanStart(note.type, note.lane, span);
          if (placement.lane < start - 1e-6 || placement.lane > start + span - 1 + 1e-6) continue;
        }
        const { x: centerX, y: centerY } = getNoteCenterAt(note);
        const halfWidth = (hidden ? editorNoteTokenWidth(span, false, LANE_WIDTH, noteVisualScale)
          : getNoteHitboxWidth(note.type, span)) / 2;
        const halfHeight = (hidden ? editorHiddenButtonHeight(LANE_WIDTH, noteVisualScale)
          : editorNoteHeight(LANE_WIDTH, noteVisualScale)) / 2;
        if (Math.abs(x - centerX) > halfWidth || Math.abs(y - centerY) > halfHeight) continue;
        const distance = Math.hypot(x - centerX, y - centerY);
        if (hidden) {
          if (distance < bestHiddenDistance) { bestHidden = note; bestHiddenDistance = distance; }
        } else if (distance < bestDistance) { best = note; bestDistance = distance; }
      }
      return best ?? bestHidden;
    },
    [LANE_WIDTH, beatDivision, getNoteCenterAt, getNoteHitboxWidth, getNoteSpanLanes, noteVisualScale, notes, quantizeBeat,
      isHiddenNodeShown, resolveBoardPlacement],
  );

  /**
   * The note pressed at (x, y) without a placing tool: of the notes whose buttons are under the point (a shown Hidden
   * node's is its smaller button), the one whose centre is nearest. Buttons of notes close together overlap; the
   * topmost one is not necessarily the one meant.
   */
  const findNoteNearestAtBoardPoint = useCallback(
    (x: number, y: number): ChartNote | null => {
      let best: ChartNote | null = null, bestDistance = Infinity;
      for (const note of notes) {
        const hidden = note.type === "hidden";
        if (hidden && !isHiddenNodeShown(note)) continue;
        const { x: centerX, y: centerY, spanLanes } = getNoteCenterAt(note);
        const halfWidth = (hidden ? editorNoteTokenWidth(spanLanes, false, LANE_WIDTH, noteVisualScale)
          : getNoteHitboxWidth(note.type, spanLanes)) / 2;
        const halfHeight = (hidden ? editorHiddenButtonHeight(LANE_WIDTH, noteVisualScale)
          : editorNoteHeight(LANE_WIDTH, noteVisualScale)) / 2;
        if (Math.abs(x - centerX) > halfWidth || Math.abs(y - centerY) > halfHeight) continue;
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance < bestDistance) { best = note; bestDistance = distance; }
      }
      return best;
    },
    [LANE_WIDTH, getNoteCenterAt, getNoteHitboxWidth, isHiddenNodeShown, noteVisualScale, notes],
  );

  /**
   * How far the selection may move in beats so every Slide keeps its nodes in order: a moved node stays between the
   * beats of the nodes before and after it (ends included), as they move or not (a Hidden node between a moved node and
   * one that stays moves part of the way, see buildSelectionMoveOffsetMap). Null when nothing limits it.
   */
  const selectionBeatDeltaRange = useMemo(() => {
    if (selectedNoteIdSet.size === 0) return null;
    // Each node's share of the move: its beat moves by share × the move.
    const share = buildSelectionMoveOffsetMap({
      notes,
      slideChains: slideChains as Array<{ noteIds: string[]; long?: true }>,
      selectedNoteIds: selectedNoteIdSet,
      laneDelta: 0,
      beatDelta: 1,
    });
    const byId = new Map<string, ChartNote>((notes as ChartNote[]).map((note) => [note.id, note] as const));
    let min = -Infinity, max = Infinity;
    for (const chain of slideChains as Array<{ noteIds: string[] }>) {
      for (let index = 0; index + 1 < chain.noteIds.length; index += 1) {
        const before = byId.get(chain.noteIds[index]!), after = byId.get(chain.noteIds[index + 1]!);
        if (!before || !after) continue;
        // before.beat + a·d ≤ after.beat + b·d, that is (a − b)·d ≤ after.beat − before.beat.
        const rate = (share.get(before.id)?.beat ?? 0) - (share.get(after.id)?.beat ?? 0);
        if (Math.abs(rate) <= 1e-9) continue;
        const bound = (after.beat - before.beat) / rate;
        if (rate > 0) max = Math.min(max, bound);
        else min = Math.max(min, bound);
      }
    }
    return min > max + 1e-9 || (min === -Infinity && max === Infinity) ? null : { min, max };
  }, [notes, selectedNoteIdSet, slideChains]);

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
      // Held where a Slide node would pass the node before or after it; the lane move goes on.
      const heldBeat = selectionBeatDeltaRange
        ? Number(Math.max(selectionBeatDeltaRange.min, Math.min(selectionBeatDeltaRange.max, deltaBeat)).toFixed(6))
        : deltaBeat;
      const moved =
        drag.isDragging ||
        Math.abs(clientX - drag.startClientX) >= 4 ||
        Math.abs(clientY - drag.startClientY) >= 4;
      return {
        laneDelta: deltaLane,
        beatDelta: heldBeat,
        moved,
      };
    },
    [LANE_WIDTH, beatDivision, playfieldBoardRef, quantizeBeat, selectionBeatDeltaRange, selectionMoveRef, yToBeat],
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
    findNoteAtGridPoint,
    findNoteNearestAtBoardPoint,
    findPlacementOverlaps,
    resolveBoardPlacement,
    finishSelectionDrag,
    calcSelectionMoveDelta,
  };
}
