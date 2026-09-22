import { OriginalPrefabView } from "./OriginalPrefabView";
import { OriginalPrefabModel, ORIGINAL_PREFABS } from "./originalPrefabModel";
import { specialSkinDescription } from "./originalSpecialSkinSelection";
import type { OriginalSkinSpecialSelection } from "../simulator/public/settings";
import profile from "../data/originalSpecialSkinProfile.json";

const source = new OriginalPrefabModel(ORIGINAL_PREFABS.specialskinrow!);
export function OriginalSpecialSkinRow({ selected, busy, onKind, onSelect, onDetail }: {
  selected: OriginalSkinSpecialSelection; busy: boolean;
  onKind: (value: OriginalSkinSpecialSelection["kind"]) => void;
  onSelect: () => void; onDetail: () => void;
}) {
  const radio = profile.consumers.specialRowRadio;
  const model = new OriginalPrefabModel(source.prefab, { components: {
    34: { mText: specialSkinDescription() },
    36: { RawNameFlag: true, radioButtonNameList: ["期间限定皮肤", "全部限定皮肤", "关"] },
    49: { mText: "设置期间限定演出皮肤" },
  } });
  return <OriginalPrefabView model={model} bindings={{
    radios: { 36: { index: selected.kind === "limited" ? 0 : selected.kind === "collabo" ? 1 : 2,
      // Keep each single-line label inside its authored 210-unit option column.
      disabled: busy, labelWidth: 160, labelHeight: 50,
      fontSize: radio.fontSize, maxLineCount: 1,
      optionLayouts: { 2: { labelWidth: radio.offLabelSize, labelHeight: radio.offLabelSize, offsetX: radio.offOffsetX } },
      onChange: index => onKind(index === 0 ? "limited" : index === 1 ? "collabo" : "none") } },
    buttons: { 42: { action: onSelect, disabled: busy || selected.kind === "none" },
      47: { action: onDetail, disabled: busy || selected.kind === "none" } },
  }} />;
}
