import { Application } from "pixi.js";
import { BrowserPixiTextureDecoder } from "../../../backends/pixi/browserPixiTextureDecoder";
import { installPixiLinearOutput } from "../../../backends/pixi/pixiLinearColorPipeline";
import { PixiRendererBackend } from "../../../backends/pixi/pixiRendererBackend";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "../../support/resources/currentOrdinaryTestManifest";
import { ImmutableLocalRenderResourceProvider, PortableRenderResourcePreflightAdapter } from "../../../backends/resources/localResourceProvider";
import type { RenderResourceProfile } from "../../../backends/renderingContracts";
import { RenderCommandProducer } from "../../../engine/rendering/renderCommandProducer";
import { TapLaneEffectOwner } from "../../../engine/managers/tapLaneEffectOwner";
import { createSimulatorSceneLayout } from "../../../scene/simulatorSceneLayout";
import { readWebGlFramebufferRgba } from "../../support/platform/readWebGlFramebuffer";

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
  const linearOutput = installPixiLinearOutput(renderer.stage, WIDTH, HEIGHT);
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
  const maskOwners = renderer.stage.children.filter((node) => node.label === "tap-lane-effect-sprite-mask:MaskImage");
  const laneNodes = renderer.stage.children.filter((node) => node.label.startsWith("render:tap-lane-effect:"));
  const sharedMask = maskOwners[0];
  if (maskOwners.length !== 1 || laneNodes.length !== 13 || sharedMask === undefined ||
      laneNodes.some((node) => node.mask !== sharedMask) ||
      sharedMask.includeInBuild !== false || sharedMask.measurable !== false) {
    throw new Error(`Lane SpriteMask must be one non-color-build scene owner shared by thirteen consumers: ${JSON.stringify({
      maskOwners: maskOwners.length,
      laneNodes: laneNodes.length,
      sharedConsumers: sharedMask === undefined ? 0 : laneNodes.filter((node) => node.mask === sharedMask).length,
      includeInBuild: sharedMask?.includeInBuild,
      measurable: sharedMask?.measurable,
    })}`);
  }
  const sharedMaskConsumerCount = laneNodes.filter((node) => node.mask === sharedMask).length;
  const sharedMaskIncludedInOrdinaryDraw = sharedMask.includeInBuild;
  const center = activeRows.find((row) => row.renderObjectId === "render:tap-lane-effect:6");
  if (center === undefined || !center.visible || !center.spriteBindingKey?.endsWith("NoteLaneEffect_4")) {
    throw new Error("center recovered lane Sprite was not visible");
  }
  const ordered = [...activeRows].sort((left, right) => Number(left.renderObjectId.slice(left.renderObjectId.lastIndexOf(":") + 1)) -
    Number(right.renderObjectId.slice(right.renderObjectId.lastIndexOf(":") + 1)));
  const flips = ordered.map((row) => (row.spriteLocalScale?.[0] ?? 1) < 0);
  if (JSON.stringify(flips) !== JSON.stringify([false, false, false, false, false, false, false, false, true, true, true, true, true]) ||
      ordered.some((row) => row.spriteMaskInteraction !== "visible-outside" || row.spriteMaskBounds === null) ||
      activeRaster.nonBackgroundPixels <= 0 ||
      activeRaster.backgroundPixels < WIDTH * HEIGHT * 0.8 ||
      activeRaster.opaqueWhitePixels > WIDTH * HEIGHT * 0.05 ||
      activeRaster.sentinels.some((sample) => sample.rgba !== "081020ff")) {
    throw new Error(`Lane SpriteRenderer flip/mask/raster mismatch: ${JSON.stringify({ flips, ordered, activeRaster })}`);
  }
  const off = requireOk(owner.preflightInputEvents([{ buttonType: 3, kind: "animated-off" }]));
  if (off === null) throw new Error("animated off did not preflight");
  requireOk(off.commit());
  for (let frame = 0; frame < 5; frame += 1) {
    const advance = requireOk(owner.preflightAdvance(1 / 60));
    if (advance !== null) requireOk(advance.commit());
  }
  app.render();
  const halfFadeRaster = await capture(app);
  const halfFade = renderer.sceneSnapshot().find((row) => row.renderObjectId === "render:tap-lane-effect:6");
  if (halfFade?.spriteTint !== 0xFFFFFF || Math.abs(halfFade.alpha - 0.5) > 0.0001) {
    throw new Error(`Lane FadeOut must retain white RGB and fade alpha: ${JSON.stringify(halfFade)}`);
  }
  for (let frame = 0; frame < 6 && owner.snapshot().activeCount !== 0; frame += 1) {
    const advance = requireOk(owner.preflightAdvance(1 / 60));
    if (advance !== null) requireOk(advance.commit());
  }
  app.render();
  const disabledRaster = await capture(app);
  const disabled = owner.snapshot();
  if (disabled.activeCount !== 0) throw new Error("lane effect did not finish disabled");
  const release = requireOk(producer.preflightSessionRelease());
  requireOk(release.commit());
  linearOutput.dispose();
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
      halfFadeTint: halfFade.spriteTint,
      halfFadeAlpha: halfFade.alpha,
      resourceCount: resources.length,
      flipXSequence: flips,
      maskInteraction: center.spriteMaskInteraction,
      maskBounds: center.spriteMaskBounds,
      maskOwnerCount: maskOwners.length,
      maskConsumerCount: sharedMaskConsumerCount,
      maskIncludedInOrdinaryDraw: sharedMaskIncludedInOrdinaryDraw,
    },
    raster: { active: activeRaster, halfFade: halfFadeRaster, disabled: disabledRaster },
    cleanup: { rendererOwners: renderer.snapshot().objectCount, stageChildren: renderer.stage.children.length },
  });
  app.destroy(true, { children: true, texture: true, textureSource: true });
  window.ipc.postMessage(JSON.stringify(result));
}

async function capture(app: Application): Promise<{
  rgbaSha256: string;
  nonBackgroundPixels: number;
  backgroundPixels: number;
  opaqueWhitePixels: number;
  sentinels: readonly { readonly x: number; readonly y: number; readonly rgba: string }[];
}> {
  const bytes = readWebGlFramebufferRgba(app, WIDTH, HEIGHT);
  let nonBackgroundPixels = 0;
  let backgroundPixels = 0;
  let opaqueWhitePixels = 0;
  for (let offset = 0; offset < bytes.length; offset += 4) {
    const background = bytes[offset] === 8 && bytes[offset + 1] === 16 &&
      bytes[offset + 2] === 32 && bytes[offset + 3] === 255;
    if (background) backgroundPixels += 1;
    else nonBackgroundPixels += 1;
    if (bytes[offset]! >= 250 && bytes[offset + 1]! >= 250 &&
      bytes[offset + 2]! >= 250 && bytes[offset + 3] === 255) opaqueWhitePixels += 1;
  }
  const sentinels = Object.freeze([[10, 10], [10, HEIGHT - 11], [WIDTH - 11, 10], [WIDTH - 11, HEIGHT - 11]]
    .map(([x, y]) => {
      const offset = (y! * WIDTH + x!) * 4;
      return Object.freeze({
        x: x!, y: y!,
        rgba: [...bytes.slice(offset, offset + 4)].map((value) => value.toString(16).padStart(2, "0")).join(""),
      });
    }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Object.freeze({
    rgbaSha256: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""),
    nonBackgroundPixels,
    backgroundPixels,
    opaqueWhitePixels,
    sentinels,
  });
}
function requireOk(result: any): any {
  if (result.status !== "ok" && result.status !== "accepted") throw new Error(result.capability ?? result.failure?.capability);
  return result.value;
}
