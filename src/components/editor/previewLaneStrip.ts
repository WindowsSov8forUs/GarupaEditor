// Unprojects the original rhythm field image (bg_line_rhythm, perspective) into a flat
// lane field, keeping its pattern. As in NotGarupa's generator (preview.go, flattenField),
// a field point h UI units above the judge line is pulled toward the centre by
// k(h) = 1 - 0.95 * h / fieldSpawnH. Here no rows are averaged: each output row is one
// field row h (rows from the lowest visible field row up to 400 UI units above the judge line), each output column is a
// lane-width x in flat coordinates, so the original pattern is kept in flat form.

export const FIELD_WIDTH_UNITS = 1160;
export const FIELD_HEIGHT_UNITS = 610;
export const LANE_SPACING_UNITS = 153.2;
export const FIELD_WIDTH_LANES = FIELD_WIDTH_UNITS / LANE_SPACING_UNITS;

const FIELD_S = 1334 / (2 * 9.578571319580078);
const FIELD_SPAWN_H = 0.95 * 8.870001 * FIELD_S;
const ROW_TO = 400;
const PX_PER_LANE = 64;

export function loadPreviewLaneImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Field image failed to load."));
    image.src = url;
  });
}

// Bilinear sample at pixel-centre coordinates, interpolating premultiplied colour;
// returns straight RGBA in 0..1.
function bilinear(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number): [number, number, number, number] {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = x - x0, ty = y - y0;
  let pr = 0, pg = 0, pb = 0, pa = 0;
  for (const [dx, dy, weight] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]] as const) {
    const sx = Math.min(width - 1, Math.max(0, x0 + dx));
    const sy = Math.min(height - 1, Math.max(0, y0 + dy));
    const index = (sy * width + sx) * 4;
    const a = pixels[index + 3] / 255;
    pr += pixels[index] * a * weight;
    pg += pixels[index + 1] * a * weight;
    pb += pixels[index + 2] * a * weight;
    pa += a * weight;
  }
  if (pa <= 0) return [0, 0, 0, 0];
  return [pr / pa / 255, pg / pa / 255, pb / pa / 255, pa];
}

// Output: FIELD_WIDTH_LANES * PX_PER_LANE wide, (ROW_TO - ROW_FROM + 1) tall. Top row is the
// far field (h = ROW_TO), bottom row is nearest the judge line (h = ROW_FROM).
export function unprojectFieldRows(image: HTMLImageElement): HTMLCanvasElement {
  const srcWidth = image.naturalWidth;
  const srcHeight = image.naturalHeight;
  const sx = srcWidth / FIELD_WIDTH_UNITS;
  const sy = srcHeight / FIELD_HEIGHT_UNITS;

  const source = document.createElement("canvas");
  source.width = srcWidth;
  source.height = srcHeight;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("Canvas 2D context is unavailable.");
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, srcWidth, srcHeight).data;

  const outWidth = Math.round(FIELD_WIDTH_LANES * PX_PER_LANE);
  // Lowest field row that has visible alpha anywhere along its width (UI units above the judge line).
  // Rows below it are transparent in the source; keeping them leaves an empty band at the track bottom.
  let fieldBottom = ROW_TO;
  for (let height = 0; height <= ROW_TO; height += 1) {
    const y = Math.min(srcHeight - 1, Math.max(0, Math.floor(srcHeight - (height + 0.5) * sy)));
    let visible = false;
    for (let x = 0; x < srcWidth && !visible; x += 4) {
      if (pixels[(y * srcWidth + x) * 4 + 3] > 12) visible = true;
    }
    if (visible) { fieldBottom = height; break; }
  }
  const outHeight = ROW_TO - fieldBottom + 1;
  const trackUnits = FIELD_WIDTH_UNITS;
  const out = document.createElement("canvas");
  out.width = outWidth;
  out.height = outHeight;
  const outContext = out.getContext("2d");
  if (!outContext) throw new Error("Canvas 2D context is unavailable.");
  const output = outContext.createImageData(outWidth, outHeight);

  for (let row = 0; row < outHeight; row += 1) {
    const height = ROW_TO - row;
    const k = 1 - 0.95 * height / FIELD_SPAWN_H;
    const fy = (FIELD_HEIGHT_UNITS - height - 0.5) * sy - 0.5;
    for (let column = 0; column < outWidth; column += 1) {
      const flatX = (column + 0.5) / outWidth * trackUnits - trackUnits / 2;
      const fx = (FIELD_WIDTH_UNITS / 2 + flatX * k) * sx - 0.5;
      const [r, g, b, a] = bilinear(pixels, srcWidth, srcHeight, fx, fy);
      const index = (row * outWidth + column) * 4;
      output.data[index] = Math.round(r * 255);
      output.data[index + 1] = Math.round(g * 255);
      output.data[index + 2] = Math.round(b * 255);
      output.data[index + 3] = Math.round(a * 255);
    }
  }
  outContext.putImageData(output, 0, 0);
  return out;
}
