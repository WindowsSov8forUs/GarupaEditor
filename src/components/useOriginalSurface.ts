import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import common from "../data/uiCommonAtlas.json";
import menu from "../data/menuUiAtlas.json";
import chinese from "../data/originalChineseAtlases.json";
import drawing from "../data/originalUiDrawing.json";
import { useApplicationResourceUrl } from "../resources/applicationResourceContext";

export type OriginalAtlas = "common" | "menu";
const rows = { common: common.profile.atlasRows, menu: menu.atlasRows };
const chineseRows = { common: new Map(chinese.common.atlasRows.map(row => [row.exactKey, row])),
  menu: new Map(chinese.menu.atlasRows.map(row => [row.exactKey, row])) };
const atlasSlot = (atlas: OriginalAtlas, name: string) => chineseRows[atlas].has(name)
  ? atlas === "menu" ? "ui.menu-cn-atlas" : "ui.common-cn-atlas"
  : atlas === "menu" ? "ui.menu-atlas" : "ui.common-atlas";
export function originalSurfaceRow(atlas: OriginalAtlas, name: string) {
  const row = chineseRows[atlas].get(name) ?? rows[atlas].find(value => value.exactKey === name);
  if (!row) throw new Error(`Unknown original sprite ${atlas}/${name}`);
  // All 29 source Common atlas rows have zero padding; the portable catalog omits those zero fields.
  return "paddingLeft" in row ? row : { ...row, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 };
}
const images = new Map<string, HTMLImageElement | Promise<HTMLImageElement>>();
const sprites = new Map<string, string | Promise<string>>();
const MAX_SURFACE_CACHE_ENTRIES = 256;
const ratioListeners = new Set<() => void>();
let ratioMedia: MediaQueryList | null = null;
let ratioFrame = 0;
let observedRatio: number | null = null;
const pixelRatio = () => Math.max(1, window.devicePixelRatio);
function readAtlas(url: string): HTMLImageElement | Promise<HTMLImageElement> {
  let image = images.get(url);
  if (image === undefined) {
    const source = new Image(); source.src = url;
    image = source.decode().then(() => { images.set(url, source); return source; });
    images.set(url, image);
    void image.catch(() => images.delete(url));
  }
  return image;
}
function ratioChanged(): void {
  observedRatio = window.devicePixelRatio;
  ratioMedia?.removeEventListener("change", ratioChanged);
  // Native WebViews can expose a slightly different Float32 ratio than CSS resolution queries.
  const dpr = window.devicePixelRatio, tolerance = Math.max(1, dpr) * 0.000001;
  ratioMedia = window.matchMedia(`(min-resolution: ${dpr - tolerance}dppx) and (max-resolution: ${dpr + tolerance}dppx)`);
  ratioMedia.addEventListener("change", ratioChanged);
  ratioListeners.forEach(listener => listener());
}
// A single shared observer also covers embedded WebViews that omit resolution change events.
function observeRatio(): void {
  if (window.devicePixelRatio !== observedRatio) ratioChanged();
  if (ratioListeners.size) ratioFrame = requestAnimationFrame(observeRatio);
}
function subscribeRatio(listener: () => void): () => void {
  ratioListeners.add(listener);
  if (ratioListeners.size === 1) {
    window.addEventListener("resize", ratioChanged); ratioChanged();
    ratioFrame = requestAnimationFrame(observeRatio);
  }
  return () => {
    ratioListeners.delete(listener);
    if (!ratioListeners.size) {
      cancelAnimationFrame(ratioFrame); ratioFrame = 0; observedRatio = null;
      window.removeEventListener("resize", ratioChanged);
      ratioMedia?.removeEventListener("change", ratioChanged); ratioMedia = null;
    }
  };
}

