import { originalSkinResourceRef } from "../resources/originalSkinResourceRef";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import { type ResourceConsumerLease, type ResourceRef } from "../resources/contracts";
import { type ResolvedOriginalSkinRecipe } from "../simulator/public/settings";
import { readOriginalPreviewSprites, type OriginalPreviewSprite } from "./originalPreviewSprites";
import selection from "../data/originalSkinSelection.json";

type Samples = {
  note: Readonly<Record<number, readonly string[]>>;
  directional: Readonly<Record<number, readonly string[]>>;
};
export interface OriginalSkinPreviewResources extends Samples {
  key: string;
  lane: string | null;
  background: string | null;
  judge: OriginalPreviewSprite | null;
}
const EMPTY_SAMPLES: Samples = Object.freeze({ note: Object.freeze({}), directional: Object.freeze({}) });
const basename = (path: string) => path.split("\\").join("/").split("/").pop()!.toLowerCase();
async function image(lease: ResourceConsumerLease, slot: string, name: string): Promise<string> {
  const files = lease.listFiles(slot).filter(file => basename(file.logicalPath) === name);
  if (files.length !== 1) throw new Error(`SkinPreview requires one ${slot}/${name}; found ${files.length}.`);
  return lease.openObjectUrl(slot, files[0]!.logicalPath);
}
function ref(logical: string): ResourceRef {
  const value = originalSkinResourceRef(logical);
  if (value.status === "rejected") throw new Error(value.failure.boundary);
  return value.value;
}
async function settledImages<T>(tasks: readonly Promise<T>[]): Promise<T[]> {
  // A failed sibling must not release the lease while other reads are in flight.
  const settled = await Promise.allSettled(tasks);
  const failure = settled.find(item => item.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return settled.map(item => (item as PromiseFulfilledResult<T>).value);
}

/** Sample rows and the selected lane own separate leases; lane changes do not erase the sample list. */
export function useOriginalSkinPreviewResources(recipe: ResolvedOriginalSkinRecipe, onError?: (message: string) => void) {
  const manager = useApplicationResourceManager(), error = useRef(onError); error.current = onError;
  const fieldResource = recipe.field.logicalResource!, fieldBundle = recipe.field.bundleName!;
  const backgroundResource = recipe.background.route === "special" ? `${recipe.background.logicalResource}preview` : null;
  const key = `${fieldResource}:${backgroundResource ?? "default"}`;
  const [samples, setSamples] = useState<Samples | null>(null);
  const [field, setField] = useState<{ key: string; lane: string; judge: OriginalPreviewSprite; background: string | null } | null>(null);
  useEffect(() => {
    let active = true, finished = false, lease: ResourceConsumerLease | null = null;
    const release = () => {
      const owner = lease; lease = null;
      if (owner) void owner.release().catch(cause => console.error("Skin sample cleanup failed", cause));
    };
    setSamples(null);
    void (async () => {
      const catalog = await manager.prepareCatalog("bestdori");
      if (catalog.status === "rejected") throw new Error(catalog.failure.boundary);
      if (!active) return;
      const refs: Record<string, ResourceRef> = {};
      for (const row of selection.note) refs[`preview.note.${row.setting}`] = ref(`ingameskin/noteskin/${row.bundleName}sample`);
      for (const row of selection.directional) refs[`preview.directional.${row.setting}`] = ref(`ingameskin/noteskin/directionalflick${row.bundleName}sample`);
      const snapshot = await manager.createSnapshotFromRefs(refs);
      if (snapshot.status === "rejected") throw new Error(snapshot.failure.boundary);
      if (!active) return;
      const acquired = await manager.acquireSnapshot(snapshot.value.snapshotId);
      if (acquired.status === "rejected") throw new Error(acquired.failure.boundary);
      lease = acquired.value;
      if (!active) return;
      const owner = lease;
      const requests = [
        ...selection.note.map(row => ({ setting: row.setting, kind: "note" as const, slot: `preview.note.${row.setting}`,
          names: ["note_normal_3.png", "note_skill_3.png", "note_long_3.png", "note_flick_3.png"] })),
        ...selection.directional.map(row => ({ setting: row.setting, kind: "directional" as const,
          slot: `preview.directional.${row.setting}`, names: ["note_flick_l_3.png", "note_flick_r_3.png"] })),
      ];
      const rows = await settledImages(requests.map(row => settledImages(row.names.map(name => image(owner, row.slot, name)))));
      const next = { note: {} as Record<number, readonly string[]>, directional: {} as Record<number, readonly string[]> };
      requests.forEach((row, index) => { next[row.kind][row.setting] = rows[index]!; });
      if (active) setSamples(next);
    })().catch(cause => {
      if (active) error.current?.(cause instanceof Error ? cause.message : String(cause));
      release();
    }).finally(() => { finished = true; if (!active) release(); });
    return () => { active = false; if (finished) release(); };
  }, [manager]);
  useEffect(() => {
    let active = true, finished = false, lease: ResourceConsumerLease | null = null;
    const derived = new Set<string>();
    const release = () => {
      derived.forEach(url => URL.revokeObjectURL(url)); derived.clear();
      const owner = lease; lease = null;
      if (owner) void owner.release().catch(cause => console.error("Skin lane cleanup failed", cause));
    };
    setField(null);
    void (async () => {
      const catalog = await manager.prepareCatalog("bestdori");
      if (catalog.status === "rejected") throw new Error(catalog.failure.boundary);
      if (!active) return;
      const snapshot = await manager.createSnapshotFromRefs({ "preview.field": ref(fieldResource),
        ...(backgroundResource ? { "preview.background": ref(backgroundResource) } : {}) });
      if (snapshot.status === "rejected") throw new Error(snapshot.failure.boundary);
      if (!active) return;
      const acquired = await manager.acquireSnapshot(snapshot.value.snapshotId);
      if (acquired.status === "rejected") throw new Error(acquired.failure.boundary);
      lease = acquired.value;
      if (!active) return;
      const background = backgroundResource ? await image(lease, "preview.background", "previewbg.png") : null;
      const lane = await image(lease, "preview.field", "bg_line_rhythm.png");
      const sprites = await readOriginalPreviewSprites(lease, "preview.field", fieldBundle, async canvas => {
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value =>
          value ? resolve(value) : reject(new Error("Preview sprite encoding failed."))));
        const url = URL.createObjectURL(blob); derived.add(url); return url;
      }, new Set(["game_play_line"]));
      const judge = sprites.get("game_play_line");
      if (!judge) throw new Error("Original preview requires the game_play_line Sprite.");
      if (active) setField({ key, lane, judge, background });
    })().catch(cause => {
      if (active) error.current?.(cause instanceof Error ? cause.message : String(cause));
      release();
    }).finally(() => { finished = true; if (!active) release(); });
    return () => { active = false; if (finished) release(); };
  }, [manager, fieldResource, fieldBundle, backgroundResource, key]);
  return useMemo<OriginalSkinPreviewResources>(() => ({
    key, ...(samples ?? EMPTY_SAMPLES),
    lane: field?.key === key ? field.lane : null,
    background: field?.key === key ? field.background : null,
    judge: field?.key === key ? field.judge : null,
  }), [samples, field, key]);
}
