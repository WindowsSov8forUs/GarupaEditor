declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { GameNoteAdditionalType, GameNoteType } from "../engine/chart/types";
import { LiveClearRank } from "../engine/data/singlePlayScoreGauge";
import { ScoreLifeStateManager } from "../engine/managers/scoreLifeStateManager";
import { InGameRecord } from "../engine/managers/inGameRecord";
import { SinglePlayScoreGauge } from "../engine/managers/singlePlayScoreGauge";
import { ScoreUtility } from "../engine/managers/scoreUtility";
import type { OneFrameJudgementBatch } from "../engine/data/oneFrameData";
import { noteBatch as chartBatch, chart } from "./firstSliceFixtures";

const record = new InGameRecord(1000, 1000, 2000);
assert.equal(record.addLife(-100), -100);
assert.equal(record.snapshot().currentLife, 900);
assert.equal(record.addLife(2000), 1100);
assert.equal(record.snapshot().currentLife, 2000);
assert.equal(record.addLife(-3000), -2000);
assert.equal(record.snapshot().singleGameOver, true);
assert.equal(record.addLife(100), 0, "positive life is rejected after Game Over");
const unsignedRecord = new InGameRecord(1000, 1000, 2000);
unsignedRecord.addScore(0xffffffff);
assert.equal(unsignedRecord.snapshot().score, 0xffffffff);
unsignedRecord.addScore(1);
assert.equal(unsignedRecord.snapshot().score, 0, "original UInt32 score accumulation wraps without signed coercion");

const utility = new ScoreUtility(Math.fround(100000), 27, 10);
assert.equal(Number.isFinite(utility.baseScore), true);
assert.equal(utility.getResultTypeCorrectionRate(0), 0);
assert.equal(utility.getResultTypeCorrectionRate(4), Math.fround(1.1));

testSinglePlayScoreGaugeOracle();

const scoreChart = chart([chartBatch(["score-life-note"], 1)]);
const root = scoreChart.noteBatches[0]!.informationList[0]!;
(root as any).gameNoteType = GameNoteType.Normal;
(root as any).gameNoteAdditionalType = GameNoteAdditionalType.Skill;
const manager = requireOk(ScoreLifeStateManager.create({
  schemaVersion: 1,
  sessionId: "generic-score-life",
  scoreLevel: 27,
  totalParameter: Math.fround(100000),
  scoreGaugeMaster: {
    musicId: 786,
    difficulty: "special",
    scoreC: 36000,
    scoreB: 216000,
    scoreA: 432000,
    scoreS: 648000,
    scoreSS: 864000,
  },
  life: {
    initialLife: 1000,
    playerMaxLife: 1000,
    lifeUpperLimit: 2000,
    missDamage: -100,
    badDamage: -50,
  },
  mode: { kind: "ordinary" },
}, scoreChart, "manual"));
assert.equal(ScoreLifeStateManager.create({
  ...manager.profile,
  sessionId: "practice-score-gauge",
  mode: { kind: "practice" },
}, scoreChart, "manual").status, "ok");
assert.equal(ScoreLifeStateManager.create({
  ...manager.profile,
  sessionId: "auto-score-gauge",
  mode: { kind: "auto-live", comboCoefficient: Math.fround(1) },
}, scoreChart, "auto-live").status, "ok");
assert.equal(ScoreLifeStateManager.create({
  ...manager.profile,
  sessionId: "mode-mismatch-score-gauge",
  mode: { kind: "auto-live", comboCoefficient: Math.fround(1) },
}, scoreChart, "manual").status, "evidence-required");

const missBusiness = manager.freezeOneFrame({
  noteIndex: 1,
  buttonTypes: [0],
  noteType: 2,
  phase: "head",
  rawResult: 0,
  adjustedResult: 0,
  addCombo: -1,
  absolutePosition: 0,
  judgeTiming: 0,
  multipleDirectionalFlickNoteCount: 0,
});
assert.deepEqual(missBusiness, { adjustedResult: 0, addScore: 0, addPower: -100 });

