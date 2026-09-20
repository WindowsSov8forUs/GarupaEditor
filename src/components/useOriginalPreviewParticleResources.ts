import { useEffect, useRef, useState } from "react";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import { createResourceRef, type ResourceRef } from "../resources/contracts";
import { simulatorBuiltinResourceRef } from "../resources/builtin/simulatorBuiltinResourceCatalog";
import { ApplicationSimulatorResourceCapability } from "../app/simulator/ApplicationSimulatorResourceCapability";
import type { SimulatorOriginalSkinSettings } from "../simulator/public/contracts";
import { originalPreviewParticleSelection, prepareOriginalPreviewParticlePack,
  type OriginalPreviewParticleLease, type OriginalPreviewParticlePack } from "../simulator/public/previewParticles";

export function useOriginalPreviewParticleResources(settings: SimulatorOriginalSkinSettings,
  onError?: (message: string) => void): OriginalPreviewParticlePack | null {
  const manager = useApplicationResourceManager(), report = useRef(onError); report.current = onError;
  const selection = originalPreviewParticleSelection(settings), latest = useRef(selection); latest.current = selection;
  const [result, setResult] = useState<{ key: string; pack: OriginalPreviewParticlePack } | null>(null);
  useEffect(() => {
    const { key, recipe, requirements } = latest.current;
    let active = true, finished = false, lease: OriginalPreviewParticleLease | null = null;
    const release = () => {
      const current = lease; lease = null;
      if (current) void current.release().catch(error => console.error("Preview particle cleanup failed", error));
    };
    setResult(null);
    void (async () => {
      const catalog = await manager.prepareCatalog("bestdori");
      if (catalog.status !== "accepted") throw new Error(catalog.failure.boundary);
      if (!active) return;
      const refs: Record<string, ResourceRef> = {};
      for (const item of requirements) {
        const ref = item.logicalResource.startsWith("portable/")
          ? simulatorBuiltinResourceRef(item.logicalResource)
          : createResourceRef(`bestdori/jp/${item.logicalResource}`);
        if (ref.status !== "accepted") throw new Error(ref.failure.boundary);
        refs[item.logicalResource] = ref.value;
      }
      const acquired = await new ApplicationSimulatorResourceCapability(manager, refs).acquire(requirements);
      if (acquired.status !== "accepted") throw new Error(acquired.failure.boundary);
      lease = acquired.value;
      if (!active) return;
      const pack = await prepareOriginalPreviewParticlePack(lease, recipe);
      if (active) setResult({ key, pack });
    })().catch(error => {
      if (active) report.current?.(error instanceof Error ? error.message : String(error));
      release();
    }).finally(() => { finished = true; if (!active) release(); });
    return () => { active = false; if (finished) release(); };
  }, [manager, selection.key]);
  return result?.key === selection.key ? result.pack : null;
}
