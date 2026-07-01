import { Rectangle, Texture } from "pixi.js";
import embeddedRhythmGameUiUrl from "../assets/ui/RhythmGameUI.png";

export interface AtlasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const COMBO_NUMBER_DIGIT_WIDTH = 82;
export const COMBO_NUMBER_DIGIT_HEIGHT = 116;
export const COMBO_NUMBER_PADDING = -12;

// Source: HOST________/VSCode/bangdream-apk/reverse/analysis/targets/runtime-ui-binding-report.*
// and IconComboNumber NGUI atlas.
export const ICON_COMBO_NUMBER_NORMAL_DIGIT_RECTS: readonly AtlasRect[] = [
  { x: 336, y: 396, width: 82, height: 116 },
  { x: 168, y: 396, width: 82, height: 116 },
  { x: 84, y: 42, width: 82, height: 116 },
  { x: 84, y: 160, width: 82, height: 116 },
  { x: 84, y: 278, width: 82, height: 116 },
  { x: 84, y: 396, width: 82, height: 116 },
  { x: 0, y: 42, width: 82, height: 116 },
  { x: 0, y: 160, width: 82, height: 116 },
  { x: 0, y: 278, width: 82, height: 116 },
  { x: 252, y: 396, width: 82, height: 116 },
];

export const ICON_COMBO_NUMBER_AP_DIGIT_RECTS: readonly AtlasRect[] = [
  { x: 0, y: 396, width: 82, height: 116 },
  { x: 252, y: 160, width: 82, height: 116 },
  { x: 420, y: 278, width: 82, height: 116 },
  { x: 336, y: 278, width: 82, height: 116 },
  { x: 252, y: 278, width: 82, height: 116 },
  { x: 168, y: 42, width: 82, height: 116 },
  { x: 168, y: 160, width: 82, height: 116 },
  { x: 168, y: 278, width: 82, height: 116 },
  { x: 420, y: 396, width: 82, height: 116 },
  { x: 252, y: 42, width: 82, height: 116 },
];

export const ICON_COMBO_NUMBER_PLUS_RECT: AtlasRect = { x: 336, y: 160, width: 82, height: 116 };

// Source: RhythmGameUI Texture2D 923acbc2709f740bb8f9ccbd6fed5d52, NGUI sprite button_pause.
export const RHYTHM_GAME_UI_RECTS = {
  buttonPause: { x: 828, y: 319, width: 64, height: 64 },
} as const satisfies Record<string, AtlasRect>;

export function cropPixiAtlasTexture(source: Texture | null, rect: AtlasRect): Texture | null {
  if (!source || rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return new Texture({
    source: source.source,
    frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
  });
}

export function buildPixiAtlasTextureList(
  source: Texture | null,
  rects: readonly AtlasRect[],
): Array<Texture | null> {
  return rects.map((rect) => cropPixiAtlasTexture(source, rect));
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`image decode failed: ${url.slice(0, 96)}`));
    image.src = url;
  });
}

let rhythmGameUiDataUrlCache: Promise<Record<keyof typeof RHYTHM_GAME_UI_RECTS, string | null>> | null = null;

export async function loadRhythmGameUiSpriteDataUrls(): Promise<Record<keyof typeof RHYTHM_GAME_UI_RECTS, string | null>> {
  if (!rhythmGameUiDataUrlCache) {
    rhythmGameUiDataUrlCache = loadImageElement(embeddedRhythmGameUiUrl)
      .then((image) => {
        const output = {} as Record<keyof typeof RHYTHM_GAME_UI_RECTS, string | null>;
        for (const [key, rect] of Object.entries(RHYTHM_GAME_UI_RECTS) as Array<[keyof typeof RHYTHM_GAME_UI_RECTS, AtlasRect]>) {
          const canvas = document.createElement("canvas");
          canvas.width = rect.width;
          canvas.height = rect.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            output[key] = null;
            continue;
          }
          ctx.clearRect(0, 0, rect.width, rect.height);
          ctx.drawImage(
            image,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            0,
            0,
            rect.width,
            rect.height,
          );
          output[key] = canvas.toDataURL("image/png");
        }
        return output;
      })
      .catch(() => ({ buttonPause: null }));
  }
  return rhythmGameUiDataUrlCache;
}

export async function loadPauseButtonImageDataUrl(): Promise<string | null> {
  const sprites = await loadRhythmGameUiSpriteDataUrls();
  return sprites.buttonPause;
}
