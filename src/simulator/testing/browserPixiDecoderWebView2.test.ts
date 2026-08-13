import {
  Application,
  Container,
  Rectangle,
  Sprite,
  Text,
} from "pixi.js";
import { BrowserPixiTextureDecoder } from "../backends/pixi/browserPixiTextureDecoder";
import type { RenderResourceAssetProfile } from "../backends/renderingContracts";

const WIDTH = 128;
const HEIGHT = 96;
const TEXT = "SS 864000";
const PNG_SHA = "7CFEC4DABC83BC20E79E21D6AEB13CD9FA77ABE499E5E088A60C41014B96F6B6";
const FONT_SHA = "949356BBFEA78FB5BC3BA1610E1C64235FCCB9FD9A6F166A996715706FBFCE56";

void main().catch((error) => {
  globalThis.window.ipc.postMessage(JSON.stringify({
    schema: "garupa-production-browser-decoder-webview2-v1",
    status: "error",
    message: String(error instanceof Error ? error.message : error),
    stack: String(error instanceof Error ? error.stack ?? "" : ""),
    userAgent: navigator.userAgent,
  }));
});

async function main(): Promise<void> {
  const decoder = new BrowserPixiTextureDecoder();
  const [pngBytes, fontBytes] = await Promise.all([
    fetchBytes("/texture.png"),
    fetchBytes("/font.ttf"),
  ]);
  equal((await sha256(pngBytes)).toUpperCase(), PNG_SHA, "PNG browser input hash");
  equal((await sha256(fontBytes)).toUpperCase(), FONT_SHA, "font browser input hash");
  const pngAsset = asset("hud/score/rhythm-game-ui-atlas", "png", pngBytes.length, PNG_SHA, 1024, 1024);
  const fontAsset = asset("hud/score/rank-label-font", "font", fontBytes.length, FONT_SHA);
  const font = requireOk(await decoder.decodeFont(fontAsset, fontBytes));
  const texture = requireOk(await decoder.decodePng(pngAsset, pngBytes));
  equal(texture.source.resource?.constructor?.name, "ImageBitmap", "production decoder ImageBitmap resource");
  equal(texture.width, 1024, "production decoder PNG width");
  equal(texture.height, 1024, "production decoder PNG height");
  equal(document.fonts.check(`32px '${font.family}'`, TEXT), true, "production decoder FontFace family registered");

  const fallbackCanvas = document.createElement("canvas");
  const fallbackContext = fallbackCanvas.getContext("2d");
  if (fallbackContext === null) throw new Error("missing Canvas2D fallback context");
  fallbackContext.font = `32px '${font.family}-absent'`;
  const fallbackMetrics = metrics(fallbackContext.measureText(TEXT));
  fallbackContext.font = `32px '${font.family}'`;
  const loadedMetrics = metrics(fallbackContext.measureText(TEXT));
  if (JSON.stringify(fallbackMetrics) === JSON.stringify(loadedMetrics)) {
    throw new Error("production decoded font used absent-family fallback metrics");
  }

  const app = new Application();
  await app.init({
    width: WIDTH,
    height: HEIGHT,
    preference: "webgl",
    antialias: false,
    autoDensity: false,
    resolution: 1,
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
    autoStart: false,
    sharedTicker: false,
  });
  document.body.appendChild(app.canvas);

  const pngStage = new Container();
  const pngSprite = new Sprite(texture);
  pngSprite.scale.set(0.125);
  pngStage.addChild(pngSprite);
  const pngRaster = await extract(app, pngStage);

  const fontStage = new Container();
  const rankText = new Text({
    text: TEXT,
    style: {
      fontFamily: font.family,
      fontSize: 25,
      fontWeight: "normal",
      fill: 0xffffff,
      stroke: { color: 0x24124f, width: 2 },
    },
  });
  rankText.position.set(2, 28);
  fontStage.addChild(rankText);
  const fontRaster = await extract(app, fontStage);
  if (pngRaster.nonTransparentPixels <= 0 || fontRaster.nonTransparentPixels <= 0 ||
      pngRaster.sha256 === fontRaster.sha256) {
    throw new Error("production decoder actual Pixi raster cases are empty or aliased");
  }

  const source = texture.source;
  texture.destroy(true);
  const resourceAfterDestroy = source.resource;
  font.dispose();
  equal(
    Array.from(document.fonts).some((face) => face.family === font.family),
    false,
    "production decoder FontFace disposal",
  );

  const highEntropy = navigator.userAgentData?.getHighEntropyValues === undefined
    ? null
    : await navigator.userAgentData.getHighEntropyValues(["fullVersionList"]);
  const gl = (app.renderer as unknown as { readonly gl?: WebGL2RenderingContext }).gl;
  const result = {
    schema: "garupa-production-browser-decoder-webview2-v1",
    status: "ok",
    runtime: {
      userAgent: navigator.userAgent,
      highEntropy,
      pixiVersion: (await import("pixi.js")).VERSION,
      rendererName: app.renderer.name,
      webglVersion: gl?.getParameter(gl.VERSION) ?? null,
    },
    productionDecoder: {
      className: decoder.constructor.name,
      fontFamily: font.family,
      fontFaceLoaded: true,
      documentFontsDeleted: !Array.from(document.fonts).some((face) => face.family === font.family),
      fallbackMetrics,
      loadedMetrics,
      textureResourceType: "ImageBitmap",
      textureDimensions: [1024, 1024],
      textureResourceAfterDestroy: resourceAfterDestroy == null ? null : resourceAfterDestroy.constructor?.name ?? "unknown",
    },
    raster: { pngOnly: pngRaster, fontOnly: fontRaster },
    isolation: {
      resourceUrls: performance.getEntriesByType("resource").map((entry) => entry.name).sort(),
    },
  };
  app.destroy(true, { children: true, texture: true, textureSource: true });
  globalThis.window.ipc.postMessage(JSON.stringify(result));
}

