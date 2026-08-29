import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
import {
  LIVE_AUTO_MODE,
  LIVE_MANUAL_MODE,
  REHEARSAL_AUTO_MODE,
  REHEARSAL_MANUAL_MODE,
} from "./modeFixtures";
import { Application, Container, Mesh, Rectangle, Sprite, Texture } from "pixi.js";
import type {
  AudioBackendSnapshot,
  AudioCommand,
  AudioCommandBatch,
  AudioOperationResult,
  AudioResourcePreflightAdapter,
  AudioResourceProfileSet,
  AudioResourceProvider,
  SimulatorAudioBackend,
} from "../backends/audioContracts";
import { audioAccepted, audioRejected } from "../backends/audioValidation";
import type { SimulatorBackends } from "../backends/contracts";
import { DeterministicSimulatorParticleBackend } from "../backends/particles/deterministicParticleBackend";
import { BrowserPixiParticleTextureDecoder } from "../backends/pixi/browserPixiParticleTextureDecoder";
import { BrowserPixiTextureDecoder } from "../backends/pixi/browserPixiTextureDecoder";
import {
  installPixiLinearOutput,
  type PixiLinearOutputOwner,
} from "../backends/pixi/pixiLinearColorPipeline";
import { createPixiCombinedScene, type PixiCombinedScene } from "../backends/pixi/pixiCombinedScene";
import { PixiParticleRendererBackend } from "../backends/pixi/pixiParticleRendererBackend";
import {
  createPixiParticleLinearColorMesh,
  destroyPixiParticleLinearColorMesh,
} from "../backends/pixi/pixiParticleLinearColorMesh";
import {
  PixiRendererBackend,
  type PixiInGameControlOverlay,
} from "../backends/pixi/pixiRendererBackend";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "./legacyCurrentOrdinaryResourceManifest";
import { CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES } from "./legacyCurrentOrdinaryVisibleResourceManifest";
import { parseCurrentOrdinaryVisibleProfile } from "../backends/resources/currentOrdinaryVisibleProfile";
import { CURRENT_SCORE_HUD_PORTABLE_RESOURCES } from "./legacyCurrentScoreHudResourceManifest";
import { augmentScoreHudProfilesForPause } from "./pauseControlTestResources";
import { parseCurrentScoreGaugeSsAnimationProfile } from "../backends/resources/currentScoreGaugeSsAnimationProfile";
import { parseCurrentPauseCountdownAnimationProfile } from "../backends/resources/currentPauseCountdownAnimationProfile";
import { parseCurrentGameClearProfile } from "../backends/resources/currentGameClearProfile";
import {
  ImmutableLocalParticleResourceProvider,
  PortableParticleResourcePreflightAdapter,
} from "../backends/resources/localParticleResourceProvider";
import {
  ImmutableLocalRenderResourceProvider,
  PortableRenderResourcePreflightAdapter,
} from "../backends/resources/localResourceProvider";
import type { ParticleOperationResult, ParticleResourceProvider } from "../backends/particleContracts";
import type { RenderResourceProfile } from "../backends/renderingContracts";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import type { SimulatorResult } from "../engine/evidence";
import type { SimulatorEngine } from "../host/contracts";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import { createSimulatorSceneLayout, type SimulatorSceneLayout } from "../scene/simulatorSceneLayout";
import { createPauseControlLayout, PauseControlSceneOwner } from "../scene/pauseControlScene";
import { observePixiWorld } from "./pixiWorldObserver";
import { readWebGlFramebufferRgba } from "./readWebGlFramebuffer";
import { applicationLeaseParticleProviderForTesting } from "./legacyApplicationParticleProvider";

const WIDTH = 1600;
const HEIGHT = 720;
const DELTA = 0.1;

interface InputMap {
  readonly render: readonly { readonly logicalAssetId: string; readonly url: string }[];
  readonly particle: readonly { readonly logicalAssetId: string; readonly url: string }[];
}

interface LoadedInputs {
  readonly chartText: string;
  readonly strict: any;
  readonly sevenVisual: any;
  readonly renderProfile: RenderResourceProfile;
  readonly renderResources: readonly { readonly logicalAssetId: string; readonly bytes: Uint8Array }[];
  readonly particleResources: readonly { readonly logicalAssetId: string; readonly bytes: Uint8Array }[];
}

interface BrowserSession {
  readonly id: string;
  readonly engine: SimulatorEngine;
  readonly renderer: PixiRendererBackend;
  readonly particleRenderer: PixiParticleRendererBackend;
  readonly combined: PixiCombinedScene;
  readonly layout: SimulatorSceneLayout;
  readonly controlOverlay: PixiInGameControlOverlay;
  readonly linearOutput: PixiLinearOutputOwner;
  readonly audio: VisualLifecycleAudioBackend;
  mounted: boolean;
}

interface FrameCapture {
  readonly label: string;
  readonly frame: number;
  readonly rgbaSha256: string;
  readonly crops: Readonly<Record<string, string>>;
  readonly nonTransparentPixels: number;
  readonly alphaBounds: readonly [number, number, number, number];
  readonly worldObservation: ReturnType<typeof observePixiWorld>;
  readonly owners: {
    readonly render: number;
    readonly particles: number;
    readonly visibleWorldRecords: number;
    readonly textureRecords: number;
    readonly maskConsumers: number;
  };
}

void main().catch((error) => {
  globalThis.window.ipc.postMessage(JSON.stringify({
    schema: "garupa-ordinary-rendering-webview2-v1",
    status: "error",
    message: String(error instanceof Error ? error.message : error),
    stack: String(error instanceof Error ? error.stack ?? "" : ""),
  }));
});

