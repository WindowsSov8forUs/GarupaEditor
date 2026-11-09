import { currentSpecialSkins, officialLimitedSkinVersion } from "../simulator/public/settings";
import { createResourceRef } from "./contracts";
import builtinSources from "../data/simulator/originalSkinBuiltinSources.json";

// Provider routing belongs at the resource boundary. All skin algorithms keep
// consuming the same original logical paths, including mixed normal/special sets.
// Limited skins arrive with the official masters, so the routing table follows their version.
let sources = new Map<string, string>();
let sourcesVersion = -1;
function skinSources(): Map<string, string> {
  if (sourcesVersion === officialLimitedSkinVersion()) return sources;
  sources = new Map<string, string>();
  for (const row of currentSpecialSkins()) {
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
  sourcesVersion = officialLimitedSkinVersion();
  return sources;
}

export function originalSkinResourceRef(logicalResource: string, defaultServer = "jp") {
  const source = `${skinSources().get(logicalResource) ?? defaultServer}/${logicalResource}`;
  // Exact source catalog entries supply official packages absent from the mirror.
  // Keep provider selection shared by preload, preview and live assembly.
  const builtin = (builtinSources as Readonly<Record<string, string>>)[source];
  return createResourceRef(builtin ?? `bestdori/${source}`);
}
