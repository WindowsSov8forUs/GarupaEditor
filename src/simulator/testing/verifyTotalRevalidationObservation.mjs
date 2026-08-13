import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (typeof path !== "string") throw new Error("raw observation path is required");
const raw = JSON.parse(readFileSync(path, "utf8"));
assert.equal(raw.schemaVersion, 2);
assert.deepEqual(raw.decoder, {
  kind: "synthetic-texture-source-routing-adapter",
  browserDecodeExecuted: false,
  rasterObserved: false,
});
for (const forbidden of ["status", "closed", "passed", "productionAuthorization"]) {
  assert.equal(Object.hasOwn(raw, forbidden), false, `raw observation contains decision field: ${forbidden}`);
}
const samples = raw.samples;
assert.ok(samples && typeof samples === "object");
const matrix = samples.scoreMatrix;
assert.ok(Array.isArray(matrix));
assert.deepEqual(matrix.map((row) => [row.score, row.rank, row.observation.hudScoreDigitCount]), [
  [0, 4, 8], [35999, 4, 8], [36000, 3, 8], [36001, 3, 8],
  [215999, 3, 8], [216000, 2, 8], [216001, 2, 8],
  [431999, 2, 8], [432000, 1, 8], [432001, 1, 8],
  [647999, 1, 8], [648000, 0, 8], [648001, 0, 8],
  [863999, 0, 8], [864000, 5, 8], [864001, 5, 8],
  [959998, 5, 8], [959999, 5, 8], [960000, 5, 8], [100000000, 5, 9],
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
    bounds: [left, -13.5, width, 39],
    softness: [20, 3],
  });
  const max = Math.trunc(Math.fround(Math.fround(state.master.scoreSS) * Math.fround(1.111111044883728)));
  assert.equal(state.scoreMax, max);
  const marker = (value) => Math.fround(Math.fround(41) + Math.fround(
    Math.fround(Math.fround(value) * Math.fround(421)) / Math.fround(max),
  ));
  assert.deepEqual([
    state.rankMarkerCLocalX.value, state.rankMarkerBLocalX.value,
    state.rankMarkerALocalX.value, state.rankMarkerSLocalX.value,
    state.rankMarkerSSLocalX.value,
  ], [marker(state.master.scoreC), marker(state.master.scoreB), marker(state.master.scoreA), marker(state.master.scoreS), marker(state.master.scoreSS)]);
}
const half = samples.scoreHalf;
const continued = samples.scoreContinued;
assert.equal(half.hudText, null);
assert.equal(half.animationElapsedSeconds, 0.5);
assert.equal(continued.animationElapsedSeconds, Math.fround(0.55));
assert.equal(half.hudScoreHighRankGeneration, 1);
assert.equal(continued.hudScoreHighRankGeneration, 1);
assert.equal(half.hudScoreHighRankNodes.length, 11);
assert.equal(continued.hudScoreHighRankNodes.length, 11);
assert.notDeepEqual(half.hudScoreHighRankNodes, continued.hudScoreHighRankNodes);
assert.deepEqual(half.hudScoreNineSliceBorders.find((row) => row.label === "score-gauge-background"), {
  label: "score-gauge-background", left: 216, top: 0, right: 0, bottom: 16,
});
for (const [label, depth] of [["score-digit-0", 40], ["score-gauge-background", 4], ["score-gauge-foreground", 5], ["score-gauge-cover", 28], ["score-rank-marker-SS", 29]]) {
  assert.ok(half.hudScoreLayerNodes.some((row) => row.label === label && row.zIndex === depth), `${label} depth`);
}
assert.deepEqual(half.hudScoreIndicatorMask, {
  owner: "score-high-rank-panel-mask",
  consumer: "score-high-rank-animation-layer",
  generation: 1,
  bounds: [42, -13.5, 375, 39],
  softness: [20, 3],
});
assert.equal(continued.hudScoreIndicatorMask.generation, 1);
assert.equal(samples.invalidScore.capability, "render.pixi.invalid-typed-hud-state");
assert.deepEqual(raw.sampleCleanup, { ownerCount: 0, stageChildren: 0 });
assert.equal(raw.fullChart.cleanupOwnerCount, 0);
assert.equal(raw.fullChart.cleanupStageChildren, 0);
console.log(`independent current raw observation verified: score-matrix=${matrix.length} ss-generation=1 indicator-clip=visible-consumer`);
