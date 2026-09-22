import type { CollaborationThumbnailInput } from "./generateCollaborationSkinThumbnail";

// Shared composition approved using the nine sample images. These are editor
// illustration parameters, not an emulation of Unity's live renderer.
const S = 4, SIZE = 128 * S, TOP = 23 * S, BOTTOM = 92 * S, WIDTH = 112 * S;
function surface(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("缩略图需要 Canvas 2D");
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  return { canvas, context };
}
function pixels(image: ImageBitmap) {
  const { canvas, context } = surface(image.width, image.height);
  context.drawImage(image, 0, 0);
  return { canvas, context, image: context.getImageData(0, 0, image.width, image.height) };
}
function bounds(image: ImageData, threshold: number, fromY = 0) {
  let left = image.width, top = image.height, right = 0, bottom = 0;
  for (let y = fromY; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (image.data[(y * image.width + x) * 4 + 3]! < threshold) continue;
    left = Math.min(left, x); right = Math.max(right, x + 1);
    top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
  }
  if (right <= left) throw new Error("缩略图素材为空");
  return { left, top, width: right - left, height: bottom - top };
}

// This source has a continuous trapezoid plus detached decorative stars. Infer
// its straight edges from two interior rows, before the faded bottom border.
// Keep the actual artwork inside those edges rather than redrawing lane lines.
function isolateLaneBody(image: ImageData) {
  const span = (y: number) => {
    const center = Math.floor(image.width / 2);
    let left = center, right = center;
    const alpha = (x: number) => image.data[(y * image.width + x) * 4 + 3]!;
    if (alpha(center) < 16) throw new Error("缩略图轨道主体无法识别");
    while (left > 0 && alpha(left - 1) >= 16) left--;
    while (right + 1 < image.width && alpha(right + 1) >= 16) right++;
    return { left, right };
  };
  const y1 = Math.round(image.height * .3), y2 = Math.round(image.height * .75);
  const a = span(y1), b = span(y2);
  for (let y = 0; y < image.height; y++) {
    const t = (y - y1) / (y2 - y1);
    const left = a.left + (b.left - a.left) * t;
    const right = a.right + (b.right - a.right) * t;
    for (let x = 0; x < image.width; x++) {
      if (x < left - 1 || x > right + 1) image.data[(y * image.width + x) * 4 + 3] = 0;
    }
  }
}
function dilate(alpha: Uint8ClampedArray, width: number, height: number, radius: number) {
  const horizontal = [alpha];
  for (let r = 1; r <= radius; r++) {
    const row = horizontal[r - 1]!.slice();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      row[i] = Math.max(row[i]!, x >= r ? alpha[i - r]! : 0, x + r < width ? alpha[i + r]! : 0);
    }
    horizontal.push(row);
  }
  const result = alpha.slice();
  for (let dy = -radius; dy <= radius; dy++) {
    const row = horizontal[Math.floor(Math.sqrt(radius * radius - dy * dy))]!;
    for (let y = Math.max(0, -dy); y < Math.min(height, height - dy); y++) {
      const target = y * width, source = (y + dy) * width;
      for (let x = 0; x < width; x++) result[target + x] = Math.max(result[target + x]!, row[source + x]!);
    }
  }
  return result;
}
function thickened(image: ImageData, radius: number) {
  const width = image.width + 2 * radius, height = image.height + 2 * radius;
  const output = new ImageData(width, height);
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (dx * dx + dy * dy > radius * radius) continue;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const from = (y * image.width + x) * 4;
      const to = ((y + radius + dy) * width + x + radius + dx) * 4;
      if (image.data[from + 3]! > output.data[to + 3]!) output.data.set(image.data.subarray(from, from + 4), to);
    }
  }
  const result = surface(width, height), original = surface(image.width, image.height);
  result.context.putImageData(output, 0, 0); original.context.putImageData(image, 0, 0);
  result.context.drawImage(original.canvas, radius, radius);
  return result.canvas;
}

