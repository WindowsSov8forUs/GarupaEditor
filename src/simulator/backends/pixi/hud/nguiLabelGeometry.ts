import type { Text } from "pixi.js";

export function layoutNguiEncodedLifeLabel(
  segments: readonly [Text, Text, Text],
  current: string,
  maximum: string,
  rightX: number,
  centerY: number,
  fontSize: number,
  fontFamily: string,
): void {
  const values = [current, "/", maximum] as const;
  const fills = [Number(current) > 0 ? 0x00c000 : 0xfe2349, 0x505050, 0x00c000] as const;
  for (let index = 0; index < segments.length; index += 1) {
    const text = segments[index]!;
    text.text = values[index]!;
    text.style = { fill: fills[index]!, fontSize, fontFamily, fontWeight: "normal" };
    text.anchor.set(0, 0.5);
  }
  if (typeof document === "undefined") {
    segments.forEach((text) => text.position.set(rightX, centerY));
    return;
  }
  const widths = segments.map((text) => text.width);
  let cursor = rightX - widths.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < segments.length; index += 1) {
    segments[index]!.position.set(cursor, centerY);
    cursor += widths[index]!;
  }
}
