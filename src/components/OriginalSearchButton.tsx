import profile from "../data/originalSearchButtonProfile.json";
import { OriginalPrefabModel, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";

// Reuse PrivateRoomSearchButton as a whole. Only the caption and action change.
const model = new OriginalPrefabModel(profile.prefab as unknown as OriginalPrefab, {
  components: { 211: { mText: "搜索" } },
});
const face = model.rect(model.components.get(232)!);
const scale = 40 / face.height;

export function OriginalSearchButton({ label, disabled, onClick }: {
  label: string; disabled?: boolean; onClick: () => void;
}) {
  return <div style={{ position: "relative", flexShrink: 0, width: face.width * scale, height: face.height * scale }}>
    <div style={{ position: "absolute", left: -face.x * scale, top: -face.y * scale,
      transform: `scale(${scale})`, transformOrigin: "0 0" }}>
      <OriginalPrefabView model={model} bindings={{ buttons: { 230: { action: onClick, disabled, label } } }} />
    </div>
  </div>;
}
