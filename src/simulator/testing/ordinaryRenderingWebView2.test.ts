import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
import {
  LIVE_AUTO_MODE,
  LIVE_MANUAL_MODE,
  REHEARSAL_AUTO_MODE,
  REHEARSAL_MANUAL_MODE,
} from "./modeFixtures";
import { Application } from "pixi.js";
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
  captures.push(await capture(app, auto, "initialize", 0));
  await runAutoScenario(app, auto, captures);
  requireOk(auto.engine.completeLiveAudio(3));
  captures.push(await capture(app, auto, "natural-completion", 1401));
  const naturalClearStatus = auto.engine.getNaturalCompletionClearStatus();
  const autoCleanup = disposeSession(app, auto);

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
  const rehearsalManualCleanup = disposeSession(app, rehearsalManual);

  const rehearsalAuto = await createSession(
    inputs,
    "ordinary-webview2-rehearsal-auto",
    "rehearsal-auto",
  );
  mount(app, rehearsalAuto);
  requireOk(rehearsalAuto.engine.initialize());
  captures.push(await capture(app, rehearsalAuto, "rehearsal-auto-demo-controls", 0));
  const rehearsalAutoCleanup = disposeSession(app, rehearsalAuto);

  const requiredLabels = [
    "initialize", "note-spawn", "note-animation", "judgement", "combo-add-score",
    "rank-c", "rank-b", "rank-a", "rank-s", "rank-ss", "particle-peak",
    "pause", "pause-retry-confirm", "pause-abort-confirm", "pause-resume-countdown", "resume", "natural-completion", "life-warning", "game-over",
    "rehearsal-manual-controls", "rehearsal-life-zero-continuation",
    "rehearsal-forward-five-controls", "rehearsal-return-five-controls",
    "rehearsal-auto-demo-controls",
  ];
  const labels = new Set(captures.map((entry) => entry.label));
  for (const label of requiredLabels) if (!labels.has(label)) throw new Error(`required browser event was not captured: ${label}`);
  if (captures.some((entry) => entry.nonTransparentPixels <= 0 || entry.owners.visibleWorldRecords <= 0)) {
    throw new Error("every complete-scene event requires visible actual Pixi pixels and world records");
  }
  if (naturalClearStatus !== 3) throw new Error(`natural completion clear status mismatch: ${naturalClearStatus}`);
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
    }),
    cleanup: Object.freeze({
      auto: autoCleanup,
      manual: manualCleanup,
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
      captures.push(await capture(app, session, "pause", frame));
      requireOk(session.controlOverlay.publishPauseControlState(Object.freeze({ ...playingPauseState, state: "retry-confirm" as const })));
      captures.push(await capture(app, session, "pause-retry-confirm", frame));
      requireOk(session.controlOverlay.publishPauseControlState(Object.freeze({ ...playingPauseState, state: "abort-confirm" as const })));
      captures.push(await capture(app, session, "pause-abort-confirm", frame));
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
  return { id, engine, renderer, particleRenderer, combined, layout, controlOverlay, linearOutput, mounted: false };
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
  const life = renderRows.find((row) => row.renderObjectId === "render:hud:life");
  const lifeSprites = new Map(life?.hudSpriteNodes?.map((row) => [row.label, row]));
  const lifeTexts = new Map(life?.hudTextNodes?.map((row) => [row.label, row]));
  const judge = renderRows.find((row) => row.renderObjectId === "render:skin-field:judge-line");
  if (life === undefined || lifeSprites.get("life-gauge-base")?.tint !== 0xffffff ||
      lifeTexts.has("life-current-label") ||
      lifeTexts.get("life-current-segment")?.fontSize !== 18 ||
      lifeTexts.get("life-current-segment")?.fill !== (Number((life.hudState as any).currentLife) > 0 ? 0x00c000 : 0xfe2349) ||
      lifeTexts.get("life-separator-segment")?.fill !== 0x505050 ||
      lifeTexts.get("life-maximum-segment")?.fill !== 0x00c000 ||
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
  for (const row of session.particleRenderer.sceneSnapshot()) {
    const expected = row.zIndex >= 50_000_000 ? "high" : "low";
    if (row.sortingStage !== expected) throw new Error(`particle sorting-stage mismatch: ${row.particleId}`);
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
  const [base, visibleRaw, scoreAnimationRaw, chartText] = await Promise.all([
    fetchJson<RenderResourceProfile>("/render-profile.json"),
    fetchJson("/visible-profile.json"),
    fetchJson("/score-animation.json"),
    fetchText("/chart.bms"),
  ]);
  const visible = parseCurrentOrdinaryVisibleProfile(visibleRaw);
  const scoreAnimation = parseCurrentScoreGaugeSsAnimationProfile(scoreAnimationRaw);
  if (visible === null || scoreAnimation === null) throw new Error("current rendering profiles did not parse");
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
    ]),
    ordinaryVisibleProfile: visible,
    scoreGaugeSsAnimation: scoreAnimation,
  });
  const renderResources = await loadMappedBytes(map.render);
  const particleResources = await loadMappedBytes(map.particle);
  if (renderResources.length !== renderProfile.assets.length || particleResources.length !== 9) {
    throw new Error(`input resource inventory mismatch: ${renderResources.length}/${particleResources.length}`);
  }
  return Object.freeze({ chartText, renderProfile, renderResources, particleResources });
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

  getBgmPlaybackState() { return audioAccepted("playing" as const); }

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
