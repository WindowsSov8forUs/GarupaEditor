import { Application, Rectangle, Texture } from "pixi.js";
import { BrowserPixiTextureDecoder } from "../../../backends/pixi/browserPixiTextureDecoder";
import { installPixiLinearOutput } from "../../../backends/pixi/pixiLinearColorPipeline";
import { createPixiStartupDirectionScene } from "../../../backends/pixi/pixiStartupDirectionScene";
import { CURRENT_SCORE_HUD_PORTABLE_RESOURCES } from "../../support/resources/currentScoreHudTestManifest";
import { CURRENT_STARTUP_DIRECTION_PORTABLE_RESOURCES } from "../../support/resources/currentStartupDirectionTestManifest";
import { deriveSessionPresentation } from "../../../assembly/sessionPresentationDerivation";
import { StartupDirectionController } from "../../../engine/managers/startupDirectionController";
import { createSimulatorModeIdentity } from "../../../engine/data/inGameCalculatedData";
import { BrowserAudioResourcePreflightAdapter } from "../../../backends/audio/browserAudioResourcePreflightAdapter";
import { WebAudioSimulatorBackend } from "../../../backends/audio/webAudioBackend";
import { audioAccepted } from "../../../backends/audioValidation";
import type {
  AudioResourcePreflightAdapter,
  AudioResourceProfile,
  AudioResourceProvider,
} from "../../../backends/audioContracts";
import {
  createAudioSessionResourceProfile,
  CURRENT_AUDIO_SE_RESOURCES,
} from "../../support/resources/currentAudioTestManifest";
import { AudioCommandProducer } from "../../../engine/audio/audioCommandProducer";
import { StartupAudioOwner } from "../../../engine/audio/startupAudioOwner";
import { createOriginalSurfaceLayout } from "../../../scene/originalSurfaceLayout";
import { readWebGlFramebufferRgba } from "../../support/platform/readWebGlFramebuffer";

const WIDTH = 1600;
const HEIGHT = 720;
const SURFACE_LAYOUT = requireOk<any>(createOriginalSurfaceLayout({
  revision: 0, viewportWidth: WIDTH, viewportHeight: HEIGHT,
  safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(WIDTH), height: Math.fround(HEIGHT) },
  origin: "bottom-left",
}, Math.fround(100)));

