import { Application, Rectangle, Sprite, Texture } from "pixi.js";
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
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
import { LIVE_AUTO_MODE } from "./modeFixtures";
import { createSimulatorSceneLayout } from "../scene/simulatorSceneLayout";
import { observePixiWorld } from "./pixiWorldObserver";
import { readWebGlFramebufferRgba } from "./readWebGlFramebuffer";

interface InputMap {
  readonly render: readonly { readonly logicalAssetId: string; readonly url: string }[];
  readonly visualFifthContractUrl: string;
  readonly fiveVisualCorrectionUrl: string;
  readonly particleLaneSlideCorrectionUrl: string;
}
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
  const [contractResponse, correctionResponse] = await Promise.all([
    fetch(map.visualFifthContractUrl),
    fetch(map.particleLaneSlideCorrectionUrl),
  ]);
  if (!contractResponse.ok || !correctionResponse.ok) throw new Error("staged visual correction contracts unavailable");
  const visualFifth = await contractResponse.json() as any;
  const particleLaneSlideCorrection = await correctionResponse.json() as any;
  if (visualFifth.note_mesh.product_compatible_width1_must_include_screen_width_adjust_rate !== true) {
    throw new Error("fifth Reverse width contract mismatch");
  }
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
    // SVL-R02/R03 same-state chain: head lane 0 intentionally differs from
    // first current lane 1, then crosses lane 3 before terminal lane 2.
    { type: "Slide", connections: [
      { type: "Single", beat: 8, lane: 0, width: 1 },
      { type: "Single", beat: 8.25, lane: 1, width: 1 },
      { type: "Single", beat: 8.5, lane: 3, width: 1 },
      { type: "Flick", beat: 8.75, lane: 2, width: 1 },
    ] },
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
  const maximumSlideSectionWidth = 2 *
    (layout.ordinaryNoteScene.noteSettingScale.value + 0.01) * 2 *
    layout.garupaProductScene.screenToSafeAreaRatio.value *
    layout.surfaceLayout.camera.pixelsPerWorldUnit;
  const captures = [];
  for (const sample of [
    { label: "initial", position: 0, judged: [] as typeof product.visibleNodes },
    { label: "negative-sv", position: 96, judged: [product.visibleNodes[0]!] },
    { label: "zero-sv", position: 192, judged: [] as typeof product.visibleNodes },
    { label: "restore-positive", position: 288, judged: [] as typeof product.visibleNodes },
  ]) {
    const transaction = requireOk(producer.preflightFrame(
      sample.position,
      sample.judged,
      Math.fround(1 / 60),
    ));
    if (transaction !== null) requireOk(transaction.commit());
    app.render();
    captures.push(await capture(
      app,
      renderer,
      sample.label,
      sample.position,
      maximumSlideSectionWidth,
    ));
  }
  const slideLifecycle = await verifySlideFlashSameState(
    app,
    renderer,
    producer,
    product,
    profile,
  );
  const release = requireOk(producer.preflightDispose());
  if (release !== null) requireOk(release.commit());
  renderer.stage.removeFromParent();
  linearOutput.dispose();
  requireOk(renderer.dispose());
  const laneEffect = await verifyProductLaneEffect(app, profile, renderResources, particleLaneSlideCorrection);
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
    slideLifecycle,
    laneEffect,
    cleanup,
    isolation: Object.freeze({
      resourceUrls: performance.getEntriesByType("resource").map((entry) => entry.name).sort(),
    }),
  });
  app.destroy(true, { children: true, texture: true, textureSource: true });
  globalThis.window.ipc.postMessage(JSON.stringify(result));
}

