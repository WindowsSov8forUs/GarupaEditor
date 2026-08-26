declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { Text } from "pixi.js";
import commonCatalog from "../engine/skin/commonRenderSemanticCatalog.json";
import { layoutNguiEncodedScoreLabel } from "../backends/pixi/hud/nguiEncodedScoreLabel";
import { COMMON_SCORE_HUD_BINDINGS } from "../engine/rendering/commonResourceBindings";
import {
  CURRENT_SCORE_HUD_FINAL_VISIBLE_SOURCE_COMMIT,
  CURRENT_SCORE_HUD_NINE_SLICE_BORDERS,
  CURRENT_SCORE_HUD_SCENE_PROFILE,
} from "../engine/rendering/currentScoreHudSemanticProfile";

const root = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/score-hud-final-visible/artifacts/investigations/simulator-score-hud-final-visible-closure-10-1-4",
);
const contract = JSON.parse(readFileSync(join(root, "score_hud_final_visible_closure.json"), "utf8"));

assert.equal(contract.status, "confirmed-current-score-hud-final-visible-closure");
assert.equal(contract.production_authorization, true);
assert.equal(contract.blocking_findings.length, 0);
assert.equal(CURRENT_SCORE_HUD_FINAL_VISIBLE_SOURCE_COMMIT, "818b8db6");
assert.deepEqual(contract.total_score_label, {
  path: "GamePlay/UI_Root/Display/Score/Base/TotalScore",
  component_path_id: 1271,
  component: "UILabel",
  active: true,
  enabled: true,
  font: { file_id: 16, path_id: 1799 },
  font_size: 28,
  font_style: 0,
  pivot: "Right",
  width: 188,
  height: 204,
  depth: 40,
  support_encoding: true,
  effect_style: 0,
  effect_distance_f32_bits: ["0000803F", "0000803F"],
  overflow: 0,
  world_matrix: contract.total_score_label.world_matrix,
  world_corners: contract.total_score_label.world_corners,
});
assert.deepEqual(contract.font_chain.dynamic_font, { file_id: 0, path_id: 75, name: "sgm" });
assert.equal(contract.font_chain.font_asset.sha256,
  "949356BBFEA78FB5BC3BA1610E1C64235FCCB9FD9A6F166A996715706FBFCE56");
assert.equal(contract.runtime_font_disposition.prior_bitmap_score_font_is_not_referenced_by_serialized_total_score_label, true);
assert.equal(contract.runtime_font_disposition.font_mutation_in_score_awake_reset_update, false);
assert.equal(COMMON_SCORE_HUD_BINDINGS.fontLogicalAssetId, "hud/score/rank-label-font");
assert.equal(COMMON_SCORE_HUD_BINDINGS.rankLabelFontLogicalAssetId, "hud/score/rank-label-font");
assert.equal((commonCatalog.groups.scoreHud as readonly { readonly file: string }[])
  .some((row) => row.file === "score-font.png"), false);
assert.equal(CURRENT_SCORE_HUD_SCENE_PROFILE.totalScoreFontLogicalAssetId, "hud/score/rank-label-font");
assert.equal(CURRENT_SCORE_HUD_SCENE_PROFILE.totalScoreAdvancePerFontSize, Math.fround(0.75));
assert.deepEqual(contract.ngui_atlas_score_sprites.critical_correction.gauge_base_score_pixi_border,
  { left: 216, top: 0, right: 16, bottom: 0 });
assert.deepEqual(contract.ngui_atlas_score_sprites.critical_correction.score_meter_blue_pixi_border,
  { left: 4, top: 3, right: 4, bottom: 3 });
assert.deepEqual(contract.ngui_atlas_score_sprites.critical_correction.score_meter_other_pixi_border,
  { left: 5, top: 0, right: 5, bottom: 0 });
assert.deepEqual(CURRENT_SCORE_HUD_NINE_SLICE_BORDERS.gaugeBase,
  contract.ngui_atlas_score_sprites.critical_correction.gauge_base_score_pixi_border);
assert.deepEqual(CURRENT_SCORE_HUD_NINE_SLICE_BORDERS.meterBlue,
  contract.ngui_atlas_score_sprites.critical_correction.score_meter_blue_pixi_border);
assert.deepEqual(CURRENT_SCORE_HUD_NINE_SLICE_BORDERS.meterOther,
  contract.ngui_atlas_score_sprites.critical_correction.score_meter_other_pixi_border);

const cases = [
  { score: 0, displayed: "00000000", leading: "0000000", significant: "0", size: 28, leadingX: -168, significantX: -21 },
  { score: 36_314, displayed: "00036314", leading: "000", significant: "36314", size: 28, leadingX: -168, significantX: -105 },
  { score: 9_000_000, displayed: "09000000", leading: "0", significant: "9000000", size: 28, leadingX: -168, significantX: -147 },
  { score: 90_000_000, displayed: "90000000", leading: "", significant: "90000000", size: 28, leadingX: -168, significantX: -168 },
  { score: 900_000_000, displayed: "900000000", leading: "", significant: "900000000", size: 27, leadingX: -182.25, significantX: -182.25 },
] as const;
for (const expected of cases) {
  const segments = [
    new Text({ label: "score-leading-segment" }),
    new Text({ label: "score-significant-segment" }),
  ] as const;
  const actual = layoutNguiEncodedScoreLabel(segments, expected.score, 0, 0, 188, 28, "sgm-fixture", 40);
  assert.equal(actual.displayed, expected.displayed);
  assert.equal(actual.leading, expected.leading);
  assert.equal(actual.significant, expected.significant);
  assert.equal(actual.fontSize, expected.size);
  assert.equal(segments[0].text, expected.leading);
  assert.equal(segments[1].text, expected.significant);
  assert.deepEqual([segments[0].x, segments[1].x], [expected.leadingX, expected.significantX]);
  assert.deepEqual([segments[0].anchor.x, segments[0].anchor.y], [0, 0.5]);
  assert.deepEqual([segments[1].anchor.x, segments[1].anchor.y], [0, 0.5]);
  assert.equal(Number(segments[0].style.fill), 0xbebebe);
  assert.equal(Number(segments[1].style.fill), 0xff3b72);
  assert.equal(String(segments[0].style.fontFamily), "sgm-fixture");
  assert.equal(Number(segments[0].style.fontSize), expected.size);
  assert.equal(segments[0].visible, expected.leading.length > 0);
  assert.equal(segments[1].visible, true);
  assert.equal(segments[0].zIndex, 40);
  assert.equal(segments[1].zIndex, 40);
  assert.equal(segments[0].children.length, 0);
  assert.equal(segments[1].children.length, 0);
  segments[0].destroy();
  segments[1].destroy();
}
console.log(`Score final visible equivalence passed: UIFont1799→sgm75, states=${cases.length}`);
