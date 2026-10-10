import { fetchAyachanLevelList, type AyachanLevelItem } from "../services/bestdori/api";
import type { AyachanSelectionEntry } from "./musicSelectionData";

export interface AyachanMusicFilter { id: string; minimum: number; maximum: number }
export const AYACHAN_LEVEL_MIN = 1, AYACHAN_LEVEL_MAX = 35;
export const DEFAULT_AYACHAN_FILTER: AyachanMusicFilter = { id: "", minimum: AYACHAN_LEVEL_MIN, maximum: AYACHAN_LEVEL_MAX };
export function normalizeAyachanFilter(filter: AyachanMusicFilter): AyachanMusicFilter {
  const maximum = Math.min(AYACHAN_LEVEL_MAX, Math.max(AYACHAN_LEVEL_MIN, filter.maximum));
  const minimum = Math.min(maximum, Math.max(AYACHAN_LEVEL_MIN, filter.minimum));
  return minimum === filter.minimum && maximum === filter.maximum ? filter : { ...filter, minimum, maximum };
}
export function ayachanMusicEntry(item: AyachanLevelItem): AyachanSelectionEntry | null {
  const id = Number(item.name);
  // The service inserts an unplayable announcement before the first public page.
  if (!/^[1-9]\d*$/.test(item.name) || !Number.isSafeInteger(id) || !Number.isFinite(item.rating) ||
      !item.bgm?.url || !item.data?.url || typeof item.title !== "string") return null;
  return { source: "ayachan", id, title: item.title, artists: item.artists ?? "", author: item.author ?? "",
    level: String(item.rating), difficulty: null, cover: item.cover ?? { url: "", hash: "" } };
}
export interface AyachanSearchState {
  entries: readonly AyachanSelectionEntry[]; page: number; hasMore: boolean; loading: boolean; error: string;
}
export class AyachanMusicSearch {
  state: AyachanSearchState = { entries: [], page: 0, hasMore: true, loading: false, error: "" };
  private generation = 0;
  private cached: AyachanSelectionEntry[] = [];
  private filter = DEFAULT_AYACHAN_FILTER;
  constructor(private readonly notify: (state: AyachanSearchState) => void, private readonly fetchPage = fetchAyachanLevelList) {}
  private publish(change: Partial<AyachanSearchState>) { this.state = { ...this.state, ...change }; this.notify(this.state); }
  private visible() { return this.cached.filter(entry => Number(entry.level) >= this.filter.minimum && Number(entry.level) <= this.filter.maximum); }
  reset(filter: AyachanMusicFilter) {
    this.generation++; this.filter = { ...normalizeAyachanFilter(filter) }; this.cached = [];
    this.publish({ entries: [], page: 0, hasMore: true, loading: false, error: "" });
  }
  updateFilter(filter: AyachanMusicFilter) {
    this.filter = { ...normalizeAyachanFilter(filter) };
    this.publish({ entries: this.visible() });
  }
  dispose() { this.generation++; }
  async next(): Promise<void> {
    if (this.state.loading || !this.state.hasMore) return;
    const generation = this.generation, page = this.state.page, id = this.filter.id.trim();
    if (id && (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) {
      this.publish({ entries: [], hasMore: false, error: "" }); return;
    }
    this.publish({ loading: true, error: "" });
    try {
      const response = await this.fetchPage(page, id);
      if (generation !== this.generation) return;
      const ids = new Set(this.cached.map(entry => entry.id));
      for (const item of response.items) {
        const entry = ayachanMusicEntry(item);
        if (entry && !ids.has(entry.id)) { this.cached.push(entry); ids.add(entry.id); }
      }
      this.publish({ entries: this.visible(), page: page + 1,
        hasMore: !id && response.items.length > 0 && page + 1 < response.pageCount });
    } catch (error) { if (generation === this.generation) this.publish({ error: String(error) }); }
    finally { if (generation === this.generation) this.publish({ loading: false }); }
  }
}