async function verifySlideFlashSameState(
  app: Application,
  renderer: PixiRendererBackend,
  producer: GarupaProductRenderProducer,
  product: NonNullable<ReturnType<typeof getGarupaProductChartProfile>>,
  profile: RenderResourceProfile,
) {
  const chain = product.slideChains.find((candidate) => candidate.chartItemIndex === 8);
  if (chain === undefined || chain.visibleConnectionIdentities.length !== 4) {
    throw new Error("SVL-R02 fixed Slide chain is absent");
  }
  const nodes = chain.visibleConnectionIdentities.map((identity) => product.nodeByIdentity.get(identity)!);
  const [head, firstCurrent, secondCurrent, terminal] = nodes;
  if (head === undefined || firstCurrent === undefined || secondCurrent === undefined || terminal === undefined ||
      head.spanStart !== 0 || firstCurrent.spanStart !== 1 || secondCurrent.spanStart !== 3 || terminal.spanStart !== 2) {
    throw new Error(`SVL-R02 fixed Slide tuple mismatch: ${JSON.stringify(nodes.map((node) => [node?.identity, node?.spanStart]))}`);
  }
  const commitFrame = (position: number, judged: readonly (typeof nodes)[number][]): void => {
    const transaction = requireOk(producer.preflightFrame(position, judged, Math.fround(1 / 60)));
    if (transaction !== null) requireOk(transaction.commit());
  };
  commitFrame(head.absolutePosition, [head]);
  app.render();
  const flashId = `render:garupa:slide-flash:${chain.identity}`;
  const accepted = renderer.sceneSnapshot().find((row) => row.renderObjectId === flashId);
  const sprite = renderer.stage.getChildByLabel(`${flashId}:sprite`, true);
  if (accepted === undefined || !(sprite instanceof Sprite) ||
      accepted.spriteBindingKey?.endsWith("note_long_flash_1") !== true || !accepted.visible) {
    throw new Error(`SVL-R02 first-current Flash production tuple mismatch: ${JSON.stringify(accepted)}`);
  }
  const acceptedFramebuffer = await captureDisplayObjectFramebuffer(app, sprite);
  const noteAtlas = profile.assets.find((asset) => asset.logicalAssetId === CURRENT_ORDINARY_RENDER_BINDINGS.noteAtlasLogicalAssetId);
  const rejectedRow = noteAtlas?.atlasRows.find((row) => row.exactKey === "note_long_flash_0");
  if (rejectedRow === undefined) throw new Error("SVL-R02 rejected head-resource atlas row is absent");
  const acceptedTexture = sprite.texture;
  const rejectedTexture = new Texture({
    source: acceptedTexture.source,
    frame: new Rectangle(rejectedRow.x, rejectedRow.y, rejectedRow.width, rejectedRow.height),
    orig: new Rectangle(0, 0, rejectedRow.width, rejectedRow.height),
    label: "svl-r02-rejected-head-resource",
  });
  sprite.texture = rejectedTexture;
  app.render();
  const rejectedHeadFramebuffer = await captureDisplayObjectFramebuffer(app, sprite);
  sprite.texture = acceptedTexture;
  rejectedTexture.destroy(false);
  if (acceptedFramebuffer.sha256 === rejectedHeadFramebuffer.sha256 ||
      acceptedFramebuffer.nonTransparentPixels <= 0 || rejectedHeadFramebuffer.nonTransparentPixels <= 0) {
    throw new Error(`SVL-R02 framebuffer did not reject the head resource: ${JSON.stringify({ acceptedFramebuffer, rejectedHeadFramebuffer })}`);
  }

  const firstPosition = accepted.position;
  commitFrame(firstCurrent.absolutePosition, [firstCurrent]);
  app.render();
  const movedOnce = renderer.sceneSnapshot().find((row) => row.renderObjectId === flashId);
  commitFrame(secondCurrent.absolutePosition, [secondCurrent]);
  app.render();
  const movedTwice = renderer.sceneSnapshot().find((row) => row.renderObjectId === flashId);
  if (movedOnce === undefined || movedTwice === undefined ||
      movedOnce.spriteBindingKey !== accepted.spriteBindingKey || movedTwice.spriteBindingKey !== accepted.spriteBindingKey ||
      JSON.stringify(firstPosition) === JSON.stringify(movedOnce.position) ||
      JSON.stringify(movedOnce.position) === JSON.stringify(movedTwice.position)) {
    throw new Error(`SVL-R02 stable owner did not move through two current nodes: ${JSON.stringify({ accepted, movedOnce, movedTwice })}`);
  }
  commitFrame(terminal.absolutePosition, [terminal]);
  app.render();
  const stopped = renderer.sceneSnapshot().find((row) => row.renderObjectId === flashId);
  if (stopped?.visible !== false) throw new Error(`SVL-R02 terminal Flash remained visible: ${JSON.stringify(stopped)}`);
  return Object.freeze({
    chainIdentity: chain.identity,
    headIdentity: head.identity,
    firstCurrentIdentity: firstCurrent.identity,
    secondCurrentIdentity: secondCurrent.identity,
    terminalIdentity: terminal.identity,
    stableOwnerId: flashId,
    exactKey: "note_long_flash_1",
    positions: Object.freeze([firstPosition, movedOnce.position, movedTwice.position]),
    acceptedFramebuffer,
    rejectedHeadFramebuffer,
    terminalVisible: false,
  });
}

