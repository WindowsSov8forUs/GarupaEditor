declare function require(name: string): any;
declare const process: any;
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

import { Texture, TextureSource } from "pixi.js";
import { PixiRendererBackend, type PixiTextureDecoder } from "../backends/pixi/pixiRendererBackend";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "../backends/resources/currentOrdinaryResourceManifest";
import { CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES } from "../backends/resources/currentOrdinaryVisibleResourceManifest";
import { parseCurrentOrdinaryVisibleProfile } from "../backends/resources/currentOrdinaryVisibleProfile";
import { CURRENT_SCORE_HUD_PORTABLE_RESOURCES } from "../backends/resources/currentScoreHudResourceManifest";
import { parseCurrentScoreGaugeSsAnimationProfile } from "../backends/resources/currentScoreGaugeSsAnimationProfile";
import { ImmutableLocalRenderResourceProvider, PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import type { RenderCommand, RenderResourceAssetProfile, RenderResourceProfile } from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { ok, type SimulatorResult } from "../engine/evidence";
import { createSimulatorEngine } from "../host/createSimulatorEngine";

type CommandWithoutBase<T = RenderCommand> = T extends RenderCommand
  ? Omit<T, "sessionId" | "sequence" | "frame" | "substep">
  : never;

const SESSION = "pixi-actual-ordinary-visible";
const fixtureRoot = join(process.cwd(), "src/simulator/testing/fixtures/reverse-snapshots");
const ordinaryRoot = join(fixtureRoot, "autonomous-module/artifacts/investigations/autonomous-simulator-portable-pack-10-1-4");
const visibleRoot = join(fixtureRoot, "ordinary-visible-rendering/artifacts/investigations/ordinary-visible-rendering-portable-10-1-4");
const scoreRoot = join(fixtureRoot, "score-hud-rank-gauge/artifacts/investigations/score-hud-rank-gauge-10-1-4");

const decoder: PixiTextureDecoder = {
  async decodeFont(asset) {
    return ok(Object.freeze({ family: `sgm-${asset.sha256.slice(0, 8)}`, dispose() {} }));
  },
  async decodePng(asset) {
    const source = new TextureSource({
      width: asset.width!, height: asset.height!,
      resource: { width: asset.width!, height: asset.height! },
      resolution: 1, autoGarbageCollect: false,
    });
    return ok(new Texture({ source, label: asset.logicalAssetId }));
  },
};

async function main(): Promise<void> {
  const baseProfile = JSON.parse(readFileSync(join(ordinaryRoot, "ordinary_portable_profile.json"), "utf8")) as RenderResourceProfile;
  const visibleFixture = JSON.parse(readFileSync(join(visibleRoot, "ordinary_visible_rendering_profile.json"), "utf8"));
  const visibleProfile = parseCurrentOrdinaryVisibleProfile(visibleFixture);
  assert(visibleProfile !== null, "ordinary visible profile parses");
  const scoreAnimation = parseCurrentScoreGaugeSsAnimationProfile(JSON.parse(readFileSync(
    join(scoreRoot, "score_gauge_ss_animation_profile.json"), "utf8",
  )));
  assert(scoreAnimation !== null, "ScoreGaugeSS profile parses");
  const profile: RenderResourceProfile = {
    ...baseProfile,
    packIdentity: `${baseProfile.packIdentity}+actual-visible+actual-score`,
    assets: Object.freeze([
      ...baseProfile.assets,
      ...CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES.map((row) => row.profile),
      ...CURRENT_SCORE_HUD_PORTABLE_RESOURCES.map((row) => row.profile),
    ]),
    ordinaryVisibleProfile: visibleProfile,
    scoreGaugeSsAnimation: scoreAnimation,
  };
  const resources = actualResources(profile.assets);
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(resources), "actual provider");
  const renderer = new PixiRendererBackend(decoder);
  requireOk(await renderer.prepare(
    SESSION, profile, provider, new PortableRenderResourcePreflightAdapter(),
  ), "actual Pixi prepare");

  let sequence = 0;
  const commands: RenderCommand[] = [];
  const push = (command: CommandWithoutBase) => {
    commands.push({ ...command, sessionId: SESSION, sequence: sequence++, frame: 0, substep: 0 } as RenderCommand);
  };
  createAnimatedSprite(push, "note:up", "note-icon", "ordinary/notes/skin00/atlas", "note_flick_top", "note-flick", f32(0.1666666716337204));
  createAnimatedSprite(push, "note:left", "note-icon", "ordinary/notes/directionalflickskin00/atlas", "note_flick_top_l", "note-directional-flick", f32(0.1666666716337204));
  createAnimatedSprite(push, "note:right", "note-icon", "ordinary/notes/directionalflickskin00/atlas", "note_flick_top_r", "note-directional-flick", f32(0.1666666716337204));
  createAnimatedSprite(push, "note:flash", "note-intermediate", "ordinary/notes/skin00/atlas", "note_long_flash_3", "note-long-flash", f32(0.4166666567325592));

  push({ kind: "create-object", renderObjectId: "hud:combo", poolFamily: "combo", role: "hud-combo", parentObjectId: null });
  push({ kind: "set-hud", renderObjectId: "hud:combo", hudRole: "combo", state: Object.freeze({ combo: 1234, allPerfect: true }) });
  push({ kind: "activate-object", renderObjectId: "hud:combo" });
  push({ kind: "play-animation", renderObjectId: "hud:combo", animationRole: "combo", restart: true });
  push({ kind: "play-animation", renderObjectId: "hud:combo", animationRole: "all-perfect", restart: true });
  push({ kind: "sample-animation", renderObjectId: "hud:combo", animationRole: "combo", elapsedSeconds: f32(0.0833333358168602) });
  push({ kind: "sample-animation", renderObjectId: "hud:combo", animationRole: "all-perfect", elapsedSeconds: f32(0.4166666567325592) });

  push({ kind: "create-object", renderObjectId: "hud:add", poolFamily: "add", role: "hud-add-score", parentObjectId: null });
  push({ kind: "set-hud", renderObjectId: "hud:add", hudRole: "add-score", state: Object.freeze({ value: 456, poolIndex: 0, depth: 3 }) });
  push({ kind: "activate-object", renderObjectId: "hud:add" });
  push({ kind: "play-animation", renderObjectId: "hud:add", animationRole: "add-score", restart: true });
  push({ kind: "sample-animation", renderObjectId: "hud:add", animationRole: "add-score", elapsedSeconds: f32(0) });

  push({ kind: "create-object", renderObjectId: "hud:result", poolFamily: "result", role: "hud-result", parentObjectId: null });
  push({ kind: "set-hud", renderObjectId: "hud:result", hudRole: "result", state: Object.freeze({ judgeKey: "judge_great", timingKey: "judge_fast" }) });
  push({ kind: "activate-object", renderObjectId: "hud:result" });
  push({ kind: "play-animation", renderObjectId: "hud:result", animationRole: "result", restart: true });
  push({ kind: "sample-animation", renderObjectId: "hud:result", animationRole: "result", elapsedSeconds: f32(0.999) });

  push({ kind: "create-object", renderObjectId: "hud:life", poolFamily: "life", role: "hud-life", parentObjectId: null });
  push({ kind: "set-hud", renderObjectId: "hud:life", hudRole: "life", state: lifeState(200, 1000, 2000, false) });
  push({ kind: "activate-object", renderObjectId: "hud:life" });

  const batch = requireOk(renderer.preflight(commands), "actual visible command preflight");
  requireOk(renderer.commit(batch), "actual visible command commit");
  const scene = renderer.sceneSnapshot();
  const row = (id: string) => {
    const value = scene.find((candidate) => candidate.renderObjectId === id);
    assert(value !== undefined, `${id} exists`);
    return value;
  };
  equal(row("note:up").position[1], -1, "up Flick midpoint consumes Reverse Y=1 with Pixi origin");
  equal(row("note:left").position[0], Math.fround(-1.9500000476837158), "left Flick midpoint curve");
  equal(row("note:right").position[0], Math.fround(1.9500000476837158), "right Flick midpoint curve");
  equal(row("note:flash").spriteAlpha, 1, "Long Flash current alpha channel remains one");
  equal(row("note:flash").spriteTint, 0x999999, "Long Flash midpoint RGB=.6 maps to Sprite tint");

  const combo = row("hud:combo");
  equal(combo.hudText, null, "Combo creates no system Text");
  equal(combo.hudSpriteCount, 5, "AP Combo has unit plus four Sprite digits");
  assert(combo.hudSpriteLabels?.includes("combo-unit"), "AP Combo unit Sprite exists");
  assert(combo.hudSpriteAlphas?.every((alpha) => alpha === 0.5), "AP five-channel midpoint alpha matches Reverse oracle");
  equal(combo.activeAnimationRole, "all-perfect", "Combo scale and AP roles coexist without replacing AP");

  const add = row("hud:add");
  equal(add.hudText, null, "AddScore creates no system Text");
  equal(add.hudSpriteCount, 4, "AddScore plus and three digits are Sprites");
  equal(add.alpha, Math.fround(0.2), "AddScore phase zero alpha matches current Float32 curve");
  equal(add.position[0], 389, "AddScore current scene X");

  const result = row("hud:result");
  equal(result.hudText, null, "Result creates no system Text");
  equal(result.hudSpriteCount, 2, "Result owns separate judge and timing Sprites");
  equal(result.alpha, 1, "Result remains fully opaque before one-second hide");

  const life = row("hud:life");
  equal(life.hudText, "200/1000", "Life uses current/max label");
  assert(life.hudFontFamily?.startsWith("sgm-"), "Life label uses hash-validated sgm font");
  equal(life.hudFillRatios?.[0], Math.fround(0.2), "Life primary fill Float32 threshold");
  assert(life.hudSpriteLabels?.includes("life-warning-outline"), "Life warning outline Sprite exists");
  assert(life.hudSpriteLabels?.includes("life-warning-body"), "Life warning body Sprite exists");

  const invalid = renderer.preflight([{
    sessionId: SESSION, sequence, frame: 1, substep: 0,
    kind: "set-hud", renderObjectId: "hud:life", hudRole: "life",
    state: { ...lifeState(251, 1000, 2000, false), warning: true },
  }]);
  equal(invalid.status, "evidence-required", "Life threshold mismatch fails before Pixi mutation");
  equal(renderer.sceneSnapshot().find((candidate) => candidate.renderObjectId === "hud:life")?.hudText, "200/1000", "failed batch leaves Pixi HUD unchanged");

  requireOk(renderer.dispose(), "actual Pixi dispose");
  equal(renderer.snapshot().objectCount, 0, "actual Pixi dispose releases all owners");
  const fullChart = await verifyActualPixiFullChart(profile, resources);
  const observationPath = process.env.SIMULATOR_RENDER_OBSERVATION_PATH;
  if (typeof observationPath === "string" && observationPath.length > 0) {
    writeFileSync(observationPath, JSON.stringify({
      schemaVersion: 1,
      source: "actual-pixi-reverse-semantic-oracle",
      cases: Object.fromEntries([
        "PR08", "PR09", "PR11", "PR22", "PR23", "PR24", "PR26", "PR27", "PR29", "PR30", "PR39",
      ].map((id) => [id, { status: "closed", observation: id === "PR39" ? "failed-batch-zero-mutation" : "actual-pixi-positive-route" }])),
      fullChart,
    }, null, 2));
  }
  console.log("actual Pixi ordinary visible oracle passed: Note cubic owners + Combo/AP/AddScore/Result/Life resource routes");
}

