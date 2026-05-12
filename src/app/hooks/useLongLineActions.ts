import { useCallback } from "react";
import {
  isDirectionalNoteType,
  normalizeDirectionalWidth,
  normalizeRhythmWidth,
  type ChartNote,
} from "../../chartCore";
import type {
  LongLineCurveType,
  LongLineDivision,
  LongLinePrecision,
  LongLineShape,
} from "./useLongLineEditorSettings";
import { cleanupSlideChainsHidden } from "../slideChainCleanup";

const EPSILON = 1e-6;

type LongLineApplySettings = {
  shape: LongLineShape;
  curveType: LongLineCurveType | null;
  precision: LongLinePrecision;
  division: LongLineDivision;
  vibration: number;
};

function parseSegmentGroupId(segmentGroupId: string): { chainId: string; start: number; end: number } | null {
  const match = segmentGroupId.match(/^(.*)\|(-?\d+)\|(-?\d+)$/);
  if (!match) {
    return null;
  }
  const chainId = match[1] ?? "";
  const start = Number(match[2]);
  const end = Number(match[3]);
  if (!chainId || !Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return { chainId, start, end };
}

function buildSegmentRanges(
  chainNoteIds: string[],
  noteMap: Map<string, ChartNote>,
): Array<{ start: number; end: number }> {
  if (!Array.isArray(chainNoteIds) || chainNoteIds.length < 2) {
    return [];
  }
  const notesByIndex: Array<ChartNote | null> = chainNoteIds.map((id) => noteMap.get(id) ?? null);
  const visibleIndexes = notesByIndex
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => note !== null && note.type !== "hidden")
    .map(({ index }) => index);
  const lastIndex = notesByIndex.length - 1;
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
  return ranges.filter((range) => range.end > range.start);
}

