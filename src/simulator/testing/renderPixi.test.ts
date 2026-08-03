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
import { InGameRecord } from "../engine/managers/inGameRecord";
import { RenderCommandProducer } from "../engine/rendering/renderCommandProducer";
import {
  buildOrdinaryBaseNoteMesh,
  buildOrdinarySyncLine,
} from "../engine/rendering/ordinaryNoteGeometry";

const SESSION = "pixi-test-session";
const png = new Uint8Array(24);
png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
png.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
png.set([0, 0, 0, 4, 0, 0, 0, 4], 16);
const hudPng = Uint8Array.from(png);
hudPng.set([0, 0, 0, 32, 0, 0, 0, 16], 16);
const animationBytes = new Uint8Array([0x52, 0x50, 0x48, 0x33]);
const hudKeys = [
  ...Array.from({ length: 10 }, (_, index) => `icon_number_big_${index}`),
  ...Array.from({ length: 10 }, (_, index) => `icon_number_big_AP_${index}`),
  "effect_health_guard_outline",
  "UI_effect_life_plus_icon",
  "skill_eff",
  "icon_skill_score_up_1",
  "icon_skill_score_up_2",
  "icon_skill_score_zero",
  "icon_skill_score_half",
];

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
    }, {
      logicalAssetId: "asset.hud",
      role: "hud-atlas",
      byteLength: hudPng.byteLength,
      sha256: sha256UpperHex(hudPng),
      mime: "image/png",
      width: 32,
      height: 16,
      textureSettings: {
        scaleMode: "linear",
        wrapModeU: "clamp",
        wrapModeV: "clamp",
        mipmap: "off",
        premultiplyAlpha: true,
        blendMode: "normal",
      },
      atlasRows: hudKeys.map((exactKey, index) => ({
        exactKey,
        x: index % 8 * 4,
        y: Math.floor(index / 8) * 4,
        width: 4,
        height: 4,
        pivotX: 0.5,
        pivotY: 0.5,
        pixelsPerUnit: 100,
      })),
      materialRole: "hud",
      animationRole: "none",
      provenance: "current-apk",
    }, {
      logicalAssetId: "asset.combo-animation",
      role: "animation-clip",
      byteLength: animationBytes.byteLength,
      sha256: sha256UpperHex(animationBytes),
      mime: "application/octet-stream",
      width: null,
      height: null,
      textureSettings: null,
      atlasRows: [],
      materialRole: "none",
      animationRole: "combo",
      provenance: "current-apk",
    }, {
      logicalAssetId: "asset.life-animation",
      role: "animation-clip",
      byteLength: animationBytes.byteLength,
      sha256: sha256UpperHex(animationBytes),
      mime: "application/octet-stream",
      width: null,
      height: null,
      textureSettings: null,
      atlasRows: [],
      materialRole: "none",
      animationRole: "life-heal",
      provenance: "current-apk",
    }, {
      logicalAssetId: "asset.multiple-directional-line",
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
      materialRole: "multiple-directional-line",
      animationRole: "none",
      provenance: "current-apk",
    }, {
      logicalAssetId: "asset.score-skill-animation",
      role: "animation-clip",
      byteLength: animationBytes.byteLength,
      sha256: sha256UpperHex(animationBytes),
      mime: "application/octet-stream",
      width: null,
      height: null,
      textureSettings: null,
      atlasRows: [],
      materialRole: "none",
      animationRole: "score-skill",
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
  const endpoint = (y: number) => ({
    position: { x: f32(0.5), y: f32(y) },
    localScaleX: f32(0.5),
    buttonCount: 1,
  });
  const geometry = requireOk(buildOrdinaryBaseNoteMesh({
    front: endpoint(0),
    after: endpoint(1),
    screenToSafeAreaRatio: f32(1),
    widthRate: f32(1),
    color: { red: f32(0.9), green: f32(0.9), blue: f32(0.9), alpha: f32(0.8) },
  }), "produce R2 base mesh");
  return {
    ...base(sequence),
    kind: "set-mesh",
    renderObjectId: "note.mesh",
    ...geometry,
    materialRole: "long-note",
  };
}

