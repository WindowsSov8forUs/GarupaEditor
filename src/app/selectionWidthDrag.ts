import {
  approxEq,
  isDirectionalNoteType,
  isRhythmWidthEditableType,
  limitDirectionalWidening,
  normalizeDirectionalWidth,
  normalizeRhythmWidth,
  noteLaneSpanStart,
  type ChartNote,
} from "../chartCore";

/** The selection frame edge being dragged; its lane delta moves that edge (positive: to the right). */
export type SelectionWidthEdge = "left" | "right";

type SlideChainLike = { id?: string; noteIds: string[]; long?: true };

export type SelectionWidthContext = {
  notes: readonly ChartNote[];
  selectedNoteIds: readonly string[];
  slideChains: readonly SlideChainLike[];
  habahiro: boolean;
  /** Directionals widen without limit (HABAHIRO or ExGarupa); otherwise up to DIRECTIONAL_WIDTH_LIMIT. */
  directionalUnlimited: boolean;
  laneMin: number;
  laneMax: number;
};

/** HABAHIRO caps a rhythm note's width; a Directional is capped only outside HABAHIRO and ExGarupa (directionalUnlimited). */
const RHYTHM_WIDTH_MAX = 7;

function spanLanes(note: ChartNote, habahiro: boolean): number {
  if (isDirectionalNoteType(note.type)) return normalizeDirectionalWidth(note.width);
  return habahiro ? normalizeRhythmWidth(note.width) : 1;
}

function laneBounds(note: ChartNote, habahiro: boolean): { start: number; end: number } {
  const span = spanLanes(note, habahiro);
  const start = noteLaneSpanStart(note.type, note.lane, span);
  return { start, end: start + span - 1 };
}

/** The note with its lane span set to [start, end]: a Directional is anchored at its root end, any other note at its
 * centre. */
function withBounds(note: ChartNote, start: number, end: number): ChartNote {
  const width = end - start + 1;
  const lane = note.type === "directional_flick_left" ? end : note.type === "directional_flick_right" ? start
    : (start + end) / 2;
  return { ...note, lane, width };
}

/**
 * Whether the selection can be resized from the frame: every selected note is a Directional, or (HABAHIRO only)
 * a rhythm note whose width is editable. Outside HABAHIRO one non-Directional note hides the handles.
 */
export function canResizeSelectionWidth({ notes, selectedNoteIds, habahiro }: SelectionWidthContext): boolean {
  if (selectedNoteIds.length === 0) return false;
  const selected = new Set(selectedNoteIds);
  let any = false;
  for (const note of notes) {
    if (!selected.has(note.id)) continue;
    any = true;
    if (isDirectionalNoteType(note.type)) continue;
    if (!habahiro || note.type === "hidden" || !isRhythmWidthEditableType(note.type)) return false;
  }
  return any;
}

/**
 * The notes after moving one edge of every selected note by `delta` lanes, or null when that change is not
 * allowed for all of them: one note that cannot take it (width below 1, a HABAHIRO rhythm width above 7, a lane
 * outside the board, an overlap at its beat) stops the whole change.
 *
 * A Long keeps its shape: a non-Directional endpoint takes its partner along (a non-Directional partner takes the
 * same lanes; a Directional tail moves to the head's new centre lane), and a Directional tail may only change
 * width without moving its lane.
 */
export function planSelectionWidthChange(context: SelectionWidthContext, edge: SelectionWidthEdge,
  delta: number): ChartNote[] | null {
  const { notes, selectedNoteIds, slideChains, habahiro, laneMin, laneMax } = context;
  if (delta === 0 || !canResizeSelectionWidth(context)) return null;
  const selected = new Set(selectedNoteIds);
  const byId = new Map(notes.map(note => [note.id, note] as const));
  const longChainByNoteId = new Map<string, SlideChainLike>();
  for (const chain of slideChains) {
    if (chain.long === true) for (const id of chain.noteIds) longChainByNoteId.set(id, chain);
  }

  const changed = new Map<string, ChartNote>();
  for (const id of selectedNoteIds) {
    const note = byId.get(id);
    if (!note) continue;
    const bounds = laneBounds(note, habahiro);
    const start = edge === "left" ? bounds.start + delta : bounds.start;
    const end = edge === "right" ? bounds.end + delta : bounds.end;
    if (end < start) return null;
    const directional = isDirectionalNoteType(note.type);
    if (!directional && end - start + 1 > RHYTHM_WIDTH_MAX) return null;
    if (directional && limitDirectionalWidening(bounds.end - bounds.start + 1, end - start + 1,
      context.directionalUnlimited) !== end - start + 1) return null;
    const next = withBounds(note, start, end);
    const chain = longChainByNoteId.get(id);
    if (chain) {
      const partnerId = chain.noteIds.find(other => other !== id);
      const partner = partnerId === undefined ? undefined : byId.get(partnerId);
      if (directional) {
        // A Directional Long tail sits on the head's centre lane; only its width may change.
        if (!approxEq(next.lane, note.lane)) return null;
      } else if (partner && !selected.has(partner.id)) {
        changed.set(partner.id, isDirectionalNoteType(partner.type)
          // The root the original keeps, ⌊(first + last) / 2⌋ counted from the span's first lane.
          ? { ...partner, lane: Number((start + Math.floor((end - start) / 2)).toFixed(6)) }
          : withBounds(partner, start, end));
      }
    }
    changed.set(id, next);
  }
  if (changed.size === 0) return null;

  const next = notes.map(note => changed.get(note.id) ?? note);

  // Every note whose lanes changed must stay on the board and clear every other note at its beat.
  const moved = next.filter((note, index) => note !== notes[index]);
  const movedIds = new Set(moved.map(note => note.id));
  for (const note of moved) {
    if (note.type === "hidden") continue;
    const bounds = laneBounds(note, habahiro);
    if (bounds.start < laneMin - 1e-6 || bounds.end > laneMax + 1e-6) return null;
    for (const other of next) {
      if (other.id === note.id || other.type === "hidden" || !approxEq(other.beat, note.beat)) continue;
      // A pair of moved notes is checked once.
      if (movedIds.has(other.id) && other.id < note.id) continue;
      const otherBounds = laneBounds(other, habahiro);
      if (bounds.start <= otherBounds.end && otherBounds.start <= bounds.end) return null;
    }
  }
  return next;
}

/**
 * The delta the drag actually applies: walking from 0 toward `raw`, the last step the whole selection can take
 * (the frame stops before the first width that is not allowed, so it never jumps past a blocking note).
 */
export function allowedSelectionWidthDelta(context: SelectionWidthContext, edge: SelectionWidthEdge,
  raw: number): number {
  const step = raw > 0 ? 1 : -1;
  let allowed = 0;
  for (let delta = step; Math.abs(delta) <= Math.abs(raw); delta += step) {
    if (!planSelectionWidthChange(context, edge, delta)) break;
    allowed = delta;
  }
  return allowed;
}