async function main(): Promise<void> {
  const inputs = await loadInputs();
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
  const initialFontFaces = Array.from(document.fonts).length;
  const captures: FrameCapture[] = [];

  const auto = await createSession(inputs, "ordinary-webview2-auto", "live-auto");
  mount(app, auto);
  requireOk(auto.engine.initialize());
  assertPersistentHudComponentConsumption(auto);
  captures.push(await capture(app, auto, "initialize", 0));
  await runAutoScenario(app, auto, captures);
  const scoreBeforeAdvance = auto.renderer.sceneSnapshot().find((row) => row.renderObjectId === "render:hud:score");
  if (JSON.stringify(scoreBeforeAdvance?.hudScoreHighRankSiblingOrder) !== JSON.stringify(
    inputs.strict.scoreHud.siblingDrawOrder.map((row: any) => row.name),
  )) throw new Error("ScoreGaugeSS fresh browser sibling draw order does not preserve Flash→BigStar→kira");
  const scoreMotionBefore = JSON.stringify(scoreBeforeAdvance?.hudScoreHighRankNodes);
  const scoreGeneration = scoreBeforeAdvance?.hudScoreHighRankGeneration;
  const ssLoopPhases = new Set<string>();
  for (let phaseIndex = 0; phaseIndex < 30; phaseIndex += 1) {
    requireOk(auto.engine.step(Math.fround(0.25)));
    const row = auto.renderer.sceneSnapshot().find((candidate) => candidate.renderObjectId === "render:hud:score");
    if (row === undefined || row.hudScoreHighRankGeneration !== scoreGeneration || row.activeAnimationRole !== "score-gauge-ss") {
      throw new Error(`SVL-R05 ScoreGaugeSS restarted or stopped during 7.5-second loop: ${JSON.stringify(row)}`);
    }
    ssLoopPhases.add(JSON.stringify(row.hudScoreHighRankNodes));
  }
  const scoreAfterAdvance = auto.renderer.sceneSnapshot().find((row) => row.renderObjectId === "render:hud:score");
  if (scoreMotionBefore === JSON.stringify(scoreAfterAdvance?.hudScoreHighRankNodes) || ssLoopPhases.size < 6) {
    throw new Error("SVL-R05 ScoreGaugeSS did not retain changing loop phases for 7.5 seconds");
  }
  let independentLifecycleObserved = false;
  let postJudge: ReturnType<PixiRendererBackend["sceneSnapshot"]> = Object.freeze([]);
  for (let frame = 0; frame < 300 && !independentLifecycleObserved; frame += 1) {
    requireOk(auto.engine.step(Math.fround(0.1)));
    postJudge = auto.renderer.sceneSnapshot();
    independentLifecycleObserved = postJudge.find((row) => row.renderObjectId === "render:hud:combo")?.visible === true &&
      postJudge.find((row) => row.renderObjectId === "render:hud:result")?.visible === false;
  }
  if (!independentLifecycleObserved) {
    throw new Error(`Combo and Judge incorrectly share the one-second disappearance owner: ${JSON.stringify({
      combo: postJudge.find((row) => row.renderObjectId === "render:hud:combo"),
      result: postJudge.find((row) => row.renderObjectId === "render:hud:result"),
    })}`);
  }
  auto.audio.markBgmEnded();
  requireOk(auto.engine.step(Math.fround(0.001)));
  sampleGameClear(auto, 1.2);
  assertGameClearWhite(auto);
  const naturalClear = requiredGameClearSnapshot(auto);
  if (naturalClear.hudGameClearParticleSystemCount !== 52 ||
      naturalClear.hudGameClearChannelValuesBits?.length !== 129) {
    throw new Error(`Auto AP product terminal presentation is incomplete: ${JSON.stringify({
      particles: naturalClear.hudGameClearParticleSystemCount,
      channels: naturalClear.hudGameClearChannelValuesBits?.length,
    })}`);
  }
  captures.push(await capture(app, auto, "natural-completion", 1401));
  const naturalClearStatus = auto.engine.getNaturalCompletionClearStatus();
  const autoCleanup = disposeSession(app, auto);

  const liveManualClear = await createSession(inputs, "ordinary-webview2-live-manual-clear", "live-manual");
  mount(app, liveManualClear);
  requireOk(liveManualClear.engine.initialize());
  await advanceToPlayable(liveManualClear);
  requireOk(liveManualClear.engine.completeLiveAudio(2));
  const fullComboPhaseMatrix = await assertGameClearAnimationMatrix(
    app,
    liveManualClear,
    inputs.sevenVisual,
    inputs.sevenVisual.full_combo_all_perfect_complete_animation.full_combo,
    true,
  );
  assertGameClearWhite(liveManualClear);
  captures.push(await capture(app, liveManualClear, "live-manual-full-combo", 0));
  assertGameClearSceneExit(liveManualClear);
  const liveManualClearCleanup = disposeSession(app, liveManualClear);

  const manual = await createSession(inputs, "ordinary-webview2-game-over", "live-manual");
  mount(app, manual);
  requireOk(manual.engine.initialize());
  await runGameOverScenario(app, manual, captures);
  const manualCleanup = disposeSession(app, manual);

  const rehearsalManual = await createSession(
    inputs,
    "ordinary-webview2-rehearsal-manual",
    "rehearsal-manual",
  );
  mount(app, rehearsalManual);
  requireOk(rehearsalManual.engine.initialize());
  captures.push(await capture(app, rehearsalManual, "rehearsal-manual-controls", 0));
  await runRehearsalLifeZeroScenario(app, rehearsalManual, captures);
  requireOk(rehearsalManual.controlOverlay!.updateTimeline(5));
  captures.push(await capture(app, rehearsalManual, "rehearsal-forward-five-controls", 5));
  requireOk(rehearsalManual.controlOverlay!.updateTimeline(0));
  captures.push(await capture(app, rehearsalManual, "rehearsal-return-five-controls", 0));
  requireOk(rehearsalManual.engine.completeLiveAudio(1));
  sampleGameClear(rehearsalManual, 1.2);
  assertGameClearWhite(rehearsalManual);
  captures.push(await capture(app, rehearsalManual, "rehearsal-manual-base-clear", 0));
  const rehearsalManualCleanup = disposeSession(app, rehearsalManual);

  const rehearsalAuto = await createSession(
    inputs,
    "ordinary-webview2-rehearsal-auto",
    "rehearsal-auto",
  );
  mount(app, rehearsalAuto);
  requireOk(rehearsalAuto.engine.initialize());
  captures.push(await capture(app, rehearsalAuto, "rehearsal-auto-demo-controls", 0));
  await advanceToPlayable(rehearsalAuto);
  requireOk(rehearsalAuto.engine.completeLiveAudio(3));
  const allPerfectPhaseMatrix = await assertGameClearAnimationMatrix(
    app,
    rehearsalAuto,
    inputs.sevenVisual,
    inputs.sevenVisual.full_combo_all_perfect_complete_animation.all_perfect,
    false,
  );
  assertGameClearWhite(rehearsalAuto);
  captures.push(await capture(app, rehearsalAuto, "rehearsal-auto-all-perfect", 0));
  assertGameClearSceneExit(rehearsalAuto);
  const rehearsalAutoCleanup = disposeSession(app, rehearsalAuto);

  const requiredLabels = [
    "initialize", "note-spawn", "note-animation", "judgement", "combo-add-score",
    "rank-c", "rank-b", "rank-a", "rank-s", "rank-ss", "particle-peak",
    "pause", "pause-retry-confirm", "pause-abort-confirm", "pause-resume-countdown", "resume", "natural-completion", "life-warning", "game-over",
    "rehearsal-manual-controls", "rehearsal-life-zero-continuation",
    "rehearsal-forward-five-controls", "rehearsal-return-five-controls",
    "rehearsal-auto-demo-controls", "live-manual-full-combo",
    "rehearsal-manual-base-clear", "rehearsal-auto-all-perfect",
  ];
  const labels = new Set(captures.map((entry) => entry.label));
  for (const label of requiredLabels) if (!labels.has(label)) throw new Error(`required browser event was not captured: ${label}`);
  if (captures.some((entry) => entry.nonTransparentPixels <= 0 || entry.owners.visibleWorldRecords <= 0)) {
    throw new Error("every complete-scene event requires visible actual Pixi pixels and world records");
  }
  if (naturalClearStatus !== 3) throw new Error(`Auto AP product terminal status mismatch: ${naturalClearStatus}`);
  const finalFontFaces = Array.from(document.fonts).length;
  if (finalFontFaces !== initialFontFaces || app.stage.children.length !== 0) {
    throw new Error(`browser owner cleanup mismatch fonts=${initialFontFaces}->${finalFontFaces} stage=${app.stage.children.length}`);
  }

  const gl = (app.renderer as unknown as { readonly gl?: WebGL2RenderingContext }).gl;
  const highEntropy = navigator.userAgentData?.getHighEntropyValues === undefined
    ? null
    : await navigator.userAgentData.getHighEntropyValues(["fullVersionList"]);
  const result = Object.freeze({
    schema: "garupa-ordinary-rendering-webview2-v1",
    status: "ok",
    runtime: Object.freeze({
      userAgent: navigator.userAgent,
      highEntropy,
      pixiVersion: (await import("pixi.js")).VERSION,
      rendererName: app.renderer.name,
      webglVersion: gl?.getParameter(gl.VERSION) ?? null,
    }),
    productionDecoders: Object.freeze({
      render: BrowserPixiTextureDecoder.name,
      particle: BrowserPixiParticleTextureDecoder.name,
    }),
    scene: Object.freeze({
      rootLabel: "GarupaSimulatorCombinedScene",
      stageOrder: Object.freeze(["GarupaSimulatorRoot", "GarupaSimulatorRoot/GarupaSimulatorParticles"]),
      chartBatchCount: 656,
      captures: Object.freeze(captures),
      naturalClearStatus,
      sevenVisualLifecycle: Object.freeze({
        status: inputs.sevenVisual.status,
        fullComboChannels: inputs.sevenVisual.full_combo_all_perfect_complete_animation.full_combo.clip.curve_count,
        allPerfectChannels: inputs.sevenVisual.full_combo_all_perfect_complete_animation.all_perfect.clip.curve_count,
        terminalHoldBoundarySeconds: 3.232,
        scoreGaugeSsContinuousSeconds: 7.5,
        uvFrame: inputs.sevenVisual.particle_texture_material_color_blend.uv_frame,
        fullComboPhaseMatrix,
        allPerfectPhaseMatrix,
      }),
    }),
    cleanup: Object.freeze({
      auto: autoCleanup,
      manual: manualCleanup,
      liveManualClear: liveManualClearCleanup,
      rehearsalManual: rehearsalManualCleanup,
      rehearsalAuto: rehearsalAutoCleanup,
      initialFontFaces,
      finalFontFaces,
      applicationStageChildren: app.stage.children.length,
    }),
    isolation: Object.freeze({
      resourceUrls: performance.getEntriesByType("resource").map((entry) => entry.name).sort(),
    }),
  });
  app.destroy(true, { children: true, texture: true, textureSource: true });
  globalThis.window.ipc.postMessage(JSON.stringify(result));
}

