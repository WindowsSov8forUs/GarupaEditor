import { Application, Rectangle, Texture } from "pixi.js";
import { BrowserPixiTextureDecoder } from "../backends/pixi/browserPixiTextureDecoder";
import { createPixiStartupDirectionScene } from "../backends/pixi/pixiStartupDirectionScene";
import { CURRENT_SCORE_HUD_PORTABLE_RESOURCES } from "../backends/resources/currentScoreHudResourceManifest";
import { CURRENT_STARTUP_DIRECTION_PORTABLE_RESOURCES } from "../backends/resources/currentStartupDirectionResourceManifest";
import { deriveSessionPresentation } from "../assembly/sessionPresentationDerivation";
import { StartupDirectionController } from "../engine/managers/startupDirectionController";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";

const WIDTH = 1600;
const HEIGHT = 720;

void main().catch((error) => window.ipc.postMessage(JSON.stringify({
  schema: "garupa-startup-direction-webview2-v1", status: "error",
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
  for (const [sessionMode, inputMode] of modes) {
    const presentation = requireAccepted<any>(await deriveSessionPresentation({
      song: { title: "Test Song", bandName: "Test Band", lyricist: "Lyrics", composer: "Composer", arranger: "Arranger" },
      difficulty: { type: "EXPERT", level: 25 },
      jacketPng: await canvasPng(360, 360, `rgb(25 90 170)`),
      stage: {
        backdropPng: await canvasPng(1600, 720, `rgb(12 18 35)`),
        sdCharacterAtlases: await overlays(),
      },
      liveStartVoiceMp3: null,
    }, { inspect: async () => ({ status: "audio-resource-decode" as const, failure: { code: "audio-resource-decode" as const, capability: "unused", boundary: "unused" } }) } as any));
    const scene = requireOk<any>(await createPixiStartupDirectionScene(
      presentation,
      { lineStar: line, jacketFrame: frame, difficultyFrames: difficulties, fullLiveLabel: full, fontFamily: font.family },
      decoder,
      false,
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
  const result = Object.freeze({
    schema: "garupa-startup-direction-webview2-v1",
    status: "ok",
    runtime: { userAgent: navigator.userAgent, pixiVersion: (await import("pixi.js")).VERSION, rendererName: app.renderer.name },
    scene: { modes: 4, captures },
    cleanup: { stageChildren: app.stage.children.length },
    resources: { urls: performance.getEntriesByType("resource").map((entry) => entry.name).sort() },
  });
  for (const texture of [frame, full, ...Object.values(difficulties)]) texture.destroy(false);
  line.destroy(true); ui.destroy(true); font.dispose();
  app.destroy(true, { children: true, texture: true, textureSource: true });
  window.ipc.postMessage(JSON.stringify(result));
}

async function capture(app: Application, label: string, snapshot: unknown) {
  app.render();
  const output = app.renderer.extract.pixels({ target: app.stage, frame: new Rectangle(0, 0, WIDTH, HEIGHT), resolution: 1, clearColor: [0, 0, 0, 0] });
  const bytes = new Uint8Array(output.pixels.buffer, output.pixels.byteOffset, output.pixels.byteLength);
  let visible = 0;
  for (let index = 3; index < bytes.length; index += 4) if (bytes[index] !== 0) visible += 1;
  return Object.freeze({ label, rgbaSha256: await sha256(bytes), visible, snapshot });
}

function textureFrame(base: Texture, key: string): Texture {
  const row = CURRENT_SCORE_HUD_PORTABLE_RESOURCES.find((entry) => entry.profile.logicalAssetId === "hud/score/ui-common-atlas")!.profile.atlasRows.find((entry) => entry.exactKey === key);
  if (row === undefined) throw new Error(`missing current atlas row ${key}`);
  return new Texture({ source: base.source, frame: new Rectangle(row.x, row.y, row.width, row.height) });
}
async function overlays(): Promise<readonly [Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array]> {
  return [
    await canvasPng(1600, 720, "rgb(210 60 90 / 25%)", 260),
    await canvasPng(1600, 720, "rgb(60 210 130 / 25%)", 520),
    await canvasPng(1600, 720, "rgb(80 130 230 / 25%)", 800),
    await canvasPng(1600, 720, "rgb(230 190 60 / 25%)", 1080),
    await canvasPng(1600, 720, "rgb(180 80 220 / 25%)", 1340),
  ];
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
