export interface CurrentNormalNoteSkinMaster {
  readonly setting: number;
  readonly masterId: number;
  readonly bundleName: string;
  readonly noteSyncEdgeMargin: number;
}

export interface CurrentNormalLaneSkinMaster {
  readonly setting: number;
  readonly masterId: number;
  readonly bundleName: string;
  readonly skinType: "NORMAL" | "MISSION";
}

export interface CurrentNormalSkinMaster {
  readonly setting: number;
  readonly masterId: number;
  readonly bundleName: string;
}

export interface CurrentSpecialSkinMaster {
  readonly kind: "collabo" | "limited";
  readonly selectionId: number;
  readonly selectable: boolean;
  readonly backgroundBundleName: string | null;
  readonly effectBundleName: string | null;
  readonly laneBundleName: string | null;
  readonly notesBundleName: string | null;
  readonly soundEffectBundleName: string | null;
  readonly judgeBundleName: string | null;
  readonly directionalBundleName: string | null;
  readonly noteSyncEdgeMargin: number;
}

export const CURRENT_NORMAL_NOTE_SKINS: readonly CurrentNormalNoteSkinMaster[] = freezeRows([
  { setting: 0, masterId: 1, bundleName: "skin00", noteSyncEdgeMargin: 0 },
  { setting: 1, masterId: 2, bundleName: "skin01", noteSyncEdgeMargin: 0 },
  { setting: 2, masterId: 3, bundleName: "skin02", noteSyncEdgeMargin: 0 },
  { setting: 3, masterId: 4, bundleName: "skin03", noteSyncEdgeMargin: 0 },
  { setting: 4, masterId: 5, bundleName: "skin04", noteSyncEdgeMargin: 0 },
  { setting: 5, masterId: 6, bundleName: "skin06", noteSyncEdgeMargin: 0 },
  { setting: 6, masterId: 7, bundleName: "skin05", noteSyncEdgeMargin: Math.fround(1.1) },
]);

export const CURRENT_NORMAL_LANE_SKINS: readonly CurrentNormalLaneSkinMaster[] = freezeRows([
  { setting: 0, masterId: 1, bundleName: "skin00", skinType: "NORMAL" },
  { setting: 1, masterId: 2, bundleName: "skin01", skinType: "NORMAL" },
  { setting: 2, masterId: 3, bundleName: "skin02", skinType: "NORMAL" },
  { setting: 3, masterId: 4, bundleName: "skin03", skinType: "NORMAL" },
  { setting: 4, masterId: 5, bundleName: "skin04", skinType: "NORMAL" },
  { setting: 5, masterId: 6, bundleName: "skin05", skinType: "MISSION" },
  { setting: 6, masterId: 7, bundleName: "skin06", skinType: "MISSION" },
  { setting: 7, masterId: 8, bundleName: "skin07", skinType: "MISSION" },
  { setting: 8, masterId: 9, bundleName: "skin08", skinType: "MISSION" },
  { setting: 9, masterId: 10, bundleName: "skin09", skinType: "MISSION" },
  { setting: 10, masterId: 11, bundleName: "skin10", skinType: "MISSION" },
  { setting: 11, masterId: 12, bundleName: "skin11", skinType: "MISSION" },
  { setting: 12, masterId: 13, bundleName: "skin12", skinType: "NORMAL" },
  { setting: 13, masterId: 14, bundleName: "skin13", skinType: "NORMAL" },
  { setting: 14, masterId: 15, bundleName: "skin14", skinType: "MISSION" },
]);

export const CURRENT_NORMAL_EFFECT_SKINS: readonly CurrentNormalSkinMaster[] = freezeRows([
  { setting: 0, masterId: 1, bundleName: "skin00" },
  { setting: 1, masterId: 2, bundleName: "skin01" },
  { setting: 2, masterId: 3, bundleName: "skin02" },
  { setting: 3, masterId: 4, bundleName: "skin03" },
  { setting: 4, masterId: 5, bundleName: "skin04" },
]);

export const CURRENT_NORMAL_SOUND_SKINS: readonly CurrentNormalSkinMaster[] = freezeRows([
  { setting: 0, masterId: 1, bundleName: "skin00" },
  { setting: 1, masterId: 2, bundleName: "skin01" },
  { setting: 2, masterId: 3, bundleName: "skin02" },
  { setting: 3, masterId: 4, bundleName: "skin03" },
]);

export const CURRENT_NORMAL_DIRECTIONAL_SKINS: readonly CurrentNormalSkinMaster[] = freezeRows([
  { setting: 0, masterId: 1, bundleName: "skin00" },
  { setting: 1, masterId: 2, bundleName: "skin01" },
  { setting: 2, masterId: 3, bundleName: "skin02" },
  { setting: 3, masterId: 4, bundleName: "skin03" },
  { setting: 4, masterId: 5, bundleName: "skin04" },
]);

