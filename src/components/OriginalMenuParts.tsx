import { useMemo } from "react";
import content from "../data/originalMenuContent.json";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { OriginalPrefabModel, ORIGINAL_PREFABS, ORIGINAL_WORDING, originalUiText } from "./originalPrefabModel";

export function OriginalHeaderMenuButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  const model = useMemo(() => {
    const source = new OriginalPrefabModel(ORIGINAL_PREFABS.header!);
    const root = source.nodeAt("TopRightMenu/buttonMenu");
    const nodes = source.prefab.nodes.filter(node => source.isWithin(node.id, root.id)).map(node => node.id === root.id
      ? { ...node, parent: null, position: { x: 0, y: 0, z: 0 } } : node);
    return new OriginalPrefabModel({ ...source.prefab, nodes,
      components: source.prefab.components.filter(item => nodes.some(node => node.id === item.node)) }, {
      nodes: Object.fromEntries(nodes.filter(node => /new|alert/i.test(node.name) ||
        source.componentAt(node.id, "StarUIButton")?.id === 196 || source.componentAt(node.id, "StarUIButton")?.id === 197).map(node => [node.id, { active: false }])),
    });
  }, []);
  return <div className="original-header-slot" style={{ width: 48, height: 48 }}>
    <div className="original-prefab-origin" style={{ transform: "scale(0.5)" }}>
      <OriginalPrefabView model={model} bindings={{ buttons: { 200: open ? undefined : { label: originalUiText("メニュー"), action: onClick } } }} />
    </div>
  </div>;
}
export interface OriginalMenuItem { label: string; action?: () => void; large: boolean; icon?: string; image?: string }
export const ORIGINAL_MENU_ITEMS = content.items.map(item => ({ ...item, label: (ORIGINAL_WORDING[item.key] ?? item.label).replace(/\\n/g, "\n") }));
export function originalMenuPositions(items: readonly OriginalMenuItem[]) {
  const layout = content.layout;
  let y = layout.startY, largeInRow = false;
  return items.map((item, index) => {
    const position = { x: layout.startX + layout.columnWidth * (index % layout.columns), y };
    largeInRow ||= item.large;
    if (index % layout.columns === layout.columns - 1) {
      y -= largeInRow ? layout.largeRowHeight : layout.smallRowHeight; largeInRow = false;
    }
    return position;
  });
}
export function OriginalMenuCell({ item }: { item: OriginalMenuItem }) {
  const prefab = ORIGINAL_PREFABS[item.large ? "largemenulistcell" : "smallmenulistcell"]!;
  const source = useMemo(() => new OriginalPrefabModel(prefab), [prefab]);
  const controller = [...source.components.values()].find(component => component.kind === "MenuListCell")!;
  const labelId = controller.data.label.m_PathID, iconId = controller.data.iconSprite.m_PathID;
  const icon = source.components.get(iconId)!;
  const button = [...source.components.values()].find(component => component.kind === "StarUIButton")!;
  const model = new OriginalPrefabModel(prefab, {
    nodes: Object.fromEntries(prefab.nodes.filter(node => node.name === "NewIcon" || node.name === "AlertIcon")
      .map(node => [node.id, { active: false }])),
    components: { [labelId]: { mText: item.label },
      [iconId]: { mSpriteName: item.icon ?? icon.data.mSpriteName } },
  });
  const box = model.rect(icon);
  return <>
    <OriginalPrefabView model={model} bindings={{ omit: item.icon ? undefined : new Set([iconId]),
      buttons: { [button.id]: { label: item.label, action: item.action } } }} />
    {item.image && !item.icon && <img src={item.image} alt="" aria-hidden="true" style={{ position: "absolute",
      left: box.x, top: box.y, width: box.width, height: box.height, pointerEvents: "none", zIndex: icon.data.mDepth }} />}
  </>;
}
