import { CanvasTextMetrics, DOMAdapter, fontStringFromTextStyle, type Text } from "pixi.js";
import { originalLabelBaseline, roundLabelCoordinate } from "../../../../components/text/originalLabelMetrics";

export interface OriginalLabelLayout {
  readonly spacingY: number;
  readonly alignment: number;
  readonly maxLines: number;
  readonly overflow: number;
}

const baselines = new Map<string, number>();
let context: CanvasRenderingContext2D | null = null;

/** Adapt the host texture to the original printed-line pivot and baseline. */
export function layoutNguiText(text: Text, pivotX = 0.5, pivotY = 0.5, spacingY = 0): void {
  const style = text.style;
  const lineHeight = style.fontSize + spacingY;
  style.lineHeight = lineHeight;
  const font = fontStringFromTextStyle(style);
  let baseline = baselines.get(font);
  if (baseline === undefined) {
    context ??= DOMAdapter.get().createCanvas(1, 1).getContext("2d") as CanvasRenderingContext2D;
    context.font = font;
    context.textBaseline = "alphabetic";
    baseline = originalLabelBaseline(context, style.fontSize);
    baselines.set(font, baseline);
  }
  const measured = CanvasTextMetrics.measureText(text.text || " ", style);
  const stroke = style.stroke;
  const strokeWidth = typeof stroke === "object" && stroke !== null && "width" in stroke ? stroke.width ?? 0 : 0;
  const hostBaseline = strokeWidth / 2 + measured.fontProperties.ascent +
    Math.max(0, (lineHeight - measured.fontProperties.fontSize) / 2);
  const printedHeight = Math.ceil(measured.lines.length * lineHeight);
  const wantedBaseline = baseline - roundLabelCoordinate(printedHeight * pivotY);
  text.anchor.set(pivotX, (hostBaseline - wantedBaseline) / measured.height);
}

/** Preserve source alignment and line spacing, while using host wrapping/widths. */
export function layoutNguiWidgetText(text: Text, pivot: number, layout: OriginalLabelLayout): void {
  const x = (pivot % 3) / 2, y = Math.floor(pivot / 3) / 2;
  text.style.align = layout.alignment === 1 ? "left" : layout.alignment === 2 ? "center" :
    layout.alignment === 3 ? "right" : x === 0 ? "left" : x === 1 ? "right" : "center";
  layoutNguiText(text, x, y, layout.spacingY);
}

export function fitNguiWidgetText(text: Text, size: readonly number[], pivot: number, layout: OriginalLabelLayout): void {
  text.scale.set(1);
  // NGUIText.WrapText also limits lines by regionHeight / finalLineHeight.
  // maxLines=0 removes the explicit cap; it does not make a short box multiline.
  // Keep a one-line box unbroken so ShrinkContent fits its width before drawing.
  const heightLineLimit = Math.floor(size[1]! / (text.style.fontSize + layout.spacingY));
  text.style.wordWrap = layout.maxLines !== 1 && heightLineLimit > 1;
  text.style.wordWrapWidth = size[0]!;
  text.style.breakWords = true;
  text.style.whiteSpace = "pre-line";
  layoutNguiWidgetText(text, pivot, layout);
  if (layout.overflow === 0) {
    const measured = CanvasTextMetrics.measureText(text.text || " ", text.style);
    const printedHeight = Math.ceil(measured.lines.length * (text.style.fontSize + layout.spacingY));
    text.scale.set(Math.min(1, size[0]! / Math.max(1, measured.width), size[1]! / printedHeight));
  }
}