async function verifyActualPixiFullChart(
  profile: RenderResourceProfile,
  resources: readonly { readonly logicalAssetId: string; readonly bytes: Uint8Array }[],
): Promise<{ readonly batches: number; readonly frames: number; readonly score: number; readonly routes: readonly string[] }> {
  const chartText = readFileSync(join(
    fixtureRoot,
    "chart-construction/fixtures/poppin_shuffle_special.txt",
  ), "utf8");
  const chart = requireOk(createNoteBatchInformationList({ musicScoreData: chartText }), "construct ordinary full chart");
  const sessionId = "pixi-actual-poppin-shuffle-special";
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(resources), "full-chart actual provider");
  const renderer = new PixiRendererBackend(decoder);
  requireOk(await renderer.prepare(
    sessionId, profile, provider, new PortableRenderResourcePreflightAdapter(),
  ), "full-chart actual Pixi prepare");
  const scene = ordinaryScene();
  const engine = requireOk(createSimulatorEngine({
    chart,
    runtime: {
      highFrequencyMode: false,
      judgeOffsetFrames: 0,
      playMode: { kind: "auto-live" as const, resultTransform: "identity" as const },
    },
    scoreLifeState: {
      schemaVersion: 1,
      sessionId,
      scoreLevel: 27,
      totalParameter: Math.fround(100000),
      scoreGaugeMaster: {
        musicId: 786,
        difficulty: "special",
        scoreC: 36000,
        scoreB: 216000,
        scoreA: 432000,
        scoreS: 648000,
        scoreSS: 864000,
      },
      life: {
        initialLife: 1000,
        playerMaxLife: 1000,
        lifeUpperLimit: 2000,
        missDamage: -100,
        badDamage: -50,
      },
      mode: { kind: "auto-live" as const, comboCoefficient: Math.fround(1) },
    },
    rendering: {
      sessionId,
      resources: CURRENT_ORDINARY_RENDER_BINDINGS,
      ordinaryNoteScene: scene,
    },
  }, createRecordingSimulatorBackends(renderer)), "create actual Pixi full-chart engine");
  requireOk(engine.initialize(), "initialize actual Pixi full-chart engine");
  const routes = new Set<string>();
  let frames = 0;
  let finalSnapshot = requireOk(engine.snapshot(), "initial full-chart snapshot");
  for (; frames < 7200; frames += 1) {
    const stepped = engine.step(1 / 30);
    if (stepped.status !== "ok") throw new Error(`full-chart render blocker ${stepped.capability}`);
    if (frames % 60 !== 0) continue;
    finalSnapshot = requireOk(engine.snapshot(), `full-chart snapshot ${frames}`);
    const visible = renderer.sceneSnapshot();
    const combo = visible.find((row) => row.renderObjectId === "render:hud:combo");
    const add = visible.find((row) => row.renderObjectId.startsWith("render:hud:add-score") && row.visible);
    const result = visible.find((row) => row.renderObjectId === "render:hud:result");
    const score = visible.find((row) => row.renderObjectId === "render:hud:score");
    const life = visible.find((row) => row.renderObjectId === "render:hud:life");
    if (combo?.visible && combo.hudSpriteCount !== null && combo.hudSpriteCount >= 2) routes.add("combo");
    if (add?.visible && add.hudText === null && (add.hudSpriteCount ?? 0) >= 2) routes.add("add-score");
    if (result?.visible && result.hudText === null && (result.hudSpriteCount ?? 0) >= 1) routes.add("result");
    if (score?.visible && (score.hudScoreDigitCount ?? 0) >= 8) routes.add("score");
    if (life?.visible && life.hudFontFamily?.startsWith("sgm-")) routes.add("life");
    if (finalSnapshot.managers.noteManager.nextBatchIndex === chart.noteBatches.length &&
      finalSnapshot.adjustedMusicPosition > 5000) break;
  }
  finalSnapshot = requireOk(engine.snapshot(), "actual Pixi final full-chart snapshot");
  equal(finalSnapshot.managers.noteManager.nextBatchIndex, chart.noteBatches.length,
    "actual Pixi full chart consumes every Note batch");
  equal([...routes].sort().join(","), "add-score,combo,life,result,score",
    "actual Pixi full chart observes the Reverse judged command order route set");
  const record = finalSnapshot.managers.scoreLifeState?.record;
  assert(record !== undefined, "full-chart Score/Life snapshot exists");
  assert(record.score > 0 && record.currentCombo > 0, "full-chart Auto Live updates Score and Combo");
  equal(record.currentLife, 1000, "full-chart Auto Live preserves ordinary Life");
  requireOk(engine.dispose(), "dispose actual Pixi full-chart engine");
  equal(renderer.snapshot().objectCount, 0, "actual Pixi full-chart releases every owner");
  equal(renderer.stage.children.length, 0, "actual Pixi full-chart leaves an empty stage");
  const routeList = Object.freeze([...routes].sort());
  console.log(`actual Pixi ordinary full-chart passed: batches=${chart.noteBatches.length} frames=${frames} score=${record.score} routes=${routeList.join("|")}`);
  return Object.freeze({ batches: chart.noteBatches.length, frames, score: record.score, routes: routeList });
}

