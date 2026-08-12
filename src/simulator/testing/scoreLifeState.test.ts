declare function require(name: string): any;
const assert = require("node:assert/strict");

import { GameNoteAdditionalType, GameNoteType } from "../engine/chart/types";
import { ScoreLifeStateManager } from "../engine/managers/scoreLifeStateManager";
import { InGameRecord } from "../engine/managers/inGameRecord";
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

const utility = new ScoreUtility(Math.fround(100000), 27, 10);
assert.equal(Number.isFinite(utility.baseScore), true);
assert.equal(utility.getResultTypeCorrectionRate(0), 0);
assert.equal(utility.getResultTypeCorrectionRate(4), Math.fround(1.1));

const scoreChart = chart([chartBatch(["score-life-note"], 1)]);
const root = scoreChart.noteBatches[0]!.informationList[0]!;
(root as any).gameNoteType = GameNoteType.Normal;
(root as any).gameNoteAdditionalType = GameNoteAdditionalType.Skill;
const manager = requireOk(ScoreLifeStateManager.create({
  schemaVersion: 1,
  sessionId: "generic-score-life",
  scoreLevel: 27,
  totalParameter: Math.fround(100000),
  life: {
    initialLife: 1000,
    playerMaxLife: 1000,
    lifeUpperLimit: 2000,
    missDamage: -100,
    badDamage: -50,
  },
  mode: { kind: "ordinary" },
}, scoreChart, "manual"));

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

console.log("generic score/life tests passed: score, damage, Game Over and Skill-note independence");

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
