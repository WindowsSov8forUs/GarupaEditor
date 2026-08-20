import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
import { LIVE_AUTO_MODE, LIVE_MANUAL_MODE } from "./modeFixtures";
declare function require(name: string): any;
declare const process: any;
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

import { createRecordingSimulatorBackends } from "../backends/recordingBackend";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import {
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  type ChartConstructionResult,
  type NoteInformation,
} from "../engine/chart/types";
import { createSimulatorEngine } from "../host/createSimulatorEngine";
import type { OneFrameBusinessData, OneFrameJudgementBatch, OneFrameJudgementData } from "../engine/data/oneFrameData";
import { LiveClearRank } from "../engine/data/singlePlayScoreGauge";
import { InGameRecord } from "../engine/managers/inGameRecord";
import { ScoreLifeStateManager } from "../engine/managers/scoreLifeStateManager";
import { SinglePlayScoreGauge } from "../engine/managers/singlePlayScoreGauge";
import { createConstructedChartScoringPlan } from "../engine/scoring/constructedChartScoringAdapter";
import {
  calculateNormalizedScoreContribution,
  calculateNormalizedScoreMaximum,
  calculatePerfectQuota,
} from "../engine/scoring/normalizedScoreRule";
import {
  chart as fixtureChart,
  noteBatch as fixtureBatch,
  noteInformation as fixtureNote,
} from "./firstSliceFixtures";

const BASE = 10_000_000;

for (const count of [1, 3, 540, 731, 979]) {
  const actual = Array.from({ length: count }, (_, index) => {
    const quota = calculatePerfectQuota(index + 1, count);
    assert.notEqual(quota, null);
    return quota!;
  });
  const expected = Array.from({ length: count }, (_, index) =>
    Number(BigInt(index + 1) * BigInt(BASE + count) / BigInt(count) -
      BigInt(index) * BigInt(BASE + count) / BigInt(count)));
  assert.deepEqual(actual, expected, `independent quota schedule N=${count}`);
  assert.equal(actual.reduce((sum, value) => sum + value, 0), BASE + count);
  assert.ok(Math.max(...actual) - Math.min(...actual) <= 1);
}

const unit = Object.freeze({ id: "unit", ordinal: 1, perfectQuota: 10_001 });
const expectedRate = (bits: number) => {
  const bytes = new ArrayBuffer(4);
  const view = new DataView(bytes);
  view.setUint32(0, bits, true);
  return view.getFloat32(0, true);
};
const perfectRate = expectedRate(0x3f8ccccd);
for (const [result, rate] of [[0, 0], [1, 0], [2, 0.5], [3, expectedRate(0x3f4ccccd)], [4, perfectRate]] as const) {
  const actual = requireOk(calculateNormalizedScoreContribution(unit, result, false));
  const normalized = Math.fround(Math.fround(rate) / perfectRate);
  const expected = Math.trunc(Math.fround(Math.fround(unit.perfectQuota) * normalized));
  assert.equal(actual, expected, `normalized result ${result}`);
}
assert.equal(requireOk(calculateNormalizedScoreContribution(unit, 0, true)), unit.perfectQuota);

const record = new InGameRecord(1000, 1000, 2000);
assert.equal(record.addLife(-100), -100);
assert.equal(record.addLife(2000), 1100);
assert.equal(record.addLife(-3000), -2000);
assert.equal(record.snapshot().singleGameOver, true);

const chart = fixtureChart([
  fixtureBatch(["score-unit-a"], 1),
  fixtureBatch(["score-unit-b"], 2),
  fixtureBatch(["score-unit-c"], 3),
]);
for (const [index, source] of chart.noteBatches.flatMap((batch) => batch.informationList).entries()) {
  (source as any).index = index + 1;
  (source as any).absolutePos = index + 1;
  (source as any).gameNoteType = GameNoteType.Normal;
  (source as any).fireNoteType = FrontNoteType.Normal;
}
const plan = requireOk(createConstructedChartScoringPlan(chart));
assert.equal(plan.totalScoringUnitCount, 3);
assert.equal(plan.scoreMaximum, BASE + 3);
testConstructedChartScoringAdapterFamilies();
assert.ok(Object.isFrozen(plan));
assert.ok(Object.isFrozen(plan.units));
const sources = chart.noteBatches.flatMap((batch) => batch.informationList)
  .filter((source) => plan.resolve(source, "head").status === "ok")
  .sort((left, right) => left.absolutePos - right.absolutePos || left.index - right.index);
