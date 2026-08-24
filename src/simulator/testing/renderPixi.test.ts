import {
  DEFAULT_ORIGINAL_LIVE_SETTINGS,
  originalLiveSettingsForTest,
} from "./originalLiveSettingsTestProfile";
import { LIVE_AUTO_MODE, LIVE_MANUAL_MODE, REHEARSAL_AUTO_MODE, REHEARSAL_MANUAL_MODE } from "./modeFixtures";
declare function require(name: string): any;
declare const process: any;
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

import { Container, Graphics, Sprite, Text, Texture, TextureSource } from "pixi.js";
import { PixiRendererBackend, type PixiTextureDecoder } from "../backends/pixi/pixiRendererBackend";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "./legacyCurrentOrdinaryResourceManifest";
import { CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES } from "./legacyCurrentOrdinaryVisibleResourceManifest";
import { CURRENT_ORDINARY_HUD_PROFILE } from "../backends/resources/currentOrdinaryHudProfile";
import { parseCurrentOrdinaryVisibleProfile } from "../backends/resources/currentOrdinaryVisibleProfile";
import { CURRENT_SCORE_HUD_PORTABLE_RESOURCES } from "./legacyCurrentScoreHudResourceManifest";
import { parseCurrentScoreGaugeSsAnimationProfile } from "../backends/resources/currentScoreGaugeSsAnimationProfile";
import { ImmutableLocalRenderResourceProvider, PortableRenderResourcePreflightAdapter } from "../backends/resources/localResourceProvider";
import type { RenderCommand, RenderResourceAssetProfile, RenderResourceProfile } from "../backends/renderingContracts";
import { createRenderFloat32 } from "../backends/renderingValidation";
import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { RecordingSimulatorRendererBackend } from "../backends/recordingRendererBackend";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { RenderCommandProducer } from "../engine/rendering/renderCommandProducer";
import { ok, type SimulatorResult } from "../engine/evidence";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import { observePixiWorld } from "./pixiWorldObserver";
import { copyAndFreezeGarupaChartJson } from "../assembly/garupaChartContract";
import { constructChartFromGarupaChartJson } from "../assembly/garupaChartConstruction";
import { getGarupaProductChartProfile } from "../engine/garupa/productChartProfile";
import { getGarupaProductTimingGroupAxisProfile } from "../engine/garupa/timingGroupAxis";
import { GarupaProductRenderProducer } from "../engine/garupa/productRenderProducer";
import { createSimulatorSceneLayout } from "../scene/simulatorSceneLayout";
import { createOriginalSurfaceLayout } from "../scene/originalSurfaceLayout";
import { createPauseControlLayout, PauseControlSceneOwner } from "../scene/pauseControlScene";
import { augmentScoreHudProfilesForPause, PAUSE_COUNTDOWN_FIXTURE_RELATIVE_PATHS } from "./pauseControlTestResources";
import { resolveOriginalSkinRecipe } from "../engine/skin/originalSkinResolver";
import { selectResolvedSkinResourceInventory } from "./legacySkinResourceSelector";
import { prepareSelectedSkinPortablePacks } from "./legacySkinPortablePack";
import { ImmutableSharedStaticResourceStore } from "./legacySharedStaticResourceStore";
import { prepareSkinRenderOverlay } from "../assembly/skinRenderPreparation";

type CommandWithoutBase<T = RenderCommand> = T extends RenderCommand
  ? Omit<T, "sessionId" | "sequence" | "frame" | "substep">
  : never;

