import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import type { ResourceConsumerLease } from "../resources/contracts";
import { simulatorBuiltinResourceRef } from "../resources/builtin/simulatorBuiltinResourceCatalog";
import { OriginalUiAudio } from "./originalUiAudio";

// Authored buttons use ClickSEType; Carousel uses SoundEffectType 30.
// Cancel source: GirlsBandParty-Reverse 2888c106, original APK CommonSE.acb stream 79.
const SOUNDS: Readonly<Record<number, { name: string; slot: string; cueLimit?: number }>> = {
  1: { name: "decide_1", slot: "ui.sound" },
  3: { name: "cancel", slot: "ui.sound" },
  // StarUIButton MusicDifficultyChange -> LiveMenu, eight instances, last-arrival priority.
  4: { name: "SE_UI_DIF_CHANGE", slot: "ui.live-menu-sound", cueLimit: 8 },
  // LiveMenu command 004f050004000500: four instances, last-arrival priority.
  30: { name: "SE_UI_DRUM_SCROLLING", slot: "ui.live-menu-sound", cueLimit: 4 },
};
interface OriginalUiSoundChannel {
  play(type: number): void;
  previewVolume(percent: number | null): void;
}
const Context = createContext<OriginalUiSoundChannel | null>(null);
export const useOriginalUiSound = () => useContext(Context);

/** StarUIButton validates the click, starts its authored SE, then invokes the action. */
export function OriginalUiSoundProvider({ volumePercent, masterPercent, onError, children }: {
  volumePercent: number; masterPercent: number; onError: (message: string) => void; children: ReactNode;
}) {
  const manager = useApplicationResourceManager();
  const live = useRef({ volumePercent, masterPercent, onError });
  live.current = { volumePercent, masterPercent, onError };
  const preview = useRef<number | null>(null);
  const loaded = useRef<ReadonlyMap<string, AudioBuffer> | null>(null);
  const runtime = useRef<{ play: (type: number, buffer: AudioBuffer, gain: number, limit?: number) => void } | null>(null);
  useEffect(() => {
    let active = true, finished = false, lease: ResourceConsumerLease | null = null;
    const context = new AudioContext({ latencyHint: "interactive" });
    const player = new OriginalUiAudio(context);
    const pending = new Map<number, { buffer: AudioBuffer; gain: number; limit?: number }>();
    let resuming = false;
    const report = (error: unknown) => { if (active) live.current.onError(`UI SE: ${String(error)}`); };
    const flush = () => {
      if (!active || context.state !== "running") return;
      for (const [type, cue] of pending) {
        pending.delete(type);
        try { player.play(type, cue.buffer, cue.gain, cue.limit); } catch (error) { report(error); }
      }
    };
    const activate = () => {
      if (!active || context.state === "closed") return;
      if (context.state === "running") { flush(); return; }
      if (resuming) return;
      resuming = true;
      void context.resume().then(flush).catch(report).finally(() => { resuming = false; });
    };
    const owner = {
      play(type: number, buffer: AudioBuffer, gain: number, limit?: number) {
        if (context.state === "running") {
          pending.delete(type); // A fresh intent supersedes one awaiting statechange delivery.
          flush();
          player.play(type, buffer, gain, limit);
        }
        else {
          // Retain only the latest intent for a cue while the host is suspended.
          // Do not accumulate a backlog of voices for the eventual resume.
          pending.set(type, { buffer, gain, limit }); activate();
        }
      },
    };
    runtime.current = owner;
    document.addEventListener("pointerdown", activate, true);
    document.addEventListener("keydown", activate, true);
    document.addEventListener("touchend", activate, true);
    context.addEventListener("statechange", flush);
    let audioDisposed = false;
    const disposeAudio = () => {
      if (audioDisposed) return;
      audioDisposed = true;
      if (runtime.current === owner) { loaded.current = null; runtime.current = null; }
      pending.clear(); player.stop();
      document.removeEventListener("pointerdown", activate, true);
      document.removeEventListener("keydown", activate, true);
      document.removeEventListener("touchend", activate, true);
      context.removeEventListener("statechange", flush);
      if (context.state !== "closed") void context.close().catch(report);
    };
    const release = () => {
      disposeAudio();
      const owner = lease; lease = null;
      if (owner) void owner.release().catch(error => console.error("Original UI sound cleanup failed", error));
    };
    void (async () => {
      const ref = simulatorBuiltinResourceRef("sound/common-se");
      if (ref.status === "rejected") throw new Error(ref.failure.boundary);
      const liveMenu = simulatorBuiltinResourceRef("sound/live-menu-se");
      if (liveMenu.status === "rejected") throw new Error(liveMenu.failure.boundary);
      if (!active) return;
      const snapshot = await manager.createSnapshotFromRefs({ "ui.sound": ref.value, "ui.live-menu-sound": liveMenu.value });
      if (snapshot.status === "rejected") throw new Error(snapshot.failure.boundary);
      if (!active) return;
      const acquired = await manager.acquireSnapshot(snapshot.value.snapshotId);
      if (acquired.status === "rejected") throw new Error(acquired.failure.boundary);
      lease = acquired.value;
      if (!active) return;
      const buffers = new Map<string, AudioBuffer>();
      for (const { name, slot } of Object.values(SOUNDS)) {
        const files = lease.listFiles(slot).filter(file =>
          file.logicalPath.replace(/\\/g, "/").split("/").pop()!.toLowerCase().replace(/\.(mp3|wav|ogg)$/, "") === name.toLowerCase());
        if (files.length !== 1) throw new Error(`Original UI sound requires exactly one ${name} payload.`);
        const bytes = await lease.readBytes(slot, files[0]!.logicalPath);
        if (!active) return;
        buffers.set(name, await context.decodeAudioData(Uint8Array.from(bytes).buffer));
      }
      if (active) loaded.current = buffers;
    })().catch(error => {
      release();
      if (active) live.current.onError(`UI SE: ${error instanceof Error ? error.message : String(error)}`);
    }).finally(() => { finished = true; if (!active) release(); });
    return () => {
      active = false;
      disposeAudio();
      if (finished) release();
    };
  }, [manager]);
  const channel = useMemo<OriginalUiSoundChannel>(() => ({
    previewVolume(percent) {
      if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100))
        throw new Error("Original UI SE volume must be in [0,100].");
      preview.current = percent;
    },
    play(type) {
      if (type === 0) return;
      const cue = SOUNDS[type], name = cue?.name, buffer = name && loaded.current?.get(name);
      if (!buffer) return; // Preparation failures are reported by the resource owner, never replaced by another SE.
      const gain = (preview.current ?? live.current.volumePercent) * live.current.masterPercent / 10000;
      if (!Number.isFinite(gain) || gain < 0 || gain > 1) throw new Error("Invalid original UI SE gain.");
      try { runtime.current?.play(type, buffer, gain, cue.cueLimit); }
      catch (error) { live.current.onError(`UI SE: ${String(error)}`); }
    },
  }), []);
  return <Context.Provider value={channel}>{children}</Context.Provider>;
}
