import { useMemo } from "react";
import type { ChartNote } from "../../chartCore";
import { slideSegmentId, slideSegmentRanges } from "../slideSegments";

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
  /** The Slide segment this connection segment is part of (see slideSegments.ts). */
  slideSegmentId: string;
  isPreviewChain: boolean;
  /** The wider end's lanes (for bounds); the line is fromSpanLanes wide at its from end, toSpanLanes at its to end. */
  spanLanes: number;
  fromSpanLanes: number;
  toSpanLanes: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  deltaX: number;
  deltaY: number;
  minY: number;
  maxY: number;
  /** The line material, as the original picks it for a whole Slide: a curve Slide (one with Hidden nodes) or a
   * long note line. */
  textureKind: "long" | "curveSlide";
  opacity: number;
  muted?: boolean;
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
    getNoteDisplayY,
    getSlideAnchorLane,
    laneToColumn,
    getNoteSpanLanes,
    LANE_WIDTH,
    longLineOpacityScale,
    isSimultaneousLineEnabled,
    isSlideChainMuted,
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
        y: getNoteDisplayY?.(note, placement.beat) ?? beatToY(placement.beat),
        spanLanes,
      });
    }
    return sprites;
  }, [LANE_WIDTH, beatToY, getNoteDisplayY, getNoteSpanLanes, getRenderedNotePlacement, laneToColumn, notes]);

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
        // A note's sync line ends at its centre; a Directional's at the centre of its lane nearest the other note.
        const directional = isDirectionalType(note.type);
        const centerX = normalizeCoord((laneToColumn(startLane) + spanLanes / 2) * LANE_WIDTH);
        const leftX = directional ? normalizeCoord((laneToColumn(startLane) + 0.5) * LANE_WIDTH) : centerX;
        const rightX = directional ? normalizeCoord((laneToColumn(endLane) + 0.5) * LANE_WIDTH) : centerX;
        return {
          id: note.id,
          beat: placement.beat,
          y: normalizeCoord(getNoteDisplayY?.(note, placement.beat) ?? beatToY(placement.beat)),
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
          // As the original (the default skins' sync edge margin is 0): centre to centre, under the notes.
          const fromX = left.rightX;
          const toX = right.leftX;
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
    getNoteDisplayY,
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
      const textureKind: "long" | "curveSlide" = hasHiddenNote ? "curveSlide" : "long";
      const opacity = (isAllHiddenChain ? 0.5 : 1) * longLineOpacityScale;
      const muted = Boolean(isSlideChainMuted?.(chain));
      // Each connection segment (between adjacent chain nodes) carries the id of the Slide segment it is part of.
      const slideSegmentIdByIndex = new Map<number, string>();
      for (const range of slideSegmentRanges(chainNotes)) {
        const segmentId = slideSegmentId(chain.id, range);
        for (let index = range.start; index < range.end; index += 1) {
          slideSegmentIdByIndex.set(index, segmentId);
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
          y: normalizeCoord(getNoteDisplayY?.(note, placement.beat) ?? beatToY(placement.beat)),
          spanLanes,
          directional: isDirectionalType(note.type),
        };
      });

      for (let index = 0; index < chainNotes.length - 1; index += 1) {
        const fromAnchor = chainNodeAnchors[index];
        const toAnchor = chainNodeAnchors[index + 1];
        // As the original's NoteMesh: each end is as wide as its own note's buttons (a Directional member is one),
        // the line's width runs linearly between them.
        const fromSpanLanes = fromAnchor.directional ? 1 : fromAnchor.spanLanes;
        const toSpanLanes = toAnchor.directional ? 1 : toAnchor.spanLanes;
        const spanLanes = Math.max(fromSpanLanes, toSpanLanes);
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
        const segmentId = slideSegmentIdByIndex.get(index) ?? slideSegmentId(chain.id, { start: index, end: index + 1 });
        segments.push({
          chainId: chain.id,
          index,
          slideSegmentId: segmentId,
          isPreviewChain,
          spanLanes,
          fromSpanLanes,
          toSpanLanes,
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
          muted,
        });
      }
    }

    return segments;
  }, [
    LANE_WIDTH,
    beatToY,
    effectiveSlideChains,
    getNoteSpanLanes,
    getNoteDisplayY,
    getRenderedNotePlacement,
    getSlideAnchorLane,
    isSlideChainMuted,
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