void main().catch((error) => window.ipc.postMessage(JSON.stringify({
  schema: "garupa-startup-direction-webview2-v3", status: "error",
  message: String(error instanceof Error ? error.message : error),
  stack: String(error instanceof Error ? error.stack ?? "" : ""),
})));

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: WIDTH, height: HEIGHT, preference: "webgl", antialias: false,
    resolution: 1, backgroundAlpha: 0, preserveDrawingBuffer: true,
    autoStart: false, sharedTicker: false,
  });
  document.body.appendChild(app.canvas);
  const linearOutput = installPixiLinearOutput(app.stage, WIDTH, HEIGHT);
  const decoder = new BrowserPixiTextureDecoder();
  const [lineBytes, uiBytes, fontBytes] = await Promise.all([
    fetchBytes("/assets/startup-line-star.png"),
    fetchBytes("/assets/ui-common.png"),
    fetchBytes("/assets/rank-label-font.ttf"),
  ]);
  const lineProfile = CURRENT_STARTUP_DIRECTION_PORTABLE_RESOURCES[0]!.profile;
  const uiProfile = CURRENT_SCORE_HUD_PORTABLE_RESOURCES.find((row) => row.profile.logicalAssetId === "hud/score/ui-common-atlas")!.profile;
  const fontProfile = CURRENT_SCORE_HUD_PORTABLE_RESOURCES.find((row) => row.profile.logicalAssetId === "hud/score/rank-label-font")!.profile;
  const line = requireOk<any>(await decoder.decodePng(lineProfile, lineBytes));
  const ui = requireOk<any>(await decoder.decodePng(uiProfile, uiBytes));
  const font = requireOk<any>(await decoder.decodeFont(fontProfile, fontBytes));
  const frame = textureFrame(ui, "bg_base_jacket_frame");
  const full = textureFrame(ui, "icon_fullmusic_gray");
  const difficulties = Object.freeze({
    EASY: textureFrame(ui, "bg_jacket_frame_rank_1_easy"),
    NORMAL: textureFrame(ui, "bg_jacket_frame_rank_1_normal"),
    HARD: textureFrame(ui, "bg_jacket_frame_rank_1_hard"),
    EXPERT: textureFrame(ui, "bg_jacket_frame_rank_1_expert"),
    SPECIAL: textureFrame(ui, "bg_jacket_frame_rank_1_special"),
  });
  const modes = [
    ["live", "manual"], ["live", "auto"],
    ["rehearsal", "manual"], ["rehearsal", "auto"],
  ] as const;
  const captures: unknown[] = [];
  let sdCharacterVisuals: number | null = null;
  for (const [sessionMode, inputMode] of modes) {
    const presentation = requireAccepted<any>(await deriveSessionPresentation({
      song: { title: "Test Song", bandName: "Test Band", lyricist: "Lyrics", composer: "Composer", arranger: "Arranger" },
      difficulty: { type: "EXPERT", level: 25 },
      jacketPng: await canvasPng(360, 360, `rgb(25 90 170)`),
      stage: {
        backdropPng: await canvasPng(1600, 720, `rgb(12 18 35)`),
      },
      mv: null,
    }));
    sdCharacterVisuals ??= presentation.sdCharacters.length;
    if (presentation.sdCharacters.length !== 0 || sdCharacterVisuals !== 0) {
      throw new Error("literal-null SD character mapping published a visual");
    }
    const scene = requireOk<any>(await createPixiStartupDirectionScene(
      presentation,
      { lineStar: line, jacketFrame: frame, difficultyFrames: difficulties, fullLiveLabel: full, fontFamily: font.family },
      decoder,
      false,
      SURFACE_LAYOUT,
    ));
    app.stage.addChild(scene.backgroundRoot, scene.foregroundRoot);
    const controller = new StartupDirectionController(createSimulatorModeIdentity(sessionMode, inputMode), scene);
    requireOk(controller.initialize());
    const wanted = new Set(["first-view", "information-hold", "information-fade", "opening-last", "music-wait", "playing-none", "playing-sound"]);
    const seen = new Set<string>();
    for (let tick = 0; tick < 500 && seen.size < wanted.size; tick += 1) {
      const phase = controller.snapshot().phase;
      if (wanted.has(phase) && !seen.has(phase)) {
        seen.add(phase);
        captures.push(await capture(app, `${sessionMode}-${inputMode}-${phase}`, controller.snapshot()));
      }
      requireOk(controller.step(Math.fround(1 / 60)));
    }
    if (seen.size !== wanted.size) throw new Error(`startup phases incomplete for ${sessionMode}/${inputMode}`);
    controller.dispose();
    if (app.stage.children.length !== 0) throw new Error("startup scene leaked stage roots");
  }
  const adaptiveCaptures = [];
  for (const [label, width, height] of [["4:3", 1200, 900], ["32:9", 2560, 720]] as const) {
    app.renderer.resize(width, height);
    linearOutput.update(width, height);
    const layout = requireOk<any>(createOriginalSurfaceLayout({
      revision: 0, viewportWidth: width, viewportHeight: height,
      safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(width), height: Math.fround(height) },
      origin: "bottom-left",
    }, Math.fround(100)));
    const presentation = requireAccepted<any>(await deriveSessionPresentation({
      song: { title: "Test Song", bandName: "Test Band", lyricist: null, composer: null, arranger: null },
      difficulty: { type: "EXPERT", level: 25 },
      jacketPng: await canvasPng(360, 360, "rgb(25 90 170)"),
      stage: { backdropPng: await canvasPng(360, 360, "rgb(12 18 35)") },
      mv: null,
    }));
    const scene = requireOk<any>(await createPixiStartupDirectionScene(
      presentation,
      { lineStar: line, jacketFrame: frame, difficultyFrames: difficulties, fullLiveLabel: full, fontFamily: font.family },
      decoder,
      false,
      layout,
    ));
    app.stage.addChild(scene.backgroundRoot, scene.foregroundRoot);
    scene.publish({
      sequence: 1, informationPhase: "holding", informationAlpha: 1,
      hudAlpha: 1, darkCoverAlpha: 0, stagePhase: "introduced", stageProgress: 1,
      characterAlpha: 0, linePhase: "hidden", lineAlpha: 0,
      gameplayVisible: false, rehearsalControlsVisible: false,
    });
    const stage = scene.backgroundRoot.getChildByLabel("StartupStageBackdrop");
    const information = scene.foregroundRoot.getChildByLabel("StartupInformation");
    const coverScale = Math.max(width / presentation.stageBackdrop.width, height / presentation.stageBackdrop.height);
    if (stage?.width !== presentation.stageBackdrop.width * coverScale ||
      stage?.height !== presentation.stageBackdrop.height * coverScale ||
      stage?.x !== width / 2 || stage?.y !== height / 2 || stage?.scale.x !== stage?.scale.y ||
      information?.x !== width / 2 || information?.y !== height / 2 ||
      information?.scale.x !== layout.ui.screenToSafeChildScale) {
      throw new Error(`${label}: adaptive startup geometry mismatch`);
    }
    adaptiveCaptures.push(await capture(app, `adaptive-${label}`, scene.snapshot(), width, height));
    scene.dispose();
  }
  app.renderer.resize(WIDTH, HEIGHT);
  linearOutput.update(WIDTH, HEIGHT);
  const audio = await runStartupAudioObservation();
  const result = Object.freeze({
    schema: "garupa-startup-direction-webview2-v4",
    status: "ok",
    runtime: { userAgent: navigator.userAgent, pixiVersion: (await import("pixi.js")).VERSION, rendererName: app.renderer.name },
    scene: { modes: 4, sdCharacterVisuals, captures, adaptiveCaptures },
    audio,
    cleanup: { stageChildren: app.stage.children.length, audioDisposed: audio.cleanup.backendState === "disposed" },
    resources: { urls: performance.getEntriesByType("resource").map((entry) => entry.name).sort() },
  });
  for (const texture of [frame, full, ...Object.values(difficulties)]) texture.destroy(false);
  line.destroy(true); ui.destroy(true); font.dispose();
  linearOutput.dispose();
  app.destroy(true, { children: true, texture: true, textureSource: true });
  window.ipc.postMessage(JSON.stringify(result));
}

