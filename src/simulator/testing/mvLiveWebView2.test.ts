import { Application, Rectangle } from "pixi.js";
import { BrowserMovieResourcePreflightAdapter } from "../backends/movie/browserMovieResourcePreflightAdapter";
import { PixiMvLiveBackend } from "../backends/pixi/pixiMvLiveBackend";
import { deriveSessionMvResource } from "../assembly/sessionMvDerivation";
import {
  createOriginalSurfaceLayout,
  type OriginalSurfaceLayout,
} from "../scene/originalSurfaceLayout";

const WIDTH = 1600;
const HEIGHT = 720;
const MOVIE_LAYOUT = requireOk<OriginalSurfaceLayout>(createOriginalSurfaceLayout({
  revision: 0, viewportWidth: WIDTH, viewportHeight: HEIGHT,
  safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(WIDTH), height: Math.fround(HEIGHT) },
  origin: "bottom-left",
}, Math.fround(100))).movie;

void main().catch((error) => window.ipc.postMessage(JSON.stringify({
  schema: "garupa-mv-live-webview2-v1",
  status: "error",
  message: String(error instanceof Error ? error.message : error),
  stack: String(error instanceof Error ? error.stack ?? "" : ""),
})));

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    width: WIDTH,
    height: HEIGHT,
    preference: "webgl",
    antialias: false,
    resolution: 1,
    background: 0x000000,
    backgroundAlpha: 1,
    preserveDrawingBuffer: true,
    autoStart: false,
    sharedTicker: false,
  });
  document.body.appendChild(app.canvas);
  const preflight = new BrowserMovieResourcePreflightAdapter();
  const outputs = [];
  for (const [container, route] of [
    ["mp4", "/assets/mv-probe.mp4"],
    ["webm", "/assets/mv-probe.webm"],
  ] as const) {
    const bytes = await fetchBytes(route);
    const derived = requireAccepted<any>(await deriveSessionMvResource({
      bytes,
      musicStartDelayMilliseconds: -2180,
    }, preflight));
    if (derived.profile.container !== container) throw new Error(`${container}: sniff mismatch`);
    const backend = new PixiMvLiveBackend(false, MOVIE_LAYOUT);
    const sessionId = `mv-webview2:${container}`;
    requireMovie(await backend.prepare(sessionId, derived));
    app.stage.addChild(backend.stage);
    const ready = backend.snapshot();
    requireEqual(ready.state, "ready", `${container}: ready`);
    requireEqual(ready.muted, true, `${container}: muted`);
    requireEqual(ready.loop, false, `${container}: loop`);
    requireEqual(backend.stage.children[0]?.x, MOVIE_LAYOUT.x, `${container}: original widget x`);
    requireEqual(backend.stage.children[0]?.y, MOVIE_LAYOUT.y, `${container}: original widget y`);
    requireEqual(backend.stage.children[0]?.width, MOVIE_LAYOUT.width, `${container}: original widget width`);
    requireEqual(backend.stage.children[0]?.height, MOVIE_LAYOUT.height, `${container}: original widget height`);

    requireMovie(backend.play());
    await waitForState(backend, "playing", 300);
    requireMovie(backend.setVisible(true));
    await nextFrames(3);
    requireMovie(backend.pause());
    requireMovie(backend.seek(1));
    await waitForState(backend, "paused", 300);
    requireMovie(backend.setVisible(true));
    await nextFrames(3);
    app.render();
    const raster = await capture(app);
    const paused = backend.snapshot();
    requireEqual(paused.currentTimeSeconds, 1, `${container}: deterministic seek`);
    requireEqual(paused.visible, true, `${container}: visible`);
    if (raster.nonBlackPixels <= 0) throw new Error(`${container}: empty raster`);

    requireMovie(backend.resume());
    await waitForState(backend, "playing", 300);
    requireMovie(backend.pause());
    requireMovie(backend.stop());
    const ended = backend.snapshot();
    requireEqual(ended.state, "ended", `${container}: ended`);
    requireEqual(ended.visible, false, `${container}: hidden at end`);
    requireMovie(backend.dispose());
    requireEqual(backend.snapshot().state, "disposed", `${container}: disposed`);
    requireEqual(app.stage.children.length, 0, `${container}: stage cleanup`);
    outputs.push(Object.freeze({
      container,
      bytes: bytes.byteLength,
      profile: derived.profile,
      ready: projection(ready),
      paused: projection(paused),
      ended: projection(ended),
      disposed: projection(backend.snapshot()),
      raster,
    }));
  }
  const activeResources = preflight.snapshot().activeResourceCount;
  const result = Object.freeze({
    schema: "garupa-mv-live-webview2-v1",
    status: "ok",
    runtime: {
      userAgent: navigator.userAgent,
      pixiVersion: (await import("pixi.js")).VERSION,
      rendererName: app.renderer.name,
    },
    media: outputs,
    cleanup: {
      activeResources,
      stageChildren: app.stage.children.length,
    },
    isolation: {
      resourceUrls: performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .sort(),
    },
  });
  app.destroy(true, { children: true, texture: true, textureSource: true });
  window.ipc.postMessage(JSON.stringify(result));
}

