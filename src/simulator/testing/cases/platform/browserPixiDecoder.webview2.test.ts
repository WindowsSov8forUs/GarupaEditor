import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
  NineSliceSprite,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import { BrowserPixiTextureDecoder } from "../../../backends/pixi/browserPixiTextureDecoder";
import { installPixiLinearOutput } from "../../../backends/pixi/pixiLinearColorPipeline";
import { PixiRendererBackend } from "../../../backends/pixi/pixiRendererBackend";
import { createOriginalSurfaceLayout } from "../../../scene/originalSurfaceLayout";
import {
  createPixiParticleLinearColorMesh,
  destroyPixiParticleLinearColorMesh,
} from "../../../backends/pixi/pixiParticleLinearColorMesh";
import { readWebGlFramebufferRgba } from "../../support/platform/readWebGlFramebuffer";
import { parseCurrentScoreGaugeSsAnimationProfile } from "../../../backends/resources/currentScoreGaugeSsAnimationProfile";
import { captureHudRenderingWebView2Observation } from "../../support/platform/hudWebView2Observation";
import { CURRENT_SCORE_HUD_PORTABLE_RESOURCES } from "../../support/resources/currentScoreHudTestManifest";
import {
  ImmutableLocalRenderResourceProvider,
  PortableRenderResourcePreflightAdapter,
} from "../../../backends/resources/localResourceProvider";
import type {
  RenderCommand,
  RenderResourceAssetProfile,
  RenderResourceProfile,
} from "../../../backends/renderingContracts";
import { createRenderFloat32 } from "../../../backends/renderingValidation";

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
  equal(texture.source.format, "rgba8unorm-srgb", "production decoder sRGB GPU source");
  equal(texture.source.alphaMode, "no-premultiply-alpha", "production decoder straight-alpha source");
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
  verifyTransparentRgbComposite(app, texture);
  verifyLinearSrgbComposite(app);

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
  const scoreStateMatrix = await captureProductionScoreHudStateMatrix(app);
  const particleAdditiveFramebuffer = verifyParticleAdditiveFramebuffer(app);

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
      transparentRgbCompositePreserved: true,
      textureResourceAfterDestroy: resourceAfterDestroy == null ? null : resourceAfterDestroy.constructor?.name ?? "unknown",
    },
    raster: { pngOnly: pngRaster, fontOnly: fontRaster, scoreHud, scoreStateMatrix, particleAdditiveFramebuffer },
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
  readonly leadingRunWorldTransform: readonly [number, number];
  readonly highRankNodes: readonly unknown[];
  readonly highRankGeneration: number;
  readonly loopFramebuffer: Readonly<{
    readonly phase075Sha256: string;
    readonly phase375Sha256: string;
    readonly rejectedRestart0Sha256: string;
  }>;
  readonly pngDataUrl: string;
}> {
  const baseProfile = await fetchJson<RenderResourceProfile>("/score-profile.json");
  const animation = parseCurrentScoreGaugeSsAnimationProfile(await fetchJson("/score-animation.json"));
  if (animation === null) throw new Error("committed ScoreGaugeSS profile did not parse in WebView2");
  const productionScoreResources = CURRENT_SCORE_HUD_PORTABLE_RESOURCES.filter(
    (row) => row.resourceKeySuffix !== "score-font.png",
  );
  const resources = await Promise.all(productionScoreResources.map(async (row) => Object.freeze({
    logicalAssetId: row.profile.logicalAssetId,
    bytes: await fetchBytes(`/score-assets/${row.resourceKeySuffix}`),
  })));
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(resources));
  const profile: RenderResourceProfile = {
    ...baseProfile,
    packIdentity: `${baseProfile.packIdentity}+production-score-hud-webview2`,
    assets: Object.freeze(productionScoreResources.map((row) => row.profile)),
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
  const linearOutput = installPixiLinearOutput(backend.stage, 1600, 720);
  app.stage.addChild(backend.stage);
  app.render();
  const mask = findLabel(backend.stage, "score-high-rank-panel-mask");
  const layer = findLabel(backend.stage, "score-high-rank-animation-layer");
  const leadingRun = findLabel(backend.stage, "score-leading-segment");
  const significantRun = findLabel(backend.stage, "score-significant-segment");
  if (mask === null || layer === null || !(leadingRun instanceof Text) || !(significantRun instanceof Text)) {
    throw new Error("production Score HUD panel or encoded UILabel owner is absent");
  }
  if (findLabel(backend.stage, "score-digit-0") !== null) {
    throw new Error("rejected TotalScore bitmap digit route is still present");
  }
  equal(leadingRun.text, "0", "SS TotalScore leading run");
  equal(significantRun.text, "9000000", "SS TotalScore significant run");
  equal(Number(leadingRun.style.fill), 0x838383, "SS TotalScore BEBEBE sRGB is linearized before output");
  equal(Number(significantRun.style.fill), 0xff0b2b, "SS TotalScore FF3B72 sRGB is linearized before output");
  equal(String(leadingRun.style.fontFamily).startsWith("GarupaScoreRank-949356"), true,
    "SS TotalScore exact sgm FontFace");
  const bounds = mask.getLocalBounds();
  const maskWorldTransform = Object.freeze([mask.worldTransform.tx, mask.worldTransform.ty] as const);
  const maskWorldBounds = Object.freeze([
    mask.worldTransform.tx + bounds.minX,
    mask.worldTransform.ty + bounds.minY,
    mask.worldTransform.tx + bounds.maxX,
    mask.worldTransform.ty + bounds.maxY,
  ] as const);
  const animationLayerWorldTransform = Object.freeze([layer.worldTransform.tx, layer.worldTransform.ty] as const);
  const leadingRunWorldTransform = Object.freeze([leadingRun.worldTransform.tx, leadingRun.worldTransform.ty] as const);
  const scoreObservation = backend.sceneSnapshot().find((row) => row.renderObjectId === "hud:score");
  if (scoreObservation?.hudScoreHighRankNodes === null || scoreObservation?.hudScoreHighRankNodes === undefined) {
    throw new Error("production ScoreGaugeSS node observation is unavailable");
  }
  const hudObservation = captureHudRenderingWebView2Observation(scoreObservation);
  const frame = new Rectangle(0, 20, 900, 160);
  const output = app.renderer.extract.pixels({
    target: app.stage, frame, resolution: 1, clearColor: [0, 0, 0, 0],
  });
  const pixels = new Uint8Array(output.pixels.buffer, output.pixels.byteOffset, output.pixels.byteLength);
  const alpha = alphaObservation(pixels, frame.width, frame.height);
  const canvas = app.renderer.extract.canvas({ target: app.stage, frame, resolution: 1, clearColor: [0, 0, 0, 0] });
  let nextSequence = 5;
  const sampleHighRankFramebuffer = async (elapsedSeconds: number): Promise<string> => {
    requireOk(backend.commit(requireOk(backend.preflight([{
      sessionId: "production-score-hud-webview2",
      sequence: nextSequence++,
      frame: 0,
      substep: 0,
      kind: "sample-animation",
      renderObjectId: "hud:score",
      animationRole: "score-gauge-ss",
      elapsedSeconds: float32(elapsedSeconds),
    }]))));
    app.render();
    const sampled = app.renderer.extract.pixels({
      target: app.stage, frame, resolution: 1, clearColor: [0, 0, 0, 0],
    });
    return sha256(new Uint8Array(sampled.pixels.buffer, sampled.pixels.byteOffset, sampled.pixels.byteLength));
  };
  const phase075Sha256 = await sampleHighRankFramebuffer(0.75);
  const phase375Sha256 = await sampleHighRankFramebuffer(3.75);
  const rejectedRestart0Sha256 = await sampleHighRankFramebuffer(0);
  if (phase075Sha256 !== phase375Sha256 || phase375Sha256 === rejectedRestart0Sha256) {
    throw new Error(`SVL-R05 production framebuffer failed loop/restart counterexample: ${JSON.stringify({ phase075Sha256, phase375Sha256, rejectedRestart0Sha256 })}`);
  }
  const result = Object.freeze({
    sha256: await sha256(pixels),
    nonTransparentPixels: alpha.nonTransparentPixels,
    alphaBounds: alpha.bounds,
    maskWorldTransform,
    maskWorldBounds,
    animationLayerWorldTransform,
    leadingRunWorldTransform,
    highRankNodes: hudObservation.highRankNodes,
    highRankGeneration: hudObservation.highRankGeneration,
    loopFramebuffer: Object.freeze({ phase075Sha256, phase375Sha256, rejectedRestart0Sha256 }),
    pngDataUrl: (canvas as HTMLCanvasElement).toDataURL("image/png"),
  });
  linearOutput.dispose();
  requireOk(backend.dispose());
  app.stage.removeChild(backend.stage);
  return result;
}

