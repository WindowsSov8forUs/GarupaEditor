import profile from "../data/originalSpecialSkinProfile.json";
import { ORIGINAL_WORDING } from "./originalPrefabModel";
import { CURRENT_COLLABO_SKINS, currentOfficialLimitedSkins, findCurrentSpecialSkin, isOfficialLimitedSkin, type CurrentSpecialSkinMaster,
  type OriginalSkinSpecialSelection, type OriginalSkinSpecialComponentStates } from "../simulator/public/settings";

export type SelectedSpecialSkin = Exclude<OriginalSkinSpecialSelection, { kind: "none" }>;
export const specialComponentFields = {
  laneAndLine: "laneBundleName", tapEffect: "effectBundleName", background: "backgroundBundleName",
  rhythmIcon: "notesBundleName", directionalFlickIcon: "directionalBundleName",
  soundEffect: "soundEffectBundleName", judge: "judgeBundleName",
} as const;
export const specialSkinKey = (value: OriginalSkinSpecialSelection) => value.kind === "none" ? "none"
  : `${value.kind}:${value.kind === "limited" ? value.limitedSkinId : value.seasonSpecialId}`;
export function specialSkinMaster(value: SelectedSpecialSkin) {
  return findCurrentSpecialSkin(value.kind, value.kind === "limited" ? value.limitedSkinId : value.seasonSpecialId)!;
}
export function selectSpecialSkin(master: CurrentSpecialSkinMaster): SelectedSpecialSkin {
  const components = Object.fromEntries(Object.keys(specialComponentFields).map(key => [key, "on"])) as unknown as OriginalSkinSpecialComponentStates;
  return master.kind === "limited" ? { kind: "limited", limitedSkinId: master.selectionId, components }
    : { kind: "collabo", seasonSpecialId: master.selectionId, components };
}
export function specialSkinName(master: CurrentSpecialSkinMaster): string {
  if (isOfficialLimitedSkin(master)) return master.name;
  // Keep identities in selection state, not in the displayed source name.
  const season = profile.collaboration.find(row => row.seasonSpecialId === master.selectionId)!;
  return season.description;
}
/** Limited skins from the official masters in their sequence, then the collaborations. */
export function selectableSpecialSkins(): readonly CurrentSpecialSkinMaster[] {
  const limited = currentOfficialLimitedSkins().slice().sort((a, b) => a.seq - b.seq);
  return [...limited, ...CURRENT_COLLABO_SKINS].filter(row => row.selectable);
}

export const specialSkinWording = (key: string): string =>
  (profile.wording as Record<string, string>)[key] ?? ORIGINAL_WORDING[key] ?? key;
export function specialSkinDescription(): string {
  return [profile.collaborationGenericDescriptionCn.split("\n")[0],
    ...specialSkinWording("word_off_skin_description").split("\n").slice(-2)].join("\n");
}
export function hasAppliedSpecialComponent(value: SelectedSpecialSkin): boolean {
  const master = specialSkinMaster(value);
  return (Object.keys(specialComponentFields) as (keyof typeof specialComponentFields)[])
    .some(key => master[specialComponentFields[key]] !== null && value.components[key] === "on");
}
