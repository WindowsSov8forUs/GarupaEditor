import { Container, Matrix, NineSliceSprite, RenderLayer, Sprite, Text, TilingSprite, type Texture } from "pixi.js";
import type { StageClipAnimation } from "../../engine/rendering/stageClipAnimation";
import type { PixiResultNumberLabel } from "./pixiResultNumberLabel";
import type { ParticleTransformProfile } from "../particleContracts";
import { linearTintFromSrgbChannels } from "./hud/nguiMaterialPipeline";
import { fitNguiWidgetText, type OriginalLabelLayout } from "./hud/nguiTextLayout";
import { createSerializedButtonSprite } from "../../../components/pixi/SerializedButton";

interface Widget {
  readonly size: readonly number[];
  readonly pivot: number;
  readonly depth: number;
  readonly color: readonly number[];
}
export interface ResultWidgetNode {
  readonly path: string;
  readonly parent: string | null;
  readonly position: readonly number[];
  readonly scale: readonly number[];
  readonly rotationXY: readonly number[];
  readonly active: boolean;
  readonly alpha?: number;
  readonly sprite?: Widget & { readonly name: string; readonly atlas: string; readonly type: number };
  readonly label?: Widget & { readonly text: string; readonly fontSize: number; readonly spacing: number };
}
export interface ResultWidgetResources {
  readonly font: string;
  readonly texture: (atlas: string, key: string) => Texture;
  readonly border: (atlas: string, key: string) => { left: number; right: number; top: number; bottom: number };
}

/** Result-specific authored widgets; shared by the evaluation page and its header. */
export class PixiResultWidgetGraph {
  readonly root = new Container();
  readonly nodes = new Map<string, Container>();
  readonly sprites = new Map<string, Sprite | NineSliceSprite | TilingSprite>();
  readonly labels = new Map<string, Text>();
  readonly enabled = new Map<string, boolean>();
  readonly order: RenderLayer;
  private readonly drawables = new Set<Container>();
  private readonly poses = new Map<string, { x: number; y: number; z: number; sx: number; sy: number; sz: number; rotation: readonly number[]; euler?: readonly number[] }>();
  private readonly matrix = new Matrix();

  constructor(private readonly profile: readonly ResultWidgetNode[], resources: ResultWidgetResources,
    private readonly labelLayouts: Readonly<Record<string, OriginalLabelLayout>>, anchors: readonly string[] = [], order?: RenderLayer) {
    this.order = order ?? new RenderLayer({ sortableChildren: true });
    const byPath = new Map(profile.map(n => [n.path, n]));
    const consumed = new Set(anchors);
    for (const n of profile) if (n.sprite !== undefined || n.label !== undefined) consumed.add(n.path);
    for (const path of consumed) {
      const parent = byPath.get(path)!.parent;
      if (parent !== null) consumed.add(parent);
    }
    const nodes = profile.filter(n => consumed.has(n.path));
    for (const n of nodes) {
      const node = new Container({ label: n.path });
      this.poses.set(n.path, { x: n.position[0]!, y: n.position[1]!, z: n.position[2]!, sx: n.scale[0]!, sy: n.scale[1]!, sz: n.scale[2]!, rotation: n.rotationXY });
      node.visible = n.active;
      if (n.alpha !== undefined) node.alpha = n.alpha;
      this.nodes.set(n.path, node);
      this.applyPose(n.path);
    }
    for (const n of nodes) {
      const node = this.nodes.get(n.path)!;
      (n.parent === null ? this.root : this.nodes.get(n.parent)!).addChild(node);
      const s = n.sprite;
      if (s !== undefined) {
        const texture = resources.texture(s.atlas, s.name);
        const anchor = { x: s.pivot % 3 / 2, y: Math.floor(s.pivot / 3) / 2 };
        const b = resources.border(s.atlas, s.name);
        const sprite = s.type === 1 && (s.name === "button_pink" || s.name === "button_gray")
          ? createSerializedButtonSprite(texture, s.size, b, anchor, n.path)
          : s.type === 1 ? new NineSliceSprite({ texture, anchor, width: s.size[0], height: s.size[1],
          leftWidth: b.left, rightWidth: b.right, topHeight: b.top, bottomHeight: b.bottom })
          : s.type === 2 ? new TilingSprite({ texture, anchor, width: s.size[0], height: s.size[1] })
          : new Sprite({ texture, anchor, width: s.size[0], height: s.size[1] });
        sprite.tint = color(s.color); sprite.alpha = s.color[3]!; sprite.zIndex = s.depth;
        node.addChild(sprite); this.sprites.set(n.path, sprite); this.order.attach(sprite); this.drawables.add(sprite);
      }
      const l = n.label;
      if (l !== undefined) {
        const text = new Text({ text: l.text, style: { fontFamily: resources.font, fontSize: l.fontSize,
          letterSpacing: l.spacing, fill: color(l.color),
          align: l.pivot % 3 === 0 ? "left" : l.pivot % 3 === 2 ? "right" : "center" } });
        fitNguiWidgetText(text, l.size, l.pivot, labelLayouts[n.path]!);
        text.alpha = l.color[3]!; text.zIndex = l.depth;
        node.addChild(text); this.labels.set(n.path, text);
        this.order.attach(text); this.drawables.add(text);
      }
    }
    if (order === undefined) this.root.addChild(this.order);
  }

