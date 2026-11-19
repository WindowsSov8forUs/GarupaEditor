import { editorSlideLineWidth } from "../editorNoteMetrics";
import { useMemo, type ReactNode } from "react";
import { projectPlayfieldLineRuntimeAssets } from "../../skinLoader";
import type { EventBubbleHit, TimelineEventTarget } from "./useCanvasPlayfieldBackend";

/** What a press and a right-click on an event bubble do. */
export type EventBubbleHandlers = {
  press(hit: Pick<EventBubbleHit, "target" | "bubble">): void;
  remove(hit: Pick<EventBubbleHit, "target" | "bubble">): void;
};

export function usePlayfieldRenderers(params: any) {
  const {
    LANE_WIDTH,
    approxEq,
    beatToY,
    bpmTimeline,
    bpmEvents,
    svEvents,
    BASE_BPM_LINE_ID,
    isTimingGroupModeActive,
    selectedTimingGroupId,
    isToolArmed,
    setBpmEvents,
    setSvEvents,
    tool,
    slideBuildRef,
    finalizeSlideBuild,
    cancelSlideBuild,
    noteById,
    getRenderedNotePlacement,
    getSlideAnchorLane,
    laneToColumn,
    selectedSlideSegmentIds,
    selectSlideSegment,
    slideSegmentEndNoteIds,
    deleteRightClickedNotes,
    connectionSegments,
    skinAssets,
    slideBuildState,
    slideBuildCursor,
    onMiddleToolConnectionClick,
    onCurveToolConnectionClick,
    noteVisualScale,
  } = params;
  const isPlacementNoteTool = isToolArmed && tool !== "bpm" && tool !== "sv" && tool !== "copy" && tool !== "paste"
    && tool !== "curve";
  const isPasteToolSelected = isToolArmed && tool === "paste";
  const shouldBypassConnectionLeftClick = isPlacementNoteTool || isPasteToolSelected;
  const runtimeLineAssets = useMemo(
    () => (skinAssets ? projectPlayfieldLineRuntimeAssets(skinAssets) : null),
    [skinAssets],
  );


  // Event lines carry no interaction and are never selected. A canvas bubble only
  // reaches its event through the BPM or SV tool: the editor opens on a press, and a right-click deletes it.
  const isSvEventMuted = (event: any) => {
    const timingGroup = typeof event.timingGroup === "string" && event.timingGroup.trim().length > 0
      ? event.timingGroup.trim()
      : "#Global";
    return isTimingGroupModeActive && timingGroup !== selectedTimingGroupId;
  };

  /** A bubble's BPM event: its selection id (BASE_BPM_LINE_ID for Beat 0) and current value; null if it has none. */
  const describeBpmEvent = (target: TimelineEventTarget): { selectionId: string; bpm: number; isBase: boolean } | null => {
    if (target.kind !== "bpm") {
      return null;
    }
    if (target.key === "base") {
      const base = bpmTimeline.find((node: any) => approxEq(node.beat, 0));
      return base ? { selectionId: BASE_BPM_LINE_ID, bpm: base.bpm, isBase: true } : null;
    }
    const event = bpmEvents.find((item: any) => item.id === target.key);
    return event ? { selectionId: event.id, bpm: event.bpm, isBase: false } : null;
  };
  /** A bubble's SV event: its id, value and timing group; null if it has none or the event is muted. */
  const describeSvEvent = (target: TimelineEventTarget): { id: string; value: number; timingGroup: string } | null => {
    if (target.kind !== "sv") {
      return null;
    }
    const event = (svEvents ?? []).find((item: any) => item.id === target.key);
    return event && !isSvEventMuted(event)
      ? { id: event.id, value: event.value, timingGroup: typeof event.timingGroup === "string" ? event.timingGroup : "#Global" }
      : null;
  };
  /** Deletes a bubble's event; false when it cannot be deleted (the Beat 0 base BPM, a muted SV, a missing event). */
  const deleteTimelineEvent = (target: TimelineEventTarget): boolean => {
    if (target.kind === "bpm") {
      if (!bpmEvents.some((event: any) => event.id === target.key)) {
        return false;
      }
      setBpmEvents((previous: any[]) => previous.filter((event) => event.id !== target.key));
      return true;
    }
    if (target.kind === "sv") {
      const event = (svEvents ?? []).find((item: any) => item.id === target.key);
      if (!event || isSvEventMuted(event)) {
        return false;
      }
      setSvEvents((previous: any[]) => previous.filter((item) => item.id !== target.key));
      return true;
    }
    return false;
  };








  /** The Slide and Long line segments' hit areas over the interaction window (the canvas draws the lines). */
  const renderSlideSegments = (visibleWindow: { top: number; bottom: number }) => {
    const segments: ReactNode[] = [];
    const longTexture = runtimeLineAssets?.longLine;
    const curveSlideTexture = runtimeLineAssets?.curveSlideLine;
    for (const segment of connectionSegments ?? []) {
      if (segment.maxY < visibleWindow.top - 8 || segment.minY > visibleWindow.bottom + 8) {
        continue;
      }
      const isPreviewChain = segment.isPreviewChain;
      const lineTexture = segment.textureKind === "curveSlide" ? curveSlideTexture : longTexture;
      if (!lineTexture) {
        continue;
      }
      const topIsFrom = segment.fromY <= segment.toY;
      const topX = topIsFrom ? segment.fromX : segment.toX;
      const topY = topIsFrom ? segment.fromY : segment.toY;
      const bottomX = topIsFrom ? segment.toX : segment.fromX;
      const bottomY = topIsFrom ? segment.toY : segment.fromY;
      const height = bottomY - topY;
      if (!Number.isFinite(height) || height <= 0) {
        continue;
      }
      const horizontalOffset = bottomX - topX;
      const skewDeg = (Math.atan2(horizontalOffset, height) * 180) / Math.PI;
      // The segment's element is its hit area only (the canvas draws the line): as wide as the wider end,
      // clipped to the trapezoid when its ends differ (as the original's NoteMesh, each end as wide as its own note).
      const fromWidth = editorSlideLineWidth(segment.fromSpanLanes, LANE_WIDTH, noteVisualScale);
      const toWidth = editorSlideLineWidth(segment.toSpanLanes, LANE_WIDTH, noteVisualScale);
      const lineWidth = Math.max(fromWidth, toWidth);
      const topInset = (lineWidth - (topIsFrom ? fromWidth : toWidth)) / 2;
      const bottomInset = (lineWidth - (topIsFrom ? toWidth : fromWidth)) / 2;
      const clipPath = topInset > 1e-3 || bottomInset > 1e-3
        ? `polygon(${topInset}px 0, ${lineWidth - topInset}px 0, ${lineWidth - bottomInset}px 100%, ${bottomInset}px 100%)`
        : undefined;
      const slideSegmentId = segment.slideSegmentId;
      const isMuted = Boolean(segment.muted);
      const isSelectedSegment = !isPreviewChain && selectedSlideSegmentIds.has(slideSegmentId);
      segments.push(
        <div
          key={`slide-segment-${segment.chainId}-${segment.index}`}
          className={`slide-segment ${isPreviewChain || isMuted ? "" : "selectable"} ${isSelectedSegment ? "selected" : ""} ${isMuted ? "timing-group-muted" : ""} hitbox-only`}
          style={{
            left: topX - lineWidth * 0.5,
            top: topY,
            width: lineWidth,
            height,
            transform: `skewX(${skewDeg}deg)`,
            clipPath,
          }}
          onMouseDown={(event) => {
            if (isPreviewChain) {
              return;
            }
            if (isToolArmed && (tool === "slide" || tool === "middle" || tool === "curve")) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (shouldBypassConnectionLeftClick) {
              return;
            }
            if (isMuted) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            if (isPreviewChain) {
              return;
            }
            // The Middle tool inserts a node where a Slide's line is pressed; the Slide tool leaves lines alone.
            if (isToolArmed && tool === "middle") {
              event.preventDefault();
              event.stopPropagation();
              if (!slideBuildRef.current && typeof onMiddleToolConnectionClick === "function") {
                onMiddleToolConnectionClick(segment, event);
              }
              return;
            }
            // The curve tool applies its shape preset to the pressed segment.
            if (isToolArmed && tool === "curve") {
              event.preventDefault();
              event.stopPropagation();
              if (!slideBuildRef.current && typeof onCurveToolConnectionClick === "function") {
                onCurveToolConnectionClick(segment);
              }
              return;
            }
            if (isToolArmed && tool === "slide") {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (shouldBypassConnectionLeftClick) {
              return;
            }
            if (isMuted) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (slideBuildRef.current) {
              return;
            }
            selectSlideSegment(slideSegmentId, event.ctrlKey || event.metaKey);
          }}
          onContextMenu={(event) => {
            if (isPreviewChain) {
              return;
            }
            if (isMuted) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            const activeSlideBuild = slideBuildRef.current;
            if (activeSlideBuild) {
              if (activeSlideBuild.persistUntilRightClick) {
                finalizeSlideBuild({ disarmTool: true });
              } else {
                cancelSlideBuild();
              }
              return;
            }
            deleteRightClickedNotes(slideSegmentEndNoteIds(slideSegmentId));
          }}
          aria-hidden={isPreviewChain}
        >
        </div>,
      );
    }
    return segments;
  };

  const slideBuildCommittedGuideLines = useMemo(() => {
    if (!slideBuildState || slideBuildState.noteIds.length < 2) {
      return [] as Array<{ x1: number; y1: number; x2: number; y2: number; key: string }>;
    }
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }> = [];
    for (let index = 0; index < slideBuildState.noteIds.length - 1; index += 1) {
      const from = noteById.get(slideBuildState.noteIds[index]);
      const to = noteById.get(slideBuildState.noteIds[index + 1]);
      if (!from || !to) {
        continue;
      }
      const fromPlacement = getRenderedNotePlacement(from);
      const toPlacement = getRenderedNotePlacement(to);
      const fromAnchorLane = getSlideAnchorLane(
        { type: from.type, lane: fromPlacement.lane, width: from.width },
        "outgoing",
      );
      const toAnchorLane = getSlideAnchorLane(
        { type: to.type, lane: toPlacement.lane, width: to.width },
        "incoming",
      );
      lines.push({
        x1: (laneToColumn(fromAnchorLane) + 0.5) * LANE_WIDTH,
        y1: beatToY(fromPlacement.beat),
        x2: (laneToColumn(toAnchorLane) + 0.5) * LANE_WIDTH,
        y2: beatToY(toPlacement.beat),
        key: `${slideBuildState.noteIds[index]}-${slideBuildState.noteIds[index + 1]}-${index}`,
      });
    }
    return lines;
  }, [LANE_WIDTH, beatToY, getRenderedNotePlacement, getSlideAnchorLane, laneToColumn, noteById, slideBuildState]);

  const slideBuildGuideLine = useMemo(() => {
    if (!slideBuildState || !slideBuildCursor || slideBuildState.noteIds.length === 0) {
      return null;
    }
    const lastId = slideBuildState.noteIds[slideBuildState.noteIds.length - 1];
    const lastNote = noteById.get(lastId);
    if (!lastNote) {
      return null;
    }
    const placement = getRenderedNotePlacement(lastNote);
    const anchorLane = getSlideAnchorLane(
      { type: lastNote.type, lane: placement.lane, width: lastNote.width },
      "outgoing",
    );
    return {
      x1: (laneToColumn(anchorLane) + 0.5) * LANE_WIDTH,
      y1: beatToY(placement.beat),
      x2: slideBuildCursor.x,
      y2: slideBuildCursor.y,
    };
  }, [LANE_WIDTH, beatToY, getRenderedNotePlacement, getSlideAnchorLane, laneToColumn, noteById, slideBuildCursor, slideBuildState]);

  return {
    deleteTimelineEvent,
    describeBpmEvent,
    describeSvEvent,
    renderSlideSegments,
    slideBuildCommittedGuideLines,
    slideBuildGuideLine,
  };
}











