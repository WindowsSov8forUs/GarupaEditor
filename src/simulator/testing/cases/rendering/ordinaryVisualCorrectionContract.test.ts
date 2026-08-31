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
} from "../../../backends/resources/currentFiveVisualCorrectionProfile";
import { calculateGarupaProductSlideHalfWidth } from "../../../engine/garupa/productRenderProducer";

const fixtureRoot = join(process.cwd(), "src/simulator/testing/fixtures/reverse-snapshots");
const correction = read(
  "five-visual-correction/artifacts/investigations/simulator-five-visual-correction-10-1-4/five_visual_correction_contract.json",
);
const bbkk = read(
  "full-visible-lifecycle/artifacts/investigations/simulator-full-visible-lifecycle-reaudit-10-1-4/bbkk_slide_full_timeline_oracle.json",
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

assert.equal(bbkk.status, "confirmed-product-input-independent-bbkk-slide-full-timeline-oracle");
assert.equal(bbkk.chart.slideItems, 83);
assert.equal(bbkk.chart.segments, 141);
assert.equal(bbkk.timeline.upperHalfFrames, 1611);
assert.ok(bbkk.timeline.selectedUpperHalfCases.every((row: any) => row.crossesUpperHalf && row.visibleCurve[0] < 0.5));
for (const oracle of bbkk.widthOne) {
  const historical = correction.slide.width_one_oracles.find((row: any) => row.case_id === oracle.caseId);
  assert.ok(historical, oracle.caseId);
  for (let index = 0; index < oracle.samples.length; index += 1) {
    const source = historical.samples[index]!;
    const expected = oracle.samples[index]!;
    const halfWidth = calculateGarupaProductSlideHalfWidth(
      f32(source.uniform_scale_f32_bits),
      historical.authored_width,
      // Derive the original safe-area factor from the historical sample while
      // explicitly excluding the disproved second screenWidthAdjustRate factor.
      f32(source.full_width_world_f32_bits) /
        (2 * f32(source.uniform_scale_f32_bits) * oracle.screenWidthAdjustRate),
    );
    const pixelsPerWorldUnit = expected.oldErroneousPixels /
      (2 * halfWidth * oracle.screenWidthAdjustRate);
    const fullPixels = Math.fround(halfWidth * 2 * pixelsPerWorldUnit);
    assert.ok(Math.abs(fullPixels - expected.correctPixels) < 0.0001,
      `${oracle.caseId}:${expected.curveF32Bits} corrected independent width ${fullPixels}/${expected.correctPixels}`);
    assert.ok(expected.correctPixels > expected.oldErroneousPixels * 4,
      "the former duplicated screenWidthAdjustRate must remain detectably rejected");
  }
}

assert.equal(correction.tap_lane_effect.slot_count, 13);
assert.equal(correction.tap_lane_effect.bounds_oracles.length, 8);
assert.ok(correction.tap_lane_effect.bounds_oracles.every((row: any) =>
  row.pivot === "bottom-center" && row.visible_bounds_relative_to_target_top_left[3] > 600));
console.log("ordinary visual correction contract passed: Score45 Life10 Pause3 Slide10 Lane13/8");

function read(relative: string): any {
  return JSON.parse(readFileSync(join(fixtureRoot, relative), "utf8"));
}
function f32(value: string): number {
  const bytes = value.match(/../g)!.map((part) => Number.parseInt(part, 16));
  return new DataView(Uint8Array.from(bytes).buffer).getFloat32(0, true);
}