function readSprite(url: string, atlas: OriginalAtlas, name: string, scale = 1, width?: number, height?: number, ratio = 1, scaleY = scale, fillCenter = true): string | Promise<string> {
  const key = `${url}:${atlas}:${name}:${scale}:${scaleY}:${width === undefined ? width : Math.round(width * ratio)}:${height === undefined ? height : Math.round(height * ratio)}:${ratio}:${fillCenter}`;
  let pending = sprites.get(key);
  if (pending === undefined) {
    const image = readAtlas(url);
    const rasterize = (source: HTMLImageElement): string => {
      const row = chineseRows[atlas].get(name) ?? rows[atlas].find(value => value.exactKey === name);
      if (!row) throw new Error(`Original UI sprite is not evidenced: ${atlas}/${name}`);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((width ?? row.width) * ratio)); canvas.height = Math.max(1, Math.round((height ?? row.height) * ratio));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Original UI needs a 2D atlas adapter.");
      if (width !== undefined && height !== undefined) drawNineSlice(context, source, row, canvas.width, canvas.height, scale * ratio, scaleY * ratio, fillCenter);
      else context.drawImage(source, row.x, row.y, row.width, row.height, 0, 0, row.width, row.height);
      return canvas.toDataURL();
    };
    // Once the atlas is decoded, geometry changes are synchronous, as with the
    // original sprite mesh update. Never hide a widget while resizing its raster.
    pending = image instanceof HTMLImageElement ? rasterize(image) : image.then(source => {
      const raster = rasterize(source);
      if (sprites.get(key) === pending) sprites.set(key, raster);
      return raster;
    });
    sprites.set(key, pending);
    // Continuous slider widths must not retain an unbounded set of derived rasters.
    while (sprites.size > MAX_SURFACE_CACHE_ENTRIES) sprites.delete(sprites.keys().next().value!);
    if (typeof pending !== "string") void pending.catch(() => { if (sprites.get(key) === pending) sprites.delete(key); });
  } else { sprites.delete(key); sprites.set(key, pending); }
  return pending;
}

/** NGUI sprite coordinates/borders, adapted to the host DOM; no replacement artwork. */
export function useOriginalSurface(name: string, scale = 0.75, atlas: OriginalAtlas = "menu", width?: number, height?: number, scaleY = scale, fillCenter = true): CSSProperties {
  const dpr = useSyncExternalStore(subscribeRatio, pixelRatio, () => 1);
  const ratio = width !== undefined && height !== undefined ? dpr : 1;
  const url = useApplicationResourceUrl(atlasSlot(atlas, name));
  const key = `${url}:${atlas}:${name}:${scale}:${scaleY}:${width === undefined ? width : Math.round(width * ratio)}:${height === undefined ? height : Math.round(height * ratio)}:${ratio}:${fillCenter}`;
  const [resolved, setResolved] = useState<{ key: string; image: string } | null>(null);
  const [error, setError] = useState<{ key: string; cause: Error } | null>(null);
  const surface = useMemo(() => readSprite(url, atlas, name, scale, width, height, ratio, scaleY, fillCenter), [key]);
  useEffect(() => {
    if (typeof surface === "string") return;
    let active = true;
    void surface.then(image => {
      if (active) setResolved({ key, image });
    }, cause => {
      if (active) setError({ key, cause: cause instanceof Error ? cause : new Error(String(cause)) });
    });
    return () => { active = false; };
  }, [surface, key]);
  if (error?.key === key) throw error.cause;
  const row = chineseRows[atlas].get(name) ?? rows[atlas].find(value => value.exactKey === name);
  if (!row) throw new Error(`Unknown original sprite ${atlas}/${name}`);
  const borders = [row.borderTop, row.borderRight, row.borderBottom, row.borderLeft];
  const raster = typeof surface === "string" ? surface : resolved?.key === key ? resolved.image : undefined;
  const image = raster === undefined ? undefined : `url("${raster}")`;
  const loaded: CSSProperties = { visibility: image ? undefined : "hidden" };
  return (width !== undefined && height !== undefined) || borders.every(value => value === 0)
    ? { ...loaded, backgroundImage: image, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }
    : { ...loaded, borderImageSource: image, borderImageSlice: `${borders.join(" ")}${fillCenter ? " fill" : ""}`,
        borderImageWidth: borders.map((value, index) => `${value * (index % 2 === 0 ? scaleY : scale)}px`).join(" "), borderImageRepeat: "stretch" };
}