const plan = requireOk(manager.preflightReflect(batch(0, missBusiness)));
assert.equal(plan.record.currentLife, 900);
assert.equal(plan.record.score, 0);
assert.equal(manager.commitReflect(plan).status, "ok");
assert.equal(manager.snapshot().record.currentLife, 900);
assert.equal(manager.continueLive().status, "evidence-required");
assert.equal(manager.snapshot().scoreGauge.scoreMax, 959999);
assert.equal(manager.snapshot().scoreGauge.currentGaugeColorRank, 4);

const skillBusiness = manager.freezeOneFrame({
  noteIndex: 1,
  buttonTypes: [0],
  noteType: 2,
  phase: "head",
  rawResult: 4,
  adjustedResult: 4,
  addCombo: 1,
  absolutePosition: 0,
  judgeTiming: 0,
  multipleDirectionalFlickNoteCount: 0,
});
assert.equal(skillBusiness.adjustedResult, 4, "Skill-note marker does not invoke a character effect owner");
assert.equal(skillBusiness.addPower, 0);
const discardedScorePlan = requireOk(manager.preflightReflect(batch(1, skillBusiness)));
assert.equal(discardedScorePlan.record.score > 0, true);
assert.equal(discardedScorePlan.scoreGauge.currentGaugeColorRank, LiveClearRank.B);
assert.equal(manager.discardReflect(discardedScorePlan).status, "ok");
assert.equal(manager.snapshot().record.score, 0, "discard leaves record unchanged");
assert.equal(manager.snapshot().scoreGauge.currentGaugeColorRank, LiveClearRank.D, "discard leaves Gauge unchanged");
const committedScorePlan = requireOk(manager.preflightReflect(batch(2, skillBusiness)));
assert.equal(manager.commitReflect(committedScorePlan).status, "ok");
assert.equal(manager.snapshot().record.score, committedScorePlan.record.score);
assert.equal(manager.snapshot().scoreGauge.currentGaugeColorRank, LiveClearRank.B);

console.log("generic score/life tests passed: UInt32 score, Rank/Gauge, damage, Game Over and Skill-note independence");

