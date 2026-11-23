import {
  isDirectionalNoteType,
  normalizeDirectionalWidth,
  type ChartNote,
} from "../chartCore";
import { cleanupSlideChainsHidden } from "./slideChainCleanup";
import { findSlideSegmentByKey, type SlideSegmentRange } from "./slideSegments";

/*
 * Deletion: every delete input (the delete button, the Delete key, a right-click on a note or on a Slide segment)
 * deletes the selected Slide segments (`planSlideSegmentDeletion`, which cuts each Slide there) and then the selected
 * notes (`planNoteDeletion`).
 */

type SlideChainLike = { id: string; noteIds: string[]; long?: true };

export type NoteDeletionContext<T extends SlideChainLike> = {
  notes: readonly ChartNote[];
  slideChains: readonly T[];
  noteIds: readonly string[];
  /** SP rhythm notes: a deleted visible Slide node becomes Hidden. */
  spRhythm: boolean;
  /** ExGarupa: Slides may be headless, tailless or all Hidden; a Slide split at a segment keeps Hidden bridges and
   * the segment as an all-Hidden Slide. */
  exGarupa: boolean;
  createId: () => string;
};

export type NoteDeletion<T extends SlideChainLike> = { notes: ChartNote[]; slideChains: T[] };

/** The chart after deleting `noteIds`, or null when none of them exists. */
export function planNoteDeletion<T extends SlideChainLike>(context: NoteDeletionContext<T>): NoteDeletion<T> | null {
  const byId = new Map(context.notes.map(note => [note.id, note] as const));
  const noteIds = new Set(context.noteIds.filter(id => byId.has(id)));
  if (noteIds.size === 0) return null;
  return deleteNotesWithHiddenFallback(context, noteIds);
}

/** The chart after deleting the Slide segments `segmentKeys` names (see slideSegmentKey), one after another, or null
 * when none of them exists. */
export function planSlideSegmentDeletion<T extends SlideChainLike>(
  context: Omit<NoteDeletionContext<T>, "noteIds" | "spRhythm"> & { segmentKeys: readonly string[] },
): NoteDeletion<T> | null {
  let notes = [...context.notes], slideChains = [...context.slideChains];
  let changed = false;
  for (const key of context.segmentKeys) {
    const byId = new Map(notes.map(note => [note.id, note] as const));
    const segment = findSlideSegmentByKey(slideChains, byId, key);
    if (!segment) continue;
    ({ notes, slideChains } = splitSlideAtSegment({ ...context, notes, slideChains }, segment.chain, segment.range));
    changed = true;
  }
  return changed ? { notes, slideChains } : null;
}

/** A Hidden copy of a node where a Slide line leaves it ("outgoing": a Directional's far end) or arrives at it. */
function hiddenCopy(source: ChartNote, anchor: "incoming" | "outgoing", id: string): ChartNote {
  let lane = source.lane;
  if (anchor === "outgoing" && isDirectionalNoteType(source.type)) {
    const span = normalizeDirectionalWidth(source.width);
    lane = source.type === "directional_flick_right" ? source.lane + span - 1 : source.lane - span + 1;
  }
  return {
    ...source,
    id,
    type: "hidden",
    lane: Number(lane.toFixed(6)),
    width: typeof source.width === "number" && Number.isFinite(source.width) ? source.width : 1,
  };
}

/** The note turned Hidden in place. */
function toHidden(note: ChartNote): ChartNote {
  return {
    id: note.id,
    type: "hidden",
    lane: note.lane,
    beat: note.beat,
    width: typeof note.width === "number" && Number.isFinite(note.width) ? note.width : 1,
  };
}

/**
 * Deletes a Slide segment: the Slide is cut at both its end notes, which stay (an end that was the Slide's head or
 * tail is left a note of its own).
 *
 * Under ExGarupa a piece left on either side gets a Hidden bridge at the cut, on the cut's beat (so its end node keeps
 * its middle-node role), and the segment stays as an all-Hidden Slide between Hidden copies of its end notes. Without
 * ExGarupa the segment's Hidden nodes go. An all-Hidden Slide goes as a whole.
 */
function splitSlideAtSegment<T extends SlideChainLike>(
  context: Pick<NoteDeletionContext<T>, "notes" | "slideChains" | "exGarupa" | "createId">, chain: T,
  { start, end }: SlideSegmentRange): NoteDeletion<T> {
  const { exGarupa, createId } = context;
  const byId = new Map(context.notes.map(note => [note.id, note] as const));
  const nodes = chain.noteIds.map(id => byId.get(id)!);
  const last = nodes.length - 1;
  const removed = new Set<string>();
  const added: ChartNote[] = [];
  const pieces: T[] = [];
  const piece = (noteIds: string[]) => {
    if (noteIds.length >= 2) pieces.push({ ...chain, id: createId(), noteIds });
  };
  const copy = (index: number, anchor: "incoming" | "outgoing") => {
    const note = hiddenCopy(nodes[index]!, anchor, createId());
    added.push(note);
    return note.id;
  };

  if (nodes.every(note => note.type === "hidden")) {
    for (const id of chain.noteIds) removed.add(id);
  } else {
    if (start > 0) piece([...chain.noteIds.slice(0, start + 1),
      ...(exGarupa && nodes[start]!.type !== "hidden" ? [copy(start, "outgoing")] : [])]);

    const inner = chain.noteIds.slice(start + 1, end);
    if (exGarupa) piece([copy(start, "outgoing"), ...inner, copy(end, "incoming")]);
    else for (const id of inner) removed.add(id);

    if (end < last) piece([...(exGarupa && nodes[end]!.type !== "hidden" ? [copy(end, "incoming")] : []),
      ...chain.noteIds.slice(end)]);
  }

  const noteMap = new Map(byId);
  for (const note of added) noteMap.set(note.id, note);
  const replaced = cleanupSlideChainsHidden({ chains: pieces, noteMap, minLength: 2 });
  return {
    notes: [...context.notes.filter(note => !removed.has(note.id)), ...added],
    slideChains: context.slideChains.flatMap(other => other === chain ? replaced : [other]),
  };
}

