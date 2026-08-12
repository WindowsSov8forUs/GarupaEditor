const assert = Object.freeze({
  equal(actual: unknown, expected: unknown, message?: string): void {
    if (!Object.is(actual, expected)) {
      throw new Error(`${message ?? "equal"}: ${String(actual)} !== ${String(expected)}`);
    }
  },
  deepEqual(actual: unknown, expected: unknown, message?: string): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message ?? "deepEqual"}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    }
  },
});
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { JudgementRecord } from "../engine/data/judgementState";
import type { OneFrameJudgementBatch } from "../engine/data/oneFrameData";
import { JudgementStateManager } from "../engine/managers/judgementStateManager";

const chart = requireOk(createNoteBatchInformationList({
  musicScoreData: [
    "#BPM 120",
    "#WAV01 normal.wav",
    "#00011:01",
    "#00112:01",
    "#00213:01",
    "",
  ].join("\n"),
}));

const manager = requireOk(JudgementStateManager.create(chart));
assert.equal(manager.maxNoteCount, 3);

const first = requireOk(manager.preflightReflect(batch(0, [
  entry(0, 0, 4, 0, 1),
  entry(1, 1, 3, 1, 1),
])));
assert.equal(manager.record.snapshot().currentCombo, 0, "preflight cannot mutate owner");
assert.equal(first.record.currentCombo, 2);
assert.deepEqual(first.record.resultCounts, [0, 0, 0, 1, 1]);
assert.equal(manager.commitReflect(first).status, "ok");
assert.equal(manager.record.snapshot().currentCombo, 2);

const miss = requireOk(manager.preflightReflect(batch(1, [
  entry(0, 2, 0, 0, -1),
])));
assert.equal(miss.record.currentCombo, 0);
assert.equal(miss.record.fastCount, 1);
assert.equal(manager.commitReflect(miss).status, "ok");
assert.equal(manager.getClearStatus(), 1);
assert.equal(manager.record.snapshot().allPerfect, false);

const fullCombo = new JudgementRecord();
fullCombo.addCombo(1);
fullCombo.incrementResult(4, 0);
fullCombo.addCombo(1);
fullCombo.incrementResult(3, 2);
assert.equal(fullCombo.getClearStatus(2), 2);
assert.equal(fullCombo.snapshot().slowCount, 1);

const allPerfect = new JudgementRecord();
for (let index = 0; index < 3; index += 1) {
  allPerfect.addCombo(1);
  allPerfect.incrementResult(4, 0);
}
assert.equal(allPerfect.getClearStatus(3), 3);
assert.equal(allPerfect.snapshot().maxCombo, 3);
assert.equal(allPerfect.snapshot().perfectCombo, 3);

const discarded = requireOk(manager.preflightReflect(batch(2, [
  entry(0, 3, 4, 0, 1),
])));
assert.equal(manager.discardReflect(discarded).status, "ok");
assert.equal(manager.record.snapshot().resultCounts[4], 1);

console.log("judgement state tests passed: transactional combo/result/clear-status owner");

function entry(
  slot: number,
  noteIndex: number,
  result: 0 | 1 | 2 | 3 | 4,
  judgeTiming: 0 | 1 | 2,
  addCombo: -1 | 1,
) {
  return Object.freeze({
    slot,
    containerId: `one-frame:${slot}`,
    noteIndex,
    buttonTypes: Object.freeze([1]),
    noteType: 0,
    phase: "head" as const,
    rawResult: result,
    adjustedResult: result,
    addCombo,
    absolutePosition: noteIndex * 192,
    judgeTiming,
    multipleDirectionalFlickNoteCount: 0,
  });
}

function batch(
  batchIndex: number,
  entries: readonly ReturnType<typeof entry>[],
): OneFrameJudgementBatch {
  const representative = entries.reduce((left, right) =>
    right.rawResult > left.rawResult ? right : left);
  return Object.freeze({
    batchIndex,
    entries: Object.freeze([...entries]),
    entryCount: entries.length,
    addCombo: entries.reduce((sum, value) => sum + value.addCombo, 0),
    rawResult: representative.rawResult,
    adjustedResult: representative.adjustedResult,
    judgeTiming: representative.judgeTiming,
  });
}

function requireOk<T>(result: { readonly status: "ok"; readonly value: T } | {
  readonly status: "evidence-required";
  readonly capability: string;
}): T {
  if (result.status !== "ok") throw new Error(result.capability);
  return result.value;
}
