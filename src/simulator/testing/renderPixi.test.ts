import {
  DEFAULT_ORIGINAL_LIVE_SETTINGS,
  originalLiveSettingsForTest,
} from "./originalLiveSettingsTestProfile";
import { LIVE_AUTO_MODE, LIVE_MANUAL_MODE, REHEARSAL_AUTO_MODE, REHEARSAL_MANUAL_MODE } from "./modeFixtures";
declare function require(name: string): any;
declare const process: any;
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

import { Container, Graphics, NineSliceSprite, Sprite, Text, Texture, TextureSource } from "pixi.js";
import { PixiRendererBackend, type PixiTextureDecoder } from "../backends/pixi/pixiRendererBackend";
import { CURRENT_ORDINARY_RENDER_BINDINGS } from "./legacyCurrentOrdinaryResourceManifest";
import { CURRENT_ORDINARY_VISIBLE_PORTABLE_RESOURCES } from "./legacyCurrentOrdinaryVisibleResourceManifest";
import { CURRENT_ORDINARY_HUD_PROFILE } from "../backends/resources/currentOrdinaryHudProfile";
import { parseCurrentOrdinaryVisibleProfile } from "../backends/resources/currentOrdinaryVisibleProfile";
import { CURRENT_SCORE_HUD_PORTABLE_RESOURCES } from "./legacyCurrentScoreHudResourceManifest";
import { parseCurrentScoreGaugeSsAnimationProfile } from "../backends/resources/currentScoreGaugeSsAnimationProfile";
import { assertHudPixiRenderingEquivalence } from "./hudPixiRenderingEquivalence.test";
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
const hudApReaudit = JSON.parse(readFileSync(join(
  fixtureRoot,
  "hud-ap-fourth-reaudit/artifacts/investigations/simulator-hud-ap-fourth-reaudit-10-1-4/hud_ap_fourth_reaudit_contract.json",
), "utf8"));
const visualFifth = JSON.parse(readFileSync(join(
  fixtureRoot,
  "visual-fifth-reaudit/artifacts/investigations/simulator-visual-fifth-reaudit-10-1-4/visual_fifth_correction_contract.json",
), "utf8"));
const completeHudComponents = JSON.parse(readFileSync(join(
  fixtureRoot,
  "hud-complete/artifacts/investigations/simulator-complete-hud-reconstruction-10-1-4/hud_component_profile.json",
), "utf8"));
const fiveVisualCorrection = JSON.parse(readFileSync(join(
  fixtureRoot,
  "five-visual-correction/artifacts/investigations/simulator-five-visual-correction-10-1-4/five_visual_correction_contract.json",
), "utf8"));
const scoreFinalVisible = JSON.parse(readFileSync(join(
  fixtureRoot,
  "score-hud-final-visible/artifacts/investigations/simulator-score-hud-final-visible-closure-10-1-4/score_hud_final_visible_closure.json",
), "utf8"));

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
  equal(hudApReaudit.combo_ownership.parallel_distinct_scene_components, true,
    "HUD/AP evidence requires parallel normal and AP scene graphs");
  equal(hudApReaudit.portable_acceptance.must_hide_each_combo_number_after_one_second_without_change, true,
    "HUD/AP evidence requires owner-local one-second hide");
  equal(visualFifth.hud.life_label.font_size, 18,
    "fifth evidence independently requires the serialized 18-point Life label");
  equal(JSON.stringify(visualFifth.world_ordering.required_group_order), JSON.stringify([
    "tap-lane-0", "particle-1", "particle-5", "judge-20", "particle-50", "note-70", "hud-100",
  ]), "fifth evidence independently requires the interleaved world sorting groups");
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
  const autoCaptionRoot = liveControls.root.getChildByLabel("auto-live-caption-root") as Container;
  const autoCaptionBackground = autoCaptionRoot.getChildByLabel("auto-live-caption-background") as NineSliceSprite;
  const autoCaptionLabel = autoCaptionRoot.getChildByLabel("auto-live-caption-label") as Text;
  assert(autoCaptionRoot.visible, "Live Auto owns the serialized Auto Live caption");
  equal(autoCaptionBackground.tint, 0xff3b72, "Auto Live caption keeps serialized pink tint");
  equal(autoCaptionLabel.text, "オートライブ", "Auto Live caption keeps serialized label");
  equal(JSON.stringify([
    autoCaptionBackground.x,
    autoCaptionBackground.y,
    autoCaptionBackground.width,
    autoCaptionBackground.height,
  ]), JSON.stringify(CONTROL_SURFACE_LAYOUT.ui.autoLiveCaptionBoundsTopLeft),
  "Auto Live caption keeps the independent multiaspect bounds");
  requireOk(liveControls.publishPauseControlState(Object.freeze({ ...playing, state: "pause-menu" as const })), "publish Pause modal");
  assert(liveControls.root.getChildByLabel("pause-window", true) !== null, "Pause modal uses serialized window");
  assert((liveControls.root.getChildByLabel("pause-title", true) as Text).text === "一時停止", "Pause modal uses current visible title");
  equal((liveControls.root.getChildByLabel("pause-message", true) as Text).text,
    fiveVisualCorrection.pause.visible_message,
    "Pause modal consumes the corrected natural-frame three-line UILabel");
  assert(liveControls.root.getChildByLabel(fiveVisualCorrection.pause.background_cover_component.sprite_name, true) === null,
    "Pause does not infer component identity from a Sprite name");
  assert(liveControls.root.getChildByLabel("RetryablePauseDialog/Background", true) instanceof NineSliceSprite,
    "Pause dark cover consumes the serialized fill UISprite rather than Graphics");
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
  equal(lifeNodes.get("life-gauge-base")?.tint, 0xffffff,
    "Life GaugeBG remains serialized white instead of consuming FrontGauge color");
  assert(lifeNodes.get("life-primary")?.tint !== lifeNodes.get("life-gauge-base")?.tint,
    "Life primary alone consumes the dynamic danger/normal gauge color");
  equal(lifeNodes.get("life-primary")?.width, 224, "Life primary UISlider preserves authored widget width");
  equal(lifeNodes.get("life-primary")?.maskLabel, "life-primary-fill-mask", "Life primary uses left-to-right clip rather than width shrink");
  const lifeMasks = new Map(life.hudFillMasks?.map((mask) => [mask.label, mask]));
  equal(JSON.stringify(lifeMasks.get("life-primary-fill-mask")?.bounds), JSON.stringify([-323, 31, Math.fround(44.8), 26]), "Life primary left-to-right mask matches current ratio");
  const lifeTexts = new Map(life.hudTextNodes?.map((text) => [text.label, text]));
  equal(lifeTexts.has("life-current-label"), false,
    "Life owns no second root-level fallback Text that can be re-enabled on a persistent update");
  equal(lifeTexts.get("life-current-segment")?.text, "200", "Life encoded UILabel current run is independent");
  equal(lifeTexts.get("life-current-segment")?.fontSize, 18, "Life current segment consumes serialized 18pt");
  equal(lifeTexts.get("life-current-segment")?.fill, 0x00c000, "positive current Life consumes StringColorType.Green");
  equal(lifeTexts.get("life-separator-segment")?.text, "/", "Life encoded UILabel separator run is independent");
  equal(lifeTexts.get("life-separator-segment")?.fill, 0x505050, "Life separator consumes StringColorType.Black");
  equal(lifeTexts.get("life-maximum-segment")?.text, "1000", "Life maximum segment preserves the engine maximum");
  equal(lifeTexts.get("life-maximum-segment")?.fill, 0x00c000, "maximum Life consumes StringColorType.Green");
  for (const label of ["life-current-segment", "life-separator-segment", "life-maximum-segment"]) {
    equal(JSON.stringify(lifeTexts.get(label)?.anchor), JSON.stringify([0, 0.5]),
      `${label} participates in one sequential encoded UILabel run`);
    equal(JSON.stringify(lifeTexts.get(label)?.position), JSON.stringify([Math.fround(-103.99990844726562), 74]),
      `${label} shares the evidence-authored right edge without measuring fallback glyph widths`);
  }
  equal(lifeTexts.get("life-game-over-label")?.text, "ライフゼロ!\n獲得スコアDOWN!", "Life owns the current GameOver UILabel text");
  equal(lifeTexts.get("life-game-over-label")?.visible, false, "GameOver label remains hidden before zero Life");
  equal(JSON.stringify(life.ordering.slice(0, 3)), JSON.stringify([3, 100, 1000]), "Life root consumes current front-panel ordering");
  equal(life.hudSerializedComponentPaths?.length, fiveVisualCorrection.life_hud.serialized_widget_count,
    "Life production graph owns all ten serialized component identities");
  equal(life.hudSerializedComponentPaths?.filter((path) => path.endsWith("/life_panel/Total")).length, 1,
    "Life production graph owns exactly one Total UILabel identity");

  const scoreAtHalf = row("hud:score");
  equal(JSON.stringify(scoreAtHalf.position), JSON.stringify([
    CONTROL_SURFACE_LAYOUT.starUi.safeArea.x,
    0,
  ]), "Score StarUIAnchor resolves the root to safe left/top");
  equal(scoreAtHalf.hudText, "09000000", "Score owns one encoded UILabel text value");
  assert(scoreAtHalf.hudFontFamily?.startsWith("sgm-"), "Score TotalScore uses the hash-validated sgm FontFace");
  equal(scoreAtHalf.hudScoreDigitCount, 0, "Score owns no rejected bitmap digit Sprite");
  equal(scoreAtHalf.hudScoreTextRunCount, 2, "Score owns gray-leading and pink-significant runs under one UILabel owner");
  equal(scoreAtHalf.hudScoreRankVisualCount, 10, "Score owns five marker and five TTF rank label nodes");
  equal(scoreAtHalf.hudScoreHighRankNodes?.length, 11, "ScoreGaugeSS owns the committed eleven persistent nodes");
  equal(scoreAtHalf.hudScoreHighRankGeneration, 1, "ScoreGaugeSS nodes have one owner generation");
  equal(JSON.stringify(scoreAtHalf.hudSerializedComponentPaths),
    JSON.stringify(fiveVisualCorrection.score_hud.widgets.map((row: any) => row.path)),
    "Score production graph owns all 45 serialized component identities in source order");
  assertHudPixiRenderingEquivalence(scoreAtHalf, life, completeHudComponents);
  assert(scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label === "score-leading-segment" && node.zIndex === 40),
    "TotalScore leading UILabel run depth is 40");
  assert(scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label === "score-significant-segment" && node.zIndex === 40),
    "TotalScore significant UILabel run depth is 40");
  assert(!scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label.startsWith("score-digit-")),
    "TotalScore contains no bitmap digit Sprite");
  equal(JSON.stringify(scoreAtHalf.hudScoreTextLayout), JSON.stringify([
    {
      label: "score-leading-segment", text: "0", position: [-168, 0], anchor: [0, 0.5],
      fontFamily: scoreAtHalf.hudFontFamily, fontSize: 28, fill: 0xbebebe, visible: true, zIndex: 40,
    },
    {
      label: "score-significant-segment", text: "9000000", position: [-147, 0], anchor: [0, 0.5],
      fontFamily: scoreAtHalf.hudFontFamily, fontSize: 28, fill: 0xff3b72, visible: true, zIndex: 40,
    },
  ]), "TotalScore encoded runs consume independent Reverse TTF advances");
  const scoreComponents = new Map(scoreAtHalf.hudSerializedComponents?.map((row) => [row.path, row]));
  equal(JSON.stringify(scoreComponents.get(scoreFinalVisible.total_score_label.path)), JSON.stringify({
    path: scoreFinalVisible.total_score_label.path,
    visible: true,
    position: [212, 84],
    zIndex: 40,
    childLabels: ["score-leading-segment", "score-significant-segment"],
  }), "TotalScore component 1271 owns exact local transform, depth and two color primitives");
  for (const [path, position, zIndex, childLabel] of [
    ["GamePlay/UI_Root/Display/Score/Progress/Background", [0, 23], 4, "score-gauge-background"],
    ["GamePlay/UI_Root/Display/Score/Progress/Background_Cover", [38, 1], 28, "score-gauge-cover"],
    ["GamePlay/UI_Root/Display/Score/Progress/Foreground", [41, 1], 5, "score-gauge-foreground"],
  ] as const) {
    const component = scoreComponents.get(path);
    equal(JSON.stringify([component?.position, component?.zIndex, component?.childLabels]),
      JSON.stringify([position, zIndex, [childLabel]]), `${path} component transform/depth`);
  }
  assert(scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label === "score-gauge-background" && node.zIndex === 4), "Score background depth is 4");
  assert(scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label === "score-gauge-foreground" && node.zIndex === 5), "Score foreground depth is 5");
  assert(scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label === "score-gauge-cover" && node.zIndex === 28), "Score cover depth is 28");
  assert(scoreAtHalf.hudScoreLayerNodes?.some((node) => node.label === "score-rank-marker-SS" && node.zIndex === 29), "Score marker depth is 29");
  const borders = new Map(scoreAtHalf.hudScoreNineSliceBorders?.map((row) => [row.label, row]));
  const backgroundBorder = borders.get("score-gauge-background");
  assert(backgroundBorder !== undefined, "Score background NineSlice exists");
  equal(JSON.stringify(backgroundBorder), JSON.stringify({ label: "score-gauge-background", left: 216, top: 0, right: 16, bottom: 0 }),
    "NGUI UISpriteData left/right/top/bottom maps directly to Pixi NineSlice");
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
    const foregroundNineSlice = observed.hudScoreNineSliceBorders?.find((row) => row.label === "score-gauge-foreground");
    const expectedForegroundBorder = expectedRank === 4
      ? { label: "score-gauge-foreground", left: 4, top: 3, right: 4, bottom: 3 }
      : expectedRank === 0 || expectedRank === 5
      ? { label: "score-gauge-foreground", left: 0, top: 0, right: 0, bottom: 0 }
      : { label: "score-gauge-foreground", left: 5, top: 0, right: 5, bottom: 0 };
    equal(JSON.stringify(foregroundNineSlice), JSON.stringify(expectedForegroundBorder),
      `Score matrix ${matrixScore} updates the persistent NGUI meter border with the rank texture`);
    scoreMatrix.push(Object.freeze({ score: matrixScore, rank: expectedRank, observation: pickSceneObservation(observed) }));
    previousRank = expectedRank;
  }
  equal(scoreMatrix[scoreMatrix.length - 1]?.observation.hudScoreDigitCount, 0,
    "CS-V1 scoreMaximum never restores bitmap digits");
  equal(scoreMatrix[scoreMatrix.length - 1]?.observation.hudText, "10001000",
    "CS-V1 scoreMaximum keeps the complete eight-character UILabel value");

  const overMaximumCommand: RenderCommand = {
    sessionId: SESSION, sequence: sequence++, frame: 3, substep: 0,
    kind: "set-hud", renderObjectId: "hud:score:matrix", hudRole: "score",
    state: scoreState(10_001_001, 5, 5, false, "none", true),
  };
  requireOk(renderer.commit(requireOk(renderer.preflight([overMaximumCommand]), "Score ratio>1 preflight")), "Score ratio>1 commit");
  const overMaximumObserved = renderer.sceneSnapshot().find((candidate) => candidate.renderObjectId === "hud:score:matrix");
  const overMaximumRatios = overMaximumObserved?.hudFillRatios;
  assert(overMaximumRatios !== null && overMaximumRatios !== undefined, "Score ratio>1 HUD ratios exist");
  equal(overMaximumRatios[0], 1, "original UISlider clamps ratio>1");
  equal(overMaximumRatios[1] > 1, true, "original ratio callback preserves ratio>1");

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
  equal(gameOverTexts.get("life-current-segment")?.fill, 0xfe2349,
    "zero current Life switches only the current encoded segment to StringColorType.Red");
  equal(gameOverTexts.get("life-separator-segment")?.fill, 0x505050,
    "zero Life preserves the Black separator segment");
  equal(gameOverTexts.get("life-maximum-segment")?.fill, 0x00c000,
    "zero Life preserves the Green maximum segment");
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
  equal(recording.commandSnapshot().length, commands.length, "Recording retains the complete positive HUD mutation sequence");
  requireOk(recording.dispose(), "recording parity dispose");

  const resourcePreparation = renderer.resourceSnapshot();
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
      sampleCleanup,
      fullChart,
    }, null, 2));
  }
  console.log("actual Pixi historical ordinary-visible regression executed without visible-equivalence authorization: Note cubic owners + Combo/AP/AddScore/Result/Life resource routes");
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
  const judgeScale = Math.fround(
    Math.fround(scene.ordinaryNoteScene.noteSettingScale.value * Math.fround(0.9900000095367432)) *
    Math.fround(360 / 69),
  );
  equal(fieldJudge.scale[0], judgeScale, "judge line X consumes Button4 and local .99 scale");
  equal(fieldJudge.scale[1], judgeScale, "judge line Y consumes the same uniform Button4 and local .99 scale");
  equal(JSON.stringify(fieldJudge.ordering.slice(0, 3)), JSON.stringify([2, 20, 0]),
    "judge line preserves serialized SpriteRenderer sortingOrder20 between particle groups5 and50");
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
  );
  requireOk(producer.validate(), "product producer validate");
  const first = requireOk(
    producer.preflightFrame(0, [], Math.fround(1 / 60)),
    "product first frame",
  );
  assert(first !== null, "product first frame has visible commands");
  requireOk(first!.commit(), "product first frame commit");
  const rows = renderer.sceneSnapshot();
  assert(rows.some((row) => row.renderObjectId === "render:garupa:node:garupa-note:2" && row.visible &&
    row.spriteBindingKey?.endsWith("note_normal_16_1") && row.scale[0] === row.scale[1]),
    "actual Pixi has the exact-center NoteColor normal16 binding and uniform transform on a product-wide front");
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
  const effect = requireOk(producer.preflightFrame(
    judged.absolutePosition,
    [judged],
    Math.fround(1 / 60),
  ), "product effect frame");
  assert(effect !== null, "product effect frame has commands");
  requireOk(effect!.commit(), "product effect frame commit");
  const judgedRows = renderer.sceneSnapshot();
  assert(!judgedRows.some((row) =>
    row.renderObjectId.startsWith("render:garupa:effect:") ||
    row.renderObjectId.startsWith("render:garupa:tap-lane:")),
  "actual Pixi product rendering does not bind particle textures to NoteMesh or duplicate lane-effect owners");
  equal(judgedRows.find((row) =>
    row.renderObjectId === `render:garupa:node:${judged.identity}`)?.visible, false,
  "committed product judgement permanently hides its front owner");
  const released = requireOk(producer.preflightDispose(), "product render release");
  assert(released !== null, "product release owns objects");
  requireOk(released!.commit(), "product render release commit");
  equal(renderer.snapshot().objectCount, 0, "actual Pixi product releases every owner");
  requireOk(renderer.dispose(), "actual Pixi product backend dispose");
  equal(renderer.stage.children.length, 0, "actual Pixi product leaves empty stage");

  const routedSession = `${sessionId}:integer-lane-effect`;
  const routedProvider = requireOk(ImmutableLocalRenderResourceProvider.create(resources), "product lane actual provider");
  const routedRenderer = new PixiRendererBackend(decoder);
  requireOk(await routedRenderer.prepare(
    routedSession,
    profile,
    routedProvider,
    new PortableRenderResourcePreflightAdapter(),
  ), "product lane actual Pixi prepare");
  requireOk(routedRenderer.bindOriginalSurfaceLayout(CONTROL_SURFACE_LAYOUT), "product lane bind surface");
  const routedChart = requireOk(constructChartFromGarupaChartJson(requireOk(copyAndFreezeGarupaChartJson([
    { type: "BPM", beat: 0, value: 120 },
    { type: "Single", beat: 1, lane: 3, width: 1 },
    { type: "SV", beat: 10, value: -1 },
  ]), "product lane chart copy").chart), "product lane chart construct");
  const routedProduct = getGarupaProductChartProfile(routedChart)!;
  equal(routedProduct.route, "product-extension", "late negative SV selects the product timeline without changing the due note span");
  const routedLayout = requireOk(createSimulatorSceneLayout(
    { revision: 0, viewportWidth: 1600, viewportHeight: 720, safeArea: { x: Math.fround(0), y: Math.fround(0), width: Math.fround(1600), height: Math.fround(720) }, origin: "bottom-left" },
    { specificSpeed: Math.fround(11), noteSize: Math.fround(100), judgementAdjustValueB: 0, habahiroMeshWidthSetting: Math.fround(1), syncLineEdgeMargin: Math.fround(0) },
    "ordinary",
    CURRENT_ORDINARY_RENDER_BINDINGS,
  ), "product lane scene");
  const routedEngine = requireOk(createSimulatorEngine({
    chart: routedChart,
    runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode: LIVE_AUTO_MODE },
    scoreLifeState: {
      schemaVersion: 3,
      sessionId: routedSession,
      life: { initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000, missDamage: -100, badDamage: -50 },
      mode: LIVE_AUTO_MODE,
    },
    rendering: {
      sessionId: routedSession,
      resources: CURRENT_ORDINARY_RENDER_BINDINGS,
      ordinaryNoteScene: routedLayout.ordinaryNoteScene,
      garupaProductScene: routedLayout.garupaProductScene,
    },
  }, createRecordingSimulatorBackends(routedRenderer)), "product lane engine create");
  requireOk(routedEngine.initialize(), "product lane engine initialize");
  let routedLane: ReturnType<PixiRendererBackend["sceneSnapshot"]>[number] | undefined;
  for (let frame = 0; frame < 120 && routedLane === undefined; frame += 1) {
    requireOk(routedEngine.step(Math.fround(1 / 60)), `product lane frame ${frame}`);
    routedLane = routedRenderer.sceneSnapshot().find((row) =>
      row.renderObjectId === "render:tap-lane-effect:6" && row.visible);
  }
  assert(routedLane !== undefined, "product-route integer judgement reaches the main 13-slot lane-effect owner");
  equal(routedLane!.spriteBindingKey?.endsWith("NoteLaneEffect_4"), true,
    "center product note selects the fixed center NoteLaneEffect_4 component");
  equal(JSON.stringify(routedLane!.spriteAnchor), JSON.stringify([0.5, 1]),
    "lane effect preserves the serialized bottom-center Sprite pivot");
  equal(routedLane!.spriteBlendMode, "add", "lane effect preserves the additive material");
  const laneOracle = fiveVisualCorrection.tap_lane_effect.bounds_oracles.find((row: any) =>
    row.case_id === "20:9-full" && row.texture === "NoteLaneEffect_4");
  assert(laneOracle !== undefined && routedLane!.spriteWorldBounds !== null, "lane bounds oracle and actual bounds exist");
  const expectedLaneBounds = [
    800 + laneOracle.visible_bounds_relative_to_target_top_left[0],
    laneOracle.target_top_left_y + laneOracle.visible_bounds_relative_to_target_top_left[1],
    laneOracle.visible_bounds_relative_to_target_top_left[2],
    laneOracle.visible_bounds_relative_to_target_top_left[3],
  ];
  routedLane!.spriteWorldBounds!.forEach((value, index) => {
    assert(Math.abs(value - expectedLaneBounds[index]!) < 0.02,
      `product lane effect bound ${index}: ${value} vs ${expectedLaneBounds[index]}`);
  });
  equal(requireOk(routedEngine.snapshot(), "product lane snapshot").managers.tapLaneEffect?.activeCount, 1,
    "product lane effect state is owned by the same fixed owner");
  requireOk(routedEngine.dispose(), "product lane engine dispose");
  equal(routedRenderer.snapshot().objectCount, 0, "product lane effect cleanup");
  console.log("actual Pixi Garupa product passed: selected-field/ordinary-scale/scaled-sync/judged-hide/independent-slide/product-lane-effect/cleanup");
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
  let apOverlaySampleCount = 0;
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
        equal(JSON.stringify(row.ordering.slice(0, 2)), JSON.stringify([1, 0]),
          "TapLaneEffect preserves serialized sortingOrder0 below particle groups1/5/50");
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
    const apCombo = visible.find((row) => row.renderObjectId === "render:hud:combo:all-perfect");
    const add = visible.find((row) => row.renderObjectId.startsWith("render:hud:add-score") && row.visible);
    const result = visible.find((row) => row.renderObjectId === "render:hud:result");
    const score = visible.find((row) => row.renderObjectId === "render:hud:score");
    const life = visible.find((row) => row.renderObjectId === "render:hud:life");
    if (combo?.visible && combo.hudSpriteCount !== null && combo.hudSpriteCount >= 2) routes.add("combo");
    if (combo?.visible && apCombo?.visible && apCombo.hudState !== null &&
      "allPerfect" in apCombo.hudState && apCombo.hudState.allPerfect === true &&
      apCombo.activeAnimationRole !== null && apCombo.ordering[3] > combo.ordering[3]) {
      routes.add("combo-ap-overlay");
      apOverlaySampleCount += 1;
    }
    if (add?.visible && add.hudText === null && (add.hudSpriteCount ?? 0) >= 2) routes.add("add-score");
    if (result?.visible && result.hudText === null && (result.hudSpriteCount ?? 0) >= 1) routes.add("result");
    if (score?.visible && score.hudScoreDigitCount === 0 && score.hudScoreTextRunCount === 2 &&
      score.hudFontFamily?.startsWith("sgm-") && score.hudText !== null) routes.add("score");
    if (life?.visible && life.hudFontFamily?.startsWith("sgm-")) routes.add("life");
    if (finalSnapshot.managers.noteManager.nextBatchIndex === chart.noteBatches.length &&
      finalSnapshot.adjustedMusicPosition > 5000) break;
  }
  finalSnapshot = requireOk(engine.snapshot(), "actual Pixi final full-chart snapshot");
  equal(finalSnapshot.managers.noteManager.nextBatchIndex, chart.noteBatches.length,
    "actual Pixi full chart consumes every Note batch");
  equal([...routes].sort().join(","), "add-score,combo,combo-ap-overlay,life,result,score",
    "actual Pixi full chart observes parallel normal/AP Combo plus the judged HUD route set");
  const record = finalSnapshot.managers.scoreLifeState?.record;
  assert(record !== undefined, "full-chart Score/Life snapshot exists");
  assert(record.score > 0 && record.currentCombo > 0, "full-chart Auto Live updates Score and Combo");
  assert(tapLaneEffectVisibleSampleCount > 0, "actual Pixi observes the recovered tap lane effect Sprite owner");
  assert(apOverlaySampleCount > 0, "actual Pixi observes AP as a distinct animated overlay above the normal Combo graph");
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
    hudScoreTextRunCount: row.hudScoreTextRunCount,
    hudScoreTextLayout: row.hudScoreTextLayout,
    hudSerializedComponents: row.hudSerializedComponents,
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
    longMeshColor: Object.freeze({ red: f32(1), green: f32(1), blue: f32(1), alpha: f32(0.8) }),
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
  const scoreMax = 10_001_000;
  const thresholds = Object.freeze({
    scoreC: 375_000, scoreB: 2_250_000, scoreA: 4_500_000,
    scoreS: 6_750_000, scoreSS: 9_000_000,
  });
  const ratio = Math.fround(Math.fround(score) / Math.fround(scoreMax));
  const marker = (value: number) => f32(Math.fround(
    Math.fround(41) + Math.fround(
      Math.fround(Math.fround(value) * Math.fround(421)) / Math.fround(scoreMax),
    ),
  ));
  const digits = String(score);
  return Object.freeze({
    thresholds,
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
