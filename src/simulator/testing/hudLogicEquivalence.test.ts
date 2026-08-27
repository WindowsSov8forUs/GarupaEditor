declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { AddScoreHudOwner } from "../engine/hud/addScoreHudOwner";
import { ComboHudOwner } from "../engine/hud/comboHudOwner";
import { LifeHudOwner } from "../engine/hud/lifeHudOwner";
import { InGameRecord } from "../engine/managers/inGameRecord";
import type { SinglePlayScoreGaugeSnapshot } from "../engine/data/singlePlayScoreGauge";
import { SinglePlayScoreGauge } from "../engine/managers/singlePlayScoreGauge";

const fixture = JSON.parse(readFileSync(join(
  process.cwd(),
  "src/simulator/testing/fixtures/reverse-snapshots/hud-complete/artifacts/investigations/simulator-complete-hud-reconstruction-10-1-4/hud_logic_oracle.json",
), "utf8"));

const scoreOracle = fixture.score_boundaries;
const thresholds = Object.freeze({
  profileIdentity: "reverse:music-786-special",
  scoreC: scoreOracle.thresholds.c,
  scoreB: scoreOracle.thresholds.b,
  scoreA: scoreOracle.thresholds.a,
  scoreS: scoreOracle.thresholds.s,
  scoreSS: scoreOracle.thresholds.ss,
  scoreMaximum: scoreOracle.score_max,
});
const gauge = ok<SinglePlayScoreGauge>(SinglePlayScoreGauge.create(thresholds));
const rankValue = new Map([["S", 0], ["A", 1], ["B", 2], ["C", 3], ["D", 4], ["SS", 5]]);
for (const expected of scoreOracle.boundaries) {
  const actual = ok<SinglePlayScoreGaugeSnapshot>(gauge.update(expected.score));
  assert.equal(actual.currentGaugeColorRank, rankValue.get(expected.rank), `rank at ${expected.score}`);
  assert.equal(actual.ratioBits, expected.ratio_f32_bits, `ratio at ${expected.score}`);
  assert.equal(actual.sliderValueBits, expected.slider_f32_bits, `slider at ${expected.score}`);
  assert.equal(actual.indicatorLocalX, expected.indicator_local_x, `indicator at ${expected.score}`);
}

const apOff = new ComboHudOwner(false);
const apOn = new ComboHudOwner(true);
assert.equal(apOff.displayedAllPerfect(true), false);
assert.equal(apOn.displayedAllPerfect(true), true);
assert.deepEqual(apOn.normalState(172), { combo: 172, allPerfect: false });
assert.deepEqual(apOn.allPerfectState(172), { combo: 172, allPerfect: true });

const lifeRecord = new InGameRecord(1000, 1000, 2000);
const lifeOwner = new LifeHudOwner();
assert.deepEqual(lifeOwner.createState(lifeRecord.snapshot()), {
  currentLife: 1000,
  playerMaxLife: 1000,
  lifeUpperLimit: 2000,
  singleGameOver: false,
  primaryFill: { value: 1, bits: "3F800000" },
  secondaryFill: { value: 0, bits: "00000000" },
  color: "normal",
  warning: false,
  label: "1000/1000",
});
lifeRecord.addLife(-800);
const danger = lifeOwner.createState(lifeRecord.snapshot());
assert.equal(danger.color, "danger");
assert.equal(danger.warning, true);
assert.equal(danger.label, "200/1000");
assert.equal(fixture.life.gauge.normal_update_target, "FrontGauge only");

const addScore = new AddScoreHudOwner();
const states = Array.from({ length: 9 }, (_, index) => {
  const state = addScore.createState(index + 1);
  addScore.commit();
  return state;
});
assert.deepEqual(states.map((state) => state.poolIndex), [0, 1, 2, 3, 0, 1, 2, 3, 0]);
assert.deepEqual(states.map((state) => state.depth), [0, 1, 2, 3, 4, 5, 6, 7, 0]);

console.log(`HUD historical logic regression passed without visible-equivalence authorization: score-boundaries=${scoreOracle.boundaries.length} AP/Life/AddScore owners`);

function ok<T>(result: any): T {
  if (result.status !== "ok") throw new Error(String(result.capability));
  return result.value as T;
}
