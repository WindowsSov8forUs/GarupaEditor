import type { ApplicationResourceManager } from "./applicationResourceManager";
import { originalSkinResourceRef } from "./originalSkinResourceRef";
import { CURRENT_NORMAL_NOTE_SKINS, CURRENT_NORMAL_LANE_SKINS, CURRENT_NORMAL_EFFECT_SKINS,
  CURRENT_NORMAL_SOUND_SKINS, CURRENT_NORMAL_DIRECTIONAL_SKINS, CURRENT_SPECIAL_SKINS,
  resolveOriginalPreviewSkin } from "../simulator/public/settings";
import type { SimulatorOriginalSkinSettings } from "../simulator/public/contracts";
import { createResourceRef } from "./contracts";
import { limitedSkinThumbnailDescriptor } from "./providers/bestdoriCatalogProvider";
import { collaborationThumbnailSources, loadCollaborationSkinThumbnail } from "../skin/thumbnails/collaborationSkinThumbnailResource";

export interface SkinPreloadResult { readonly failures: readonly string[]; readonly unpublished: readonly string[] }
const started = new WeakMap<ApplicationResourceManager, Promise<SkinPreloadResult>>();

/** The complete selectable inventory, not every asset on every provider server. */
export function skinResourceInventory(): readonly string[] {
  const resources = new Set<string>();
  const normal: SimulatorOriginalSkinSettings = { noteSkin: 0, fieldSkin: 0, tapEffect: 0, judgeSE: 0,
    directionalFlick: 0, directionalFlickEffect: 0, isFixedBG: false, special: { kind: "none" } };
  const add = (settings: SimulatorOriginalSkinSettings) => {
    const r = resolveOriginalPreviewSkin(settings);
    [r.note.logicalResource, r.field.logicalResource, r.tapEffect.logicalResource, r.tapSE.logicalResource,
      r.judge.logicalResource, r.background.logicalResource, r.directional.noteLogicalResource,
      r.directional.effectLogicalResource, r.directional.seLogicalResource,
      r.background.route === "special" ? `${r.background.logicalResource}preview` : null]
      .forEach(value => { if (value) resources.add(value); });
  };
  add(normal);
  for (const row of CURRENT_NORMAL_NOTE_SKINS) {
    add({ ...normal, noteSkin: row.setting });
    resources.add(`ingameskin/noteskin/${row.bundleName}sample`);
  }
  for (const row of CURRENT_NORMAL_LANE_SKINS) add({ ...normal, fieldSkin: row.setting });
  for (const row of CURRENT_NORMAL_EFFECT_SKINS) add({ ...normal, tapEffect: row.setting });
  for (const row of CURRENT_NORMAL_SOUND_SKINS) add({ ...normal, judgeSE: row.setting });
  for (const row of CURRENT_NORMAL_DIRECTIONAL_SKINS) {
    for (const variant of [0, 1] as const) add({ ...normal, directionalFlick: row.setting, directionalFlickEffect: variant });
    resources.add(`ingameskin/noteskin/directionalflick${row.bundleName}sample`);
  }
  const components = { laneAndLine: "on", tapEffect: "on", background: "on", rhythmIcon: "on",
    directionalFlickIcon: "on", soundEffect: "on", judge: "on" } as const;
  for (const row of CURRENT_SPECIAL_SKINS.filter(row => row.selectable)) {
    for (const variant of [0, 1] as const) add({ ...normal, directionalFlickEffect: variant,
      special: row.kind === "limited" ? { kind: "limited", limitedSkinId: row.selectionId, components }
        : { kind: "collabo", seasonSpecialId: row.selectionId, components } });
  }
  return [...resources];
}

/** Complete the selectable inventory before startup releases the loading screen. */
export function preloadSkinResources(manager: ApplicationResourceManager,
  progress: (completed: number, total: number) => void = () => {},
): Promise<SkinPreloadResult> {
  let pending = started.get(manager);
  if (!pending) {
    pending = preload(manager, progress).then(result => {
      if (result.failures.length || result.unpublished.length) started.delete(manager);
      return result;
    }, error => { started.delete(manager); throw error; });
    started.set(manager, pending);
  }
  return pending;
}

async function preload(manager: ApplicationResourceManager,
  progress: (completed: number, total: number) => void): Promise<SkinPreloadResult> {
  const catalog = await manager.prepareCatalog("bestdori");
  if (catalog.status === "rejected") throw new Error(catalog.failure.boundary);
  const refs = skinResourceInventory().map(logical => originalSkinResourceRef(logical));
  for (const server of ["jp", "cn"] as const) {
    const descriptor = limitedSkinThumbnailDescriptor(server, catalog.value.observedAt);
    const registered = manager.registerNetworkResource(descriptor);
    if (registered.status === "rejected") throw new Error(registered.failure.boundary);
    refs.push(createResourceRef(descriptor.ref.id));
  }
  const failures: string[] = [], unpublished: string[] = [];
  const ready = new Set<string>(), attempted = new Set<string>();
  const thumbnails = CURRENT_SPECIAL_SKINS.filter(row => row.kind === "collabo" && row.selectable)
    .map(skin => ({ skin, refs: collaborationThumbnailSources(skin).refs }));
  // Keep package I/O bounded; thumbnail preparation must not serialize the
  // remaining package checks behind image decoding and snapshot acquisition.
  let completed = 0, cursor = 0;
  const total = refs.length + thumbnails.length;
  progress(0, total);
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < refs.length) {
      const ref = refs[cursor++]!;
      if (ref.status === "rejected") {
        failures.push(ref.failure.boundary);
      } else {
        try {
          const result = await manager.ensureAvailable(ref.value);
          if (result.status === "rejected") {
            const details = `${ref.value.id}：${result.failure.userMessage ?? result.failure.boundary}`;
            if (result.failure.capability === "resources.bestdori.package-not-published") unpublished.push(details);
            else failures.push(details);
          } else ready.add(ref.value.id);
        } catch (cause) { failures.push(`${ref.value.id}: ${String(cause)}`); }
      }
      progress(++completed, total);
    }
  }));
  // Rasterization stays sequential to avoid multiplying canvas memory usage.
  for (const { skin, refs } of thumbnails) {
    const pair = JSON.stringify(refs);
    if (!attempted.has(pair) && ready.has(refs.note.id) && ready.has(refs.field.id)) {
      attempted.add(pair);
      try { await loadCollaborationSkinThumbnail(manager, skin); }
      catch (cause) { failures.push(`联动缩略图 ${skin.selectionId}: ${String(cause)}`); }
    }
    progress(++completed, total);
  }
  failures.sort(); unpublished.sort();
  if (failures.length) console.warn("部分皮肤预下载未完成；其余资源已缓存，下次启动可补齐", failures);
  if (unpublished.length) console.warn("资源站尚未提供的皮肤包，未发起下载", unpublished);
  return { failures, unpublished };
}
