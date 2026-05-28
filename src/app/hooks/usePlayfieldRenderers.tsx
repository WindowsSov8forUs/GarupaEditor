import { useMemo, type ReactNode } from "react";
import { projectPlayfieldLineRuntimeAssets } from "../../skinLoader";

export function usePlayfieldRenderers(params: any) {
  const {
    laneValues,
    LANE_WIDTH,
    totalSteps,
    beatDivision,
    beatsPerMeasure,
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
    setStatusMessage,
    setIsToolArmed,
    setBpmEvents,
    setSvEvents,
    slideBuildRef,
    finalizeSlideBuild,
    cancelSlideBuild,
    noteById,
    getRenderedNotePlacement,
    getSlideAnchorLane,
    laneToColumn,
    simultaneousSegments,
    selectedLongLineSegmentId,
    setSelectedLongLineSegmentId,
    connectionSegments,
    skinAssets,
    slideBuildState,
    slideBuildCursor,
    onLongLineContextAction,
    renderBackendMode,
    noteVisualScale,
    isSimultaneousLineEnabled,
  } = params;
  const isCanvasBackend = renderBackendMode === "canvas";
  const beatToTrackY = typeof trackBeatToY === "function" ? trackBeatToY : beatToY;
  const runtimeLineAssets = useMemo(
    () => (skinAssets ? projectPlayfieldLineRuntimeAssets(skinAssets) : null),
    [skinAssets],
  );

  const renderLaneGuides = () => {
    if (isCanvasBackend) {
      return [] as ReactNode[];
    }
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

  const renderGridLines = () => {
    if (isCanvasBackend) {
      return [] as ReactNode[];
    }
    const lines: ReactNode[] = [];

    for (let step = 0; step < totalSteps; step += 1) {
      const beat = step / beatDivision;
      const roundedBeat = Math.round(beat);
      const isWholeBeat = approxEq(beat, roundedBeat);
      const isMeasureStart = isWholeBeat && roundedBeat % beatsPerMeasure === 0;

      const lineClass = `grid-line${isWholeBeat ? " beat" : ""}${isMeasureStart ? " measure" : ""}`;
      lines.push(
        <div
          key={`line-${step}`}
          className={lineClass}
          style={{ top: beatToTrackY(beat) }}
          aria-hidden="true"
        />,
      );
    }

    return lines;
  };

  const renderBpmLines = () => {
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
      const lineY = beatToTrackY(Math.max(0, node.beat + bpmPreviewOffset));
      const lineKey = isBaseLine
        ? "base"
        : (sourceEvent?.id ?? `beat-${node.beat.toFixed(6)}-bpm-${node.bpm.toFixed(6)}`);
      const isSelected = selectionId === BASE_BPM_LINE_ID
        ? selectedBpmEventId === BASE_BPM_LINE_ID
        : selectionId !== null
          ? selectedBpmEventIdSet.has(selectionId)
          : false;
      const handleBpmSelect = (event: any) => {
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
        setStatusMessage(`已选中 BPM 线：Beat ${node.beat.toFixed(3)} / BPM ${node.bpm.toFixed(3)}。`);
      };
      const handleBpmContextMenu = (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        if (selectionId === BASE_BPM_LINE_ID) {
          setSelectedLongLineSegmentId(null);
          clearSelectedNotes();
          clearSelectedBpmEvents();
          setSelectedBpmEventId(BASE_BPM_LINE_ID);
          setStatusMessage("Beat 0 的基础 BPM 线不可删除。");
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
        setStatusMessage("已删除 BPM 线。");
      };

      lines.push(
        <div
          key={`bpm-line-${lineKey}`}
          className={`bpm-marker ${isSelected ? "selected" : ""} ${isCanvasBackend ? "canvas-hitbox" : ""}`}
          style={{ top: lineY, zIndex: nodeIndex + 1 }}
        >
          <button
            type="button"
            className={`bpm-line-button ${isSelected ? "selected" : ""} ${isCanvasBackend ? "canvas-hitbox" : ""}`}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onClick={handleBpmSelect}
            onContextMenu={handleBpmContextMenu}
            title={`BPM ${node.bpm.toFixed(3)} @ Beat ${node.beat.toFixed(3)}`}
          >
            <div className="bpm-line" />
          </button>
          <button
            type="button"
            className={`bpm-label-button ${isSelected ? "selected" : ""} ${isCanvasBackend ? "canvas-hitbox" : ""}`}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onClick={handleBpmSelect}
            onContextMenu={handleBpmContextMenu}
          >
            BPM {node.bpm.toFixed(2)}
          </button>
        </div>,
      );
    }

    return lines;
  };



  const renderSimultaneousSegments = () => {
    if (isCanvasBackend) {
      return [] as ReactNode[];
    }
    if (!isSimultaneousLineEnabled) {
      return [] as ReactNode[];
    }
    const texture = runtimeLineAssets?.simultaneousLine;
    if (!texture) {
      return [] as ReactNode[];
    }
    const segments: ReactNode[] = [];
    for (const segment of simultaneousSegments ?? []) {
      if (!Number.isFinite(segment.width) || segment.width <= 1e-6) {
        continue;
      }
      segments.push(
        <div
          key={`simultaneous-segment-${segment.key}`}
          className="simultaneous-segment"
          style={{
            left: segment.fromX,
            top: segment.y,
            width: segment.width,
          }}
          aria-hidden="true"
        >
          <img src={texture} alt="" className="simultaneous-segment-image" draggable={false} />
        </div>,
      );
    }
    return segments;
  };

  const renderSvLines = () => {
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
      const lineY = beatToTrackY(event.beat);
      const handleSvSelect = (mouseEvent: any) => {
        if (isSvInteractionDisabled) {
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
        setStatusMessage(`已选中 SV：Beat ${event.beat.toFixed(3)} / ×${event.value.toFixed(3)}。`);
      };
      const handleSvContextMenu = (mouseEvent: any) => {
        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();
        if (isSvInteractionDisabled) {
          return;
        }
        setSvEvents((previous: any[]) => previous.filter((item) => item.id !== event.id));
        setSelectedSvEventId(null);
        setSelectedSvEventIds([]);
        setStatusMessage("已删除 SV 线。");
      };
      lines.push(
        <div
          key={`sv-line-${event.id}`}
          className={`bpm-marker sv-marker ${eventTimingGroup !== "#Global" ? "non-global" : ""} ${isSelected ? "selected" : ""} ${isSvInteractionDisabled ? "timing-group-muted" : ""} ${isCanvasBackend ? "canvas-hitbox" : ""}`}
          style={{ top: lineY }}
        >
          <button
            type="button"
            className={`bpm-line-button sv-line-button ${isSelected ? "selected" : ""} ${isCanvasBackend ? "canvas-hitbox" : ""}`}
            disabled={isSvInteractionDisabled}
            onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
            onClick={handleSvSelect}
            onContextMenu={handleSvContextMenu}
            title={`×${event.value.toFixed(3)} @ Beat ${event.beat.toFixed(3)}`}
          >
            <div className="bpm-line sv-line" />
          </button>
          <button
            type="button"
            className={`bpm-label-button sv-label-button ${isSelected ? "selected" : ""} ${isCanvasBackend ? "canvas-hitbox" : ""}`}
            disabled={isSvInteractionDisabled}
            onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
            onClick={handleSvSelect}
            onContextMenu={handleSvContextMenu}
          >
            ×{event.value.toFixed(2)}
          </button>
        </div>,
      );
    }
    return lines;
  };

  const renderSlideSegments = (
    visibleWindow: { top: number; bottom: number } | null = null,
  ) => {
    const segments: ReactNode[] = [];
    const longTexture = runtimeLineAssets?.longLine;
    const slideTexture = runtimeLineAssets?.longLineSpecial;
    for (const segment of connectionSegments ?? []) {
      if (
        isCanvasBackend
        && visibleWindow
        && (segment.maxY < visibleWindow.top - 8 || segment.minY > visibleWindow.bottom + 8)
      ) {
        continue;
      }
      const isPreviewChain = segment.isPreviewChain;
      const lineTexture = segment.textureKind === "slide" ? slideTexture : longTexture;
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
      const lineWidth = LANE_WIDTH * Math.max(1, segment.spanLanes) * noteVisualScale;
      const segmentGroupId = segment.groupId;
      const isGroupStart = segment.groupStart;
      const isGroupEnd = segment.groupEnd;
      const isMuted = Boolean(segment.muted);
      const isSelectedGroup = !isPreviewChain && selectedLongLineSegmentId === segmentGroupId;
      segments.push(
        <div
          key={`slide-segment-${segment.chainId}-${segment.index}`}
          className={`slide-segment ${isPreviewChain || isMuted ? "" : "selectable"} ${isSelectedGroup ? "selected" : ""} ${isGroupStart ? "group-start" : ""} ${isGroupEnd ? "group-end" : ""} ${isMuted ? "timing-group-muted" : ""} ${isCanvasBackend ? "hitbox-only" : ""}`}
          style={{
            left: topX - lineWidth * 0.5,
            top: topY,
            width: lineWidth,
            height,
            transform: `skewX(${skewDeg}deg)`,
          }}
          onMouseDown={(event) => {
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
          }}
          onClick={(event) => {
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
            if (slideBuildRef.current) {
              return;
            }
            setSelectedLongLineSegmentId(segmentGroupId);
            clearSelectedNotes();
            clearSelectedBpmEvents();
            setSelectedBpmEventId(null);
            setStatusMessage("已选中 Slide 连接段。");
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
                finalizeSlideBuild({ disarmTool: true, statusMessage: "已完成 Slide 创建。" });
              } else {
                cancelSlideBuild("已取消 Slide 创建并取消 Slide 工具。");
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
            setStatusMessage("已选中 Slide 连接段。");
          }}
          aria-hidden={isPreviewChain}
        >
          {!isCanvasBackend && (
            <img
              src={lineTexture}
              alt=""
              className="slide-segment-image"
              draggable={false}
              style={{
                opacity: segment.opacity * (isMuted ? 0.36 : 1),
              }}
            />
          )}
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
    renderGridLines,
    renderSimultaneousSegments,
    renderBpmLines,
    renderSvLines,
    renderSlideSegments,
    slideBuildCommittedGuideLines,
    slideBuildGuideLine,
  };
}