function ordinaryScene() {
  const v2 = (x: number, y: number) => Object.freeze({ x: f32(x), y: f32(y) });
  const v3 = (x: number, y: number, z: number) => Object.freeze({ ...v2(x, y), z: f32(z) });
  return Object.freeze({
    specificSpeed: f32(11),
    noteSettingScale: f32(1),
    launcherY: f32(5.420000076293945),
    targetCenterY: f32(-3.450000047683716),
    highAspectRatio: f32(1),
    noteStartPositions: Object.freeze(Array.from({ length: 7 }, (_, lane) =>
      v3(Math.fround((lane - 3) * 0.11), 4.976500511169434, -13.5))),
    goalPositions: Object.freeze(Array.from({ length: 7 }, (_, lane) =>
      v3(Math.fround((lane - 3) * 2.2), -3.450000047683716, -13.5))),
    noteColor: Object.freeze({ red: f32(1), green: f32(1), blue: f32(1), alpha: f32(1) }),
    noteDomainLayer: 3,
    syncLineEdgeMargin: f32(0.2),
    screenToSafeAreaRatio: f32(1),
    longMeshColor: Object.freeze({ red: f32(0.8), green: f32(0.8), blue: f32(0.8), alpha: f32(0.6) }),
  });
}

function actualResources(assets: readonly RenderResourceAssetProfile[]) {
  const ordinaryFiles = new Map([
    ["ordinary/notes/skin00/atlas", "ordinary-portable-assets/rhythm-game-sprites.png"],
    ["ordinary/notes/skin00/long-note-line", "ordinary-portable-assets/long-note-line.png"],
    ["ordinary/notes/skin00/curve-note-line", "ordinary-portable-assets/curve-note-line.png"],
    ["ordinary/notes/skin00/simultaneous-line", "ordinary-portable-assets/simultaneous-line.png"],
    ["ordinary/notes/directionalflickskin00/atlas", "ordinary-portable-assets/directional-flick-sprites.png"],
    ["ordinary/notes/directionalflickskin00/line-left", "ordinary-portable-assets/directional-line-left.png"],
    ["ordinary/notes/directionalflickskin00/line-right", "ordinary-portable-assets/directional-line-right.png"],
  ]);
  const visibleFiles = new Map(CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES.map((row) => [row.profile.logicalAssetId, join("portable-assets", row.resourceKeySuffix)]));
  const scoreFiles = new Map(CURRENT_SCORE_HUD_PORTABLE_RESOURCES.map((row) => [row.profile.logicalAssetId, join("portable-assets", row.resourceKeySuffix)]));
  return assets.map((asset) => {
    const ordinary = ordinaryFiles.get(asset.logicalAssetId);
    const visible = visibleFiles.get(asset.logicalAssetId);
    const score = scoreFiles.get(asset.logicalAssetId);
    const path = ordinary !== undefined ? join(ordinaryRoot, ordinary)
      : visible !== undefined ? join(visibleRoot, visible)
      : score !== undefined ? join(scoreRoot, score)
      : null;
    if (path === null) throw new Error(`missing actual fixture mapping ${asset.logicalAssetId}`);
    return Object.freeze({ logicalAssetId: asset.logicalAssetId, bytes: new Uint8Array(readFileSync(path)) });
  });
}