const SPECIAL_ROW_DATA = [
  ["collabo",17,true,"skin_persona","skin_persona","skin_persona","skin_persona","skin_persona",null,null,0],
  ["collabo",21,true,"skin_miku","skin_miku","skin_miku","skin_miku","skin_miku",null,null,0],
  ["collabo",36,false,"skinapril2019","skinapril2019","skinapril2019","skinapril2019","skinapril2019","skinapril2019",null,0],
  ["collabo",86,true,"skin_cafe","skin_cafe","skin_cafe","skin_cafe","skin_cafe",null,null,0],
  ["collabo",88,true,"skin_miku","skin_miku","skin_miku","skin_miku","skin_miku",null,null,0],
  ["collabo",91,true,"skin_maid","skin_maid","skin_maid","skin_maid","skin_maid",null,null,0],
  ["collabo",159,true,"skin_gbp2020",null,"skin_gbp2020",null,null,null,null,0],
  ["collabo",160,true,"skin_coin","skin_coin","skin_coin","skin_coin","skin_coin",null,null,0],
  ["collabo",161,true,"skin_miku","skin_miku","skin_miku","skin_miku","skin_miku",null,null,0],
  ["collabo",167,true,"skin_witch","skin_witch","skin_witch","skin_witch","skin_witch",null,null,0],
  ["collabo",207,true,"skin_april2021",null,"skin_april2021","skin_april2021","skinapril2021","skinapril2021",null,0],
  ["collabo",208,true,"skin_stage","skin_stage","skin_stage","skin_stage","skin_stage",null,null,0],
  ["collabo",209,true,"skin_gbp2020",null,"skin_gbp2020",null,null,null,null,0],
  ["collabo",210,true,"skin_persona","skin_persona","skin_persona","skin_persona","skin_persona",null,"skin_persona",0],
  ["collabo",219,true,"skin_delta","skin_delta","skin_delta","skin_delta","skin_delta",null,null,0],
  ["collabo",227,true,"skin_5th",null,null,null,null,null,null,0],
  ["collabo",262,true,"skin_bike",null,"skin_bike",null,null,"skin_bike",null,0],
  ["collabo",263,true,"skin_maid","skin_maid","skin_maid","skin_maid","skin_maid",null,null,0],
  ["collabo",265,true,"skin_satan",null,"skin_satan",null,null,null,null,0],
  ["collabo",267,true,"skin_gbp2020",null,"skin_gbp2020",null,null,null,null,0],
  ["collabo",276,true,null,null,null,"skin_april2018","skin_april2018",null,null,0],
  ["collabo",277,true,"skin_april2019","skin_april2019","skin_april2019","skin_april2019","skin_april2019","skin_april2019",null,0],
  ["collabo",278,true,"skin_april2021",null,"skin_april2021","skin_april2021","skinapril2021","skinapril2021",null,0],
  ["collabo",279,true,"skin_collabo23_summer_g",null,"collabo23_summer_g","collabo23_summer_g",null,null,null,0],
  ["collabo",283,true,"skin_collabo23_winter_d","skin_delta","skin_delta","skin_delta","skin_delta",null,null,0],
  ["collabo",284,true,"skin_april_2024",null,"skin_april_2024","skin_april_2024",null,null,null,0],
  ["collabo",285,true,"skin_satan",null,"skin_satan",null,null,null,null,0],
  ["collabo",286,true,"skin_collabo24_autumn_i",null,"skin_collabo24_autumn_i","skin_collabo24_autumn_i",null,null,null,0],
  ["collabo",291,true,"skin_stage","skin_stage","skin_stage","skin_stage","skin_stage",null,null,0],
  ["collabo",293,true,"skin_collabo25_autumn_s",null,"skin_collabo25_autumn_s","skin_collabo25_autumn_s",null,null,null,0],
  ["limited",1,true,null,null,null,"skin_april2018","skin_april2018",null,null,0],
  ["limited",2,true,"skin_april2019","skin_april2019","skin_april2019","skin_april2019","skin_april2019","skin_april2019",null,0],
  ["limited",3,true,"skin_april2021",null,"skin_april2021","skin_april2021","skinapril2021","skinapril2021",null,0],
  ["limited",4,true,"skin_april_2024",null,"skin_april_2024","skin_april_2024",null,null,null,0],
] as const;

export const CURRENT_SPECIAL_SKINS: readonly CurrentSpecialSkinMaster[] = Object.freeze(
  SPECIAL_ROW_DATA.map((row) => Object.freeze({
    kind: row[0],
    selectionId: row[1],
    selectable: row[2],
    backgroundBundleName: row[3],
    effectBundleName: row[4],
    laneBundleName: row[5],
    notesBundleName: row[6],
    soundEffectBundleName: row[7],
    judgeBundleName: row[8],
    directionalBundleName: row[9],
    noteSyncEdgeMargin: Math.fround(row[10]),
  })),
);

export function findCurrentSpecialSkin(
  kind: "collabo" | "limited",
  selectionId: number,
): CurrentSpecialSkinMaster | null {
  return CURRENT_SPECIAL_SKINS.find((row) =>
    row.kind === kind && row.selectionId === selectionId) ?? null;
}

function freezeRows<T extends object>(rows: readonly T[]): readonly T[] {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}
