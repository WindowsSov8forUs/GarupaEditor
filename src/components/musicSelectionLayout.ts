import profile from "../data/originalMusicSelectionProfile.json";
import { OriginalPrefabModel, type OriginalPrefab } from "./originalPrefabModel";
import { ORIGINAL_ASPECT_RATIO_BASE, ORIGINAL_SCREEN_WIDTH_BASE } from "../simulator/scene/originalSurfaceLayout";

const layout = profile.prefabs.layout as unknown as OriginalPrefab;
const page = new OriginalPrefabModel(profile.prefabs.info as unknown as OriginalPrefab);
const mount = page.transform(page.nodeAt("MusicSelector").id);
const cell = new OriginalPrefabModel(profile.prefabs.cell as unknown as OriginalPrefab);
export const MUSIC_CELL_SIZE = { width: 380, height: 64 };
export const MUSIC_CELL_BODY_HEIGHT = cell.components.get(78)!.data.mHeight as number;

/** Resolve the selector's screen anchors before its SetScrollRange / AdjustTransform.
 * Coordinates remain centered on the window; the page projects them only once. */
/** MusicSelectSafeAreaScaler applies to the selector, below the translated page mount. */
export function musicSelectionScale(width: number, height: number, projection: number): number {
  return Math.fround(width / height) > ORIGINAL_ASPECT_RATIO_BASE
    ? Math.fround(profile.selectorEffectiveRatio * (width / ORIGINAL_SCREEN_WIDTH_BASE) / projection) : 1;
}

export function musicSelectionLayout(width: number, height: number, selectorScale = 1) {
  const nodes: Record<number, { x?: number; y?: number }> = {
    4: { x: mount.x / selectorScale, y: mount.y / selectorScale },
  };
  let model = new OriginalPrefabModel(layout, { nodes });
  for (const component of layout.components) {
    if (component.kind !== "StarUIAnchor" || !component.data.m_Enabled) continue;
    const node = model.nodes.get(component.node)!;
    const parent = node.parent === null ? { x: 0, y: 0, scaleX: 1, scaleY: 1 } : model.transform(node.parent);
    const h = component.data.horizonalAnchor, v = component.data.verticalAnchor;
    nodes[node.id] = {
      ...(h ? { x: ((h - 2) * width / 2 - parent.x) / parent.scaleX } : {}),
      ...(v ? { y: ((2 - v) * height / 2 - parent.y) / parent.scaleY } : {}),
    };
    model = new OriginalPrefabModel(layout, { nodes });
  }
  // CameraAnchorSetting binds both mask edges to the camera's top edge.
  // Keep the sprite's authored negative Y scale: the prefab renderer applies
  // its flip around the resolved widget origin, not around a CSS top edge.
  const maskAnchor = model.components.get(177)!.data;
  const mask = model.components.get(maskAnchor.targetWidget.m_PathID)!;
  const maskNode = model.nodes.get(mask.node)!;
  const maskParent = model.transform(maskNode.parent!);
  const maskTop = height / 2 + maskAnchor.absoluteTop;
  const maskBottom = height / 2 + maskAnchor.absoluteBottom;
  nodes[mask.node] = { y: ((maskTop + maskBottom) / 2 - maskParent.y) / maskParent.scaleY };
  model = new OriginalPrefabModel(layout, { nodes });
  const rect = (id: number) => model.rect(model.components.get(id)!);
  const panelDepth = (id: number) => model.components.get(id)!.data.mDepth as number;
  const top = rect(218), bottom = rect(189), selected = rect(228);
  const scrollRoot = model.transform(54);
  const panelWidth = model.components.get(222)!.data.mClipRange.z as number;
  // SetScrollRange changes height, but retains the UIPanel's authored width.
  const left = scrollRoot.x - Math.trunc(panelWidth / 2);
  const topFloatingY = MUSIC_CELL_BODY_HEIGHT - top.height;
  const topOffset = Math.trunc(Math.abs(topFloatingY) + MUSIC_CELL_SIZE.height / 2);
  const bottomOffset = MUSIC_CELL_SIZE.height / 2;
  const selection = model.transform(52);
  const background = rect(204);
  // The first category starts at the folder root. Its scroll-view center is
  // shifted down by half its height during MusicFolderSelector initialization.
  const folder = model.transform(6);
  return {
    model, left, width: panelWidth, selected, selection,
    selectionDepth: panelDepth(190), upperMaskDepth: panelDepth(169), backgroundDepth: panelDepth(191),
    background,
    folder: { x: folder.x, y: -folder.y, depth: panelDepth(162) },
    scrollbar: rect(170),
    top: { ...top, x: left, width: panelWidth, offset: topOffset, depth: panelDepth(222) },
    bottom: { ...bottom, x: left, width: panelWidth, offset: bottomOffset, depth: panelDepth(221) },
    topContentHeight: (count: number) => topOffset + count * MUSIC_CELL_SIZE.height + MUSIC_CELL_SIZE.height,
  };
}

export type MusicSelectionLayout = ReturnType<typeof musicSelectionLayout>;

/** Both lists consume the same panel displacement; only their authored offsets differ. */
export function musicCarouselRows(position: number, layout: MusicSelectionLayout, count: number) {
  const result: { index: number; top: number; side: "top" | "bottom" }[] = [];
  for (const side of ["top", "bottom"] as const) {
    const range = layout[side];
    const origin = range.offset - position;
    const first = Math.max(0, Math.ceil((-origin - MUSIC_CELL_BODY_HEIGHT) / MUSIC_CELL_SIZE.height));
    const last = Math.min(count - 1, Math.floor((range.height - origin) / MUSIC_CELL_SIZE.height));
    for (let index = first; index <= last; index++) {
      result.push({ index, top: origin + index * MUSIC_CELL_SIZE.height, side });
    }
  }
  return result;
}
