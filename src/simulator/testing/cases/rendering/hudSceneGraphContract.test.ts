declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { CURRENT_SCORE_GAUGE_SS_WIDGETS } from "../../../backends/resources/currentCompleteHudProfile";
import {
  CURRENT_LIFE_SERIALIZED_COMPONENT_PATHS,
  CURRENT_SCORE_SERIALIZED_COMPONENT_PATHS,
} from "../../../backends/resources/currentFiveVisualCorrectionProfile";
import { CONTROL_HUD_IDENTITY } from "../../../engine/hud/controlHudOwner";
import { HUD_PREFAB_OBJECT_IDS } from "../../../engine/hud/hudContracts";

const root = "src/simulator/testing/fixtures/reverse-snapshots/hud-complete/artifacts/investigations/simulator-complete-hud-reconstruction-10-1-4";
const scene = read("hud_scene_graph.json");
const components = read("hud_component_profile.json");
const closure = read("closure.json");
const correction = JSON.parse(readFileSync(join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/five-visual-correction/artifacts/investigations/simulator-five-visual-correction-10-1-4/five_visual_correction_contract.json",
), "utf8"));

assert.equal(scene.status, "confirmed-current-complete-hud-scene-graph");
assert.equal(scene.widget_count, scene.widgets.length);
assert.equal(correction.status, "confirmed-current-five-visual-correction-contract");
assert.deepEqual(CURRENT_SCORE_SERIALIZED_COMPONENT_PATHS,
  correction.score_hud.widgets.map((row: any) => row.path));
assert.deepEqual(CURRENT_LIFE_SERIALIZED_COMPONENT_PATHS,
  correction.life_hud.widgets.map((row: any) => row.path));
assert.equal(CURRENT_SCORE_SERIALIZED_COMPONENT_PATHS.length, 45);
assert.equal(CURRENT_LIFE_SERIALIZED_COMPONENT_PATHS.length, 10);
assert.equal(CURRENT_LIFE_SERIALIZED_COMPONENT_PATHS.filter((path) => path.endsWith("/life_panel/Total")).length, 1);
for (const prefix of [
  "GamePlay/UI_Root/Display/Score",
  "GamePlay/UI_Root/Display/LifeGauge",
  "GamePlay/UI_Root/Display/Button/Pause",
  "GamePlay/UI_Root_Back/Display/Information/Combo",
  "GamePlay/UI_Root_Back/Display/Information/AddScore",
  "GamePlay/UI_Root_Back/Display/Information/Result",
]) assert.ok(scene.roots[prefix], `HUD root ${prefix}`);
assert.equal(CONTROL_HUD_IDENTITY.pause, "GamePlay/UI_Root/Display/Button/Pause");
assert.equal(new Set([
  HUD_PREFAB_OBJECT_IDS.score,
  HUD_PREFAB_OBJECT_IDS.life,
  HUD_PREFAB_OBJECT_IDS.combo,
  HUD_PREFAB_OBJECT_IDS.comboAllPerfect,
  HUD_PREFAB_OBJECT_IDS.result,
  ...HUD_PREFAB_OBJECT_IDS.addScore,
]).size, 9);

const sourceNodes = new Map(components.high_rank_effect.nodes.map((node: any) => [
  node.path.split("/").pop(), node,
]));
assert.equal(sourceNodes.size, 11);
for (const [name, actual] of Object.entries(CURRENT_SCORE_GAUGE_SS_WIDGETS)) {
  const source: any = sourceNodes.get(name);
  assert.ok(source, name);
  const expectedTexture = source.resolved_texture_name === "ss_kira"
    ? "high-rank-kira"
    : source.resolved_texture_name === "ss_overlay"
    ? "high-rank-overlay"
    : "high-rank-long-star";
  assert.deepEqual(actual, {
    textureKey: expectedTexture,
    width: source.width,
    height: source.height,
    pivot: source.pivot === "Left" ? "left" : "center",
    colorF32Bits: source.color_f32_bits,
    blendMode: "normal",
  });
}
assert.equal(closure.status, "superseded-production-consumption-authorization-withdrawn");
assert.equal(closure.production_authorization, false);
assert.equal(correction.prior_closure_disposition.complete_hud_production_authorization_withdrawn, true);
console.log(`HUD scene-graph contract passed: Score=${CURRENT_SCORE_SERIALIZED_COMPONENT_PATHS.length} Life=${CURRENT_LIFE_SERIALIZED_COMPONENT_PATHS.length} high-rank=${sourceNodes.size}`);

function read(name: string): any {
  return JSON.parse(readFileSync(join(process.cwd(), root, name), "utf8"));
}
