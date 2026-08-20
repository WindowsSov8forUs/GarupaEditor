import { BrowserPixiTextureDecoder } from "../backends/pixi/browserPixiTextureDecoder";
import { PixiRendererBackend } from "../backends/pixi/pixiRendererBackend";
import { PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import type { RenderCommand, RenderResourceProfile } from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "../backends/resources/currentOrdinaryResourceManifest";
import { resolveOriginalSkinRecipe } from "../engine/skin/originalSkinResolver";
import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";
import { selectResolvedSkinResourceInventory } from "../resources/skinResourceSelector";
import { ImmutableSharedStaticResourceStore } from "../resources/sharedStaticResourceStore";
import { prepareSelectedSkinPortablePacks } from "../resources/skinPortablePack";
import { prepareSkinRenderOverlay } from "../assembly/skinRenderPreparation";
import { createOriginalSurfaceLayout } from "../scene/originalSurfaceLayout";

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
  const recipe = requireOk(resolveOriginalSkinRecipe({
    noteSkin: 0, fieldSkin: 0, tapEffect: 0, judgeSE: 0,
    directionalFlick: 0, directionalFlickEffect: 0, isFixedBG: false,
    special: { kind: "limited", limitedSkinId: 3, components: {
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
  const commands: RenderCommand[] = [
    { kind: "create-object", renderObjectId: "skin:web:note", poolFamily: "normal", role: "note-root", parentObjectId: null,
      sessionId: "selected-skin-webview2", sequence: 0, frame: 0, substep: 0 },
    { kind: "bind-resource", renderObjectId: "skin:web:note", binding: "sprite",
      logicalAssetId: overlay.bindings.noteAtlasLogicalAssetId, exactKey: "note_normal_0",
      sessionId: "selected-skin-webview2", sequence: 1, frame: 0, substep: 0 },
    { kind: "set-transform", renderObjectId: "skin:web:note",
      position: { x: f32(0), y: f32(0), z: f32(0) }, scale: { x: f32(1), y: f32(1) },
      rotationDegrees: f32(0), color: { red: f32(1), green: f32(1), blue: f32(1), alpha: f32(1) },
      ordering: { domainLayer: 3, sourceDepthOrSortingOrder: 0, sourceZ: f32(0), creationSequence: 0 }, maskObjectId: null,
      sessionId: "selected-skin-webview2", sequence: 2, frame: 0, substep: 0 },
    { kind: "activate-object", renderObjectId: "skin:web:note",
      sessionId: "selected-skin-webview2", sequence: 3, frame: 0, substep: 0 },
  ];
  const batch = requireOk(renderer.preflight(commands));
  requireOk(renderer.commit(batch));
  const root = renderer.stage.getChildByLabel("skin:web:note") as any;
  const resources: unknown[] = [];
  const walk = (node: any) => {
    if (node?.texture?.source?.resource !== undefined) resources.push(node.texture.source.resource);
    for (const child of node?.children ?? []) walk(child);
  };
  walk(root);
  const imageBitmapCount = resources.filter((value) => value instanceof ImageBitmap).length;
  if (imageBitmapCount < 1) throw new Error("selected Skin did not bind an ImageBitmap-backed Pixi texture");
  requireOk(renderer.dispose());
  window.ipc.postMessage(JSON.stringify({
    status: "accepted",
    packCount: packs.length,
    assetCount: overlay.assets.length,
    imageBitmapCount,
    fieldBindings: overlay.fieldBindings !== null,
    background: overlay.backgroundLogicalAssetId !== null,
    cleanup: renderer.snapshot().objectCount,
  }));
}

function f32(value: number) { return requireOk(createRenderFloat32(Math.fround(value))); }
function requireOk<T>(result: { readonly status: "ok"; readonly value: T } | { readonly status: "evidence-required"; readonly capability: string }): T {
  if (result.status !== "ok") throw new Error(result.capability);
  return result.value;
}
function requireAccepted<T>(result: { readonly status: "accepted"; readonly value: T } | { readonly status: "rejected"; readonly failure: { readonly capability: string } }): T {
  if (result.status !== "accepted") throw new Error(result.failure.capability);
  return result.value;
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
