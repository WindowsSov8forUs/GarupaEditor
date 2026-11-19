import { editorSlideLineWidth } from "../editorNoteMetrics";
import { useMemo, type ReactNode } from "react";
import { projectPlayfieldLineRuntimeAssets } from "../../skinLoader";

export function usePlayfieldRenderers(params: any) {
  const {
    laneValues,
    LANE_WIDTH,
    approxEq,
    beatToY,
    trackBeatToY,
    bpmTimeline,
    totalBeats,
    bpmEvents,
    svEvents,
    BASE_BPM_LINE_ID,
    selectionMovePreview,
    selectedBpmEventIdSet,
    selectedBpmEventId,
    selectedSvEventIdSet,
    selectedSvEventId,
    isTimingGroupModeActive,
    selectedTimingGroupId,
    setSelectedSvEventIds,
    setSelectedSvEventId,
    setSelectedBpmEventIds,
    setSelectedBpmEventId,
    clearSelectedNotes,
    clearSelectedBpmEvents,
    setIsToolArmed,
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
    selectedLongLineSegmentId,
    setSelectedLongLineSegmentId,
    connectionSegments,
    skinAssets,
    slideBuildState,
    slideBuildCursor,
    onLongLineContextAction,
    onSlideToolLongLineClick,
    noteVisualScale,
  } = params;
  const isPlacementNoteTool = isToolArmed && tool !== "bpm" && tool !== "sv" && tool !== "copy" && tool !== "paste";
  const isPasteToolSelected = isToolArmed && tool === "paste";
  const shouldBypassLongLineLeftClick = isPlacementNoteTool || isPasteToolSelected;
  const beatToTrackY = typeof trackBeatToY === "function" ? trackBeatToY : beatToY;
  const runtimeLineAssets = useMemo(
    () => (skinAssets ? projectPlayfieldLineRuntimeAssets(skinAssets) : null),
    [skinAssets],
  );
  const resolveTimelineLineY = (
    lineY: number,
    options?: { viewportHitbox?: boolean; scrollTop?: number; scale?: number },
  ) => {
    if (!options?.viewportHitbox) {
      return lineY;
    }
    const scale = Number.isFinite(options.scale) ? Number(options.scale) : 1;
    const scrollTop = Number.isFinite(options.scrollTop) ? Number(options.scrollTop) : 0;
    return lineY * scale - scrollTop;
  };

  const renderLaneGuides = () => {
    const guides: ReactNode[] = [];

    for (let column = 1; column < laneValues.length; column += 1) {
      guides.push(
        <div
          key={`lane-guide-${column}`}
          className="lane-guide"
          style={{ left: column * LANE_WIDTH }}
          aria-hidden="true"
        />,
      );
    }

    return guides;
  };


  const renderBpmLines = (options?: { viewportHitbox?: boolean; scrollTop?: number; scale?: number }) => {
    const lines: ReactNode[] = [];

    for (let nodeIndex = 0; nodeIndex < bpmTimeline.length; nodeIndex += 1) {
      const node = bpmTimeline[nodeIndex];
      if (node.beat < 0 || node.beat > totalBeats + 1e-6) {
        continue;
      }

      const isBaseLine = approxEq(node.beat, 0);
      const sourceEvent = isBaseLine
        ? null
        : (bpmEvents.find((event: any) => approxEq(event.beat, node.beat)) ?? null);
      const selectionId = isBaseLine ? BASE_BPM_LINE_ID : sourceEvent?.id ?? null;
      const bpmPreviewOffset =
        selectionMovePreview?.isDragging &&
        selectionId !== null &&
        selectionId !== BASE_BPM_LINE_ID &&
        selectedBpmEventIdSet.has(selectionId)
          ? selectionMovePreview.beatDelta
          : 0;
      const lineY = resolveTimelineLineY(
        beatToTrackY(Math.max(0, node.beat + bpmPreviewOffset)),
        options,
      );
      const lineKey = isBaseLine
        ? "base"
        : (sourceEvent?.id ?? `beat-${node.beat.toFixed(6)}-bpm-${node.bpm.toFixed(6)}`);
      const isSelected = selectionId === BASE_BPM_LINE_ID
        ? selectedBpmEventId === BASE_BPM_LINE_ID
        : selectionId !== null
          ? selectedBpmEventIdSet.has(selectionId)
          : false;
      const shouldHandleBpmLineEvent = () => !isToolArmed;
      const handleBpmSelect = (event: any) => {
        if (!shouldHandleBpmLineEvent()) {
          return;
        }
        event.stopPropagation();
        setSelectedLongLineSegmentId(null);
        clearSelectedNotes();
        if (selectionId === BASE_BPM_LINE_ID) {
          clearSelectedBpmEvents();
          setSelectedBpmEventId(BASE_BPM_LINE_ID);
        } else if (selectionId) {
          setSelectedBpmEventId(selectionId);
          setSelectedBpmEventIds([selectionId]);
        }
        setIsToolArmed(false);
      };
      const handleBpmContextMenu = (event: any) => {
        if (!shouldHandleBpmLineEvent()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (selectionId === BASE_BPM_LINE_ID) {
          setSelectedLongLineSegmentId(null);
          clearSelectedNotes();
          clearSelectedBpmEvents();
          setSelectedBpmEventId(BASE_BPM_LINE_ID);
          return;
        }

        const activeSlideBuild = slideBuildRef.current;
        if (activeSlideBuild) {
          if (activeSlideBuild.persistUntilRightClick) {
            finalizeSlideBuild({ disarmTool: true, statusMessage: "已完成 Slide 创建。" });
          } else {
            cancelSlideBuild("已取消 Slide 创建并取消 Slide 工具。");
          }
          return;
        }

        if (!sourceEvent?.id) {
          return;
        }

        setBpmEvents((previous: any[]) => previous.filter((event) => event.id !== sourceEvent.id));
        setSelectedBpmEventId(null);
        clearSelectedBpmEvents();
      };

      lines.push(
        <div
          key={`bpm-line-${lineKey}`}
          className={`bpm-marker ${isSelected ? "selected" : ""} canvas-hitbox`}
          style={{ top: lineY, zIndex: nodeIndex + 1 }}
        >
          <button
            type="button"
            className={`bpm-line-button ${isSelected ? "selected" : ""} canvas-hitbox`}
            onMouseDown={(event) => {
              if (shouldHandleBpmLineEvent()) {
                event.stopPropagation();
              }
            }}
            onClick={handleBpmSelect}
            onContextMenu={handleBpmContextMenu}
            title={`BPM ${node.bpm.toFixed(3)} @ Beat ${node.beat.toFixed(3)}`}
          >
            <div className="bpm-line" />
          </button>
          <span className={`bpm-label-button ${isSelected ? "selected" : ""} canvas-hitbox`}>
            BPM {node.bpm.toFixed(2)}
          </span>
        </div>,
      );
    }

    return lines;
  };





  const renderSvLines = (options?: { viewportHitbox?: boolean; scrollTop?: number; scale?: number }) => {
    const lines: ReactNode[] = [];
    for (const event of svEvents ?? []) {
      if (event.beat < 0 || event.beat > totalBeats + 1e-6) {
        continue;
      }
      const isSelected = selectedSvEventIdSet?.has(event.id) || selectedSvEventId === event.id;
      const eventTimingGroup = typeof event.timingGroup === "string" && event.timingGroup.trim().length > 0
        ? event.timingGroup.trim()
        : "#Global";
      const isSvInteractionDisabled =
        isTimingGroupModeActive && eventTimingGroup !== selectedTimingGroupId;
      const lineY = resolveTimelineLineY(beatToTrackY(event.beat), options);
      const shouldHandleSvLineEvent = () => !isToolArmed && !isSvInteractionDisabled;
      const handleSvSelect = (mouseEvent: any) => {
        if (!shouldHandleSvLineEvent()) {
          return;
        }
        mouseEvent.stopPropagation();
        setSelectedLongLineSegmentId(null);
        clearSelectedNotes();
        clearSelectedBpmEvents();
        setSelectedBpmEventId(null);
        setSelectedSvEventId(event.id);
        setSelectedSvEventIds([event.id]);
        setIsToolArmed(false);
      };
      const handleSvContextMenu = (mouseEvent: any) => {
        if (!shouldHandleSvLineEvent()) {
          return;
        }
        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();
        setSvEvents((previous: any[]) => previous.filter((item) => item.id !== event.id));
        setSelectedSvEventId(null);
        setSelectedSvEventIds([]);
      };
      lines.push(
        <div
          key={`sv-line-${event.id}`}
          className={`bpm-marker sv-marker ${eventTimingGroup !== "#Global" ? "non-global" : ""} ${isSelected ? "selected" : ""} ${isSvInteractionDisabled ? "timing-group-muted" : ""} canvas-hitbox`}
          style={{ top: lineY }}
        >
          <button
            type="button"
            className={`bpm-line-button sv-line-button ${isSelected ? "selected" : ""} canvas-hitbox`}
            disabled={isSvInteractionDisabled}
            onMouseDown={(mouseEvent) => {
              if (shouldHandleSvLineEvent()) {
                mouseEvent.stopPropagation();
              }
            }}
            onClick={handleSvSelect}
            onContextMenu={handleSvContextMenu}
            title={`×${event.value.toFixed(3)} @ Beat ${event.beat.toFixed(3)}`}
          >
            <div className="bpm-line sv-line" />
          </button>
          <span className={`bpm-label-button sv-label-button ${isSelected ? "selected" : ""} canvas-hitbox`}>
            ×{event.value.toFixed(2)}
          </span>
        </div>,
      );
    }
    return lines;
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
      const segmentGroupId = segment.groupId;
      const isGroupStart = segment.groupStart;
      const isGroupEnd = segment.groupEnd;
      const isMuted = Boolean(segment.muted);
      const isSelectedGroup = !isPreviewChain && selectedLongLineSegmentId === segmentGroupId;
      segments.push(
        <div
          key={`slide-segment-${segment.chainId}-${segment.index}`}
          className={`slide-segment ${isPreviewChain || isMuted ? "" : "selectable"} ${isSelectedGroup ? "selected" : ""} ${isGroupStart ? "group-start" : ""} ${isGroupEnd ? "group-end" : ""} ${isMuted ? "timing-group-muted" : ""} hitbox-only`}
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
            if (isToolArmed && tool === "slide") {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (shouldBypassLongLineLeftClick) {
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
            if (isToolArmed && tool === "slide") {
              event.preventDefault();
              event.stopPropagation();
              if (slideBuildRef.current) {
                return;
              }
              if (typeof onSlideToolLongLineClick === "function") {
                onSlideToolLongLineClick(segment, event);
              }
              return;
            }
            if (shouldBypassLongLineLeftClick) {
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
            setSelectedLongLineSegmentId(segmentGroupId);
            clearSelectedNotes();
            clearSelectedBpmEvents();
            setSelectedBpmEventId(null);
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
            const handled = typeof onLongLineContextAction === "function"
              ? onLongLineContextAction(segmentGroupId)
              : false;
            if (handled) {
              return;
            }
            setSelectedLongLineSegmentId(segmentGroupId);
            clearSelectedNotes();
            clearSelectedBpmEvents();
            setSelectedBpmEventId(null);
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
    renderLaneGuides,
    renderBpmLines,
    renderSvLines,
    renderSlideSegments,
    slideBuildCommittedGuideLines,
    slideBuildGuideLine,
  };
}











