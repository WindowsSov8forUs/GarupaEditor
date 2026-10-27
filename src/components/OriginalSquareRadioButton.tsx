import type { ReactNode } from "react";
import { OriginalPrefabModel, ORIGINAL_PREFABS } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";

const sourceModel = new OriginalPrefabModel(ORIGINAL_PREFABS.staruisquareradiobutton!);
export const ORIGINAL_SQUARE_RADIO_BOUNDS = sourceModel.rect(sourceModel.components.get(11)!);

/** The music band's square radio: both background states and its check mark. */
export function OriginalSquareRadioButton({ label, selected, onClick, content, disabled = false, textX = 1, textY = -1, spacing = 0 }: {
  label: string; selected: boolean; onClick(): void; content?: ReactNode;
  disabled?: boolean; textX?: number; textY?: number; spacing?: number;
}) {
  const model = new OriginalPrefabModel(ORIGINAL_PREFABS.staruisquareradiobutton!, {
    nodes: { 1: { active: selected }, 3: { active: content != null, x: 1, y: 0, scaleX: 0.45, scaleY: 0.45 },
      4: { active: content == null, x: textX, y: textY } },
    components: { 11: { m_Enabled: selected ? 0 : 1 }, 13: { m_Enabled: selected ? 1 : 0 },
      16: { mText: label, mFontSize: 20, mSpacingX: spacing,
        ...(selected ? { mColor: { r: 1, g: 1, b: 1, a: 1 } } : {}) } },
  });
  return <OriginalPrefabView model={model} bindings={{
    buttons: { 14: { action: onClick, label, role: "radio", selected, disabled } },
    textures: content == null ? {} : { 15: content },
  }} />;
}
