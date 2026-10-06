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

export function LiveSelectionPage({ onFreeLive }: { onFreeLive(): void }) {
  const manager = useApplicationResourceManager();
  const icon = manager.resolveBuiltinSlotUrl("ui.live-selection.chart-editor");
  if (icon.status === "rejected") throw new Error(`${icon.failure.capability}: ${icon.failure.boundary}`);
  return <UiPageViewport><section aria-label="选择功能"
    style={{ position: "absolute", inset: 0 }}>
    <HomeDisplayImage />
    <div className="original-prefab-origin" style={{ left: "var(--ui-page-window-center-x)", top: "var(--ui-page-window-center-y)" }}>
      <OriginalPrefabView model={model} bindings={{
        buttons: { [source.button]: { label: editorLabel, action: onFreeLive } },
        textures: { [source.texture]: <img src={icon.value} alt="" draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }} /> },
      }} />
    </div>
  </section></UiPageViewport>;
}
