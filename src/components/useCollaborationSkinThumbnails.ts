import { useEffect, useRef, useState } from "react";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import { CURRENT_SPECIAL_SKINS } from "../simulator/public/settings";
import { loadCollaborationSkinThumbnail } from "../skins/collaborationSkinThumbnailResource";

export function useCollaborationSkinThumbnails(enabled: boolean, onError?: (message: string) => void) {
  const manager = useApplicationResourceManager(), report = useRef(onError); report.current = onError;
  const [urls, setUrls] = useState<Readonly<Record<number, string | null>>>({});
  useEffect(() => {
    if (!enabled) return;
    let active = true, finished = false;
    const derived = new Set<string>();
    setUrls({});
    const release = () => {
      derived.forEach(url => URL.revokeObjectURL(url)); derived.clear();
    };
    void (async () => {
      const catalog = await manager.prepareCatalog("bestdori");
      if (catalog.status === "rejected") throw new Error(catalog.failure.boundary);
      const rendered = new Map<string, string | null>(), failures: string[] = [];
      for (const master of CURRENT_SPECIAL_SKINS.filter(row => row.kind === "collabo" && row.selectable)) {
        if (!active) return;
        const key = `${master.notesBundleName ?? "skin00"}|${master.laneBundleName ?? "skin00"}`;
        if (!rendered.has(key)) {
          try {
            const blob = await loadCollaborationSkinThumbnail(manager, master);
            if (!active) return;
            const url = URL.createObjectURL(blob); derived.add(url); rendered.set(key, url);
          } catch (cause) {
            rendered.set(key, null); failures.push(`${key}: ${String(cause)}`);
          }
        }
        if (active) setUrls(previous => ({ ...previous, [master.selectionId]: rendered.get(key)! }));
      }
      if (active && failures.length) report.current?.(`部分联动缩略图生成失败：${failures.join("；")}`);
    })().catch(cause => { if (active) report.current?.(String(cause)); })
      .finally(() => { finished = true; if (!active) release(); });
    return () => { active = false; if (finished) release(); };
  }, [enabled, manager]);
  return urls;
}
