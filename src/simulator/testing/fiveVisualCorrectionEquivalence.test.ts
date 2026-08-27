declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import {
  CURRENT_FIVE_VISUAL_CORRECTION_SOURCE_COMMIT,
  CURRENT_LIFE_SERIALIZED_COMPONENT_PATHS,
  CURRENT_PAUSE_VISIBLE_MESSAGE,
  CURRENT_SCORE_SERIALIZED_COMPONENT_PATHS,
} from "../backends/resources/currentFiveVisualCorrectionProfile";
import { calculateGarupaProductSlideHalfWidth } from "../engine/garupa/productRenderProducer";

const fixtureRoot = join(process.cwd(), "src/simulator/testing/fixtures/reverse-snapshots");
const correction = read(
  "five-visual-correction/artifacts/investigations/simulator-five-visual-correction-10-1-4/five_visual_correction_contract.json",
);
const multiaspect = read(
  "adaptive-layout/artifacts/investigations/simulator-multiaspect-layout-runtime-contract-10-1-4/simulator_multiaspect_layout_contract.json",
);
const superseded = read(
  "hud-complete/artifacts/investigations/simulator-complete-hud-reconstruction-10-1-4/closure.json",
);

assert.equal(CURRENT_FIVE_VISUAL_CORRECTION_SOURCE_COMMIT,
  "c2187fe31eeedc0f288dfd29c25f741f93732ea8");
assert.equal(correction.status, "confirmed-current-five-visual-correction-contract");
assert.deepEqual(CURRENT_SCORE_SERIALIZED_COMPONENT_PATHS,
  correction.score_hud.widgets.map((row: any) => row.path));
assert.deepEqual(CURRENT_LIFE_SERIALIZED_COMPONENT_PATHS,
  correction.life_hud.widgets.map((row: any) => row.path));
assert.equal(CURRENT_SCORE_SERIALIZED_COMPONENT_PATHS.length, 45);
assert.equal(CURRENT_LIFE_SERIALIZED_COMPONENT_PATHS.length, 10);
assert.equal(CURRENT_LIFE_SERIALIZED_COMPONENT_PATHS.filter((path) => path.endsWith("/Total")).length, 1);
assert.equal(CURRENT_PAUSE_VISIBLE_MESSAGE, correction.pause.visible_message);
assert.deepEqual(CURRENT_PAUSE_VISIBLE_MESSAGE.split("\n"), correction.pause.visible_message_lines);
assert.equal(correction.pause.graphics_rectangle_cover_allowed, false);
assert.equal(superseded.production_authorization, false);
assert.equal(superseded.status, "superseded-production-consumption-authorization-withdrawn");

for (const oracle of correction.slide.width_one_oracles) {
  const layout = multiaspect.oracle.find((row: any) => row.id === oracle.case_id);
  assert.ok(layout, oracle.case_id);
  for (const sample of oracle.samples) {
    const uniformScale = f32(sample.uniform_scale_f32_bits);
    const halfWidth = calculateGarupaProductSlideHalfWidth(
      uniformScale,
      oracle.authored_width,
      layout.star_ui.screen_to_safe_area_ratio,
      layout.gameplay.screen_width_adjust_rate,
    );
    const fullPixels = Math.fround(Math.fround(Math.fround(halfWidth * 2) *
      layout.game_camera.pixels_per_world_unit));
    assert.equal(bits(fullPixels), sample.full_width_pixels_f32_bits,
      `${oracle.case_id}:${sample.curve_f32_bits} independent projected width`);
  }
}

assert.equal(correction.tap_lane_effect.slot_count, 13);
assert.equal(correction.tap_lane_effect.bounds_oracles.length, 8);
assert.ok(correction.tap_lane_effect.bounds_oracles.every((row: any) =>
  row.pivot === "bottom-center" && row.visible_bounds_relative_to_target_top_left[3] > 600));
console.log("five-visual historical regression vector passed without visible-equivalence authorization: Score45 Life10 Pause3 Slide10 Lane13/8");

function read(relative: string): any {
  return JSON.parse(readFileSync(join(fixtureRoot, relative), "utf8"));
}
function f32(value: string): number {
  const bytes = value.match(/../g)!.map((part) => Number.parseInt(part, 16));
  return new DataView(Uint8Array.from(bytes).buffer).getFloat32(0, true);
}
function bits(value: number): string {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, Math.fround(value), true);
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