  setText(path: string, value: string): void {
    const label = this.labels.get(path)!;
    label.text = value;
    const source = this.profile.find(n => n.path === path)!.label!;
    fitNguiWidgetText(label, source.size, source.pivot, this.labelLayouts[path]!);
  }

  replaceNumber(path: string, number: PixiResultNumberLabel): void {
    const label = this.labels.get(path)!;
    number.root.zIndex = label.zIndex;
    this.order.detach(label); this.drawables.delete(label); label.destroy(); this.labels.delete(path);
    this.nodes.get(path)!.addChild(number.root); this.order.attach(number.root); this.drawables.add(number.root);
  }

  apply(animation: StageClipAnimation, prefix = ""): void {
    for (const b of animation.clip.bindings) {
      const path = prefix + b.path; const node = this.nodes.get(path)!;
      // Obsolete empty sprites and excluded account-only nodes have no consumers.
      if (node === undefined) continue;
      const v = animation.values; const i = b.index;
      if (b.property === "position" || b.property === "scale") {
        const pose = this.poses.get(path)!;
        if (b.property === "position") { pose.x = v[i]!; pose.y = v[i + 1]!; pose.z = v[i + 2]!; }
        else { pose.sx = v[i]!; pose.sy = v[i + 1]!; pose.sz = v[i + 2]!; }
        this.applyPose(path);
      }
      else if (b.property === "euler") {
        this.setEuler(path, [v[i]!, v[i + 1]!, v[i + 2]!]);
      }
      else if (b.property === "active") node.visible = v[i]! !== 0;
      else if (b.property === "alpha") node.alpha = v[i]!;
      else if (b.property === "spriteAlpha") this.sprites.get(path)!.alpha = v[i]!;
      else if (b.property === "enabled") this.enabled.set(path, v[i]! !== 0);
    }
  }

  setEuler(path: string, angles: readonly number[]): void {
    const pose = this.poses.get(path)!;
    pose.euler = angles;
    const { x, y, z, w } = eulerQuaternion(angles);
    pose.rotation = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z)];
    this.applyPose(path);
  }

  resetAnimationDefaults(): void {
    for (const n of this.profile) {
      const node = this.nodes.get(n.path);
      if (node === undefined) continue;
      this.poses.set(n.path, { x: n.position[0]!, y: n.position[1]!, z: n.position[2]!,
        sx: n.scale[0]!, sy: n.scale[1]!, sz: n.scale[2]!, rotation: n.rotationXY });
      this.applyPose(n.path); node.visible = n.active; node.alpha = n.alpha ?? 1;
      const sprite = this.sprites.get(n.path);
      if (sprite !== undefined && n.sprite !== undefined) sprite.alpha = n.sprite.color[3]!;
    }
  }

  particleTransform(path: string, original: ParticleTransformProfile): ParticleTransformProfile {
    const pose = this.poses.get(path)!;
    return {
      m_LocalPosition: { x: pose.x, y: pose.y, z: pose.z },
      m_LocalScale: { x: pose.sx, y: pose.sy, z: pose.sz },
      m_LocalRotation: pose.euler === undefined ? original.m_LocalRotation : eulerQuaternion(pose.euler),
    };
  }

  dispose(): void {
    this.order.detach(...this.drawables); this.drawables.clear(); this.root.destroy({ children: true });
  }

  private applyPose(path: string): void {
    const p = this.poses.get(path)!; const r = p.rotation;
    this.nodes.get(path)!.setFromMatrix(this.matrix.set(r[0]! * p.sx, -r[1]! * p.sx,
      -r[2]! * p.sy, r[3]! * p.sy, p.x, -p.y));
  }
}

function color(v: readonly number[]): number {
  return linearTintFromSrgbChannels(v[0]!, v[1]!, v[2]!);
}

function eulerQuaternion(v: readonly number[]): { x: number; y: number; z: number; w: number } {
  const x = v[0]! * Math.PI / 360, y = v[1]! * Math.PI / 360, z = v[2]! * Math.PI / 360;
  const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y), sz = Math.sin(z), cz = Math.cos(z);
  // Authored Transform Euler angles use Z-X-Y order.
  return { x: sx * cy * cz + cx * sy * sz, y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz, w: cx * cy * cz + sx * sy * sz };
}
