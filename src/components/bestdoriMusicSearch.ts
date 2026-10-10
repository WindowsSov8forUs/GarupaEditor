import { fetchBestdoriCommunityPostDetails, searchBestdoriCommunityCharts,
  type BestdoriPostInfo } from "../services/bestdori/api";
import type { MusicSelectionEntry } from "./musicSelectionData";

export interface BestdoriMusicFilter {
  id: string; keyword: string; artist: string;
  difficulty: number | null; minimum: number; maximum: number;
  order: "TIME_DESC" | "TIME_ASC";
}
export const BESTDORI_LEVEL_MIN = 1;
export const BESTDORI_LEVEL_MAX = 35;
export const DEFAULT_BESTDORI_FILTER: BestdoriMusicFilter = {
  id: "", keyword: "", artist: "", difficulty: null, minimum: BESTDORI_LEVEL_MIN, maximum: BESTDORI_LEVEL_MAX, order: "TIME_DESC",
};
/** Keep retained selections inside the source's current range before rendering or filtering. */
export function normalizeBestdoriMusicFilter(filter: BestdoriMusicFilter): BestdoriMusicFilter {
  const maximum = Math.min(BESTDORI_LEVEL_MAX, Math.max(BESTDORI_LEVEL_MIN, filter.maximum));
  // StarDualSlider clamps the lower endpoint to the upper, without swapping endpoints.
  const minimum = Math.min(maximum, Math.max(BESTDORI_LEVEL_MIN, filter.minimum));
  return minimum === filter.minimum && maximum === filter.maximum ? filter : { ...filter, minimum, maximum };
}
export function bestdoriSearchKey(filter: BestdoriMusicFilter): string {
  return JSON.stringify([filter.id.trim(), filter.keyword.trim(), filter.order]);
}
const difficulties = ["EASY", "NORMAL", "HARD", "EXPERT", "SPECIAL"] as const;
export function bestdoriMusicEntry(post: BestdoriPostInfo, id: number): MusicSelectionEntry | null {
  if (post.categoryName !== "SELF_POST" || post.categoryId !== "chart" || !post.song ||
      !Number.isSafeInteger(id) || id <= 0 || !Number.isInteger(post.diff) || !difficulties[post.diff!] ||
      !Number.isFinite(post.level)) return null;
  return { id, title: post.title ?? "", artists: post.artists ?? "", difficulty: difficulties[post.diff!]!,
    level: String(post.level), song: post.song };
}
export function matchesBestdoriMusic(entry: MusicSelectionEntry, filter: BestdoriMusicFilter): boolean {
  return entry.artists.toLocaleLowerCase().includes(filter.artist.trim().toLocaleLowerCase()) &&
    (filter.difficulty === null || entry.difficulty === difficulties[filter.difficulty]) &&
    Number(entry.level) >= filter.minimum && Number(entry.level) <= filter.maximum;
}
export interface BestdoriSearchPage { entries: readonly MusicSelectionEntry[]; nextOffset: number; hasMore: boolean }
export async function fetchBestdoriMusicPage(filter: BestdoriMusicFilter, offset: number): Promise<BestdoriSearchPage> {
  if (filter.id.trim()) {
    if (offset || !/^[1-9]\d*$/.test(filter.id.trim()) || !Number.isSafeInteger(Number(filter.id)))
      return { entries: [], nextOffset: offset, hasMore: false };
    const id = Number(filter.id), response = await fetchBestdoriCommunityPostDetails(id);
    const entry = response.result && response.post ? bestdoriMusicEntry(response.post, id) : null;
    return { entries: entry ? [entry] : [], nextOffset: 1, hasMore: false };
  }
  const response = await searchBestdoriCommunityCharts(filter.keyword.trim(), filter.order, offset);
  const entries = response.posts.map(post => bestdoriMusicEntry(post, post.id))
    .filter((entry): entry is MusicSelectionEntry => !!entry);
  const nextOffset = offset + response.posts.length;
  return { entries, nextOffset, hasMore: response.posts.length > 0 && nextOffset < response.count };
}

export interface BestdoriSearchState {
  entries: readonly MusicSelectionEntry[]; offset: number; hasMore: boolean; loading: boolean; error: string;
}
/** A page owns this session. Old responses cannot mutate a new query or a closed page. */
export class BestdoriMusicSearch {
  state: BestdoriSearchState = { entries: [], offset: 0, hasMore: true, loading: false, error: "" };
  private generation = 0;
  private cached: readonly MusicSelectionEntry[] = [];
  private filter = DEFAULT_BESTDORI_FILTER;
  constructor(private readonly notify: (state: BestdoriSearchState) => void,
    private readonly fetchPage = fetchBestdoriMusicPage) {}
  private publish(changes: Partial<BestdoriSearchState>) { this.state = { ...this.state, ...changes }; this.notify(this.state); }
  reset(filter: BestdoriMusicFilter) {
    this.generation++; this.filter = { ...normalizeBestdoriMusicFilter(filter) }; this.cached = [];
    this.publish({ entries: [], offset: 0, hasMore: true, loading: false, error: "" });
  }
  /** Local predicates never discard downloaded pages or advance/reset the server cursor. */
  updateFilter(filter: BestdoriMusicFilter) {
    this.filter = { ...normalizeBestdoriMusicFilter(filter) };
    this.publish({ entries: this.cached.filter(entry => matchesBestdoriMusic(entry, this.filter)) });
  }
  dispose() { this.generation++; }
  async next(): Promise<void> {
    if (this.state.loading || !this.state.hasMore) return;
    const generation = this.generation, offset = this.state.offset;
    this.publish({ loading: true, error: "" });
    try {
      const page = await this.fetchPage(this.filter, offset);
      if (generation !== this.generation) return;
      const ids = new Set(this.cached.map(entry => entry.id));
      const added = page.entries.filter(entry => { if (ids.has(entry.id)) return false; ids.add(entry.id); return true; });
      this.cached = [...this.cached, ...added];
      this.publish({ entries: this.cached.filter(entry => matchesBestdoriMusic(entry, this.filter)),
        offset: page.nextOffset, hasMore: page.hasMore });
    } catch (error) {
      if (generation === this.generation) this.publish({ error: String(error) });
    } finally {
      if (generation === this.generation) this.publish({ loading: false });
    }
  }
}
