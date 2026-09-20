import { Container, NineSliceSprite, type Texture } from "pixi.js";
import { containsSerializedButton, SerializedButtonInput, SERIALIZED_BUTTON_PRESS_ALPHA } from "../SerializedButtonInput";

export type SerializedButtonBorder = Readonly<{ left: number; right: number; top: number; bottom: number }>;

/** StarUIButton's sliced surface; its host supplies the selected atlas row. */
export function createSerializedButtonSprite(texture: Texture, size: readonly number[],
  border: SerializedButtonBorder, anchor: { x: number; y: number }, label?: string): NineSliceSprite {
  return new NineSliceSprite({ texture, width: size[0], height: size[1], anchor, label,
    leftWidth: border.left, rightWidth: border.right, topHeight: border.top, bottomHeight: border.bottom });
}

/** StarUIButton's same-sprite, white half-alpha pressed cover. */
export function createSerializedButtonPressCover(button: NineSliceSprite, label: string): NineSliceSprite {
  const cover = createSerializedButtonSprite(button.texture, [button.width, button.height],
    { left: button.leftWidth, right: button.rightWidth, top: button.topHeight, bottom: button.bottomHeight },
    { x: button.anchor.x, y: button.anchor.y }, label);
  cover.visible = false; cover.alpha = SERIALIZED_BUTTON_PRESS_ALPHA; cover.zIndex = 20;
  return cover;
}

/** Input positions belong to the supplied scene, independently of host display scaling. */
export class PixiSerializedButtonInput {
  private readonly input = new SerializedButtonInput<"button">();
  private readonly bounds: Readonly<{ x: number; y: number; width: number; height: number }>;

  constructor(private readonly node: Container, private readonly coordinateRoot: Container,
    private readonly cover: Container, collider: Readonly<{ width: number; height: number }>) {
    this.bounds = { x: -collider.width / 2, y: -collider.height / 2, width: collider.width, height: collider.height };
  }

  press(finger: number, x: number, y: number): void {
    this.input.press(finger, this.hit(x, y) ? "button" : null); this.refresh();
  }

  release(finger: number, x: number, y: number): boolean {
    const clicked = this.input.release(finger, this.hit(x, y) ? "button" : null);
    this.refresh();
    return clicked !== null;
  }

  clear(): void { this.input.clear(); this.refresh(); }

  private hit(x: number, y: number): boolean {
    if (!this.node.visible || this.node.scale.x === 0 || this.node.scale.y === 0) return false;
    const point = this.node.toLocal({ x, y }, this.coordinateRoot);
    return containsSerializedButton(point, this.bounds);
  }

  private refresh(): void { this.cover.visible = this.input.isPressed; }
}
