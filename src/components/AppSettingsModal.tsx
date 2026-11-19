import { useEffect, useState } from "react";
import type { EditorSettingsModalProps } from "./EditorSettingsModal";
import { OriginalGameSettingsModal } from "./OriginalGameSettingsModal";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { OriginalMenuCell, originalMenuPositions, ORIGINAL_MENU_ITEMS, ORIGINAL_TITLE_MENU_ITEM, type OriginalMenuItem } from "./OriginalMenuParts";
import { OriginalPrefabModel, ORIGINAL_PREFABS } from "./originalPrefabModel";
import content from "../data/originalMenuContent.json";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";

type AppSettingsModalProps = EditorSettingsModalProps & {
  resourcesReady: boolean;
  onReturnToTitle?: () => void;
  /** 新建工程: called once the menu has closed. */
  onNewProject?: () => void;
  optionsOpen?: boolean; onOptionsClose?: () => void;
  onSimulator: () => void; onSkinLibrary: () => void; onAccount: () => void;
  onSettingsError?: (message: string) => void;
};
const source = new OriginalPrefabModel(ORIGINAL_PREFABS.menulistdialog!);
/**
 * One row of cells (选项, 新建工程, Bestdori 账号, 返回标题), the window shortened to it: the header stays as far under the
 * window's top and 关闭 as far above its bottom as in the source, the row as far under the header, and 关闭's top as
 * far under the row as the row under the header's bottom. The window shrinks by twice the shift that takes the header
 * and the row down and 关闭 up.
 */
const windowNode = source.nodeAt("Window"), headerNode = source.nodeAt("Header"), closeNode = source.nodeAt("ButtonClose");
const scrollNode = source.nodeAt("ScrollWindow"), scrollerNode = source.nodeAt("ScrollWindow/scroller");
const gridNode = [...source.nodes.values()].find(node => node.transformId === 25)!;
const windowSprite = source.componentAt(windowNode.id, "UISprite")!;
const headerHeight = source.componentAt(headerNode.id, "UISprite")!.data.mHeight as number;
const closeHeight = source.componentAt(closeNode.id, "UISprite")!.data.mHeight as number;
const scroller = source.componentAt(scrollerNode.id, "UIWidget")!;
const headerY = source.transform(headerNode.id).y, closeY = source.transform(closeNode.id).y;
const rowY = source.transform(gridNode.id).y + content.layout.startY;
const shift = (headerY - closeY - 2 * (headerY - rowY) - (closeHeight - headerHeight) / 2) / 2;
const model = new OriginalPrefabModel(source.prefab, {
  nodes: {
    [source.nodeAt("ScrollWindow/ScrollBar").id]: { active: false },
    [headerNode.id]: { y: headerNode.position.y - shift },
    [closeNode.id]: { y: closeNode.position.y + shift },
    [scrollNode.id]: { y: scrollNode.position.y - shift },
    [scrollerNode.id]: { y: scrollerNode.position.y + shift },
  },
  components: {
    [windowSprite.id]: { mHeight: (windowSprite.data.mHeight as number) - 2 * shift },
    [scroller.id]: { mHeight: (scroller.data.mHeight as number) - 2 * shift },
  },
});
const cellsRoot = model.transform(gridNode.id);

export function AppSettingsModal(props: AppSettingsModalProps) {
  // Returning to the title waits for the menu to close.
  const [pendingTitle, setPendingTitle] = useState(false);
  const [pendingNewProject, setPendingNewProject] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bestdoriIcon = useApplicationResourceManager().resolveBuiltinSlotUrl("ui.icon.bestdori");
  if (bestdoriIcon.status === "rejected") throw new Error(`${bestdoriIcon.failure.capability}: ${bestdoriIcon.failure.boundary}`);
  useEffect(() => { if (!props.open) setSettingsOpen(false); }, [props.open]);
  const items: OriginalMenuItem[] = [
    ...ORIGINAL_MENU_ITEMS.map(item => ({ ...item,
      action: () => setSettingsOpen(true),
    })),
    ...(props.onNewProject ? [{ key: "editor-new-project", label: "新建工程", icon: "icon_terms_of_service",
      action: () => { setPendingNewProject(true); props.onClose(); } }] : []),
    // Bestdori's icon fills its square; drawn as large as the original icon it replaces (icon_data_take_over shows
    // about 46×44 of its 53×52 box).
    { key: "editor-account", label: "Bestdori 账号", image: bestdoriIcon.value, imageScale: 0.86, action: props.onAccount },
    ...(props.onReturnToTitle ? [{ ...ORIGINAL_TITLE_MENU_ITEM,
      action: () => { setPendingTitle(true); props.onClose(); } }] : []),
  ];
  const positions = originalMenuPositions(items);
  // The row centred across the window: the source's columns hold fewer cells.
  const rowOffsetX = Math.max(0, content.layout.columns - items.length) * content.layout.columnWidth / 2;
  return <>
    <OriginalAuthoredDialog open={props.open} model={model} onClose={props.onClose}
      onClosed={() => {
        if (pendingTitle) { setPendingTitle(false); props.onReturnToTitle?.(); }
        if (pendingNewProject) { setPendingNewProject(false); props.onNewProject?.(); }
      }}
      bindings={{ buttons: { 54: { action: props.onClose, label: model.text(model.components.get(51)!) } } }}>
      {items.map((item, index) => <div key={item.key} className="original-prefab-origin"
        data-original-menu-key={item.key}
        style={{ left: cellsRoot.x + rowOffsetX + positions[index]!.x, top: -cellsRoot.y - positions[index]!.y }}>
        <OriginalMenuCell item={item} large={positions[index]!.large} />
      </div>)}
    </OriginalAuthoredDialog>
    {props.resourcesReady && <OriginalGameSettingsModal {...props} open={(props.open && settingsOpen) || !!props.optionsOpen}
      onClose={() => { setSettingsOpen(false); props.onOptionsClose?.(); }} />}
  </>;
}