function r2Line() {
  return requireOk(buildOrdinarySyncLine({
    targetA: {
      position: { x: f32(-1), y: f32(0.5), z: f32(-14) },
      lossyScaleX: f32(1), localScaleX: f32(0.1), gameNoteType: 10,
    },
    targetB: {
      position: { x: f32(1), y: f32(-0.5), z: f32(-13) },
      lossyScaleX: f32(1), localScaleX: f32(0.1), gameNoteType: 10,
    },
    edgeMargin: f32(0),
  }), "produce R2 sync line");
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
    { logicalAssetId: "asset.hud", bytes: hudPng },
    { logicalAssetId: "asset.combo-animation", bytes: animationBytes },
    { logicalAssetId: "asset.life-animation", bytes: animationBytes },
    { logicalAssetId: "asset.multiple-directional-line", bytes: png },
    { logicalAssetId: "asset.score-skill-animation", bytes: animationBytes },
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

  const lineGeometry = r2Line();
  const missingMaterialLine = renderer.preflight([
    {
      ...base(6), kind: "create-object", renderObjectId: "note.sync-line",
      poolFamily: "sync-line", role: "sync-line", parentObjectId: "note.root",
    },
    {
      ...base(7), kind: "set-line", renderObjectId: "note.sync-line",
      ...lineGeometry, materialRole: "sync-line",
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
      ...lineGeometry, materialRole: "sync-line",
    },
    { ...base(9), kind: "activate-object", renderObjectId: "note.sync-line" },
  ]), "preflight R2 sync-line batch");
  equal(renderer.sceneSnapshot().length, 2, "sync-line preflight has zero scene mutation");
  requireOk(renderer.commit(lineBatch), "commit R2 sync-line batch");
  const lineScene = renderer.sceneSnapshot().find((row) => row.renderObjectId === "note.sync-line");
  equal(lineScene?.geometryVertexCount, 4, "sync-line quad has four vertices");
  equal(lineScene?.geometryIndexCount, 6, "sync-line quad has six indices");
  const expectedProjectedLine = [
    437.74603271484375, 184.50791931152344,
    1157.74609375, 544.5079345703125,
    1162.25390625, 535.4920654296875,
    442.25396728515625, 175.49208068847656,
  ];
  equal(
    JSON.stringify(lineScene?.geometryPositions),
    JSON.stringify(expectedProjectedLine),
    "sync-line applies the frozen 1600x720 orthographic endpoint and width projection",
  );
  equal(lineScene?.visible, true, "sync-line is visible after activation");
  equal(renderer.resourceSnapshot()[1]?.spriteReferenceCount, 1, "sync-line material is reference counted");

  const visibleBatch = requireOk(renderer.preflight([
    {
      ...base(10), kind: "create-object", renderObjectId: "field.mask",
      poolFamily: "field-mask", role: "mask", parentObjectId: null,
    },
    {
      ...base(11), kind: "set-mask", renderObjectId: "field.mask",
      mode: "visible-inside",
      polygon: [
        { x: f32(0), y: f32(0) }, { x: f32(1600), y: f32(0) },
        { x: f32(1600), y: f32(300) }, { x: f32(0), y: f32(300) },
      ],
    },
    {
      ...base(12), kind: "set-transform", renderObjectId: "field.mask",
      position: { x: f32(0), y: f32(0), z: f32(0) },
      scale: { x: f32(1), y: f32(1) }, rotationDegrees: f32(0),
      color: { red: f32(1), green: f32(1), blue: f32(1), alpha: f32(1) },
      ordering: { domainLayer: 0, sourceDepthOrSortingOrder: 0, sourceZ: f32(0), creationSequence: 0 },
      maskObjectId: null,
    },
    { ...base(13), kind: "activate-object", renderObjectId: "field.mask" },
    {
      ...base(14), kind: "create-object", renderObjectId: "field.line",
      poolFamily: "field", role: "field-line", parentObjectId: null,
    },
    {
      ...base(15), kind: "bind-resource", renderObjectId: "field.line",
      binding: "sprite", logicalAssetId: "asset.note", exactKey: "note_normal_0",
    },
    {
      ...base(16), kind: "set-transform", renderObjectId: "field.line",
      position: { x: f32(20), y: f32(30), z: f32(0) },
      scale: { x: f32(1), y: f32(1) }, rotationDegrees: f32(0),
      color: { red: f32(1), green: f32(1), blue: f32(1), alpha: f32(1) },
      ordering: { domainLayer: 1, sourceDepthOrSortingOrder: 1, sourceZ: f32(0), creationSequence: 1 },
      maskObjectId: "field.mask",
    },
    { ...base(17), kind: "activate-object", renderObjectId: "field.line" },
    {
      ...base(18), kind: "create-object", renderObjectId: "hud.combo",
      poolFamily: "hud-combo", role: "hud-combo", parentObjectId: null,
    },
    {
      ...base(19), kind: "set-hud", renderObjectId: "hud.combo", hudRole: "combo",
      state: Object.freeze({ combo: 456, allPerfect: false }),
    },
    { ...base(20), kind: "activate-object", renderObjectId: "hud.combo" },
    {
      ...base(21), kind: "play-animation", renderObjectId: "hud.combo",
      animationRole: "combo", restart: true,
    },
    {
      ...base(22), kind: "sample-animation", renderObjectId: "hud.combo",
      animationRole: "combo", elapsedSeconds: f32(0.05),
    },
    {
      ...base(23), kind: "create-object", renderObjectId: "hud.life",
      poolFamily: "hud-life", role: "hud-life", parentObjectId: null,
    },
    {
      ...base(24), kind: "set-hud", renderObjectId: "hud.life", hudRole: "life",
      state: Object.freeze({
        currentLife: 1250, playerMaxLife: 1000, lifeUpperLimit: 2000,
        singleGameOver: false, primaryFill: 1, secondaryFill: 0.25,
      }),
    },
    { ...base(25), kind: "activate-object", renderObjectId: "hud.life" },
    {
      ...base(26), kind: "play-animation", renderObjectId: "hud.life",
      animationRole: "life-heal", restart: true,
    },
    {
      ...base(27), kind: "sample-animation", renderObjectId: "hud.life",
      animationRole: "life-heal", elapsedSeconds: f32(0.25),
    },
    {
      ...base(28), kind: "create-object", renderObjectId: "hud.result",
      poolFamily: "hud-result", role: "hud-result", parentObjectId: null,
    },
    {
      ...base(29), kind: "set-hud", renderObjectId: "hud.result", hudRole: "result",
      state: Object.freeze({ representativeResult: 4, representativeSlot: 0, scoreUpType: 2 }),
    },
    { ...base(30), kind: "activate-object", renderObjectId: "hud.result" },
  ]), "preflight R3/R6 visible Pixi batch");
  equal(renderer.sceneSnapshot().length, 3, "visible preflight has zero scene mutation");
  requireOk(renderer.commit(visibleBatch), "commit R3 visible Pixi batch");
  const visibleScene = renderer.sceneSnapshot();
  equal(visibleScene.find((row) => row.renderObjectId === "field.mask")?.maskVertexCount, 4,
    "visible-inside mask retains four explicit vertices");
  const maskedField = renderer.stage.children.find((node) => node.label === "field.line");
  const fieldMask = maskedField?.mask;
  equal(fieldMask instanceof Container ? fieldMask.label : null,
    "field.mask", "field Sprite references the exact Pixi mask identity");
  equal(visibleScene.find((row) => row.renderObjectId === "hud.combo")?.activeAnimationRole,
    "combo", "Combo animation role remains owner-local");
  equal(visibleScene.find((row) => row.renderObjectId === "hud.combo")?.animationElapsedSeconds,
    f32(0.05).value, "Combo sample uses engine-authored Float32 elapsed time");
  equal(
    JSON.stringify(visibleScene.find((row) => row.renderObjectId === "hud.life")?.hudFillRatios),
    JSON.stringify([1, 0.25]),
    "Life maps primary and secondary fill without backend clamp",
  );
  equal(visibleScene.find((row) => row.renderObjectId === "hud.life")?.hudText,
    "1250/1000", "Life visible text uses committed semantic owner state");
  equal(visibleScene.find((row) => row.renderObjectId === "hud.result")?.hudSpriteCount,
    2, "R6 ScoreUp type 2 owns the exact skill_eff and icon overlay Sprites");
  equal(renderer.resourceSnapshot()[2]?.spriteReferenceCount, 7,
    "Combo, Life and ScoreUp HUD Sprites are reference counted");

  requireOk(renderer.execute({
    ...base(31), kind: "stop-animation", renderObjectId: "hud.life",
    animationRole: "life-heal", restart: false,
  }), "stop Life animation");
  requireOk(renderer.execute({ ...base(32), kind: "release-object", renderObjectId: "field.line" }),
    "release masked field Sprite");
  requireOk(renderer.execute({ ...base(33), kind: "release-object", renderObjectId: "field.mask" }),
    "release field mask");
  requireOk(renderer.execute({ ...base(34), kind: "release-object", renderObjectId: "hud.combo" }),
    "release Combo HUD");
  requireOk(renderer.execute({ ...base(35), kind: "release-object", renderObjectId: "hud.life" }),
    "release Life HUD");
  requireOk(renderer.execute({ ...base(36), kind: "release-object", renderObjectId: "hud.result" }),
    "release ScoreUp Result HUD");
  requireOk(renderer.execute({
    ...base(37), kind: "release-object", renderObjectId: "note.sync-line",
  }), "release Pixi sync-line object");
  requireOk(renderer.execute({
    ...base(38), kind: "release-object", renderObjectId: "note.mesh",
  }), "release Pixi mesh object");
  requireOk(renderer.execute({
    ...base(39), kind: "release-object", renderObjectId: "note.root",
  }), "release Pixi object");
  equal(renderer.sceneSnapshot().length, 0, "Pixi release removes object");
  equal(renderer.resourceSnapshot()[0]?.spriteReferenceCount, 0, "release decrements Sprite reference");
  equal(renderer.resourceSnapshot()[1]?.spriteReferenceCount, 0, "release decrements line material reference");
  equal(renderer.resourceSnapshot()[2]?.spriteReferenceCount, 0, "release decrements HUD Sprite references");
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

  const multipleRenderer = new PixiRendererBackend(decoder);
  requireOk(await multipleRenderer.prepare(
    SESSION,
    profile(),
    provider,
    new PortableRenderResourcePreflightAdapter(),
  ), "prepare R4 MultipleDirectional Pixi renderer");
  const multipleLineBatch = requireOk(multipleRenderer.preflight([
    {
      ...base(0), kind: "create-object", renderObjectId: "note.multiple-line",
      poolFamily: "multiple-directional-line", role: "multiple-directional-line", parentObjectId: null,
    },
    {
      ...base(1), kind: "bind-resource", renderObjectId: "note.multiple-line",
      binding: "material", logicalAssetId: "asset.multiple-directional-line", exactKey: null,
    },
    {
      ...base(2), kind: "set-line", renderObjectId: "note.multiple-line",
      start: { x: f32(-0.5), y: f32(0.5), z: f32(-14) },
      end: { x: f32(0.5), y: f32(0.5), z: f32(-14) },
      width: f32(0.025), materialRole: "multiple-directional-line",
    },
    { ...base(3), kind: "activate-object", renderObjectId: "note.multiple-line" },
  ]), "preflight R4 MultipleDirectional line batch");
  requireOk(multipleRenderer.commit(multipleLineBatch), "commit R4 MultipleDirectional line batch");
  const multipleLine = multipleRenderer.sceneSnapshot()[0];
  equal(multipleLine?.role, "multiple-directional-line", "R4 Pixi line retains dedicated role");
  equal(multipleLine?.geometryVertexCount, 4, "R4 Pixi line uses the portable four-vertex quad");
  equal(multipleLine?.geometryIndexCount, 6, "R4 Pixi line uses the portable six-index quad");
  equal(multipleLine?.visible, true, "R4 Pixi line becomes visible atomically");
  const scoreSkillBatch = requireOk(multipleRenderer.preflight([
    {
      ...base(4), kind: "create-object", renderObjectId: "hud.skill",
      poolFamily: "hud-overlay", role: "hud-overlay", parentObjectId: null,
    },
    {
      ...base(5), kind: "set-hud", renderObjectId: "hud.skill", hudRole: "overlay",
      state: { skillActive: true, scoreSkill: true, scoreGaugeActive: true, currentSkillNoteIndex: 0 },
    },
    { ...base(6), kind: "activate-object", renderObjectId: "hud.skill" },
    { ...base(7), kind: "play-animation", renderObjectId: "hud.skill", animationRole: "score-skill", restart: true },
  ]), "preflight R5 Score Skill Pixi batch");
  requireOk(multipleRenderer.commit(scoreSkillBatch), "commit R5 Score Skill Pixi batch");
  const scoreSkill = multipleRenderer.sceneSnapshot().find((entry) => entry.renderObjectId === "hud.skill");
  equal(scoreSkill?.hudText, "SCORE UP", "R5 Pixi exposes the observed Score Skill display");
  equal(scoreSkill?.activeAnimationRole, "score-skill", "R5 Pixi owns Score Skill Animator role");
  requireOk(multipleRenderer.dispose(), "dispose R4/R5 renderer");

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

  let providerDecoderCalls = 0;
  const providerFailure = new PixiRendererBackend({
    async decodePng() {
      providerDecoderCalls += 1;
      return evidenceRequired("test.unreachable-decoder", ["PR35"], "Provider failure must precede decode.");
    },
  });
  const rejectedProvider = await providerFailure.prepare(
    "provider-failure-session",
    profile(),
    { async read() { throw new Error("synthetic provider failure"); } },
    new PortableRenderResourcePreflightAdapter(),
  );
  equal(rejectedProvider.status, "evidence-required", "provider exception is structured");
  equal(providerFailure.snapshot().state, "unprepared", "provider exception remains not-ready");
  equal(providerDecoderCalls, 0, "provider exception occurs before any decode");
  equal(providerFailure.resourceSnapshot().every((row) => !row.decoded), true, "provider exception retains no texture");

  const wrongSource = new TextureSource({ width: 2, height: 2, resource: { width: 2, height: 2 } });
  const wrongTexture = new Texture({ source: wrongSource, label: "wrong-dimensions" });
  const dimensionFailure = new PixiRendererBackend({ async decodePng() { return ok(wrongTexture); } });
  const rejectedDimensions = await dimensionFailure.prepare(
    "dimension-failure-session", profile(), provider, new PortableRenderResourcePreflightAdapter(),
  );
  equal(rejectedDimensions.status, "evidence-required", "decoded dimension mismatch is structured");
  equal(dimensionFailure.snapshot().state, "unprepared", "dimension mismatch remains not-ready");
  equal(wrongTexture.destroyed, true, "dimension mismatch destroys rejected decoded texture");

  const aliasSource = new TextureSource({ width: 4, height: 4, resource: { width: 4, height: 4 } });
  const aliasTexture = new Texture({ source: aliasSource, label: "aliased-decoder-texture" });
  const aliasFailure = new PixiRendererBackend({ async decodePng() { return ok(aliasTexture); } });
  const rejectedAlias = await aliasFailure.prepare(
    "alias-failure-session", profile(), provider, new PortableRenderResourcePreflightAdapter(),
  );
  equal(rejectedAlias.status, "evidence-required", "decoder texture identity alias is structured");
  equal(aliasFailure.snapshot().state, "unprepared", "decoder alias remains not-ready");
  equal(aliasTexture.destroyed, true, "decoder alias destroys partially owned texture once");
  equal(aliasFailure.resourceSnapshot().every((row) => !row.decoded), true, "decoder alias rolls back texture cache");

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
  requireOk(contextRenderer.execute({
    sessionId: "context-session", sequence: 0, frame: 0, substep: 0,
    kind: "create-object", renderObjectId: "context.live",
    poolFamily: "normal", role: "note-root", parentObjectId: null,
  }), "create live object before context loss");
  equal(contextRenderer.sceneSnapshot().length, 1, "context test starts with live scene");
  const contextLoss = contextRenderer.notifyContextLoss();
  equal(contextLoss.status, "evidence-required", "context loss returned structurally");
  equal(contextRenderer.snapshot().state, "faulted", "context loss is terminal");
  equal(contextRenderer.snapshot().fault?.capability, "render.pixi.context-lost", "context fault preserved");
  equal(contextRenderer.sceneSnapshot().length, 0, "context fault clears live scene identities");
  equal(contextRenderer.stage.children.length, 0, "context fault detaches live Pixi nodes");
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

  const missingRenderer = new PixiRendererBackend(decoder);
  requireOk(await missingRenderer.prepare(
    "missing-session", profile(), provider, new PortableRenderResourcePreflightAdapter(),
  ), "prepare missing-object renderer");
  const missingObject = missingRenderer.preflight([{
    sessionId: "missing-session", sequence: 0, frame: 0, substep: 0,
    kind: "activate-object", renderObjectId: "missing.object",
  }]);
  equal(missingObject.status, "evidence-required", "missing object is terminal");
  equal(missingRenderer.snapshot().state, "faulted", "missing object faults renderer");
  equal(missingRenderer.snapshot().fault?.capability, "render.command.missing-object", "missing-object first fault retained");
  equal(missingRenderer.sceneSnapshot().length, 0, "missing object leaves empty scene");
  requireOk(missingRenderer.dispose(), "dispose missing-object renderer");

  const duplicateRenderer = new PixiRendererBackend(decoder);
  requireOk(await duplicateRenderer.prepare(
    "duplicate-session", profile(), provider, new PortableRenderResourcePreflightAdapter(),
  ), "prepare duplicate-object renderer");
  requireOk(duplicateRenderer.execute({
    sessionId: "duplicate-session", sequence: 0, frame: 0, substep: 0,
    kind: "create-object", renderObjectId: "duplicate.object",
    poolFamily: "normal", role: "note-root", parentObjectId: null,
  }), "create identity before duplicate");
  const duplicateObject = duplicateRenderer.preflight([{
    sessionId: "duplicate-session", sequence: 1, frame: 0, substep: 0,
    kind: "create-object", renderObjectId: "duplicate.object",
    poolFamily: "normal", role: "note-root", parentObjectId: null,
  }]);
  equal(duplicateObject.status, "evidence-required", "duplicate object is terminal");
  equal(duplicateRenderer.snapshot().state, "faulted", "duplicate object faults renderer");
  equal(duplicateRenderer.snapshot().fault?.capability, "render.command.invalid-object-acquire", "duplicate first fault retained");
  equal(duplicateRenderer.sceneSnapshot().length, 0, "terminal duplicate reset clears live object");
  equal(duplicateRenderer.stage.children.length, 0, "terminal duplicate reset clears Pixi stage");
  requireOk(duplicateRenderer.dispose(), "dispose duplicate-object renderer");

  const crossSessionRenderer = new PixiRendererBackend(decoder);
  requireOk(await crossSessionRenderer.prepare(
    "owned-session", profile(), provider, new PortableRenderResourcePreflightAdapter(),
  ), "prepare cross-session renderer");
  const crossSession = crossSessionRenderer.preflight([{
    sessionId: "foreign-session", sequence: 0, frame: 0, substep: 0,
    kind: "create-object", renderObjectId: "foreign.object",
    poolFamily: "normal", role: "note-root", parentObjectId: null,
  }]);
  equal(crossSession.status, "evidence-required", "cross-session command is terminal");
  equal(crossSessionRenderer.snapshot().fault?.capability, "render.command.invalid-session-or-sequence", "cross-session fault retained");
  requireOk(crossSessionRenderer.dispose(), "dispose cross-session renderer");

  const overlapReservations: Container[] = [];
  const overlapRenderer = new PixiRendererBackend(decoder, {
    create() {
      const node = wrappedSprite();
      overlapReservations.push(node);
      return node;
    },
  });
  requireOk(await overlapRenderer.prepare(
    "overlap-session", profile(), provider, new PortableRenderResourcePreflightAdapter(),
  ), "prepare overlapping-batch renderer");
  const firstPending = requireOk(overlapRenderer.preflight([{
    sessionId: "overlap-session", sequence: 0, frame: 0, substep: 0,
    kind: "create-object", renderObjectId: "overlap.first",
    poolFamily: "normal", role: "note-root", parentObjectId: null,
  }]), "reserve first overlapping batch");
  equal(overlapReservations[0]?.destroyed, false, "first overlapping reservation starts live");
  const overlapFault = overlapRenderer.preflight([{
    sessionId: "overlap-session", sequence: 0, frame: 0, substep: 0,
    kind: "create-object", renderObjectId: "overlap.second",
    poolFamily: "normal", role: "note-root", parentObjectId: null,
  }]);
  equal(overlapFault.status, "evidence-required", "overlapping batch is terminal");
  equal(overlapRenderer.snapshot().fault?.capability, "render.command.invalid-or-overlapping-batch", "overlap first fault retained");
  equal(overlapReservations[0]?.destroyed, true, "terminal overlap destroys detached reservation");
  equal(overlapRenderer.commit(firstPending).status, "evidence-required", "stale capability after overlap rejected by first fault");
  equal(overlapRenderer.sceneSnapshot().length, 0, "overlap fault leaves no scene identity");
  requireOk(overlapRenderer.dispose(), "dispose overlap-fault renderer");

  const invalidCapabilityRenderer = new PixiRendererBackend(decoder);
  requireOk(await invalidCapabilityRenderer.prepare(
    "capability-session", profile(), provider, new PortableRenderResourcePreflightAdapter(),
  ), "prepare invalid-capability renderer");
  requireOk(invalidCapabilityRenderer.execute({
    sessionId: "capability-session", sequence: 0, frame: 0, substep: 0,
    kind: "create-object", renderObjectId: "capability.live",
    poolFamily: "normal", role: "note-root", parentObjectId: null,
  }), "create object before invalid capability");
  const invalidCapability = invalidCapabilityRenderer.commit(Object.freeze({
    sessionId: "capability-session", firstSequence: 1, commandCount: 1,
  }));
  equal(invalidCapability.status, "evidence-required", "foreign batch capability is terminal");
  equal(invalidCapabilityRenderer.snapshot().fault?.capability, "render.pixi.invalid-batch-capability", "invalid capability fault retained");
  equal(invalidCapabilityRenderer.sceneSnapshot().length, 0, "invalid capability clears live scene");
  equal(invalidCapabilityRenderer.stage.children.length, 0, "invalid capability clears Pixi stage");
  requireOk(invalidCapabilityRenderer.dispose(), "dispose invalid-capability renderer");

  const disposeOrder: string[] = [];
  const ownedBaseTextures: Texture[] = [];
  const disposalRenderer = new PixiRendererBackend({
    async decodePng(asset) {
      const decoded = requireOk(await decoder.decodePng(asset, png), "decode disposal texture");
      ownedBaseTextures.push(decoded);
      const destroy = decoded.destroy.bind(decoded);
      decoded.destroy = ((destroySource?: boolean) => {
        disposeOrder.push(`base:${String(destroySource)}`);
        destroy(destroySource);
      }) as typeof decoded.destroy;
      return ok(decoded);
    },
  }, {
    create() {
      const node = wrappedSprite();
      const destroy = node.destroy.bind(node);
      node.destroy = ((options?: Parameters<Container["destroy"]>[0]) => {
        disposeOrder.push("object");
        destroy(options);
      }) as typeof node.destroy;
      return node;
    },
  });
  requireOk(await disposalRenderer.prepare(
    "dispose-session", profile(), provider, new PortableRenderResourcePreflightAdapter(),
  ), "prepare disposal-order renderer");
  requireOk(disposalRenderer.execute({
    sessionId: "dispose-session", sequence: 0, frame: 0, substep: 0,
    kind: "create-object", renderObjectId: "dispose.object",
    poolFamily: "normal", role: "note-root", parentObjectId: null,
  }), "create disposal object");
  requireOk(disposalRenderer.execute({
    sessionId: "dispose-session", sequence: 1, frame: 0, substep: 0,
    kind: "bind-resource", renderObjectId: "dispose.object",
    binding: "sprite", logicalAssetId: "asset.note", exactKey: "note_normal_0",
  }), "bind disposal subtexture");
  const disposalSprite = disposalRenderer.stage.children[0]?.children[0];
  if (!(disposalSprite instanceof Sprite)) throw new Error("missing disposal Sprite");
  const ownedSubtexture = disposalSprite.texture;
  requireOk(disposalRenderer.dispose(), "dispose owned object and textures");
  equal(disposeOrder[0], "object", "object is destroyed before owned base texture");
  equal(disposeOrder[disposeOrder.length - 1], "base:true", "base texture/source is destroyed last");
  equal(ownedSubtexture.destroyed, true, "owned atlas subtexture destroyed");
  equal(ownedBaseTextures[0]?.destroyed, true, "owned base texture destroyed");
  equal(disposalRenderer.stage.destroyed, false, "backend does not destroy host stage ownership");
  const disposeCount = disposeOrder.length;
  requireOk(disposalRenderer.dispose(), "repeat disposal-order dispose");
  equal(disposeOrder.length, disposeCount, "repeated dispose destroys no resource twice");

  const degradedSession = "pixi-degraded-label-session";
  const ordinaryProfile = profile();
  const degradedProfile: RenderResourceProfile = {
    ...ordinaryProfile,
    fidelity: {
      mode: "habahiro",
      fidelity: "degraded",
      profile: "current-external-portable-atlas",
      visibleLabel: "Approximate HABAHIRO",
    },
    assets: ordinaryProfile.assets.map((asset) => ({
      ...asset,
      provenance: "current-external-portable" as const,
    })),
    scene: {
      ...ordinaryProfile.scene,
      projection: {
        ...ordinaryProfile.scene.projection,
        mode: "degraded-habahiro-ordinary-projection-proxy",
      },
    },
  };
  const degradedRenderer = new PixiRendererBackend(decoder);
  requireOk(await degradedRenderer.prepare(
    degradedSession,
    degradedProfile,
    provider,
    new PortableRenderResourcePreflightAdapter(),
  ), "prepare explicit degraded Pixi renderer");
  const degradedProducer = new RenderCommandProducer(
    degradedSession,
    degradedRenderer,
    {
      noteAtlasLogicalAssetId: "asset.note",
      directionalAtlasLogicalAssetId: "asset.note",
    },
  );
  const degradedPoolSetup = requireOk(
    degradedProducer.preflightPoolSetup([], 0, 0),
    "preflight degraded diagnostic owner",
  );
  requireOk(degradedPoolSetup.commit(), "commit degraded diagnostic owner");
  const degradedSetup = requireOk(
    degradedProducer.preflightHudSetup(new InGameRecord(1000, 1000, 2000).snapshot()),
    "preflight degraded fidelity HUD",
  );
  requireOk(degradedSetup.commit(), "commit degraded fidelity HUD");
  const fidelityLabel = degradedRenderer.sceneSnapshot().find((row) =>
    row.renderObjectId === "render:hud:fidelity-label");
  equal(fidelityLabel?.visible, true, "degraded fidelity label is visibly active");
  equal(fidelityLabel?.hudText, "Approximate HABAHIRO", "degraded fidelity text is exact");
  const laneChange = requireOk(
    degradedProducer.preflightDegradedHabahiroLaneChange(1728),
    "preflight degraded HABAHIRO lane change",
  );
  requireOk(laneChange.commit(), "commit degraded HABAHIRO lane change");
  const laneDiagnostic = degradedRenderer.sceneSnapshot().find((row) =>
    row.renderObjectId === "render:habahiro:lane-change");
  equal(laneDiagnostic?.visible, true, "degraded lane-change diagnostic becomes visible");
  equal(laneDiagnostic?.hudText, "Approximate HABAHIRO · Lane Changed",
    "degraded flash then lane-change ends at the disclosed diagnostic state");
  const degradedRelease = requireOk(
    degradedProducer.preflightSessionRelease(),
    "preflight degraded session release",
  );
  requireOk(degradedRelease.commit(), "release degraded fidelity HUD");
  equal(degradedRenderer.sceneSnapshot().length, 0, "degraded label participates in reverse release");
  requireOk(degradedRenderer.dispose(), "dispose degraded renderer");

  console.log("Pixi v8 semantic adapter tests passed: Sprite/R2-Mesh/sync+Multiple-line/mask/HUD/fill/animation/fault/dispose");
}

void main().catch((error: unknown) => {
  throw error;
});
