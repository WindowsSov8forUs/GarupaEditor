import { originalSkinResourceRef } from "../resources/originalSkinResourceRef";
import { useCallback } from "react";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import { type ResourceRef } from "../resources/contracts";
import { resolveOriginalPreviewSkin } from "../simulator/public/settings";
import type { SimulatorOriginalSkinSettings } from "../simulator/public/contracts";

/** Resolve first, acquire all enabled packages, then let the caller commit the choice. */
export function useOriginalSpecialSkinPreparation() {
  const manager = useApplicationResourceManager();
  return useCallback(async (settings: SimulatorOriginalSkinSettings) => {
    const recipe = resolveOriginalPreviewSkin(settings);
    const resources = new Set([recipe.note.logicalResource, recipe.field.logicalResource,
      recipe.tapEffect.logicalResource, recipe.tapSE.logicalResource, recipe.judge.logicalResource,
      recipe.background.logicalResource, recipe.directional.noteLogicalResource,
      recipe.directional.effectLogicalResource, recipe.directional.seLogicalResource,
      recipe.background.route === "special" ? `${recipe.background.logicalResource}preview` : null]);
    const catalog = await manager.prepareCatalog("bestdori");
    if (catalog.status === "rejected") throw new Error(catalog.failure.boundary);
    const refs: Record<string, ResourceRef> = {};
    for (const resource of resources) {
      if (!resource) continue;
      const ref = originalSkinResourceRef(resource);
      if (ref.status === "rejected") throw new Error(ref.failure.boundary);
      refs[resource] = ref.value;
    }
    const snapshot = await manager.createSnapshotFromRefs(refs);
    if (snapshot.status === "rejected") throw new Error(snapshot.failure.boundary);
    const lease = await manager.acquireSnapshot(snapshot.value.snapshotId);
    if (lease.status === "rejected") throw new Error(lease.failure.boundary);
    return lease.value;
  }, [manager]);
}