const SESSION = "pixi-actual-ordinary-visible";
const CONTROL_SURFACE_LAYOUT = requireOk(createOriginalSurfaceLayout({
  revision: 0, viewportWidth: 1600, viewportHeight: 720,
  safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) },
  origin: "bottom-left",
}, Math.fround(100)), "control surface");
const UI_SCALE = CONTROL_SURFACE_LAYOUT.ui.screenToSafeChildScale;
const fixtureRoot = join(process.cwd(), "src/simulator/testing/fixtures/reverse-snapshots");
const ordinaryRoot = join(fixtureRoot, "autonomous-module/artifacts/investigations/autonomous-simulator-portable-pack-10-1-4");
const visibleRoot = join(fixtureRoot, "ordinary-visible-rendering/artifacts/investigations/ordinary-visible-rendering-portable-10-1-4");
const scoreRoot = join(fixtureRoot, "score-hud-rank-gauge/artifacts/investigations/score-hud-rank-gauge-10-1-4");
const totalReauditRoot = join(fixtureRoot, "ordinary-rendering-total-reaudit/artifacts/investigations/ordinary-single-rendering-total-reaudit-10-1-4");
const totalReauditFixture = JSON.parse(readFileSync(
  join(totalReauditRoot, "ordinary_rendering_candidate_fixture.json"),
  "utf8",
));
const hudOracle = totalReauditFixture.hudCorrections;

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
  const scoreResources = augmentScoreHudProfilesForPause(CURRENT_SCORE_HUD_PORTABLE_RESOURCES.map((row) => row.profile));
  const profile: RenderResourceProfile = {
    ...baseProfile,
    packIdentity: `${baseProfile.packIdentity}+actual-visible+actual-score`,
    assets: Object.freeze([
      ...baseProfile.assets,
      ...CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES.map((row) => row.profile),
      ...scoreResources,
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
  requireOk(renderer.bindOriginalSurfaceLayout(CONTROL_SURFACE_LAYOUT), "bind control surface");

  const liveControls = requireOk(renderer.createInGameControlOverlay(LIVE_AUTO_MODE, 120, CONTROL_SURFACE_LAYOUT), "live controls");
  const pauseLayout = requireOk(createPauseControlLayout(CONTROL_SURFACE_LAYOUT), "Pause visual layout");
  const pauseOwner = new PauseControlSceneOwner();
  const playing = pauseOwner.snapshot(LIVE_AUTO_MODE, pauseLayout, true);
  requireOk(liveControls.publishPauseControlState(playing), "publish visible Pause button");
  assert((liveControls.root.getChildByLabel("original-pause-button") as Sprite).visible, "Live owns visible original Pause button");
  requireOk(liveControls.publishPauseControlState(Object.freeze({ ...playing, state: "pause-menu" as const })), "publish Pause modal");
  assert(liveControls.root.getChildByLabel("pause-window", true) !== null, "Pause modal uses serialized window");
  assert((liveControls.root.getChildByLabel("pause-title", true) as Text).text === "一時停止", "Pause modal uses current visible title");
  requireOk(liveControls.publishPauseControlState(Object.freeze({ ...playing, state: "retry-confirm" as const })), "publish Retry confirmation");
  assert(liveControls.root.getChildByLabel("retry-confirm-window", true) !== null, "Retry confirmation is Simulator-owned");
  requireOk(liveControls.publishPauseControlState(Object.freeze({ ...playing, state: "resume-countdown" as const, resumeCountdownSecondsRemaining: Math.fround(2.4) })), "publish Resume countdown");
  assert(liveControls.root.getChildByLabel("resume-countdown-3", true) !== null, "Resume countdown consumes exact Countdown3 texture");
  requireOk(liveControls.dispose(), "dispose Live controls");
  const manualControls = requireOk(
    renderer.createInGameControlOverlay(REHEARSAL_MANUAL_MODE, 125, CONTROL_SURFACE_LAYOUT),
    "manual Rehearsal controls",
  );
  assert(manualControls.root.label === "in-game-control-root", "control root identity");
  const rehearsalRoot = manualControls.root.getChildByLabel("rehearsal-control-root") as Container;
  assert(JSON.stringify(
    rehearsalRoot.children.filter((child) => child.label.includes("rehearsal-")).map((child) => child.label),
  ) === JSON.stringify([
    "rehearsal-return-five",
    "rehearsal-advance-five",
    "rehearsal-time-label-background",
    "rehearsal-time-label",
  ]), "manual control child identities");
  requireOk(manualControls.updateTimeline(8), "control timeline");
  assert((manualControls.root.getChildByLabel("rehearsal-time-label", true) as any)?.text === "0:08/2:05",
    "engine-owned Rehearsal time label");
  requireOk(manualControls.dispose(), "dispose manual controls");
  const autoControls = requireOk(
    renderer.createInGameControlOverlay(REHEARSAL_AUTO_MODE, 125, CONTROL_SURFACE_LAYOUT),
    "Auto Rehearsal controls",
  );
  assert(autoControls.root.getChildByLabel("rehearsal-demo-badge", true) !== null,
    "Demo Play badge exists only on Rehearsal Auto");
  requireOk(autoControls.dispose(), "dispose Auto controls");

  let sequence = 0;
  const commands: RenderCommand[] = [];
  const push = (command: CommandWithoutBase) => {
    commands.push({ ...command, sessionId: SESSION, sequence: sequence++, frame: 0, substep: 0 } as RenderCommand);
  };
  createAnimatedSprite(push, "note:up", "note-icon", "ordinary/notes/skin00/atlas", "note_flick_top", "note-flick", f32(0.1666666716337204));
  createAnimatedSprite(push, "note:left", "note-icon", "ordinary/notes/directionalflickskin00/atlas", "note_flick_top_l", "note-directional-flick", f32(0.1666666716337204));
  createAnimatedSprite(push, "note:right", "note-icon", "ordinary/notes/directionalflickskin00/atlas", "note_flick_top_r", "note-directional-flick", f32(0.1666666716337204));
  createAnimatedSprite(push, "note:flash", "note-intermediate", "ordinary/notes/skin00/atlas", "note_long_flash_3", "note-long-flash", f32(0.4166666567325592));
  push({ kind: "create-object", renderObjectId: "note:world", poolFamily: "normal", role: "note-root", parentObjectId: null });
  push({ kind: "bind-resource", renderObjectId: "note:world", binding: "sprite", logicalAssetId: "ordinary/notes/skin00/atlas", exactKey: "note_normal_1" });
  push({
    kind: "set-transform", renderObjectId: "note:world",
    position: Object.freeze({ x: f32(0), y: f32(0), z: f32(0) }),
    scale: Object.freeze({ x: f32(1), y: f32(1) }),
    rotationDegrees: f32(0),
    color: Object.freeze({ red: f32(1), green: f32(1), blue: f32(1), alpha: f32(1) }),
    ordering: Object.freeze({ domainLayer: 3, sourceDepthOrSortingOrder: 70, sourceZ: f32(0), creationSequence: 99 }),
    maskObjectId: null,
  });
  push({ kind: "activate-object", renderObjectId: "note:world" });

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
  push({ kind: "create-object", renderObjectId: "hud:add:large", poolFamily: "add", role: "hud-add-score", parentObjectId: null });
  push({ kind: "set-hud", renderObjectId: "hud:add:large", hudRole: "add-score", state: Object.freeze({ value: 10_000_001, poolIndex: 1, depth: 4 }) });
  push({ kind: "activate-object", renderObjectId: "hud:add:large" });

  push({ kind: "create-object", renderObjectId: "hud:result", poolFamily: "result", role: "hud-result", parentObjectId: null });
  push({ kind: "set-hud", renderObjectId: "hud:result", hudRole: "result", state: Object.freeze({ judgeKey: "judge_great", timingKey: "judge_fast" }) });
  push({ kind: "activate-object", renderObjectId: "hud:result" });
  push({ kind: "play-animation", renderObjectId: "hud:result", animationRole: "result", restart: true });
  push({ kind: "sample-animation", renderObjectId: "hud:result", animationRole: "result", elapsedSeconds: f32(0.04) });

  push({ kind: "create-object", renderObjectId: "hud:life", poolFamily: "life", role: "hud-life", parentObjectId: null });
  push({ kind: "set-hud", renderObjectId: "hud:life", hudRole: "life", state: lifeState(200, 1000, 2000, false) });
  push({ kind: "activate-object", renderObjectId: "hud:life" });

  push({ kind: "create-object", renderObjectId: "hud:score", poolFamily: "score", role: "hud-score", parentObjectId: null });
  push({ kind: "set-hud", renderObjectId: "hud:score", hudRole: "score", state: scoreState(9_000_000, 0, 5, true, "ScoreGaugeSS", true) });
  push({ kind: "activate-object", renderObjectId: "hud:score" });
  push({ kind: "play-animation", renderObjectId: "hud:score", animationRole: "score-gauge-ss", restart: true });
  push({ kind: "sample-animation", renderObjectId: "hud:score", animationRole: "score-gauge-ss", elapsedSeconds: f32(0.5) });

  push({ kind: "create-object", renderObjectId: "hud:score:matrix", poolFamily: "score-matrix", role: "hud-score", parentObjectId: null });
  push({ kind: "set-hud", renderObjectId: "hud:score:matrix", hudRole: "score", state: scoreState(0, 4, 4, false, "none", false) });
  push({ kind: "activate-object", renderObjectId: "hud:score:matrix" });

  const batch = requireOk(renderer.preflight(commands), "actual visible command preflight");
  requireOk(renderer.commit(batch), "actual visible command commit");
  const scene = renderer.sceneSnapshot();
  const row = (id: string) => {
    const value = scene.find((candidate) => candidate.renderObjectId === id);
    assert(value !== undefined, `${id} exists`);
    return value;
  };
  equal(row("note:up").position[1], -100, "up Flick midpoint converts Unity local units by the bound 100 PPU Sprite");
  equal(row("note:left").position[0], Math.fround(-195.00000476837158), "left Flick midpoint converts Unity local units by bound PPU");
  equal(row("note:right").position[0], Math.fround(195.00000476837158), "right Flick midpoint converts Unity local units by bound PPU");
  equal(JSON.stringify(row("note:world").position), JSON.stringify([800, 360]), "ordinary Note world origin projects to the current orthographic viewport center");
  equal(row("note:world").scale[0], Math.fround(3.6), "ordinary Note Sprite scale consumes camera PPU / Sprite PPU");
  equal(row("note:flash").spriteAlpha, 1, "Long Flash current alpha channel remains one");
  equal(row("note:flash").spriteTint, 0x999999, "Long Flash midpoint RGB=.6 maps to Sprite tint");

  const combo = row("hud:combo");
  equal(combo.hudText, null, "Combo creates no system Text");
  equal(combo.hudSpriteCount, 5, "AP Combo has unit plus four Sprite digits");
  assert(combo.hudSpriteLabels?.includes("combo-unit"), "AP Combo unit Sprite exists");
  assert(combo.hudSpriteAlphas?.every((alpha) => alpha === 0.5), "AP five-channel midpoint alpha matches Reverse oracle");
  const comboNodes = new Map(combo.hudSpriteNodes?.map((node) => [node.label, node]));
  equal(JSON.stringify(["combo-digit-0", "combo-digit-1", "combo-digit-2", "combo-digit-3"].map((label) => comboNodes.get(label)?.position)), JSON.stringify([
    [92, 0], [22, 0], [-48, 0], [-118, 0],
  ]), "Combo UISpriteNumber CENTER layout consumes inner width and negative padding");
  equal(comboNodes.get("combo-unit")?.zIndex, hudOracle.combo.unitDepth, "Combo unit retains depth above digit Sprites");
  equal(JSON.stringify(combo.ordering.slice(0, 3)), JSON.stringify([3, 100, 5]), "Combo root consumes current UIPanel sorting order and widget depth");
  equal(combo.activeAnimationRole, "all-perfect", "Combo scale and AP roles coexist without replacing AP");
  equal(combo.scale[0], Math.fround(UI_SCALE * 1.100000023841858), "Combo animation multiplies rather than replaces the UIRoot scale");

  const add = row("hud:add");
  equal(add.hudText, null, "AddScore creates no system Text");
  equal(add.hudSpriteCount, 4, "AddScore plus and three digits are Sprites");
  equal(add.alpha, Math.fround(0.2), "AddScore phase zero alpha matches current Float32 curve");
  equal(JSON.stringify(add.position), JSON.stringify([
    Math.fround(CONTROL_SURFACE_LAYOUT.starUi.safeArea.x + 282 * UI_SCALE),
    Math.fround(135 * UI_SCALE),
  ]), "AddScore starts from the post-anchor Offset+UISpriteNumber local position");
  equal(JSON.stringify(add.scale), JSON.stringify([
    Math.fround(CURRENT_ORDINARY_HUD_PROFILE.addScore.numberScale * UI_SCALE),
    Math.fround(CURRENT_ORDINARY_HUD_PROFILE.addScore.numberScale * UI_SCALE),
  ]), "AddScore composes serialized UISpriteNumber scale with UIRoot FitWidth");
  const addNodes = new Map(add.hudSpriteNodes?.map((node) => [node.label, node]));
  equal(JSON.stringify(["add-score-0", "add-score-1", "add-score-2", "add-score-3"].map((label) => addNodes.get(label)?.position)), JSON.stringify([
    [143, 0], [96, 0], [48, 0], [0, 0],
  ]), "AddScore UISpriteNumber LEFT layout consumes per-glyph inner widths and plus sign");
  equal(JSON.stringify(add.ordering.slice(0, 3)), JSON.stringify([3, 100, 3]), "AddScore depth cycle participates in current back-panel ordering");
  const largeAdd = row("hud:add:large");
  equal(largeAdd.hudSpriteCount, 9, "N=1 CS-V1 AddScore renders plus and all eight quota digits");
  equal(largeAdd.hudText, null, "large AddScore retains resource-backed UISpriteNumber without fallback text");

  const result = row("hud:result");
  equal(result.hudText, null, "Result creates no system Text");
  equal(result.hudSpriteCount, 2, "Result owns separate judge and timing Sprites");
  equal(result.alpha, hudOracle.result.gameJudgeSamples[2].values[3], "Result samples GameJudge alpha instead of a no-op animation");
  equal(
    result.scale[0],
    Math.fround(hudOracle.result.gameJudgeSamples[2].values[0] * UI_SCALE),
    "Result samples GameJudge root scale under UIRoot FitWidth",
  );
  const resultNodes = new Map(result.hudSpriteNodes?.map((node) => [node.label, node]));
  equal(JSON.stringify(resultNodes.get("result-timing")?.position), JSON.stringify([4, 38]), "JudgeTiming preserves local Y inversion under Result");
  equal(JSON.stringify(resultNodes.get("result-timing")?.scale), JSON.stringify([1.25, 1.25]), "JudgeTiming preserves local scale that cancels Result prefab scale at rest");
  equal(resultNodes.get("result-timing")?.zIndex, 55, "JudgeTiming depth remains above the judgement Sprite");

  const life = row("hud:life");
  equal(JSON.stringify(life.position), JSON.stringify([
    Math.fround(CONTROL_SURFACE_LAYOUT.starUi.safeArea.x + CONTROL_SURFACE_LAYOUT.starUi.safeArea.width),
    0,
  ]), "Life StarUIAnchor resolves the root to safe right/top");
  equal(life.hudText, "200/1000", "Life uses current/max label");
  assert(life.hudFontFamily?.startsWith("sgm-"), "Life label uses hash-validated sgm font");
  equal(life.hudFillRatios?.[0], Math.fround(0.2), "Life primary fill Float32 threshold");
  assert(life.hudSpriteLabels?.includes("life-warning-outline"), "Life warning outline Sprite exists");
  assert(life.hudSpriteLabels?.includes("life-warning-body"), "Life warning body Sprite exists");
  const lifeNodes = new Map(life.hudSpriteNodes?.map((node) => [node.label, node]));
  equal(JSON.stringify(lifeNodes.get("life-gauge-base")?.position), JSON.stringify([-225, 57]), "Life authored-world gauge base is made owner-local exactly once");
  equal(JSON.stringify(lifeNodes.get("life-primary")?.position), JSON.stringify([-211, 44]), "Life primary gauge is not double-offset by Life root");
  equal(lifeNodes.get("life-secondary")?.blend, "add", "Life second gauge consumes additive material blend");
  equal(lifeNodes.get("life-warning-outline")?.blend, "add", "Life warning outline consumes additive material blend");
  equal(lifeNodes.get("life-primary")?.width, 224, "Life primary UISlider preserves authored widget width");
  equal(lifeNodes.get("life-primary")?.maskLabel, "life-primary-fill-mask", "Life primary uses left-to-right clip rather than width shrink");
  const lifeMasks = new Map(life.hudFillMasks?.map((mask) => [mask.label, mask]));
  equal(JSON.stringify(lifeMasks.get("life-primary-fill-mask")?.bounds), JSON.stringify([-323, 31, Math.fround(44.8), 26]), "Life primary left-to-right mask matches current ratio");
  const lifeTexts = new Map(life.hudTextNodes?.map((text) => [text.label, text]));
  equal(lifeTexts.get("life-current-label")?.fontSize, 18, "Life current label consumes serialized UILabel font size");
  equal(JSON.stringify(lifeTexts.get("life-current-label")?.anchor), JSON.stringify([1, 0.5]), "Life current label consumes Right pivot");
  equal(JSON.stringify(lifeTexts.get("life-current-label")?.position), JSON.stringify([Math.fround(-103.99990844726562), 74]), "Life current label converts authored world to owner-local");
  equal(lifeTexts.get("life-game-over-label")?.text, "ライフゼロ!\n獲得スコアDOWN!", "Life owns the current GameOver UILabel text");
  equal(lifeTexts.get("life-game-over-label")?.visible, false, "GameOver label remains hidden before zero Life");
  equal(JSON.stringify(life.ordering.slice(0, 3)), JSON.stringify([3, 100, 1000]), "Life root consumes current front-panel ordering");

  const scoreAtHalf = row("hud:score");
  equal(JSON.stringify(scoreAtHalf.position), JSON.stringify([
    CONTROL_SURFACE_LAYOUT.starUi.safeArea.x,
    0,
  ]), "Score StarUIAnchor resolves the root to safe left/top");
  equal(scoreAtHalf.hudText, null, "Score allocates no hidden system Text owner");
  equal(scoreAtHalf.hudScoreDigitCount, 8, "Score threshold value owns eight bitmap glyph Sprites");
  equal(scoreAtHalf.hudScoreRankVisualCount, 10, "Score owns five marker and five TTF rank label nodes");
  equal(scoreAtHalf.hudScoreHighRankNodes?.length, 11, "ScoreGaugeSS owns the committed eleven persistent nodes");
  equal(scoreAtHalf.hudScoreHighRankGeneration, 1, "ScoreGaugeSS nodes have one owner generation");
  assert(scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label === "score-digit-0" && node.zIndex === 40), "TotalScore bitmap glyph depth is 40");
  assert(scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label === "score-gauge-background" && node.zIndex === 4), "Score background depth is 4");
  assert(scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label === "score-gauge-foreground" && node.zIndex === 5), "Score foreground depth is 5");
  assert(scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label === "score-gauge-cover" && node.zIndex === 28), "Score cover depth is 28");
  assert(scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label === "score-rank-marker-SS" && node.zIndex === 29), "Score marker depth is 29");
  const borders = new Map(scoreAtHalf.hudScoreNineSliceBorders?.map((row) => [row.label, row]));
  const backgroundBorder = borders.get("score-gauge-background");
  assert(backgroundBorder !== undefined, "Score background NineSlice exists");
  equal(JSON.stringify(backgroundBorder), JSON.stringify({ label: "score-gauge-background", left: 216, top: 0, right: 0, bottom: 16 }), "Unity left/bottom/right/top maps to Pixi left/top/right/bottom");
  const foregroundBorder = borders.get("score-gauge-foreground");
  assert(foregroundBorder !== undefined, "Score foreground NineSlice exists");
  equal(JSON.stringify(foregroundBorder), JSON.stringify({ label: "score-gauge-foreground", left: 0, top: 0, right: 0, bottom: 0 }), "SS meter border mapping");
  equal(JSON.stringify(scoreAtHalf.hudScoreIndicatorMask), JSON.stringify({
    owner: "score-high-rank-panel-mask",
    consumer: "score-high-rank-animation-layer",
    generation: 1,
    position: [25, 45],
    bounds: [42, -13.5, 375, 39],
    softness: [20, 3],
  }), "indicator drives the persistent Score high-rank panel mask owner");
  equal(scoreAtHalf.animationElapsedSeconds, Math.fround(0.5), "ScoreGaugeSS reaches the direct half-second sample");
  const halfNodes = JSON.stringify(scoreAtHalf.hudScoreHighRankNodes);

  const continued: RenderCommand[] = [
    {
      sessionId: SESSION, sequence: sequence++, frame: 1, substep: 0,
      kind: "set-hud", renderObjectId: "hud:score", hudRole: "score",
      state: scoreState(9_100_000, 5, 5, false, "none", true),
    },
    {
      sessionId: SESSION, sequence: sequence++, frame: 1, substep: 0,
      kind: "sample-animation", renderObjectId: "hud:score", animationRole: "score-gauge-ss",
      elapsedSeconds: f32(0.55),
    },
  ];
  requireOk(renderer.commit(requireOk(renderer.preflight(continued), "persistent SS update preflight")), "persistent SS update commit");
  const scoreContinued = renderer.sceneSnapshot().find((candidate) => candidate.renderObjectId === "hud:score");
  assert(scoreContinued !== undefined, "continued Score owner exists");
  equal(scoreContinued.hudScoreHighRankNodes?.length, 11, "ordinary Score update does not destroy/recreate SS nodes");
  equal(scoreContinued.hudScoreHighRankGeneration, 1, "ordinary Score update preserves the same SS owner generation");
  equal(scoreContinued.hudScoreIndicatorMask?.generation, 1, "ordinary Score update preserves the same panel mask owner generation");
  equal(scoreContinued.animationElapsedSeconds, Math.fround(0.55), "Score update preserves the running SS phase owner");
  assert(JSON.stringify(scoreContinued.hudScoreHighRankNodes) !== halfNodes, "continued SS sample advances visible node state after Score update");

  const scoreMatrix = [];
  let previousRank = 4;
  let matrixHighRankActive = false;
  for (const [matrixScore, expectedRank] of [
    [0, 4], [374_999, 4], [375_000, 3], [375_001, 3],
    [2_249_999, 3], [2_250_000, 2], [2_250_001, 2],
    [4_499_999, 2], [4_500_000, 1], [4_500_001, 1],
    [6_749_999, 1], [6_750_000, 0], [6_750_001, 0],
    [8_999_999, 0], [9_000_000, 5], [9_000_001, 5],
    [10_000_999, 5], [10_001_000, 5],
  ] as const) {
    const changed = previousRank !== expectedRank;
    const effect = changed && expectedRank === 5 ? "ScoreGaugeSS" as const : "none" as const;
    if (effect === "ScoreGaugeSS") matrixHighRankActive = true;
    const matrixCommand: RenderCommand = {
      sessionId: SESSION, sequence: sequence++, frame: 2, substep: 0,
      kind: "set-hud", renderObjectId: "hud:score:matrix", hudRole: "score",
      state: scoreState(matrixScore, previousRank, expectedRank, changed, effect, matrixHighRankActive),
    };
    requireOk(renderer.commit(requireOk(renderer.preflight([matrixCommand]), `Score matrix ${matrixScore} preflight`)), `Score matrix ${matrixScore} commit`);
    const observed = renderer.sceneSnapshot().find((candidate) => candidate.renderObjectId === "hud:score:matrix");
    assert(observed !== undefined, `Score matrix ${matrixScore} owner exists`);
    scoreMatrix.push(Object.freeze({ score: matrixScore, rank: expectedRank, observation: pickSceneObservation(observed) }));
    previousRank = expectedRank;
  }
  equal(scoreMatrix[scoreMatrix.length - 1]?.observation.hudScoreDigitCount, 8, "CS-V1 scoreMaximum keeps all bitmap digits");

  const overMaximumCommand: RenderCommand = {
    sessionId: SESSION, sequence, frame: 3, substep: 0,
    kind: "set-hud", renderObjectId: "hud:score:matrix", hudRole: "score",
    state: scoreState(10_001_001, 5, 5, false, "none", true),
  };
  equal(renderer.preflight([overMaximumCommand]).status, "integrity-failure", "Score over scoreMaximum rejects before Pixi mutation");

  const invalidScoreCommand: RenderCommand = {
    sessionId: SESSION, sequence: sequence++, frame: 3, substep: 0,
    kind: "set-hud", renderObjectId: "hud:score:matrix", hudRole: "score",
    state: { ...scoreState(375_000, 4, 3, true, "none", false), rankMarkerCLocalX: f32(42) },
  };
  const invalidScoreBefore = JSON.stringify(renderer.sceneSnapshot().find((candidate) => candidate.renderObjectId === "hud:score:matrix"));
  const invalidScore = renderer.preflight([invalidScoreCommand]);
  equal(invalidScore.status, "integrity-failure", "derived Score marker tamper rejects before Pixi mutation");
  equal(JSON.stringify(renderer.sceneSnapshot().find((candidate) => candidate.renderObjectId === "hud:score:matrix")), invalidScoreBefore, "derived Score marker failure leaves scene unchanged");

  const invalidCommand: RenderCommand = {
    sessionId: SESSION, sequence, frame: 1, substep: 0,
    kind: "set-hud", renderObjectId: "hud:life", hudRole: "life",
    state: { ...lifeState(251, 1000, 2000, false), warning: true },
  };
  const preInvalidObjectCount = renderer.snapshot().objectCount;
  const invalid = renderer.preflight([invalidCommand]);
  equal(invalid.status, "integrity-failure", "Life threshold mismatch fails before Pixi mutation");
  equal(renderer.snapshot().objectCount, 12, "failed typed Pixi HUD input preserves owner count");
  const invalidLifeLabelAfter = renderer.sceneSnapshot().find((candidate) => candidate.renderObjectId === "hud:life")?.hudText ?? null;
  equal(invalidLifeLabelAfter, "200/1000", "failed batch leaves Pixi HUD unchanged");

  sequence = renderer.snapshot().nextSequence;
  const gameOverCommands: RenderCommand[] = [
    {
      sessionId: SESSION, sequence: sequence++, frame: 4, substep: 0,
      kind: "set-hud", renderObjectId: "hud:life", hudRole: "life",
      state: lifeState(0, 1000, 2000, true),
    },
    {
      sessionId: SESSION, sequence: sequence++, frame: 4, substep: 0,
      kind: "play-animation", renderObjectId: "hud:life", animationRole: "life-warning", restart: true,
    },
    {
      sessionId: SESSION, sequence: sequence++, frame: 4, substep: 0,
      kind: "play-animation", renderObjectId: "hud:life", animationRole: "life-game-over", restart: true,
    },
    {
      sessionId: SESSION, sequence: sequence++, frame: 4, substep: 0,
      kind: "sample-animation", renderObjectId: "hud:life", animationRole: "life-warning", elapsedSeconds: f32(0.5),
    },
    {
      sessionId: SESSION, sequence: sequence++, frame: 4, substep: 0,
      kind: "sample-animation", renderObjectId: "hud:life", animationRole: "life-game-over", elapsedSeconds: f32(0.5),
    },
  ];
  requireOk(renderer.commit(requireOk(renderer.preflight(gameOverCommands), "Life GameOver preflight")), "Life GameOver commit");
  const gameOverLife = renderer.sceneSnapshot().find((candidate) => candidate.renderObjectId === "hud:life");
  assert(gameOverLife !== undefined, "Life GameOver owner exists");
  const gameOverSprites = new Map(gameOverLife.hudSpriteNodes?.map((node) => [node.label, node]));
  const gameOverTexts = new Map(gameOverLife.hudTextNodes?.map((text) => [text.label, text]));
  equal(gameOverSprites.get("life-game-over")?.visible, true, "zero Life shows current GameOver background");
  equal(JSON.stringify(gameOverSprites.get("life-game-over")?.position), JSON.stringify([-220, 140]), "GameOver background authored world position is owner-local");
  equal(gameOverSprites.get("life-warning-outline")?.alpha, Math.fround(0.8), "Life warning PingPong TweenAlpha samples engine time");
  equal(gameOverTexts.get("life-game-over-label")?.visible, true, "zero Life shows current GameOver UILabel");
  equal(gameOverTexts.get("life-game-over-label")?.alpha, Math.fround(0.5540000200271606), "GameOver UILabel TweenAlpha samples engine time");
  equal(JSON.stringify(gameOverTexts.get("life-game-over-label")?.position), JSON.stringify([-314, 142]), "GameOver UILabel authored world position is owner-local");
  equal(JSON.stringify(gameOverTexts.get("life-game-over-label")?.anchor), JSON.stringify([0, 0.5]), "GameOver UILabel consumes Left pivot");

  const recording = new RecordingSimulatorRendererBackend();
  const recordingProvider = requireOk(ImmutableLocalRenderResourceProvider.create(resources), "recording parity provider");
  requireOk(await recording.prepare(
    SESSION, profile, recordingProvider, new PortableRenderResourcePreflightAdapter(),
  ), "recording parity prepare");
  const recordingBatch = requireOk(recording.preflight(commands), "recording parity valid preflight");
  requireOk(recording.commit(recordingBatch), "recording parity valid commit");
  const recordingCommandCount = recording.commandSnapshot().length;
  const recordingObjectCount = recording.snapshot().objectCount;
  const invalidRecording = recording.execute(invalidCommand);
  equal(invalidRecording.status, invalid.status, "Recording and Pixi reject the same malformed typed HUD input");
  equal(recording.commandSnapshot().length, recordingCommandCount, "failed typed Recording HUD input adds no command");
  equal(recording.snapshot().objectCount, recordingObjectCount, "failed typed Recording HUD input preserves owner count");
  requireOk(recording.dispose(), "recording parity dispose");

  const resourcePreparation = renderer.resourceSnapshot();
  const invalidObservation = Object.freeze({
    capability: invalid.status === "integrity-failure" ? invalid.capability : null,
    beforeObjectCount: preInvalidObjectCount,
    afterObjectCount: renderer.snapshot().objectCount,
    lifeLabelAfter: invalidLifeLabelAfter,
  });
  const sampleObservation = Object.freeze({
    noteUp: pickSceneObservation(row("note:up")),
    noteLeft: pickSceneObservation(row("note:left")),
    noteRight: pickSceneObservation(row("note:right")),
    noteFlash: pickSceneObservation(row("note:flash")),
    noteWorld: pickSceneObservation(row("note:world")),
    combo: pickSceneObservation(combo),
    addScore: pickSceneObservation(add),
    result: pickSceneObservation(result),
    life: pickSceneObservation(life),
    gameOverLife: pickSceneObservation(gameOverLife),
    scoreHalf: pickSceneObservation(scoreAtHalf),
    scoreContinued: pickSceneObservation(scoreContinued),
    scoreMatrix: Object.freeze(scoreMatrix),
    invalidScore: Object.freeze({ capability: invalidScore.status === "integrity-failure" ? invalidScore.capability : null }),
  });
  const worldObservation = observePixiWorld(renderer.stage);
  requireOk(renderer.dispose(), "actual Pixi dispose");
  equal(renderer.snapshot().objectCount, 0, "actual Pixi dispose releases all owners");
  const sampleCleanup = Object.freeze({
    ownerCount: renderer.snapshot().objectCount,
    stageChildren: renderer.stage.children.length,
  });
  await verifyActualPixiHabahiroComplete(profile, resources);
  const fullChart = await verifyActualPixiFullChart(profile, resources);
  await verifyActualPixiGarupaProduct(profile, resources);
  await verifyActualPixiSelectedSkin(profile);
  const observationPath = process.env.SIMULATOR_RENDER_OBSERVATION_PATH;
  if (typeof observationPath === "string" && observationPath.length > 0) {
    writeFileSync(observationPath, JSON.stringify({
      schemaVersion: 3,
      source: "actual-pixi-command-scene-routing",
      decoder: {
        kind: "synthetic-texture-source-routing-adapter",
        browserDecodeExecuted: false,
        rasterObserved: false,
      },
      resourcePreparation,
      worldObservation,
      samples: sampleObservation,
      invalidPreflight: invalidObservation,
      sampleCleanup,
      fullChart,
    }, null, 2));
  }
  console.log("actual Pixi ordinary visible oracle passed: Note cubic owners + Combo/AP/AddScore/Result/Life resource routes");
}

