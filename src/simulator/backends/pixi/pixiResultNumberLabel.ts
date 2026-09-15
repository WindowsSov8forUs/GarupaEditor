import { Container, Text } from "pixi.js";
import { linearTintFromSrgbColor } from "./hud/nguiMaterialPipeline";
import { layoutNguiText } from "./hud/nguiTextLayout";

/** LabelUtility.SetLabelNumberZeroFill: gray padding and separately colored digits. */
export class PixiResultNumberLabel {
  readonly root = new Container();
  private readonly active: Text;
  private readonly padding: Text;
  private current: string | null = null;

  constructor(font: string, fontSize: number, private readonly spacing: number, private readonly width: number,
    private readonly digits: number, activeColor: number) {
    const style = { fontFamily: font, fontSize, letterSpacing: spacing };
    this.padding = new Text({ text: "", style: { ...style, fill: linearTintFromSrgbColor(0xaaaaaa) } });
    this.active = new Text({ text: "", style: { ...style, fill: linearTintFromSrgbColor(activeColor) } });
    this.root.addChild(this.padding, this.active);
  }

  setText(text: string): void {
    if (text === this.current) return;
    this.current = text;
    this.active.text = text;
    this.padding.text = "0".repeat(Math.max(0, this.digits - text.length));
    layoutNguiText(this.padding, 1, 0.5); layoutNguiText(this.active, 1, 0.5);
    // NGUI color tags do not interrupt the original character-spacing run.
    const boundarySpacing = text.length > 0 && this.padding.text.length > 0 ? this.spacing : 0;
    this.padding.x = -this.active.width - boundarySpacing;
    const width = this.active.width + this.padding.width + boundarySpacing;
    this.root.scale.set(width > this.width ? this.width / width : 1);
  }
}
