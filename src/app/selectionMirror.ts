import { isGarupaLongSlideShape } from "../chart";
import {
  approxEq,
  isDirectionalNoteType,
  normalizeDirectionalWidth,
  normalizeRhythmWidth,
  type ChartNote,
} from "../chartCore";

/** "horizontal" mirrors left and right (lanes); "vertical" mirrors up and down (beats). */
export type MirrorAxis = "horizontal" | "vertical";

type SlideChainLike = { id: string; noteIds: string[]; long?: true };

export type SelectionMirrorContext<T extends SlideChainLike = SlideChainLike> = {
  notes: readonly ChartNote[];
  slideChains: readonly T[];
  selectedNoteIds: readonly string[];
  habahiro: boolean;
  exGarupa: boolean;
  laneMin: number;
  laneMax: number;
};

export type SelectionMirrorResult<T extends SlideChainLike = SlideChainLike> =
  | { ok: true; notes: ChartNote[]; slideChains: T[] }
  | { ok: false; reason: "overlap" | "out-of-board" | "invalid-slide" };

const EPSILON = 1e-6;
const toFixed6 = (value: number) => Number(value.toFixed(6));

function spanLanes(note: ChartNote, habahiro: boolean): number {
  if (isDirectionalNoteType(note.type)) return normalizeDirectionalWidth(note.width);
  return habahiro && note.type !== "hidden" ? normalizeRhythmWidth(note.width) : 1;
}

function laneBounds(note: ChartNote, habahiro: boolean): { start: number; end: number } {
  const span = spanLanes(note, habahiro);
  if (note.type === "directional_flick_left") return { start: note.lane - span + 1, end: note.lane };
  return { start: note.lane, end: note.lane + span - 1 };
}

/** The mirror tools work on several selected notes, or on selected notes of a Slide that holds Hidden nodes (its
 * Hidden nodes then go with them). */
export function canMirrorSelection(context: SelectionMirrorContext): boolean {
  if (context.selectedNoteIds.length >= 2) return true;
  if (context.selectedNoteIds.length === 0) return false;
  const selected = new Set(context.selectedNoteIds);
  const byId = new Map(context.notes.map(note => [note.id, note] as const));
  return context.slideChains.some(chain => chain.noteIds.some(id => selected.has(id))
    && chain.noteIds.some(id => byId.get(id)?.type === "hidden"));
}

/** Hidden nodes that go with the selected visible nodes of their Slide: those between two selected visible nodes,
 * before a selected first visible node and after a selected last visible node. */
function hiddenNodesWithSelection(context: SelectionMirrorContext, selected: ReadonlySet<string>,
  byId: ReadonlyMap<string, ChartNote>): Set<string> {
  const result = new Set<string>();
  for (const chain of context.slideChains) {
    const nodes = chain.noteIds.map(id => byId.get(id)).filter((note): note is ChartNote => !!note);
    const visible = nodes.flatMap((note, index) => note.type === "hidden" ? [] : [index]);
    if (visible.length === 0) continue;
    const take = (from: number, to: number) => {
      for (let index = from; index < to; index += 1) if (nodes[index]!.type === "hidden") result.add(nodes[index]!.id);
    };
    const first = visible[0]!, last = visible[visible.length - 1]!;
    if (selected.has(nodes[first]!.id)) take(0, first);
    if (selected.has(nodes[last]!.id)) take(last + 1, nodes.length);
    for (let pair = 0; pair + 1 < visible.length; pair += 1) {
      const left = visible[pair]!, right = visible[pair + 1]!;
      if (selected.has(nodes[left]!.id) && selected.has(nodes[right]!.id)) take(left + 1, right);
    }
  }
  return result;
}

/** A Slide's node order after its nodes moved: by beat; nodes that were mirrored together keep reversed order on a
 * tie (a vertical mirror turns them around), the rest keep their order. */
function reorderChain<T extends SlideChainLike>(chain: T, byId: ReadonlyMap<string, ChartNote>,
  flipped: ReadonlySet<string>, axis: MirrorAxis): T {
  const entries = chain.noteIds.map((id, index) => ({ id, index, beat: byId.get(id)?.beat ?? 0 }));
  entries.sort((a, b) => {
    if (Math.abs(a.beat - b.beat) > EPSILON) return a.beat - b.beat;
    return axis === "vertical" && flipped.has(a.id) && flipped.has(b.id) ? b.index - a.index : a.index - b.index;
  });
  const noteIds = entries.map(entry => entry.id);
  return noteIds.every((id, index) => id === chain.noteIds[index]) ? chain : { ...chain, noteIds };
}

/** Whether a Slide is still well formed: a Long keeps the original Long shape; outside ExGarupa a Slide has visible
 * ends, no Flick/Directional head and only Single/Hidden middle nodes. */
