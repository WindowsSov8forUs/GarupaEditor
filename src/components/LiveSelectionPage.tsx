import source from "../data/originalLiveEntrance.json";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import { OriginalPrefabModel, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { UiPageViewport } from "./UiViewport";
import { HomeDisplayImage } from "./HomeDisplayImage";

// Original ordinary FreeLiveTransitionButtonView instance, including its ancestors.
// Source: live-entrance-10-1-4, 58cb521c02d504146d7c516e2ea397d1be01bcbf.
const editorLabel = "谱面编辑";
const model = new OriginalPrefabModel(source.prefab as unknown as OriginalPrefab, {
  nodes: { [source.freeLiveRoot]: { active: true }, [source.eventPointNode]: { active: false } },
  components: { [source.label]: { mText: editorLabel } },
});
const playLabel = "谱面导入";
// Reuse the original half-height multiplayer button, including its own cover,
// label and icon geometry. Align its top with the editor card, with a 16-unit gap.
const editorBox = model.rect(model.componentAt(model.components.get(source.button)!.node, "BoxCollider2D")!);
const halfModel = new OriginalPrefabModel(source.halfLive.prefab as unknown as OriginalPrefab);
const halfBox = halfModel.rect(halfModel.componentAt(halfModel.components.get(source.halfLive.button)!.node, "BoxCollider2D")!);
const halfRoot = halfModel.transform(source.halfLive.root);
const playModel = new OriginalPrefabModel(source.halfLive.prefab as unknown as OriginalPrefab, {
  nodes: { [source.halfLive.root]: { active: true,
    x: halfRoot.x + editorBox.x + editorBox.width + 16 - halfBox.x,
    y: halfRoot.y + halfBox.y - editorBox.y } },
  components: { [source.halfLive.label]: { mText: playLabel } },
});
const searchLabel = "谱面搜索";
const searchModel = new OriginalPrefabModel(source.halfLive.prefab as unknown as OriginalPrefab, {
  nodes: { [source.halfLive.root]: { active: true,
    x: halfRoot.x + editorBox.x + editorBox.width + 16 - halfBox.x,
    y: halfRoot.y + halfBox.y - editorBox.y - halfBox.height - 16 } },
  components: { [source.halfLive.label]: { mText: searchLabel } },
});

export function LiveSelectionPage({ onFreeLive, onImportProject, onSearchCharts }: {
  onFreeLive(): void; onImportProject(): void; onSearchCharts(): void;
}) {
  const manager = useApplicationResourceManager();
  const icon = manager.resolveBuiltinSlotUrl("ui.live-selection.chart-editor");
  if (icon.status === "rejected") throw new Error(`${icon.failure.capability}: ${icon.failure.boundary}`);
  const playIcon = manager.resolveBuiltinSlotUrl("ui.live-selection.import-chart");
  if (playIcon.status === "rejected") throw new Error(`${playIcon.failure.capability}: ${playIcon.failure.boundary}`);
  const searchIcon = manager.resolveBuiltinSlotUrl("ui.live-selection.search-chart");
  if (searchIcon.status === "rejected") throw new Error(`${searchIcon.failure.capability}: ${searchIcon.failure.boundary}`);
  return <UiPageViewport><section aria-label="选择功能"
    style={{ position: "absolute", inset: 0 }}>
    <HomeDisplayImage />
    <div className="original-prefab-origin" style={{ left: "var(--ui-page-window-center-x)", top: "var(--ui-page-window-center-y)" }}>
      <OriginalPrefabView model={model} bindings={{
        buttons: { [source.button]: { label: editorLabel, action: onFreeLive } },
        textures: { [source.texture]: <img src={icon.value} alt="" draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }} /> },
      }} />
      <OriginalPrefabView model={playModel} bindings={{
        buttons: { [source.halfLive.button]: { label: playLabel, action: onImportProject } },
        textures: { [source.halfLive.texture]: <img src={playIcon.value} alt="" draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }} /> },
      }} />
      <OriginalPrefabView model={searchModel} bindings={{
        buttons: { [source.halfLive.button]: { label: searchLabel, action: onSearchCharts } },
        textures: { [source.halfLive.texture]: <img src={searchIcon.value} alt="" draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }} /> },
      }} />
    </div>
  </section></UiPageViewport>;
}