assert.equal(sources.length, 3);

const ordinary = createManager("ordinary-score", chart, "ordinary", "manual");
const miss = requireOk(ordinary.freezeOneFrame(judgement(sources[0]!, 0), sources[0]!));
assert.equal(miss.addScore, 0);
assert.equal(miss.addPower, -100);
const missPlan = requireOk(ordinary.preflightReflect(batch(0, miss, 0, -1)));
assert.equal(missPlan.record.score, 0);
assert.equal(missPlan.record.currentCombo, 0);
assert.equal(ordinary.discardReflect(missPlan).status, "ok");
assert.equal(ordinary.snapshot().initialization.consumedScoringUnitCount, 0);
const committedMiss = requireOk(ordinary.preflightReflect(batch(1, miss, 0, -1)));
assert.equal(ordinary.commitReflect(committedMiss).status, "ok");
assert.equal(ordinary.snapshot().initialization.consumedScoringUnitCount, 1);
assert.equal(ordinary.preflightReflect(batch(2, miss, 0, -1)).status, "evidence-required");
assert.equal(ordinary.snapshot().record.score, 0, "duplicate rejection precedes mutation");

const great = requireOk(ordinary.freezeOneFrame(judgement(sources[1]!, 3), sources[1]!));
const greatExpected = requireOk(calculateNormalizedScoreContribution(plan.units[1]!, 3, false));
assert.equal(great.addScore, greatExpected);
const greatPlan = requireOk(ordinary.preflightReflect(batch(3, great, 3, 1)));
assert.equal(greatPlan.record.score, greatExpected);
assert.equal(ordinary.commitReflect(greatPlan).status, "ok");
const perfect = requireOk(ordinary.freezeOneFrame(judgement(sources[2]!, 4), sources[2]!));
const perfectPlan = requireOk(ordinary.preflightReflect(batch(4, perfect, 4, 1)));
assert.ok(perfectPlan.record.score >= ordinary.snapshot().record.score);
assert.equal(ordinary.commitReflect(perfectPlan).status, "ok");
assert.equal(ordinary.snapshot().initialization.consumedScoringUnitCount, 3);

const auto = createManager("auto-score", chart, "auto-live", "auto-live");
for (let index = 0; index < sources.length; index += 1) {
  const business = requireOk(auto.freezeOneFrame(judgement(sources[index]!, 4), sources[index]!));
  assert.equal(business.addScore, plan.units[index]!.perfectQuota);
  const reflected = requireOk(auto.preflightReflect(batch(index, business, 4, 1)));
  assert.equal(auto.commitReflect(reflected).status, "ok");
}
assert.equal(auto.snapshot().record.score, BASE + 3);
assert.equal(auto.snapshot().record.currentCombo, 3);
assert.equal(auto.snapshot().scoreGauge.sliderValue, 1);
assert.equal(auto.getClearStatus(), 3);

const gauge = requireOk(SinglePlayScoreGauge.create(3));
assert.equal(gauge.scoreMax, BASE + 3);
for (const [score, rank] of [
  [374_999, LiveClearRank.D], [375_000, LiveClearRank.C],
  [2_249_999, LiveClearRank.C], [2_250_000, LiveClearRank.B],
  [4_499_999, LiveClearRank.B], [4_500_000, LiveClearRank.A],
  [6_749_999, LiveClearRank.A], [6_750_000, LiveClearRank.S],
  [8_999_999, LiveClearRank.S], [9_000_000, LiveClearRank.SS],
] as const) assert.equal(requireOk(gauge.update(score)).currentGaugeColorRank, rank);
assert.equal(gauge.update(BASE + 4).status, "evidence-required");
assert.equal(calculateNormalizedScoreMaximum(0), null);

testFullChartAutoMaximum();
console.log("CS-V1 score/life tests passed: chart-owned units, exact 10M+N Auto, normalized Manual, fixed Rank and duplicate rejection");

