import profile from "../data/originalMenuProfile.json";
import chinese from "../data/originalMenuChinese.json";
import { applyOriginalButtonTemplates } from "./originalButtonTemplates";

export type OriginalData = Record<string, any>;
export interface OriginalNode {
  id: number; transformId: number; name: string; path: string; parent: number | null;
  position: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number }; active: boolean;
}
export interface OriginalComponent { id: number; node: number; kind: string; data: OriginalData }
export interface OriginalPrefab { resource: string; nodes: OriginalNode[]; components: OriginalComponent[] }
export interface OriginalOverrides {
  nodes?: Readonly<Record<number, { active?: boolean; x?: number; y?: number; scaleX?: number; scaleY?: number }>>;
  components?: Readonly<Record<number, OriginalData>>;
}
export interface OriginalTransform { x: number; y: number; scaleX: number; scaleY: number }
interface OriginalAffine { a: number; b: number; c: number; d: number; x: number; y: number }
export interface OriginalRect { x: number; y: number; width: number; height: number; flipX: boolean; flipY: boolean }
export const ORIGINAL_PREFABS = profile.prefabs as unknown as Record<string, OriginalPrefab>;
export const ORIGINAL_WORDING: Readonly<Record<string, string>> = { ...profile.wording, ...chinese.wording };
// Literal labels and runtime setters may carry the same wording without its key.
// Substitute only an exact, unambiguous source string; never infer a translation.
const localizedLiterals = new Map<string, string>(Object.entries(chinese.literals));
const ambiguousLiterals = new Set<string>();
for (const [key, value] of Object.entries(chinese.wording)) {
  const original = (profile.wording as Record<string, string>)[key]?.replace(/\\n/g, "\n");
  if (!original) continue;
  const localized = value.replace(/\\n/g, "\n");
  if (localizedLiterals.has(original) && localizedLiterals.get(original) !== localized) ambiguousLiterals.add(original);
  localizedLiterals.set(original, localized);
}
export function originalUiText(value: string): string {
  const text = value.replace(/\\n/g, "\n");
  return ambiguousLiterals.has(text) ? text : localizedLiterals.get(text) ?? text;
}
export const ORIGINAL_UI_SOURCE = profile.reverseCommit;
export const originalRef = (value: unknown): number =>
  value !== null && typeof value === "object" ? Number((value as OriginalData).m_PathID ?? 0) : 0;

