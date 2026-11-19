import { useMemo } from "react";
import { OriginalPrefabView, type OriginalButtonBinding } from "./OriginalPrefabView";
import { OriginalPrefabModel, ORIGINAL_PREFABS, originalRef, type OriginalData, type OriginalPrefab } from "./originalPrefabModel";

// The settings window's tab strip (RhythmGameSettingDialog Pages/SwitchTab): its bar (TabBase) and LockableTabButtons,
// taken out as a prefab of its own so it can sit anywhere at any width.
const source = new OriginalPrefabModel(ORIGINAL_PREFABS.rhythmgamesettingdialog!);
const rootNode = source.nodeAt("Pages/SwitchTab");
const nodes = source.prefab.nodes.filter(node => source.isWithin(node.id, rootNode.id))
  .map(node => node.id === rootNode.id ? { ...node, parent: null, position: { x: 0, y: 0, z: 0 } } : node);
const prefab: OriginalPrefab = { resource: source.prefab.resource, nodes,
  components: source.prefab.components.filter(component => nodes.some(node => node.id === component.node)) };
const layout = new OriginalPrefabModel(prefab);
const base = layout.componentAt(layout.nodeAt("SwitchTab/TabBase").id, "UISprite")!;
const sourceTabs = [...layout.components.values()].filter(item => item.kind === "LockableTabButton")
  .sort((a, b) => a.data.tabIndex - b.data.tabIndex);
/** The bar's authored height, in design px. */
export const ORIGINAL_TAB_SWITCH_HEIGHT = base.data.mHeight as number;
/** The authored gap between neighbouring tabs (their spacing less their width), in design px. */
const TAB_GAP = layout.transform(sourceTabs[1]!.node).x - layout.transform(sourceTabs[0]!.node).x
  - (layout.components.get(originalRef(sourceTabs[0]!.data.tabSprite))!.data.mWidth as number);
const ACTIVE_LABEL = { r: 1, g: 59 / 255, b: 114 / 255, a: 1 };
const INACTIVE_LABEL = { r: 1, g: 1, b: 1, a: 1 };

/**
 * The settings window's tab strip with caller tabs (2 to 4), `width` wide: the bar and equal tabs across it, the
 * outer ones with the edge tab sprites and the inner ones with the middle tab sprites, as the source strip has them.
 */
export function OriginalTabSwitch<Key extends string>({ tabs, selected, onSelect, width, ariaLabel }: {
  tabs: readonly { key: Key; label: string }[]; selected: Key; onSelect(key: Key): void; width: number; ariaLabel: string;
}) {
  const count = Math.max(1, Math.min(sourceTabs.length, tabs.length));
  const cell = width / count, tabWidth = cell - TAB_GAP;
  // Source tabs: the first and last (edge sprites) for the outer tabs, the middle ones for the rest.
  const used = tabs.slice(0, count).map((_, index) =>
    index === 0 ? sourceTabs[0]! : index === count - 1 ? sourceTabs[sourceTabs.length - 1]! : sourceTabs[index]!);
  const model = useMemo(() => {
    const nodeOverrides: Record<number, { active?: boolean; x?: number }> = {};
    const components: Record<number, OriginalData> = { [base.id]: { mWidth: width } };
    for (const tab of sourceTabs) {
      const index = used.indexOf(tab);
      if (index < 0) { nodeOverrides[tab.node] = { active: false }; continue; }
      const item = tabs[index]!, active = item.key === selected;
      for (const ref of [tab.data.lockSprite, tab.data.lockCoverSprite]) {
        nodeOverrides[layout.components.get(originalRef(ref))!.node] = { active: false };
      }
      nodeOverrides[tab.node] = { x: -width / 2 + (index + 0.5) * cell };
      components[originalRef(tab.data.tabSprite)] = {
        mSpriteName: active ? tab.data.tabActiveSpriteName : tab.data.tabDeactiveSpriteName, mWidth: tabWidth };
      components[originalRef(tab.data.captionLabel)] = { mText: item.label, mColor: active ? ACTIVE_LABEL : INACTIVE_LABEL,
        mWidth: tabWidth - 24 };
      const collider = layout.componentAt(tab.node, "BoxCollider2D");
      if (collider) components[collider.id] = { m_Size: { ...collider.data.m_Size, x: tabWidth } };
    }
    return new OriginalPrefabModel(prefab, { nodes: nodeOverrides, components });
    // `used` follows from `tabs` and `count`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, count, selected, width, cell, tabWidth]);
  const buttons: Record<number, OriginalButtonBinding> = {};
  used.forEach((tab, index) => {
    const item = tabs[index]!;
    buttons[layout.componentAt(tab.node, "StarUIButton")!.id] = { label: item.label, role: "tab",
      selected: item.key === selected, navigationIndex: index, action: () => onSelect(item.key) };
  });
  const box = model.rect(model.components.get(base.id)!);
  return <div role="tablist" aria-label={ariaLabel} style={{ position: "relative", flex: "0 0 auto", width: box.width, height: box.height }}>
    <div className="original-prefab-origin" style={{ left: -box.x, top: -box.y }}>
      <OriginalPrefabView model={model} bindings={{ buttons }} />
    </div>
  </div>;
}