async function verifyActualPixiSelectedSkin(
  baseProfile: RenderResourceProfile,
): Promise<void> {
  const recipe = requireOk(resolveOriginalSkinRecipe({
    noteSkin: 0, fieldSkin: 0, tapEffect: 0, judgeSE: 0,
    directionalFlick: 0, directionalFlickEffect: 0, isFixedBG: false,
    special: {
      kind: "limited", limitedSkinId: 3,
      components: {
        laneAndLine: "on", tapEffect: "on", rhythmIcon: "on",
        background: "on", soundEffect: "on", judge: "on",
        directionalFlickIcon: "on",
      },
    },
  }, LIVE_MANUAL_MODE, "ordinary", "standard"), "selected Skin recipe");
  const selected = selectResolvedSkinResourceInventory(recipe);
  const root = join(fixtureRoot, "skin-settings/limited3");
  const store = ImmutableSharedStaticResourceStore.create(selected.resources.map((resource) => ({
    resourceKey: resource.resourceKey,
    bytes: new Uint8Array(readFileSync(join(root, `${resource.logicalResource.replace(/\//g, "__")}.json`))),
  })));
  if (store.status !== "accepted") throw new Error(store.failure.capability);
  const packs = await prepareSelectedSkinPortablePacks(selected.resources, store.value);
  if (packs.status !== "accepted") throw new Error(packs.failure.capability);
  const overlay = await prepareSkinRenderOverlay(recipe, packs.value, CURRENT_ORDINARY_RENDER_BINDINGS);
  if (overlay.status !== "accepted" || overlay.value === null) throw new Error("selected Skin render overlay");
  const renderer = new PixiRendererBackend(decoder);
  const profile: RenderResourceProfile = {
    ...baseProfile,
    packIdentity: "selected-skin-actual-pixi",
    assets: overlay.value.assets,
  };
  requireOk(await renderer.prepare(
    "actual-pixi-selected-skin",
    profile,
    overlay.value.provider,
    new PortableRenderResourcePreflightAdapter(),
  ), "selected Skin renderer prepare");
  requireOk(renderer.bindOriginalSurfaceLayout(CONTROL_SURFACE_LAYOUT), "selected Skin surface");
  const commands: RenderCommand[] = [
    { kind: "create-object", renderObjectId: "skin:note", poolFamily: "normal", role: "note-root", parentObjectId: null,
      sessionId: "actual-pixi-selected-skin", sequence: 0, frame: 0, substep: 0 },
    { kind: "bind-resource", renderObjectId: "skin:note", binding: "sprite",
      logicalAssetId: overlay.value.bindings.noteAtlasLogicalAssetId, exactKey: "note_normal_0",
      sessionId: "actual-pixi-selected-skin", sequence: 1, frame: 0, substep: 0 },
    { kind: "activate-object", renderObjectId: "skin:note",
      sessionId: "actual-pixi-selected-skin", sequence: 2, frame: 0, substep: 0 },
  ];
  const batch = requireOk(renderer.preflight(commands), "selected Skin bind preflight");
  requireOk(renderer.commit(batch), "selected Skin bind commit");
  if (overlay.value.backgroundLogicalAssetId === null || overlay.value.fieldBindings === null ||
    overlay.value.bindings.ordinaryVisible === undefined) throw new Error("selected visible bindings absent");
  const extra: RenderCommand[] = [
    { kind: "create-object", renderObjectId: "skin:background", poolFamily: "skin-background", role: "field-line", parentObjectId: null,
      sessionId: "actual-pixi-selected-skin", sequence: 3, frame: 0, substep: 0 },
    { kind: "bind-resource", renderObjectId: "skin:background", binding: "sprite", logicalAssetId: overlay.value.backgroundLogicalAssetId,
      exactKey: "liveBG", sessionId: "actual-pixi-selected-skin", sequence: 4, frame: 0, substep: 0 },
    { kind: "set-transform", renderObjectId: "skin:background", position: vector3(0, 0, 0), scale: vector2(1, 1), rotationDegrees: f32(0),
      color: color(1, 1, 1, 1), ordering: ordering(0, 0), maskObjectId: null,
      sessionId: "actual-pixi-selected-skin", sequence: 5, frame: 0, substep: 0 },
    { kind: "activate-object", renderObjectId: "skin:background", sessionId: "actual-pixi-selected-skin", sequence: 6, frame: 0, substep: 0 },
    { kind: "create-object", renderObjectId: "skin:judge", poolFamily: "selected-judge", role: "judge-line", parentObjectId: null,
      sessionId: "actual-pixi-selected-skin", sequence: 7, frame: 0, substep: 0 },
    { kind: "bind-resource", renderObjectId: "skin:judge", binding: "sprite", logicalAssetId: overlay.value.bindings.ordinaryVisible.judgeLogicalAssetId,
      exactKey: "judge_perfect", sessionId: "actual-pixi-selected-skin", sequence: 8, frame: 0, substep: 0 },
    { kind: "set-transform", renderObjectId: "skin:judge", position: vector3(0, 0, 0), scale: vector2(1, 1), rotationDegrees: f32(0),
      color: color(1, 1, 1, 1), ordering: ordering(4, 2), maskObjectId: null,
      sessionId: "actual-pixi-selected-skin", sequence: 9, frame: 0, substep: 0 },
    { kind: "activate-object", renderObjectId: "skin:judge", sessionId: "actual-pixi-selected-skin", sequence: 10, frame: 0, substep: 0 },
    { kind: "create-object", renderObjectId: "skin:result", poolFamily: "result", role: "hud-result", parentObjectId: null,
      sessionId: "actual-pixi-selected-skin", sequence: 11, frame: 0, substep: 0 },
    { kind: "set-hud", renderObjectId: "skin:result", hudRole: "result", state: Object.freeze({ judgeKey: "judge_perfect", timingKey: null }),
      sessionId: "actual-pixi-selected-skin", sequence: 12, frame: 0, substep: 0 },
    { kind: "activate-object", renderObjectId: "skin:result",
      sessionId: "actual-pixi-selected-skin", sequence: 13, frame: 0, substep: 0 },
  ];
  requireOk(renderer.commit(requireOk(renderer.preflight(extra), "selected visible preflight")), "selected visible commit");
  const scene = requireOk(createSimulatorSceneLayout(
    { revision: 0, viewportWidth: 1600, viewportHeight: 720,
      safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) }, origin: "bottom-left" },
    { specificSpeed: Math.fround(11), noteSize: Math.fround(100), judgementAdjustValueB: 0,
      habahiroMeshWidthSetting: Math.fround(1), syncLineEdgeMargin: recipe.note.noteSyncEdgeMargin },
    "ordinary", overlay.value.bindings, overlay.value.fieldBindings,
  ), "selected Field scene");
  const field = scene.ordinaryNoteScene.field;
  if (field === undefined) throw new Error("selected Field scene absent");
  const producer = new RenderCommandProducer("actual-pixi-selected-skin", renderer, overlay.value.bindings);
  requireOk(requireOk(producer.preflightFieldSetup(field.objects, field.masks), "selected Field preflight").commit(), "selected Field commit");
  const textureLabels: string[] = [];
  const collectTextures = (node: any) => {
    if (node?.texture?.label) textureLabels.push(String(node.texture.label));
    for (const child of node?.children ?? []) collectTextures(child);
  };
  collectTextures(renderer.stage);
  const selectedRows = renderer.sceneSnapshot();
  assert(textureLabels.some((label) => label.includes("noteskin%2Fskin_april2021")), "actual Pixi consumes selected Note atlas");
  assert(textureLabels.some((label) => label.includes("fieldskin%2Fskin_april2021")), "actual Pixi consumes selected Field textures");
  assert(textureLabels.some((label) => label.includes("judgeskin%2Fskinapril2021")), "actual Pixi consumes selected Judge atlas");
  assert(textureLabels.some((label) => label.includes("bgskin%2Fskin_april2021")), "actual Pixi consumes selected Background texture");
  const selectedFieldRows = selectedRows.filter((row) => row.renderObjectId.startsWith("render:skin-field:"));
  equal(selectedFieldRows.length, 2, "selected Field publishes only serialized UITexture and judge-line owners");
  const fieldBackground = selectedFieldRows.find((row) => row.role === "field-line");
  const fieldJudge = selectedFieldRows.find((row) => row.role === "judge-line");
  assert(fieldBackground !== undefined && fieldJudge !== undefined, "selected Field owner roles exist");
  equal(JSON.stringify(fieldBackground.position), JSON.stringify([
    800,
    Math.fround(360 + 240 * scene.surfaceLayout.ui.screenToSafeChildScale),
  ]), "Field UITexture keeps authored (0,-240) Bottom-pivot position");
  equal(JSON.stringify(fieldBackground.scale), JSON.stringify([
    scene.surfaceLayout.ui.screenToSafeChildScale,
    scene.surfaceLayout.ui.screenToSafeChildScale,
  ]), "Field UITexture consumes FitWidth*ScreenToSafeArea scale");
  equal(fieldBackground.maskVertexCount, null, "ordinary Field has no invented polygon mask");
  equal(fieldJudge.position[0], 800, "judge line follows multiresolution Button4 center");
  equal(fieldJudge.position[1], Math.fround(
    360 - scene.ordinaryNoteScene.targetCenterY.value * 360,
  ), "judge line follows the projected target center");
  requireOk(requireOk(producer.preflightSessionRelease(), "selected Field release").commit(), "selected Field release commit");
  equal(renderer.sceneSnapshot().filter((row) => row.renderObjectId.startsWith("render:skin-field:")).length, 0, "selected Field cleanup");
  requireOk(renderer.dispose(), "selected Skin renderer dispose");
  equal(renderer.snapshot().objectCount, 0, "selected Skin Pixi cleanup");
  console.log(`actual Pixi selected Skin passed: roles=note/field/judge/background assets=${overlay.value.assets.length} packs=${packs.value.length}`);
}

