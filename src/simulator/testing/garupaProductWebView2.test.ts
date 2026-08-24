import { Application } from "pixi.js";
import { BrowserPixiTextureDecoder } from "../backends/pixi/browserPixiTextureDecoder";
import { installPixiLinearOutput } from "../backends/pixi/pixiLinearColorPipeline";
import { PixiRendererBackend } from "../backends/pixi/pixiRendererBackend";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "./legacyCurrentOrdinaryResourceManifest";
import { ImmutableLocalRenderResourceProvider, PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import type { RenderResourceProfile } from "../backends/renderingContracts";
import { copyAndFreezeGarupaChartJson } from "../assembly/garupaChartContract";
import { constructChartFromGarupaChartJson } from "../assembly/garupaChartConstruction";
import { getGarupaProductChartProfile } from "../engine/garupa/productChartProfile";
import { getGarupaProductTimingGroupAxisProfile } from "../engine/garupa/timingGroupAxis";
import { GarupaProductRenderProducer } from "../engine/garupa/productRenderProducer";
import { createSimulatorSceneLayout } from "../scene/simulatorSceneLayout";
import { observePixiWorld } from "./pixiWorldObserver";
import { readWebGlFramebufferRgba } from "./readWebGlFramebuffer";

interface InputMap { readonly render: readonly { readonly logicalAssetId: string; readonly url: string }[]; }
const WIDTH = 1600;
const HEIGHT = 720;
const SESSION = "garupa-product-webview2";

void main().catch((error) => {
  globalThis.window.ipc.postMessage(JSON.stringify({
    schema: "garupa-product-webview2-v2",
    status: "error",
    message: String(error instanceof Error ? error.message : error),
    stack: String(error instanceof Error ? error.stack ?? "" : ""),
  }));
});

async function main(): Promise<void> {
  const [mapResponse, profileResponse] = await Promise.all([
    fetch("/input-map.json"),
    fetch("/render-profile.json"),
  ]);
  if (!mapResponse.ok || !profileResponse.ok) throw new Error("staged product input unavailable");
  const map = await mapResponse.json() as InputMap;
  const sourceProfile = await profileResponse.json() as RenderResourceProfile;
  const profile: RenderResourceProfile = Object.freeze({
    ...sourceProfile,
    assets: Object.freeze(sourceProfile.assets.map((asset) => asset.textureSettings === null
      ? asset
      : Object.freeze({
          ...asset,
          textureSettings: Object.freeze({ ...asset.textureSettings, premultiplyAlpha: false }),
        }))),
  });
  const renderResources = await Promise.all(map.render.map(async (row) => {
    const response = await fetch(row.url);
    if (!response.ok) throw new Error(`render resource unavailable ${row.logicalAssetId}`);
    return Object.freeze({ logicalAssetId: row.logicalAssetId, bytes: new Uint8Array(await response.arrayBuffer()) });
  }));
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(renderResources));
  const renderer = new PixiRendererBackend(new BrowserPixiTextureDecoder());
  requireOk(await renderer.prepare(SESSION, profile, provider, new PortableRenderResourcePreflightAdapter()));
  const app = new Application();
  await app.init({
    width: WIDTH, height: HEIGHT, preference: "webgl", antialias: false,
    autoDensity: false, resolution: 1, backgroundAlpha: 0,
    preserveDrawingBuffer: true, autoStart: false, sharedTicker: false,
  });
  document.body.appendChild(app.canvas);
  const linearOutput = installPixiLinearOutput(renderer.stage, WIDTH, HEIGHT);
  app.stage.addChild(renderer.stage);

  const copied = requireOk(copyAndFreezeGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "SV", beat: 2, value: -1, timingGroup: "#1" },
    { type: "SV", beat: 4, value: 0, timingGroup: "#1" },
    { type: "SV", beat: 6, value: 1, timingGroup: "#1" },
    { type: "Single", beat: 1, lane: 0.5, width: 2, timingGroup: "#1" },
    { type: "Directional", beat: 3, lane: 7, width: 3, direction: "Left", timingGroup: "#1" },
    { type: "Slide", timingGroup: "#1", connections: [
      { type: "Hidden", beat: 1, lane: -1, width: 1 },
      { type: "Flick", beat: 3, lane: 2.25, width: 2 },
      { type: "Skill", beat: 5, lane: 4.5, width: 1 },
      { type: "Hidden", beat: 7, lane: 7, width: 1 },
    ] },
    { type: "Slide", connections: [{ type: "Hidden", beat: 4, lane: 1, width: 1 }] },
  ]));
  const chart = requireOk(constructChartFromGarupaChartJson(copied.chart));
  const product = getGarupaProductChartProfile(chart)!;
  const axis = getGarupaProductTimingGroupAxisProfile(chart)!;
  const layout = requireOk(createSimulatorSceneLayout(
    { revision: 0, viewportWidth: WIDTH, viewportHeight: HEIGHT, safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(WIDTH), height: Math.fround(HEIGHT) }, origin: "bottom-left" },
    { specificSpeed: Math.fround(11), noteSize: Math.fround(100), judgementAdjustValueB: 0, habahiroMeshWidthSetting: Math.fround(1), syncLineEdgeMargin: Math.fround(0) },
    "ordinary", CURRENT_ORDINARY_RENDER_BINDINGS,
  ));
  requireOk(renderer.bindOriginalSurfaceLayout(layout.surfaceLayout));
  const producer = new GarupaProductRenderProducer(
    SESSION, renderer, CURRENT_ORDINARY_RENDER_BINDINGS, product, axis,
    layout.garupaProductScene, layout.ordinaryNoteScene.specificSpeed, true, true,
  );
  requireOk(producer.validate());
  const captures = [];
  for (const sample of [
    { label: "initial", position: 0, judged: [] as typeof product.visibleNodes },
    { label: "negative-sv", position: 96, judged: [product.visibleNodes[0]!] },
    { label: "zero-sv", position: 192, judged: [] as typeof product.visibleNodes },
    { label: "restore-positive", position: 288, judged: [] as typeof product.visibleNodes },
  ]) {
    const transaction = requireOk(producer.preflightFrame(sample.position, sample.judged));
    if (transaction !== null) requireOk(transaction.commit());
    app.render();
    captures.push(await capture(app, renderer, sample.label, sample.position));
  }
  const release = requireOk(producer.preflightDispose());
  if (release !== null) requireOk(release.commit());
  renderer.stage.removeFromParent();
  linearOutput.dispose();
  requireOk(renderer.dispose());
  const cleanup = Object.freeze({
    rendererState: renderer.snapshot().state,
    owners: renderer.snapshot().objectCount,
    rendererChildren: renderer.stage.children.length,
    applicationChildren: app.stage.children.length,
  });
  if (cleanup.rendererState !== "disposed" || cleanup.owners !== 0 ||
    cleanup.rendererChildren !== 0 || cleanup.applicationChildren !== 0) {
    throw new Error(`product browser cleanup mismatch ${JSON.stringify(cleanup)}`);
  }
  const gl = (app.renderer as unknown as { readonly gl?: WebGL2RenderingContext }).gl;
  const result = Object.freeze({
    schema: "garupa-product-webview2-v2",
    status: "ok",
    runtime: Object.freeze({
      userAgent: navigator.userAgent,
      pixiVersion: (await import("pixi.js")).VERSION,
      rendererName: app.renderer.name,
      webglVersion: gl?.getParameter(gl.VERSION) ?? null,
    }),
    productionDecoder: BrowserPixiTextureDecoder.name,
    chart: Object.freeze({
      referenceFieldLanes: layout.garupaProductScene.fieldLines.map((line) => line.lane),
      fieldLines: layout.garupaProductScene.fieldLines.length,
      visibleNodes: product.visibleNodes.length,
      slideChains: product.slideChains.length,
      sv: product.svEvents.length,
      groups: axis.groups.map((group) => [group.id, group.changes.length]),
    }),
    captures: Object.freeze(captures),
    cleanup,
    isolation: Object.freeze({
      resourceUrls: performance.getEntriesByType("resource").map((entry) => entry.name).sort(),
    }),
  });
  app.destroy(true, { children: true, texture: true, textureSource: true });
  globalThis.window.ipc.postMessage(JSON.stringify(result));
}

async function capture(
  app: Application,
  renderer: PixiRendererBackend,
  label: string,
  position: number,
) {
  const bytes = readWebGlFramebufferRgba(app, WIDTH, HEIGHT);
  let nonTransparentPixels = 0;
  for (let index = 3; index < bytes.length; index += 4) if (bytes[index] !== 0) nonTransparentPixels += 1;
  return Object.freeze({
    label,
    position,
    rgbaSha256: await sha256(bytes),
    nonTransparentPixels,
    world: observePixiWorld(renderer.stage),
    owners: renderer.snapshot().objectCount,
  });
}
async function sha256(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
}
function requireOk<T>(result: { readonly status: "ok"; readonly value: T } | { readonly status: "integrity-failure"; readonly boundary: string }): T {
  if (result.status !== "ok") throw new Error(result.boundary);
  return result.value;
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
