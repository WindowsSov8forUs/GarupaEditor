declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { parseCurrentScoreGaugeSsAnimationProfile } from "../../../backends/resources/currentScoreGaugeSsAnimationProfile";
import { CURRENT_SCORE_HUD_SCENE_PROFILE } from "../../../engine/rendering/currentScoreHudSemanticProfile";

const base = join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/hud-complete/artifacts/investigations/simulator-complete-hud-reconstruction-10-1-4",
);
const primitive = read("hud_render_primitive_oracle.json");
const components = read("hud_component_profile.json");
const animation = parseCurrentScoreGaugeSsAnimationProfile(primitive.score_gauge_ss_clip);
assert.notEqual(animation, null);
assert.equal(animation!.nodes.length, 11);
assert.equal(animation!.frames.length, 39);
assert.equal(animation!.frames.reduce((sum, frame) => sum + frame.keys.length, 0), 236);

const componentNodes = new Map(components.high_rank_effect.nodes.map((node: any) => [
  node.path.split("/").pop(), node,
]));
for (const node of animation!.nodes) {
  const source: any = componentNodes.get(node.name);
  assert.ok(source, node.name);
  const expectedTexture = source.resolved_texture_name === "ss_kira"
    ? "high-rank-kira"
    : source.resolved_texture_name === "ss_overlay"
    ? "high-rank-overlay"
    : "high-rank-long-star";
  assert.equal(node.textureKey, expectedTexture, `${node.name} component texture`);
  assert.deepEqual([node.widgetWidth, node.widgetHeight], [source.width, source.height]);
  assert.equal(node.pivot, source.pivot === "Left" ? "left" : "center");
  assert.deepEqual(node.colorF32Bits, source.color_f32_bits);
  assert.equal(node.blendMode, "normal");
}

const panel = components.panel;
assert.equal(panel.serialized.fields.m_clipping.enum, "SoftClip");
assert.deepEqual(panel.serialized.fields.m_clip_softness.value, [20, 3]);
assert.deepEqual(CURRENT_SCORE_HUD_SCENE_PROFILE.gauge.highRankPanel.softness, [20, 3]);
assert.equal(CURRENT_SCORE_HUD_SCENE_PROFILE.gauge.highRankPanel.targetLeftX, 38);
assert.equal(CURRENT_SCORE_HUD_SCENE_PROFILE.gauge.highRankPanel.leftAbsolute, 4);
assert.equal(CURRENT_SCORE_HUD_SCENE_PROFILE.gauge.highRankPanel.bottomY, -25.5);
assert.equal(CURRENT_SCORE_HUD_SCENE_PROFILE.gauge.highRankPanel.topY, 13.5);

const primitiveNodes = primitive.widgets.filter((row: any) =>
  row.path.includes("/Score/Progress/Panel/HighRankEffect/") && row.component === "UITexture");
assert.equal(primitiveNodes.length, 11);
for (const row of primitiveNodes) {
  assert.equal(row.world_corners.length, 4);
  assert.equal(row.color_f32_bits.length, 4);
  const component: any = componentNodes.get(row.path.split("/").pop());
  assert.equal(primitive.high_rank_texture_route[row.path], component.resolved_texture_name);
}
console.log(`HUD primitive contract passed: widgets=${primitive.widgets.length} SS=11 curves=56/236 SoftClip=20x3`);

function read(name: string): any {
  return JSON.parse(readFileSync(join(base, name), "utf8"));
}
