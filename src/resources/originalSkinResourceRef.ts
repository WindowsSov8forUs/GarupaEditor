import { CURRENT_SPECIAL_SKINS } from "../simulator/public/settings";
import { createResourceRef } from "./contracts";
import builtinSources from "../data/simulator/originalSkinBuiltinSources.json";

// Provider routing belongs at the resource boundary. All skin algorithms keep
// consuming the same original logical paths, including mixed normal/special sets.
const sources = new Map<string, string>();
for (const row of CURRENT_SPECIAL_SKINS) {
  if (row.resourceServer === "jp") continue;
  const bind = (family: string, bundle: string | null) => {
    if (bundle) sources.set(`${family}/${bundle}`, row.resourceServer);
  };
  bind("ingameskin/noteskin", row.notesBundleName);
  bind("ingameskin/fieldskin", row.laneBundleName);
  bind("ingameskin/tapeffect", row.effectBundleName);
  bind("ingameskin/judgeskin", row.judgeBundleName);
  bind("sound/tapseskin", row.soundEffectBundleName);
  bind("ingameskin/bgskin", row.backgroundBundleName);
  if (row.backgroundBundleName) bind("ingameskin/bgskin", `${row.backgroundBundleName}preview`);
  if (row.directionalBundleName) {
    bind("ingameskin/noteskin", `directionalflick${row.directionalBundleName}`);
    for (const variant of ["normal", "light"]) {
      bind("ingameskin/tapeffect", `directionalflick${row.directionalBundleName}${variant}`);
    }
  }
}

export function originalSkinResourceRef(logicalResource: string, defaultServer = "jp") {
  const source = `${sources.get(logicalResource) ?? defaultServer}/${logicalResource}`;
  // Exact source catalog entries supply official packages absent from the mirror.
  // Keep provider selection shared by preload, preview and live assembly.
  const builtin = (builtinSources as Readonly<Record<string, string>>)[source];
  return createResourceRef(builtin ?? `bestdori/${source}`);
}
