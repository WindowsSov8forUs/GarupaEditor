import { useCallback } from "react";
import {
  isDirectionalNoteType,
  normalizeDirectionalWidth,
  normalizeRhythmWidth,
  type ChartNote,
} from "../../chartCore";
import { parseSlideSegmentId } from "../slideSegments";
import { parseBeatStep, resolveSlideShape, type SlideFitSettings, type SlideShapeNode } from "../slideFitShapes";

/**
 * A segment end as a shape sees it: the lane the line passes the note at (a Directional's near or far member, a
 * HABAHIRO note's centre) and the line's width there in lanes (a Directional's member is one lane wide, a HABAHIRO
 * note its own width, any other note one), as the board draws the line (useEditorRenderModel).
 */
function shapeEndOf(note: ChartNote, mode: "incoming" | "outgoing", habahiro: boolean): SlideShapeNode {
  if (isDirectionalNoteType(note.type)) {
    const span = normalizeDirectionalWidth(note.width);
    const lane = mode === "incoming" ? note.lane
      : note.type === "directional_flick_right" ? note.lane + span - 1 : note.lane - span + 1;
    return { beat: note.beat, lane, width: 1 };
  }
  if (!habahiro) return { beat: note.beat, lane: note.lane, width: 1 };
  const width = normalizeRhythmWidth(note.width);
  return { beat: note.beat, lane: note.lane + (width - 1) / 2, width };
}

export function useSlideSegmentActions(params: any) {
  const {
    slideChains,
    notes,
    isHabahiroEnabled,
    setSlideChains,
    setNotes,
    sortNotes,
    showDialog,
    createId,
  } = params;

  const applySlideSegmentSettings = useCallback(
    (segmentId: string | null, settings: SlideFitSettings): boolean => {
      if (!segmentId) {
        return false;
      }
      const parsed = parseSlideSegmentId(segmentId);
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

      if (!parseBeatStep(settings.fit.precision)) {
        return false;
      }
      const habahiro = Boolean(isHabahiroEnabled);
      // Under HABAHIRO a placed node takes the shape's width there, rounded to a note width (whole lanes, 1 to 7),
      // and sits centred on the shape's lane; otherwise it is one lane on it.
      const generatedNotes: ChartNote[] = resolveSlideShape(settings,
        shapeEndOf(startNote, "outgoing", habahiro), shapeEndOf(endNote, "incoming", habahiro),
      ).map((node) => {
        const width = habahiro ? normalizeRhythmWidth(Math.round(node.width)) : null;
        return {
          id: createId(),
          type: "hidden",
          lane: Number((width === null ? node.lane : node.lane - (width - 1) / 2).toFixed(20)),
          beat: node.beat,
          ...(width === null ? {} : { width }),
        };
      });
      for (const generated of generatedNotes) {
        noteMap.set(generated.id, generated);
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
      return true;
    },
    [
      createId,
      isHabahiroEnabled,
      notes,
      setNotes,
        setSlideChains,
      showDialog,
      slideChains,
      sortNotes,
    ],
  );

  return {
    applySlideSegmentSettings,
  };
}


