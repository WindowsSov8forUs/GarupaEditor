/*
 * Slide segments.
 *
 * A Slide segment is the part of a Slide between two adjacent visible nodes, with the Hidden nodes between them; a
 * run of Hidden nodes before the first or after the last visible node is a segment of its own, and an all-Hidden
 * Slide is one segment. It is what the editor selects, highlights and deletes as a unit, and what the line shape
 * settings apply to.
 *
 * On the board a segment is drawn as connection segments (`RenderConnectionSegment`), one for each pair of adjacent
 * chain nodes in it; each carries its segment's id.
 *
 * A segment is selected on its own (by its key, its two end notes' ids, which edits inside it keep): it is drawn
 * highlighted, deleting it cuts its Slide there (noteDeletion.ts), and the Curve tool applies its shape to it.
 */

/** A segment as chain node indices: `start` and `end` are its end nodes. */
export type SlideSegmentRange = { start: number; end: number };

/** The segments of a Slide, from its nodes in chain order. */
export function slideSegmentRanges(nodes: readonly { type: string }[]): SlideSegmentRange[] {
  const last = nodes.length - 1;
  if (last < 1) return [];
  const visible = nodes.flatMap((note, index) => note.type === "hidden" ? [] : [index]);
  if (visible.length === 0) return [{ start: 0, end: last }];
  const ranges: SlideSegmentRange[] = [];
  if (visible[0]! > 0) ranges.push({ start: 0, end: visible[0]! });
  for (let index = 0; index + 1 < visible.length; index += 1) {
    ranges.push({ start: visible[index]!, end: visible[index + 1]! });
  }
  if (visible[visible.length - 1]! < last) ranges.push({ start: visible[visible.length - 1]!, end: last });
  return ranges;
}

/** A segment's id: `${chainId}|${start}|${end}`. */
export function slideSegmentId(chainId: string, range: SlideSegmentRange): string {
  return `${chainId}|${range.start}|${range.end}`;
}

export function parseSlideSegmentId(segmentId: string): ({ chainId: string } & SlideSegmentRange) | null {
  const match = segmentId.match(/^(.*)\|(-?\d+)\|(-?\d+)$/);
  if (!match || !match[1]) return null;
  const start = Number(match[2]), end = Number(match[3]);
  return Number.isFinite(start) && Number.isFinite(end) ? { chainId: match[1], start, end } : null;
}

/** A segment's key: its two end notes' ids, which stay the same as nodes inside it come and go. */
export function slideSegmentKey(chain: { noteIds: readonly string[] }, range: SlideSegmentRange): string {
  return `${chain.noteIds[range.start]}>${chain.noteIds[range.end]}`;
}

/** The Slide segment with the key `key`, if any. A Long has no segments of its own: it goes and is edited as a
 * whole. */
export function findSlideSegmentByKey<T extends { id: string; noteIds: string[]; long?: true }>(
  chains: readonly T[], byId: ReadonlyMap<string, { type: string }>, key: string,
): { chain: T; range: SlideSegmentRange } | null {
  for (const chain of chains) {
    if (chain.long === true || !chain.noteIds.every(id => byId.has(id))) continue;
    const range = slideSegmentRanges(chain.noteIds.map(id => byId.get(id)!))
      .find(candidate => slideSegmentKey(chain, candidate) === key);
    if (range) return { chain, range };
  }
  return null;
}