function resolveNextSegmentGroupId(args: {
  chainId: string;
  chainNoteIds: string[];
  noteMap: Map<string, ChartNote>;
  preferredStart: number;
  preferredEnd: number;
}): string | null {
  const { chainId, chainNoteIds, noteMap, preferredStart, preferredEnd } = args;
  const ranges = buildSegmentRanges(chainNoteIds, noteMap);
  if (ranges.length === 0) {
    return null;
  }

  const lastIndex = chainNoteIds.length - 1;
  const anchorStart = Math.max(0, Math.min(lastIndex - 1, Math.floor(preferredStart)));
  const anchorEnd = Math.max(anchorStart + 1, Math.min(lastIndex, Math.floor(preferredEnd)));

  const exact = ranges.find((range) => range.start === anchorStart && range.end === anchorEnd);
  if (exact) {
    return `${chainId}|${exact.start}|${exact.end}`;
  }

  const containingStart = ranges.find((range) => anchorStart >= range.start && anchorStart < range.end);
  if (containingStart) {
    return `${chainId}|${containingStart.start}|${containingStart.end}`;
  }

  const containingEnd = ranges.find((range) => anchorEnd > range.start && anchorEnd <= range.end);
  if (containingEnd) {
    return `${chainId}|${containingEnd.start}|${containingEnd.end}`;
  }

  const anchorCenter = (anchorStart + anchorEnd) / 2;
  const nearest = ranges.reduce((best, current) => {
    const bestCenter = (best.start + best.end) / 2;
    const currentCenter = (current.start + current.end) / 2;
    return Math.abs(currentCenter - anchorCenter) < Math.abs(bestCenter - anchorCenter) ? current : best;
  }, ranges[0]);
  return `${chainId}|${nearest.start}|${nearest.end}`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function parseBeatStep(value: string): number | null {
  if (value === "-") {
    return null;
  }
  if (value === "1") {
    return 1;
  }
  const fraction = value.match(/^1\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[1]);
    if (Number.isFinite(denominator) && denominator > 0) {
      return 1 / denominator;
    }
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function getBaseShapeLaneResolver(
  shape: LongLineShape,
  beat0: number,
  lane0: number,
  beat1: number,
  lane1: number,
): (beat: number) => number {
  const beatDelta = beat1 - beat0;
  const laneDelta = lane1 - lane0;
  if (!Number.isFinite(beatDelta) || Math.abs(beatDelta) <= EPSILON) {
    return () => lane0;
  }

  const mapLaneByProgress = (progress: number): number => lane0 + laneDelta * clamp01(progress);
  const progressFromBeat = (beat: number): number => clamp01((beat - beat0) / beatDelta);

  switch (shape) {
    case "line":
      return (beat: number) => mapLaneByProgress(progressFromBeat(beat));
    case "sine":
      return (beat: number) => {
        const t = progressFromBeat(beat);
        return mapLaneByProgress(1 - Math.cos((Math.PI / 2) * t));
      };
    case "quad":
      return (beat: number) =>
        lane0 + laneDelta * (progressFromBeat(beat) ** 2);
    case "cubic":
      return (beat: number) =>
        lane0 + laneDelta * (progressFromBeat(beat) ** 3);
    case "quart":
      return (beat: number) =>
        lane0 + laneDelta * (progressFromBeat(beat) ** 4);
    case "quint":
      return (beat: number) =>
        lane0 + laneDelta * (progressFromBeat(beat) ** 5);
    case "expo":
      return (beat: number) => {
        const t = progressFromBeat(beat);
        if (Math.abs(beat - beat0) <= EPSILON || t <= 0) {
          return lane0;
        }
        if (t >= 1) {
          return lane1;
        }
        return lane0 + laneDelta * (2 ** (10 * (t - 1)));
      };
    case "semicircle":
      return (beat: number) => {
        const t = progressFromBeat(beat);
        return lane0 + laneDelta * (1 - Math.sqrt(1 - t * t));
      };
    case "back":
      return (beat: number) => {
        const t = progressFromBeat(beat);
        // Ease In Back with the standard overshoot constant s = 1.70158
        return lane0 + laneDelta * (t * t * (2.70158 * t - 1.70158));
      };
    case "elastic":
      return (beat: number) => {
        const t = progressFromBeat(beat);
        if (Math.abs(t) <= EPSILON) {
          return lane0;
        }
        if (Math.abs(t - 1) <= EPSILON) {
          return lane1;
        }
        const f = -(2 ** (10 * t - 10)) * Math.sin((10 * t - 10.75) * ((2 * Math.PI) / 3));
        return lane0 + laneDelta * f;
      };
    case "bounce":
      return (beat: number) => {
        const t = progressFromBeat(beat);
        if (Math.abs(t) <= EPSILON) {
          return lane0;
        }
        if (Math.abs(t - 1) <= EPSILON) {
          return lane1;
        }

        const easeOutBounce = (x: number): number => {
          if (x < 4 / 11) {
            return (121 / 16) * x * x;
          }
          if (x < 8 / 11) {
            const d = x - 6 / 11;
            return (121 / 16) * d * d + 3 / 4;
          }
          if (x < 10 / 11) {
            const d = x - 9 / 11;
            return (121 / 16) * d * d + 15 / 16;
          }
          const d = x - 21 / 22;
          return (121 / 16) * d * d + 63 / 64;
        };

        const f = 1 - easeOutBounce(1 - t);
        return lane0 + laneDelta * f;
      };
    default:
      return (beat: number) => mapLaneByProgress(progressFromBeat(beat));
  }
}

function resolveShapeLane(
  shape: LongLineShape,
  _curveType: LongLineCurveType | null,
  beat: number,
  beat0: number,
  lane0: number,
  beat1: number,
  lane1: number,
): number {
  const resolver = getBaseShapeLaneResolver(shape, beat0, lane0, beat1, lane1);
  return resolver(beat);
}

function isForwardBeatRange(beat0: number, beat1: number): boolean {
  return beat1 >= beat0;
}

function resolveCurveLane(
  shape: LongLineShape,
  curveType: LongLineCurveType | null,
  beat: number,
  beat0: number,
  lane0: number,
  beat1: number,
  lane1: number,
): number {
  const beatDelta = beat1 - beat0;
  const laneDelta = lane1 - lane0;
  if (
    !Number.isFinite(beatDelta)
    || Math.abs(beatDelta) <= EPSILON
    || !Number.isFinite(laneDelta)
    || shape === "line"
  ) {
    return resolveShapeLane(shape, curveType, beat, beat0, lane0, beat1, lane1);
  }

  const applyIn = (
    targetBeat: number,
    startBeat: number,
    startLane: number,
    endBeat: number,
    endLane: number,
  ) => resolveShapeLane(shape, curveType, targetBeat, startBeat, startLane, endBeat, endLane);

  const applyOut = (
    targetBeat: number,
    startBeat: number,
    startLane: number,
    endBeat: number,
    endLane: number,
  ) => applyIn(targetBeat, endBeat, endLane, startBeat, startLane);

  const resolvedCurveType = curveType ?? "in";
  const midpointBeat = beat0 + beatDelta / 2;
  const midpointLane = lane0 + laneDelta / 2;
  const isForward = isForwardBeatRange(beat0, beat1);
  const inFirstHalf = isForward ? beat <= midpointBeat : beat >= midpointBeat;

  switch (resolvedCurveType) {
    case "out":
      return applyOut(beat, beat0, lane0, beat1, lane1);
    case "in_out":
      if (inFirstHalf) {
        return applyIn(beat, beat0, lane0, midpointBeat, midpointLane);
      }
      return applyOut(beat, midpointBeat, midpointLane, beat1, lane1);
    case "out_in":
      if (inFirstHalf) {
        return applyOut(beat, beat0, lane0, midpointBeat, midpointLane);
      }
      return applyIn(beat, midpointBeat, midpointLane, beat1, lane1);
    case "in":
    default:
      return applyIn(beat, beat0, lane0, beat1, lane1);
  }
}

function resolveShapeLaneByBeat(
  shape: LongLineShape,
  curveType: LongLineCurveType | null,
  beat0: number,
  lane0: number,
  beat1: number,
  lane1: number,
  beat: number,
): number {
  const beatDelta = beat1 - beat0;
  if (!Number.isFinite(beatDelta) || Math.abs(beatDelta) <= EPSILON) {
    return lane0;
  }
  return resolveCurveLane(shape, curveType, beat, beat0, lane0, beat1, lane1);
}

function buildLaneByBeatResolver(
  shape: LongLineShape,
  curveType: LongLineCurveType | null,
  beat0: number,
  lane0: number,
  beat1: number,
  lane1: number,
): (beat: number) => number {
  const beatDelta = beat1 - beat0;
  if (!Number.isFinite(beatDelta) || Math.abs(beatDelta) <= EPSILON) {
    return () => lane0;
  }

  return (beat: number) => resolveShapeLaneByBeat(shape, curveType, beat0, lane0, beat1, lane1, beat);
}

function resolveFirstRhythmWidth(noteIds: readonly string[], noteMap: Map<string, ChartNote>): number | null {
  for (const noteId of noteIds) {
    const note = noteMap.get(noteId);
    if (note && !isDirectionalNoteType(note.type)) {
      return normalizeRhythmWidth(note.width);
    }
  }
  return null;
}

function resolveHabahiroPathAnchorLane(
  note: ChartNote,
  mode: "incoming" | "outgoing",
  rhythmWidth: number,
): number {
  if (isDirectionalNoteType(note.type)) {
    const span = normalizeDirectionalWidth(note.width);
    if (mode === "incoming") {
      return note.lane;
    }
    return note.type === "directional_flick_right"
      ? note.lane + span - 1
      : note.lane - span + 1;
  }
  return note.lane + (rhythmWidth - 1) / 2;
}

function isDivisionPoint(distanceBeat: number, divisionStep: number | null): boolean {
  if (!divisionStep || divisionStep <= EPSILON) {
    return false;
  }
  const ratio = distanceBeat / divisionStep;
  return Math.abs(ratio - Math.round(ratio)) <= 1e-5;
}

function postProcessSplitChains(
  chains: Array<{ id: string; noteIds: string[] }>,
  noteMap: Map<string, ChartNote>,
): Array<{ id: string; noteIds: string[] }> {
  return cleanupSlideChainsHidden({
    chains,
    noteMap,
    minLength: 2,
  });
}

function makeSplit(args: {
  chainNoteIds: string[];
  start: number;
  end: number;
  keepMiddle: boolean;
  useHiddenBridge: boolean;
  shouldProcessBefore: boolean;
  shouldProcessAfter: boolean;
  noteMap: Map<string, ChartNote>;
  createId: () => string;
}): {
  chains: Array<{ id: string; noteIds: string[] }>;
  hidden: ChartNote[];
} {
  const {
    chainNoteIds,
    start,
    end,
    keepMiddle,
    useHiddenBridge,
    shouldProcessBefore,
    shouldProcessAfter,
    noteMap,
    createId,
  } = args;

  const beforeIds = chainNoteIds.slice(0, start + 1);
  const middleSourceIds = chainNoteIds.slice(start, end + 1);
  const afterIds = chainNoteIds.slice(end);
  const chains: Array<{ id: string; noteIds: string[] }> = [];
  const hidden: ChartNote[] = [];

  const createHiddenClone = (
    sourceId: string | undefined,
    anchorMode: "incoming" | "outgoing" | null = null,
  ): string | null => {
    if (!sourceId) {
      return null;
    }
    const source = noteMap.get(sourceId);
    if (!source) {
      return null;
    }
    const hiddenLane = (() => {
      if (!anchorMode || !isDirectionalNoteType(source.type)) {
        return source.lane;
      }
      const span = normalizeDirectionalWidth(source.width);
      if (anchorMode === "incoming") {
        return source.lane;
      }
      return source.type === "directional_flick_right"
        ? source.lane + span - 1
        : source.lane - span + 1;
    })();
    const hiddenClone = {
      ...source,
      id: createId(),
      type: "hidden" as const,
      lane: Number(hiddenLane.toFixed(6)),
      width: typeof source.width === "number" && Number.isFinite(source.width) ? source.width : 1,
    };
    hidden.push(hiddenClone);
    noteMap.set(hiddenClone.id, hiddenClone);
    return hiddenClone.id;
  };

  if (shouldProcessBefore) {
    if (useHiddenBridge) {
      const firstTailHiddenId = createHiddenClone(chainNoteIds[start], "outgoing");
      if (firstTailHiddenId) {
        beforeIds.push(firstTailHiddenId);
      }
    }
    if (beforeIds.length >= 2) {
      chains.push({ id: createId(), noteIds: beforeIds });
    }
  }

  if (keepMiddle && middleSourceIds.length >= 2) {
    const hiddenCloneIds = middleSourceIds
      .map((noteId: string, index: number) => {
        const anchorMode = index === 0
          ? "outgoing"
          : index === middleSourceIds.length - 1
            ? "incoming"
            : null;
        return createHiddenClone(noteId, anchorMode);
      })
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (hiddenCloneIds.length >= 2) {
      chains.push({
        id: createId(),
        noteIds: hiddenCloneIds,
      });
    }
  }

  if (shouldProcessAfter) {
    if (useHiddenBridge) {
      const thirdHeadHiddenId = createHiddenClone(chainNoteIds[end], "incoming");
      if (thirdHeadHiddenId) {
        afterIds.unshift(thirdHeadHiddenId);
      }
    }
    if (afterIds.length >= 2) {
      chains.push({ id: createId(), noteIds: afterIds });
    }
  }

  return { chains, hidden };
}

export function useLongLineActions(params: any) {
  const {
    slideChains,
    notes,
    isHabahiroEnabled,
    spRhythmNoteEnabled,
    setSlideChains,
    setNotes,
    sortNotes,
    setSelectedLongLineSegmentId,
    setStatusMessage,
    createId,
  } = params;

  const splitLongLineSegment = useCallback(
    (segmentGroupId: string, options?: { deleteMiddle?: boolean }): boolean => {
      const parsed = parseSegmentGroupId(segmentGroupId);
      if (!parsed) {
        return false;
      }

      const sourceChain = slideChains.find((chain: any) => chain.id === parsed.chainId);
      if (!sourceChain || !Array.isArray(sourceChain.noteIds) || sourceChain.noteIds.length < 2) {
        return false;
      }

      const noteMap = new Map<string, ChartNote>(
        (notes as ChartNote[]).map((note: ChartNote) => [note.id, note] as const),
      );
      const chainNotes: ChartNote[] = (sourceChain.noteIds as string[])
        .map((id: string) => noteMap.get(id))
        .filter((note: ChartNote | undefined): note is ChartNote => note !== undefined);
      if (chainNotes.length < 2) {
        return false;
      }
      const chainNoteIds = chainNotes.map((note: ChartNote) => note.id);

      if (chainNotes.every((note: ChartNote) => note.type === "hidden")) {
        setSlideChains((previous: any[]) => previous.filter((chain) => chain.id !== sourceChain.id));
        setSelectedLongLineSegmentId(null);
        setStatusMessage("已删除全 Hidden 的 Slide 序列。");
        return true;
      }

      const lastIndex = chainNotes.length - 1;
      const start = Math.max(0, Math.min(lastIndex - 1, Math.floor(parsed.start)));
      const end = Math.max(start + 1, Math.min(lastIndex, Math.floor(parsed.end)));
      const startNote = chainNotes[start];
      const endNote = chainNotes[end];
      if (!startNote || !endNote) {
        return false;
      }
      const useHiddenBridge = spRhythmNoteEnabled === true;
      const keepMiddle = useHiddenBridge ? !(options?.deleteMiddle ?? false) : false;
      const split = makeSplit({
        chainNoteIds,
        start,
        end,
        keepMiddle,
        useHiddenBridge,
        shouldProcessBefore: startNote.type !== "hidden",
        shouldProcessAfter: endNote.type !== "hidden",
        noteMap,
        createId,
      });

      const cleanedNextChains = postProcessSplitChains(split.chains, noteMap);

      if (split.hidden.length > 0) {
        setNotes((previous: any[]) => sortNotes([...previous, ...split.hidden]));
      }

      setSlideChains((previous: any[]) => {
        const filtered = previous.filter((chain) => chain.id !== sourceChain.id);
        return [...filtered, ...cleanedNextChains];
      });
      setSelectedLongLineSegmentId(null);
      setStatusMessage(
        options?.deleteMiddle
          ? "已分割 Slide 并删除中段 longLine。"
          : "已按选中 longLine 分割 Slide 序列。",
      );
      return true;
    },
    [
      createId,
      notes,
      setNotes,
      setSelectedLongLineSegmentId,
      setSlideChains,
      setStatusMessage,
      slideChains,
      sortNotes,
      spRhythmNoteEnabled,
    ],
  );

  const deleteSelectedLongLineSegment = useCallback(
    (segmentGroupId: string | null): boolean => {
      if (!segmentGroupId) {
        return false;
      }
      return splitLongLineSegment(segmentGroupId, { deleteMiddle: true });
    },
    [splitLongLineSegment],
  );

  const applyLongLineSettings = useCallback(
    (segmentGroupId: string | null, settings: LongLineApplySettings): boolean => {
      if (!segmentGroupId) {
        return false;
      }
      const parsed = parseSegmentGroupId(segmentGroupId);
      if (!parsed) {
        return false;
      }

      const sourceChain = slideChains.find((chain: any) => chain.id === parsed.chainId);
      if (!sourceChain || !Array.isArray(sourceChain.noteIds) || sourceChain.noteIds.length < 2) {
        return false;
      }

      const noteMap = new Map<string, ChartNote>(
        (notes as ChartNote[]).map((note: ChartNote) => [note.id, note] as const),
      );
      const chainNoteIds: string[] = sourceChain.noteIds.filter((id: string) => noteMap.has(id));
      if (chainNoteIds.length < 2) {
        return false;
      }

      const lastIndex = chainNoteIds.length - 1;
      const start = Math.max(0, Math.min(lastIndex - 1, Math.floor(parsed.start)));
      const end = Math.max(start + 1, Math.min(lastIndex, Math.floor(parsed.end)));
      if (end <= start) {
        return false;
      }

      const startId = chainNoteIds[start];
      const endId = chainNoteIds[end];
      const startNote = noteMap.get(startId) as any | undefined;
      const endNote = noteMap.get(endId) as any | undefined;
      if (!startNote || !endNote) {
        return false;
      }

      const precisionStep = parseBeatStep(settings.precision);
      if (!precisionStep || precisionStep <= EPSILON) {
        return false;
      }
      const divisionStep = parseBeatStep(settings.division);
      const beatDelta = endNote.beat - startNote.beat;
      const totalDistance = Math.abs(beatDelta);
      const direction = beatDelta >= 0 ? 1 : -1;
      const generatedRhythmWidth = isHabahiroEnabled
        ? (resolveFirstRhythmWidth(chainNoteIds, noteMap) ?? 1)
        : null;
      const startPathLane = generatedRhythmWidth === null
        ? startNote.lane
        : resolveHabahiroPathAnchorLane(startNote, "outgoing", generatedRhythmWidth);
      const endPathLane = generatedRhythmWidth === null
        ? endNote.lane
        : resolveHabahiroPathAnchorLane(endNote, "incoming", generatedRhythmWidth);
      const resolveLaneByBeat = buildLaneByBeatResolver(
        settings.shape,
        settings.curveType,
        startNote.beat,
        startPathLane,
        endNote.beat,
        endPathLane,
      );

      const generatedNotes: ChartNote[] = [];
      if (settings.precision !== "1" && totalDistance > EPSILON) {
        for (let stepIndex = 1; ; stepIndex += 1) {
          const distanceBeat = stepIndex * precisionStep;
          if (distanceBeat >= totalDistance - EPSILON) {
            break;
          }
          const beat = Number((startNote.beat + direction * distanceBeat).toFixed(20));
          const pathLane = resolveLaneByBeat(beat);
          const lane = Number((generatedRhythmWidth === null
            ? pathLane
            : pathLane - (generatedRhythmWidth - 1) / 2).toFixed(20));

          const convertedToSingle = isDivisionPoint(distanceBeat, divisionStep);
          const generated: ChartNote = {
            id: createId(),
            type: convertedToSingle ? "single" : "hidden",
            lane,
            beat,
            ...(generatedRhythmWidth === null ? {} : { width: generatedRhythmWidth }),
          };
          generatedNotes.push(generated);
          noteMap.set(generated.id, generated);
        }
      }

      const vibration = Number.isFinite(settings.vibration) ? Number(settings.vibration) : 0;
      if (Math.abs(vibration) > EPSILON && generatedNotes.length > 0) {
        for (let index = 0; index < generatedNotes.length; index += 1) {
          const cycle = index % 4;
          const offset = cycle === 0 ? vibration : cycle === 2 ? -vibration : 0;
          if (Math.abs(offset) <= EPSILON) {
            continue;
          }
          const current = generatedNotes[index];
          if (!current) {
            continue;
          }
          const nextLane = Number((Number(current.lane) + offset).toFixed(20));
          current.lane = nextLane;
          noteMap.set(current.id, current);
        }
      }

      const interiorIds = chainNoteIds.slice(start + 1, end);
      const noteUsageCount = new Map<string, number>();
      for (const chain of slideChains) {
        for (const noteId of chain.noteIds) {
          noteUsageCount.set(noteId, (noteUsageCount.get(noteId) ?? 0) + 1);
        }
      }
      const removableInteriorIdSet = new Set(
        interiorIds.filter((id: string) => (noteUsageCount.get(id) ?? 0) <= 1),
      );

      const generatedIds = generatedNotes.map((note) => note.id);
      const nextChainNoteIds = [
        ...chainNoteIds.slice(0, start + 1),
        ...generatedIds,
        ...chainNoteIds.slice(end),
      ];
      const mappedEnd = start + 1 + generatedIds.length;
      const nextSegmentGroupId = resolveNextSegmentGroupId({
        chainId: sourceChain.id,
        chainNoteIds: nextChainNoteIds,
        noteMap,
        preferredStart: start,
        preferredEnd: mappedEnd,
      });

      if (generatedNotes.length > 0 || removableInteriorIdSet.size > 0) {
        setNotes((previous: any[]) =>
          sortNotes([
            ...previous.filter((note) => !removableInteriorIdSet.has(note.id)),
            ...generatedNotes,
          ]),
        );
      }

      setSlideChains((previous: any[]) =>
        previous
          .map((chain) => (chain.id === sourceChain.id ? { ...chain, noteIds: nextChainNoteIds } : chain))
          .filter((chain) => chain.noteIds.length >= 2),
      );
      if (nextSegmentGroupId) {
        setSelectedLongLineSegmentId(nextSegmentGroupId);
      }
      setStatusMessage("已应用当前 longLine 样式。");
      return true;
    },
    [
      createId,
      isHabahiroEnabled,
      notes,
      setNotes,
      setSelectedLongLineSegmentId,
      setSlideChains,
      setStatusMessage,
      slideChains,
      sortNotes,
    ],
  );

  return {
    splitLongLineSegment,
    deleteSelectedLongLineSegment,
    applyLongLineSettings,
  };
}


