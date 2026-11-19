import { useMemo } from "react";
import { OriginalPrefabModel, ORIGINAL_PREFABS, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";

// The live settings page's LaneFitCheckBox (StarUICheckBox 519): the 48×48 icon_checkbox with its check icon,
// grey-out cover and a 20px label 28 units to the right of the box centre.
const source = new OriginalPrefabModel(ORIGINAL_PREFABS.livesettingstabpage!);
const CHECKBOX_ID = 519;
const checkbox = source.components.get(CHECKBOX_ID)!;
const rootId = checkbox.node;
const nodes = source.prefab.nodes.filter(node => source.isWithin(node.id, rootId))
  .map(node => node.id === rootId ? { ...node, parent: null, position: { x: 0, y: 0, z: 0 } } : node);
const prefab: OriginalPrefab = { resource: source.prefab.resource, nodes,
  components: source.prefab.components.filter(component => nodes.some(node => node.id === component.node)) };
const local = new OriginalPrefabModel(prefab);
const box = local.rect(prefab.components.find(component => component.node === rootId && component.kind === "UISprite")!);
const LABEL_ID = 619;
const label = local.rect(local.components.get(LABEL_ID)!);
/** Height of the checkbox row (its label box), in design px. */
export const ORIGINAL_CHECKBOX_HEIGHT = label.height;

/** Original checkbox with a caller label; `labelWidth` in design px. The box's left edge is the element's left edge. */
export function OriginalCheckBox({ label: text, checked, onChange, disabled = false, labelWidth = label.width }: {
  label: string; checked: boolean; onChange(value: boolean): void; disabled?: boolean; labelWidth?: number;
}) {
  const model = useMemo(() => new OriginalPrefabModel(prefab, { components: {
    [LABEL_ID]: { mText: text, mWidth: labelWidth, mMaxLineCount: 1 },
  } }), [text, labelWidth]);
  return <div style={{ position: "relative", flex: "0 0 auto", width: label.x + labelWidth - box.x, height: label.height }}>
    <div className="original-prefab-origin" style={{ left: -box.x, top: label.height / 2 }}>
      <OriginalPrefabView model={model} bindings={{ checkboxes: { [CHECKBOX_ID]: { checked, disabled, onChange } } }} />
    </div>
  </div>;
}
