// Public read-only settings surface; reuse the engine's canonical evidence and validators.
export { isOriginalSuddenRate, ORIGINAL_SUDDEN_DEFAULT, ORIGINAL_SUDDEN_MIN, ORIGINAL_SUDDEN_MAX,
  ORIGINAL_SUDDEN_STEP, ORIGINAL_SUDDEN_SMALL_STEP } from "../engine/data/originalSudden";
export { createOriginalLiveSettings, MV_DARKNESS_VALUES, isOriginalLongNoteLineBrightness,
  LONG_NOTE_LINE_BRIGHTNESS_MIN, LONG_NOTE_LINE_BRIGHTNESS_MAX, LONG_NOTE_LINE_BRIGHTNESS_DEFAULT } from "../engine/data/originalLiveSettings";
export { validateAndFreezeOriginalSkinSettings } from "../engine/skin/originalSkinValidation";
export { CURRENT_NORMAL_NOTE_SKINS, CURRENT_NORMAL_LANE_SKINS, CURRENT_NORMAL_EFFECT_SKINS,
  CURRENT_NORMAL_SOUND_SKINS, CURRENT_NORMAL_DIRECTIONAL_SKINS, CURRENT_SPECIAL_SKINS,
  findCurrentSpecialSkin, type CurrentSpecialSkinMaster } from "../engine/skin/currentMasterCatalog";
export type { OriginalSkinSpecialSelection, OriginalSkinSpecialComponentStates, ResolvedOriginalSkinRecipe } from "../engine/skin/contracts";
import type { OriginalSkinSettings } from "../engine/skin/contracts";
import { resolveOriginalSkinRecipe } from "../engine/skin/originalSkinResolver";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";

/** The original settings preview uses Live/manual skin eligibility. */
export function resolveOriginalPreviewSkin(settings: OriginalSkinSettings) {
  const result = resolveOriginalSkinRecipe(settings, createSimulatorModeIdentity("live", "manual"), "ordinary", "standard");
  if (result.status !== "ok") throw new Error(result.boundary);
  return result.value;
}
