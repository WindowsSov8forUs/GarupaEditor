import { convertResultDictionary } from "../engine/chart/batchConversion";
import { NoteDataBMSBuilder } from "../engine/chart/bmsBuilder";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { ChartConstructionEvidence } from "../engine/chart/evidence";
import { setupLongAndSlideNoteGraphs } from "../engine/chart/noteGraph";
import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteType,
  type NoteBatchInformation,
  type NoteInformation,
} from "../engine/chart/types";

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

function build(lines: readonly string[]): readonly NoteBatchInformation[] {
  const builder = new NoteDataBMSBuilder();
  const initialized = builder.initialize(`${lines.join("\n")}\n`, false);
  assert(initialized.status === "ok", "synthetic BMS must initialize");
  const batches = convertResultDictionary(builder.resultDictionary);
  setupLongAndSlideNoteGraphs(batches, builder.isMultiRangeNotes);
  return batches;
}

function notes(batches: readonly NoteBatchInformation[]): readonly NoteInformation[] {
  return batches.flatMap((batch) => batch.informationList);
}

test("Long 普通、Flick 与左右多方向终端写回根字段", () => {
  const cases = [
    ["normal.wav", AfterNoteType.Normal],
    ["flick.wav", AfterNoteType.Flick],
    ["long_end_dir_flick_l.wav", AfterNoteType.DirectionalFlickLeft],
    ["long_end_dir_flick_r.wav", AfterNoteType.DirectionalFlickRight],
  ] as const;
  for (const [terminalWav, expectedAfterType] of cases) {
    const converted = notes(build([
      "#BPM 120",
      "#WAV01 normal.wav",
      `#WAV02 ${terminalWav}`,
      "#00051:01",
      "#00151:02",
    ]));
    const root = converted.find((note) => note.gameNoteType === GameNoteType.Long);
    const terminal = converted.find((note) => note.absolutePos === 192);
    assert(root !== undefined && terminal !== undefined, "Long pair must exist");
    assertEqual(root.afterNoteType, expectedAfterType, "Long terminal gesture");
    assertEqual(root.afterNoteAbsolutePos, 192, "Long terminal position");
    assertEqual(terminal.buttonType, ButtonType.None, "terminal support button");
  }
});

test("Slide A/B 建立 head、有序中间节点和终端共享身份", () => {
  const converted = notes(build([
    "#BPM 120",
    "#WAV01 slide_a.wav",
    "#WAV02 slide_end_flick_a.wav",
    "#WAV03 slide_b.wav",
    "#WAV04 slide_end_dir_flick_r_b.wav",
    "#00011:0100",
    "#00031:0001",
    "#00111:02",
    "#00212:0300",
    "#00232:0003",
    "#00312:04",
  ]));
  const roots = converted.filter((note) => note.isSlideNoteHead);
  assertEqual(roots.length, 2, "Slide root count");
  const slideA = roots.find((note) => note.gameNoteType === GameNoteType.SlideA);
  const slideB = roots.find((note) => note.gameNoteType === GameNoteType.SlideB);
  assert(slideA !== undefined && slideB !== undefined, "both Slide families must exist");
  assertDeepEqual(slideA.slideNoteList.map((note) => note.absolutePos), [96, 192], "Slide A order");
  assertEqual(slideA.slideNoteList[0]?.isInvisible, true, "hidden intermediate");
  assertEqual(slideA.afterNoteType, AfterNoteType.SlideFlickEnd, "Slide A terminal");
  assertDeepEqual(slideB.slideNoteList.map((note) => note.absolutePos), [480, 576], "Slide B order");
  assertEqual(slideB.afterNoteType, AfterNoteType.SlideDirectionalFlickEndRight, "Slide B terminal");
  const terminal = slideA.slideNoteList[slideA.slideNoteList.length - 1];
  assert(
    converted.includes(terminal!),
    "slideNoteList terminal must be the same object retained in the batch graph",
  );
});

test("HABAHIRO 同位置 Slide 支撑 lane 合并到图节点且保留重复成员", () => {
  const converted = notes(build([
    "#HABAHIRO",
    "#BPM 120",
    "#WAV01 slide_a.wav",
    "#WAV02 slide_end_a.wav",
    "#00011:01",
    "#00012:01",
    "#00111:02",
  ]));
  const root = converted.find((note) => note.isSlideNoteHead);
  const duplicate = converted.find((note) => note.ccNum === 12);
  assert(root !== undefined && duplicate !== undefined, "multi-range Slide records");
  assertDeepEqual(root.buttonTypesArray, [0, 1], "baked support buttons");
  assertEqual(root.buttonType, 0, "lower center button for even width");
  assertEqual(root.halfButtonIndex, 0, "even-width half button index");
  assertEqual(duplicate.isMultiRangeCombine, true, "duplicate support member marker");
  assertEqual(root.slideNoteList.length, 1, "terminal remains one graph node");
});

test("Long 多方向追加节点归属根终端并转换为左侧追加类型", () => {
  const converted = notes(build([
    "#BPM 120",
    "#WAV01 normal.wav",
    "#WAV02 long_end_dir_flick_l.wav",
    "#WAV03 add_long_dir_flick.wav",
    "#00052:01",
    "#00152:02",
    "#00151:03",
  ]));
  const root = converted.find((note) => note.gameNoteType === GameNoteType.Long);
  const addition = converted.find(
    (note) => note.gameNoteType === GameNoteType.LongDirectionalFlickLeftAdd,
  );
  assert(root !== undefined && addition !== undefined, "Long multiple-direction graph");
  assertEqual(root.afterNoteType, AfterNoteType.MultipleDirectionalFlickLeft, "root after type");
  assertEqual(addition.afterNoteType, AfterNoteType.MultipleDirectionalFlickLeft, "addition after type");
  assertEqual(addition.fireNoteType, FrontNoteType.LongMultipleDirectionalFlickAdd, "addition fire type");
});

test("Slide 多方向追加节点归属 A 族终端", () => {
  const converted = notes(build([
    "#BPM 120",
    "#WAV01 slide_a.wav",
    "#WAV02 slide_end_dir_flick_l_a.wav",
    "#WAV03 add_slide_dir_flick.wav",
    "#00013:01",
    "#00113:02",
    "#00112:03",
  ]));
  const root = converted.find((note) => note.isSlideNoteHead);
  const addition = converted.find(
    (note) => note.gameNoteType === GameNoteType.SlideADirectionalFlickLeftAdd,
  );
  assert(root !== undefined && addition !== undefined, "Slide multiple-direction graph");
  assertEqual(root.afterNoteType, AfterNoteType.SlideMultipleDirectionalFlickLeft, "root after type");
  assertEqual(addition.fireNoteType, FrontNoteType.SlideAMultipleDirectionalFlickAdd, "addition fire type");
});

test("公开入口完成 C07 后在 C08 命令数据边界失败关闭", () => {
  const result = createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#WAV01 normal.wav\n#00011:01\n",
  });
  assert(result.status === "evidence-required", "C08 must remain fail-closed");
  assertEqual(result.capability, "chart-construction.command-data", "failure boundary");
  assert(
    result.requiredEvidence.includes(ChartConstructionEvidence.E09),
    "failure must route to frozen graph evidence",
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
  throw new Error(`${failures} chart note graph test(s) failed`);
}

console.log(`chart note graph tests passed: ${tests.length}`);
