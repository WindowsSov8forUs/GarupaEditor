import { useEffect, useRef } from "react";
import { getOfficialMusicLibrary } from "../services/officialMusicLibrary";
import { appLog } from "../logging/applicationLogger";

/** Confirmed selection owns playback and cache insertion. The original sample
 * cache retains six cues; superseded loads cannot evict a current cue. */
export function useOfficialMusicPreview(slot: string | null, volume: number, paused: boolean, onError: (message: string) => void) {
  const report = useRef(onError); report.current = onError;
  const reported = useRef(new Set<string>());
  const state = useRef<{ audio: HTMLAudioElement; cache: Map<string, string>; active: boolean } | null>(null);
  useEffect(() => {
    const runtime = { audio: new Audio(), cache: new Map<string, string>(), active: true };
    runtime.audio.loop = true;
    state.current = runtime;
    return () => {
      runtime.active = false; runtime.audio.pause(); runtime.audio.removeAttribute("src"); runtime.audio.load();
      runtime.cache.forEach(url => URL.revokeObjectURL(url)); runtime.cache.clear(); state.current = null;
    };
  }, []);
  useEffect(() => { if (state.current) state.current.audio.volume = Math.min(1, Math.max(0, volume)); }, [volume]);
  useEffect(() => {
    const runtime = state.current!;
    let current = true;
    runtime.audio.pause();
    if (!slot || paused) return;
    const failed = (error: unknown) => {
      if (!current || (error instanceof DOMException && ["NotAllowedError", "AbortError"].includes(error.name))) return;
      appLog("warn", "official.preview-failed", { slot, error });
      if (!reported.current.has(slot)) {
        reported.current.add(slot);
        report.current(`官方试听加载失败：${error instanceof Error ? error.message : String(error)}`);
      }
    };
    const retry = () => { if (current && runtime.audio.src) void runtime.audio.play().then(() => reported.current.delete(slot)).catch(failed); };
    void (async () => {
      try {
        let url = runtime.cache.get(slot);
        if (!url) {
          const lease = getOfficialMusicLibrary().lease;
          if (!lease) throw new Error("官方试听未在启动时准备完成");
          const bytes = await lease.readBytes(slot, "payload");
          if (!runtime.active) return;
          // A superseded read must not insert or evict URLs owned by the
          // current selection, including a second read of the same slot.
          if (!current) return;
          url = runtime.cache.get(slot) ?? URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "audio/mpeg" }));
          if (runtime.cache.size >= 6) {
            const oldest = runtime.cache.keys().next().value!;
            URL.revokeObjectURL(runtime.cache.get(oldest)!); runtime.cache.delete(oldest);
          }
          runtime.cache.set(slot, url);
        }
        if (!current) return;
        runtime.audio.src = url;
        try { await runtime.audio.play(); reported.current.delete(slot); }
        catch (error) {
          if (error instanceof DOMException && error.name === "NotAllowedError") {
            window.addEventListener("pointerdown", retry, { once: true });
            window.addEventListener("keydown", retry, { once: true });
          } else throw error;
        }
      } catch (error) { failed(error); }
    })();
    return () => { current = false; runtime.audio.pause(); window.removeEventListener("pointerdown", retry); window.removeEventListener("keydown", retry); };
  }, [slot, paused]);
}
