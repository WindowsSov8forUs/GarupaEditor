import { useCallback, useEffect, useRef } from "react";
import { appLog } from "../logging/applicationLogger";
import { getOfficialMusicLibrary } from "../services/officialMusicLibrary";

// SampleMusicController: a new chorus cue fades in while the old one fades out once the new
// resource is ready; startGame stops it with StopBGM(0.5).
const SAMPLE_SWITCH_FADE_SECONDS = 0.2;
export const SAMPLE_START_GAME_FADE_SECONDS = 0.5;

interface Voice { audio: HTMLAudioElement; slot: string; frame: number; level: number }

export interface OfficialMusicPreviewControl {
  /** Fades the playing cue out and keeps it stopped until the requested slot changes. */
  stop(fadeSeconds: number): void;
}

/** One sample cue owned above song select and live preparation, so moving between them
 * keeps it playing without a restart. */
export function useOfficialMusicPreview(slot: string | null, volume: number, paused: boolean,
  onError: (message: string) => void): OfficialMusicPreviewControl {
  const report = useRef(onError); report.current = onError;
  const reported = useRef(new Set<string>());
  const state = useRef<{ cache: Map<string, string>; active: boolean; current: Voice | null; volume: number; halted: string | null } | null>(null);
  const ramp = useCallback((voice: Voice, to: number, seconds: number, done?: () => void) => {
    cancelAnimationFrame(voice.frame);
    const from = voice.level, start = performance.now();
    const step = (now: number) => {
      const progress = seconds <= 0 ? 1 : Math.min(1, (now - start) / (seconds * 1000));
      voice.level = from + (to - from) * progress;
      voice.audio.volume = Math.min(1, Math.max(0, voice.level * (state.current?.volume ?? 0)));
      if (progress < 1) voice.frame = requestAnimationFrame(step); else done?.();
    };
    voice.frame = requestAnimationFrame(step);
  }, []);
  const retire = useCallback((voice: Voice, seconds: number) => {
    ramp(voice, 0, seconds, () => { voice.audio.pause(); voice.audio.removeAttribute("src"); voice.audio.load(); });
  }, [ramp]);
  useEffect(() => {
    const runtime = { cache: new Map<string, string>(), active: true, current: null as Voice | null, volume, halted: null as string | null };
    state.current = runtime;
    return () => {
      runtime.active = false;
      if (runtime.current) { cancelAnimationFrame(runtime.current.frame); runtime.current.audio.pause(); runtime.current.audio.removeAttribute("src"); runtime.current.audio.load(); }
      runtime.cache.forEach(url => URL.revokeObjectURL(url)); runtime.cache.clear(); state.current = null;
    };
  }, []);
  useEffect(() => {
    const runtime = state.current; if (!runtime) return;
    runtime.volume = Math.min(1, Math.max(0, volume));
    if (runtime.current) runtime.current.audio.volume = runtime.current.level * runtime.volume;
  }, [volume]);
  useEffect(() => {
    const runtime = state.current!;
    if (runtime.halted !== null && runtime.halted !== slot) runtime.halted = null;
    const wanted = !slot || paused || runtime.halted === slot ? null : slot;
    if (wanted === null) {
      if (runtime.current) { retire(runtime.current, SAMPLE_SWITCH_FADE_SECONDS); runtime.current = null; }
      return;
    }
    // Same cue across song select and live preparation: keep its phase.
    if (runtime.current?.slot === wanted) return;
    let current = true;
    const failed = (error: unknown) => {
      if (!current || (error instanceof DOMException && ["NotAllowedError", "AbortError"].includes(error.name))) return;
      appLog("warn", "official.preview-failed", { slot: wanted, error });
      if (!reported.current.has(wanted)) {
        reported.current.add(wanted);
        report.current(`官方试听加载失败：${error instanceof Error ? error.message : String(error)}`);
      }
    };
    let pending: Voice | null = null;
    const retry = () => { if (current && pending) void pending.audio.play().then(() => reported.current.delete(wanted)).catch(failed); };
    void (async () => {
      try {
        let url = runtime.cache.get(wanted);
        if (!url) {
          const lease = getOfficialMusicLibrary().lease;
          if (!lease) throw new Error("官方试听未在启动时准备完成");
          const bytes = await lease.readBytes(wanted, "payload");
          if (!runtime.active) return;
          // A superseded read must not insert or evict URLs owned by the
          // current selection, including a second read of the same slot.
          if (!current) return;
          url = runtime.cache.get(wanted) ?? URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "audio/mpeg" }));
          if (runtime.cache.size >= 6) {
            const oldest = runtime.cache.keys().next().value!;
            URL.revokeObjectURL(runtime.cache.get(oldest)!); runtime.cache.delete(oldest);
          }
          runtime.cache.set(wanted, url);
        }
        if (!current) return;
        const audio = new Audio(url);
        audio.loop = true; audio.volume = 0;
        const voice: Voice = { audio, slot: wanted, frame: 0, level: 0 };
        pending = voice;
        const previous = runtime.current;
        runtime.current = voice;
        // The old cue stays audible until the new resource is ready, then both fade.
        if (previous) retire(previous, SAMPLE_SWITCH_FADE_SECONDS);
        ramp(voice, 1, SAMPLE_SWITCH_FADE_SECONDS);
        try { await audio.play(); reported.current.delete(wanted); }
        catch (error) {
          if (error instanceof DOMException && error.name === "NotAllowedError") {
            window.addEventListener("pointerdown", retry, { once: true });
            window.addEventListener("keydown", retry, { once: true });
          } else throw error;
        }
      } catch (error) { failed(error); }
    })();
    return () => { current = false; window.removeEventListener("pointerdown", retry); window.removeEventListener("keydown", retry); };
  }, [slot, paused, ramp, retire]);
  const stop = useCallback((fadeSeconds: number) => {
    const runtime = state.current; if (!runtime?.current) return;
    runtime.halted = runtime.current.slot;
    retire(runtime.current, fadeSeconds);
    runtime.current = null;
  }, [retire]);
  return { stop };
}
