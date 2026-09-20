import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import type { ResourceConsumerLease } from "../resources/contracts";
import { simulatorBuiltinResourceRef } from "../resources/builtin/simulatorBuiltinResourceCatalog";

// All authored buttons in the menu/settings graphs use None, Decide1 or Cancel.
// Cancel source: GirlsBandParty-Reverse 2888c106, original APK CommonSE.acb stream 79.
const SOUND_NAMES = [null, "decide_1", null, "cancel"] as const;
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
  const loaded = useRef<ReadonlyMap<string, string> | null>(null);
  const playing = useRef(new Set<HTMLAudioElement>());
  useEffect(() => {
    let active = true, finished = false, lease: ResourceConsumerLease | null = null;
    const release = () => {
      loaded.current = null;
      for (const audio of playing.current) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
      playing.current.clear();
      const owner = lease; lease = null;
      if (owner) void owner.release().catch(error => console.error("Original UI sound cleanup failed", error));
    };
    void (async () => {
      const ref = simulatorBuiltinResourceRef("sound/common-se");
      if (ref.status === "rejected") throw new Error(ref.failure.boundary);
      if (!active) return;
      const snapshot = await manager.createSnapshotFromRefs({ "ui.sound": ref.value });
      if (snapshot.status === "rejected") throw new Error(snapshot.failure.boundary);
      if (!active) return;
      const acquired = await manager.acquireSnapshot(snapshot.value.snapshotId);
      if (acquired.status === "rejected") throw new Error(acquired.failure.boundary);
      lease = acquired.value;
      if (!active) return;
      const urls = new Map<string, string>();
      for (const name of SOUND_NAMES) {
        if (name === null) continue;
        const files = lease.listFiles("ui.sound").filter(file =>
          file.logicalPath.replace(/\\/g, "/").split("/").pop()!.toLowerCase().replace(/\.(mp3|wav|ogg)$/, "") === name);
        if (files.length !== 1) throw new Error(`Original UI sound requires exactly one ${name} payload.`);
        urls.set(name, await lease.openObjectUrl("ui.sound", files[0]!.logicalPath));
      }
      if (active) loaded.current = urls;
    })().catch(error => {
      release();
      if (active) live.current.onError(`UI SE: ${error instanceof Error ? error.message : String(error)}`);
    }).finally(() => { finished = true; if (!active) release(); });
    return () => { active = false; if (finished) release(); };
  }, [manager]);
  const channel = useMemo<OriginalUiSoundChannel>(() => ({
    previewVolume(percent) {
      if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100))
        throw new Error("Original UI SE volume must be in [0,100].");
      preview.current = percent;
    },
    play(type) {
      if (type === 0) return;
      const name = SOUND_NAMES[type], url = name && loaded.current?.get(name);
      if (!url) return; // Preparation failures are reported by the resource owner, never replaced by another SE.
      const gain = (preview.current ?? live.current.volumePercent) * live.current.masterPercent / 10000;
      if (!Number.isFinite(gain) || gain < 0 || gain > 1) throw new Error("Invalid original UI SE gain.");
      const audio = new Audio(url);
      audio.volume = gain;
      playing.current.add(audio);
      const finish = () => { playing.current.delete(audio); audio.removeAttribute("src"); };
      audio.addEventListener("ended", finish, { once: true });
      void audio.play().catch(error => { finish(); live.current.onError(`UI SE: ${String(error)}`); });
    },
  }), []);
  return <Context.Provider value={channel}>{children}</Context.Provider>;
}
