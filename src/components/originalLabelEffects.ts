/** NGUI UILabel.OnFill uses translated glyph copies, not a centered text stroke.
 * Source: https://github.com/tasharen/ngui/blob/master/Assets/NGUI/Scripts/UI/UILabel.cs
 * The selected effect, distance and color remain owned by the original prefab.
 */
export function originalLabelTextShadow(
  effect: number,
  distance: Readonly<{ x: number; y: number }>,
  rgba: Readonly<{ r: number; g: number; b: number; a: number }>,
  scaleX: number,
  scaleY: number,
  labelAlpha: number,
): string | undefined {
  if (effect === 0) return undefined;
  if (effect !== 1 && effect !== 2 && effect !== 3) {
    throw new Error(`Unsupported original UILabel effect ${effect}.`);
  }
  const x = distance.x * Math.abs(scaleX), y = distance.y * Math.abs(scaleY);
  const tint = `rgba(${rgba.r * 255},${rgba.g * 255},${rgba.b * 255},${rgba.a * labelAlpha})`;
  // Unity's first copy is (x,-y); CSS has a downward-positive Y axis.
  const offsets: Array<readonly [number, number]> = [[x, y]];
  if (effect !== 1) offsets.push([-x, -y], [x, -y], [-x, y]);
  if (effect === 3) offsets.push([-x, 0], [x, 0], [0, -y], [0, y]);
  return offsets.map(([dx, dy]) => `${dx}px ${dy}px 0 ${tint}`).join(", ");
}