function sampleGameClear(session: BrowserSession, elapsedSeconds: number): void {
  requireOk(session.engine.advanceNaturalCompletionPresentation(Math.fround(elapsedSeconds)));
}

async function assertGameClearAnimationMatrix(
  app: Application,
  session: BrowserSession,
  sevenVisual: any,
  branch: any,
  verifyUvFrame: boolean,
): Promise<Readonly<{ readonly animationKey: string; readonly phaseDigests: readonly string[] }>> {
  let previousPhase = 0;
  let uvFramebufferVerified = false;
  const phaseDigests: string[] = [];
  const phaseChannelSignatures: string[] = [];
  for (let phaseIndex = 0; phaseIndex < branch.clip.phase_seconds.length; phaseIndex += 1) {
    const phase = branch.clip.phase_seconds[phaseIndex] as number;
    if (phaseIndex > 0) sampleGameClear(session, Math.fround(phase - previousPhase));
    previousPhase = phase;
    const clear = requiredGameClearSnapshot(session);
    const expectedBits = branch.clip.channels.map((channel: any) => channel.phase_f32_bits[phaseIndex]);
    phaseChannelSignatures.push(JSON.stringify(expectedBits));
    if (JSON.stringify(clear.hudGameClearChannelValuesBits) !== JSON.stringify(expectedBits)) {
      throw new Error(`SVL-R07 ${branch.animation_key} channel phase ${phase} differs from the independent ${branch.clip.curve_count}-channel matrix`);
    }
    if (JSON.stringify(clear.hudGameClearChannelDispositionCounts) !== JSON.stringify(branch.clip.disposition_counts)) {
      throw new Error(`SVL-R07 ${branch.animation_key} channel dispositions are incomplete`);
    }
    if (clear.hudSerializedComponentPaths?.length !== branch.object_count ||
        clear.hudGameClearParticleSystemCount !== 40 + branch.particle_system_count ||
        clear.hudGameClearChannelValuesBits?.length !== branch.clip.curve_count) {
      throw new Error(`SVL-R07 ${branch.animation_key} object/particle/channel graph mismatch: ${JSON.stringify({
        objects: clear.hudSerializedComponentPaths?.length,
        particles: clear.hudGameClearParticleSystemCount,
        channels: clear.hudGameClearChannelValuesBits?.length,
      })}`);
    }
    if (verifyUvFrame && !uvFramebufferVerified) {
      uvFramebufferVerified = await verifyGameClearUv11Framebuffer(app, session, sevenVisual);
    }
    const phaseFramebuffer = await captureGameClearBranchFramebuffer(app, session, branch.animation_key, false);
    phaseDigests.push(phaseFramebuffer.sha256);
  }
  const framebufferPartition = phaseDigests.map((digest) => phaseDigests.indexOf(digest));
  const channelPartition = phaseChannelSignatures.map((signature) => phaseChannelSignatures.indexOf(signature));
  if (phaseDigests.length !== 8 || new Set(phaseDigests).size !== 6 ||
      JSON.stringify(framebufferPartition) !== JSON.stringify(channelPartition)) {
    throw new Error(`SVL-R07 ${branch.animation_key} production branch did not materialize the independent eight-phase/six-state matrix: ${JSON.stringify({ phaseDigests, framebufferPartition, channelPartition })}`);
  }
  const finalBits = JSON.stringify(requiredGameClearSnapshot(session).hudGameClearChannelValuesBits);
  const finalFramebuffer = await captureGameClearBranchFramebuffer(app, session, branch.animation_key, false);
  sampleGameClear(session, Math.fround(3.232 - previousPhase));
  const held = requiredGameClearSnapshot(session);
  const heldFramebuffer = await captureGameClearBranchFramebuffer(app, session, branch.animation_key, false);
  const rejectedEarlyHideFramebuffer = await captureGameClearBranchFramebuffer(app, session, branch.animation_key, true);
  if (held.visible !== true || held.activeAnimationRole !== "game-clear" ||
      JSON.stringify(held.hudGameClearChannelValuesBits) !== finalBits ||
      finalFramebuffer.sha256 !== heldFramebuffer.sha256 ||
      heldFramebuffer.sha256 === rejectedEarlyHideFramebuffer.sha256 ||
      heldFramebuffer.nonTransparentPixels <= 0) {
    throw new Error(`SVL-R06 ${branch.animation_key} production framebuffer did not hold its final branch or reject clip-stop disappearance: ${JSON.stringify({ finalFramebuffer, heldFramebuffer, rejectedEarlyHideFramebuffer })}`);
  }
  if (verifyUvFrame && !uvFramebufferVerified) {
    throw new Error("SVL-R01 uvFrame=11 was not materialized during the complete Full Combo phase matrix");
  }
  return Object.freeze({ animationKey: branch.animation_key, phaseDigests: Object.freeze(phaseDigests) });
}

function assertGameClearSceneExit(session: BrowserSession): void {
  const held = requiredGameClearSnapshot(session);
  const threshold = Math.fround(3.233);
  if (held.animationElapsedSeconds === null || held.animationElapsedSeconds === undefined ||
      held.animationElapsedSeconds >= threshold) {
    throw new Error(`SVL-R06 pre-exit final hold is not below 3.233 seconds: ${JSON.stringify(held)}`);
  }
  sampleGameClear(session, Math.fround(threshold - held.animationElapsedSeconds));
  const atThreshold = requiredGameClearSnapshot(session);
  if (atThreshold.visible !== true || atThreshold.animationElapsedSeconds !== threshold) {
    throw new Error(`SVL-R06 exact Float32 3.233-second threshold did not retain the final frame: ${JSON.stringify(atThreshold)}`);
  }
  sampleGameClear(session, Math.fround(0.000001));
  const clear = session.renderer.sceneSnapshot().find((row) => row.renderObjectId === "render:hud:game-clear");
  if (clear !== undefined) {
    throw new Error(`SVL-R06 first Float32 value above 3.233-second scene exit did not release the branch graph: ${JSON.stringify(clear)}`);
  }
}

async function captureGameClearBranchFramebuffer(
  app: Application,
  session: BrowserSession,
  animationKey: string,
  hideBranch: boolean,
): Promise<Readonly<{ readonly sha256: string; readonly nonTransparentPixels: number }>> {
  const rootLabel = animationKey === "FullCombo_text_in"
    ? "game-clear:FullComboAnimation"
    : "game-clear:AllPerfectAnimation";
  const branchRoot = session.renderer.stage.getChildByLabel(rootLabel, true);
  const particles = session.renderer.stage.getChildByLabel("game-clear-particles", true);
  if (branchRoot === null || particles === null) {
    throw new Error(`SVL-R06 production branch framebuffer owner is absent: ${rootLabel}`);
  }
  const branchVisible = branchRoot.visible;
  const particlesVisible = particles.visible;
  particles.visible = false;
  if (hideBranch) branchRoot.visible = false;
  app.render();
  const framebuffer = readWebGlFramebufferRgba(app, WIDTH, HEIGHT);
  let nonTransparentPixels = 0;
  for (let index = 3; index < framebuffer.length; index += 4) {
    if (framebuffer[index] !== 0) nonTransparentPixels += 1;
  }
  const result = Object.freeze({
    sha256: await sha256(framebuffer),
    nonTransparentPixels,
  });
  branchRoot.visible = branchVisible;
  particles.visible = particlesVisible;
  app.render();
  return result;
}

function requiredGameClearSnapshot(session: BrowserSession): ReturnType<PixiRendererBackend["sceneSnapshot"]>[number] {
  const clear = session.renderer.sceneSnapshot().find((row) => row.renderObjectId === "render:hud:game-clear");
  if (clear === undefined) throw new Error("game-clear production owner is absent");
  return clear;
}

