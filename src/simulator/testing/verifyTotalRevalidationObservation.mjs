import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyOrdinaryPixiWorldObservation } from "./verifyPixiWorldObservation.mjs";

const path = process.argv[2];
if (typeof path !== "string") throw new Error("raw observation path is required");
const raw = JSON.parse(readFileSync(path, "utf8"));
const totalFixture = JSON.parse(readFileSync(join(
  process.cwd(), "src", "simulator", "testing", "fixtures", "reverse-snapshots",
  "ordinary-rendering-total-reaudit", "artifacts", "investigations",
  "ordinary-single-rendering-total-reaudit-10-1-4", "ordinary_rendering_candidate_fixture.json",
), "utf8"));
assert.equal(raw.schemaVersion, 3);
verifyOrdinaryPixiWorldObservation(raw.worldObservation, totalFixture);
for (const forbidden of ["status", "closed", "passed", "productionAuthorization"]) {
  assert.equal(Object.hasOwn(raw, forbidden), false, `raw observation contains decision field: ${forbidden}`);
}
const samples = raw.samples;
assert.ok(samples && typeof samples === "object");
const matrix = samples.scoreMatrix;
assert.ok(Array.isArray(matrix));
assert.deepEqual(matrix.map((row) => [
  row.score, row.rank, row.observation.hudScoreDigitCount,
  row.observation.hudScoreTextRunCount, row.observation.hudText,
]), [
  [0, 4, 0, 2, "00000000"], [374999, 4, 0, 2, "00374999"], [375000, 3, 0, 2, "00375000"], [375001, 3, 0, 2, "00375001"],
  [2249999, 3, 0, 2, "02249999"], [2250000, 2, 0, 2, "02250000"], [2250001, 2, 0, 2, "02250001"],
  [4499999, 2, 0, 2, "04499999"], [4500000, 1, 0, 2, "04500000"], [4500001, 1, 0, 2, "04500001"],
  [6749999, 1, 0, 2, "06749999"], [6750000, 0, 0, 2, "06750000"], [6750001, 0, 0, 2, "06750001"],
  [8999999, 0, 0, 2, "08999999"], [9000000, 5, 0, 2, "09000000"], [9000001, 5, 0, 2, "09000001"],
  [10000999, 5, 0, 2, "10000999"], [10001000, 5, 0, 2, "10001000"],
]);
for (const row of matrix) {
  const state = row.observation.hudState;
  const indicator = state.ratio.value >= 1
    ? 422
    : Math.trunc(Math.fround(state.ratio.value * Math.fround(422)));
  assert.equal(state.indicatorLocalX, indicator);
  const right = 38 + indicator;
  const width = Math.max(2, indicator - 4);
  const left = (42 + right) / 2 - width / 2;
  assert.deepEqual(row.observation.hudScoreIndicatorMask, {
    owner: "score-high-rank-panel-mask",
    consumer: "score-high-rank-animation-layer",
    generation: 1,
    position: [25, 45],
    bounds: [left, -13.5, width, 39],
    softness: [20, 3],
  });
  const foreground = row.observation.hudScoreNineSliceBorders.find((entry) => entry.label === "score-gauge-foreground");
  const expectedForeground = row.rank === 4
    ? { label: "score-gauge-foreground", left: 4, top: 3, right: 4, bottom: 3 }
    : row.rank === 0 || row.rank === 5
    ? { label: "score-gauge-foreground", left: 0, top: 0, right: 0, bottom: 0 }
    : { label: "score-gauge-foreground", left: 5, top: 0, right: 5, bottom: 0 };
  assert.deepEqual(foreground, expectedForeground);
  assert.deepEqual(state.thresholds, {
    scoreC: 375000,
    scoreB: 2250000,
    scoreA: 4500000,
    scoreS: 6750000,
    scoreSS: 9000000,
  });
  const max = state.scoreMax;
  assert.equal(max, 10001000);
  const marker = (value) => Math.fround(Math.fround(41) + Math.fround(
    Math.fround(Math.fround(value) * Math.fround(421)) / Math.fround(max),
  ));
  assert.deepEqual([
    state.rankMarkerCLocalX.value, state.rankMarkerBLocalX.value,
    state.rankMarkerALocalX.value, state.rankMarkerSLocalX.value,
    state.rankMarkerSSLocalX.value,
  ], [marker(375000), marker(2250000), marker(4500000), marker(6750000), marker(9000000)]);
}
const half = samples.scoreHalf;
const continued = samples.scoreContinued;
assert.equal(half.hudText, "09000000");
assert.equal(half.hudScoreDigitCount, 0);
assert.equal(half.hudScoreTextRunCount, 2);
assert.deepEqual(half.hudScoreTextLayout.map((row) => [row.label, row.text, row.position, row.fontSize, row.fill]), [
  ["score-leading-segment", "0", [-168, 0], 28, 0xbebebe],
  ["score-significant-segment", "9000000", [-147, 0], 28, 0xff3b72],
]);
assert.equal(half.animationElapsedSeconds, 0.5);
assert.equal(continued.animationElapsedSeconds, Math.fround(0.55));
assert.equal(half.hudScoreHighRankGeneration, 1);
assert.equal(continued.hudScoreHighRankGeneration, 1);
assert.equal(half.hudScoreHighRankNodes.length, 11);
assert.equal(continued.hudScoreHighRankNodes.length, 11);
assert.notDeepEqual(half.hudScoreHighRankNodes, continued.hudScoreHighRankNodes);
assert.deepEqual(half.hudScoreNineSliceBorders.find((row) => row.label === "score-gauge-background"), {
  label: "score-gauge-background", left: 216, top: 0, right: 16, bottom: 0,
});
for (const [label, depth] of [["score-leading-segment", 40], ["score-significant-segment", 40], ["score-gauge-background", 4], ["score-gauge-foreground", 5], ["score-gauge-cover", 28], ["score-rank-marker-SS", 29]]) {
  assert.ok(half.hudScoreLayerNodes.some((row) => row.label === label && row.zIndex === depth), `${label} depth`);
}
assert.deepEqual(half.hudScoreIndicatorMask, {
  owner: "score-high-rank-panel-mask",
  consumer: "score-high-rank-animation-layer",
  generation: 1,
  position: [25, 45],
  bounds: [42, -13.5, 375, 39],
  softness: [20, 3],
});
assert.equal(continued.hudScoreIndicatorMask.generation, 1);
assert.deepEqual(raw.sampleCleanup, { ownerCount: 0, stageChildren: 0 });
assert.equal(raw.fullChart.cleanupOwnerCount, 0);
assert.equal(raw.fullChart.cleanupStageChildren, 0);

console.log(`independent current raw world observation verified: records=${raw.worldObservation.records.length} score-matrix=${matrix.length} complete-positive-vector=true`);
