import { convertResultDictionary } from "../engine/chart/batchConversion";
import { NoteDataBMSBuilder } from "../engine/chart/bmsBuilder";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import { setupLongAndSlideNoteGraphs } from "../engine/chart/noteGraph";
import {
  ButtonType,
  GameNoteAdditionalType,
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

function build(
  lines: readonly string[],
  setupGraphs = false,
): {
  readonly builder: NoteDataBMSBuilder;
  readonly batches: readonly NoteBatchInformation[];
} {
  const builder = new NoteDataBMSBuilder();
  const initialized = builder.initialize(`${lines.join("\n")}\n`, false);
  assert(initialized.status === "ok", "synthetic BMS must initialize");
  const batches = convertResultDictionary(builder.resultDictionary, {
    bpmChangeValueList: builder.bpmChangeValueList,
    isMultiRange: builder.isMultiRangeNotes,
  });
  if (setupGraphs) {
    setupLongAndSlideNoteGraphs(batches, builder.isMultiRangeNotes);
  }
  return { builder, batches };
}

function notes(batches: readonly NoteBatchInformation[]): readonly NoteInformation[] {
  return batches.flatMap((batch) => batch.informationList);
}

test("CC03 与 CC08 生成原作 type 3 记录并保持值、字符串和顺序", () => {
  const { builder, batches } = build([
    "#BPM 120.00",
    "#BPM01 175.50",
    "#00003:78",
    "#00108:0001",
  ]);
  assertEqual(builder.startBpm, 120, "start BPM");
  assertEqual(builder.startBpmString, "120.00", "start BPM string");
  assertDeepEqual(builder.bpmChangeRealValueList, [120, 175.5], "BPM values");
  assertDeepEqual(builder.bpmChangeStringRealValueList, ["120", "175.50"], "BPM strings");
  const commands = notes(batches);
  assertDeepEqual(commands.map((note) => note.absolutePos), [0, 288], "command positions");
  assertDeepEqual(commands.map((note) => note.ccNum), [3, 8], "command CC order");
  assert(commands.every((note) => note.buttonType === ButtonType.None), "command buttons");
  assert(
    commands.every((note) => note.gameNoteType === GameNoteType.LongEndFlick),
    "command game types",
  );
  assert(
    commands.every(
      (note) => note.gameNoteAdditionalType === GameNoteAdditionalType.None,
    ),
    "command additional types",
  );
  assertDeepEqual(commands.map((note) => note.bpm), [120, 175.5], "command BPM values");
  assertDeepEqual(commands.map((note) => note.bpmString), ["120", "175.50"], "command strings");
});

test("Skill音符保留独立附加类型而Fever标记归一", () => {
  const { batches } = build([
    "#BPM 120",
    "#WAV01 skill.wav",
    "#WAV02 fever_note.wav",
    "#00011:01",
    "#00112:02",
    "#00213:01",
  ]);
  const constructed = notes(batches);
  assertDeepEqual(
    constructed.map((note) => note.gameNoteAdditionalType),
    [GameNoteAdditionalType.Skill, GameNoteAdditionalType.None, GameNoteAdditionalType.Skill],
    "Skill-note presentation remains distinct while Fever gameplay is removed",
  );
});

test("Long终端保留Skill音符但归一Fever标记", () => {
  for (const [terminalName, expected] of [
    ["skill.wav", GameNoteAdditionalType.Skill],
    ["fever_note.wav", GameNoteAdditionalType.None],
  ] as const) {
    const converted = build([
      "#BPM 120",
      "#WAV01 normal.wav",
      `#WAV02 ${terminalName}`,
      "#00051:01",
      "#00151:02",
    ], true);
    const root = notes(converted.batches).find((note) => note.buttonType !== ButtonType.None);
    assert(root !== undefined, "Long root");
    assertEqual(
      root.gameNoteAdditionalTypeLongNoteEnd,
      expected,
      "terminal presentation marker follows the reduced gameplay boundary",
    );
  }
});

test("非法 BPM command 继续失败关闭", () => {
  const invalidHex = new NoteDataBMSBuilder().initialize("#BPM 120\n#00003:GG\n", false);
  assertEqual(invalidHex.status, "integrity-failure", "invalid hexadecimal status");
  const nonFinite = new NoteDataBMSBuilder().initialize("#BPMXX Infinity\n", false);
  assertEqual(nonFinite.status, "integrity-failure", "non-finite BPM status");
  const missingKey = new NoteDataBMSBuilder().initialize("#BPM 120\n#00008:01\n", false);
  assertEqual(missingKey.status, "integrity-failure", "missing BPM key status");
});

test("公开入口完成 C09 后返回命令附加数据", () => {
  const result = createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#WAV01 skill.wav\n#00011:01\n",
  });
  assert(result.status === "ok", "C09 command construction status");
  assertEqual(result.value.noteBatches.length, 1, "command batch count");
});

test("命令模式按原作跳过 Bezier 转换并直接解析输入", () => {
  const musicScoreData = [
    "#BPM 120",
    "#WAV01 cont_force_front_a.wav",
    "#00011:01",
    "",
  ].join("\n");
  const result = createNoteBatchInformationList({
    musicScoreData,
    isCommand: true,
  });
  assert(result.status === "ok", "command input skips Bezier and completes C09");
  const nonCommand = createNoteBatchInformationList({ musicScoreData });
  assert(nonCommand.status === "integrity-failure", "non-command malformed Bezier fails");
  assertEqual(
    nonCommand.capability,
    "chart-construction.invalid-bezier-score",
    "non-command Bezier boundary",
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
  throw new Error(`${failures} chart command data test(s) failed`);
}

console.log(`chart command data tests passed: ${tests.length}`);