async function runStartupAudioObservation(): Promise<any> {
  const userActivation = Object.freeze({
    isActive: navigator.userActivation.isActive,
    hasBeenActive: navigator.userActivation.hasBeenActive,
  });
  if (userActivation.isActive || userActivation.hasBeenActive) {
    throw new Error(`startup harness unexpectedly received user activation: ${JSON.stringify(userActivation)}`);
  }
  const context = new AudioContext();
  const initialContextState = context.state;
  const initialContextTime = context.currentTime;
  if (initialContextState !== "running") {
    throw new Error(`startup AudioContext initial state is ${initialContextState}; the supported Wry autoplay host must not need a test-side resume`);
  }
  const gayaBytes = await fetchBytes("/assets/SE_RHYTHM_GAYA.mp3");
  const gaya = CURRENT_AUDIO_SE_RESOURCES.find((resource) => resource.cue === "SE_RHYTHM_GAYA");
  if (gaya === undefined) throw new Error("startup Gaya profile missing");
  const bgm = Object.freeze({
    role: "bgm" as const,
    logicalId: "startup/webview2/session-bgm",
    cue: "startup_webview2_session_bgm",
    byteLength: gaya.byteLength,
    sha256: gaya.sha256,
    mime: "audio/mpeg" as const,
    codec: "mp3" as const,
    sampleRate: gaya.sampleRate,
    channels: gaya.channels,
    durationSeconds: gaya.durationSeconds,
    sampleFrames: gaya.sampleFrames,
    loop: null,
    identity: "session-explicit" as const,
    signal: "host-supplied-portable" as const,
  });
  const profile = createAudioSessionResourceProfile(bgm);
  const production = new BrowserAudioResourcePreflightAdapter(context);
  const observedGaya = await production.inspect(gayaBytes);
  if (observedGaya.status !== "accepted") {
    throw new Error(`${observedGaya.failure.capability}: ${observedGaya.failure.boundary}`);
  }
  if (observedGaya.value.sampleRate !== gaya.sampleRate ||
    observedGaya.value.channels !== gaya.channels ||
    observedGaya.value.sampleFrames !== gaya.sampleFrames ||
    observedGaya.value.durationSeconds !== gaya.durationSeconds) {
    throw new Error(`Gaya browser metadata ${JSON.stringify(observedGaya.value)} != ${JSON.stringify(gaya)}`);
  }
  const fixedByMarker = new Map<number, AudioResourceProfile>();
  CURRENT_AUDIO_SE_RESOURCES.forEach((resource, index) => {
    if (resource.cue !== "SE_RHYTHM_GAYA") fixedByMarker.set(index + 1, resource);
  });
  const isGayaBytes = (bytes: Uint8Array) =>
    bytes.byteLength === gayaBytes.byteLength && bytes[0] === gayaBytes[0] && bytes[1] === gayaBytes[1];
  const resourceForMarker = (bytes: Uint8Array) => fixedByMarker.get(bytes[0] ?? -1);
  const provider: AudioResourceProvider = Object.freeze({
    async read(resource: AudioResourceProfile) {
      if (resource.cue === bgm.cue || resource.cue === gaya.cue) {
        return audioAccepted(Uint8Array.from(gayaBytes));
      }
      const index = CURRENT_AUDIO_SE_RESOURCES.findIndex((candidate) => candidate.cue === resource.cue);
      if (index < 0) throw new Error(`unexpected startup audio resource ${resource.cue}`);
      const bytes = new Uint8Array(resource.byteLength);
      bytes[0] = index + 1;
      return audioAccepted(bytes);
    },
  });
  const preflight: AudioResourcePreflightAdapter = Object.freeze({
    async sha256(bytes: Uint8Array) {
      if (isGayaBytes(bytes)) return production.sha256(bytes);
      const resource = resourceForMarker(bytes);
      return resource === undefined
        ? production.sha256(bytes)
        : audioAccepted(resource.sha256);
    },
    async inspect(bytes: Uint8Array) {
      if (isGayaBytes(bytes)) return production.inspect(bytes);
      const resource = resourceForMarker(bytes);
      if (resource === undefined) return production.inspect(bytes);
      return audioAccepted({
        codec: resource.codec,
        sampleRate: resource.sampleRate,
        channels: resource.channels,
        durationSeconds: resource.durationSeconds,
        sampleFrames: resource.sampleFrames,
      });
    },
    getDecodedBuffer(bytes: Uint8Array) {
      if (isGayaBytes(bytes)) return production.getDecodedBuffer(bytes);
      const resource = resourceForMarker(bytes);
      return resource === undefined
        ? production.getDecodedBuffer(bytes)
        : audioAccepted(context.createBuffer(
            resource.channels,
            resource.sampleFrames,
            resource.sampleRate,
          ));
    },
  });
  const backend = new WebAudioSimulatorBackend(context);
  const prepared = await backend.prepare("startup-webview2-audio", profile, provider, preflight);
  if (prepared.status !== "accepted") throw new Error(`${prepared.failure.capability}: ${prepared.failure.boundary}`);
  const producer = new AudioCommandProducer({
    sessionId: "startup-webview2-audio",
    bgmCue: bgm.cue,
    seekMilliseconds: 0,
    masterGainBits: "0x3F800000",
    bgmGainBits: "0x3F800000",
    seGainBits: "0x3F800000",
  }, backend, { noteBatches: [] } as any);
  const initializePlan = requireOk<any>(producer.preflightInitialize());
  const initialized = initializePlan.commit();
  if (initialized.status !== "ok") throw new Error(`session initialize: ${initialized.capability}: ${initialized.boundary}`);
  const owner = new StartupAudioOwner(
    createSimulatorModeIdentity("live", "manual"),
    "initial",
    producer,
    null,
  );
  const opened = owner.initialize();
  if (opened.status !== "ok") throw new Error(`startup opening: ${opened.capability}: ${opened.boundary}`);
  const opening = backend.snapshot();
  const fadeInEnd = context.currentTime + 0.55;
  while (context.currentTime < fadeInEnd) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  if (context.currentTime <= initialContextTime) throw new Error("startup AudioContext currentTime did not advance without user activation");
  const transition = requireOk<any>(owner.preflightEnterPlaying());
  const entered = transition.commit();
  if (entered.status !== "ok") throw new Error(`startup playing: ${entered.capability}: ${entered.boundary}`);
  const playing = backend.snapshot();
  const ownerAtPlaying = owner.snapshot();
  owner.dispose();
  const disposed = backend.dispose();
  if (disposed.status !== "accepted") throw new Error(`${disposed.failure.capability}: ${disposed.failure.boundary}`);
  const cleanup = backend.snapshot();
  await context.close();
  const gayaDigest = await production.sha256(gayaBytes);
  if (gayaDigest.status !== "accepted" || gayaDigest.value !== gaya.sha256) {
    throw new Error("startup Gaya browser digest mismatch");
  }
  return Object.freeze({
    host: {
      userActivation,
      initialContextState,
      currentTimeAdvancedWithoutActivation: true,
      resumeCalledByTest: false,
    },
    resource: {
      cue: gaya.cue,
      bytes: gayaBytes.byteLength,
      sha256: gayaDigest.value,
      sampleRate: gaya.sampleRate,
      channels: gaya.channels,
      sampleFrames: gaya.sampleFrames,
      loop: gaya.loop,
    },
    opening: {
      commandKinds: opening.commands.map((command) => command.kind),
      bgmPaused: opening.semantic.bgmPaused,
      startupLoops: opening.semantic.startupLoops,
    },
    playing: {
      commandKinds: playing.commands.map((command) => command.kind),
      bgmPaused: playing.semantic.bgmPaused,
      startupLoops: playing.semantic.startupLoops,
      owner: ownerAtPlaying,
    },
    cleanup: {
      backendState: cleanup.state,
      resourceCount: cleanup.resourceCount,
      contextState: context.state,
    },
  });
}

