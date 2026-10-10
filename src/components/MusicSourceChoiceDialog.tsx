import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { OriginalPrefabModel, type OriginalPrefab } from "./originalPrefabModel";
import prefab from "../data/originalSourceChoiceProfile.json";
import { OriginalPrefabView } from "./OriginalPrefabView";

export type MusicSource = import("../chartCore").EditorOptionSettings["musicSelectionSource"];

// The CN prefab retains button_large covers absent from its MenuAtlasBrightness.
// Keep those unresolved covers out of this adapter instead of inventing a substitute.
const absentCover = { widget: { m_FileID: 0, m_PathID: 0 } };
const sourceModel = (source: MusicSource) => new OriginalPrefabModel(prefab as unknown as OriginalPrefab, {
  nodes: {
    6: { active: false }, 7: { active: false }, 8: { active: false },
    2: { active: false }, 15: { active: true }, 20: { active: source === "ayachan" }, 22: { active: false },
    18: { active: source === "bestdori" },
  },
  components: {
    52: { pressedSpriteElement: absentCover, disableSpriteElement: absentCover },
    53: { pressedSpriteElement: absentCover, disableSpriteElement: absentCover },
    56: { pressedSpriteElement: absentCover, disableSpriteElement: absentCover },
    67: { mText: "切换谱面来源" },
    70: { mText: "请选择使用的谱面来源。" },
    51: { mText: "Bestdori 社区" },
    77: { mText: "当前来源" }, 79: { mText: "当前来源" }, 59: { mText: "Ayachan 测试服" },
  },
});

export function MusicSourceChoiceDialog({ open, source, onSelect, onClose }: {
  open: boolean; source: MusicSource; onSelect(source: MusicSource): void; onClose(): void;
}) {
  const select = (next: MusicSource) => { onSelect(next); onClose(); };
  const official = new OriginalPrefabModel(prefab as unknown as OriginalPrefab, {
    nodes: { 3: { x: 0, y: -65 }, 6: { active: false }, 18: { x: 88, y: -26, active: source === "official" } },
    components: { 51: { mText: "官方源" }, 52: { pressedSpriteElement: absentCover, disableSpriteElement: absentCover },
      77: { mText: "当前来源" } },
  });
  return <OriginalAuthoredDialog open={open} model={sourceModel(source)} onClose={onClose}
    bindings={{ buttons: { 52: { action: () => select("bestdori") }, 56: { action: () => select("ayachan") }, 53: { action: onClose } } }}>
    <OriginalPrefabView model={official} root={3} bindings={{ buttons: { 52: { action: () => select("official") } } }} />
    <OriginalPrefabView model={official} root={18} />
  </OriginalAuthoredDialog>;
}
