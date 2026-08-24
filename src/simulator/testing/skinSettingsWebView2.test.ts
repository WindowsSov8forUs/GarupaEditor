import { Application } from "pixi.js";
import { BrowserPixiTextureDecoder } from "../backends/pixi/browserPixiTextureDecoder";
import { installPixiLinearOutput } from "../backends/pixi/pixiLinearColorPipeline";
import { PixiRendererBackend } from "../backends/pixi/pixiRendererBackend";
import { PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import type { RenderCommand, RenderResourceProfile } from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";
import { RenderCommandProducer } from "../engine/rendering/renderCommandProducer";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "./legacyCurrentOrdinaryResourceManifest";
import { resolveOriginalSkinRecipe } from "../engine/skin/originalSkinResolver";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { selectResolvedSkinResourceInventory } from "./legacySkinResourceSelector";
import { ImmutableSharedStaticResourceStore } from "./legacySharedStaticResourceStore";
import { prepareSelectedSkinPortablePacks } from "./legacySkinPortablePack";
import { prepareSkinRenderOverlay } from "../assembly/skinRenderPreparation";
import { createOriginalSurfaceLayout } from "../scene/originalSurfaceLayout";
import { prepareSkinParticleProvider } from "../assembly/skinParticlePreparation";
import { particleRejected } from "../backends/particleValidation";
import { PortableParticleResourcePreflightAdapter } from "../backends/resources/localParticleResourceProvider";
import { BrowserPixiParticleTextureDecoder } from "../backends/pixi/browserPixiParticleTextureDecoder";
import { PixiParticleRendererBackend } from "../backends/pixi/pixiParticleRendererBackend";
import { createSimulatorSceneLayout } from "../scene/simulatorSceneLayout";
import { readWebGlFramebufferRgba } from "./readWebGlFramebuffer";

declare global {
  interface Window { readonly ipc: { postMessage(value: string): void } }
}

void main().catch((error) => window.ipc.postMessage(JSON.stringify({
  status: "rejected",
  error: error instanceof Error ? error.message : String(error),
})));

async function main(): Promise<void> {
  const map = await fetchJson<{ readonly packs: readonly { readonly logicalResource: string; readonly url: string }[] }>("/packs.json");
  const base = await fetchJson<RenderResourceProfile>("/render-profile.json");
  const scenario = await fetchJson<{ readonly kind: "default" | "limited3" }>("/selection.json");
  const recipe = requireOk(resolveOriginalSkinRecipe({
    noteSkin: 0, fieldSkin: 0, tapEffect: 0, judgeSE: 0,
    directionalFlick: 0, directionalFlickEffect: 0, isFixedBG: false,
    special: scenario.kind === "default"
      ? { kind: "none" }
      : { kind: "limited", limitedSkinId: 3, components: {
          laneAndLine: "on", tapEffect: "on", rhythmIcon: "on", background: "on",
          soundEffect: "on", judge: "on", directionalFlickIcon: "on",
        } },
  }, createSimulatorModeIdentity("live", "manual"), "ordinary", "standard"));
  const selected = selectResolvedSkinResourceInventory(recipe);
  const urlByLogical = new Map(map.packs.map((row) => [row.logicalResource, row.url]));
  const entries = await Promise.all(selected.resources.map(async (resource) => {
    const url = urlByLogical.get(resource.logicalResource);
    if (url === undefined) throw new Error(`missing pack route ${resource.logicalResource}`);
    return { resourceKey: resource.resourceKey, bytes: await fetchBytes(url) };
  }));
  const store = requireAccepted(ImmutableSharedStaticResourceStore.create(entries));
  const packs = requireAccepted(await prepareSelectedSkinPortablePacks(selected.resources, store));
  const overlay = requireAccepted(await prepareSkinRenderOverlay(recipe, packs, CURRENT_ORDINARY_RENDER_BINDINGS));
  if (overlay === null) throw new Error("selected overlay absent");
  const particleProvider = requireAccepted(prepareSkinParticleProvider(
    recipe,
    packs,
    { read: async () => particleRejected("particle-resource-unavailable", "base", "base") },
  ));
  const scene = requireOk(createSimulatorSceneLayout({
    revision: 0, viewportWidth: 1600, viewportHeight: 720,
    safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) },
    origin: "bottom-left",
  }, {
    specificSpeed: Math.fround(11), noteSize: Math.fround(100), judgementAdjustValueB: 0,
    habahiroMeshWidthSetting: Math.fround(1), syncLineEdgeMargin: recipe.note.noteSyncEdgeMargin,
  }, "ordinary", overlay.bindings, overlay.fieldBindings));
  const particleRenderer = new PixiParticleRendererBackend(new BrowserPixiParticleTextureDecoder());
  const particleReady = await particleRenderer.prepare(
    "selected-skin-webview2", scene.particleScene, particleProvider,
    new PortableParticleResourcePreflightAdapter(),
  );
  if (particleReady.status !== "accepted") throw new Error(particleReady.failure.capability);
  const particleResources = particleRenderer.snapshot().resourceCount;
  if (particleResources <= 2) throw new Error("selected particle resources were not decoded");
  if (particleRenderer.dispose().status !== "accepted") throw new Error("selected particle renderer dispose");
  const renderer = new PixiRendererBackend(new BrowserPixiTextureDecoder());
  const profile: RenderResourceProfile = {
    ...base,
    packIdentity: "selected-skin-webview2",
    assets: overlay.assets,
  };
  requireOk(await renderer.prepare(
    "selected-skin-webview2", profile, overlay.provider,
    new PortableRenderResourcePreflightAdapter(),
  ));
  const surface = requireOk(createOriginalSurfaceLayout({
    revision: 0, viewportWidth: 1600, viewportHeight: 720,
    safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) },
    origin: "bottom-left",
  }, Math.fround(100)));
  requireOk(renderer.bindOriginalSurfaceLayout(surface));
  if (overlay.fieldBindings === null || overlay.bindings.ordinaryVisible === undefined) {
    throw new Error("selected visible bindings absent");
  }
  let nextSequence = 0;
  const baseCommand = () => ({
    sessionId: "selected-skin-webview2", sequence: nextSequence++, frame: 0, substep: 0,
  });
  const transform = (domainLayer: number, creationSequence: number, scale = 1) => ({
    position: { x: f32(0), y: f32(0), z: f32(0) },
    scale: { x: f32(scale), y: f32(scale) }, rotationDegrees: f32(0),
    color: { red: f32(1), green: f32(1), blue: f32(1), alpha: f32(1) },
    ordering: { domainLayer, sourceDepthOrSortingOrder: 0, sourceZ: f32(0), creationSequence },
    maskObjectId: null,
  });
  const commands: RenderCommand[] = [];
  if (overlay.backgroundLogicalAssetId !== null) commands.push(
    { ...baseCommand(), kind: "create-object", renderObjectId: "skin:web:background", poolFamily: "skin-background", role: "field-line", parentObjectId: null },
    { ...baseCommand(), kind: "bind-resource", renderObjectId: "skin:web:background", binding: "sprite", logicalAssetId: overlay.backgroundLogicalAssetId, exactKey: "liveBG" },
    { ...baseCommand(), kind: "set-transform", renderObjectId: "skin:web:background", ...transform(0, 0, 1.5) },
    { ...baseCommand(), kind: "activate-object", renderObjectId: "skin:web:background" },
  );
  commands.push(
    { ...baseCommand(), kind: "create-object", renderObjectId: "skin:web:note", poolFamily: "normal", role: "note-root", parentObjectId: null },
    { ...baseCommand(), kind: "bind-resource", renderObjectId: "skin:web:note", binding: "sprite", logicalAssetId: overlay.bindings.noteAtlasLogicalAssetId, exactKey: "note_normal_0" },
    { ...baseCommand(), kind: "set-transform", renderObjectId: "skin:web:note", ...transform(3, 1) },
    { ...baseCommand(), kind: "activate-object", renderObjectId: "skin:web:note" },
    { ...baseCommand(), kind: "create-object", renderObjectId: "skin:web:judge", poolFamily: "selected-judge", role: "judge-line", parentObjectId: null },
    { ...baseCommand(), kind: "bind-resource", renderObjectId: "skin:web:judge", binding: "sprite", logicalAssetId: overlay.bindings.ordinaryVisible.judgeLogicalAssetId, exactKey: "judge_perfect" },
    { ...baseCommand(), kind: "set-transform", renderObjectId: "skin:web:judge", ...transform(4, 2) },
    { ...baseCommand(), kind: "activate-object", renderObjectId: "skin:web:judge" },
  );
  requireOk(renderer.commit(requireOk(renderer.preflight(commands))));
  const producer = new RenderCommandProducer("selected-skin-webview2", renderer, overlay.bindings);
  const fieldScene = scene.ordinaryNoteScene.field;
  if (fieldScene === undefined) throw new Error("selected Field scene absent");
  requireOk(requireOk(producer.preflightFieldSetup(fieldScene.objects, fieldScene.masks)).commit());
  const app = new Application();
  await app.init({ width: 1600, height: 720, preference: "webgl", antialias: false,
    resolution: 1, backgroundAlpha: 0, preserveDrawingBuffer: true, autoStart: false, sharedTicker: false });
  document.body.appendChild(app.canvas);
  const linearOutput = installPixiLinearOutput(renderer.stage, 1600, 720);
  app.stage.addChild(renderer.stage);
  app.render();
  const pixels = readWebGlFramebufferRgba(app, 1600, 720);
  const rgbaSha256 = await sha256(pixels);
  const alphaPixels = alphaCount(pixels);
  const snapshot = renderer.sceneSnapshot();
  const fieldRows = snapshot.filter((row) => row.renderObjectId.startsWith("render:skin-field:"));
  const judgeRow = snapshot.find((row) => row.renderObjectId === "skin:web:judge");
  const backgroundRow = snapshot.find((row) => row.renderObjectId === "skin:web:background");
  const backgroundExpected = scenario.kind === "limited3";
  if (fieldRows.length !== 2 || fieldRows.some((row) => row.role === "mask") ||
    judgeRow?.spriteBindingKey?.endsWith("\u0000judge_perfect") !== true ||
    (backgroundRow?.spriteBindingKey?.endsWith("\u0000liveBG") === true) !== backgroundExpected ||
    alphaPixels <= 0) {
    throw new Error("selected Note/Field/Judge/Background routes were not actually published and rasterized");
  }
  const released = requireOk(producer.preflightSessionRelease());
  requireOk(released.commit());
  const fieldCleanup = renderer.sceneSnapshot().filter((row) => row.renderObjectId.startsWith("render:skin-field:")).length;
  renderer.stage.removeFromParent();
  linearOutput.dispose();
  requireOk(renderer.dispose());
  const cleanup = renderer.snapshot().objectCount;
  app.destroy(true, { children: true, texture: true, textureSource: true });
  window.ipc.postMessage(JSON.stringify({
    status: "accepted", scenario: scenario.kind, packCount: packs.length, assetCount: overlay.assets.length,
    actualDrawnRoles: backgroundExpected ? ["note", "field", "judge", "background"] : ["note", "field", "judge"],
    fieldDrawCount: fieldRows.length, judgeDraw: true, backgroundDraw: backgroundExpected,
    rgbaSha256, alphaPixels,
    particleResources, particleCleanup: particleRenderer.snapshot().nodeCount,
    fieldCleanup, cleanup,
  }));
}

function f32(value: number) { return requireOk(createRenderFloat32(Math.fround(value))); }
function requireOk<T>(result: { readonly status: "ok"; readonly value: T } | { readonly status: "integrity-failure"; readonly capability: string }): T {
  if (result.status !== "ok") throw new Error(result.capability);
  return result.value;
}
function requireAccepted<T>(result: { readonly status: "accepted"; readonly value: T } | { readonly status: "rejected"; readonly failure: { readonly capability: string } }): T {
  if (result.status !== "accepted") throw new Error(result.failure.capability);
  return result.value;
}
function alphaCount(bytes: Uint8Array): number {
  let count = 0;
  for (let index = 3; index < bytes.length; index += 4) if (bytes[index] !== 0) count += 1;
  return count;
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store", credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`fetch failed ${path}`);
  return response.json() as Promise<T>;
}
async function fetchBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(path, { cache: "no-store", credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`fetch failed ${path}`);
  return new Uint8Array(await response.arrayBuffer());
}
