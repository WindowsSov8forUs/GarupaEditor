import { Container, Sprite, Texture, TextureSource } from "pixi.js";
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
    }, {
      logicalAssetId: "asset.sync-line",
      role: "material-texture",
      byteLength: png.byteLength,
      sha256: sha256UpperHex(png),
      mime: "image/png",
      width: 4,
      height: 4,
      textureSettings: {
        scaleMode: "linear",
        wrapModeU: "clamp",
        wrapModeV: "clamp",
        mipmap: "off",
        premultiplyAlpha: true,
        blendMode: "normal",
      },
      atlasRows: [],
      materialRole: "sync-line",
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

function wrappedSprite(): Container {
  const root = new Container();
  root.addChild(new Sprite({ texture: Texture.EMPTY }));
  return root;
}

function r2Mesh(sequence: number): RenderCommand {
  const vertices = Array.from({ length: 22 }, (_, index) => ({
    x: f32(index % 2),
    y: f32(Math.floor(index / 2) / 10),
    z: f32(0),
  }));
  const uv = Array.from({ length: 22 }, (_, index) => ({
    x: f32(index % 2),
    y: f32(Math.floor(index / 2) / 10),
  }));
  const color = () => ({ red: f32(0.9), green: f32(0.9), blue: f32(0.9), alpha: f32(0.8) });
  const indices = Array.from({ length: 10 }, (_, section) => {
    const start = section * 2;
    return [start, start + 2, start + 1, start + 1, start + 2, start + 3];
  }).flat();
  return {
    ...base(sequence),
    kind: "set-mesh",
    renderObjectId: "note.mesh",
    vertices,
    indices,
    uv,
    colors: vertices.map(color),
    materialRole: "long-note",
  };
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
    { logicalAssetId: "asset.sync-line", bytes: png },
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
  equal(unsupported.status, "evidence-required", "line on non-sync role fails closed");
  equal(renderer.snapshot().state, "ready", "capability rejection is non-terminal");
  equal(renderer.snapshot().nextSequence, 4, "capability rejection does not consume sequence");
  equal(renderer.sceneSnapshot().length, 1, "unsupported command leaves scene unchanged");

  const invalidMesh = r2Mesh(5);
  if (invalidMesh.kind !== "set-mesh") throw new Error("R2 mesh helper returned wrong command");
  const rejectedMesh = renderer.preflight([
    {
      ...base(4), kind: "create-object", renderObjectId: "note.mesh",
      poolFamily: "long", role: "note-mesh", parentObjectId: "note.root",
    },
    {
      ...invalidMesh,
      colors: invalidMesh.colors.map((color, index) => index === 0
        ? { ...color, red: f32(0.8) }
        : color),
    },
  ]);
  equal(rejectedMesh.status, "evidence-required", "nonuniform mesh colors fail R2 gate");
  equal(renderer.snapshot().nextSequence, 4, "rejected mesh consumes no sequence");
  equal(renderer.sceneSnapshot().length, 1, "rejected mesh creates no object");

  const meshBatch = requireOk(renderer.preflight([
    {
      ...base(4), kind: "create-object", renderObjectId: "note.mesh",
      poolFamily: "long", role: "note-mesh", parentObjectId: "note.root",
    },
    r2Mesh(5),
  ]), "preflight R2 mesh batch");
  equal(renderer.sceneSnapshot().length, 1, "R2 mesh preflight has zero scene mutation");
  requireOk(renderer.commit(meshBatch), "commit R2 mesh batch");
  const meshScene = renderer.sceneSnapshot().find((row) => row.renderObjectId === "note.mesh");
  equal(meshScene?.geometryVertexCount, 22, "R2 mesh has 22 Pixi vertices");
  equal(meshScene?.geometryIndexCount, 60, "R2 mesh has 60 Pixi indices");

  const missingMaterialLine = renderer.preflight([
    {
      ...base(6), kind: "create-object", renderObjectId: "note.sync-line",
      poolFamily: "sync-line", role: "sync-line", parentObjectId: "note.root",
    },
    {
      ...base(7), kind: "set-line", renderObjectId: "note.sync-line",
      start: { x: f32(2), y: f32(3), z: f32(-14) },
      end: { x: f32(12), y: f32(8), z: f32(-13) },
      width: f32(0.28), materialRole: "sync-line",
    },
  ]);
  equal(missingMaterialLine.status, "evidence-required", "line requires exact material texture binding");
  equal(renderer.snapshot().nextSequence, 6, "missing line material consumes no sequence");

  const lineBatch = requireOk(renderer.preflight([
    {
      ...base(6), kind: "create-object", renderObjectId: "note.sync-line",
      poolFamily: "sync-line", role: "sync-line", parentObjectId: "note.root",
    },
    {
      ...base(7), kind: "bind-resource", renderObjectId: "note.sync-line",
      binding: "material", logicalAssetId: "asset.sync-line", exactKey: null,
    },
    {
      ...base(8), kind: "set-line", renderObjectId: "note.sync-line",
      start: { x: f32(2), y: f32(3), z: f32(-14) },
      end: { x: f32(12), y: f32(8), z: f32(-13) },
      width: f32(0.28), materialRole: "sync-line",
    },
    { ...base(9), kind: "activate-object", renderObjectId: "note.sync-line" },
  ]), "preflight R2 sync-line batch");
  equal(renderer.sceneSnapshot().length, 2, "sync-line preflight has zero scene mutation");
  requireOk(renderer.commit(lineBatch), "commit R2 sync-line batch");
  const lineScene = renderer.sceneSnapshot().find((row) => row.renderObjectId === "note.sync-line");
  equal(lineScene?.geometryVertexCount, 4, "sync-line quad has four vertices");
  equal(lineScene?.geometryIndexCount, 6, "sync-line quad has six indices");
  equal(lineScene?.visible, true, "sync-line is visible after activation");
  equal(renderer.resourceSnapshot()[1]?.spriteReferenceCount, 1, "sync-line material is reference counted");

  requireOk(renderer.execute({
    ...base(10), kind: "release-object", renderObjectId: "note.sync-line",
  }), "release Pixi sync-line object");
  requireOk(renderer.execute({
    ...base(11), kind: "release-object", renderObjectId: "note.mesh",
  }), "release Pixi mesh object");
  requireOk(renderer.execute({
    ...base(12), kind: "release-object", renderObjectId: "note.root",
  }), "release Pixi object");
  equal(renderer.sceneSnapshot().length, 0, "Pixi release removes object");
  equal(renderer.resourceSnapshot()[0]?.spriteReferenceCount, 0, "release decrements Sprite reference");
  equal(renderer.resourceSnapshot()[1]?.spriteReferenceCount, 0, "release decrements line material reference");
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
      return wrappedSprite();
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

  let mutationFactoryCalls = 0;
  const mutationFailure = new PixiRendererBackend(decoder, {
    create() {
      mutationFactoryCalls += 1;
      const node = mutationFactoryCalls === 1 ? wrappedSprite() : new Container();
      if (mutationFactoryCalls === 1) {
        node.addChild = (() => {
          throw new Error("synthetic Pixi addChild mutation failure");
        }) as typeof node.addChild;
      }
      return node;
    },
  });
  requireOk(await mutationFailure.prepare(
    "mutation-failure-session",
    profile(),
    provider,
    new PortableRenderResourcePreflightAdapter(),
  ), "prepare mutation-failure renderer");
  requireOk(mutationFailure.execute({
    sessionId: "mutation-failure-session", sequence: 0, frame: 0, substep: 0,
    kind: "create-object", renderObjectId: "mutation.parent",
    poolFamily: "normal", role: "note-root", parentObjectId: null,
  }), "create live parent before mutation fault");
  requireOk(mutationFailure.execute({
    sessionId: "mutation-failure-session", sequence: 1, frame: 0, substep: 0,
    kind: "bind-resource", renderObjectId: "mutation.parent",
    binding: "sprite", logicalAssetId: "asset.note", exactKey: "note_normal_0",
  }), "bind live parent before mutation fault");
  requireOk(mutationFailure.execute({
    sessionId: "mutation-failure-session", sequence: 2, frame: 0, substep: 0,
    kind: "activate-object", renderObjectId: "mutation.parent",
  }), "activate live parent before mutation fault");
  equal(mutationFailure.resourceSnapshot()[0]?.spriteReferenceCount, 1, "pre-fault scene owns one texture reference");
  const mutationBatch = requireOk(mutationFailure.preflight([
    {
      sessionId: "mutation-failure-session", sequence: 3, frame: 0, substep: 0,
      kind: "create-object", renderObjectId: "mutation.child",
      poolFamily: "long", role: "note-mesh", parentObjectId: "mutation.parent",
    },
  ]), "preflight mutation-failure batch");
  const mutationFault = mutationFailure.commit(mutationBatch);
  equal(mutationFault.status, "evidence-required", "Pixi scene mutation exception is structured");
  equal(mutationFailure.snapshot().state, "faulted", "scene mutation exception is terminal");
  equal(mutationFailure.snapshot().fault?.capability, "render.pixi.scene-mutation-threw", "scene mutation fault is retained");
  equal(mutationFailure.snapshot().objectCount, 0, "terminal mutation reset clears recording identities");
  equal(mutationFailure.sceneSnapshot().length, 0, "terminal mutation reset clears Pixi identities");
  equal(mutationFailure.stage.children.length, 0, "terminal mutation reset detaches partial scene roots");
  equal(mutationFailure.resourceSnapshot()[0]?.spriteReferenceCount, 0, "terminal mutation reset clears resource references");
  requireOk(mutationFailure.dispose(), "dispose mutation-faulted renderer");
  equal(mutationFailure.snapshot().resourceCount, 0, "mutation-fault dispose releases resources");

  const reserved: Container[] = [];
  const discardRenderer = new PixiRendererBackend(decoder, {
    create() {
      const node = wrappedSprite();
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

  console.log("Pixi v8 semantic adapter tests passed: atomic decode/cache/Sprite/R2-Mesh/sync-line/order/fault/release");
}

void main().catch((error: unknown) => {
  throw error;
});