async function verifyGameClearUv11Framebuffer(
  app: Application,
  session: BrowserSession,
  sevenVisual: any,
): Promise<boolean> {
  const sourceNode = findDescendantTexturedNode(session.renderer.stage, (texture) =>
    texture.label?.includes("Tex_parSet_1") === true && texture.label.endsWith(":uv:11"));
  if (sourceNode === null) return false;
  const particleColor = (sourceNode as unknown as { readonly particleLinearColor?: readonly number[] }).particleLinearColor;
  if (!(sourceNode instanceof Mesh) || particleColor === undefined || particleColor[3] === 1) {
    throw new Error("SVL-R01 game-clear uvFrame=11 did not consume the shared non-unit-alpha Linear Float32 particle mesh");
  }
  const selected = sourceNode.texture;
  const worldBounds = sourceNode.getBounds();
  if (worldBounds.x + worldBounds.width <= 0 || worldBounds.x >= WIDTH ||
      worldBounds.y + worldBounds.height <= 0 || worldBounds.y >= HEIGHT) {
    throw new Error(`SVL-R01 production game-clear particle stayed outside the physical framebuffer: ${JSON.stringify(worldBounds)}`);
  }
  const contract = sevenVisual.particle_texture_material_color_blend;
  const tileWidth = selected.source.width / contract.tiles[0];
  const tileHeight = selected.source.height / contract.tiles[1];
  if (selected.frame.x !== contract.selected_tile.column * tileWidth ||
      selected.frame.y !== contract.selected_tile.row_from_top * tileHeight ||
      String(selected.source.scaleMode) !== "linear") {
    throw new Error(`SVL-R01 game-clear uvFrame=11 selected the wrong top-left raster tile: ${JSON.stringify(selected.frame)}`);
  }
  const rejected = new Texture({
    source: selected.source,
    frame: new Rectangle(
      contract.rejected_vertical_inversion_tile.column * tileWidth,
      contract.rejected_vertical_inversion_tile.row_from_top * tileHeight,
      tileWidth,
      tileHeight,
    ),
    orig: new Rectangle(0, 0, tileWidth, tileHeight),
    label: "svl-r01-rejected-vertical-inversion-tile",
  });
  const selectedDigest = await renderIsolatedGameClearTile(
    app, selected, tileWidth, tileHeight, particleColor as readonly [number, number, number, number],
  );
  const rejectedDigest = await renderIsolatedGameClearTile(
    app, rejected, tileWidth, tileHeight, particleColor as readonly [number, number, number, number],
  );
  const rejectedTwiceAlphaDigest = await renderIsolatedGameClearTile(
    app,
    selected,
    tileWidth,
    tileHeight,
    Object.freeze([
      particleColor[0]! * particleColor[3]!,
      particleColor[1]! * particleColor[3]!,
      particleColor[2]! * particleColor[3]!,
      particleColor[3]!,
    ] as const),
  );
  rejected.destroy(false);
  if (new Set([selectedDigest.sha256, rejectedDigest.sha256, rejectedTwiceAlphaDigest.sha256]).size !== 3 ||
      selectedDigest.nonBlackPixels <= 0 || rejectedDigest.nonBlackPixels <= 0 ||
      rejectedTwiceAlphaDigest.nonBlackPixels <= 0) {
    throw new Error(`SVL-R01 production particle framebuffer did not reject wrong-row and twice-alpha variants: ${JSON.stringify({ selectedDigest, rejectedDigest, rejectedTwiceAlphaDigest })}`);
  }
  return true;
}

async function renderIsolatedGameClearTile(
  app: Application,
  texture: Texture,
  width: number,
  height: number,
  color: readonly [number, number, number, number],
): Promise<{ readonly sha256: string; readonly nonBlackPixels: number }> {
  const previousVisibility = app.stage.children.map((child) => child.visible);
  for (const child of app.stage.children) child.visible = false;
  const root = new Container({ label: "svl-r01-isolated-game-clear-tile" });
  const background = new Sprite(Texture.WHITE);
  background.tint = 0x000000;
  background.width = width;
  background.height = height;
  const sprite = createPixiParticleLinearColorMesh(
    texture,
    "svl-r01-production-variant",
    color[0],
    color[1],
    color[2],
    color[3],
  );
  sprite.scale.set(width / texture.width, height / texture.height);
  sprite.blendMode = "add";
  root.addChild(background, sprite);
  const output = installPixiLinearOutput(root, WIDTH, HEIGHT);
  app.stage.addChild(root);
  app.render();
  const framebuffer = readWebGlFramebufferRgba(app, WIDTH, HEIGHT);
  const pixels = crop(framebuffer, WIDTH, 0, 0, width, height);
  let nonBlackPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] !== 0 || pixels[index + 1] !== 0 || pixels[index + 2] !== 0) nonBlackPixels += 1;
  }
  const result = Object.freeze({ sha256: await sha256(pixels), nonBlackPixels });
  output.dispose();
  root.removeFromParent();
  destroyPixiParticleLinearColorMesh(sprite);
  background.destroy({ texture: false, textureSource: false });
  root.destroy({ children: true });
  app.stage.children.forEach((child, index) => { child.visible = previousVisibility[index] ?? child.visible; });
  return result;
}