async function captureProductionScoreHudStateMatrix(app: Application): Promise<readonly {
  readonly score: number;
  readonly rank: number;
  readonly text: string;
  readonly fontSize: number;
  readonly leading: string;
  readonly significant: string;
  readonly leadingPosition: readonly [number, number];
  readonly significantPosition: readonly [number, number];
  readonly ownerWorldTransform: readonly [number, number];
  readonly leadingWorldBounds: readonly [number, number, number, number];
  readonly significantWorldBounds: readonly [number, number, number, number];
  readonly backgroundBorder: readonly [number, number, number, number];
  readonly foregroundBorder: readonly [number, number, number, number];
  readonly sha256: string;
  readonly nonTransparentPixels: number;
  readonly alphaBounds: readonly [number, number, number, number];
  readonly panelClipF32Bits: readonly [string, string, string, string];
  readonly rejectedFrozenSsSha256: string | null;
}[]> {
  const baseProfile = await fetchJson<RenderResourceProfile>("/score-profile.json");
  const animation = parseCurrentScoreGaugeSsAnimationProfile(await fetchJson("/score-animation.json"));
  if (animation === null) throw new Error("Score matrix AnimationClip profile did not parse");
  const productionScoreResources = CURRENT_SCORE_HUD_PORTABLE_RESOURCES.filter(
    (row) => row.resourceKeySuffix !== "score-font.png",
  );
  const resources = await Promise.all(productionScoreResources.map(async (row) => Object.freeze({
    logicalAssetId: row.profile.logicalAssetId,
    bytes: await fetchBytes(`/score-assets/${row.resourceKeySuffix}`),
  })));
  if (resources.some((row) => row.logicalAssetId === "hud/score/font-atlas")) {
    throw new Error("Score matrix prepared the rejected bitmap font atlas");
  }
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(resources));
  const profile: RenderResourceProfile = {
    ...baseProfile,
    packIdentity: `${baseProfile.packIdentity}+production-score-state-matrix-webview2`,
    assets: Object.freeze(productionScoreResources.map((row) => row.profile)),
    scoreGaugeSsAnimation: animation,
    ordinaryVisibleProfile: undefined,
  };
  const sessionId = "production-score-state-matrix-webview2";
  const backend = new PixiRendererBackend(new BrowserPixiTextureDecoder());
  requireOk(await backend.prepare(sessionId, profile, provider, new PortableRenderResourcePreflightAdapter()));
  requireOk(backend.bindOriginalSurfaceLayout(requireOk(createOriginalSurfaceLayout({
    revision: 0, viewportWidth: 1600, viewportHeight: 720,
    safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) },
    origin: "bottom-left",
  }, Math.fround(100)))));
  let sequence = 0;
  requireOk(backend.commit(requireOk(backend.preflight([{
    sessionId, sequence: sequence++, frame: 0, substep: 0,
    kind: "create-object", renderObjectId: "hud:score:matrix", poolFamily: "score",
    role: "hud-score", parentObjectId: null,
  }]))));
  app.renderer.resize(1600, 720);
  const linearOutput = installPixiLinearOutput(backend.stage, 1600, 720);
  app.stage.addChild(backend.stage);
  const cases = [
    { score: 0, before: 4, rank: 4, high: false, text: "00000000", size: 28 },
    { score: 375_000, before: 4, rank: 3, high: false, text: "00375000", size: 28 },
    { score: 2_250_000, before: 3, rank: 2, high: false, text: "02250000", size: 28 },
    { score: 4_500_000, before: 2, rank: 1, high: false, text: "04500000", size: 28 },
    { score: 6_750_000, before: 1, rank: 0, high: false, text: "06750000", size: 28 },
    { score: 9_000_000, before: 0, rank: 5, high: true, text: "09000000", size: 28 },
    { score: 900_000_000, before: 5, rank: 5, high: true, text: "900000000", size: 27 },
    // SVL-R04: independent runtime UIPanel rows above SS. The indicator values
    // are the observed dynamic right edges (clip width + authored left inset).
    { score: 872_726, before: 5, rank: 5, high: true, text: "00872726", size: 28, originalAboveSs: true },
    { score: 915_926, before: 5, rank: 5, high: true, text: "00915926", size: 28, originalAboveSs: true },
    { score: 939_899, before: 5, rank: 5, high: true, text: "00939899", size: 28, originalAboveSs: true },
    { score: 950_189, before: 5, rank: 5, high: true, text: "00950189", size: 28, originalAboveSs: true },
    { score: 982_088, before: 5, rank: 5, high: true, text: "00982088", size: 28, originalAboveSs: true },
  ] as const;
  const rows = [];
  let ssEntryPanelBounds: readonly [number, number, number, number] | null = null;
  for (let index = 0; index < cases.length; index += 1) {
    const expected = cases[index]!;
    const commands: RenderCommand[] = [{
      sessionId, sequence: sequence++, frame: index + 1, substep: 0,
      kind: "set-hud", renderObjectId: "hud:score:matrix", hudRole: "score",
      state: scoreState(
        expected.score,
        expected.before,
        expected.rank,
        expected.before !== expected.rank,
        expected.score === 9_000_000 ? "ScoreGaugeSS" : "none",
        expected.high,
        "originalAboveSs" in expected && expected.originalAboveSs,
      ),
    }];
    if (index === 0) commands.push({
      sessionId, sequence: sequence++, frame: index + 1, substep: 0,
      kind: "activate-object", renderObjectId: "hud:score:matrix",
    });
    if (expected.score === 9_000_000) {
      commands.push(
        {
          sessionId, sequence: sequence++, frame: index + 1, substep: 0,
          kind: "play-animation", renderObjectId: "hud:score:matrix", animationRole: "score-gauge-ss", restart: true,
        },
        {
          sessionId, sequence: sequence++, frame: index + 1, substep: 0,
          kind: "sample-animation", renderObjectId: "hud:score:matrix", animationRole: "score-gauge-ss",
          elapsedSeconds: float32(0.5),
        },
      );
    }
    requireOk(backend.commit(requireOk(backend.preflight(commands))));
    app.render();
    const owner = findLabel(backend.stage, "GamePlay/UI_Root/Display/Score/Base/TotalScore");
    const leading = findLabel(backend.stage, "score-leading-segment");
    const significant = findLabel(backend.stage, "score-significant-segment");
    const background = findLabel(backend.stage, "score-gauge-background");
    const foreground = findLabel(backend.stage, "score-gauge-foreground");
    if (owner === null || !(leading instanceof Text) || !(significant instanceof Text) ||
        !(background instanceof NineSliceSprite) || !(foreground instanceof NineSliceSprite)) {
      throw new Error(`Score matrix ${expected.score} UILabel graph is absent`);
    }
    if (findLabel(backend.stage, "score-digit-0") !== null) {
      throw new Error(`Score matrix ${expected.score} restored a bitmap digit`);
    }
    equal(`${leading.text}${significant.text}`, expected.text, `Score matrix ${expected.score} encoded value`);
    equal(Number(leading.style.fontSize), expected.size, `Score matrix ${expected.score} leading font size`);
    equal(Number(significant.style.fontSize), expected.size, `Score matrix ${expected.score} significant font size`);
    equal(Number(leading.style.fill), 0x838383, `Score matrix ${expected.score} leading linear tint`);
    equal(Number(significant.style.fill), 0xff0b2b, `Score matrix ${expected.score} significant linear tint`);
    equal(String(leading.style.fontFamily).startsWith("GarupaScoreRank-949356"), true,
      `Score matrix ${expected.score} exact sgm FontFace`);
    const leadingBounds = leading.getBounds();
    const significantBounds = significant.getBounds();
    const frame = new Rectangle(0, 20, 900, 160);
    const output = app.renderer.extract.pixels({
      target: app.stage, frame, resolution: 1, clearColor: [0, 0, 0, 0],
    });
    const pixels = new Uint8Array(output.pixels.buffer, output.pixels.byteOffset, output.pixels.byteLength);
    const alpha = alphaObservation(pixels, frame.width, frame.height);
    if (alpha.nonTransparentPixels <= 0) throw new Error(`Score matrix ${expected.score} raster is empty`);
    const scoreObservation = backend.sceneSnapshot().find((row) => row.renderObjectId === "hud:score:matrix");
    const panelBounds = scoreObservation?.hudScoreIndicatorMask?.bounds;
    if (panelBounds === undefined) throw new Error(`Score matrix ${expected.score} panel clip is absent`);
    const [panelLeft, panelTop, panelWidth, panelHeight] = panelBounds;
    const acceptedSha256 = await sha256(pixels);
    let rejectedFrozenSsSha256: string | null = null;
    if ("originalAboveSs" in expected && expected.originalAboveSs) {
      if (ssEntryPanelBounds === null) {
        ssEntryPanelBounds = Object.freeze([...panelBounds] as [number, number, number, number]);
      } else {
        const mask = findLabel(backend.stage, "score-high-rank-panel-mask");
        if (!(mask instanceof Graphics)) throw new Error("SVL-R04 production panel mask is not a Graphics owner");
        mask.clear().rect(
          ssEntryPanelBounds[0], ssEntryPanelBounds[1], ssEntryPanelBounds[2], ssEntryPanelBounds[3],
        ).fill(0xffffff);
        app.render();
        const rejectedOutput = app.renderer.extract.pixels({
          target: app.stage, frame, resolution: 1, clearColor: [0, 0, 0, 0],
        });
        const rejectedPixels = new Uint8Array(
          rejectedOutput.pixels.buffer,
          rejectedOutput.pixels.byteOffset,
          rejectedOutput.pixels.byteLength,
        );
        rejectedFrozenSsSha256 = await sha256(rejectedPixels);
        mask.clear().rect(panelLeft, panelTop, panelWidth, panelHeight).fill(0xffffff);
        app.render();
        if (rejectedFrozenSsSha256 === acceptedSha256) {
          throw new Error(`SVL-R04 score ${expected.score} framebuffer accepted the frozen-SS-width variant`);
        }
      }
    }
    const panelClipF32Bits = Object.freeze([
      float32BigEndianBits(Math.fround(panelLeft + panelWidth / 2)),
      float32BigEndianBits(Math.fround(-(panelTop + panelHeight / 2))),
      float32BigEndianBits(panelWidth),
      float32BigEndianBits(panelHeight),
    ] as const);
    rows.push(Object.freeze({
      score: expected.score,
      rank: expected.rank,
      text: expected.text,
      fontSize: expected.size,
      leading: leading.text,
      significant: significant.text,
      leadingPosition: Object.freeze([leading.x, leading.y] as const),
      significantPosition: Object.freeze([significant.x, significant.y] as const),
      ownerWorldTransform: Object.freeze([owner.worldTransform.tx, owner.worldTransform.ty] as const),
      leadingWorldBounds: Object.freeze([leadingBounds.x, leadingBounds.y, leadingBounds.width, leadingBounds.height] as const),
      significantWorldBounds: Object.freeze([significantBounds.x, significantBounds.y, significantBounds.width, significantBounds.height] as const),
      backgroundBorder: Object.freeze([background.leftWidth, background.topHeight, background.rightWidth, background.bottomHeight] as const),
      foregroundBorder: Object.freeze([foreground.leftWidth, foreground.topHeight, foreground.rightWidth, foreground.bottomHeight] as const),
      sha256: acceptedSha256,
      nonTransparentPixels: alpha.nonTransparentPixels,
      alphaBounds: alpha.bounds,
      panelClipF32Bits,
      rejectedFrozenSsSha256,
    }));
  }
  linearOutput.dispose();
  requireOk(backend.dispose());
  app.stage.removeChild(backend.stage);
  return Object.freeze(rows);
}

