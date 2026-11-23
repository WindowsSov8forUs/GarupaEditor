import { useEffect, useState } from "react";

/** The part of a sprite at least half opaque, as fractions of its width and height. */
export type SpriteOpaqueBox = { left: number; right: number; top: number; bottom: number };

/** A sprite's two colours as a Hidden node's mark takes them: its fill (the middle of its opaque part) and its outline
 * (across from the middle to the top, the colour least like the fill), as [r, g, b]. */
export type SpriteMarkColors = { fill: [number, number, number]; stroke: [number, number, number] };

/** How opaque a Hidden node's mark is filled: a node that is not seen. */
const HIDDEN_MARK_FILL_ALPHA = 0.25;

/** A Hidden node's mark drawn in `colors` (null: the editor's own mark colours), as CSS colours. */
export function hiddenMarkPaint(colors: SpriteMarkColors | null | undefined): { fill: string; stroke: string } {
  if (!colors) return { fill: "rgba(0, 0, 0, 0.5)", stroke: "rgba(83, 232, 140, 0.75)" };
  const [r, g, b] = colors.fill, [sr, sg, sb] = colors.stroke;
  return { fill: `rgba(${r}, ${g}, ${b}, ${HIDDEN_MARK_FILL_ALPHA})`, stroke: `rgb(${sr}, ${sg}, ${sb})` };
}

const boxes = new Map<string, SpriteOpaqueBox | null>();
const colors = new Map<string, SpriteMarkColors | null>();
/** A sprite's mean colour over its opaque part, as [r, g, b]. */
const means = new Map<string, [number, number, number] | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

function measure(url: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  const done = (box: SpriteOpaqueBox | null, markColors: SpriteMarkColors | null = null,
    mean: [number, number, number] | null = null) => {
    boxes.set(url, box);
    colors.set(url, markColors);
    means.set(url, mean);
    pending.delete(url);
    for (const listener of listeners) listener();
  };
  image.onload = () => {
    try {
      const width = image.naturalWidth, height = image.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context || width === 0 || height === 0) return done(null);
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, width, height);
      let minX = width, maxX = -1, minY = height, maxY = -1;
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = (y * width + x) * 4;
          if (data[index + 3]! < 128) continue;
          sumR += data[index]!; sumG += data[index + 1]!; sumB += data[index + 2]!; count += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0) return done(null);
      done({ left: minX / width, right: (maxX + 1) / width, top: minY / height, bottom: (maxY + 1) / height },
        measureMarkColors(data, width, minX, maxX, minY, maxY),
        [Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count)]);
    } catch {
      // A sprite the canvas may not read (another origin) has no measured box.
      done(null);
    }
  };
  image.onerror = () => done(null);
  image.src = url;
}

/** The fill and outline colours down a column a third of the way across the opaque part (clear of a mark in the
 * middle): the fill where the column crosses the middle row, the outline the opaque run above it least like the fill. */
function measureMarkColors(data: Uint8ClampedArray, width: number, minX: number, maxX: number, minY: number,
  maxY: number): SpriteMarkColors | null {
  const x = Math.round(minX + (maxX - minX) / 3);
  const at = (y: number) => { const index = (y * width + x) * 4; return [data[index]!, data[index + 1]!, data[index + 2]!, data[index + 3]!]; };
  const middle = Math.round((minY + maxY) / 2);
  const fill = at(middle);
  if (fill[3]! < 128) return null;
  const distance = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
  let stroke = fill, farthest = 0;
  for (let y = minY; y < middle; y += 1) {
    const pixel = at(y);
    if (pixel[3]! < 128) continue;
    const away = distance(pixel, fill);
    if (away > farthest) { farthest = away; stroke = pixel; }
  }
  const rgb = (pixel: number[]): [number, number, number] => [pixel[0]!, pixel[1]!, pixel[2]!];
  return { fill: rgb(fill), stroke: rgb(stroke) };
}

/** The fill and outline colours of the sprite at `url` (see SpriteMarkColors), measured with its opaque box:
 * undefined while that is being measured, null when it cannot be. */
export function spriteMarkColors(url: string | null | undefined): SpriteMarkColors | null | undefined {
  if (!url) return null;
  if (colors.has(url)) return colors.get(url)!;
  spriteOpaqueBox(url);
  return undefined;
}

/** The mean colour of the sprite at `url` over its opaque part, measured with its opaque box (see
 * spriteMarkColors). */
export function spriteMeanColor(url: string | null | undefined): [number, number, number] | null | undefined {
  if (!url) return null;
  if (means.has(url)) return means.get(url)!;
  spriteOpaqueBox(url);
  return undefined;
}

/**
 * The opaque box of the sprite at `url`: undefined while it is being measured (the call starts it), null when it
 * cannot be (no opaque pixel, unreadable). Components that use it rerender through useSpriteOpaqueBoxVersion.
 */
export function spriteOpaqueBox(url: string | null | undefined): SpriteOpaqueBox | null | undefined {
  if (!url) return null;
  if (boxes.has(url)) return boxes.get(url)!;
  if (!pending.has(url)) {
    pending.add(url);
    measure(url);
  }
  return undefined;
}

/** A number that changes whenever a sprite's opaque box has been measured. */
export function useSpriteOpaqueBoxVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((current) => current + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return version;
}
