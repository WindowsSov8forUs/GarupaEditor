/** SoundSettingSlider.onChanged rounds its display, not the stored slider value. */
export function originalSoundVolumeLabel(percent: number): string {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw new Error("Original sound volume must be within [0,100].");
  const scaled = Math.fround(Math.fround(percent / 100) * 100);
  const lower = Math.floor(scaled);
  const rounded = scaled - lower === 0.5
    ? lower % 2 === 0 ? lower : lower + 1
    : Math.round(scaled);
  return String(rounded);
}
