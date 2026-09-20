import { useEffect, useState } from "react";
import type { EditorSettingsModalProps } from "./EditorSettingsModal";
import { OriginalGameSettingsModal } from "./OriginalGameSettingsModal";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { OriginalMenuCell, originalMenuPositions, ORIGINAL_MENU_ITEMS, type OriginalMenuItem } from "./OriginalMenuParts";
import { OriginalPrefabModel, ORIGINAL_PREFABS } from "./originalPrefabModel";

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
  useEffect(() => { if (!props.open) setSettingsOpen(false); }, [props.open]);
  const items: OriginalMenuItem[] = ORIGINAL_MENU_ITEMS.map(item => ({ ...item,
    action: () => setSettingsOpen(true),
  }));
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