function scoreState(
  score: number,
  beforeRank: number,
  rank: number,
  rankChanged: boolean,
  highRankEffect: "none" | "ScoreGaugeSS",
  highRankEffectActive: boolean,
  originalAboveSs = false,
) {
  // 969500 is a test-only valid score maximum inside the independently frozen
  // SVL-R04 indicator interval; it drives the typed production formula without
  // injecting the expected panel width into the HUD state.
  const scoreMax = originalAboveSs ? 969_500 : 10_001_000;
  const thresholds = Object.freeze(originalAboveSs ? {
    scoreC: 36_300, scoreB: 217_800, scoreA: 435_600,
    scoreS: 653_400, scoreSS: 871_200,
  } : {
    scoreC: 375_000, scoreB: 2_250_000, scoreA: 4_500_000,
    scoreS: 6_750_000, scoreSS: 9_000_000,
  });
  const ratio = Math.fround(Math.fround(score) / Math.fround(scoreMax));
  const marker = (value: number) => float32(Math.fround(
    Math.fround(41) + Math.fround(
      Math.fround(Math.fround(value) * Math.fround(421)) / Math.fround(scoreMax),
    ),
  ));
  const digits = String(score);
  return Object.freeze({
    thresholds,
    score,
    scoreText: `[BEBEBE]${"0".repeat(Math.max(8 - digits.length, 0))}[-][FF3B72]${digits}[-]`,
    scoreMax, rank, beforeRank, rankChanged,
    meterKey: rank === 4 ? "score_meter_blue" : rank === 3 ? "score_meter_green" :
      rank === 2 ? "score_meter_orange" : rank === 1 ? "score_meter_pink" : "score_meter_s",
    ratio: float32(ratio), sliderValue: float32(Math.fround(Math.min(Math.max(ratio, 0), 1))),
    foregroundActive: ratio > 0,
    indicatorLocalX: ratio >= 1 ? 422 : Math.trunc(Math.fround(ratio * Math.fround(422))),
    rankMarkerCLocalX: marker(thresholds.scoreC), rankMarkerBLocalX: marker(thresholds.scoreB),
    rankMarkerALocalX: marker(thresholds.scoreA), rankMarkerSLocalX: marker(thresholds.scoreS),
    rankMarkerSSLocalX: marker(thresholds.scoreSS), highRankEffect, highRankEffectActive,
  });
}

