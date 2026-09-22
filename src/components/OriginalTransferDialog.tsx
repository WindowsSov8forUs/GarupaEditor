import type { ReactNode } from "react";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { OriginalPrefabModel, ORIGINAL_PREFABS, originalRef, type OriginalData, type OriginalOverrides } from "./originalPrefabModel";
import type { OriginalButtonBinding } from "./OriginalPrefabView";
import "./OriginalFormParts.css";

const source = new OriginalPrefabModel(ORIGINAL_PREFABS.rhythmgamesettingdialog!);
const sourceTabs = [...source.components.values()].filter(item => item.kind === "LockableTabButton")
  .sort((a, b) => a.data.tabIndex - b.data.tabIndex);

/** Editor-owned content hosted in the existing settings window, in its original coordinate system. */
export function OriginalTransferDialog({ open, title, tabs, selected, onSelect, onClose, children }: {
  open: boolean; title: string; tabs?: readonly { key: string; label: string }[];
  selected?: string; onSelect?: (key: string) => void; onClose(): void; children: ReactNode;
}) {
  const nodes: NonNullable<OriginalOverrides["nodes"]> extends Readonly<infer T> ? T : never = {
    [source.nodeAt("etc").id]: { active: false },
    [source.nodeAt("ButtonOK").id]: { active: false },
  };
  const components: Record<number, OriginalData> = { 101: { mText: title } };
  const buttons: Record<number, OriginalButtonBinding> = {};
  if (!tabs?.length) nodes[source.nodeAt("Pages/SwitchTab").id] = { active: false };
  sourceTabs.forEach((tab, index) => {
    const item = tabs?.[index];
    if (!item) { nodes[tab.node] = { active: false }; return; }
    for (const ref of [tab.data.lockSprite, tab.data.lockCoverSprite]) {
      nodes[source.components.get(originalRef(ref))!.node] = { active: false };
    }
    // Four tabs retain the source positions. Three occupy the same source strip with equal cells.
    const count = tabs!.length, width = 950 / count - 6;
    if (count !== 4) nodes[tab.node] = { x: -475 + (index + 0.5) * (950 / count) };
    const edge = index === 0 || index === count - 1;
    const appearance = sourceTabs[edge ? 0 : 1]!.data;
    const active = selected === item.key;
    components[originalRef(tab.data.tabSprite)] = {
      mSpriteName: active ? appearance.tabActiveSpriteName : appearance.tabDeactiveSpriteName,
      ...(count !== 4 ? { mWidth: width } : {}),
    };
    components[originalRef(tab.data.captionLabel)] = { mText: item.label,
      mColor: active ? { r: 1, g: 59 / 255, b: 114 / 255, a: 1 } : { r: 1, g: 1, b: 1, a: 1 },
      ...(count !== 4 ? { mWidth: width - 24 } : {}),
    };
    const button = source.componentAt(tab.node, "StarUIButton")!;
    if (count !== 4) {
      const collider = source.componentAt(tab.node, "BoxCollider2D");
      if (collider) components[collider.id] = { m_Size: { ...collider.data.m_Size, x: width } };
    }
    buttons[button.id] = { label: item.label, role: "tab", selected: active, navigationIndex: index,
      action: () => onSelect?.(item.key) };
  });
  const model = new OriginalPrefabModel(source.prefab, { nodes, components });
  return <OriginalAuthoredDialog open={open} model={model} bindings={{ buttons }} motion="slide-left" onClose={onClose}>
    <div className="transfer-authored-content" data-tabs={!!tabs?.length}
      style={{ zIndex: source.components.get(99)!.data.mDepth + 1 }}>{children}</div>
  </OriginalAuthoredDialog>;
}