function testSinglePlayScoreGaugeOracle(): void {
  const contract = JSON.parse(readFileSync(join(
    process.cwd(),
    "src/simulator/testing/fixtures/reverse-snapshots/score-hud-rank-gauge/artifacts/investigations/score-hud-rank-gauge-10-1-4/score_hud_rank_gauge_portable_contract.json",
  ), "utf8"));
  const oracle = contract.oracle.music_786_special;
  const master = Object.freeze({
    musicId: 786,
    difficulty: "special",
    scoreC: oracle.thresholds.c,
    scoreB: oracle.thresholds.b,
    scoreA: oracle.thresholds.a,
    scoreS: oracle.thresholds.s,
    scoreSS: oracle.thresholds.ss,
  });
  const gauge = requireOk(SinglePlayScoreGauge.create(master));
  assert.equal(gauge.scoreMax, 959999);
  assert.ok(Object.isFrozen(gauge.master));
  assert.equal(gauge.snapshot().rankMarkerCLocalX, Math.fround(56.78751754760742));
  assert.equal(gauge.snapshot().rankMarkerSSLocalX, Math.fround(419.900390625));
  const rankByName = {
    D: LiveClearRank.D,
    C: LiveClearRank.C,
    B: LiveClearRank.B,
    A: LiveClearRank.A,
    S: LiveClearRank.S,
    SS: LiveClearRank.SS,
  } as const;
  const rows = oracle.boundaries.map((row: any) => [
    row.score,
    rankByName[row.rank as keyof typeof rankByName],
    row.ratio_f32_bits,
    row.slider_f32_bits,
    row.indicator_local_x,
  ] as const);
  let previousRank: (typeof LiveClearRank)[keyof typeof LiveClearRank] = LiveClearRank.D;
  for (const [score, rank, ratioBits, sliderBits, indicatorLocalX] of rows) {
    const snapshot = requireOk(gauge.update(score));
    assert.equal(snapshot.beforeGaugeColorRank, previousRank, `before rank at ${score}`);
    assert.equal(snapshot.currentGaugeColorRank, rank, `rank at ${score}`);
    assert.equal(snapshot.rankChanged, previousRank !== rank, `rank callback at ${score}`);
    assert.equal(snapshot.ratioBits, ratioBits, `ratio bits at ${score}`);
    assert.equal(snapshot.sliderValueBits, sliderBits, `slider bits at ${score}`);
    assert.equal(snapshot.indicatorLocalX, indicatorLocalX, `indicator at ${score}`);
    assert.equal(snapshot.foregroundActive, score > 0, `foreground active at ${score}`);
    assert.equal(snapshot.highRankEffect, score === 864000 ? "ScoreGaugeSS" : "none");
    assert.equal(snapshot.highRankEffectActive, score >= 864000);
    previousRank = rank;
  }
  const repeatedSs = requireOk(gauge.update(960000));
  assert.equal(repeatedSs.rankChanged, false);
  assert.equal(repeatedSs.highRankEffect, "none");
  assert.equal(repeatedSs.highRankEffectActive, true);
  const skippedRanks = requireOk(SinglePlayScoreGauge.create(master));
  const directSs = requireOk(skippedRanks.update(864000));
  assert.equal(directSs.beforeGaugeColorRank, LiveClearRank.D);
  assert.equal(directSs.currentGaugeColorRank, LiveClearRank.SS);
  assert.equal(directSs.rankChanged, true);
  assert.equal(directSs.highRankEffect, "ScoreGaugeSS");
  const staged = gauge.cloneForPreflight();
  requireOk(staged.update(0));
  assert.equal(gauge.snapshot().currentGaugeColorRank, LiveClearRank.SS);
  gauge.commitFromPreflight(staged);
  assert.equal(gauge.snapshot().currentGaugeColorRank, LiveClearRank.D);

  assert.equal(SinglePlayScoreGauge.create({ ...master, scoreB: 36000 }).status, "evidence-required");
  assert.equal(SinglePlayScoreGauge.create({ ...master, scoreSS: 0xffffffff }).status, "evidence-required");
  assert.equal(SinglePlayScoreGauge.create({ ...master, extra: 1 } as any).status, "evidence-required");
  assert.equal(gauge.update(-1).status, "evidence-required");
  assert.equal(gauge.update(0x1_0000_0000).status, "evidence-required");
}

function batch(index: number, business: ReturnType<ScoreLifeStateManager["freezeOneFrame"]>): OneFrameJudgementBatch {
  const entry = Object.freeze({
    slot: 0,
    containerId: `score-life-${index}`,
    noteIndex: 1,
    buttonTypes: Object.freeze([0]),
    noteType: 2,
    phase: "head" as const,
    rawResult: business.adjustedResult,
    adjustedResult: business.adjustedResult,
    addCombo: (business.adjustedResult >= 3 ? 1 : -1) as 1 | -1,
    absolutePosition: 0,
    judgeTiming: 0 as const,
    multipleDirectionalFlickNoteCount: 0,
    business,
  });
  return Object.freeze({
    batchIndex: index,
    entries: Object.freeze([entry]),
    entryCount: 1,
    addCombo: entry.addCombo,
    rawResult: entry.rawResult,
    adjustedResult: entry.adjustedResult,
    judgeTiming: 0,
  });
}

function requireOk<T>(value: { status: "ok"; value: T } | { status: "evidence-required"; capability: string }): T {
  if (value.status !== "ok") throw new Error(value.capability);
  return value.value;
}