function float32(value: number) {
  return requireOk(createRenderFloat32(Math.fround(value)));
}

function float32BigEndianBits(value: number): string {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, Math.fround(value), false);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
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
      premultiplyAlpha: false,
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

function verifyParticleAdditiveFramebuffer(app: Application): {
  readonly sourceRgba: readonly [number, number, number, number];
  readonly particleColor: readonly [number, number, number, number];
  readonly observedCenterRgba: readonly [number, number, number, number];
  readonly onceAlphaExpectedRgb: readonly [number, number, number];
  readonly rejectedTwiceAlphaRgb: readonly [number, number, number];
  readonly blendMode: string;
  readonly textureScaleMode: string;
} {
  const width = 16;
  const height = 16;
  app.renderer.resize(width, height);
  const sourceRgba = Object.freeze([128, 64, 32, 128] as const);
  const texture = new Texture({
    source: new BufferImageSource({
      resource: Uint8Array.from(sourceRgba),
      width: 1,
      height: 1,
      format: "rgba8unorm-srgb",
      alphaMode: "no-premultiply-alpha",
      scaleMode: "linear",
    }),
  });
  const particleColor = Object.freeze([1, 1, 1, 0.5] as const);
  const mesh = createPixiParticleLinearColorMesh(
    texture,
    "svl-r01-non-unit-alpha-framebuffer",
    ...particleColor,
  );
  mesh.position.set(width / 2, height / 2);
  mesh.scale.set(width, height);
  mesh.blendMode = "add";
  const root = new Container();
  const opaqueDestination = new Sprite(Texture.WHITE);
  opaqueDestination.tint = 0x000000;
  opaqueDestination.width = width;
  opaqueDestination.height = height;
  root.addChild(opaqueDestination, mesh);
  const linearOutput = installPixiLinearOutput(root, width, height);
  app.stage.addChild(root);
  app.render();
  const framebuffer = readWebGlFramebufferRgba(app, width, height);
  const offset = ((height / 2) * width + width / 2) * 4;
  const observedCenterRgba = Object.freeze([
    framebuffer[offset]!, framebuffer[offset + 1]!, framebuffer[offset + 2]!, framebuffer[offset + 3]!,
  ] as const);
  const sourceAlpha = sourceRgba[3] / 255;
  const particleAlpha = particleColor[3];
  const onceAlphaExpectedRgb = Object.freeze(sourceRgba.slice(0, 3).map((byte) => encodeSrgb(
    decodeSrgb(byte) * sourceAlpha * particleAlpha,
  )) as [number, number, number]);
  const rejectedTwiceAlphaRgb = Object.freeze(sourceRgba.slice(0, 3).map((byte) => encodeSrgb(
    decodeSrgb(byte) * sourceAlpha * particleAlpha * particleAlpha,
  )) as [number, number, number]);
  for (let channel = 0; channel < 3; channel += 1) {
    if (Math.abs(observedCenterRgba[channel]! - onceAlphaExpectedRgb[channel]!) > 2) {
      throw new Error(`SVL-R01 additive framebuffer channel ${channel}: ${observedCenterRgba[channel]} != ${onceAlphaExpectedRgb[channel]} (twice=${rejectedTwiceAlphaRgb[channel]})`);
    }
    if (Math.abs(observedCenterRgba[channel]! - rejectedTwiceAlphaRgb[channel]!) <= 2) {
      throw new Error(`SVL-R01 additive framebuffer accepted the rejected twice-alpha RGB channel ${channel}`);
    }
  }
  const result = Object.freeze({
    sourceRgba,
    particleColor,
    observedCenterRgba,
    onceAlphaExpectedRgb,
    rejectedTwiceAlphaRgb,
    blendMode: String(mesh.blendMode),
    textureScaleMode: String(texture.source.scaleMode),
  });
  if (observedCenterRgba[3] !== 255) {
    throw new Error(`SVL-R01 additive framebuffer lost its opaque composed destination: ${observedCenterRgba[3]}`);
  }
  linearOutput.dispose();
  root.removeFromParent();
  destroyPixiParticleLinearColorMesh(mesh);
  texture.destroy(true);
  root.destroy({ children: true });
  return result;
}