async function verifyActualPixiGarupaProduct(
  profile: RenderResourceProfile,
  resources: readonly { readonly logicalAssetId: string; readonly bytes: Uint8Array }[],
): Promise<void> {
  const sessionId = "actual-pixi-garupa-product";
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(resources), "product actual provider");
  const renderer = new PixiRendererBackend(decoder);
  requireOk(await renderer.prepare(
    sessionId,
    profile,
    provider,
    new PortableRenderResourcePreflightAdapter(),
  ), "product actual Pixi prepare");
  requireOk(renderer.bindOriginalSurfaceLayout(CONTROL_SURFACE_LAYOUT), "product bind surface");
  const copied = requireOk(copyAndFreezeGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "SV", beat: 2, value: -1, timingGroup: "#1" },
    { type: "Single", beat: 1.125, lane: 0.5, width: 2, timingGroup: "#1" },
    { type: "Single", beat: 1.125, lane: 7, width: 1, timingGroup: "#1" },
    { type: "Slide", timingGroup: "#1", connections: [
      { type: "Hidden", beat: 1, lane: -1, width: 1 },
      { type: "Flick", beat: 2, lane: 2.25, width: 2 },
      { type: "Hidden", beat: 3, lane: 7, width: 1 },
    ] },
  ]), "product chart copy");
  const chart = requireOk(constructChartFromGarupaChartJson(copied.chart), "product chart construct");
  const product = getGarupaProductChartProfile(chart)!;
  const axis = getGarupaProductTimingGroupAxisProfile(chart)!;
  const layout = requireOk(createSimulatorSceneLayout(
    { revision: 0, viewportWidth: 1600, viewportHeight: 720, safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) }, origin: "bottom-left" },
    {
      specificSpeed: Math.fround(11), noteSize: Math.fround(100),
      judgementAdjustValueB: 0, habahiroMeshWidthSetting: Math.fround(1), syncLineEdgeMargin: Math.fround(0),
    },
    "ordinary",
    CURRENT_ORDINARY_RENDER_BINDINGS,
  ), "product scene");
  const producer = new GarupaProductRenderProducer(
    sessionId,
    renderer,
    CURRENT_ORDINARY_RENDER_BINDINGS,
    product,
    axis,
    layout.garupaProductScene,
    layout.ordinaryNoteScene.specificSpeed,
    true,
    true,
    true,
  );
  requireOk(producer.validate(), "product producer validate");
  const first = requireOk(producer.preflightFrame(0, []), "product first frame");
  assert(first !== null, "product first frame has visible commands");
  requireOk(first!.commit(), "product first frame commit");
  const rows = renderer.sceneSnapshot();
  assert(rows.some((row) => row.renderObjectId === "render:garupa:node:garupa-note:2" && row.visible &&
    row.spriteBindingKey?.endsWith("note_normal_16_3")),
    "actual Pixi has the NoteColor normal16 binding on a fractional product front");
  const slideMeshes = rows.filter((row) =>
    row.renderObjectId.startsWith("render:garupa:line:") && row.geometryVertexCount === 22);
  assert(slideMeshes.length > 0, "actual Pixi has product Slide mesh");
  assert(slideMeshes.every((row) =>
    row.geometryMaterialLogicalAssetId === CURRENT_ORDINARY_RENDER_BINDINGS.longNoteMaterialLogicalAssetId ||
    row.geometryMaterialLogicalAssetId === CURRENT_ORDINARY_RENDER_BINDINGS.curveNoteMaterialLogicalAssetId),
    "product Slide mesh consumes its prepared skin material instead of Pixi Texture.WHITE");
  const productSync = rows.find((row) => row.renderObjectId.startsWith("render:garupa:sync:") && row.visible &&
    row.geometryMaterialLogicalAssetId === CURRENT_ORDINARY_RENDER_BINDINGS.syncLineLogicalAssetId);
  assert(productSync?.geometryPositions, "actual Pixi continuous SyncLine consumes its prepared skin material");
  const productSyncY = productSync!.geometryPositions!.filter((_value, index) => index % 2 === 1);
  assert(Math.max(...productSyncY) - Math.min(...productSyncY) < 40,
    "product SyncLine width consumes Note scale instead of constant .28 world units");
  const judged = product.visibleNodes[0]!;
  const effect = requireOk(producer.preflightFrame(judged.absolutePosition, [judged]), "product effect frame");
  assert(effect !== null, "product effect frame has commands");
  requireOk(effect!.commit(), "product effect frame commit");
  const judgedRows = renderer.sceneSnapshot();
  assert(judgedRows.some((row) =>
    row.renderObjectId === `render:garupa:effect:${judged.identity}` && row.geometryVertexCount === 22 &&
    row.geometryMaterialLogicalAssetId === CURRENT_ORDINARY_RENDER_BINDINGS.productJudgementEffectLogicalAssetId &&
    row.geometryTextureLabel !== "WHITE"),
    "actual Pixi product judgement mesh consumes its prepared effect texture instead of a tinted white rectangle");
  equal(judgedRows.find((row) =>
    row.renderObjectId === `render:garupa:node:${judged.identity}`)?.visible, false,
  "committed product judgement permanently hides its front owner");
  const tapLane = judgedRows.find((row) =>
    row.renderObjectId === `render:garupa:tap-lane:${judged.identity}` && row.visible &&
    row.spriteBindingKey?.endsWith("NoteLaneEffect_4"));
  assert(tapLane !== undefined, "actual Pixi has the recovered Sprite on the continuous product tap-lane sidecar");
  assert(tapLane.position[0] > 0 && tapLane.position[1] > 0 && tapLane.scale[0] > 0,
    "product tap-lane Sprite projects world position and PPU/parent scale instead of remaining at the raw origin");
  const tapLaneNode = renderer.stage.getChildByLabel(`render:garupa:tap-lane:${judged.identity}`, true) as any;
  equal(tapLaneNode?.children?.[0]?.anchor?.y, 1, "Unity bottom pivot maps to Pixi top-left anchor one");
  const released = requireOk(producer.preflightDispose(), "product render release");
  assert(released !== null, "product release owns objects");
  requireOk(released!.commit(), "product render release commit");
  equal(renderer.snapshot().objectCount, 0, "actual Pixi product releases every owner");
  requireOk(renderer.dispose(), "actual Pixi product backend dispose");
  equal(renderer.stage.children.length, 0, "actual Pixi product leaves empty stage");
  console.log("actual Pixi Garupa product passed: selected-field/ordinary-scale/scaled-sync/judged-hide/clipped-slide/tap-effect/cleanup");
}

