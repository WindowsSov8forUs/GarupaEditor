import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApplicationResourceUrl } from "../resources/applicationResourceContext";
import { fetchTestServerMedia, fetchBestdoriFileBlob, resolveBestdoriCommunitySongResourceUrls } from "../services/bestdori/api";
import { appLog } from "../logging/applicationLogger";
import { originalLoading } from "./originalLoadingState";
import type { MusicSelectionEntry } from "./musicSelectionData";
import { getOfficialMusicLibrary } from "../services/officialMusicLibrary";

/** MusicInfoController: retain the texture until the next queued load finishes. */
export function useMusicJacket(entry: MusicSelectionEntry | undefined) {
  const fallback = useApplicationResourceUrl("ui.default-cover");
  const [image, setImage] = useState<{ url: string; title: string }>();
  const session = useRef<{
    disposed: boolean; queue: Promise<void>; urls: Set<string>; decoding: Set<string>;
    releases: Set<() => void>; cache: Map<string, Blob>; lastRequest: string | undefined;
  } | null>(null);
  useEffect(() => {
    const state = { disposed: false, queue: Promise.resolve(), urls: new Set<string>(),
      decoding: new Set<string>(), releases: new Set<() => void>(), cache: new Map<string, Blob>(), lastRequest: undefined as string | undefined };
    session.current = state;
    return () => {
      state.disposed = true;
      state.releases.forEach(release => release());
      state.urls.forEach(url => URL.revokeObjectURL(url));
      state.urls.clear(); state.cache.clear();
    };
  }, []);
  // Release replaced textures only after React has committed the replacement.
  useLayoutEffect(() => {
    const state = session.current;
    state?.urls.forEach(url => {
      if (url !== image?.url && !state.decoding.has(url)) {
        URL.revokeObjectURL(url); state.urls.delete(url);
      }
    });
  }, [image]);
  useEffect(() => {
    const state = session.current!;
    if (!entry) { state.lastRequest = undefined; return; }
    const key = JSON.stringify([entry.source ?? "bestdori", entry.id,
      entry.source === "ayachan" ? [entry.cover.hash, entry.cover.url]
        : entry.source === "official" ? entry.officialSong.jacketSlot : null]);
    const requestKey = JSON.stringify([key, fallback]);
    if (state.lastRequest === requestKey) return;
    state.lastRequest = requestKey;
    // The original queue is FIFO; selecting again does not cancel older entries.
    state.queue = state.queue.then(async () => {
      if (state.disposed) return;
      const { release } = originalLoading.hold("network", {});
      state.releases.add(release);
      let objectUrl: string | undefined;
      try {
        let blob = state.cache.get(key);
        if (!blob) {
          if (entry.source === "official") {
            const lease = getOfficialMusicLibrary().lease;
            if (!lease) throw new Error("官方封面在启动时未下载成功");
            const bytes = await lease.readBytes(entry.officialSong.jacketSlot, "payload");
            blob = new Blob([Uint8Array.from(bytes)], { type: "image/png" });
          } else if (entry.source === "ayachan") {
            if (!entry.cover.url) throw new Error("Ayachan song has no cover URL");
            const bytes = await fetchTestServerMedia(entry.cover.url);
            blob = new Blob([new Uint8Array(bytes)]);
          } else {
            const resources = entry.song.type === "osu" ? undefined
              : await resolveBestdoriCommunitySongResourceUrls(entry.song);
            if (state.disposed) return;
            if (!resources?.coverUrl) throw new Error("Community song has no cover URL");
            blob = await fetchBestdoriFileBlob(resources.coverUrl, "image/png", "选曲封面");
          }
        }
        if (state.disposed) return;
        objectUrl = URL.createObjectURL(blob);
        state.urls.add(objectUrl); state.decoding.add(objectUrl);
        const decoded = new Image(); decoded.src = objectUrl;
        await decoded.decode();
        if (state.disposed) return;
        // Failed image decodes must not poison subsequent attempts.
        state.cache.set(key, blob);
        if (state.cache.size > 12) state.cache.delete(state.cache.keys().next().value!);
        setImage({ url: objectUrl, title: entry.title });
      } catch (error) {
        if (objectUrl && state.urls.delete(objectUrl)) URL.revokeObjectURL(objectUrl);
        if (state.disposed) return;
        appLog("warn", "music-selection.cover-fallback", { chartId: entry.id, error });
        if (entry.source === "ayachan" || entry.source === "official") { setImage(undefined); return; }
        // User-selected Bestdori fallback; the original clears its texture here.
        const decoded = new Image(); decoded.src = fallback;
        try {
          await decoded.decode();
          if (!state.disposed) setImage({ url: fallback, title: "默认封面" });
        } catch (fallbackError) {
          if (!state.disposed) {
            appLog("error", "music-selection.default-cover-failed", { error: fallbackError });
            setImage(undefined);
          }
        }
      } finally {
        if (objectUrl) state.decoding.delete(objectUrl);
        release(); state.releases.delete(release);
      }
    });
  }, [entry, fallback]);
  return image;
}
