import { useMemo } from "react";
import type { ChartNote } from "../../chartCore";

type RenderTimingSegment = {
  index: number;
  beat: number;
  timeSec: number;
  bpm: number;
  timePerBeat: number;
};

type RenderBpmLine = {
  beat: number;
  bpm: number;
  y: number;
  isBase: boolean;
};

export type RenderConnectionSegment = {
  chainId: string;
  index: number;
  groupId: string;
  groupStart: boolean;
  groupEnd: boolean;
  isPreviewChain: boolean;
  spanLanes: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  deltaX: number;
  deltaY: number;
  minY: number;
  maxY: number;
  textureKind: "long" | "slide";
  opacity: number;
};

export type RenderSimultaneousSegment = {
  key: string;
  beat: number;
  y: number;
  fromX: number;
  toX: number;
  width: number;
};

type RenderNoteSpriteItem = {
  id: string;
  type: ChartNote["type"];
  lane: number;
  beat: number;
  x: number;
  y: number;
  spanLanes: number;
};

function normalizeCoord(value: number): number {
  return value;
}

function isDirectionalType(type: ChartNote["type"]): boolean {
  return type === "directional_flick_left" || type === "directional_flick_right";
}

export function useEditorRenderModel(params: any) {
  const {
    bpmTimeline,
    totalBeats,
    beatToY,
    notes,
    effectiveSlideChains,
    slideBuildState,
    noteById,
    getRenderedNotePlacement,
    getSlideAnchorLane,
    laneToColumn,
    getNoteSpanLanes,
    LANE_WIDTH,
    longLineOpacityScale,
    isSimultaneousLineEnabled,
  } = params;

  const timings = useMemo<RenderTimingSegment[]>(() => {
    return (bpmTimeline ?? []).map((node: any, index: number) => ({
      index,
      beat: Number(node.beat ?? 0),
      timeSec: Number(node.timeSec ?? 0),
      bpm: Number(node.bpm ?? 120),
      timePerBeat: (() => {
        const bpm = Number(node.bpm ?? 120);
        const safeBpm = Math.abs(bpm) < 0.001 ? (bpm < 0 ? -0.001 : 0.001) : bpm;
        return 60 / safeBpm;
      })(),
    }));
  }, [bpmTimeline]);

  const bpmLines = useMemo<RenderBpmLine[]>(() => {
    const lines: RenderBpmLine[] = [];
    for (const node of bpmTimeline ?? []) {
      if (node.beat < 0 || node.beat > totalBeats + 1e-6) {
        continue;
      }
      lines.push({
        beat: node.beat,
        bpm: node.bpm,
        y: beatToY(node.beat),
        isBase: Math.abs(node.beat) < 1e-6,
      });
    }
    return lines;
  }, [beatToY, bpmTimeline, totalBeats]);

  const noteSprites = useMemo<RenderNoteSpriteItem[]>(() => {
    const sprites: RenderNoteSpriteItem[] = [];
    for (const note of notes ?? []) {
      if (note.type === "hidden") {
        continue;
      }
      const placement = getRenderedNotePlacement(note);
      const spanLanes = getNoteSpanLanes(note);
      const startLane =
        note.type === "directional_flick_left"
          ? placement.lane - spanLanes + 1
          : placement.lane;
      sprites.push({
        id: note.id,
        type: note.type,
        lane: placement.lane,
        beat: placement.beat,
        x: (laneToColumn(startLane) + spanLanes / 2) * LANE_WIDTH,
        y: beatToY(placement.beat),
        spanLanes,
      });
    }
    return sprites;
  }, [LANE_WIDTH, beatToY, getNoteSpanLanes, getRenderedNotePlacement, laneToColumn, notes]);

  const simultaneousSegments = useMemo<RenderSimultaneousSegment[]>(() => {
    if (!isSimultaneousLineEnabled) {
      return [];
    }
    const slideMiddleNoteIds = new Set<string>();
    for (const chain of effectiveSlideChains ?? []) {
      const ids = Array.isArray(chain?.noteIds) ? chain.noteIds : [];
      for (let index = 1; index < ids.length - 1; index += 1) {
        const id = ids[index];
        if (typeof id === "string" && id.length > 0) {
          slideMiddleNoteIds.add(id);
        }
      }
    }

    const visibleNotes = (notes ?? []).filter((note: ChartNote) =>
      note.type !== "hidden" && !slideMiddleNoteIds.has(note.id),
    );
    if (visibleNotes.length < 2) {
      return [];
    }

    const laneAnchors = visibleNotes
      .map((note: ChartNote) => {
        const placement = getRenderedNotePlacement(note);
        const spanLanes = getNoteSpanLanes(note);
        const startLane = note.type === "directional_flick_left"
          ? placement.lane - spanLanes + 1
          : placement.lane;
        const endLane = startLane + spanLanes - 1;
        const leftX = normalizeCoord(laneToColumn(startLane) * LANE_WIDTH);
        const rightX = normalizeCoord((laneToColumn(endLane) + 1) * LANE_WIDTH);
        return {
          id: note.id,
          beat: placement.beat,
          y: normalizeCoord(beatToY(placement.beat)),
          sortLane: startLane,
          leftX,
          rightX,
        };
      })
      .sort((left: {
        id: string;
        beat: number;
        y: number;
        sortLane: number;
        leftX: number;
        rightX: number;
      }, right: {
        id: string;
        beat: number;
        y: number;
        sortLane: number;
        leftX: number;
        rightX: number;
      }) => {
        const beatDelta = left.beat - right.beat;
        if (Math.abs(beatDelta) > 1e-6) {
          return beatDelta;
        }
        const laneDelta = left.sortLane - right.sortLane;
        if (Math.abs(laneDelta) > 1e-6) {
          return laneDelta;
        }
        return left.id.localeCompare(right.id);
      });

    const segments: RenderSimultaneousSegment[] = [];
    let index = 0;
    while (index < laneAnchors.length) {
      const groupStart = index;
      const beat = laneAnchors[index].beat;
      while (index + 1 < laneAnchors.length && Math.abs(laneAnchors[index + 1].beat - beat) <= 1e-6) {
        index += 1;
      }
      const groupEnd = index;
      if (groupEnd > groupStart) {
        for (let i = groupStart; i < groupEnd; i += 1) {
          const left = laneAnchors[i];
          const right = laneAnchors[i + 1];
          const extension = LANE_WIDTH * 0.25;
          const fromX = normalizeCoord(left.rightX - extension);
          const toX = normalizeCoord(right.leftX + extension);
          const width = normalizeCoord(toX - fromX);
          if (!Number.isFinite(width) || width <= 1e-6) {
            continue;
          }
          segments.push({
            key: `${beat.toFixed(6)}:${left.id}->${right.id}`,
            beat,
            y: normalizeCoord(left.y),
            fromX,
            toX,
            width,
          });
        }
      }
      index += 1;
    }

    return segments;
  }, [
    LANE_WIDTH,
    beatToY,
    effectiveSlideChains,
    getNoteSpanLanes,
    getRenderedNotePlacement,
    isSimultaneousLineEnabled,
    laneToColumn,
    notes,
  ]);

  const connectionSegments = useMemo<RenderConnectionSegment[]>(() => {
    const segments: RenderConnectionSegment[] = [];
    const previewChain = slideBuildState
      ? {
          id: "__slide_preview__",
          noteIds: slideBuildState.noteIds,
        }
      : null;
    const chains = previewChain ? [...effectiveSlideChains, previewChain] : effectiveSlideChains;

    for (const chain of chains ?? []) {
      const chainNotes = chain.noteIds
        .map((id: string) => noteById.get(id))
        .filter((note: any): note is ChartNote => note !== undefined);
      if (chainNotes.length < 2) {
        continue;
      }

      const isPreviewChain = chain.id === "__slide_preview__";
      const hasHiddenNote = chainNotes.some((note: ChartNote) => note.type === "hidden");
      const isAllHiddenChain = chainNotes.every((note: ChartNote) => note.type === "hidden");
      const textureKind: "long" | "slide" = hasHiddenNote ? "slide" : "long";
      const opacity = (isAllHiddenChain ? 0.5 : 1) * longLineOpacityScale;
      const segmentGroupByIndex = new Map<number, string>();
      const segmentGroupRangeById = new Map<string, { start: number; end: number }>();
      const visibleIndexes = chainNotes
        .map((note: ChartNote, index: number) => ({ note, index }))
        .filter(({ note }: { note: ChartNote }) => note.type !== "hidden")
        .map(({ index }: { index: number }) => index);
      const lastIndex = chainNotes.length - 1;
      const ranges: Array<{ start: number; end: number }> = [];
      if (visibleIndexes.length === 0) {
        ranges.push({ start: 0, end: lastIndex });
      } else {
        const firstVisible = visibleIndexes[0];
        const lastVisible = visibleIndexes[visibleIndexes.length - 1];
        if (firstVisible > 0) {
          ranges.push({ start: 0, end: firstVisible });
        }
        for (let visibleIndex = 0; visibleIndex < visibleIndexes.length - 1; visibleIndex += 1) {
          ranges.push({
            start: visibleIndexes[visibleIndex],
            end: visibleIndexes[visibleIndex + 1],
          });
        }
        if (lastVisible < lastIndex) {
          ranges.push({ start: lastVisible, end: lastIndex });
        }
      }
      for (const range of ranges) {
        if (range.end <= range.start) {
          continue;
        }
        const groupId = `${chain.id}|${range.start}|${range.end}`;
        segmentGroupRangeById.set(groupId, { start: range.start, end: range.end });
        for (let index = range.start; index < range.end; index += 1) {
          segmentGroupByIndex.set(index, groupId);
        }
      }
      const chainNodeAnchors = chainNotes.map((note: ChartNote) => {
        const placement = getRenderedNotePlacement(note);
        const spanLanes = isDirectionalType(note.type)
          ? 1
          : Math.max(1, getNoteSpanLanes(note));
        const incomingAnchorLane = getSlideAnchorLane(
          { type: note.type, lane: placement.lane, width: note.width },
          "incoming",
        );
        const outgoingAnchorLane = getSlideAnchorLane(
          { type: note.type, lane: placement.lane, width: note.width },
          "outgoing",
        );
        return {
          incomingX: normalizeCoord((laneToColumn(incomingAnchorLane) + 0.5) * LANE_WIDTH),
          outgoingX: normalizeCoord((laneToColumn(outgoingAnchorLane) + 0.5) * LANE_WIDTH),
          y: normalizeCoord(beatToY(placement.beat)),
          spanLanes,
          directional: isDirectionalType(note.type),
        };
      });

      for (let index = 0; index < chainNotes.length - 1; index += 1) {
        const fromAnchor = chainNodeAnchors[index];
        const toAnchor = chainNodeAnchors[index + 1];
        const spanLanes = fromAnchor.directional || toAnchor.directional
          ? 1
          : Math.max(fromAnchor.spanLanes, toAnchor.spanLanes);
        const fromX = fromAnchor.outgoingX;
        const fromY = fromAnchor.y;
        const toX = toAnchor.incomingX;
        const toY = toAnchor.y;
        const deltaX = normalizeCoord(toX - fromX);
        const deltaY = normalizeCoord(toY - fromY);
        if (!Number.isFinite(deltaY) || Math.abs(deltaY) <= 1e-6) {
          continue;
        }
        const minY = normalizeCoord(Math.min(fromY, toY));
        const maxY = normalizeCoord(Math.max(fromY, toY));
        const groupId = segmentGroupByIndex.get(index) ?? `${chain.id}|${index}|${index + 1}`;
        const segmentGroupRange = segmentGroupRangeById.get(groupId);
        const groupStart = segmentGroupRange ? index === segmentGroupRange.start : true;
        const groupEnd = segmentGroupRange ? index === segmentGroupRange.end - 1 : true;
        segments.push({
          chainId: chain.id,
          index,
          groupId,
          groupStart,
          groupEnd,
          isPreviewChain,
          spanLanes,
          fromX,
          fromY,
          toX,
          toY,
          deltaX,
          deltaY,
          minY,
          maxY,
          textureKind,
          opacity,
        });
      }
    }

    return segments;
  }, [
    LANE_WIDTH,
    beatToY,
    effectiveSlideChains,
    getNoteSpanLanes,
    getRenderedNotePlacement,
    getSlideAnchorLane,
    laneToColumn,
    noteById,
    slideBuildState,
    longLineOpacityScale,
  ]);

  return {
    timings,
    bpmLines,
    noteSprites,
    simultaneousSegments,
    connectionSegments,
  };
}
