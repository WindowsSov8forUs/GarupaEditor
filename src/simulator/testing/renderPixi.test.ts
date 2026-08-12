import { Texture, TextureSource } from "pixi.js";
import {
  PixiRendererBackend,
  type PixiTextureDecoder,
} from "../backends/pixi/pixiRendererBackend";
import {
  ImmutableLocalRenderResourceProvider,
  PortableRenderResourcePreflightAdapter,
} from "../backends/resources/localResourceProvider";
import { sha256UpperHex } from "../backends/resources/sha256";
import type {
  RenderCommand,
  RenderResourceProfile,
} from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";
import { ok, type SimulatorResult } from "../engine/evidence";

const SESSION = "pixi-reduced-playback";
const png = new Uint8Array(24);
png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
png.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
png.set([0, 0, 0, 4, 0, 0, 0, 4], 16);

const decoder: PixiTextureDecoder = {
  async decodePng(asset) {
    const source = new TextureSource({
      width: asset.width!,
      height: asset.height!,
      resource: { width: asset.width!, height: asset.height! },
      resolution: 1,
      autoGarbageCollect: false,
    });
    return ok(new Texture({ source, label: asset.logicalAssetId }));
  },
};

const profile: RenderResourceProfile = {
  schemaVersion: 1,
  sample: {
    package: "jp.co.craftegg.band",
    versionName: "10.1.4",
    versionCode: 230,
    abi: "arm64-v8a",
  },
  packIdentity: "pixi-reduced-playback-pack",
  fidelity: { mode: "ordinary", fidelity: "exact-current" },
  networkAllowed: false,
  automaticFallbackAllowed: false,
  assets: [{
    logicalAssetId: "asset.note",
    role: "note-atlas",
    byteLength: png.byteLength,
    sha256: sha256UpperHex(png),
    mime: "image/png",
    width: 4,
    height: 4,
    textureSettings: {
      scaleMode: "nearest",
      wrapModeU: "clamp",
      wrapModeV: "clamp",
      mipmap: "off",
      premultiplyAlpha: true,
      blendMode: "normal",
    },
    atlasRows: [{
      exactKey: "note_normal_0",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      pivotX: 0.5,
      pivotY: 0.5,
      pixelsPerUnit: 100,
    }],
    materialRole: "sprite",
    animationRole: "none",
    provenance: "current-apk",
  }],
  scene: {
    profileId: "pixi-reduced-scene",
    components: [
      "sprite", "atlas-sprite", "mesh", "line", "mask", "text", "slider", "animation",
    ].map((component) => ({
      component: component as "sprite" | "atlas-sprite" | "mesh" | "line" | "mask" | "text" | "slider" | "animation",
      support: component === "sprite" || component === "atlas-sprite"
        ? "semantic-exact" as const
        : "portable-equivalent" as const,
    })),
    ordering: {
      tuple: ["domain-layer", "source-depth-or-sorting-order", "source-z", "creation-sequence"],
      pixiDefaultZIndexAllowed: false,
    },
    projection: {
      mode: "current-ordinary-rhythmgame-orthographic",
      viewportWidth: 1600,
      viewportHeight: 720,
      pixiOrigin: "top-left",
      worldCenterX: 0,
      worldCenterY: 0,
      cameraPositionZ: -15,
      nearClip: 0,
      farClip: 25,
      pixelsPerWorldUnit: 360,
      clampAllowed: false,
    },
    roundPixels: false,
    resolution: 1,
    antialias: false,
  },
};

async function main(): Promise<void> {
const provider = requireOk(ImmutableLocalRenderResourceProvider.create([
  { logicalAssetId: "asset.note", bytes: png },
]), "provider");
const renderer = new PixiRendererBackend(decoder);
requireOk(await renderer.prepare(
  SESSION,
  profile,
  provider,
  new PortableRenderResourcePreflightAdapter(),
), "prepare");

const commands: RenderCommand[] = [
  {
    ...base(0),
    kind: "create-object",
    renderObjectId: "note:0",
    poolFamily: "normal",
    role: "note-root",
    parentObjectId: null,
  },
  {
    ...base(1),
    kind: "bind-resource",
    renderObjectId: "note:0",
    binding: "sprite",
    logicalAssetId: "asset.note",
    exactKey: "note_normal_0",
  },
  {
    ...base(2),
    kind: "set-transform",
    renderObjectId: "note:0",
    position: vector3(0, 0, 0),
    scale: vector2(1, 1),
    rotationDegrees: f32(0),
    color: {
      red: f32(1), green: f32(1), blue: f32(1), alpha: f32(1),
    },
    ordering: {
      domainLayer: 1,
      sourceDepthOrSortingOrder: 0,
      sourceZ: f32(0),
      creationSequence: 0,
    },
    maskObjectId: null,
  },
  { ...base(3), kind: "activate-object", renderObjectId: "note:0" },
  {
    ...base(4),
    kind: "create-object",
    renderObjectId: "hud:result",
    poolFamily: "result",
    role: "hud-result",
    parentObjectId: null,
  },
  {
    ...base(5),
    kind: "set-hud",
    renderObjectId: "hud:result",
    hudRole: "result",
    state: Object.freeze({
      representativeResult: 4,
      representativeSlot: 0,
      judgeTiming: 2,
    }),
  },
  { ...base(6), kind: "activate-object", renderObjectId: "hud:result" },
  {
    ...base(7),
    kind: "play-animation",
    renderObjectId: "hud:result",
    animationRole: "result",
    restart: true,
  },
  {
    ...base(8),
    kind: "sample-animation",
    renderObjectId: "hud:result",
    animationRole: "result",
    elapsedSeconds: f32(0.5),
  },
];

const batch = requireOk(renderer.preflight(commands), "preflight reduced scene");
requireOk(renderer.commit(batch), "commit reduced scene");
const scene = renderer.sceneSnapshot();
const note = scene.find((row) => row.renderObjectId === "note:0");
const result = scene.find((row) => row.renderObjectId === "hud:result");
assert(note?.visible === true, "note visible");
assert(result?.hudText === "4 SLOW", "result HUD keeps pure judgement/timing display");
assert(result?.activeAnimationRole === "result", "result animation remains owned");

const removedHud = renderer.preflight([{
  ...base(9),
  kind: "set-hud",
  renderObjectId: "hud:result",
  hudRole: "result",
  state: Object.freeze({
    representativeResult: 4,
    representativeSlot: 0,
    judgeTiming: 0,
    scoreUpType: 1,
  }),
} as any]);
assert(removedHud.status === "evidence-required", "removed character HUD shape is rejected");

requireOk(renderer.dispose(), "dispose");
assert(renderer.snapshot().state === "disposed", "renderer reaches disposed state");
console.log("Pixi reduced playback tests passed: note/result scene without character or multiplayer HUD");
}

void main();

function base(sequence: number) {
  return { sessionId: SESSION, sequence, frame: 0, substep: 0 };
}
function f32(value: number) {
  return requireOk(createRenderFloat32(Math.fround(value)), "f32");
}
function vector2(x: number, y: number) {
  return { x: f32(x), y: f32(y) };
}
function vector3(x: number, y: number, z: number) {
  return { ...vector2(x, y), z: f32(z) };
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  if (result.status !== "ok") throw new Error(`${message}: ${result.capability}`);
  return result.value;
}