function testConstructedChartScoringAdapterFamilies(): void {
  const normal = fixtureNote("adapter-normal", 10);
  (normal as any).absolutePos = 10;
  const long = fixtureNote("adapter-long", 20);
  (long as any).absolutePos = 20;
  (long as any).afterNoteAbsolutePos = 50;
  (long as any).gameNoteType = GameNoteType.Long;
  (long as any).fireNoteType = FrontNoteType.Long;
  const slide = fixtureNote("adapter-slide", 30);
  (slide as any).absolutePos = 30;
  (slide as any).gameNoteType = GameNoteType.SlideA;
  (slide as any).fireNoteType = FrontNoteType.SlideA;
  const intermediate = fixtureNote("adapter-slide-mid", 31);
  (intermediate as any).absolutePos = 40;
  const hidden = fixtureNote("adapter-slide-hidden", 32);
  (hidden as any).absolutePos = 45;
  (hidden as any).isInvisible = true;
  const terminal = fixtureNote("adapter-slide-tail", 33);
  (terminal as any).absolutePos = 60;
  (slide as any).slideNoteList = [intermediate, hidden, terminal];
  const multiple = [0, 1, 2].map((button, index) => {
    const source = fixtureNote(`adapter-multiple-${index}`, 40 + index);
    (source as any).absolutePos = 70;
    (source as any).buttonType = button;
    (source as any).buttonTypes = [0, 1, 2];
    (source as any).buttonTypesArray = [0, 1, 2];
    (source as any).gameNoteType = GameNoteType.DirectionalFlickLeft;
    (source as any).fireNoteType = FrontNoteType.MultipleDirectionalFlick;
    return source;
  });
  const visual = fixtureNote("adapter-visual", 50);
  (visual as any).absolutePos = 70;
  (visual as any).fireNoteType = FrontNoteType.LongMultipleDirectionalFlickAdd;
  const laneChange = fixtureNote("adapter-lane", 60);
  (laneChange as any).absolutePos = 80;
  (laneChange as any).gameNoteAdditionalType = 4;
  const adapterChart = fixtureChart([{
    barIndex: 0, numerator: 0, denominator: 192, absolutePos: 0,
    informationList: [normal, long, slide, ...multiple, visual, laneChange],
  }]);
  const adapterPlan = requireOk(createConstructedChartScoringPlan(adapterChart));
  assert.equal(adapterPlan.totalScoringUnitCount, 7);
  assert.equal(requireOk(adapterPlan.resolve(long, "head")).id !== requireOk(adapterPlan.resolve(long, "tail")).id, true);
  assert.equal(requireOk(adapterPlan.resolve(intermediate, "intermediate")).ordinal <
    requireOk(adapterPlan.resolve(terminal, "tail")).ordinal, true);
  const multipleId = requireOk(adapterPlan.resolve(multiple[0]!, "head")).id;
  assert.equal(requireOk(adapterPlan.resolve(multiple[1]!, "head")).id, multipleId);
  assert.equal(requireOk(adapterPlan.resolve(multiple[2]!, "head")).id, multipleId);
  assert.equal(adapterPlan.resolve(hidden, "intermediate").status, "evidence-required");
  assert.equal(adapterPlan.resolve(visual, "head").status, "evidence-required");
  assert.equal(adapterPlan.resolve(laneChange, "head").status, "evidence-required");
}

function testFullChartAutoMaximum(): void {
  const chartText = readFileSync(join(
    process.cwd(), "src/simulator/testing/fixtures/reverse-snapshots/evidence-integrity",
    "artifacts/investigations/simulator-dynamic-acceptance-oracle-10-1-4/bms/poppin_shuffle_special.bms.txt",
  ), "utf8");
  const fullChart = requireOk(createNoteBatchInformationList({ musicScoreData: chartText }));
  const independentUnitCount = independentScoringUnitCount(fullChart);
  const engine = requireOk(createSimulatorEngine({
    chart: fullChart,
    runtime: { originalLiveSettings: DEFAULT_ORIGINAL_LIVE_SETTINGS, mode: LIVE_AUTO_MODE },
    scoreLifeState: {
      schemaVersion: 3,
      sessionId: "score-full-chart-auto",
      life: {
        initialLife: 1000, playerMaxLife: 1000, lifeUpperLimit: 2000,
        missDamage: -100, badDamage: -50,
      },
      mode: LIVE_AUTO_MODE,
    },
  }, createRecordingSimulatorBackends()));
  requireOk(engine.initialize());
  let snapshot = requireOk(engine.snapshot());
  for (let frame = 0; frame < 7200; frame += 1) {
    requireOk(engine.step(1 / 30));
    if (frame % 30 !== 0) continue;
    snapshot = requireOk(engine.snapshot());
    const state = snapshot.managers.scoreLifeState!;
    if (state.initialization.consumedScoringUnitCount ===
        state.initialization.totalScoringUnitCount) break;
  }
  snapshot = requireOk(engine.snapshot());
  const state = snapshot.managers.scoreLifeState!;
  assert.equal(state.initialization.totalScoringUnitCount, independentUnitCount,
    "full chart plan count matches independent chart traversal");
  assert.equal(state.initialization.consumedScoringUnitCount,
    state.initialization.totalScoringUnitCount, "full chart consumes every scoring unit");
  assert.equal(state.record.score, state.initialization.scoreMaximum,
    "full-chart Auto reaches exact 10M+N");
  assert.equal(state.record.resultCounts[4], state.initialization.totalScoringUnitCount);
  assert.equal(state.scoreGauge.sliderValue, 1);
  requireOk(engine.dispose());
}