function decodeSrgb(byte: number): number {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function encodeSrgb(value: number): number {
  return Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
}

function verifyLinearSrgbComposite(app: Application): void {
  const root = new Container();
  const output = installPixiLinearOutput(root, 8, 8);
  const background = new Sprite(Texture.WHITE);
  background.width = 8;
  background.height = 8;
  background.tint = 0x020918;
  const sample = new Texture({
    source: new BufferImageSource({
      resource: new Uint8Array([115, 154, 154, 132]),
      width: 1,
      height: 1,
      format: "rgba8unorm-srgb",
      alphaMode: "no-premultiply-alpha",
      scaleMode: "nearest",
    }),
  });
  const sprite = new Sprite(sample);
  sprite.width = 8;
  sprite.height = 8;
  root.addChild(background);
  app.stage.addChild(root);
  app.render();
  const backgroundObserved = readScreenPixels(app, 0, 0, 8, 8);
  root.addChild(sprite);
  app.render();
  const observed = readScreenPixels(app, 0, 0, 8, 8);
  root.removeFromParent();
  const expected = linearComposite(
    [115, 154, 154],
    132,
    [backgroundObserved[0]!, backgroundObserved[1]!, backgroundObserved[2]!],
  );
  for (let index = 0; index < observed.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      if (Math.abs(observed[index + channel]! - expected[channel]!) > 1) {
        const gpu = Object.values((sample.source as any)._gpuData ?? {})[0] as any;
        throw new Error(`linear sRGB composite channel ${channel}: ${observed[index + channel]} != ${expected[channel]} source=${sample.source.format} internal=${String(gpu?.internalFormat)} upload=${String(gpu?.format)}`);
      }
    }
    if (observed[index + 3] !== 255) throw new Error("linear sRGB composite lost opaque alpha");
  }
  output.dispose();
  sample.destroy(true);
  root.destroy({ children: true });
}

