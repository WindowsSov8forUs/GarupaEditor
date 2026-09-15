import {
  projectCanvasRenderResourceRuntimeAssets,
  type AnyRhythmSkinAssets,
  type SkinAssets,
} from "../skinLoader";

export type SkinRuntimeResourceKey = string;

export function projectSkinRuntimeResourceMap(
  skin: SkinAssets<AnyRhythmSkinAssets>,
): Readonly<Record<SkinRuntimeResourceKey, string>> {
  const runtime = projectCanvasRenderResourceRuntimeAssets(skin);
  const entries: Array<readonly [string, string]> = [
    ["note.single", runtime.single],
    ["note.single16", runtime.single16],
    ["note.flick", runtime.flick],
    ["note.skill", runtime.skill],
    ["note.slide", runtime.slide],
    ["note.slide-among", runtime.slideAmong],
    ["note.directional-left", runtime.directionalFlickLeft],
    ["note.directional-right", runtime.directionalFlickRight],
    ["note.flick-top", runtime.flickTop],
    ["note.directional-left-top", runtime.directionalFlickLeftTop],
    ["note.directional-right-top", runtime.directionalFlickRightTop],
    ["line.long", runtime.longLine],
    ["line.long-special", runtime.longLineSpecial],
    ["line.simultaneous", runtime.simultaneousLine],
  ];
  if (runtime.habahiro) {
    for (const width of [1, 2, 3, 4, 5, 6, 7] as const) {
      entries.push([`habahiro.single.${width}`, runtime.singleByWidth[width]]);
      entries.push([`habahiro.single16.${width}`, runtime.single16ByWidth[width]]);
      entries.push([`habahiro.flick.${width}`, runtime.flickByWidth[width]]);
      entries.push([`habahiro.skill.${width}`, runtime.skillByWidth[width]]);
      entries.push([`habahiro.slide.${width}`, runtime.slideByWidth[width]]);
      entries.push([`habahiro.slide-among.${width}`, runtime.slideAmongByWidth[width]]);
      if (width === 1 || width === 2 || width === 3) {
        entries.push([`habahiro.flick-top.${width}`, runtime.flickTopByWidth[width]]);
      }
    }
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function reverseSkinRuntimeResourceMap(
  resources: Readonly<Record<SkinRuntimeResourceKey, string>>,
): ReadonlyMap<string, SkinRuntimeResourceKey> {
  const reverse = new Map<string, string>();
  for (const [key, value] of Object.entries(resources)) {
    if (!reverse.has(value)) reverse.set(value, key);
  }
  return reverse;
}
