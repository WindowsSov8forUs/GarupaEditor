import { useEffect, useState } from "react";

/** The part of a sprite at least half opaque, as fractions of its width and height. */
export type SpriteOpaqueBox = { left: number; right: number; top: number; bottom: number };

const boxes = new Map<string, SpriteOpaqueBox | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

function measure(url: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  const done = (box: SpriteOpaqueBox | null) => {
    boxes.set(url, box);
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
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (data[(y * width + x) * 4 + 3]! < 128) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      done(maxX < 0 ? null
        : { left: minX / width, right: (maxX + 1) / width, top: minY / height, bottom: (maxY + 1) / height });
    } catch {
      // A sprite the canvas may not read (another origin) has no measured box.
      done(null);
    }
  };
  image.onerror = () => done(null);
  image.src = url;
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