function projection(snapshot: any): unknown {
  return {
    state: snapshot.state,
    resourceCount: snapshot.resourceCount,
    currentTimeSeconds: snapshot.currentTimeSeconds,
    visible: snapshot.visible,
    outputSuppressed: snapshot.outputSuppressed,
    firstFramePresented: snapshot.firstFramePresented,
    ended: snapshot.ended,
    muted: snapshot.muted,
    loop: snapshot.loop,
    stageParentAttached: snapshot.stageParentAttached,
    fault: snapshot.fault,
  };
}

async function waitForState(
  backend: PixiMvLiveBackend,
  state: string,
  frameBudget: number,
): Promise<void> {
  for (let frame = 0; frame < frameBudget; frame += 1) {
    const observed = backend.observe();
    requireMovie(observed);
    if (observed.status === "accepted" && observed.value.state === state) return;
    await nextFrames(1);
  }
  throw new Error(`movie state ${state} was not observed within ${frameBudget} animation frames`);
}

async function nextFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function capture(app: Application): Promise<{
  readonly rgbaSha256: string;
  readonly nonBlackPixels: number;
}> {
  const output = app.renderer.extract.pixels({
    target: app.stage,
    frame: new Rectangle(0, 0, WIDTH, HEIGHT),
    resolution: 1,
    clearColor: [0, 0, 0, 1],
  });
  const bytes = new Uint8Array(
    output.pixels.buffer,
    output.pixels.byteOffset,
    output.pixels.byteLength,
  );
  let nonBlackPixels = 0;
  for (let index = 0; index < bytes.byteLength; index += 4) {
    if (bytes[index] !== 0 || bytes[index + 1] !== 0 || bytes[index + 2] !== 0) {
      nonBlackPixels += 1;
    }
  }
  return Object.freeze({ rgbaSha256: await sha256(bytes), nonBlackPixels });
}

async function fetchBytes(route: string): Promise<Uint8Array> {
  const response = await fetch(route);
  if (!response.ok) throw new Error(`fixture route failed: ${route}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
function requireOk<T>(result: any): T {
  if (result.status !== "ok") throw new Error(`${result.capability}: ${result.boundary}`);
  return result.value as T;
}
function requireMovie(result: any): void {
  if (result.status !== "accepted") {
    throw new Error(`${result.failure?.capability ?? result.capability}: ${result.failure?.boundary ?? result.boundary}`);
  }
}
function requireAccepted<T>(result: any): T {
  if (result.status !== "accepted") throw new Error(`${result.failure.capability}: ${result.failure.boundary}`);
  return result.value as T;
}
function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected)) throw new Error(`${label}: ${String(actual)} !== ${String(expected)}`);
}

declare global {
  interface Window {
    readonly ipc: { postMessage(value: string): void };
  }
}
