import type { ReactNode } from "react";
import profile from "../../data/originalMusicSelectionProfile.json";
import { OriginalPrefabModel, type OriginalPrefab } from "../originalPrefabModel";
import { OriginalPrefabView } from "../OriginalPrefabView";

/** Gap between the button and the content placed before it, in design px. */
const LEADING_GAP = 12;
// The song list's filter button (filterButton prefab), labelled 选项, at the header's top-right anchor.
const model = new OriginalPrefabModel(profile.prefabs.filterButton as unknown as OriginalPrefab, {
  nodes: { 81: { x: 0, y: 0 }, 68: { y: 88 } },
  components: { 359: { mText: "选项" } },
});
// Button bounds relative to the anchor at the wrapper's top-right corner, in design px.
const button = model.rect(model.components.get(382)!);

/** 选项 at the editor's top right; `leading` sits left of it with its bottom `leadingBottom` design px below `top`. */
export function EditorOptionsButton({ onClick, scale, top, right, leading, leadingBottom }: {
  onClick(): void; scale: number; top: number; right: number; leading?: ReactNode; leadingBottom: number;
}) {
  return <>
    {leading && <div className="editor-options-leading" style={{ position: "absolute", zIndex: 30, pointerEvents: "none",
      top: top + leadingBottom * scale, right: right + (LEADING_GAP - button.x) * scale, transform: "translateY(-100%)" }}>
      {leading}
    </div>}
    <div style={{ position: "absolute", top, right, zIndex: 30, transform: `scale(${scale})`, transformOrigin: "top right" }}>
      <OriginalPrefabView model={model} root={108} bindings={{ buttons: { 386: { action: onClick, label: "选项" } } }} />
    </div>
  </>;
}
