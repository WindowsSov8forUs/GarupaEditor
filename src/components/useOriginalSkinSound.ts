import { useCallback, useEffect, useRef, useState } from "react";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import { createResourceRef, type ResourceConsumerLease } from "../resources/contracts";
import { CURRENT_NORMAL_SOUND_SKINS } from "../simulator/public/settings";

type Sounds = { setting: number; tap: string; flick: string };
export function useOriginalSkinSound(setting: number, gain: number, onError?: (message: string) => void,
  mode: "preview" | "one-shot" = "preview") {
  const manager = useApplicationResourceManager(), report = useRef(onError); report.current = onError;
  const [sounds, setSounds] = useState<Sounds | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const oneShots = useRef(new Set<HTMLAudioElement>());
  const stop = useCallback(() => {
    player.current?.pause(); player.current = null;
    for (const audio of oneShots.current) audio.pause();
    oneShots.current.clear();
  }, []);
  useEffect(() => {
    let active = true, finished = false, lease: ResourceConsumerLease | null = null;
    const release = () => {
      const owner = lease; lease = null;
      if (owner) void owner.release().catch(error => console.error("Skin sound cleanup failed", error));
    };
    setSounds(null);
    void (async () => {
      const master = CURRENT_NORMAL_SOUND_SKINS.find(row => row.setting === setting);
      if (!master) throw new Error(`Unknown original judge SE ${setting}.`);
      const catalog = await manager.prepareCatalog("bestdori");
      if (catalog.status === "rejected") throw new Error(catalog.failure.boundary);
      if (!active) return;
      const ref = createResourceRef(`bestdori/jp/sound/tapseskin/${master.bundleName}`);
      if (ref.status === "rejected") throw new Error(ref.failure.boundary);
      const snapshot = await manager.createSnapshotFromRefs({ "preview.sound": ref.value });
      if (snapshot.status === "rejected") throw new Error(snapshot.failure.boundary);
      if (!active) return;
      const acquired = await manager.acquireSnapshot(snapshot.value.snapshotId);
      if (acquired.status === "rejected") throw new Error(acquired.failure.boundary);
      lease = acquired.value;
      if (!active) return;
      const owner = lease;
      const resolve = async (stem: string) => {
        const files = owner.listFiles("preview.sound").filter(file =>
          new RegExp(`^${stem}\\.(mp3|wav|ogg)$`, "i").test(file.logicalPath.split("/").pop()!));
        if (files.length !== 1) throw new Error(`Original sound requires one ${stem} payload.`);
        return owner.openObjectUrl("preview.sound", files[0]!.logicalPath);
      };
      const tap = await resolve("perfect"), flick = await resolve("flick");
      if (active) setSounds({ setting, tap, flick });
    })().catch(error => {
      release(); if (active) report.current?.(String(error));
    }).finally(() => { finished = true; if (!active) release(); });
    return () => {
      active = false;
      stop();
      if (finished) release();
    };
  }, [manager, setting, stop]);
  const play = useCallback((type: "tap" | "flick") => {
    if (!sounds || sounds.setting !== setting) return;
    if (!Number.isFinite(gain) || gain < 0 || gain > 1) {
      report.current?.("Skin sound volume is outside [0,1]."); return;
    }
    if (mode === "preview") player.current?.pause();
    const audio = new Audio(sounds[type]);
    if (mode === "preview") player.current = audio;
    else {
      oneShots.current.add(audio);
      audio.addEventListener("ended", () => oneShots.current.delete(audio), { once: true });
    }
    audio.volume = gain;
    void audio.play().catch(error => { oneShots.current.delete(audio); report.current?.(String(error)); });
  }, [sounds, setting, gain, mode]);
  return { ready: sounds?.setting === setting, play, stop };
}
