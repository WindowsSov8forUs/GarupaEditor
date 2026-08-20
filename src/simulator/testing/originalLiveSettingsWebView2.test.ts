import { Application } from "pixi.js";
import { BrowserPixiTextureDecoder } from "../backends/pixi/browserPixiTextureDecoder";
import { PixiRendererBackend } from "../backends/pixi/pixiRendererBackend";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "../backends/resources/currentOrdinaryResourceManifest";
import { ImmutableLocalRenderResourceProvider, PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import type { RenderResourceProfile } from "../backends/renderingContracts";
import { RenderCommandProducer } from "../engine/rendering/renderCommandProducer";
import { TapLaneEffectOwner } from "../engine/managers/tapLaneEffectOwner";
import { createSimulatorSceneLayout } from "../scene/simulatorSceneLayout";

interface InputMap { readonly render: readonly { readonly logicalAssetId: string; readonly url: string }[]; }
const WIDTH = 1600;
const HEIGHT = 720;
const SESSION = "original-live-settings-webview2";

void main().catch((error) => window.ipc.postMessage(JSON.stringify({
  schema: "garupa-original-live-settings-webview2-v1",
  status: "error",
  message: String(error instanceof Error ? error.message : error),
  stack: String(error instanceof Error ? error.stack ?? "" : ""),
})));

async function main(): Promise<void> {
  const [mapResponse, profileResponse] = await Promise.all([
    fetch("/input-map.json"),
    fetch("/render-profile.json"),
  ]);
  if (!mapResponse.ok || !profileResponse.ok) throw new Error("staged settings input unavailable");
  const map = await mapResponse.json() as InputMap;
  const profile = await profileResponse.json() as RenderResourceProfile;
  const resources = await Promise.all(map.render.map(async (row) => {
    const response = await fetch(row.url);
    if (!response.ok) throw new Error(`render resource unavailable ${row.logicalAssetId}`);
    return Object.freeze({ logicalAssetId: row.logicalAssetId, bytes: new Uint8Array(await response.arrayBuffer()) });
  }));
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(resources));
  const renderer = new PixiRendererBackend(new BrowserPixiTextureDecoder());
  requireOk(await renderer.prepare(SESSION, profile, provider, new PortableRenderResourcePreflightAdapter()));
  const app = new Application();
  await app.init({
    width: WIDTH, height: HEIGHT, preference: "webgl", antialias: false,
    resolution: 1, background: 0x081020, backgroundAlpha: 1,
    preserveDrawingBuffer: true, autoStart: false, sharedTicker: false,
  });
  document.body.appendChild(app.canvas);
  app.stage.addChild(renderer.stage);
  const layout = requireOk(createSimulatorSceneLayout(
    { revision: 0, viewportWidth: WIDTH, viewportHeight: HEIGHT,
      safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(WIDTH), height: Math.fround(HEIGHT) }, origin: "bottom-left" },
    { specificSpeed: Math.fround(11), noteSize: Math.fround(100), judgementAdjustValueB: 0,
      habahiroMeshWidthSetting: Math.fround(1), syncLineEdgeMargin: Math.fround(0) },
    "ordinary", CURRENT_ORDINARY_RENDER_BINDINGS,
  ));
  requireOk(renderer.bindOriginalSurfaceLayout(layout.surfaceLayout));
  const producer = new RenderCommandProducer(SESSION, renderer, CURRENT_ORDINARY_RENDER_BINDINGS);
  requireOk(producer.validate());
  const owner = new TapLaneEffectOwner(producer, layout.ordinaryNoteScene, true);
  requireOk(requireOk(owner.preflightInitialize()).commit());
  const initialized = owner.snapshot();
  const on = requireOk(owner.preflightInputEvents([{ buttonType: 3, kind: "on" }]));
  if (on === null) throw new Error("visible lane effect did not preflight");
  requireOk(on.commit());
  app.render();
  const activeRaster = await capture(app);
  const activeRows = renderer.sceneSnapshot().filter((row) => row.role === "tap-lane-effect");
  const center = activeRows.find((row) => row.renderObjectId === "render:tap-lane-effect:6");
  if (center === undefined || !center.visible || !center.spriteBindingKey?.endsWith("NoteLaneEffect_4")) {
    throw new Error("center recovered lane Sprite was not visible");
  }
  const off = requireOk(owner.preflightInputEvents([{ buttonType: 3, kind: "animated-off" }]));
  if (off === null) throw new Error("animated off did not preflight");
  requireOk(off.commit());
  for (let frame = 0; frame < 10; frame += 1) {
    const advance = requireOk(owner.preflightAdvance());
    if (advance !== null) requireOk(advance.commit());
  }
  app.render();
  const disabledRaster = await capture(app);
  const disabled = owner.snapshot();
  if (disabled.activeCount !== 0) throw new Error("lane effect did not finish disabled");
  const release = requireOk(producer.preflightSessionRelease());
  requireOk(release.commit());
  requireOk(renderer.dispose());
  const result = Object.freeze({
    schema: "garupa-original-live-settings-webview2-v1",
    status: "ok",
    runtime: { userAgent: navigator.userAgent, pixiVersion: (await import("pixi.js")).VERSION, rendererName: app.renderer.name },
    owner: {
      initializedSlots: initialized.slots.length,
      activeBinding: center.spriteBindingKey,
      activeCount: 1,
      disabledCount: disabled.activeCount,
      resourceCount: resources.length,
    },
    raster: { active: activeRaster, disabled: disabledRaster },
    cleanup: { rendererOwners: renderer.snapshot().objectCount, stageChildren: renderer.stage.children.length },
  });
  app.destroy(true, { children: true, texture: true, textureSource: true });
  window.ipc.postMessage(JSON.stringify(result));
}

async function capture(app: Application): Promise<{ rgbaSha256: string; nonBackgroundPixels: number }> {
  const pixels = app.renderer.extract.pixels({ target: app.stage });
  const bytes = pixels.pixels;
  let nonBackgroundPixels = 0;
  for (let offset = 0; offset < bytes.length; offset += 4) {
    if (bytes[offset] !== 8 || bytes[offset + 1] !== 16 || bytes[offset + 2] !== 32 || bytes[offset + 3] !== 255) nonBackgroundPixels += 1;
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Object.freeze({
    rgbaSha256: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""),
    nonBackgroundPixels,
  });
}
function requireOk(result: any): any {
  if (result.status !== "ok" && result.status !== "accepted") throw new Error(result.capability ?? result.failure?.capability);
  return result.value;
}
