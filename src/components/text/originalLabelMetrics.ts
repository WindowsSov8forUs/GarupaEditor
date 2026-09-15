/** Original NGUIText.Update: a reference glyph defines the alphabetic baseline.
 * Canvas supplies the host glyph metrics; no Unity glyph cache is reproduced. */
export function originalLabelBaseline(
  context: Pick<CanvasRenderingContext2D, "measureText">,
  fontSize: number,
): number {
  let glyph = context.measureText(")");
  if (glyph.actualBoundingBoxAscent + glyph.actualBoundingBoxDescent === 0) glyph = context.measureText("A");
  if (glyph.actualBoundingBoxAscent + glyph.actualBoundingBoxDescent === 0) return 0;
  return roundLabelCoordinate((fontSize + glyph.actualBoundingBoxAscent - glyph.actualBoundingBoxDescent) / 2);
}

export function roundLabelCoordinate(value: number): number {
  const lower = Math.floor(value);
  return value - lower === 0.5 ? lower + (Math.abs(lower) % 2) : Math.round(value);
}