function createAnimatedSprite(
  push: (command: CommandWithoutBase) => void,
  id: string,
  role: "note-icon" | "note-intermediate",
  logicalAssetId: string,
  exactKey: string,
  animationRole: "note-flick" | "note-directional-flick" | "note-long-flash",
  elapsedSeconds: ReturnType<typeof f32>,
): void {
  push({ kind: "create-object", renderObjectId: id, poolFamily: id, role, parentObjectId: null });
  push({ kind: "bind-resource", renderObjectId: id, binding: "sprite", logicalAssetId, exactKey });
  push({ kind: "activate-object", renderObjectId: id });
  push({ kind: "play-animation", renderObjectId: id, animationRole, restart: true });
  push({ kind: "sample-animation", renderObjectId: id, animationRole, elapsedSeconds });
}

function lifeState(currentLife: number, playerMaxLife: number, lifeUpperLimit: number, singleGameOver: boolean) {
  const ratio = Math.fround(currentLife / 1000);
  const primary = Math.fround(Math.min(ratio, 1));
  return Object.freeze({
    currentLife, playerMaxLife, lifeUpperLimit, singleGameOver,
    primaryFill: f32(primary), secondaryFill: f32(Math.fround(Math.max(ratio - 1, 0))),
    color: primary <= Math.fround(0.2) ? "danger" as const : "normal" as const,
    warning: primary <= Math.fround(0.25), label: `${currentLife}/${playerMaxLife}`,
  });
}

function f32(value: number) { return requireOk(createRenderFloat32(Math.fround(value)), "Float32"); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function equal<T>(actual: T, expected: T, message: string): void { if (!Object.is(actual, expected)) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`); }
function requireOk<T>(result: SimulatorResult<T>, message: string): T { if (result.status !== "ok") throw new Error(`${message}: ${result.capability}`); return result.value; }

void main();