function asset(
  logicalAssetId: string,
  kind: "png" | "font",
  byteLength: number,
  sha256Value: string,
  width?: number,
  height?: number,
): RenderResourceAssetProfile {
  return Object.freeze({
    logicalAssetId,
    role: kind === "font" ? "font" : "hud-atlas",
    byteLength,
    sha256: sha256Value,
    mime: kind === "font" ? "font/ttf" : "image/png",
    width: width ?? null,
    height: height ?? null,
    textureSettings: kind === "png" ? Object.freeze({
      scaleMode: "linear" as const,
      wrapModeU: "clamp" as const,
      wrapModeV: "clamp" as const,
      mipmap: "off" as const,
      premultiplyAlpha: true,
      blendMode: "normal" as const,
    }) : null,
    atlasRows: Object.freeze([]),
    materialRole: kind === "font" ? "none" : "hud",
    animationRole: "none",
    provenance: "current-device-cache",
  });
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(path, { cache: "no-store", credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`fixture fetch failed: ${path} ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function extract(app: Application, target: Container): Promise<{
  readonly sha256: string;
  readonly nonTransparentPixels: number;
}> {
  const output = app.renderer.extract.pixels({
    target,
    frame: new Rectangle(0, 0, WIDTH, HEIGHT),
    resolution: 1,
    clearColor: [0, 0, 0, 0],
  });
  const bytes = new Uint8Array(output.pixels.buffer, output.pixels.byteOffset, output.pixels.byteLength);
  let nonTransparentPixels = 0;
  for (let index = 3; index < bytes.length; index += 4) if (bytes[index] !== 0) nonTransparentPixels += 1;
  return Object.freeze({ sha256: await sha256(bytes), nonTransparentPixels });
}

function metrics(value: TextMetrics) {
  return Object.freeze({
    width: value.width,
    actualBoundingBoxLeft: value.actualBoundingBoxLeft,
    actualBoundingBoxRight: value.actualBoundingBoxRight,
    actualBoundingBoxAscent: value.actualBoundingBoxAscent,
    actualBoundingBoxDescent: value.actualBoundingBoxDescent,
  });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireOk<T>(result: { readonly status: "ok"; readonly value: T } | { readonly status: "evidence-required"; readonly capability: string; readonly boundary: string }): T {
  if (result.status !== "ok") throw new Error(`${result.capability}: ${result.boundary}`);
  return result.value;
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected)) throw new Error(`${label}: ${String(actual)} !== ${String(expected)}`);
}

declare global {
  interface Navigator {
    readonly userAgentData?: {
      readonly getHighEntropyValues?: (hints: readonly string[]) => Promise<unknown>;
    };
  }
  interface Window {
    readonly ipc: { postMessage(value: string): void };
  }
}