async function capture(
  app: Application,
  label: string,
  snapshot: unknown,
  width = WIDTH,
  height = HEIGHT,
) {
  app.render();
  const bytes = readWebGlFramebufferRgba(app, width, height);
  let visible = 0;
  for (let index = 3; index < bytes.length; index += 4) if (bytes[index] !== 0) visible += 1;
  return Object.freeze({ label, rgbaSha256: await sha256(bytes), visible, snapshot });
}

function textureFrame(base: Texture, key: string): Texture {
  const row = CURRENT_SCORE_HUD_PORTABLE_RESOURCES.find((entry) => entry.profile.logicalAssetId === "hud/score/ui-common-atlas")!.profile.atlasRows.find((entry) => entry.exactKey === key);
  if (row === undefined) throw new Error(`missing current atlas row ${key}`);
  return new Texture({ source: base.source, frame: new Rectangle(row.x, row.y, row.width, row.height) });
}
async function canvasPng(width: number, height: number, color: string, centerX = width / 2): Promise<Uint8Array> {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true }); if (context === null) throw new Error("2D encoder unavailable");
  context.clearRect(0, 0, width, height); context.fillStyle = color;
  if (width === 360) context.fillRect(0, 0, width, height);
  else context.fillRect(centerX - 100, 180, 200, 480);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value === null ? reject(new Error("PNG encode failed")) : resolve(value), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}
async function fetchBytes(url: string): Promise<Uint8Array> { const response = await fetch(url); if (!response.ok) throw new Error(`fetch failed ${url}`); return new Uint8Array(await response.arrayBuffer()); }
async function sha256(bytes: Uint8Array): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""); }
function requireOk<T>(result: any): T { if (result.status !== "ok") throw new Error(`${result.capability}: ${result.boundary}`); return result.value as T; }
function requireAccepted<T>(result: any): T { if (result.status !== "accepted") throw new Error(`${result.failure.capability}: ${result.failure.boundary}`); return result.value as T; }

declare global { interface Window { readonly ipc: { postMessage(value: string): void }; } }