async function verifyActualPixiHabahiroComplete(
  ordinaryProfile: RenderResourceProfile,
  resources: readonly { readonly logicalAssetId: string; readonly bytes: Uint8Array }[],
): Promise<void> {
  const sessionId = "actual-pixi-habahiro-current-external-complete";
  const profile: RenderResourceProfile = {
    ...ordinaryProfile,
    packIdentity: `${ordinaryProfile.packIdentity}+habahiro-current-external-complete`,
    fidelity: Object.freeze({ mode: "habahiro" as const, fidelity: "current-external-complete" as const }),
    scene: Object.freeze({
      ...ordinaryProfile.scene,
      projection: Object.freeze({
        ...ordinaryProfile.scene.projection,
        mode: "habahiro-current-external" as const,
      }),
    }),
  };
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(resources), "HABAHIRO actual provider");
  const renderer = new PixiRendererBackend(decoder);
  requireOk(await renderer.prepare(
    sessionId, profile, provider, new PortableRenderResourcePreflightAdapter(),
  ), "prepare current-external-complete HABAHIRO actual Pixi renderer");
  requireOk(renderer.bindOriginalSurfaceLayout(CONTROL_SURFACE_LAYOUT), "HAB bind surface");
  const producer = new RenderCommandProducer(sessionId, renderer, {
    ...CURRENT_ORDINARY_RENDER_BINDINGS,
    habahiroAtlasLogicalAssetIds: Object.freeze({
      normal: CURRENT_ORDINARY_RENDER_BINDINGS.noteAtlasLogicalAssetId,
      normal16: CURRENT_ORDINARY_RENDER_BINDINGS.noteAtlasLogicalAssetId,
      skill: CURRENT_ORDINARY_RENDER_BINDINGS.noteAtlasLogicalAssetId,
      flick: CURRENT_ORDINARY_RENDER_BINDINGS.noteAtlasLogicalAssetId,
      long: CURRENT_ORDINARY_RENDER_BINDINGS.noteAtlasLogicalAssetId,
      longFlash: CURRENT_ORDINARY_RENDER_BINDINGS.noteAtlasLogicalAssetId,
      slideAmong: CURRENT_ORDINARY_RENDER_BINDINGS.noteAtlasLogicalAssetId,
    }),
  });
  requireOk(requireOk(producer.preflightPoolSetup([], 0, 0), "HABAHIRO owner preflight").commit(), "HABAHIRO owner commit");
  requireOk(requireOk(producer.preflightHabahiroFlashStart(1728), "HABAHIRO flash preflight").commit(), "HABAHIRO flash commit");
  requireOk(requireOk(producer.preflightHabahiroFlashAdvance(f32(0.125)), "HABAHIRO sample preflight").commit(), "HABAHIRO sample commit");
  const flash = renderer.stage.children.find((child) => child.label === "render:habahiro:flash");
  assert(flash instanceof Container, "HABAHIRO persistent flash owner exists");
  const flashFill = [...flash.children, ...flash.children.flatMap((child) =>
    child instanceof Container ? [...child.children] : [])].find((child) =>
      child instanceof Graphics && child.alpha > 0);
  assert(flashFill instanceof Graphics, "HABAHIRO engine-clock flash reaches actual Pixi visual consumer");
  assert(renderer.sceneSnapshot().every((row) => row.renderObjectId !== "render:hud:fidelity-label"),
    "current-external-complete HABAHIRO emits no runtime approximation label");
  requireOk(requireOk(producer.preflightSessionRelease(), "HABAHIRO release preflight").commit(), "HABAHIRO release commit");
  equal(renderer.sceneSnapshot().length, 0, "HABAHIRO actual Pixi releases all owners");
  requireOk(renderer.dispose(), "dispose HABAHIRO actual Pixi renderer");
}

