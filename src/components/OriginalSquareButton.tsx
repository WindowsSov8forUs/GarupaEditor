import { useMemo, type CSSProperties } from "react";
import { OriginalPrefabModel, ORIGINAL_PREFABS, type OriginalPrefab } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";
import cardImageSwitch from "../data/originalCardImageSwitchButton.json";

/*
 * The original small square button: the member detail page's IllustChangeButton (48x48 button_gray with a
 * glyph sprite; pressed and disabled show its Cover). The glyph sprite is replaced by the caller's glyph.
 */
const prefab = cardImageSwitch as unknown as OriginalPrefab;
const base = new OriginalPrefabModel(prefab);
const root = base.nodeAt("IllustChangeButton");
const surface = base.componentAt(root.id, "UISprite")!;
const button = base.componentAt(root.id, "StarUIButton")!;
const glyphNode = base.nodeAt("Image");
const glyphSlot = base.componentAt(glyphNode.id, "UISprite")!;
export const ORIGINAL_SQUARE_BUTTON_BOUNDS = base.rect(surface);
const slot = base.rect(glyphSlot);
/** Original button content is drawn in the button label colour (the square radio's label). */
const radio = new OriginalPrefabModel(ORIGINAL_PREFABS.staruisquareradiobutton!);
const labelColor = radio.components.get(16)!.data.mColor as { r: number; g: number; b: number; a: number };
const css = ({ r, g, b, a }: { r: number; g: number; b: number; a: number }) =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)} / ${a})`;

/**
 * `selected` shows button_pink of the same atlas with a white glyph, as the square radio does when selected.
 * The glyph image supplies only the shape (its alpha) and fills the glyph slot, centred.
 */
export function OriginalSquareButton({ label, glyph, onClick, selected = false, disabled = false, flip = false, rotate = false, role }: {
  label: string; glyph: string; onClick(): void; selected?: boolean; disabled?: boolean; flip?: boolean;
  /** Turns the glyph a quarter turn (a left-right glyph then reads up-down). */
  rotate?: boolean; role?: "radio" | "checkbox";
}) {
  const model = useMemo(() => new OriginalPrefabModel(prefab, {
    nodes: { [glyphNode.id]: { active: false } },
    components: selected ? { [surface.id]: { mSpriteName: "button_pink" } } : {},
  }), [selected]);
  return <>
    <OriginalPrefabView model={model} bindings={{ buttons: { [button.id]: { action: onClick, label, disabled, selected, role } } }} />
    <span className="original-square-button-glyph" style={{
      left: slot.x, top: slot.y, width: slot.width, height: slot.height, zIndex: glyphSlot.data.mDepth ?? 0,
      "--original-square-button-glyph": `url(${JSON.stringify(glyph)})`,
      backgroundColor: selected ? "rgb(255 255 255 / 1)" : css(labelColor),
      transform: [flip ? "scaleX(-1)" : "", rotate ? "rotate(90deg)" : ""].join(" ").trim() || undefined,
    } as CSSProperties} />
  </>;
}
