import { convertResultDictionary } from "../engine/chart/batchConversion";
import { NoteDataBMSBuilder } from "../engine/chart/bmsBuilder";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { ChartConstructionEvidence } from "../engine/chart/evidence";
import { AfterNoteType, GameNoteAdditionalType } from "../engine/chart/types";

interface TestCase {
  readonly name: string;
  readonly run: () => void;
}

const tests: TestCase[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

function build(lines: readonly string[]) {
  const builder = new NoteDataBMSBuilder();
  const initialized = builder.initialize(`${lines.join("\n")}\n`, false);
  assert(initialized.status === "ok", "synthetic BMS must initialize");
  return {
    builder,
    batches: convertResultDictionary(builder.resultDictionary),
  };
}

test("跨 button 同位置保持首次出现组顺序", () => {
  const { batches } = build([
    "#BPM 120",
    "#WAV01 normal.wav",
    "#WAV02 flick.wav",
    "#00013:01",
    "#00011:02",
  ]);
  assertEqual(batches.length, 1, "equal positions share one batch");
  assertDeepEqual(
    batches[0]?.informationList.map((note) => note.buttonType),
    [3, 1],
    "first-occurrence button order",
  );
});

test("同 button 同位置只生成一个 Note 并保留合并声音", () => {
  const { batches } = build([
    "#BPM 120",
    "#WAV01 bgm_a.wav",
    "#WAV02 bgm_b.wav",
    "#00001:01",
    "#00001:02",
  ]);
  const notes = batches[0]?.informationList;
  assertEqual(notes?.length, 1, "merged material creates one Note");
  assertDeepEqual(notes?.[0]?.soundValueList, ["bgm_a", "bgm_b"], "sound values");
});

test("批次按 absolutePos 二分插入且不重排同批 Note", () => {
  const { batches } = build([
    "#BPM 120",
    "#WAV01 normal.wav",
    "#00013:0001",
    "#00011:0100",
    "#00012:0001",
  ]);
  assertDeepEqual(batches.map((batch) => batch.absolutePos), [0, 96], "batch positions");
  assertDeepEqual(
    batches[1]?.informationList.map((note) => note.buttonType),
    [3, 2],
    "equal-position Note order",
  );
});

test("基础 NoteInformation 逐字段继承 material 且无旁路顺序字段", () => {
  const { batches } = build([
    "#BPM 120",
    "#WAV01 slide_a_LS27.wav",
    "#00031:0001",
  ]);
  const note = batches[0]?.informationList[0];
  assert(note !== undefined, "converted Note must exist");
  assertEqual(note.absolutePos, 96, "absolute position");
  assertEqual(note.storedAbsolutePos, 96, "stored position");
  assertEqual(note.shortRhythmUnder8beat, false, "eighth-beat flag");
  assertEqual(note.afterNoteType, AfterNoteType.None, "unpaired after type");
  assertEqual(note.afterNoteAbsolutePos, -1, "unpaired after position");
  assertEqual(note.halfButtonIndex, -1, "single-button half index");
  assertEqual(note.gameNoteAdditionalType, GameNoteAdditionalType.None, "additional type");
  assertEqual(note.virtualLaneDirection, 1, "virtual lane direction");
  assertEqual(note.virtualLaneDistance, 27, "virtual lane distance");
  assert(
    !Object.prototype.hasOwnProperty.call(note, "sourceOrder"),
    "sourceOrder must not enter original record",
  );
});

test("重复构造产生完全一致的批次和 informationList 顺序", () => {
  const lines = [
    "#BPM 120",
    "#WAV01 normal.wav",
    "#WAV02 flick.wav",
    "#00013:0102",
    "#00011:0201",
  ];
  const first = build(lines).batches;
  const second = build(lines).batches;
  assertDeepEqual(first, second, "deterministic batches");
});

test("公开入口在当前 C07 多范围合并边界失败关闭", () => {
  const result = createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#WAV01 normal.wav\n#00011:01\n",
  });
  assert(result.status === "evidence-required", "C07 must remain fail-closed");
  assertEqual(result.capability, "chart-construction.multi-range-combine", "failure boundary");
  assert(
    result.requiredEvidence.includes(ChartConstructionEvidence.E09),
    "failure must route to frozen object-graph evidence",
  );
});

let failures = 0;
for (const testCase of tests) {
  try {
    testCase.run();
    console.log(`ok - ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${testCase.name}`);
    console.error(error);
  }
}

if (failures > 0) {
  throw new Error(`${failures} chart batch conversion test(s) failed`);
}

console.log(`chart batch conversion tests passed: ${tests.length}`);
