import { useEffect, useRef, useState } from "react";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import { createResourceRef, type ResourceConsumerLease, type ResourceRef } from "../resources/contracts";
import profile from "../data/originalSettingsGuides.json";

/** Verified guide images ship with the UI; unrelated tutorials cannot block this action. */
export function useOriginalSettingsGuideResources(open: boolean, names: readonly string[],
  onError: (message: string) => void): readonly string[] | null {
  const manager = useApplicationResourceManager(), report = useRef(onError); report.current = onError;
  const key = names.join("|"), wanted = useRef(names); wanted.current = names;
  const [result, setResult] = useState<{ key: string; urls: readonly string[] } | null>(null);
  useEffect(() => {
    setResult(null);
    if (!open) return;
    const pageNames = [...wanted.current];
    let active = true, settled = false, lease: ResourceConsumerLease | null = null;
    const release = () => {
      const owner = lease; lease = null;
      if (owner) void owner.release().catch(error => console.error("Tutorial resource release failed", error));
    };
    void (async () => {
      const refs: Record<string, ResourceRef> = {};
      for (const name of pageNames) {
        if (!profile.assetSource.images.some(image => image.file === name + ".png"))
          throw new Error("Unknown original settings tutorial: " + name);
        const ref = createResourceRef("builtin/ui/settings-guide/" + name);
        if (ref.status === "rejected") throw new Error(ref.failure.boundary);
        refs[name] = ref.value;
      }
      const snapshot = await manager.createSnapshotFromRefs(refs);
      if (snapshot.status === "rejected") throw new Error(snapshot.failure.boundary);
      if (!active) return;
      const acquired = await manager.acquireSnapshot(snapshot.value.snapshotId);
      if (acquired.status === "rejected") throw new Error(acquired.failure.boundary);
      lease = acquired.value;
      if (!active) return;
      const urls: string[] = [];
      for (const name of pageNames) urls.push(await lease.openObjectUrl(name, "game/settings-guides/" + name + ".png"));
      const decoded = await Promise.allSettled(urls.map(async url => {
        const image = new Image(); image.src = url; await image.decode();
      }));
      const failure = decoded.find(item => item.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      if (active) setResult({ key, urls });
    })().catch(error => {
      if (active) report.current(error instanceof Error ? error.message : String(error));
      release();
    }).finally(() => { settled = true; if (!active) release(); });
    return () => { active = false; if (settled) release(); };
  }, [manager, key, open]);
  return open && result?.key === key ? result.urls : null;
}
