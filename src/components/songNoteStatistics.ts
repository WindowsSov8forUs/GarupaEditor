import { isDirectionalNoteType, type ChartNote } from "../chartCore";
import type { SlideChain } from "../app/editorHelpers";

export const SONG_NOTE_KINDS = ["普通", "上滑", "左向侧滑", "右向侧滑"] as const;
export const SONG_NOTE_ROLES = ["单个", "长条头", "长条中间节点", "长条尾"] as const;

export function songHasSpecialNotes(notes: readonly ChartNote[], chains: readonly SlideChain[]): boolean {
  if (notes.some(note => isDirectionalNoteType(note.type))) return true;
  const hiddenIds = new Set(notes.filter(note => note.type === "hidden").map(note => note.id));
  return chains.some(chain => chain.noteIds.some(id => hiddenIds.has(id)));
}

/** Chain order defines head/tail even when the endpoints are Hidden or time folds. */
export function countSongNoteKinds(notes: readonly ChartNote[], chains: readonly SlideChain[]): number[] {
  const roles = new Map<string, number>();
  for (const chain of chains) {
    if (chain.noteIds.length < 2) continue;
    chain.noteIds.forEach((id, index) => roles.set(id,
      index === 0 ? 1 : index === chain.noteIds.length - 1 ? 3 : 2));
  }
  const counts = Array<number>(16).fill(0);
  for (const note of notes) {
    if (note.type === "hidden") continue;
    const kind = note.type === "flick" ? 1 : note.type === "directional_flick_left" ? 2
      : note.type === "directional_flick_right" ? 3 : 0;
    counts[(roles.get(note.id) ?? 0) * 4 + kind]++;
  }
  return counts;
}
