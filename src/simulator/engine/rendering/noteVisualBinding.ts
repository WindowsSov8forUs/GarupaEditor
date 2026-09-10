import type { RenderEngineResourceBindings } from "./renderCommandProducer";

export type NoteBodyFamily = "note_normal" | "note_normal_16" | "note_skill" | "note_long" | "note_flick" | "note_slide_among";

/** Common skin lookup after the chart adapter has supplied its semantic inputs. */
export function noteBodyBinding(resources: RenderEngineResourceBindings, family: NoteBodyFamily,
  laneSuffix: string, width: number, habahiro: boolean, direction: "l" | "r" | null = null) {
  if (direction !== null) {
    // Original range directional bodies have a null sprite; the icon is independent.
    if (habahiro && laneSuffix.includes("_")) return null;
    return { logicalAssetId: resources.directionalAtlasLogicalAssetId, exactKey: `note_flick_${direction}_${laneSuffix}` };
  }
  const atlasRole = { note_normal: "normal", note_normal_16: "normal16", note_skill: "skill",
    note_long: "long", note_flick: "flick", note_slide_among: "slideAmong" } as const;
  return { logicalAssetId: habahiro ? resources.habahiroAtlasLogicalAssetIds![atlasRole[family]] : resources.noteAtlasLogicalAssetId,
    exactKey: family === "note_slide_among"
      ? habahiro && width > 1 ? `${family}_${width}` : family
      : `${family}_${laneSuffix}` };
}

export function noteFlickIconBinding(resources: RenderEngineResourceBindings,
  direction: "up" | "left" | "right", width: number, habahiro: boolean) {
  if (direction !== "up") return { logicalAssetId: resources.directionalAtlasLogicalAssetId,
    exactKey: direction === "left" ? "note_flick_top_l" : "note_flick_top_r" };
  const iconWidth = habahiro ? Math.min(width, 3) : 1;
  return { logicalAssetId: habahiro ? resources.habahiroAtlasLogicalAssetIds!.flick : resources.noteAtlasLogicalAssetId,
    exactKey: iconWidth === 1 ? "note_flick_top" : `note_flick_top_${iconWidth}` };
}

export function noteLongFlashBinding(resources: RenderEngineResourceBindings, suffix: string, habahiro: boolean) {
  return { logicalAssetId: habahiro ? resources.habahiroAtlasLogicalAssetIds!.longFlash : resources.noteAtlasLogicalAssetId,
    exactKey: `note_long_flash_${suffix}` };
}

/** NoteSlide.Activate uses its centered laneSize table once, from the authored head. */
export function noteSlideFlashBinding(resources: RenderEngineResourceBindings, width: number, center: number, habahiro: boolean) {
  // Outside the original atlas domain, retain the original single-lane flash.
  const size = habahiro && Number.isInteger(width) && width >= 1 && width <= 7 ? width : 1;
  const start = Math.floor((7 - size) / 2) + (size % 2 === 0 && center > 3 ? 1 : 0);
  const suffix = Array.from({ length: size }, (_, index) => start + index).join("_");
  return noteLongFlashBinding(resources, suffix, habahiro);
}

export function advanceNoteAnimationClock(elapsed: number, delta: number, restarted = false, playing = true): number {
  return playing ? Math.fround((restarted ? 0 : elapsed) + delta) : 0;
}