async function verifyActualPixiFullChart(
  profile: RenderResourceProfile,
  resources: readonly { readonly logicalAssetId: string; readonly bytes: Uint8Array }[],
): Promise<{
  readonly batches: number;
  readonly consumedBatches: number;
  readonly totalScoringUnitCount: number;
  readonly frames: number;
  readonly score: number;
  readonly life: number;
  readonly routes: readonly string[];
  readonly roles: readonly string[];
  readonly animationRoles: readonly string[];
  readonly maxGeometryVertexCount: number;
  readonly maxAbsGeometryCoordinate: number;
  readonly geometryViewportIntersectionCount: number;
  readonly visibleNoteSampleCount: number;
  readonly visibleNoteViewportCount: number;
  readonly cleanupOwnerCount: number;
  readonly cleanupStageChildren: number;
}> {
  const chartText = readFileSync(join(
    fixtureRoot,
    "evidence-integrity/artifacts/investigations/simulator-dynamic-acceptance-oracle-10-1-4/bms/poppin_shuffle_special.bms.txt",
  ), "utf8");
  const chart = requireOk(createNoteBatchInformationList({ musicScoreData: chartText }), "construct ordinary full chart");
  const sessionId = "pixi-actual-poppin-shuffle-special";
  const provider = requireOk(ImmutableLocalRenderResourceProvider.create(resources), "full-chart actual provider");
  const renderer = new PixiRendererBackend(decoder);
  requireOk(await renderer.prepare(
    sessionId, profile, provider, new PortableRenderResourcePreflightAdapter(),
  ), "full-chart actual Pixi prepare");
  requireOk(renderer.bindOriginalSurfaceLayout(CONTROL_SURFACE_LAYOUT), "full-chart bind surface");
  const scene = ordinaryScene();
  const engine = requireOk(createSimulatorEngine({
    chart,
    runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode: LIVE_AUTO_MODE },
    scoreLifeState: {
      schemaVersion: 3,
      sessionId,
      life: {
        initialLife: 1000,
        playerMaxLife: 1000,
        lifeUpperLimit: 2000,
        missDamage: -100,
        badDamage: -50,
      },
      mode: LIVE_AUTO_MODE,
    },
    rendering: {
      sessionId,
      resources: CURRENT_ORDINARY_RENDER_BINDINGS,
      ordinaryNoteScene: scene,
    },
  }, createRecordingSimulatorBackends(renderer)), "create actual Pixi full-chart engine");
  requireOk(engine.initialize(), "initialize actual Pixi full-chart engine");
  const routes = new Set<string>();
  const roles = new Set<string>();
  const animationRoles = new Set<string>();
  let maxGeometryVertexCount = 0;
  let maxAbsGeometryCoordinate = 0;
  let geometryViewportIntersectionCount = 0;
  let visibleNoteSampleCount = 0;
  let visibleNoteViewportCount = 0;
  let tapLaneEffectVisibleSampleCount = 0;
  let frames = 0;
  let finalSnapshot = requireOk(engine.snapshot(), "initial full-chart snapshot");
  for (; frames < 7200; frames += 1) {
    const stepped = engine.step(1 / 30);
    if (stepped.status !== "ok") throw new Error(`full-chart render blocker ${stepped.capability}: ${stepped.boundary}`);
    if (frames % 60 !== 0) continue;
    finalSnapshot = requireOk(engine.snapshot(), `full-chart snapshot ${frames}`);
    const visible = renderer.sceneSnapshot();
    for (const row of visible) {
      roles.add(row.role);
      if (row.activeAnimationRole !== null) animationRoles.add(row.activeAnimationRole);
      maxGeometryVertexCount = Math.max(maxGeometryVertexCount, row.geometryVertexCount ?? 0);
      if (row.geometryPositions !== null) {
        maxAbsGeometryCoordinate = Math.max(
          maxAbsGeometryCoordinate,
          ...row.geometryPositions.map((value) => Math.abs(value)),
        );
        const xs = row.geometryPositions.filter((_, index) => index % 2 === 0);
        const ys = row.geometryPositions.filter((_, index) => index % 2 === 1);
        if (Math.max(...xs) >= 0 && Math.min(...xs) <= 1600 &&
            Math.max(...ys) >= 0 && Math.min(...ys) <= 720) {
          geometryViewportIntersectionCount += 1;
        }
      }
      if (row.visible && row.role === "tap-lane-effect") {
        tapLaneEffectVisibleSampleCount += 1;
      }
      if (row.visible && ["note-root", "note-head", "note-intermediate", "note-side-visual"].includes(row.role)) {
        visibleNoteSampleCount += 1;
        if (row.position[0] >= 0 && row.position[0] <= 1600 && row.position[1] >= 0 && row.position[1] <= 720) {
          visibleNoteViewportCount += 1;
        }
      }
    }
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
  assert(tapLaneEffectVisibleSampleCount > 0, "actual Pixi observes the recovered tap lane effect Sprite owner");
  equal(record.currentLife, 1000, "full-chart Auto Live preserves ordinary Life");
  const consumedBatches = finalSnapshot.managers.noteManager.nextBatchIndex;
  const totalScoringUnitCount = finalSnapshot.managers.scoreLifeState?.initialization.totalScoringUnitCount ?? 0;
  requireOk(engine.dispose(), "dispose actual Pixi full-chart engine");
  equal(renderer.snapshot().objectCount, 0, "actual Pixi full-chart releases every owner");
  equal(renderer.stage.children.length, 0, "actual Pixi full-chart leaves an empty stage");

  const disabledSessionId = `${sessionId}:tap-lane-disabled`;
  const disabledProvider = requireOk(ImmutableLocalRenderResourceProvider.create(resources), "disabled tap lane provider");
  const disabledRenderer = new PixiRendererBackend(decoder);
  requireOk(await disabledRenderer.prepare(
    disabledSessionId, profile, disabledProvider, new PortableRenderResourcePreflightAdapter(),
  ), "disabled tap lane Pixi prepare");
  requireOk(disabledRenderer.bindOriginalSurfaceLayout(CONTROL_SURFACE_LAYOUT), "disabled tap lane bind surface");
  const disabledEngine = requireOk(createSimulatorEngine({
    chart,
    runtime: {
      originalLiveSettings: originalLiveSettingsForTest({ visibleTapLaneEffect: false }),
      mode: LIVE_AUTO_MODE,
    },
    scoreLifeState: {
      schemaVersion: 3,
      sessionId: disabledSessionId,
      life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
      mode: LIVE_AUTO_MODE,
    },
    rendering: {
      sessionId: disabledSessionId,
      resources: CURRENT_ORDINARY_RENDER_BINDINGS,
      ordinaryNoteScene: scene,
    },
  }, createRecordingSimulatorBackends(disabledRenderer)), "disabled tap lane engine create");
  requireOk(disabledEngine.initialize(), "disabled tap lane initialize");
  for (let frame = 0; frame < 300; frame += 1) requireOk(disabledEngine.step(1 / 30), `disabled tap lane frame ${frame}`);
  const disabledSnapshot = requireOk(disabledEngine.snapshot(), "disabled tap lane snapshot");
  equal(disabledSnapshot.managers.tapLaneEffect?.visible, false, "setting false remains frozen in the owner");
  equal(disabledSnapshot.managers.tapLaneEffect?.activeCount, 0, "setting false activates no lane effect");
  equal(disabledRenderer.sceneSnapshot().filter((row) => row.role === "tap-lane-effect" && row.visible).length, 0,
    "setting false publishes no visible tap lane Sprite");
  assert((disabledSnapshot.managers.scoreLifeState?.record.score ?? 0) > 0,
    "setting false does not suppress Auto judgement or Score");
  requireOk(disabledEngine.dispose(), "disabled tap lane dispose");
  equal(disabledRenderer.snapshot().objectCount, 0, "disabled tap lane owner cleanup");
  const routeList = Object.freeze([...routes].sort());
  console.log(`actual Pixi ordinary full-chart passed: batches=${chart.noteBatches.length} frames=${frames} score=${record.score} routes=${routeList.join("|")}`);
  return Object.freeze({
    batches: chart.noteBatches.length,
    consumedBatches,
    totalScoringUnitCount,
    frames,
    score: record.score,
    life: record.currentLife,
    routes: routeList,
    roles: Object.freeze([...roles].sort()),
    animationRoles: Object.freeze([...animationRoles].sort()),
    maxGeometryVertexCount,
    maxAbsGeometryCoordinate,
    geometryViewportIntersectionCount,
    visibleNoteSampleCount,
    visibleNoteViewportCount,
    cleanupOwnerCount: renderer.snapshot().objectCount,
    cleanupStageChildren: renderer.stage.children.length,
  });
}

