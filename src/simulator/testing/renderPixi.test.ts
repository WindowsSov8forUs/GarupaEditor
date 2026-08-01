import { Sprite, Texture, TextureSource } from "pixi.js";
import { BrowserPixiTextureDecoder } from "../backends/pixi/browserPixiTextureDecoder";
import { PixiRendererBackend, type PixiTextureDecoder } from "../backends/pixi/pixiRendererBackend";
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
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";

const SESSION = "pixi-test-session";
const png = new Uint8Array(24);
png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
png.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
png.set([0, 0, 0, 4, 0, 0, 0, 4], 16);

function equal<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
}
function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  if (result.status !== "ok") throw new Error(`${message}: ${result.capability}`);
  return result.value;
}
function f32(value: number) {
  return requireOk(createRenderFloat32(Math.fround(value)), "create Float32");
}

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

function profile(): RenderResourceProfile {
  return {
    schemaVersion: 1,
    sample: {
      package: "jp.co.craftegg.band",
      versionName: "10.1.4",
      versionCode: 230,
      abi: "arm64-v8a",
    },
    packIdentity: "pixi-test-pack",
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
      profileId: "pixi-test-scene",
      components: [
        { component: "sprite", support: "semantic-exact" },
        { component: "atlas-sprite", support: "portable-equivalent" },
        { component: "mesh", support: "portable-equivalent" },
        { component: "line", support: "portable-equivalent" },
        { component: "mask", support: "portable-equivalent" },
        { component: "text", support: "portable-equivalent" },
        { component: "slider", support: "portable-equivalent" },
        { component: "animation", support: "portable-equivalent" },
      ],
      ordering: {
        tuple: [
          "domain-layer",
          "source-depth-or-sorting-order",
          "source-z",
          "creation-sequence",
        ],
        pixiDefaultZIndexAllowed: false,
      },
      roundPixels: false,
      resolution: 1,
      antialias: false,
    },
  };
}

function base(sequence: number) {
  return { sessionId: SESSION, sequence, frame: 0, substep: 0 };
}