async function captureDisplayObjectFramebuffer(app: Application, object: Sprite) {
  const bounds = object.getBounds();
  const x = Math.max(0, Math.floor(bounds.x) - 2);
  const y = Math.max(0, Math.floor(bounds.y) - 2);
  const right = Math.min(WIDTH, Math.ceil(bounds.x + bounds.width) + 2);
  const bottom = Math.min(HEIGHT, Math.ceil(bounds.y + bounds.height) + 2);
  if (right <= x || bottom <= y) throw new Error(`SVL-R02 Flash bounds are outside the framebuffer: ${JSON.stringify(bounds)}`);
  const rgba = readWebGlFramebufferRgba(app, WIDTH, HEIGHT);
  const cropped = cropRgba(rgba, WIDTH, x, y, right - x, bottom - y);
  let nonTransparentPixels = 0;
  for (let index = 3; index < cropped.length; index += 4) if (cropped[index] !== 0) nonTransparentPixels += 1;
  return Object.freeze({ sha256: await sha256(cropped), nonTransparentPixels, bounds: Object.freeze([x, y, right - x, bottom - y]) });
}

async function verifyProductLaneEffect(
  app: Application,
  profile: RenderResourceProfile,
  renderResources: readonly { readonly logicalAssetId: string; readonly bytes: Uint8Array }[],
  correction: any,
) {
  const sessionId = `${SESSION}:integer-lane-effect`;
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(renderResources));
  const renderer = new PixiRendererBackend(new BrowserPixiTextureDecoder());
  requireOk(await renderer.prepare(sessionId, profile, provider, new PortableRenderResourcePreflightAdapter()));
  const layout = requireOk(createSimulatorSceneLayout(
    { revision: 0, viewportWidth: WIDTH, viewportHeight: HEIGHT, safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(WIDTH), height: Math.fround(HEIGHT) }, origin: "bottom-left" },
    { specificSpeed: Math.fround(11), noteSize: Math.fround(100), judgementAdjustValueB: 0, habahiroMeshWidthSetting: Math.fround(1), syncLineEdgeMargin: Math.fround(0) },
    "ordinary",
    CURRENT_ORDINARY_RENDER_BINDINGS,
  ));
  requireOk(renderer.bindOriginalSurfaceLayout(layout.surfaceLayout));
  const chart = requireOk(constructChartFromGarupaChartJson(requireOk(copyAndFreezeGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "Single", beat: 1, lane: 3, width: 1 },
    { type: "SV", beat: 10, value: -1 },
  ])).chart));
  const engine = requireOk(createSimulatorEngine({
    chart,
    runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode: LIVE_AUTO_MODE },
    rendering: {
      sessionId,
      resources: CURRENT_ORDINARY_RENDER_BINDINGS,
      ordinaryNoteScene: layout.ordinaryNoteScene,
      garupaProductScene: layout.garupaProductScene,
    },
  }, createRecordingSimulatorBackends(renderer)));
  app.stage.addChild(renderer.stage);
  const linear = installPixiLinearOutput(renderer.stage, WIDTH, HEIGHT);
  requireOk(engine.initialize());
  let lane: ReturnType<PixiRendererBackend["sceneSnapshot"]>[number] | undefined;
  for (let frame = 0; frame < 120 && lane === undefined; frame += 1) {
    requireOk(engine.step(Math.fround(1 / 60)));
    lane = renderer.sceneSnapshot().find((row) =>
      row.renderObjectId === "render:tap-lane-effect:6" && row.visible);
  }
  if (lane === undefined || lane.spriteWorldBounds === null ||
    !lane.spriteBindingKey?.endsWith("NoteLaneEffect_4") ||
    JSON.stringify(lane.spriteAnchor) !== JSON.stringify([0.5, 1]) ||
    lane.spriteBlendMode !== "normal") {
    throw new Error(`product entry did not publish the original-compatible center beam: ${JSON.stringify(lane)}`);
  }
  const oracle = correction.tap_lane_effect.sprites.find((row: any) =>
    row.name === "NoteLaneEffect_4");
  if (oracle === undefined) throw new Error("PLSO-L01 Lane Sprite correction oracle unavailable");
  const width = float32LittleEndianHex(oracle.texture_rect_f32[2]);
  const height = float32LittleEndianHex(oracle.texture_rect_f32[3]);
  const pivotX = float32LittleEndianHex(oracle.portable_cropped_png_pivot_f32[0]);
  const pivotY = float32LittleEndianHex(oracle.portable_cropped_png_pivot_f32[1]);
  const expected = [
    lane.position[0] - width * pivotX * lane.scale[0],
    lane.position[1] - height * pivotY * lane.scale[1],
    width * lane.scale[0],
    height * lane.scale[1],
  ];
  lane.spriteWorldBounds.forEach((value, index) => {
    if (Math.abs(value - expected[index]!) >= 0.02) {
      throw new Error(`lane bound ${index}: ${value} != ${expected[index]}`);
    }
  });
  app.render();
  const rgba = readWebGlFramebufferRgba(app, WIDTH, HEIGHT);
  const x = Math.max(0, Math.floor(lane.spriteWorldBounds[0]));
  const y = Math.max(0, Math.floor(lane.spriteWorldBounds[1]));
  const right = Math.min(WIDTH, Math.ceil(lane.spriteWorldBounds[0] + lane.spriteWorldBounds[2]));
  const bottom = Math.min(HEIGHT, Math.ceil(lane.spriteWorldBounds[1] + lane.spriteWorldBounds[3]));
  const cropped = cropRgba(rgba, WIDTH, x, y, right - x, bottom - y);
  let nonTransparentPixels = 0;
  for (let index = 3; index < cropped.length; index += 4) if (cropped[index] !== 0) nonTransparentPixels += 1;
  const result = Object.freeze({
    binding: lane.spriteBindingKey,
    anchor: lane.spriteAnchor,
    blendMode: lane.spriteBlendMode,
    bounds: lane.spriteWorldBounds,
    rgbaSha256: await sha256(cropped),
    nonTransparentPixels,
  });
  requireOk(engine.dispose());
  renderer.stage.removeFromParent();
  linear.dispose();
  requireOk(renderer.dispose());
  if (renderer.snapshot().objectCount !== 0 || renderer.stage.children.length !== 0) {
    throw new Error("product lane renderer cleanup failed");
  }
  return result;
}