/**
 * Deletes notes. A Long goes as a whole when any of its notes is deleted. Without SP rhythm notes a note is removed
 * and leaves its Slide. With them a visible Slide node becomes Hidden, anything else is removed, and a Slide that
 * lost an end and has no visible node left goes as a whole. Without ExGarupa a Slide then loses the Hidden nodes at
 * its ends, so it never ends up headless, tailless or all Hidden.
 * A Slide needs two nodes; Hidden nodes left outside every Slide are removed by the editor's orphan cleanup.
 */
function deleteNotesWithHiddenFallback<T extends SlideChainLike>(context: NoteDeletionContext<T>,
  noteIds: ReadonlySet<string>): NoteDeletion<T> {
  const byId = new Map(context.notes.map(note => [note.id, note] as const));
  const removed = new Set<string>();
  const hidden = new Set<string>();

  let chains = context.slideChains.filter(chain => {
    if (chain.long !== true || !chain.noteIds.some(id => noteIds.has(id))) return true;
    for (const id of chain.noteIds) removed.add(id);
    return false;
  });
  const rest = [...noteIds].filter(id => !removed.has(id));

  if (!context.spRhythm) {
    for (const id of rest) removed.add(id);
    chains = chains.flatMap(chain => {
      const remaining = chain.noteIds.filter(id => !removed.has(id));
      if (remaining.length === chain.noteIds.length) return [chain];
      return remaining.length >= 2 ? [{ ...chain, noteIds: remaining }] : [];
    });
  } else {
    const inSlide = new Set(chains.flatMap(chain => chain.noteIds));
    const toRemove = new Set<string>();
    for (const id of rest) {
      if (inSlide.has(id) && byId.get(id)!.type !== "hidden") hidden.add(id);
      else toRemove.add(id);
    }
    if (hidden.size > 0) {
      const projected = new Map(byId);
      for (const id of hidden) projected.set(id, toHidden(byId.get(id)!));
      chains = cleanupSlideChainsHidden({ chains, noteMap: projected, minLength: 1 });
    }
    if (toRemove.size > 0) {
      chains = chains.flatMap(chain => {
        const remaining = chain.noteIds.filter(id => !toRemove.has(id));
        if (remaining.length === chain.noteIds.length) return [chain];
        const lostEnd = toRemove.has(chain.noteIds[0]!) || toRemove.has(chain.noteIds[chain.noteIds.length - 1]!);
        const noVisibleLeft = remaining.every(id => hidden.has(id) || byId.get(id)?.type === "hidden");
        return remaining.length < 2 || (lostEnd && noVisibleLeft) ? [] : [{ ...chain, noteIds: remaining }];
      });
    }
    for (const id of toRemove) removed.add(id);
  }

  // Without ExGarupa a Slide keeps visible ends: Hidden nodes left at an end of a Slide the deletion touched (a
  // deleted end node turned Hidden included) go, and a Slide left with fewer than two nodes goes as a whole (a
  // visible node of it stays as a note of its own).
  if (!context.exGarupa) {
    const isHidden = (id: string) => hidden.has(id) || byId.get(id)?.type === "hidden";
    const touched = new Set(context.slideChains
      .filter(chain => chain.noteIds.some(id => noteIds.has(id)))
      .map(chain => chain.id));
    chains = chains.flatMap(chain => {
      if (!touched.has(chain.id)) return [chain];
      let start = 0, end = chain.noteIds.length;
      while (start < end && isHidden(chain.noteIds[start]!)) start += 1;
      while (end > start && isHidden(chain.noteIds[end - 1]!)) end -= 1;
      if (end - start < 2) return [];
      return start === 0 && end === chain.noteIds.length ? [chain] : [{ ...chain, noteIds: chain.noteIds.slice(start, end) }];
    });
    const inSlide = new Set(chains.flatMap(chain => chain.noteIds));
    for (const chain of context.slideChains) {
      if (!touched.has(chain.id)) continue;
      for (const id of chain.noteIds) {
        if (!inSlide.has(id) && isHidden(id)) { removed.add(id); hidden.delete(id); }
      }
    }
  }

  return {
    notes: context.notes.flatMap(note => removed.has(note.id) ? [] : [hidden.has(note.id) ? toHidden(note) : note]),
    slideChains: chains,
  };
}
