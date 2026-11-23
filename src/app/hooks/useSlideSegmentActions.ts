import { useCallback } from "react";
import {
  isDirectionalNoteType,
  normalizeDirectionalWidth,
  normalizeRhythmWidth,
  type ChartNote,
} from "../../chartCore";
import { findSlideSegmentByKey, parseSlideSegmentId, slideSegmentKey } from "../slideSegments";
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
  return { beat: note.beat, lane: note.lane, width: normalizeRhythmWidth(note.width) };
}

/**
 * The chart with the shape `settings` names applied to the Slide segment `key` (see slideSegmentKey): its Hidden nodes
 * are replaced by the shape's. Null when the segment is gone or the settings are unusable.
 */
function shapeSlideSegment(notes: ChartNote[], slideChains: any[], key: string, settings: SlideFitSettings,
  habahiro: boolean, createId: () => string): { notes: ChartNote[]; slideChains: any[] } | null {
  const noteMap = new Map<string, ChartNote>(notes.map((note) => [note.id, note] as const));
  const found = findSlideSegmentByKey(slideChains, noteMap, key);
  if (!found || !parseBeatStep(settings.fit.precision)) return null;
  const { chain, range: { start, end } } = found;
  const chainNoteIds: string[] = chain.noteIds;
  const startNote = noteMap.get(chainNoteIds[start]!)!, endNote = noteMap.get(chainNoteIds[end]!)!;
  // Under HABAHIRO a placed node takes the shape's width there, rounded to a note width (whole lanes, 1 to 7),
  // and sits centred on the shape's lane; otherwise it is one lane on it.
  const generatedNotes: ChartNote[] = resolveSlideShape(settings,
    shapeEndOf(startNote, "outgoing", habahiro), shapeEndOf(endNote, "incoming", habahiro),
  ).map((node) => {
    const width = habahiro ? normalizeRhythmWidth(Math.round(node.width)) : null;
    return {
      id: createId(),
      type: "hidden",
      lane: Number(node.lane.toFixed(20)),
      beat: node.beat,
      ...(width === null ? {} : { width }),
    };
  });
  const interiorIds = chainNoteIds.slice(start + 1, end);
  const noteUsageCount = new Map<string, number>();
  for (const other of slideChains) {
    for (const noteId of other.noteIds) noteUsageCount.set(noteId, (noteUsageCount.get(noteId) ?? 0) + 1);
  }
  const removable = new Set(interiorIds.filter((id) => (noteUsageCount.get(id) ?? 0) <= 1));
  const nextChainNoteIds = [...chainNoteIds.slice(0, start + 1), ...generatedNotes.map((note) => note.id),
    ...chainNoteIds.slice(end)];
  return {
    notes: [...notes.filter((note) => !removable.has(note.id)), ...generatedNotes],
    slideChains: slideChains
      .map((other) => (other === chain ? { ...other, noteIds: nextChainNoteIds } : other))
      .filter((other) => other.noteIds.length >= 2),
  };
}

export function useSlideSegmentActions(params: any) {
  const {
    slideChains,
    notes,
    isHabahiroEnabled,
    setSlideChains,
    setNotes,
    sortNotes,
    createId,
  } = params;

  /** Applies the shape `settings` names to the Slide segments `keys`, one after another, as one edit. */
  const applySlideSegmentSettingsByKeys = useCallback(
    (keys: readonly string[], settings: SlideFitSettings): boolean => {
      let next: { notes: ChartNote[]; slideChains: any[] } = { notes, slideChains };
      let changed = false;
      for (const key of keys) {
        const shaped = shapeSlideSegment(next.notes, next.slideChains, key, settings, Boolean(isHabahiroEnabled), createId);
        if (!shaped) continue;
        next = shaped;
        changed = true;
      }
      if (!changed) return false;
      setNotes(sortNotes(next.notes));
      setSlideChains(next.slideChains);
      return true;
    },
    [createId, isHabahiroEnabled, notes, setNotes, setSlideChains, slideChains, sortNotes],
  );

  /** Applies the shape `settings` names to the Slide segment `segmentId` (see slideSegmentId). */
  const applySlideSegmentSettings = useCallback(
    (segmentId: string | null, settings: SlideFitSettings): boolean => {
      const parsed = segmentId ? parseSlideSegmentId(segmentId) : null;
      const chain = parsed ? slideChains.find((other: any) => other.id === parsed.chainId) : undefined;
      if (!parsed || !chain || !chain.noteIds[parsed.start] || !chain.noteIds[parsed.end]) return false;
      return applySlideSegmentSettingsByKeys([slideSegmentKey(chain, parsed)], settings);
    },
    [applySlideSegmentSettingsByKeys, slideChains],
  );

  return {
    applySlideSegmentSettings,
    applySlideSegmentSettingsByKeys,
  };
}