function pickSceneObservation(
  row: ReturnType<PixiRendererBackend["sceneSnapshot"]>[number],
) {
  return Object.freeze({
    renderObjectId: row.renderObjectId,
    role: row.role,
    visible: row.visible,
    alpha: row.alpha,
    position: row.position,
    scale: row.scale,
    rotation: row.rotation,
    parent: row.parent,
    ordering: row.ordering,
    hudText: row.hudText,
    hudFontFamily: row.hudFontFamily,
    hudSpriteCount: row.hudSpriteCount,
    hudSpriteLabels: row.hudSpriteLabels,
    hudSpriteNodes: row.hudSpriteNodes,
    hudTextNodes: row.hudTextNodes,
    hudFillMasks: row.hudFillMasks,
    hudSpriteAlphas: row.hudSpriteAlphas,
    hudFillRatios: row.hudFillRatios,
    hudScoreDigitCount: row.hudScoreDigitCount,
    hudScoreRankVisualCount: row.hudScoreRankVisualCount,
    hudScoreHighRankNodes: row.hudScoreHighRankNodes,
    hudScoreHighRankGeneration: row.hudScoreHighRankGeneration,
    hudScoreLayerNodes: row.hudScoreLayerNodes,
    hudScoreNineSliceBorders: row.hudScoreNineSliceBorders,
    hudScoreIndicatorMask: row.hudScoreIndicatorMask,
    hudState: row.hudState,
    spriteBindingKey: row.spriteBindingKey,
    spriteAlpha: row.spriteAlpha,
    spriteTint: row.spriteTint,
    geometryVertexCount: row.geometryVertexCount,
    activeAnimationRole: row.activeAnimationRole,
    animationElapsedSeconds: row.animationElapsedSeconds,
  });
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
    noteTint: Object.freeze({ red: f32(1), green: f32(1), blue: f32(1), alpha: f32(1) }),
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
  const pauseFiles = new Map(PAUSE_COUNTDOWN_FIXTURE_RELATIVE_PATHS.map((relative, index) => [
    `ui/pause/countdown-${index + 1}`,
    join(process.cwd(), "src/simulator/testing/fixtures", relative),
  ]));
  return assets.map((asset) => {
    const ordinary = ordinaryFiles.get(asset.logicalAssetId);
    const visible = visibleFiles.get(asset.logicalAssetId);
    const score = scoreFiles.get(asset.logicalAssetId);
    const pause = pauseFiles.get(asset.logicalAssetId);
    const path = ordinary !== undefined ? join(ordinaryRoot, ordinary)
      : visible !== undefined ? join(visibleRoot, visible)
      : score !== undefined ? join(scoreRoot, score)
      : pause !== undefined ? pause
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

function scoreState(
  score: number,
  beforeRank: number,
  rank: number,
  rankChanged: boolean,
  highRankEffect: "none" | "ScoreGaugeSS",
  highRankEffectActive: boolean,
) {
  const totalScoringUnitCount = 1000;
  const scoreMax = 10_000_000 + totalScoringUnitCount;
  const ratio = Math.fround(Math.fround(score) / Math.fround(scoreMax));
  const marker = (value: number) => f32(Math.fround(
    Math.fround(41) + Math.fround(
      Math.fround(Math.fround(value) * Math.fround(421)) / Math.fround(scoreMax),
    ),
  ));
  const digits = String(score);
  return Object.freeze({
    ruleSetId: "garupa-editor-normalized-10m-v1" as const,
    totalScoringUnitCount,
    score, scoreText: `[BEBEBE]${"0".repeat(Math.max(8 - digits.length, 0))}[-][FF3B72]${digits}[-]`,
    scoreMax, rank, beforeRank, rankChanged,
    meterKey: rank === 4 ? "score_meter_blue" : rank === 3 ? "score_meter_green" :
      rank === 2 ? "score_meter_orange" : rank === 1 ? "score_meter_pink" : "score_meter_s",
    ratio: f32(ratio), sliderValue: f32(Math.fround(Math.min(Math.max(ratio, 0), 1))),
    foregroundActive: ratio > 0,
    indicatorLocalX: ratio >= 1 ? 422 : Math.trunc(Math.fround(ratio * Math.fround(422))),
    rankMarkerCLocalX: marker(375_000), rankMarkerBLocalX: marker(2_250_000),
    rankMarkerALocalX: marker(4_500_000), rankMarkerSLocalX: marker(6_750_000),
    rankMarkerSSLocalX: marker(9_000_000), highRankEffect, highRankEffectActive,
  });
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

function vector2(x: number, y: number) { return Object.freeze({ x: f32(x), y: f32(y) }); }
function vector3(x: number, y: number, z: number) { return Object.freeze({ x: f32(x), y: f32(y), z: f32(z) }); }
function color(red: number, green: number, blue: number, alpha: number) {
  return Object.freeze({ red: f32(red), green: f32(green), blue: f32(blue), alpha: f32(alpha) });
}
function ordering(domainLayer: number, creationSequence: number) {
  return Object.freeze({ domainLayer, sourceDepthOrSortingOrder: 0, sourceZ: f32(0), creationSequence });
}
function f32(value: number) { return requireOk(createRenderFloat32(Math.fround(value)), "Float32"); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function equal<T>(actual: T, expected: T, message: string): void { if (!Object.is(actual, expected)) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`); }
function requireOk<T>(result: SimulatorResult<T>, message: string): T { if (result.status !== "ok") throw new Error(`${message}: ${result.capability}: ${result.boundary}`); return result.value; }

void main();