function chainShapeValid(chain: SlideChainLike, byId: ReadonlyMap<string, ChartNote>, context: SelectionMirrorContext) {
  const nodes = chain.noteIds.map(id => byId.get(id));
  if (nodes.some(note => !note)) return true;
  const list = nodes as ChartNote[];
  for (let index = 1; index < list.length; index += 1) if (list[index]!.beat < list[index - 1]!.beat - EPSILON) return false;
  if (chain.long === true) {
    const connection = (note: ChartNote) => ({
      type: isDirectionalNoteType(note.type) ? "Directional" : note.type === "skill" ? "Skill"
        : note.type === "flick" ? "Flick" : note.type === "hidden" ? "Hidden" : "Single",
      beat: note.beat, lane: note.lane, width: spanLanes(note, context.habahiro),
      ...(isDirectionalNoteType(note.type) ? { direction: note.type === "directional_flick_left" ? "Left" : "Right" } : {}),
    });
    return isGarupaLongSlideShape({ connections: list.map(connection) as never });
  }
  if (context.exGarupa) return true;
  const head = list[0]!, tail = list[list.length - 1]!;
  if (head.type === "hidden" || tail.type === "hidden") return false;
  if (head.type === "flick" || isDirectionalNoteType(head.type)) return false;
  return list.slice(1, -1).every(note => note.type === "single" || note.type === "hidden");
}

/**
 * Mirrors the selected notes about the centre of their own lane range (horizontal: lanes flip, a Directional turns
 * around) or of their beat range (vertical); the Hidden nodes that go with them follow, and every Slide is re-ordered
 * by beat.
 * The whole mirror is refused when a note would leave the board, overlap another note, or a Slide would no longer be
 * well formed.
 */
export function mirrorSelection<T extends SlideChainLike>(context: SelectionMirrorContext<T>,
  axis: MirrorAxis): SelectionMirrorResult<T> | null {
  if (!canMirrorSelection(context)) return null;
  const { notes, slideChains, habahiro, laneMin, laneMax } = context;
  const byId = new Map(notes.map(note => [note.id, note] as const));
  const changed = new Map<string, ChartNote>();

  const selected = new Set(context.selectedNoteIds.filter(id => byId.has(id)));
  const visible = [...selected].map(id => byId.get(id)!);
  const moving = [...visible, ...[...hiddenNodesWithSelection(context, selected, byId)].map(id => byId.get(id)!)];
  if (axis === "horizontal") {
    const bounds = visible.map(note => laneBounds(note, habahiro));
    const sum = Math.min(...bounds.map(bound => bound.start)) + Math.max(...bounds.map(bound => bound.end));
    for (const note of moving) {
      const bound = laneBounds(note, habahiro);
      const start = toFixed6(sum - bound.end), end = toFixed6(sum - bound.start);
      const type = note.type === "directional_flick_left" ? "directional_flick_right"
        : note.type === "directional_flick_right" ? "directional_flick_left" : note.type;
      changed.set(note.id, { ...note, type, lane: type === "directional_flick_left" ? end : start });
    }
  } else {
    const sum = Math.min(...visible.map(note => note.beat)) + Math.max(...visible.map(note => note.beat));
    for (const note of moving) changed.set(note.id, { ...note, beat: toFixed6(sum - note.beat) });
  }
  if (changed.size === 0) return null;

  const nextNotes = notes.map(note => changed.get(note.id) ?? note);
  const nextById = new Map(nextNotes.map(note => [note.id, note] as const));
  for (const note of changed.values()) {
    const bound = laneBounds(note, habahiro);
    if (bound.start < laneMin - EPSILON || bound.end > laneMax + EPSILON) return { ok: false, reason: "out-of-board" };
    if (note.type === "hidden") continue;
    for (const other of nextNotes) {
      if (changed.has(other.id) || other.type === "hidden" || !approxEq(other.beat, note.beat)) continue;
      const otherBound = laneBounds(other, habahiro);
      if (bound.start <= otherBound.end + EPSILON && otherBound.start <= bound.end + EPSILON) return { ok: false, reason: "overlap" };
    }
  }
  const flipped = new Set(changed.keys());
  const nextChains = slideChains.map(chain => chain.noteIds.some(id => flipped.has(id))
    ? reorderChain(chain, nextById, flipped, axis) : chain);
  for (const chain of nextChains) {
    if (chain.noteIds.some(id => flipped.has(id)) && !chainShapeValid(chain, nextById, context)) {
      return { ok: false, reason: "invalid-slide" };
    }
  }
  return { ok: true, notes: nextNotes, slideChains: nextChains };
}
