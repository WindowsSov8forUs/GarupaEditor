import { useMemo } from "react";
import { OriginalPrefabModel, ORIGINAL_PREFABS } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { OriginalHeaderMenuButton } from "./OriginalMenuParts";
import { useUiViewport } from "./useUiViewport";
import { UiScaleOrigin } from "./UiViewport";
import "./OriginalPageHeader.css";

const source = new OriginalPrefabModel(ORIGINAL_PREFABS.header!);
const left = source.nodeAt("LeftTop");
const menu = source.nodeAt("TopRightMenu/buttonMenu");
const menuSurface = source.componentAt(menu.id, "UISprite")!;
const menuWidth = menuSurface.data.mWidth, menuHeight = menuSurface.data.mHeight;
const top = -menu.position.y - menuHeight / 2;
const right = -menu.position.x - menuWidth / 2;
const headerHeight = -2 * menu.position.y;
const nodes = source.prefab.nodes.filter(node => source.isWithin(node.id, left.id))
  .map(node => node.id === left.id ? { ...node, parent: null, position: { x: 0, y: 0, z: 0 } } : node);
const leftPrefab = { ...source.prefab, nodes,
  components: source.prefab.components.filter(item => nodes.some(node => node.id === item.node)) };

/** LeftTop and TopRightMenu share the host safe-area anchors; child offsets stay authored. */
export function OriginalPageHeader({ section, title, onBack, showBack = true, menuOpen, onOpenMenu }: {
  section: string; title: string; onBack?: () => void; showBack?: boolean; menuOpen: boolean; onOpenMenu(): void;
}) {
  const { scale, safeInsets } = useUiViewport();
  const model = useMemo(() => new OriginalPrefabModel(leftPrefab, {
    nodes: {
      [source.nodeAt("LeftTop/screenInfo/tutorialButton").id]: { active: false },
      [source.nodeAt("LeftTop/buttonMoveBack").id]: { active: showBack },
    },
    components: { 135: { mText: section }, 139: { mText: title } },
  }), [section, title, showBack]);
  return <header className="original-page-header" style={{ height: safeInsets.top + headerHeight * scale }}>
    <div className="original-page-header-left"
      style={{ left: safeInsets.left, top: safeInsets.top }}>
      <UiScaleOrigin>
        <OriginalPrefabView model={model} bindings={{ buttons: { 180: { label: "返回", action: onBack } } }} />
      </UiScaleOrigin>
    </div>
    <div className="original-page-header-menu" style={{
      right: safeInsets.right + right * scale, top: safeInsets.top + top * scale,
    }}><OriginalHeaderMenuButton open={menuOpen} onClick={onOpenMenu} /></div>
  </header>;
}