function readScreenPixels(
  app: Application,
  x: number,
  y: number,
  width: number,
  height: number,
): Uint8Array {
  const gl = (app.renderer as unknown as { readonly gl: WebGL2RenderingContext }).gl;
  const output = new Uint8Array(width * height * 4);
  gl.readPixels(x, app.canvas.height - y - height, width, height, gl.RGBA, gl.UNSIGNED_BYTE, output);
  return output;
}

function linearComposite(
  source: readonly [number, number, number],
  alphaByte: number,
  background: readonly [number, number, number],
): readonly [number, number, number] {
  const decode = (byte: number): number => {
    const value = byte / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const encode = (value: number): number => Math.round(255 * (
    value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
  ));
  const alpha = alphaByte / 255;
  return Object.freeze(source.map((byte, index) => encode(
    decode(byte) * alpha + decode(background[index]!) * (1 - alpha),
  )) as unknown as [number, number, number]);
}

function verifyTransparentRgbComposite(app: Application, texture: Texture): void {
  // rhythm-game-ui.png texel (200, 200) is transparent orange (255,139,78,0).
  // A straight-alpha ImageBitmap mislabeled as premultiplied adds that hidden RGB
  // to an opaque scene. The decoded premultiplied bitmap must leave the sentinel
  // background byte-identical after actual Pixi/WebGL compositing.
  const frame = new Rectangle(0, 0, 8, 8);
  const clearColor: [number, number, number, number] = [18 / 255, 52 / 255, 86 / 255, 1];
  const baseline = extractCompositePixels(app, new Container(), frame, clearColor);
  const sample = new Texture({
    source: texture.source,
    frame: new Rectangle(200, 200, 1, 1),
    orig: new Rectangle(0, 0, 1, 1),
  });
  const sprite = new Sprite(sample);
  sprite.width = 8;
  sprite.height = 8;
  const stage = new Container();
  stage.addChild(sprite);
  const observed = extractCompositePixels(app, stage, frame, clearColor);
  sample.destroy(false);
  if (baseline.length !== observed.length || baseline.some((byte, index) => byte !== observed[index])) {
    throw new Error("transparent non-zero RGB atlas texel contaminated the opaque Pixi scene");
  }
}

function extractCompositePixels(
  app: Application,
  target: Container,
  frame: Rectangle,
  clearColor: [number, number, number, number],
): Uint8Array {
  const output = app.renderer.extract.pixels({ target, frame, resolution: 1, clearColor });
  return Uint8Array.from(new Uint8Array(output.pixels.buffer, output.pixels.byteOffset, output.pixels.byteLength));
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

function requireOk<T>(result: { readonly status: "ok"; readonly value: T } | { readonly status: "integrity-failure"; readonly capability: string; readonly boundary: string }): T {
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
