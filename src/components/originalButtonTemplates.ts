import templates from "../data/originalButtonTemplates.json";
import type { OriginalComponent, OriginalNode } from "./originalPrefabModel";

/** applyDefineWidth / applyDefineHeight execute before anchors and text layout. */
export function applyOriginalButtonTemplates(components: Map<number, OriginalComponent>, nodes: Map<number, OriginalNode>): void {
  const widths = templates.templateWidths as Record<string, number>;
  const heights = templates.templateHeights as Record<string, { height: number; fontSize: number }>;
  const descendant = (node: number, root: number): boolean => {
    for (let current = nodes.get(node); current; current = current.parent === null ? undefined : nodes.get(current.parent)) {
      if (current.id === root) return true;
    }
    return false;
  };
  for (const button of components.values()) {
    if (button.kind !== "StarUIButton") continue;
    const data = button.data, width = widths[data.initializeTemplateWidth], height = heights[data.initializeTemplateHeight];
    const sprites = [data.contentSprite?.m_PathID, data.pressedSpriteElement?.widget?.m_PathID];
    for (const id of new Set(sprites)) {
      const sprite = components.get(id); if (!sprite) continue;
      if (width !== undefined) sprite.data.mWidth = width;
      if (height !== undefined) sprite.data.mHeight = height.height;
    }
    const collider = [...components.values()].find(item => item.node === button.node && item.kind === "BoxCollider2D");
    if (collider) collider.data.m_Size = { ...collider.data.m_Size,
      ...(width === undefined ? {} : { x: Math.trunc(width * templates.colliderWidthScale) }),
      ...(height === undefined ? {} : { y: Math.trunc(height.height * templates.colliderHeightScale) }),
    };
    if (data.isInitializeTemplateLabel) {
      for (const label of components.values()) {
        if (label.kind !== "UILabel" || !descendant(label.node, button.node)) continue;
        if (height !== undefined) label.data.mFontSize = height.fontSize;
        if (data.initializeTemplateColorPattern === 1) label.data.mColor = { r: 80 / 255, g: 80 / 255, b: 80 / 255, a: 1 };
        if (data.initializeTemplateColorPattern === 2 || data.initializeTemplateColorPattern === 3)
          label.data.mColor = { r: 1, g: 1, b: 1, a: 1 };
      }
    }
  }
}
