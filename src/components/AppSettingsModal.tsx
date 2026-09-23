import { useEffect, useState } from "react";
import type { EditorSettingsModalProps } from "./EditorSettingsModal";
import { OriginalGameSettingsModal } from "./OriginalGameSettingsModal";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { OriginalMenuCell, originalMenuPositions, ORIGINAL_MENU_ITEMS, type OriginalMenuItem } from "./OriginalMenuParts";
import { OriginalPrefabModel, ORIGINAL_PREFABS } from "./originalPrefabModel";
import { useApplicationResourceUrl } from "../resources/applicationResourceContext";

type AppSettingsModalProps = EditorSettingsModalProps & {
  resourcesReady: boolean;
  onImport: () => void; onExport: () => void; onPreview: () => void;
  onSimulator: () => void; onSkinLibrary: () => void; onAccount: () => void;
  onSettingsError?: (message: string) => void;
};
const source = new OriginalPrefabModel(ORIGINAL_PREFABS.menulistdialog!);
const model = new OriginalPrefabModel(source.prefab, { nodes: {
  [source.nodeAt("ScrollWindow/ScrollBar").id]: { active: false },
} });
const cellsRoot = model.transform([...model.nodes.values()].find(node => node.transformId === 25)!.id);

export function AppSettingsModal(props: AppSettingsModalProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const importIcon = useApplicationResourceUrl("ui.icon.json-import");
  const exportIcon = useApplicationResourceUrl("ui.icon.json-export");
  useEffect(() => { if (!props.open) setSettingsOpen(false); }, [props.open]);
  const items: OriginalMenuItem[] = [
    { key: "editor-import", label: "导入谱面", image: importIcon, action: props.onImport },
    { key: "editor-export", label: "导出谱面", image: exportIcon, action: props.onExport },
    ...ORIGINAL_MENU_ITEMS.map(item => ({ ...item,
      action: () => setSettingsOpen(true),
    })),
    { key: "editor-account", label: "Bestdori 账号", icon: "icon_data_take_over", action: props.onAccount },
  ];
  const positions = originalMenuPositions(items);
  return <>
    <OriginalAuthoredDialog open={props.open} model={model} onClose={props.onClose}
      bindings={{ buttons: { 54: { action: props.onClose, label: model.text(model.components.get(51)!) } } }}>
      {items.map((item, index) => <div key={item.key} className="original-prefab-origin"
        data-original-menu-key={item.key}
        style={{ left: cellsRoot.x + positions[index]!.x, top: -cellsRoot.y - positions[index]!.y }}>
        <OriginalMenuCell item={item} large={positions[index]!.large} />
      </div>)}
    </OriginalAuthoredDialog>
    {props.resourcesReady && <OriginalGameSettingsModal {...props} open={props.open && settingsOpen} onClose={() => setSettingsOpen(false)} />}
  </>;
}