/** Authored NGUI hierarchy in its own coordinates; viewport fitting is a separate adapter. */
export class OriginalPrefabModel {
  readonly nodes: Map<number, OriginalNode>;
  readonly components: Map<number, OriginalComponent>;
  readonly byNode = new Map<number, OriginalComponent[]>();
  private readonly transforms = new Map<number, OriginalTransform>();
  private readonly rectangles = new Map<number, OriginalRect>();
  private readonly affineTransforms = new Map<number, OriginalAffine>();
  constructor(readonly prefab: OriginalPrefab, readonly overrides: OriginalOverrides = {}) {
    this.nodes = new Map(prefab.nodes.map(node => [node.id, node]));
    this.components = new Map(prefab.components.map(component => [component.id, {
      ...component, data: { ...component.data },
    }]));
    for (const component of this.components.values()) {
      const items = this.byNode.get(component.node) ?? [];
      items.push(component); this.byNode.set(component.node, items);
    }
    applyOriginalButtonTemplates(this.components, this.nodes);
    // Runtime setters run after the prefab button templates have initialized.
    for (const [id, changes] of Object.entries(overrides.components ?? {})) {
      const component = this.components.get(Number(id));
      if (component) Object.assign(component.data, changes);
    }
  }
  nodeAt(suffix: string): OriginalNode {
    const matches = [...this.nodes.values()].filter(node => node.path === suffix || node.path.endsWith(`/${suffix}`));
    if (matches.length !== 1) throw new Error(`Original node must be unambiguous: ${this.prefab.resource}/${suffix}`);
    return matches[0]!;
  }
  componentAt(node: number, kind: string): OriginalComponent | undefined {
    return this.byNode.get(node)?.find(component => component.kind === kind);
  }
  isWithin(node: number, root: number): boolean {
    for (let current = this.nodes.get(node); current; current = current.parent === null ? undefined : this.nodes.get(current.parent)) {
      if (current.id === root) return true;
    }
    return false;
  }
  isActive(node: number): boolean {
    const current = this.nodes.get(node);
    return !!current && (this.overrides.nodes?.[node]?.active ?? current.active) &&
      (current.parent === null || this.isActive(current.parent));
  }
  transform(node: number): OriginalTransform {
    const cached = this.transforms.get(node); if (cached) return cached;
    const item = this.nodes.get(node); if (!item) throw new Error(`Missing original node ${node}`);
    const parent = item.parent === null ? { x: 0, y: 0, scaleX: 1, scaleY: 1 } : this.transform(item.parent);
    const change = this.overrides.nodes?.[node];
    // Layout dimensions retain the unrotated widget axes. Sprite presentation applies the full matrix.
    const turn = Math.abs(item.rotation.z) > 0.999 ? -1 : 1;
    const result = { x: parent.x + (change?.x ?? item.position.x) * parent.scaleX,
      y: parent.y + (change?.y ?? item.position.y) * parent.scaleY,
      scaleX: parent.scaleX * (change?.scaleX ?? item.scale.x) * turn,
      scaleY: parent.scaleY * (change?.scaleY ?? item.scale.y) * turn };
    this.transforms.set(node, result); return result;
  }
  private affine(node: number): OriginalAffine {
    const cached = this.affineTransforms.get(node); if (cached) return cached;
    const item = this.nodes.get(node)!;
    const p = item.parent === null ? { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 } : this.affine(item.parent);
    const change = this.overrides.nodes?.[node];
    const angle = 2 * Math.atan2(item.rotation.z, item.rotation.w), cos = Math.cos(angle), sin = Math.sin(angle);
    const sx = change?.scaleX ?? item.scale.x, sy = change?.scaleY ?? item.scale.y;
    const x = change?.x ?? item.position.x, y = change?.y ?? item.position.y;
    const result = { a: (p.a * cos + p.c * sin) * sx, b: (p.b * cos + p.d * sin) * sx,
      c: (-p.a * sin + p.c * cos) * sy, d: (-p.b * sin + p.d * cos) * sy,
      x: p.a * x + p.c * y + p.x, y: p.b * x + p.d * y + p.y };
    this.affineTransforms.set(node, result); return result;
  }
  /** Apply the authored hierarchy after sprite padding/tiling, converting Y-up into CSS Y-down. */
  spriteMatrix(node: number, box: OriginalRect, flipX: boolean, flipY: boolean): string {
    const full = this.affine(node), flat = this.transform(node);
    const a = full.a / flat.scaleX, b = -full.b / flat.scaleX;
    const c = -full.c / flat.scaleY, d = full.d / flat.scaleY;
    const x = box.x + (flipX ? box.width : 0) - flat.x;
    const y = box.y + (flipY ? box.height : 0) + flat.y;
    return `matrix(${a * (flipX ? -1 : 1)},${b * (flipX ? -1 : 1)},${c * (flipY ? -1 : 1)},${d * (flipY ? -1 : 1)},${a * x + c * y + full.x},${b * x + d * y - full.y})`;
  }
  rect(component: OriginalComponent): OriginalRect {
    const cached = this.rectangles.get(component.id); if (cached) return cached;
    const data = component.data, transform = this.transform(component.node);
    const pivot = data.mPivot ?? 4, px = (pivot % 3) / 2, py = 1 - Math.floor(pivot / 3) / 2;
    const width = Number(data.mWidth ?? data.m_Size?.x ?? 0), height = Number(data.mHeight ?? data.m_Size?.y ?? 0);
    const offset = data.m_Offset ?? { x: 0, y: 0 };
    let left = transform.x + (offset.x - width * px) * transform.scaleX;
    let bottom = transform.y + (offset.y - height * py) * transform.scaleY;
    let right = left + width * transform.scaleX, top = bottom + height * transform.scaleY;
    const horizontal = [this.anchor(data.leftAnchor, "x"), this.anchor(data.rightAnchor, "x")];
    const vertical = [this.anchor(data.bottomAnchor, "y"), this.anchor(data.topAnchor, "y")];
    if (horizontal[0] !== null && horizontal[1] !== null) [left, right] = horizontal as [number, number];
    if (vertical[0] !== null && vertical[1] !== null) [bottom, top] = vertical as [number, number];
    const result = { x: Math.min(left, right), y: -Math.max(bottom, top), width: Math.abs(right - left),
      height: Math.abs(top - bottom), flipX: right < left, flipY: top < bottom };
    this.rectangles.set(component.id, result); return result;
  }
  private anchor(anchor: OriginalData | undefined, axis: "x" | "y"): number | null {
    const reference = originalRef(anchor?.target); if (!reference || !anchor) return null;
    const node = [...this.nodes.values()].find(item => item.transformId === reference)?.id;
    if (node === undefined) return null;
    const widget = this.byNode.get(node)?.find(item => ["UISprite", "UIWidget", "UILabel", "UITexture"].includes(item.kind));
    const transform = this.transform(node);
    if (!widget) return (axis === "x" ? transform.x : transform.y) + Number(anchor.absolute);
    const box = this.rect(widget);
    const start = axis === "x" ? box.x : -box.y - box.height;
    return start + Number(anchor.relative) * (axis === "x" ? box.width : box.height) + Number(anchor.absolute);
  }
  text(component: OriginalComponent): string {
    if (Object.prototype.hasOwnProperty.call(this.overrides.components?.[component.id] ?? {}, "mText")) {
      return originalUiText(String(component.data.mText ?? ""));
    }
    const setter = [...this.components.values()].find(item =>
      (item.kind === "WordingSetter" && originalRef(item.data.targetLabel) === component.id) ||
      (item.kind === "WordingAutoSetter" && item.node === component.node));
    const text = setter && ORIGINAL_WORDING[setter.data.wordingKey];
    return text === undefined ? originalUiText(String(component.data.mText ?? "")) : text.replace(/\\n/g, "\n");
  }
}

export function originalAtlasFor(component: OriginalComponent): "common" | "menu" {
  const id = originalRef(component.data.mAtlas);
  if (id === 1796 || id === 1801 || id === 1520) return "menu";
  if (id === 1883 || id === 1809 || id === 1611 || id === 1533) return "common";
  throw new Error(`Unresolved original atlas ${id} for widget ${component.id}`);
}
