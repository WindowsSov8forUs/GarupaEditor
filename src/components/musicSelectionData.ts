import { originalLoading } from "./originalLoadingState";
import { fetchBestdoriCommunityPostDetails, fetchSongPreviewMedia, hasSongPreviewMedia, resolveBestdoriCommunitySongResourceUrls,
  resolveTestServerResourceUrl, type BestdoriPostSong } from "../services/bestdori/api";
import { getOfficialMusicLibrary, type OfficialSong, type OfficialDifficulty } from "../services/officialMusicLibrary";

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
  cover: { url: string; hash: string }; bgm: string;
}
export interface OfficialSelectionEntry extends MusicSelectionBase {
  source: "official"; difficulty: OfficialDifficulty; officialSong: OfficialSong;
}
export type MusicSelectionEntry = BestdoriSelectionEntry | AyachanSelectionEntry | OfficialSelectionEntry;

/** What the original carries from song select into live preparation: the selection, not its files. */
export interface MusicPlaySelection {
  source: "bestdori" | "test" | "official"; id: string; officialDifficulty?: OfficialDifficulty;
  title: string; difficulty: OfficialDifficulty; level: string;
  /** Known before download only from official master data; other sources hide these marks. */
  hasMv: boolean; hasSpecialNotes: boolean;
}
export function musicPlaySelection(entry: MusicSelectionEntry): MusicPlaySelection {
  const base = { id: String(entry.id), title: entry.title, level: entry.level };
  if (entry.source === "official") return { ...base, source: "official", officialDifficulty: entry.difficulty, difficulty: entry.difficulty,
    hasMv: entry.officialSong.hasMv, hasSpecialNotes: entry.officialSong.specialNotes.includes(entry.difficulty) };
  if (entry.source === "ayachan") return { ...base, source: "test", difficulty: "EXPERT", hasMv: false, hasSpecialNotes: false };
  return { ...base, source: "bestdori", difficulty: entry.difficulty, hasMv: false, hasSpecialNotes: false };
}

/** One song's preview sound. read resolves to null when aborted or when the song has none. */
export interface MusicPreviewRequest {
  key: string; mime?: string;
  read(signal: AbortSignal): Promise<Uint8Array | null>;
}

const communityAudioUrls = new Map<string, Promise<string | null>>();
function communityAudioUrl(song: BestdoriSelectionEntry["song"]): Promise<string | null> {
  const key = JSON.stringify(song);
  let url = communityAudioUrls.get(key);
  if (!url) {
    url = resolveBestdoriCommunitySongResourceUrls(song as BestdoriPostSong).then(resources => {
      const audio = resources?.audioUrl?.trim() ?? "";
      try { return audio && ["bestdori.com", "www.bestdori.com"].includes(new URL(audio).host.toLowerCase()) ? audio : null; }
      catch { return null; }
    });
    communityAudioUrls.set(key, url);
    void url.catch(() => { if (communityAudioUrls.get(key) === url) communityAudioUrls.delete(key); });
    if (communityAudioUrls.size > 64) communityAudioUrls.delete(communityAudioUrls.keys().next().value!);
  }
  return url;
}

/**
 * Downloading a song's preview while browsing is the occasion of a missing jacket: a Spot-style
 * on-demand download under NetworkIndicator with its single-transfer progress, no input block.
 */
async function downloadPreview(url: string, hostScope: "bestdori" | "sonolus", signal: AbortSignal): Promise<Uint8Array | null> {
  if (hasSongPreviewMedia(url)) return fetchSongPreviewMedia(url, hostScope, signal);
  const indicator = originalLoading.hold("network", {}, { downloadProgress: true });
  try { return await fetchSongPreviewMedia(url, hostScope, signal); }
  finally { indicator.release(); }
}

/**
 * Official songs play their chorus sample (BgmChorusId). Community and test charts have none, so
 * they play the chart's full audio from its start; that download is kept for the live start.
 */
export function musicPreviewRequest(entry: MusicSelectionEntry): MusicPreviewRequest | null {
  if (entry.source === "official") {
    const slot = entry.officialSong.previewSlot;
    if (slot === null) return null;
    return { key: `official:${slot}`, mime: "audio/mpeg", read: async () => {
      const lease = getOfficialMusicLibrary().lease;
      if (!lease) throw new Error("官方试听未在启动时准备完成");
      return lease.readBytes(slot, "payload");
    } };
  }
  if (entry.source === "ayachan") {
    let url: string;
    try { url = resolveTestServerResourceUrl(entry.bgm); } catch { return null; }
    return { key: `test:${url}`, read: signal => downloadPreview(url, "sonolus", signal) };
  }
  return { key: `bestdori:${entry.id}`, read: async signal => {
    const url = await communityAudioUrl(entry.song);
    return url === null || signal.aborted ? null : downloadPreview(url, "bestdori", signal);
  } };
}