function cropRgba(
  source: Uint8Array,
  sourceWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
): Uint8Array {
  const output = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const from = ((y + row) * sourceWidth + x) * 4;
    output.set(source.subarray(from, from + width * 4), row * width * 4);
  }
  return output;
}

async function capture(
  app: Application,
  renderer: PixiRendererBackend,
  label: string,
  position: number,
  maximumSlideSectionWidth: number,
) {
  const bytes = readWebGlFramebufferRgba(app, WIDTH, HEIGHT);
  let nonTransparentPixels = 0;
  for (let index = 3; index < bytes.length; index += 4) if (bytes[index] !== 0) nonTransparentPixels += 1;
  let observedMaximumSlideSectionWidth = 0;
  for (const row of renderer.sceneSnapshot().filter((candidate) =>
    candidate.renderObjectId.startsWith("render:garupa:line:") && candidate.geometryPositions !== null)) {
    for (let section = 0; section <= 10; section += 1) {
      const offset = section * 4;
      observedMaximumSlideSectionWidth = Math.max(
        observedMaximumSlideSectionWidth,
        Math.abs(row.geometryPositions![offset + 2]! - row.geometryPositions![offset]!),
      );
    }
  }
  if (observedMaximumSlideSectionWidth > maximumSlideSectionWidth + 0.02) {
    throw new Error(`Product Slide omitted Reverse widthRate: ${observedMaximumSlideSectionWidth} > ${maximumSlideSectionWidth}`);
  }
  return Object.freeze({
    label,
    position,
    rgbaSha256: await sha256(bytes),
    nonTransparentPixels,
    observedMaximumSlideSectionWidth,
    maximumSlideSectionWidth,
    world: observePixiWorld(renderer.stage),
    owners: renderer.snapshot().objectCount,
  });
}
function float32LittleEndianHex(hex: string): number {
  if (!/^[0-9A-F]{8}$/u.test(hex)) throw new Error(`invalid oracle Float32 bytes ${hex}`);
  const bytes = Uint8Array.from(hex.match(/../gu)!.map((pair) => Number.parseInt(pair, 16)));
  return new DataView(bytes.buffer).getFloat32(0, true);
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