async function main(): Promise<void> {
  if (typeof globalThis.createImageBitmap !== "function") {
    const unavailable = await new BrowserPixiTextureDecoder().decodePng(
      profile().assets[0]!,
      png,
    );
    equal(unavailable.status, "evidence-required", "browser decoder has no non-browser fallback");
    equal(
      unavailable.status === "evidence-required" ? unavailable.capability : null,
      "render.pixi.create-image-bitmap-unavailable",
      "browser decoder reports explicit capability",
    );
  }
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create([
    { logicalAssetId: "asset.note", bytes: png },
  ]), "create local PNG provider");
  const renderer = new PixiRendererBackend(decoder);
  requireOk(await renderer.prepare(
    SESSION,
    profile(),
    provider,
    new PortableRenderResourcePreflightAdapter(),
  ), "prepare Pixi backend");

  const commands: readonly RenderCommand[] = [
    {
      ...base(0), kind: "create-object", renderObjectId: "note.root",
      poolFamily: "normal", role: "note-root", parentObjectId: null,
    },
    {
      ...base(1), kind: "bind-resource", renderObjectId: "note.root",
      binding: "sprite", logicalAssetId: "asset.note", exactKey: "note_normal_0",
    },
    { ...base(2), kind: "activate-object", renderObjectId: "note.root" },
    {
      ...base(3), kind: "set-transform", renderObjectId: "note.root",
      position: { x: f32(10), y: f32(20), z: f32(0) },
      scale: { x: f32(1), y: f32(1) },
      rotationDegrees: f32(0),
      color: { red: f32(1), green: f32(1), blue: f32(1), alpha: f32(1) },
      ordering: {
        domainLayer: 1,
        sourceDepthOrSortingOrder: 70,
        sourceZ: f32(0),
        creationSequence: 0,
      },
      maskObjectId: null,
    },
  ];
  const batch = requireOk(renderer.preflight(commands), "preflight Pixi Sprite batch");
  equal(renderer.sceneSnapshot().length, 0, "Pixi preflight has zero scene mutation");
  requireOk(renderer.commit(batch), "commit Pixi Sprite batch");
  const scene = renderer.sceneSnapshot();
  equal(scene.length, 1, "one Pixi object");
  equal(scene[0]?.renderObjectId, "note.root", "stable Pixi identity");
  equal(scene[0]?.visible, true, "Pixi visibility");
  equal(renderer.stage.children[0]?.position.x, 10, "Pixi position x");
  equal(renderer.stage.children[0]?.position.y, 20, "Pixi position y");
  equal(renderer.resourceSnapshot()[0]?.decoded, true, "base Texture decoded once");
  equal(renderer.resourceSnapshot()[0]?.atlasTextureCount, 1, "one exact subtexture cached");
  equal(renderer.resourceSnapshot()[0]?.spriteReferenceCount, 1, "Sprite binding reference counted");

  const unsupported = renderer.preflight([{
    ...base(4),
    kind: "set-line",
    renderObjectId: "note.root",
    start: { x: f32(0), y: f32(0), z: f32(0) },
    end: { x: f32(1), y: f32(1), z: f32(0) },
    width: f32(1),
    materialRole: "sync-line",
  }]);
  equal(unsupported.status, "evidence-required", "unsupported line mapping fails closed");
  equal(renderer.snapshot().state, "ready", "capability rejection is non-terminal");
  equal(renderer.snapshot().nextSequence, 4, "capability rejection does not consume sequence");
  equal(renderer.sceneSnapshot().length, 1, "unsupported command leaves scene unchanged");

  requireOk(renderer.execute({
    ...base(4), kind: "release-object", renderObjectId: "note.root",
  }), "release Pixi object");
  equal(renderer.sceneSnapshot().length, 0, "Pixi release removes object");
  equal(renderer.resourceSnapshot()[0]?.spriteReferenceCount, 0, "release decrements Sprite reference");
  const duplicatePrepare = await renderer.prepare(
    SESSION,
    profile(),
    provider,
    new PortableRenderResourcePreflightAdapter(),
  );
  equal(duplicatePrepare.status, "evidence-required", "duplicate Pixi prepare fails closed");
  equal(renderer.snapshot().state, "ready", "duplicate prepare does not replace live session");
  requireOk(renderer.dispose(), "dispose Pixi backend");
  equal(renderer.snapshot().state, "disposed", "Pixi backend disposed");
  equal(renderer.snapshot().resourceCount, 0, "Pixi resources released");
  requireOk(renderer.dispose(), "repeated Pixi dispose is idempotent");

  const decodeFailure = new PixiRendererBackend({
    async decodePng() {
      return evidenceRequired(
        "test.decode-failure",
        ["PR35"],
        "Synthetic decoder failure for atomic prepare test.",
      );
    },
  });
  const failedPrepare = await decodeFailure.prepare(
    "decode-failure-session",
    profile(),
    provider,
    new PortableRenderResourcePreflightAdapter(),
  );
  equal(failedPrepare.status, "evidence-required", "decode failure returned structurally");
  equal(decodeFailure.snapshot().state, "unprepared", "decode failure remains not-ready");
  equal(decodeFailure.snapshot().resourceCount, 0, "decode failure retains no resources");
  equal(decodeFailure.stage.children.length, 0, "decode failure creates no scene object");

  let factoryCalls = 0;
  const allocationFailure = new PixiRendererBackend(decoder, {
    create() {
      factoryCalls += 1;
      if (factoryCalls === 2) throw new Error("synthetic Pixi allocation failure");
      return new Sprite({ texture: Texture.EMPTY });
    },
  });
  requireOk(await allocationFailure.prepare(
    "allocation-failure-session",
    profile(),
    provider,
    new PortableRenderResourcePreflightAdapter(),
  ), "prepare allocation-failure renderer");
  const rejectedAllocation = allocationFailure.preflight([
    {
      sessionId: "allocation-failure-session", sequence: 0, frame: 0, substep: 0,
      kind: "create-object", renderObjectId: "allocation.first",
      poolFamily: "normal", role: "note-root", parentObjectId: null,
    },
    {
      sessionId: "allocation-failure-session", sequence: 1, frame: 0, substep: 0,
      kind: "create-object", renderObjectId: "allocation.second",
      poolFamily: "normal", role: "note-root", parentObjectId: null,
    },
  ]);
  equal(rejectedAllocation.status, "evidence-required", "Pixi allocation fails in preflight");
  equal(allocationFailure.snapshot().state, "ready", "allocation rejection is non-terminal");
  equal(allocationFailure.snapshot().nextSequence, 0, "allocation rejection consumes no sequence");
  equal(allocationFailure.sceneSnapshot().length, 0, "allocation rejection creates no scene object");
  equal(allocationFailure.stage.children.length, 0, "allocation rejection leaves stage empty");
  requireOk(allocationFailure.dispose(), "dispose allocation-failure renderer");

  const reserved: Sprite[] = [];
  const discardRenderer = new PixiRendererBackend(decoder, {
    create() {
      const node = new Sprite({ texture: Texture.EMPTY });
      reserved.push(node);
      return node;
    },
  });
  requireOk(await discardRenderer.prepare(
    "discard-session",
    profile(),
    provider,
    new PortableRenderResourcePreflightAdapter(),
  ), "prepare reservation-discard renderer");
  const discardBatch = requireOk(discardRenderer.preflight([{
    sessionId: "discard-session", sequence: 0, frame: 0, substep: 0,
    kind: "create-object", renderObjectId: "discard.reserved",
    poolFamily: "normal", role: "note-root", parentObjectId: null,
  }]), "reserve detached Pixi node");
  equal(discardRenderer.sceneSnapshot().length, 0, "reserved node is detached during preflight");
  equal(reserved[0]?.destroyed, false, "reserved node remains live while capability pending");
  requireOk(discardRenderer.discard(discardBatch), "discard Pixi reservation");
  equal(reserved[0]?.destroyed, true, "discard destroys reserved Pixi node");
  equal(discardRenderer.snapshot().nextSequence, 0, "discarded reservation consumes no sequence");
  requireOk(discardRenderer.dispose(), "dispose reservation-discard renderer");

  const contextRenderer = new PixiRendererBackend(decoder);
  requireOk(await contextRenderer.prepare(
    "context-session",
    profile(),
    provider,
    new PortableRenderResourcePreflightAdapter(),
  ), "prepare context-loss renderer");
  const contextLoss = contextRenderer.notifyContextLoss();
  equal(contextLoss.status, "evidence-required", "context loss returned structurally");
  equal(contextRenderer.snapshot().state, "faulted", "context loss is terminal");
  equal(contextRenderer.snapshot().fault?.capability, "render.pixi.context-lost", "context fault preserved");
  const afterFault = contextRenderer.preflight([{
    ...base(0), kind: "create-object", renderObjectId: "after.fault",
    poolFamily: "normal", role: "note-root", parentObjectId: null,
  }]);
  equal(afterFault.status, "evidence-required", "commands after context fault rejected");
  equal(
    afterFault.status === "evidence-required" ? afterFault.capability : null,
    "render.pixi.context-lost",
    "first terminal Pixi fault wins",
  );
  requireOk(contextRenderer.dispose(), "dispose context-faulted renderer");
  equal(contextRenderer.snapshot().resourceCount, 0, "context-fault dispose releases resources");

  console.log("Pixi v8 semantic adapter tests passed: atomic decode/cache/Sprite/order/fault/release");
}

void main().catch((error: unknown) => {
  throw error;
});
