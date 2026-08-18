import {
  Application,
  Container,
  Rectangle,
  Sprite,
  Text,
} from "pixi.js";
import { BrowserPixiTextureDecoder } from "../backends/pixi/browserPixiTextureDecoder";
import { PixiRendererBackend } from "../backends/pixi/pixiRendererBackend";
import { createOriginalSurfaceLayout } from "../scene/originalSurfaceLayout";
import { parseCurrentScoreGaugeSsAnimationProfile } from "../backends/resources/currentScoreGaugeSsAnimationProfile";
import { CURRENT_SCORE_HUD_PORTABLE_RESOURCES } from "../backends/resources/currentScoreHudResourceManifest";
import {
  ImmutableLocalRenderResourceProvider,
  PortableRenderResourcePreflightAdapter,
} from "../backends/resources/localResourceProvider";
import type {
  RenderCommand,
  RenderResourceAssetProfile,
  RenderResourceProfile,
} from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";

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
  const scoreHud = await captureProductionScoreHud(app);

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
    raster: { pngOnly: pngRaster, fontOnly: fontRaster, scoreHud },
    isolation: {
      resourceUrls: performance.getEntriesByType("resource").map((entry) => entry.name).sort(),
    },
  };
  app.destroy(true, { children: true, texture: true, textureSource: true });
  globalThis.window.ipc.postMessage(JSON.stringify(result));
}

async function captureProductionScoreHud(app: Application): Promise<{
  readonly sha256: string;
  readonly nonTransparentPixels: number;
  readonly alphaBounds: readonly [number, number, number, number];
  readonly maskWorldTransform: readonly [number, number];
  readonly maskWorldBounds: readonly [number, number, number, number];
  readonly animationLayerWorldTransform: readonly [number, number];
  readonly firstDigitWorldTransform: readonly [number, number];
  readonly pngDataUrl: string;
}> {
  const baseProfile = await fetchJson<RenderResourceProfile>("/score-profile.json");
  const animation = parseCurrentScoreGaugeSsAnimationProfile(await fetchJson("/score-animation.json"));
  if (animation === null) throw new Error("committed ScoreGaugeSS profile did not parse in WebView2");
  const resources = await Promise.all(CURRENT_SCORE_HUD_PORTABLE_RESOURCES.map(async (row) => Object.freeze({
    logicalAssetId: row.profile.logicalAssetId,
    bytes: await fetchBytes(`/score-assets/${row.resourceKeySuffix}`),
  })));
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(resources));
  const profile: RenderResourceProfile = {
    ...baseProfile,
    packIdentity: `${baseProfile.packIdentity}+production-score-hud-webview2`,
    assets: Object.freeze(CURRENT_SCORE_HUD_PORTABLE_RESOURCES.map((row) => row.profile)),
    scoreGaugeSsAnimation: animation,
    ordinaryVisibleProfile: undefined,
  };
  const backend = new PixiRendererBackend(new BrowserPixiTextureDecoder());
  requireOk(await backend.prepare(
    "production-score-hud-webview2",
    profile,
    provider,
    new PortableRenderResourcePreflightAdapter(),
  ));
  requireOk(backend.bindOriginalSurfaceLayout(requireOk(createOriginalSurfaceLayout({
    revision: 0, viewportWidth: 1600, viewportHeight: 720,
    safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) },
    origin: "bottom-left",
  }, Math.fround(100)))));
  const commands: RenderCommand[] = [
    {
      sessionId: "production-score-hud-webview2", sequence: 0, frame: 0, substep: 0,
      kind: "create-object", renderObjectId: "hud:score", poolFamily: "score",
      role: "hud-score", parentObjectId: null,
    },
    {
      sessionId: "production-score-hud-webview2", sequence: 1, frame: 0, substep: 0,
      kind: "set-hud", renderObjectId: "hud:score", hudRole: "score",
      state: scoreState(9_000_000, 4, 5, true, "ScoreGaugeSS", true),
    },
    {
      sessionId: "production-score-hud-webview2", sequence: 2, frame: 0, substep: 0,
      kind: "activate-object", renderObjectId: "hud:score",
    },
    {
      sessionId: "production-score-hud-webview2", sequence: 3, frame: 0, substep: 0,
      kind: "play-animation", renderObjectId: "hud:score", animationRole: "score-gauge-ss", restart: true,
    },
    {
      sessionId: "production-score-hud-webview2", sequence: 4, frame: 0, substep: 0,
      kind: "sample-animation", renderObjectId: "hud:score", animationRole: "score-gauge-ss",
      elapsedSeconds: float32(0.5),
    },
  ];
  requireOk(backend.commit(requireOk(backend.preflight(commands))));

  app.renderer.resize(1600, 720);
  app.stage.addChild(backend.stage);
  app.render();
  const mask = findLabel(backend.stage, "score-high-rank-panel-mask");
  const layer = findLabel(backend.stage, "score-high-rank-animation-layer");
  const firstDigit = findLabel(backend.stage, "score-digit-0");
  if (mask === null || layer === null || firstDigit === null) {
    throw new Error("production Score HUD panel or digit owner is absent");
  }
  const bounds = mask.getLocalBounds();
  const maskWorldTransform = Object.freeze([mask.worldTransform.tx, mask.worldTransform.ty] as const);
  const maskWorldBounds = Object.freeze([
    mask.worldTransform.tx + bounds.minX,
    mask.worldTransform.ty + bounds.minY,
    mask.worldTransform.tx + bounds.maxX,
    mask.worldTransform.ty + bounds.maxY,
  ] as const);
  const animationLayerWorldTransform = Object.freeze([layer.worldTransform.tx, layer.worldTransform.ty] as const);
  const firstDigitWorldTransform = Object.freeze([firstDigit.worldTransform.tx, firstDigit.worldTransform.ty] as const);
  const frame = new Rectangle(320, 20, 560, 160);
  const output = app.renderer.extract.pixels({
    target: app.stage, frame, resolution: 1, clearColor: [0, 0, 0, 0],
  });
  const pixels = new Uint8Array(output.pixels.buffer, output.pixels.byteOffset, output.pixels.byteLength);
  const alpha = alphaObservation(pixels, frame.width, frame.height);
  const canvas = app.renderer.extract.canvas({ target: app.stage, frame, resolution: 1, clearColor: [0, 0, 0, 0] });
  const result = Object.freeze({
    sha256: await sha256(pixels),
    nonTransparentPixels: alpha.nonTransparentPixels,
    alphaBounds: alpha.bounds,
    maskWorldTransform,
    maskWorldBounds,
    animationLayerWorldTransform,
    firstDigitWorldTransform,
    pngDataUrl: (canvas as HTMLCanvasElement).toDataURL("image/png"),
  });
  requireOk(backend.dispose());
  app.stage.removeChild(backend.stage);
  return result;
}

