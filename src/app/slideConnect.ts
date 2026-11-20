/** A Slide chain as a connection sees it: its nodes in order, and what a reconnection keeps of it. */
export type ConnectableChain = { id: string; noteIds: string[]; long?: true; timingGroup?: string };

export type SlideConnection<T extends ConnectableChain> = {
  /** Every chain after the connection: the untouched ones, the joined chain, and any part left over with two nodes
   * or more. */
  chains: T[];
  /** The joined chain's id. */
  joinedId: string;
  /** Nodes left alone by the connection (no chain any more): a visible one stays a note, a Hidden one goes. */
  detachedIds: string[];
  /** Links the connection removes, as [from, to] pairs, for the editor to show before it is made. */
  brokenLinks: Array<[string, string]>;
};

/**
 * The Slide tool's connection: `fromId`'s next node becomes `toId`. The link that left `fromId` and the link that
 * reached `toId` are removed; whatever was between them, or after `fromId`, or before `toId`, stays a chain of its own
 * when it keeps two nodes or more. A connection keeps no Long: a Long is a shape of its own, made by the Long tool.
 *
 * Returns null when the two nodes are already linked, or are one node. The caller checks time order (`toId` after
 * `fromId`).
 */
export function connectSlideNodes<T extends ConnectableChain>(chains: readonly T[], fromId: string, toId: string,
  createId: () => string, timingGroup?: string): SlideConnection<T> | null {
  if (fromId === toId) return null;
  const find = (id: string) => {
    for (const chain of chains) {
      const index = chain.noteIds.indexOf(id);
      if (index >= 0) return { chain, index };
    }
    return null;
  };
  const a = find(fromId), b = find(toId);
  const strip = (chain: T, noteIds: string[], id = chain.id): T => {
    const { long: _long, ...rest } = chain;
    return { ...rest, id, noteIds } as T;
  };
  const brokenLinks: Array<[string, string]> = [];
  const leftovers: T[] = [];
  const detachedIds: string[] = [];
  const keep = (template: T | null, noteIds: string[], id: string) => {
    if (noteIds.length >= 2) {
      leftovers.push(template ? strip(template, noteIds, id)
        : { id, noteIds, ...(timingGroup === undefined ? {} : { timingGroup }) } as T);
    } else detachedIds.push(...noteIds);
  };

  let joined: T;
  if (a && b && a.chain === b.chain) {
    if (b.index === a.index + 1) return null;
    if (b.index < a.index) return null;
    const ids = a.chain.noteIds;
    brokenLinks.push([ids[a.index]!, ids[a.index + 1]!], [ids[b.index - 1]!, ids[b.index]!]);
    joined = strip(a.chain, [...ids.slice(0, a.index + 1), ...ids.slice(b.index)]);
    keep(a.chain, ids.slice(a.index + 1, b.index), createId());
  } else {
    if (a && a.index + 1 < a.chain.noteIds.length) brokenLinks.push([fromId, a.chain.noteIds[a.index + 1]!]);
    if (b && b.index > 0) brokenLinks.push([b.chain.noteIds[b.index - 1]!, toId]);
    const head = a ? a.chain.noteIds.slice(0, a.index + 1) : [fromId];
    const tail = b ? b.chain.noteIds.slice(b.index) : [toId];
    const template = a?.chain ?? b?.chain ?? null;
    const joinedId = a?.chain.id ?? b?.chain.id ?? createId();
    joined = template ? strip(template, [...head, ...tail], joinedId)
      : { id: joinedId, noteIds: [...head, ...tail], ...(timingGroup === undefined ? {} : { timingGroup }) } as T;
    if (a) keep(a.chain, a.chain.noteIds.slice(a.index + 1), createId());
    if (b) keep(b.chain, b.chain.noteIds.slice(0, b.index), a ? b.chain.id : createId());
  }
  const touched = new Set([a?.chain, b?.chain].filter(Boolean));
  return {
    chains: [...chains.filter(chain => !touched.has(chain)), joined, ...leftovers],
    joinedId: joined.id,
    detachedIds,
    brokenLinks,
  };
}