export async function composeCollaborationThumbnail(input: CollaborationThumbnailInput): Promise<Blob> {
  const images: ImageBitmap[] = [];
  try {
    // Sequential decode permits exact cleanup even if an input cannot decode.
    for (const blob of [input.field, input.judge, input.note]) images.push(await createImageBitmap(blob));
    const [field, judge, note] = images as [ImageBitmap, ImageBitmap, ImageBitmap];
    const layer = surface(SIZE, SIZE), originalField = pixels(field);
    if (input.isolateFieldBody) {
      isolateLaneBody(originalField.image);
      originalField.context.putImageData(originalField.image, 0, 0);
    }
    const fieldBounds = bounds(originalField.image, 16, field.height - 8);
    const cutY = Math.round(field.height * .24), resizedField = surface(WIDTH, BOTTOM - TOP);
    resizedField.context.drawImage(originalField.canvas, fieldBounds.left, cutY, fieldBounds.width, field.height - cutY,
      0, 0, WIDTH, BOTTOM - TOP);
    const data = resizedField.context.getImageData(0, 0, WIDTH, BOTTOM - TOP);
    for (let i = 0; i < data.data.length; i += 4) {
      const a = data.data[i + 3]! / 255;
      if (!a) continue;
      const alpha = 1 - (1 - a) ** 3;
      const rgb = [0, 1, 2].map(c => Math.min(255, data.data[i + c]! * 1.65));
      const luminance = rgb[0]! * .299 + rgb[1]! * .587 + rgb[2]! * .114;
      [30, 33, 42].forEach((floor, c) => {
        const color = Math.max(0, Math.min(255, luminance + (rgb[c]! - luminance) * 1.15));
        data.data[i + c] = Math.round(color * alpha + floor * (1 - alpha));
      });
      data.data[i + 3] = 255;
    }
    resizedField.context.putImageData(data, 0, 0);
    const fieldX = (SIZE - WIDTH) / 2;
    layer.context.drawImage(resizedField.canvas, fieldX, TOP);

    const judgeCrop = surface(1160, judge.height);
    judgeCrop.context.drawImage(judge, Math.round((judge.width - 1160) / 2), 0, 1160, judge.height,
      0, 0, 1160, judge.height);
    const judgePixels = judgeCrop.context.getImageData(0, 0, 1160, judge.height);
    const coverage = Array.from({ length: judge.height }, (_, y) => {
      let count = 0;
      for (let x = 0; x < 1160; x++) if (judgePixels.data[(y * 1160 + x) * 4 + 3]! >= 128) count++;
      return count;
    });
    const peak = Math.max(...coverage);
    if (!peak) throw new Error("缩略图判定线为空");
    const rows = coverage.flatMap((count, y) => count >= peak * .95 ? [y + .5] : []);
    const axis = rows.reduce((sum, y) => sum + y, 0) / rows.length;
    const smallJudge = surface(WIDTH - 2 * S, Math.round(judge.height * .1 * S));
    smallJudge.context.drawImage(judgeCrop.canvas, 0, 0, smallJudge.canvas.width, smallJudge.canvas.height);
    const judgeY = Math.round(BOTTOM - axis * smallJudge.canvas.height / judge.height);
    const expanded = thickened(smallJudge.context.getImageData(0, 0, smallJudge.canvas.width, smallJudge.canvas.height), S);
    layer.context.drawImage(expanded, fieldX, judgeY - S);

    const noteBounds = bounds(pixels(note).image, 8);
    const factor = Math.min(84 * S / noteBounds.width, 35 * S / noteBounds.height);
    const width = Math.round(noteBounds.width * factor), height = Math.round(noteBounds.height * factor);
    layer.context.drawImage(note, noteBounds.left, noteBounds.top, noteBounds.width, noteBounds.height,
      Math.round((SIZE - width) / 2), Math.round(56 * S - height / 2), width, height);
    const combined = layer.context.getImageData(0, 0, SIZE, SIZE);
    const alpha = new Uint8ClampedArray(SIZE * SIZE);
    for (let i = 0; i < alpha.length; i++) alpha[i] = combined.data[i * 4 + 3]!;
    const expandedAlpha = dilate(alpha, SIZE, SIZE, 3 * S);
    const border = new ImageData(SIZE, SIZE);
    for (let i = 0; i < alpha.length; i++) border.data.set([52, 52, 52, expandedAlpha[i]!], i * 4);
    const outlined = surface(SIZE, SIZE);
    outlined.context.putImageData(border, 0, 0); outlined.context.drawImage(layer.canvas, 0, 0);
    const result = surface(128, 128);
    result.context.drawImage(outlined.canvas, 0, 0, 128, 128);
    return await result.canvas.convertToBlob({ type: "image/png" });
  } finally { images.forEach(image => image.close()); }
}