/** Update an existing sprite surface before paint, without encoding/decoding a PNG per drag step. */
export function useOriginalCanvasSurface(canvas: RefObject<HTMLCanvasElement | null>, name: string,
  atlas: OriginalAtlas, width: number, height: number, scale: number, scaleY: number, spriteType = 1, fillCenter = true): boolean {
  const ratio = useSyncExternalStore(subscribeRatio, pixelRatio, () => 1);
  const url = useApplicationResourceUrl(atlasSlot(atlas, name));
  const [ready, setReady] = useState(false), [error, setError] = useState<Error | null>(null);
  useLayoutEffect(() => {
    let active = true;
    const paint = (image: HTMLImageElement) => {
      const target = canvas.current; if (!active || !target) return;
      const row = originalSurfaceRow(atlas, name);
      const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
      if (target.width !== w) target.width = w;
      if (target.height !== h) target.height = h;
      const context = target.getContext("2d");
      if (!context) throw new Error("Original UI needs a 2D atlas adapter.");
      context.clearRect(0, 0, w, h);
      if (spriteType === 2) {
        // TiledFill advances by inner UV extent plus atlas padding on EVERY tile.
        // Keep logical geometry independent of integer canvas backing dimensions.
        const sw = row.width - row.borderLeft - row.borderRight;
        const sh = row.height - row.borderTop - row.borderBottom;
        const px = drawing.atlasPixelSize, sx = scale * px, sy = scaleY * px;
        const tw = sw * sx, th = sh * sy;
        const pitchX = tw + (row.paddingLeft + row.paddingRight) * sx;
        const pitchY = th + (row.paddingBottom + row.paddingTop) * sy;
        if (sw * px >= 2 && sh * px >= 2 && tw > 0 && th > 0) {
          context.save();
          context.scale(w / width, h / height);
          for (let bottom = height - row.paddingBottom * sy; bottom > 0; bottom -= pitchY)
            for (let left = row.paddingLeft * sx; left < width; left += pitchX) {
            const dw = Math.min(tw, width - left), dh = Math.min(th, bottom);
            context.drawImage(image, row.x + row.borderLeft, row.y + row.borderTop + sh * (1 - dh / th),
              sw * dw / tw, sh * dh / th, left, bottom - dh, dw, dh);
          }
          context.restore();
        }
      } else if (spriteType === 0) {
        context.drawImage(image, row.x, row.y, row.width, row.height, 0, 0, w, h);
      } else drawNineSlice(context, image, row, w, h, scale * ratio, scaleY * ratio, fillCenter);
      setReady(true);
    };
    const image = readAtlas(url);
    if (image instanceof HTMLImageElement) paint(image);
    else void image.then(paint).catch(cause => { if (active) setError(cause instanceof Error ? cause : new Error(String(cause))); });
    return () => { active = false; };
  }, [canvas, url, name, atlas, width, height, scale, scaleY, ratio, spriteType, fillCenter]);
  if (error) throw error;
  return ready;
}

/** Rasterize contiguous slice boundaries before viewport scaling, avoiding DOM border-image seams. */
function drawNineSlice(context: CanvasRenderingContext2D, image: HTMLImageElement,
  row: { x: number; y: number; width: number; height: number; borderLeft: number; borderRight: number; borderTop: number; borderBottom: number },
  width: number, height: number, scale: number, scaleY: number, fillCenter = true): void {
  // SlicedFill delegates to SimpleFill when all four borders are zero.
  if (row.borderLeft === 0 && row.borderRight === 0 && row.borderTop === 0 && row.borderBottom === 0) {
    context.drawImage(image, row.x, row.y, row.width, row.height, 0, 0, width, height);
    return;
  }
  const sourceX = [0, row.borderLeft, row.width - row.borderRight, row.width];
  const sourceY = [0, row.borderTop, row.height - row.borderBottom, row.height];
  const horizontal = scale, vertical = scaleY;
  const targetX = [0, Math.round(row.borderLeft * horizontal), width - Math.round(row.borderRight * horizontal), width];
  const targetY = [0, Math.round(row.borderTop * vertical), height - Math.round(row.borderBottom * vertical), height];
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) {
    // UIBasicSprite.SlicedFill (0x303e744): Invisible center skips the middle quad.
    if (!fillCenter && x === 1 && y === 1) continue;
    const sw = sourceX[x + 1]! - sourceX[x]!, sh = sourceY[y + 1]! - sourceY[y]!;
    const dw = targetX[x + 1]! - targetX[x]!, dh = targetY[y + 1]! - targetY[y]!;
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) continue;
    context.drawImage(image, row.x + sourceX[x]!, row.y + sourceY[y]!, sw, sh,
      targetX[x]!, targetY[y]!, dw, dh);
  }
}
