declare function require(name: string): any;
declare const process: any;
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { Texture, TextureSource } from "pixi.js";
import {
  PixiRendererBackend,
  type PixiTextureDecoder,
} from "../backends/pixi/pixiRendererBackend";
import { ImmutableLocalRenderResourceProvider } from "../backends/resources/localResourceProvider";
import { sha256UpperHex } from "../backends/resources/sha256";
import { CURRENT_SCORE_HUD_PORTABLE_RESOURCES } from "../backends/resources/currentScoreHudResourceManifest";
import { parseCurrentScoreGaugeSsAnimationProfile } from "../backends/resources/currentScoreGaugeSsAnimationProfile";
import type {
  RenderCommand,
  RenderResourceProfile,
} from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";

const SESSION = "pixi-reduced-playback";
const png = new Uint8Array(24);
png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
png.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
png.set([0, 0, 0, 4, 0, 0, 0, 4], 16);

const decoder: PixiTextureDecoder = {
  async decodeFont(asset) {
    return ok(Object.freeze({ family: `test-${asset.sha256.slice(0, 8)}`, dispose() {} }));
  },
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
  }, ...CURRENT_SCORE_HUD_PORTABLE_RESOURCES.map((entry) => entry.profile)],
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
const animationFixture = JSON.parse(readFileSync(join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/score-hud-rank-gauge/artifacts/investigations/score-hud-rank-gauge-10-1-4/score_gauge_ss_animation_profile.json",
), "utf8"));
const animationProfile = parseCurrentScoreGaugeSsAnimationProfile(animationFixture);
assert(animationProfile !== null, "ScoreGaugeSS fixture profile parses");
assert(parseCurrentScoreGaugeSsAnimationProfile({
  ...animationFixture,
  clip: { ...animationFixture.clip, curve_count: 55 },
}) === null, "ScoreGaugeSS incomplete profile fails closed");
(profile as { scoreGaugeSsAnimation?: typeof animationProfile }).scoreGaugeSsAnimation = animationProfile;
const scoreBytes = CURRENT_SCORE_HUD_PORTABLE_RESOURCES.map((entry) => ({
  logicalAssetId: entry.profile.logicalAssetId,
  bytes: new Uint8Array(entry.profile.byteLength),
}));
const provider = requireOk(ImmutableLocalRenderResourceProvider.create([
  { logicalAssetId: "asset.note", bytes: png },
  ...scoreBytes,
]), "provider");
const preflight = {
  async sha256(bytes: Uint8Array) {
    if (bytes.byteLength === png.byteLength) return ok(sha256UpperHex(png));
    const asset = CURRENT_SCORE_HUD_PORTABLE_RESOURCES.find(
      (entry) => entry.profile.byteLength === bytes.byteLength,
    )?.profile;
    return asset === undefined
      ? evidenceRequired("test.unknown-score-resource", [], "unknown")
      : ok(asset.sha256);
  },
  async inspect(bytes: Uint8Array, mime: string) {
    if (mime !== "image/png") return ok(null);
    if (bytes.byteLength === png.byteLength) return ok({ width: 4, height: 4 });
    const asset = CURRENT_SCORE_HUD_PORTABLE_RESOURCES.find(
      (entry) => entry.profile.byteLength === bytes.byteLength,
    )?.profile;
    return asset === undefined
      ? evidenceRequired("test.unknown-score-resource", [], "unknown")
      : ok({ width: asset.width!, height: asset.height! });
  },
};
const renderer = new PixiRendererBackend(decoder);
requireOk(await renderer.prepare(
  SESSION,
  profile,
  provider,
  preflight,
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

const scoreCommands: RenderCommand[] = [
  {
    ...base(9), kind: "create-object", renderObjectId: "hud:score",
    poolFamily: "score", role: "hud-score", parentObjectId: null,
  },
  {
    ...base(10), kind: "set-hud", renderObjectId: "hud:score", hudRole: "score",
    state: Object.freeze({
      score: 864000,
      scoreText: "[BEBEBE]00[-][FF3B72]864000[-]",
      scoreMax: 959999,
      rank: 5,
      beforeRank: 4,
      rankChanged: true,
      meterKey: "score_meter_s",
      ratio: Math.fround(864000 / 959999),
      ratioBits: "3F666676",
      sliderValue: Math.fround(864000 / 959999),
      sliderValueBits: "3F666676",
      foregroundActive: true,
      indicatorLocalX: 379,
      rankMarkerCLocalX: Math.fround(56.78751754760742),
      rankMarkerBLocalX: Math.fround(135.72509765625),
      rankMarkerALocalX: Math.fround(230.4501953125),
      rankMarkerSLocalX: Math.fround(325.17529296875),
      rankMarkerSSLocalX: Math.fround(419.900390625),
      highRankEffect: "ScoreGaugeSS",
      highRankEffectActive: true,
    }),
  },
  { ...base(11), kind: "activate-object", renderObjectId: "hud:score" },
  {
    ...base(12), kind: "play-animation", renderObjectId: "hud:score",
    animationRole: "score-gauge-ss", restart: true,
  },
  {
    ...base(13), kind: "sample-animation", renderObjectId: "hud:score",
    animationRole: "score-gauge-ss", elapsedSeconds: f32(0.5),
  },
];
const scoreBatch = requireOk(renderer.preflight(scoreCommands), "preflight Score HUD");
requireOk(renderer.commit(scoreBatch), "commit Score HUD");
const scoreHud = renderer.sceneSnapshot().find((row) => row.renderObjectId === "hud:score");
assert(scoreHud?.position[0] === 389 && scoreHud.position[1] === 51, "Score root uses recovered UI transform");
assert(scoreHud.hudText === "", "Score does not use a system Text fallback");
assert(scoreHud.hudScoreDigitCount === 8, "Score uses resource-backed minimum-eight BMFont glyphs");
assert(scoreHud.hudScoreRankVisualCount === 10, "Score uses five current sgm labels and five level_mark sprites");
assert(scoreHud.hudFillRatios?.[0] === Math.fround(864000 / 959999), "Score slider consumes domain ratio");
assert(scoreHud.activeAnimationRole === "score-gauge-ss", "SS transition starts resource-backed high-rank effect");
const expectedAnimation = (JSON.parse(readFileSync(join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/score-hud-rank-gauge/artifacts/investigations/score-hud-rank-gauge-10-1-4/score_gauge_ss_animation_profile.json",
), "utf8")).oracle_samples as any[]).find((row) => row.phase === 0.5).nodes;
const kira1 = scoreHud.hudScoreHighRankNodes?.find((node) => node.name === "kira_1");
assert(kira1?.visible === expectedAnimation.kira_1.active, "ScoreGaugeSS active curve matches oracle");
assert(kira1?.position[0] === expectedAnimation.kira_1.position[0], "ScoreGaugeSS X curve matches oracle");
assert(kira1?.position[1] === -expectedAnimation.kira_1.position[1], "ScoreGaugeSS Y curve maps to Pixi origin");
assert(kira1?.scale[0] === expectedAnimation.kira_1.scale[0], "ScoreGaugeSS scale curve matches oracle");
const overflowRatio = Math.fround(Math.fround(100000000) / Math.fround(959999));
const overflowBatch = requireOk(renderer.preflight([{
  ...base(14), kind: "set-hud", renderObjectId: "hud:score", hudRole: "score",
  state: Object.freeze({
    score: 100000000,
    scoreText: "[BEBEBE][-][FF3B72]100000000[-]",
    scoreMax: 959999,
    rank: 5,
    beforeRank: 5,
    rankChanged: false,
    meterKey: "score_meter_s",
    ratio: overflowRatio,
    ratioBits: floatBits(overflowRatio),
    sliderValue: Math.fround(1),
    sliderValueBits: "3F800000",
    foregroundActive: true,
    indicatorLocalX: 422,
    rankMarkerCLocalX: Math.fround(56.78751754760742),
    rankMarkerBLocalX: Math.fround(135.72509765625),
    rankMarkerALocalX: Math.fround(230.4501953125),
    rankMarkerSLocalX: Math.fround(325.17529296875),
    rankMarkerSSLocalX: Math.fround(419.900390625),
    highRankEffect: "none",
    highRankEffectActive: true,
  }),
}]), "preflight overflow Score HUD");
requireOk(renderer.commit(overflowBatch), "commit overflow Score HUD");
const overflowHud = renderer.sceneSnapshot().find((row) => row.renderObjectId === "hud:score");
assert(overflowHud?.hudScoreDigitCount === 9, "Score minimum-eight digits do not truncate overflow");

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
function floatBits(value: number): string {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, false);
  return view.getUint32(0, false).toString(16).toUpperCase().padStart(8, "0");
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