function independentScoringUnitCount(sourceChart: ChartConstructionResult): number {
  let count = 0;
  for (const batch of sourceChart.noteBatches) {
    let multiple: NoteInformation[] = [];
    for (const source of batch.informationList) {
      if (source.gameNoteType === GameNoteType.None ||
          source.gameNoteAdditionalType === GameNoteAdditionalType.LaneChange) continue;
      if (source.fireNoteType === FrontNoteType.MultipleDirectionalFlick) {
        const previous = multiple[multiple.length - 1];
        if (previous === undefined || previous.gameNoteType !== source.gameNoteType ||
            Math.abs(previous.buttonType - source.buttonType) !== 1) {
          count += 1;
          multiple = [source];
        } else {
          multiple.push(source);
        }
        continue;
      }
      multiple = [];
      if (source.fireNoteType >= FrontNoteType.LongMultipleDirectionalFlickAdd &&
          source.fireNoteType <= FrontNoteType.SlideBMultipleDirectionalFlickAdd) continue;
      count += 1;
      if (source.gameNoteType === GameNoteType.Long) count += 1;
      if (source.gameNoteType === GameNoteType.SlideA || source.gameNoteType === GameNoteType.SlideB) {
        count += source.slideNoteList.filter((child) => !child.isInvisible).length;
      }
    }
  }
  return count;
}

function createManager(
  sessionId: string,
  sourceChart: typeof chart,
  mode: "ordinary" | "auto-live",
  runtime: "manual" | "auto-live",
): ScoreLifeStateManager {
  const scoringPlan = requireOk(createConstructedChartScoringPlan(sourceChart));
  const identity = mode === "auto-live" ? LIVE_AUTO_MODE : LIVE_MANUAL_MODE;
  assert.equal(runtime === "auto-live", identity.isAutoPlay);
  return requireOk(ScoreLifeStateManager.create({
    schemaVersion: 3,
    sessionId,
    life: {
      initialLife: 1000,
      playerMaxLife: 1000,
      lifeUpperLimit: 2000,
      missDamage: -100,
      badDamage: -50,
    },
    mode: identity,
  }, scoringPlan, identity));
}

function judgement(source: NoteInformation, result: 0 | 1 | 2 | 3 | 4): OneFrameJudgementData {
  return Object.freeze({
    noteIndex: source.index,
    buttonTypes: source.buttonTypesArray,
    noteType: 0,
    phase: "head" as const,
    rawResult: result,
    adjustedResult: result,
    addCombo: (result >= 3 ? 1 : -1) as 1 | -1,
    absolutePosition: source.absolutePos,
    judgeTiming: (result === 0 || result === 4 ? 0 : 1) as 0 | 1,
    multipleDirectionalFlickNoteCount: 0,
  });
}

function batch(
  index: number,
  business: OneFrameBusinessData,
  result: 0 | 1 | 2 | 3 | 4,
  addCombo: 1 | -1,
): OneFrameJudgementBatch {
  const entry = Object.freeze({
    slot: 0,
    containerId: `score-life-${index}`,
    noteIndex: index,
    buttonTypes: Object.freeze([0]),
    noteType: 0,
    phase: "head" as const,
    rawResult: result,
    adjustedResult: result,
    addCombo,
    absolutePosition: index,
    judgeTiming: (result === 0 || result === 4 ? 0 : 1) as 0 | 1,
    multipleDirectionalFlickNoteCount: 0,
    business,
  });
  return Object.freeze({
    batchIndex: index,
    entries: Object.freeze([entry]),
    entryCount: 1,
    addCombo,
    rawResult: result,
    adjustedResult: result,
    judgeTiming: entry.judgeTiming,
  });
}

function requireOk<T>(value: { status: "ok"; value: T } | { status: "evidence-required"; capability: string }): T {
  if (value.status !== "ok") throw new Error(value.capability);
  return value.value;
}