function findDescendantTexturedNode(
  root: Container,
  predicate: (texture: Texture) => boolean,
): Sprite | Mesh | null {
  for (const child of root.children) {
    if ((child instanceof Sprite || child instanceof Mesh) && predicate(child.texture)) return child;
    if (child instanceof Container) {
      const nested = findDescendantTexturedNode(child, predicate);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function assertGameClearWhite(session: BrowserSession): void {
  const clear = session.renderer.sceneSnapshot().find((row) => row.renderObjectId === "render:hud:game-clear");
  const visible = clear?.hudSpriteNodes?.filter((sprite) => sprite.visible) ?? [];
  if (visible.length > 0 && visible.some((sprite) => sprite.tint !== 0xffffff)) {
    throw new Error(`game-clear serialized white tint mismatch: ${visible.map((sprite) => sprite.tint).join("|")}`);
  }
}

async function advanceToPlayable(session: BrowserSession): Promise<void> {
  for (let frame = 0; frame < 120; frame += 1) {
    if (requireOk(session.engine.snapshot()).managers.startupDirection?.playable !== false) return;
    requireOk(session.engine.step(DELTA, session.id.includes("manual") ? { touches: [] } : undefined));
  }
  throw new Error(`session did not become playable: ${session.id}`);
}

async function runAutoScenario(
  app: Application,
  session: BrowserSession,
  captures: FrameCapture[],
): Promise<void> {
  const captured = new Set(captures.map((entry) => entry.label));
  const pauseLayout = requireOk(createPauseControlLayout(session.layout.surfaceLayout));
  const pauseOwner = new PauseControlSceneOwner();
  const playingPauseState = pauseOwner.snapshot(LIVE_AUTO_MODE, pauseLayout, true);
  requireOk(session.controlOverlay.publishPauseControlState(playingPauseState));
  let completed = false;
  for (let frame = 1; frame <= 1400; frame += 1) {
    if (frame === 140) {
      requireOk(session.engine.pause());
      requireOk(session.controlOverlay.publishPauseControlState(Object.freeze({ ...playingPauseState, state: "pause-menu" as const })));
      requireOk(session.engine.step(DELTA));
      const pauseWindowOwner = session.controlOverlay.root.getChildByLabel("RetryablePauseDialog/Window", true);
      if (pauseWindowOwner === null) throw new Error("RetryablePauseDialog serialized graph missing");
      captures.push(await capture(app, session, "pause", frame));
      requireOk(session.controlOverlay.publishPauseControlState(Object.freeze({ ...playingPauseState, state: "retry-confirm" as const })));
      if (session.controlOverlay.root.getChildByLabel("SelectableCommonDialog/Window/Header", true) === null) {
        throw new Error("SelectableCommonDialog serialized component graph missing");
      }
      captures.push(await capture(app, session, "pause-retry-confirm", frame));
      requireOk(session.controlOverlay.publishPauseControlState(Object.freeze({ ...playingPauseState, state: "abort-confirm" as const })));
      if (session.controlOverlay.root.getChildByLabel("RhythmGameRetireAnnotatedDialog/Window/AnnotatedText", true) === null) {
        throw new Error("RhythmGameRetireAnnotatedDialog serialized component graph missing");
      }
      captures.push(await capture(app, session, "pause-abort-confirm", frame));
      requireOk(session.controlOverlay.publishPauseControlState(Object.freeze({ ...playingPauseState, state: "pause-menu" as const })));
      if (session.controlOverlay.root.getChildByLabel("RetryablePauseDialog/Window", true) !== pauseWindowOwner) {
        throw new Error("Pause component owner was rebuilt instead of reactivated");
      }
      requireOk(session.controlOverlay.publishPauseControlState(Object.freeze({ ...playingPauseState, state: "resume-countdown" as const, resumeCountdownSecondsRemaining: Math.fround(2.4) })));
      captures.push(await capture(app, session, "pause-resume-countdown", frame));
      requireOk(session.engine.resume());
      requireOk(session.controlOverlay.publishPauseControlState(playingPauseState));
      requireOk(session.engine.step(DELTA));
      captures.push(await capture(app, session, "resume", frame));
      for (const label of ["pause", "pause-retry-confirm", "pause-abort-confirm", "pause-resume-countdown", "resume"]) captured.add(label);
      continue;
    }
    requireOk(session.engine.step(DELTA));
    const scene = session.renderer.sceneSnapshot();
    const visibleNote = scene.some((row) => row.visible &&
      ["note-root", "note-head", "note-intermediate", "note-side-visual"].includes(row.role));
    if (visibleNote && !captured.has("note-spawn")) await captureOnce(app, session, captures, captured, "note-spawn", frame);
    if (scene.some((row) => row.activeAnimationRole?.startsWith("note-") && (row.animationElapsedSeconds ?? 0) > 0) &&
        !captured.has("note-animation")) {
      await captureOnce(app, session, captures, captured, "note-animation", frame);
    }
    const result = scene.find((row) => row.renderObjectId === "render:hud:result");
    if (result?.visible && !captured.has("judgement")) await captureOnce(app, session, captures, captured, "judgement", frame);
    const combo = scene.find((row) => row.renderObjectId === "render:hud:combo");
    const addScore = scene.find((row) => row.renderObjectId.startsWith("render:hud:add-score") && row.visible);
    if (combo?.visible && addScore !== undefined && !captured.has("combo-add-score")) {
      await captureOnce(app, session, captures, captured, "combo-add-score", frame);
    }
    const score = scene.find((row) => row.renderObjectId === "render:hud:score");
    const rank = (score?.hudState as { readonly rank?: number } | null)?.rank;
    const rankLabel = rank === 3 ? "rank-c" : rank === 2 ? "rank-b" : rank === 1 ? "rank-a" :
      rank === 0 ? "rank-s" : rank === 5 ? "rank-ss" : null;
    if (rankLabel !== null && !captured.has(rankLabel)) {
      await captureOnce(app, session, captures, captured, rankLabel, frame);
    }
    if (session.particleRenderer.snapshot().nodeCount >= 40 && !captured.has("particle-peak")) {
      await captureOnce(app, session, captures, captured, "particle-peak", frame);
    }
    if (frame % 100 === 0) {
      const snapshot = requireOk(session.engine.snapshot());
      if (snapshot.managers.noteManager.nextBatchIndex === 656 && snapshot.adjustedMusicPosition > 5000) {
        completed = true;
        break;
      }
    }
  }
  if (!completed) throw new Error("registered full chart did not reach its bounded completion checkpoint");
}

function assertPersistentHudComponentConsumption(session: BrowserSession): void {
  const rows = session.renderer.sceneSnapshot();
  const addScore = rows.filter((row) => row.renderObjectId.startsWith("render:hud:add-score"));
  if (addScore.length !== 4 || addScore.some((row) => row.hudSpriteCount !== 7)) {
    throw new Error(`AddScore fixed 4x7 graph mismatch: ${addScore.map((row) => row.hudSpriteCount).join("|")}`);
  }
  const life = rows.find((row) => row.renderObjectId === "render:hud:life");
  const primary = life?.hudSpriteNodes?.find((node) => node.label === "life-primary");
  if (life?.visible !== true || life.hudSerializedComponentPaths?.length !== 10 ||
    life.hudSerializedComponentPaths.filter((path) => path.endsWith("/life_panel/Total")).length !== 1 ||
    primary?.visible !== true || primary.maskLabel !== "life-primary-fill-mask" || primary.width !== 224) {
    throw new Error("Life ten-component positive gauge graph is not visibly consumed");
  }
}

async function runGameOverScenario(
  app: Application,
  session: BrowserSession,
  captures: FrameCapture[],
): Promise<void> {
  let warning = false;
  let gameOver = false;
  for (let frame = 1; frame <= 800; frame += 1) {
    const stepped = session.engine.step(DELTA, { touches: [] });
    if (stepped.status !== "ok") {
      if (gameOver) break;
      throw new Error(`${stepped.capability}: ${stepped.boundary}`);
    }
    const life = session.renderer.sceneSnapshot().find((row) => row.renderObjectId === "render:hud:life");
    const state = life?.hudState as { readonly currentLife?: number; readonly warning?: boolean; readonly gameOver?: boolean } | null;
    if (!warning && (state?.warning === true || (state?.currentLife ?? 1000) <= 250)) {
      captures.push(await capture(app, session, "life-warning", frame));
      warning = true;
    }
    if (!gameOver && (state?.gameOver === true || state?.currentLife === 0)) {
      captures.push(await capture(app, session, "game-over", frame));
      gameOver = true;
      break;
    }
  }
  if (!warning || !gameOver) throw new Error(`manual no-input scenario did not expose warning/game-over: ${warning}/${gameOver}`);
}

async function runRehearsalLifeZeroScenario(
  app: Application,
  session: BrowserSession,
  captures: FrameCapture[],
): Promise<void> {
  let lifeZeroFrame = -1;
  const rehearsalDelta = 1 / 30;
  for (let frame = 1; frame <= 2400; frame += 1) {
    requireOk(session.engine.step(rehearsalDelta, { touches: [] }));
    const record = requireOk(session.engine.snapshot()).managers.scoreLifeState?.record;
    if (record?.singleGameOver) {
      lifeZeroFrame = frame;
      break;
    }
  }
  if (lifeZeroFrame < 0) throw new Error("Rehearsal Manual did not reach Life zero");
  for (let frame = 1; frame <= 30; frame += 1) {
    requireOk(session.engine.step(rehearsalDelta, { touches: [] }));
  }
  requireOk(session.controlOverlay!.updateTimeline((lifeZeroFrame + 30) * rehearsalDelta));
  const after = requireOk(session.engine.snapshot()).managers.scoreLifeState?.record;
  if (after?.currentLife !== 0 || !after.singleGameOver) {
    throw new Error("Rehearsal Life-zero record fact was not retained during continued updates");
  }
  captures.push(await capture(
    app,
    session,
    "rehearsal-life-zero-continuation",
    lifeZeroFrame + 30,
  ));
}

type BrowserSessionMode = "live-auto" | "live-manual" | "rehearsal-auto" | "rehearsal-manual";

async function createSession(
  inputs: LoadedInputs,
  id: string,
  mode: BrowserSessionMode,
): Promise<BrowserSession> {
  const identity = mode === "live-auto"
    ? LIVE_AUTO_MODE
    : mode === "live-manual"
      ? LIVE_MANUAL_MODE
      : mode === "rehearsal-auto"
        ? REHEARSAL_AUTO_MODE
        : REHEARSAL_MANUAL_MODE;
  const renderer = new PixiRendererBackend(new BrowserPixiTextureDecoder());
  const renderProvider = requireOk(ImmutableLocalRenderResourceProvider.create(inputs.renderResources));
  requireOk(await renderer.prepare(
    id, inputs.renderProfile, renderProvider, new PortableRenderResourcePreflightAdapter(),
  ));
  const layout = requireOk(createSimulatorSceneLayout(
    { revision: 0, viewportWidth: WIDTH, viewportHeight: HEIGHT, safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(WIDTH), height: Math.fround(HEIGHT) }, origin: "bottom-left" },
    {
      specificSpeed: Math.fround(11), noteSize: Math.fround(100),
      judgementAdjustValueB: 0, habahiroMeshWidthSetting: Math.fround(1), syncLineEdgeMargin: Math.fround(0),
    },
    "ordinary",
    CURRENT_ORDINARY_RENDER_BINDINGS,
  ));
  requireOk(renderer.bindOriginalSurfaceLayout(layout.surfaceLayout));
  const controlOverlay = requireOk(renderer.createInGameControlOverlay(
    identity,
    180,
    layout.surfaceLayout,
  ));
  const particleProvider = await applicationLeaseParticleProviderForTesting(
    requireParticleProvider(ImmutableLocalParticleResourceProvider.create(inputs.particleResources)),
    new PortableParticleResourcePreflightAdapter(),
  );
  const particle = new DeterministicSimulatorParticleBackend();
  const particleRenderer = new PixiParticleRendererBackend(new BrowserPixiParticleTextureDecoder());
  const particlePreflight = new PortableParticleResourcePreflightAdapter();
  requireParticle(await particle.prepare(
    id,
    Object.freeze({ gameplayTransformScaleBits: layout.particleScene.gameplayTransformScaleBits }),
    particleProvider,
    particlePreflight,
  ));
  requireParticle(await particleRenderer.prepare(id, layout.particleScene, particleProvider, particlePreflight));
  const chart = requireOk(createNoteBatchInformationList({ musicScoreData: inputs.chartText }));
  const tracing = createRecordingSimulatorBackends(renderer, particle, particleRenderer);
  const visualLifecycleAudio = new VisualLifecycleAudioBackend(id, "browser-visual-lifecycle-bgm");
  const backends: SimulatorBackends = Object.freeze({
    renderer: tracing.renderer,
    rendering: renderer,
    audio: visualLifecycleAudio,
    particles: particle,
    particleRendering: particleRenderer,
    input: tracing.input,
    resources: tracing.resources,
    lifecycle: tracing.lifecycle,
    frameRate: tracing.frameRate,
    manualInputGeometry: layout.manualInputGeometry,
    snapshot: () => tracing.snapshot(),
  });
  const engine = requireOk(createSimulatorEngine({
    chart,
    runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode: identity },
    scoreLifeState: {
      schemaVersion: 3,
      sessionId: id,
      life: {
        initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000,
        missDamage: -100, badDamage: -50,
      },
      mode: identity,
    },
    rendering: {
      sessionId: id,
      resources: CURRENT_ORDINARY_RENDER_BINDINGS,
      ordinaryNoteScene: layout.ordinaryNoteScene,
    },
    audio: {
      sessionId: id,
      bgmCue: "browser-visual-lifecycle-bgm",
      seekMilliseconds: 0,
      masterGainBits: "0x3F800000",
      bgmGainBits: "0x3F800000",
      seGainBits: "0x3F800000",
    },
    particles: { sessionId: id },
  }, backends));
  const combined = requireOk(createPixiCombinedScene(
    particleRenderer.stage,
    renderer.stage,
    undefined,
    undefined,
    particleRenderer.highSortingStage,
  ));
  const linearOutput = installPixiLinearOutput(combined.root, WIDTH, HEIGHT);
  return { id, engine, renderer, particleRenderer, combined, layout, controlOverlay, linearOutput, audio: visualLifecycleAudio, mounted: false };
}

function mount(app: Application, session: BrowserSession): void {
  if (session.mounted || session.combined.root.parent !== null) throw new Error("scene root mounted more than once");
  app.stage.addChild(session.combined.root);
  session.mounted = true;
}

function disposeSession(app: Application, session: BrowserSession) {
  requireOk(session.engine.dispose());
  requireOk(session.controlOverlay.dispose());
  session.combined.root.removeFromParent();
  session.linearOutput.dispose();
  requireOk(session.combined.dispose());
  session.mounted = false;
  const result = Object.freeze({
    rendererState: session.renderer.snapshot().state,
    renderOwners: session.renderer.snapshot().objectCount,
    renderStageChildren: session.renderer.stage.children.length,
    particleState: session.particleRenderer.snapshot().state,
    particleOwners: session.particleRenderer.snapshot().nodeCount,
    particleResources: session.particleRenderer.snapshot().resourceCount,
    particleStageChildren: session.particleRenderer.stage.children.length,
    particleHighStageChildren: session.particleRenderer.highSortingStage.children.length,
    combinedDestroyed: session.combined.root.destroyed,
    applicationStageChildren: app.stage.children.length,
  });
  if (result.rendererState !== "disposed" || result.renderOwners !== 0 || result.renderStageChildren !== 0 ||
      result.particleState !== "disposed" || result.particleOwners !== 0 || result.particleResources !== 0 ||
      result.particleStageChildren !== 0 || result.particleHighStageChildren !== 0 ||
      !result.combinedDestroyed || result.applicationStageChildren !== 0) {
    throw new Error(`session cleanup failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function captureOnce(
  app: Application,
  session: BrowserSession,
  captures: FrameCapture[],
  captured: Set<string>,
  label: string,
  frame: number,
): Promise<void> {
  captures.push(await capture(app, session, label, frame));
  captured.add(label);
}

async function capture(
  app: Application,
  session: BrowserSession,
  label: string,
  frame: number,
): Promise<FrameCapture> {
  app.render();
  const bytes = readWebGlFramebufferRgba(app, WIDTH, HEIGHT);
  const alpha = alphaObservation(bytes, WIDTH, HEIGHT);
  const crops = Object.freeze({
    hud: await sha256(crop(bytes, WIDTH, 0, 0, WIDTH, 220)),
    playfield: await sha256(crop(bytes, WIDTH, 0, 180, WIDTH, 540)),
    center: await sha256(crop(bytes, WIDTH, 400, 120, 800, 480)),
  });
  const worldObservation = observePixiWorld(session.combined.root);
  const visibleWorldRecords = worldObservation.records.filter((record) =>
    record.visible && record.renderable && record.worldBounds !== null &&
    intersects(record.worldBounds, [WIDTH, HEIGHT])).length;
  if (label === "initialize") {
    const autoCaption = worldObservation.records.find((row) => row.label === "auto-live-caption-root");
    if (autoCaption === undefined) throw new Error("Auto Live caption was not instantiated during startup before playable");
  }
  if (label === "pause") {
    const record = (name: string) => worldObservation.records.find((row) => row.label === name);
    const dialog = record("RetryablePauseDialog");
    const window = record("RetryablePauseDialog/Window");
    const header = record("RetryablePauseDialog/Window/Header");
    const title = record("RetryablePauseDialog/Window/Title");
    const pauseButton = record("original-pause-button");
    if (dialog === undefined || window === undefined || header === undefined || title === undefined ||
        pauseButton?.visible !== true ||
        JSON.stringify(dialog.localMatrix.slice(4)) !== JSON.stringify([WIDTH / 2, HEIGHT / 2]) ||
        JSON.stringify(window.localMatrix) !== JSON.stringify([1, 0, 0, 1, 0, 0]) ||
        JSON.stringify(header.localMatrix.slice(4)) !== JSON.stringify([0, -115]) ||
        JSON.stringify(title.localMatrix.slice(4)) !== JSON.stringify([-391, 1])) {
      throw new Error(`Pause serialized hierarchy mismatch: ${JSON.stringify({ dialog, window, header, title, pauseButton })}`);
    }
    const pauseText = session.controlOverlay.root.getChildByLabel("pause-message", true) as any;
    if (pauseText?.style.wordWrap !== true || pauseText.style.wordWrapWidth !== 900) {
      throw new Error("Pause UILabel does not consume its serialized 900x114 text box and wrapping owner");
    }
  }
  if (label === "pause-resume-countdown") {
    for (const component of ["Contents", "Contents/Count3", "Contents/Count2", "Contents/Count1", "Contents/Count1Fadeout", "Contents/Fill"]) {
      if (session.controlOverlay.root.getChildByLabel(component, true) === null) {
        throw new Error(`Resume countdown persistent component is missing: ${component}`);
      }
    }
  }
  const root = worldObservation.records.find((record) => record.parent === null);
  const stageChildren = worldObservation.records.filter((record) => record.parent === root?.path)
    .map((record) => record.label);
  const ordinary = worldObservation.records.find((record) =>
    record.parent === root?.path && record.label === "GarupaSimulatorRoot");
  const particle = worldObservation.records.find((record) =>
    record.parent === ordinary?.path && record.label === "GarupaSimulatorParticles");
  const particleHigh = worldObservation.records.find((record) =>
    record.parent === ordinary?.path && record.label === "GarupaSimulatorParticlesHigh");
  if (root?.label !== "GarupaSimulatorCombinedScene" ||
      JSON.stringify(stageChildren) !== JSON.stringify(["GarupaSimulatorRoot"]) ||
      particle === undefined || particle.order[1] !== 2_000_000 ||
      particleHigh === undefined || particleHigh.order[1] !== 2_050_000) {
    throw new Error(`combined root observation mismatch: ${root?.label}/${stageChildren.join("|")}`);
  }
  const renderRows = session.renderer.sceneSnapshot();
  if (label === "natural-completion") {
    const score = renderRows.find((row) => row.renderObjectId === "render:hud:score");
    const terminalLife = renderRows.find((row) => row.renderObjectId === "render:hud:life");
    const fieldStillVisible = renderRows.some((row) =>
      row.visible && (row.role === "field-line" || row.role === "judge-line"));
    const pause = worldObservation.records.find((row) => row.label === "original-pause-button");
    const autoCaption = worldObservation.records.find((row) => row.label === "AutoLiveCaption");
    if (score?.visible !== true || terminalLife?.visible !== true || fieldStillVisible ||
        pause?.visible !== true || autoCaption?.visible !== true) {
      throw new Error(`terminal persistent HUD/field disposition mismatch: ${JSON.stringify({
        score: score?.visible, life: terminalLife?.visible, fieldStillVisible,
        pause: pause?.visible, autoCaption: autoCaption?.visible,
      })}`);
    }
  }
  const life = renderRows.find((row) => row.renderObjectId === "render:hud:life");
  const lifeSprites = new Map(life?.hudSpriteNodes?.map((row) => [row.label, row]));
  const lifeTexts = new Map(life?.hudTextNodes?.map((row) => [row.label, row]));
  const judge = renderRows.find((row) => row.renderObjectId === "render:skin-field:judge-line");
  if (life === undefined || lifeSprites.get("life-gauge-base")?.tint !== 0xffffff ||
      lifeTexts.has("life-current-label") ||
      lifeTexts.get("life-current-segment")?.fontSize !== 18 ||
      lifeTexts.get("life-current-segment")?.fill !== (Number((life.hudState as any).currentLife) > 0 ? 0x008600 : 0xfd0411) ||
      lifeTexts.get("life-separator-segment")?.fill !== 0x141414 ||
      lifeTexts.get("life-maximum-segment")?.fill !== 0x008600 ||
      (Number((life.hudState as any).currentLife) > 0 && (
        lifeSprites.get("life-primary")?.visible !== true ||
        lifeSprites.get("life-primary")?.parentLabel !== "GamePlay/UI_Root/Display/LifeGauge/GaugeObject/hp_gauge_round/FrontGauge" ||
        !(lifeSprites.get("life-primary")?.worldBounds[2]! > 0) ||
        !(lifeSprites.get("life-primary")?.worldBounds[3]! > 0)
      )) ||
      (judge !== undefined && (judge.ordering[0] !== 2 || judge.ordering[1] !== 20)) ||
      renderRows.some((row) => row.role === "tap-lane-effect" &&
        (row.ordering[0] !== 1 || row.ordering[1] !== 0))) {
    throw new Error(`fifth HUD/world object gate mismatch at ${label}: ${JSON.stringify({
      life: life?.hudState,
      baseTint: lifeSprites.get("life-gauge-base")?.tint,
      legacyLifeTextPresent: lifeTexts.has("life-current-label"),
      fontSize: lifeTexts.get("life-current-segment")?.fontSize,
      currentFill: lifeTexts.get("life-current-segment")?.fill,
      separatorFill: lifeTexts.get("life-separator-segment")?.fill,
      maximumFill: lifeTexts.get("life-maximum-segment")?.fill,
      judgeOrdering: judge?.ordering,
      badTap: renderRows.filter((row) => row.role === "tap-lane-effect").map((row) => row.ordering),
    })}`);
  }
  if (label === "initialize") {
    const sourcePink = countExactRgb(bytes, [255, 59, 114]);
    const priorDoubleGammaPink = countExactRgb(bytes, [255, 132, 178]);
    const primaryBounds = lifeSprites.get("life-primary")?.worldBounds;
    const lifeGreen = primaryBounds === undefined ? 0 : countDominantGreen(bytes, WIDTH, HEIGHT, primaryBounds);
    if (sourcePink < 32 || priorDoubleGammaPink >= sourcePink ||
        (Number((life.hudState as any).currentLife) > 0 && lifeGreen < 16)) {
      throw new Error(`HUD raster transfer/visibility mismatch: ${JSON.stringify({
        sourcePink, priorDoubleGammaPink, lifeGreen, primaryBounds,
      })}`);
    }
  }
  const particleRows = session.particleRenderer.sceneSnapshot();
  for (const row of particleRows) {
    const expected = row.zIndex > 20_000_000_000_000 ? "high" : "low";
    if (row.sortingStage !== expected) throw new Error(`particle sorting-stage mismatch: ${row.particleId}`);
    if (row.tint !== 0xffffff || row.alpha !== 1 || row.linearColor.some((channel) => !Number.isFinite(channel))) {
      throw new Error(`particle Float32 Linear shader handoff mismatch: ${row.particleId}`);
    }
  }
  if (label === "particle-peak") {
    const meshes = [...session.particleRenderer.stage.children, ...session.particleRenderer.highSortingStage.children]
      .filter((child): child is Mesh => child instanceof Mesh);
    if (particleRows.length === 0 || meshes.length !== particleRows.length ||
        meshes.some((mesh) => mesh.shader === null ||
          !Array.isArray((mesh as unknown as { readonly particleLinearColor?: unknown }).particleLinearColor))) {
      throw new Error(`particle peak did not consume one Float32 Linear color Mesh shader per sample: ${particleRows.length}/${meshes.length}`);
    }
  }
  const laneRows = renderRows.filter((row) => row.role === "tap-lane-effect")
    .sort((left, right) => Number(left.renderObjectId.slice(left.renderObjectId.lastIndexOf(":") + 1)) -
      Number(right.renderObjectId.slice(right.renderObjectId.lastIndexOf(":") + 1)));
  if (laneRows.length !== 13 || laneRows.some((row, index) =>
      ((row.spriteLocalScale?.[0] ?? 1) < 0) !== (index >= 8) ||
      row.spriteMaskInteraction !== "visible-outside")) {
    throw new Error("fresh browser Lane graph does not consume exact flipX and VisibleOutsideMask owners");
  }
  return Object.freeze({
    label,
    frame,
    rgbaSha256: await sha256(bytes),
    crops,
    nonTransparentPixels: alpha.count,
    alphaBounds: alpha.bounds,
    worldObservation,
    owners: Object.freeze({
      render: session.renderer.snapshot().objectCount,
      particles: session.particleRenderer.snapshot().nodeCount,
      visibleWorldRecords,
      textureRecords: worldObservation.records.filter((record) => record.texture !== null).length,
      maskConsumers: worldObservation.records.filter((record) => record.mask !== null).length,
    }),
  });
}

async function loadInputs(): Promise<LoadedInputs> {
  const map = await fetchJson<InputMap>("/input-map.json");
  const [base, visibleRaw, scoreAnimationRaw, gameClearRaw, pauseCountdownRaw, strict, sevenVisual, gameClearAssets, chartText] = await Promise.all([
    fetchJson<RenderResourceProfile>("/render-profile.json"),
    fetchJson("/visible-profile.json"),
    fetchJson("/score-animation.json"),
    fetchJson("/game-clear-profile.json"),
    fetchJson("/pause-countdown-animation.json"),
    fetchJson("/strict-reaudit.json"),
    fetchJson<any>("/seven-visual-oracle.json"),
    fetchJson<RenderResourceProfile["assets"]>("/game-clear-assets.json"),
    fetchText("/chart.bms"),
  ]);
  const visible = parseCurrentOrdinaryVisibleProfile(visibleRaw);
  const scoreAnimation = parseCurrentScoreGaugeSsAnimationProfile(scoreAnimationRaw);
  const gameClearProfile = parseCurrentGameClearProfile(gameClearRaw);
  const pauseCountdownAnimation = parseCurrentPauseCountdownAnimationProfile(pauseCountdownRaw);
  if (visible === null || scoreAnimation === null || gameClearProfile === null || pauseCountdownAnimation === null) throw new Error("current rendering profiles did not parse");
  const renderProfile: RenderResourceProfile = Object.freeze({
    ...base,
    packIdentity: `${base.packIdentity}+ordinary-visible-webview2+score-webview2`,
    assets: Object.freeze([
      ...base.assets.map((asset) => asset.textureSettings === null ? asset : Object.freeze({
        ...asset,
        textureSettings: Object.freeze({ ...asset.textureSettings, premultiplyAlpha: false }),
      })),
      ...CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES.map((entry) => entry.profile),
      ...augmentScoreHudProfilesForPause(CURRENT_SCORE_HUD_PORTABLE_RESOURCES.map((entry) => entry.profile)),
      ...gameClearAssets,
    ]),
    ordinaryVisibleProfile: visible,
    scoreGaugeSsAnimation: scoreAnimation,
    gameClearProfile,
    pauseCountdownAnimation,
  });
  const renderResources = await loadMappedBytes(map.render);
  const particleResources = await loadMappedBytes(map.particle);
  if (renderResources.length !== renderProfile.assets.length || particleResources.length !== 9) {
    throw new Error(`input resource inventory mismatch: ${renderResources.length}/${particleResources.length}`);
  }
  if (sevenVisual.status !== "confirmed-current-seven-visual-lifecycle-reconfirmation") {
    throw new Error("SVL-R01..R07 independent fixture status mismatch");
  }
  return Object.freeze({ chartText, strict, sevenVisual, renderProfile, renderResources, particleResources });
}

async function loadMappedBytes(rows: readonly { readonly logicalAssetId: string; readonly url: string }[]) {
  return Object.freeze(await Promise.all(rows.map(async (row) => Object.freeze({
    logicalAssetId: row.logicalAssetId,
    bytes: await fetchBytes(row.url),
  }))));
}

function crop(
  source: Uint8Array,
  sourceWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
): Uint8Array {
  const output = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const begin = ((y + row) * sourceWidth + x) * 4;
    output.set(source.subarray(begin, begin + width * 4), row * width * 4);
  }
  return output;
}

function countExactRgb(bytes: Uint8Array, rgb: readonly [number, number, number]): number {
  let count = 0;
  for (let index = 0; index < bytes.length; index += 4) {
    if (bytes[index] === rgb[0] && bytes[index + 1] === rgb[1] && bytes[index + 2] === rgb[2] && bytes[index + 3]! > 0) count += 1;
  }
  return count;
}

function countDominantGreen(
  bytes: Uint8Array,
  width: number,
  height: number,
  bounds: readonly [number, number, number, number],
): number {
  const left = Math.max(0, Math.floor(bounds[0]));
  const top = Math.max(0, Math.floor(bounds[1]));
  const right = Math.min(width, Math.ceil(bounds[0] + bounds[2]));
  const bottom = Math.min(height, Math.ceil(bounds[1] + bounds[3]));
  let count = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * 4;
      const red = bytes[offset]!;
      const green = bytes[offset + 1]!;
      const blue = bytes[offset + 2]!;
      if (bytes[offset + 3]! > 0 && green >= 96 && green > red * 1.2 && green > blue * 1.1) count += 1;
    }
  }
  return count;
}

function alphaObservation(bytes: Uint8Array, width: number, height: number) {
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
  if (count === 0) throw new Error("complete ordinary browser frame is transparent");
  return Object.freeze({ count, bounds: Object.freeze([minX, minY, maxX, maxY] as const) });
}

function intersects(bounds: readonly [number, number, number, number], viewport: readonly [number, number]): boolean {
  return bounds[0] + bounds[2] > 0 && bounds[0] < viewport[0] &&
    bounds[1] + bounds[3] > 0 && bounds[1] < viewport[1];
}

async function fetchJson<T = unknown>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store", credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`fixture fetch failed: ${path} ${response.status}`);
  return await response.json() as T;
}

async function fetchText(path: string): Promise<string> {
  const response = await fetch(path, { cache: "no-store", credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`fixture fetch failed: ${path} ${response.status}`);
  return await response.text();
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(path, { cache: "no-store", credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`fixture fetch failed: ${path} ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

class VisualLifecycleAudioBackend implements SimulatorAudioBackend {
  readonly id = "testing-visual-lifecycle-audio";
  private state: AudioBackendSnapshot["state"] = "ready";
  private nextSequence = 0;
  private pending: { readonly batch: AudioCommandBatch; readonly commands: readonly AudioCommand[] } | null = null;
  private readonly commands: AudioCommand[] = [];
  private bgmEnded = false;

  constructor(
    private readonly sessionId: string,
    private readonly cue: string,
  ) {}

  async prepare(
    _sessionId: string,
    _profile: AudioResourceProfileSet,
    _provider: AudioResourceProvider,
    _preflight: AudioResourcePreflightAdapter,
  ): Promise<AudioOperationResult<void>> {
    return audioRejected("integrity-failure", "test.visual-audio.already-ready", "testing visual lifecycle audio is explicitly ready");
  }

  preflight(commands: readonly AudioCommand[]): AudioOperationResult<AudioCommandBatch> {
    if (this.state !== "ready" || this.pending !== null || !Array.isArray(commands)) {
      return audioRejected("integrity-failure", "test.visual-audio.invalid-preflight", "invalid visual lifecycle audio batch");
    }
    const batch = Object.freeze({
      sessionId: this.sessionId,
      firstSequence: this.nextSequence,
      commandCount: commands.length,
    });
    this.pending = Object.freeze({ batch, commands: Object.freeze(commands.map((command) => Object.freeze({ ...command }))) });
    return audioAccepted(batch);
  }

  commit(batch: AudioCommandBatch): AudioOperationResult<void> {
    if (this.pending?.batch !== batch) {
      return audioRejected("integrity-failure", "test.visual-audio.invalid-commit", "foreign visual lifecycle audio batch");
    }
    this.commands.push(...this.pending.commands);
    this.nextSequence += this.pending.commands.length;
    this.pending = null;
    return audioAccepted(undefined);
  }

  discard(batch: AudioCommandBatch): AudioOperationResult<void> {
    if (this.pending?.batch !== batch) {
      return audioRejected("integrity-failure", "test.visual-audio.invalid-discard", "foreign visual lifecycle audio batch");
    }
    this.pending = null;
    return audioAccepted(undefined);
  }

  execute(command: AudioCommand): AudioOperationResult<void> {
    const batch = this.preflight([command]);
    return batch.status === "accepted" ? this.commit(batch.value) : batch;
  }

  markBgmEnded(): void {
    if (this.state !== "ready") throw new Error("visual lifecycle BGM may end only while ready");
    this.bgmEnded = true;
  }

  getBgmPlaybackState() { return audioAccepted(this.bgmEnded ? "ended" as const : "playing" as const); }

  recordTerminalFault(capability: string, boundary: string): AudioOperationResult<never> {
    this.state = "faulted";
    return audioRejected("audio-backend-fault", capability, boundary);
  }

  snapshot(): AudioBackendSnapshot {
    return Object.freeze({
      state: this.state,
      sessionId: this.state === "disposed" ? null : this.sessionId,
      profileId: "session-external-portable-v1" as const,
      fidelity: "semantic-exact-portable-equivalent-lossy" as const,
      preparedBgmCue: this.state === "disposed" ? null : this.cue,
      nextSequence: this.nextSequence,
      resourceCount: 0,
      semantic: Object.freeze({
        sessionOpened: this.commands.some((command) => command.kind === "session.open"),
        bgmCue: this.cue,
        bgmPaused: false,
        sePaused: false,
        allPaused: false,
        holds: Object.freeze([]),
        startupLoops: Object.freeze([]),
        gain: null,
      }),
      commands: Object.freeze(this.commands.map((command) => Object.freeze({ ...command }))),
      fault: null,
    });
  }

  dispose(): AudioOperationResult<void> {
    this.pending = null;
    this.state = "disposed";
    return audioAccepted(undefined);
  }
}

function requireOk<T>(result: SimulatorResult<T>): T {
  if (result.status !== "ok") throw new Error(`${result.capability}: ${result.boundary}`);
  return result.value;
}

function requireParticle<T>(result: ParticleOperationResult<T>): T {
  if (result.status !== "accepted") throw new Error(`${result.failure.capability}: ${result.failure.boundary}`);
  return result.value;
}

function requireParticleProvider(result: ReturnType<typeof ImmutableLocalParticleResourceProvider.create>): ParticleResourceProvider {
  return requireParticle(result);
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