function scoreState(
  score: number,
  beforeRank: number,
  rank: number,
  rankChanged: boolean,
  highRankEffect: "none" | "ScoreGaugeSS",
  highRankEffectActive: boolean,
) {
  const totalScoringUnitCount = 1000;
  const scoreMax = 10_000_000 + totalScoringUnitCount;
  const ratio = Math.fround(Math.fround(score) / Math.fround(scoreMax));
  const marker = (value: number) => float32(Math.fround(
    Math.fround(41) + Math.fround(
      Math.fround(Math.fround(value) * Math.fround(421)) / Math.fround(scoreMax),
    ),
  ));
  const digits = String(score);
  return Object.freeze({
    ruleSetId: "garupa-editor-normalized-10m-v1" as const,
    totalScoringUnitCount,
    score,
    scoreText: `[BEBEBE]${"0".repeat(Math.max(8 - digits.length, 0))}[-][FF3B72]${digits}[-]`,
    scoreMax, rank, beforeRank, rankChanged,
    meterKey: rank === 4 ? "score_meter_blue" : rank === 3 ? "score_meter_green" :
      rank === 2 ? "score_meter_orange" : rank === 1 ? "score_meter_pink" : "score_meter_s",
    ratio: float32(ratio), sliderValue: float32(Math.fround(Math.min(Math.max(ratio, 0), 1))),
    foregroundActive: ratio > 0,
    indicatorLocalX: ratio >= 1 ? 422 : Math.trunc(Math.fround(ratio * Math.fround(422))),
    rankMarkerCLocalX: marker(375_000), rankMarkerBLocalX: marker(2_250_000),
    rankMarkerALocalX: marker(4_500_000), rankMarkerSLocalX: marker(6_750_000),
    rankMarkerSSLocalX: marker(9_000_000), highRankEffect, highRankEffectActive,
  });
}

function float32(value: number) {
  return requireOk(createRenderFloat32(Math.fround(value)));
}

function findLabel(root: Container, label: string): Container | null {
  for (const child of root.children) {
    if (child.label === label) return child;
    const nested = findLabel(child, label);
    if (nested !== null) return nested;
  }
  return null;
}

function alphaObservation(bytes: Uint8Array, width: number, height: number): {
  readonly nonTransparentPixels: number;
  readonly bounds: readonly [number, number, number, number];
} {
  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (bytes[(y * width + x) * 4 + 3] === 0) continue;
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (count === 0) throw new Error("production Score HUD WebView2 raster is empty");
  return Object.freeze({ nonTransparentPixels: count, bounds: Object.freeze([minX, minY, maxX, maxY] as const) });
}

async function fetchJson<T = unknown>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store", credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`fixture fetch failed: ${path} ${response.status}`);
  return await response.json() as T;
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
