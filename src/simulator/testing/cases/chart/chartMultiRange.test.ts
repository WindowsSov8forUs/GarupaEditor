import { convertResultDictionary } from "../../../engine/chart/batchConversion";
import { NoteDataBMSBuilder } from "../../../engine/chart/bmsBuilder";
import {
  combineMultiRangeBatches,
  findHabahiroChangeAbsolutePos,
} from "../../../engine/chart/multiRangeCombine";
import {
  getMultiRangeSourceIdentity,
  registerMultiRangeSources,
} from "../../../engine/chart/multiRangeSources";
import { setupLongAndSlideNoteGraphs } from "../../../engine/chart/noteGraph";
import {
  GameNoteAdditionalType,
  GameNoteType,
  type NoteBatchInformation,
  type NoteInformation,
} from "../../../engine/chart/types";

interface TestCase {
  readonly name: string;
  readonly run: () => void;
}

const tests: TestCase[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

function build(
  lines: readonly string[],
  isCommand = false,
): readonly NoteBatchInformation[] {
  const builder = new NoteDataBMSBuilder();
  const initialized = builder.initialize(`${lines.join("\n")}\n`, isCommand);
  assert(initialized.status === "ok", "synthetic BMS must initialize");
  const batches = convertResultDictionary(builder.resultDictionary);
  registerMultiRangeSources(batches, builder.isMultiRangeNotes);
  setupLongAndSlideNoteGraphs(batches, builder.isMultiRangeNotes);
  combineMultiRangeBatches(batches, builder.isMultiRangeNotes, isCommand);
  return batches;
}

function notes(batches: readonly NoteBatchInformation[]): readonly NoteInformation[] {
  return batches.flatMap((batch) => batch.informationList);
}

test("连续同类型 button 选取中点代表并合并 button、声音与 CC 来源", () => {
  const converted = notes(build([
    "#HABAHIRO",
    "#BPM 120",
    "#WAV01 normal_a.wav",
    "#WAV02 normal_b.wav",
    "#WAV03 normal_c.wav",
    "#00011:01",
    "#00012:02",
    "#00013:03",
  ]));
  const representative = converted.find((note) => note.buttonType === 1);
  assert(representative !== undefined, "center representative must exist");
  assertDeepEqual(representative.buttonTypesArray, [0, 1, 2], "baked buttons");
  assertDeepEqual(
    representative.soundValueList,
    ["normal_b", "normal_a", "normal_c"],
    "nested sound values",
  );
  assertDeepEqual(
    getMultiRangeSourceIdentity(representative).ccNums,
    [11, 12, 13],
    "source CC values",
  );
  assertEqual(representative.isMultiRangeCombine, false, "representative survives");
  assertDeepEqual(
    converted.filter((note) => note !== representative).map((note) => note.isMultiRangeCombine),
    [true, true],
    "covered support markers",
  );
});

test("中点代表按整批 informationList 的 FirstOrDefault 选择", () => {
  const converted = notes(build([
    "#HABAHIRO",
    "#BPM 120",
    "#WAV01 normal.wav",
    "#WAV02 flick.wav",
    "#00012:01",
    "#00032:02",
    "#00033:02",
  ]));
  const firstCenter = converted[0];
  assert(firstCenter !== undefined, "first center candidate");
  assertEqual(firstCenter.gameNoteType, GameNoteType.Normal, "first center type");
  assertDeepEqual(firstCenter.buttonTypesArray, [1, 2], "whole-batch center receives later run");
  assertDeepEqual(
    getMultiRangeSourceIdentity(firstCenter).ccNums,
    [12, 33],
    "whole-batch center source CC values",
  );
});

test("Long 宽谱根与终端分别保留 CC 来源集合", () => {
  const converted = notes(build([
    "#HABAHIRO",
    "#BPM 120",
    "#WAV01 normal.wav",
    "#WAV02 flick.wav",
    "#00051:01",
    "#00052:01",
    "#00053:01",
    "#00151:02",
    "#00152:02",
    "#00153:02",
  ]));
  const representative = converted.find(
    (note) => note.gameNoteType === GameNoteType.Long
      && note.buttonType === 1
      && !note.isMultiRangeCombine,
  );
  assert(representative !== undefined, "wide Long representative");
  const identity = getMultiRangeSourceIdentity(representative);
  assertDeepEqual(identity.ccNums, [51, 52, 53], "Long root CC values");
  assertDeepEqual(identity.afterCcNums, [51, 52, 53], "Long terminal CC values");
});

test("Slide 每个图节点保留独立 CC 来源且不进入一般合并", () => {
  const converted = notes(build([
    "#HABAHIRO",
    "#BPM 120",
    "#WAV01 slide_a.wav",
    "#WAV02 slide_end_a.wav",
    "#00011:01",
    "#00012:01",
    "#00111:02",
    "#00112:02",
  ]));
  const root = converted.find((note) => note.isSlideNoteHead);
  assert(root !== undefined, "wide Slide root");
  assertDeepEqual(getMultiRangeSourceIdentity(root).ccNums, [11, 12], "root CC values");
  const terminal = root.slideNoteList[root.slideNoteList.length - 1];
  assert(terminal !== undefined, "wide Slide terminal");
  assertDeepEqual(getMultiRangeSourceIdentity(terminal).ccNums, [11, 12], "terminal CC values");
  assertEqual(root.isMultiRangeCombine, false, "Slide root remains graph representative");
});

test("命令模式不执行 HABAHIRO 连续范围合并", () => {
  const converted = notes(build([
    "#HABAHIRO",
    "#BPM 120",
    "#WAV01 normal.wav",
    "#00011:01",
    "#00012:01",
  ], true));
  assertDeepEqual(
    converted.map((note) => note.buttonTypesArray),
    [[0], [1]],
    "command buttons remain separate",
  );
  assert(converted.every((note) => !note.isMultiRangeCombine), "command markers remain clear");
});

test("lane-change 记录保留附加类型、绝对位置与来源 CC", () => {
  const batches = build([
    "#HABAHIRO",
    "#BPM 120",
    "#WAV01 lane_change_normal.wav",
    "#00913:01",
  ]);
  const note = notes(batches)[0];
  assert(note !== undefined, "lane-change record");
  assertEqual(note.gameNoteAdditionalType, GameNoteAdditionalType.LaneChange, "additional type");
  assertEqual(findHabahiroChangeAbsolutePos(batches), 1728, "lane-change position");
  assertDeepEqual(getMultiRangeSourceIdentity(note).ccNums, [13], "lane-change CC");
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
  throw new Error(`${failures} chart multi-range test(s) failed`);
}

console.log(`chart multi-range tests passed: ${tests.length}`);
