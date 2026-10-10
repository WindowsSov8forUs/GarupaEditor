import { fetchBestdoriCommunityPostDetails, type BestdoriPostSong } from "../services/bestdori/api";
import type { OfficialSong, OfficialDifficulty } from "../services/officialMusicLibrary";

const charters = new Map<number, Promise<string>>();
export function loadMusicSelectionCharter(id: number): Promise<string> {
  const cached = charters.get(id);
  if (cached) return cached;
  const request = fetchBestdoriCommunityPostDetails(id).then(({ post }) =>
    post.author?.nickname?.trim() || post.author?.username?.trim() || "");
  charters.set(id, request);
  if (charters.size > 64) charters.delete(charters.keys().next().value!);
  void request.catch(() => { if (charters.get(id) === request) charters.delete(id); });
  return request;
}

/** Page input, independent of community search and pagination. */
interface MusicSelectionBase {
  id: number; title: string; artists: string;
  level: string;
}
export interface BestdoriSelectionEntry extends MusicSelectionBase {
  source?: "bestdori";
  difficulty: "EASY" | "NORMAL" | "HARD" | "EXPERT" | "SPECIAL";
  song: BestdoriPostSong | { type: "osu"; id: number; diff: number };
}
export interface AyachanSelectionEntry extends MusicSelectionBase {
  source: "ayachan"; difficulty: null; author: string;
  cover: { url: string; hash: string };
}
export interface OfficialSelectionEntry extends MusicSelectionBase {
  source: "official"; difficulty: OfficialDifficulty; officialSong: OfficialSong;
}
export type MusicSelectionEntry = BestdoriSelectionEntry | AyachanSelectionEntry | OfficialSelectionEntry;
