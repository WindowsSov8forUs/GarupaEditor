// Public read-only settings surface; reuse the engine's canonical evidence and validators.
export { isOriginalSuddenRate, ORIGINAL_SUDDEN_DEFAULT, ORIGINAL_SUDDEN_MIN, ORIGINAL_SUDDEN_MAX,
  ORIGINAL_SUDDEN_STEP, ORIGINAL_SUDDEN_SMALL_STEP } from "../engine/data/originalSudden";
export { createOriginalLiveSettings, MV_DARKNESS_VALUES, isOriginalLongNoteLineBrightness,
  LONG_NOTE_LINE_BRIGHTNESS_MIN, LONG_NOTE_LINE_BRIGHTNESS_MAX, LONG_NOTE_LINE_BRIGHTNESS_DEFAULT } from "../engine/data/originalLiveSettings";
export { validateAndFreezeOriginalSkinSettings } from "../engine/skin/originalSkinValidation";
export { CURRENT_NORMAL_NOTE_SKINS, CURRENT_NORMAL_LANE_SKINS, CURRENT_NORMAL_EFFECT_SKINS,
  CURRENT_NORMAL_SOUND_SKINS, CURRENT_NORMAL_DIRECTIONAL_SKINS } from "../engine/skin/currentMasterCatalog";
