import type { SimulatorOriginalSkinSettings } from "../../simulator/public/contracts";
import { validateAndFreezeOriginalSkinSettings } from "../../simulator/public/settings";

export interface SimulatorMenuSettings {
  readonly lastTab: number;
  readonly suddenRate: number;
  readonly suddenLane: boolean;
  readonly hideFastSlow: boolean;
  readonly displayStageEffect: boolean;
  readonly hideCombo: boolean;
  readonly displayComboPosition: number;
  readonly judgementAdjustValue: number;
  readonly judgementAdjustValueB: number;
  readonly musicVolumePercent: number;
  readonly masterVolumePercent: number;
  readonly systemSeVolumePercent: number;
  readonly systemBgmVolumePercent: number;
  readonly skin: SimulatorOriginalSkinSettings;
  readonly rememberedCollaboSkin?: Extract<SimulatorOriginalSkinSettings["special"], { kind: "collabo" }>;
  readonly rememberedLimitedSkin?: Extract<SimulatorOriginalSkinSettings["special"], { kind: "limited" }>;
}
export const DEFAULT_SIMULATOR_MENU_SETTINGS: SimulatorMenuSettings = Object.freeze({
  hideFastSlow: false, displayStageEffect: true,
  hideCombo: false, displayComboPosition: 4,
  lastTab: 0,
  suddenRate: 0, suddenLane: false, judgementAdjustValue: 0, judgementAdjustValueB: 0, musicVolumePercent: 70, masterVolumePercent: 100, systemSeVolumePercent: 70, systemBgmVolumePercent: 70,
  skin: Object.freeze({ noteSkin: 0, fieldSkin: 0, tapEffect: 0, judgeSE: 0, directionalFlick: 0,
    directionalFlickEffect: 0, isFixedBG: false, special: Object.freeze({ kind: "none" as const }) }),
});

/** Missing means a pre-menu cache. Present invalid values are never silently repaired. */
export function normalizeSimulatorMenuSettings(value: unknown): SimulatorMenuSettings {
  if (value === undefined) return DEFAULT_SIMULATOR_MENU_SETTINGS;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Simulator 设置缓存格式无效。");
  const item = value as Record<string, unknown>;
  for (const [key, min, max] of [
    ["lastTab", 0, 3], ["judgementAdjustValue", -30, 30], ["judgementAdjustValueB", -5, 5],
  ] as const) {
    if (!Number.isInteger(item[key]) || (item[key] as number) < min || (item[key] as number) > max) {
      throw new Error(`Simulator 设置 ${key} 必须是 ${min}～${max} 的整数。`);
    }
  }
  for (const key of ["musicVolumePercent", "masterVolumePercent"] as const) {
    if (typeof item[key] !== "number" || !Number.isFinite(item[key]) || item[key] < 0 || item[key] > 100)
      throw new Error(`Simulator ${key} requires a finite volume in [0,100].`);
  }
  // Legacy caches predate these two local presentation settings. Present invalid values are rejected.
  const hideFastSlow = item.hideFastSlow === undefined ? false : item.hideFastSlow;
  const displayStageEffect = item.displayStageEffect === undefined ? true : item.displayStageEffect;
  if (typeof hideFastSlow !== "boolean" || typeof displayStageEffect !== "boolean")
    throw new Error("Invalid original live-effect switches.");
  const hideCombo = item.hideCombo === undefined ? false : item.hideCombo;
  const displayComboPosition = item.displayComboPosition === undefined ? 4 : item.displayComboPosition;
  if (typeof hideCombo !== "boolean" || !Number.isInteger(displayComboPosition) ||
    (displayComboPosition as number) < 0 || (displayComboPosition as number) > 5)
    throw new Error("Invalid original Combo display settings.");
  const systemSeVolumePercent = item.systemSeVolumePercent === undefined ? 70 : item.systemSeVolumePercent;
  const systemBgmVolumePercent = item.systemBgmVolumePercent === undefined ? 70 : item.systemBgmVolumePercent;
  if (typeof systemBgmVolumePercent !== "number" || !Number.isFinite(systemBgmVolumePercent) || systemBgmVolumePercent < 0 || systemBgmVolumePercent > 100)
    throw new Error("Invalid original system BGM volume.");
  if (typeof systemSeVolumePercent !== "number" || !Number.isFinite(systemSeVolumePercent) || systemSeVolumePercent < 0 || systemSeVolumePercent > 100)
    throw new Error("Invalid original system SE volume.");
  const suddenRate = item.suddenRate === undefined ? 0 : item.suddenRate;
  const suddenLane = item.suddenLane === undefined ? false : item.suddenLane;
  if (!Number.isInteger(suddenRate) || (suddenRate as number) < 0 || (suddenRate as number) > 100 || typeof suddenLane !== "boolean")
    throw new Error("Invalid original Sudden settings.");
  const skin = validateAndFreezeOriginalSkinSettings(item.skin);
  if (skin.status !== "ok") throw new Error("Simulator 皮肤设置不符合原作索引范围。");
  const remembered = (kind: "collabo" | "limited", value: unknown) => {
    const legacy = item.rememberedSpecialSkin as { kind?: string } | undefined;
    const candidate = value ?? (skin.value.special.kind === kind ? skin.value.special
      : legacy?.kind === kind ? legacy : undefined);
    if (candidate === undefined) return undefined;
    const checked = validateAndFreezeOriginalSkinSettings({ ...skin.value, special: candidate });
    if (checked.status !== "ok" || checked.value.special.kind !== kind) throw new Error("保存的限定皮肤设置无效。");
    return checked.value.special;
  };
  const rememberedCollaboSkin = remembered("collabo", item.rememberedCollaboSkin) as SimulatorMenuSettings["rememberedCollaboSkin"];
  const rememberedLimitedSkin = remembered("limited", item.rememberedLimitedSkin) as SimulatorMenuSettings["rememberedLimitedSkin"];
  return Object.freeze({ hideFastSlow, displayStageEffect, hideCombo, displayComboPosition: displayComboPosition as number, lastTab: item.lastTab as number, judgementAdjustValue: item.judgementAdjustValue as number,
    judgementAdjustValueB: item.judgementAdjustValueB as number,
    musicVolumePercent: item.musicVolumePercent as number, masterVolumePercent: item.masterVolumePercent as number,
    systemSeVolumePercent, systemBgmVolumePercent, suddenRate: suddenRate as number, suddenLane, skin: skin.value,
    rememberedCollaboSkin, rememberedLimitedSkin });
}
