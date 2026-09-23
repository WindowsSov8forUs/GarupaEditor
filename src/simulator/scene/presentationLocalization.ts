import chinese from "../../data/simulator/chinesePresentation.json";

export const SIMULATOR_CHINESE_FONT = "GarupaSimulatorChinese";
export const SIMULATOR_WORDING = chinese.wording;
const literals: Readonly<Record<string, string>> = chinese.literals;

export function localizeSimulatorText(value: string): string {
  return literals[value] ?? value;
}

/** Numeric/Latin labels retain the original face. Kana identifies Japanese
 * metadata; Han-only metadata defaults to Chinese, with the other face as fallback.
 * This is an editor presentation policy, not an original-client language detector. */
export function simulatorTextFonts(value: string, japanese: string): string[] {
  return /[\u3400-\u9fff]/u.test(value) && !/[\u3040-\u30ff]/u.test(value)
    ? [SIMULATOR_CHINESE_FONT, japanese]
    : [japanese, SIMULATOR_CHINESE_FONT];
}
