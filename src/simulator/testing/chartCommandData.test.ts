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

test("CC03 与 CC08 生成原作 BpmChange 记录并保持值、字符串和顺序", () => {
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
  assert(commands.every((note) => note.gameNoteType === GameNoteType.None), "command game types");
  assert(
    commands.every(
      (note) => note.gameNoteAdditionalType === GameNoteAdditionalType.BpmChange,
    ),
    "command additional types",
  );
  assertDeepEqual(commands.map((note) => note.bpm), [120, 175.5], "command BPM values");
  assertDeepEqual(commands.map((note) => note.bpmString), ["120", "175.50"], "command strings");
});

test("普通谱面 Skill 按构造源序从一开始连续分配索引", () => {
  const { batches } = build([
    "#BPM 120",
    "#WAV01 skill.wav",
    "#WAV02 fever_note.wav",
    "#00011:01",
    "#00112:02",
    "#00213:01",
  ]);
  const constructed = notes(batches);
  assertDeepEqual(constructed.map((note) => note.skillNoteIndex), [1, 0, 2], "skill indices");
  assertDeepEqual(
    constructed.map((note) => note.gameNoteAdditionalType),
    [GameNoteAdditionalType.Skill, GameNoteAdditionalType.Fever, GameNoteAdditionalType.Skill],
    "additional types",
  );
});

test("HABAHIRO 同绝对位置 Skill 来源只分配一次索引", () => {
  const { batches } = build([
    "#HABAHIRO",
    "#BPM 120",
    "#WAV01 skill.wav",
    "#00011:01",
    "#00012:01",
    "#00113:01",
  ]);
  const constructed = notes(batches);
  assertDeepEqual(constructed.map((note) => note.skillNoteIndex), [1, 0, 2], "multi-range indices");
});

test("Long 终端传播 Skill 与 Fever 附加类型且仅 Skill 复制索引", () => {
  const skill = build([
    "#BPM 120",
    "#WAV01 normal.wav",
    "#WAV02 skill.wav",
    "#00051:01",
    "#00151:02",
  ], true);
  const skillRoot = notes(skill.batches).find((note) => note.buttonType !== ButtonType.None);
  assert(skillRoot !== undefined, "skill Long root");
  assertEqual(
    skillRoot.gameNoteAdditionalTypeLongNoteEnd,
    GameNoteAdditionalType.Skill,
    "skill terminal additional type",
  );
  assertEqual(skillRoot.skillAfterNoteIndex, 1, "skill terminal index");

  const fever = build([
    "#BPM 120",
    "#WAV01 normal.wav",
    "#WAV02 fever_note.wav",
    "#00051:01",
    "#00151:02",
  ], true);
  const feverRoot = notes(fever.batches).find((note) => note.buttonType !== ButtonType.None);
  assert(feverRoot !== undefined, "fever Long root");
  assertEqual(
    feverRoot.gameNoteAdditionalTypeLongNoteEnd,
    GameNoteAdditionalType.Fever,
    "fever terminal additional type",
  );
  assertEqual(feverRoot.skillAfterNoteIndex, 0, "fever terminal index");
});

test("非法 BPM command 继续失败关闭", () => {
  const invalidHex = new NoteDataBMSBuilder().initialize("#BPM 120\n#00003:GG\n", false);
  assertEqual(invalidHex.status, "evidence-required", "invalid hexadecimal status");
  const nonFinite = new NoteDataBMSBuilder().initialize("#BPMXX Infinity\n", false);
  assertEqual(nonFinite.status, "evidence-required", "non-finite BPM status");
  const missingKey = new NoteDataBMSBuilder().initialize("#BPM 120\n#00008:01\n", false);
  assertEqual(missingKey.status, "evidence-required", "missing BPM key status");
});

test("公开入口完成 C08 后在 C09 终结边界失败关闭", () => {
  const result = createNoteBatchInformationList({
    musicScoreData: "#BPM 120\n#WAV01 skill.wav\n#00011:01\n",
  });
  assert(result.status === "evidence-required", "C09 must remain fail-closed");
  assertEqual(result.capability, "chart-construction.finalize", "failure boundary");
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
  assert(result.status === "evidence-required", "command input reaches C09 boundary");
  assertEqual(result.capability, "chart-construction.finalize", "command failure boundary");
  const nonCommand = createNoteBatchInformationList({ musicScoreData });
  assert(nonCommand.status === "evidence-required", "non-command malformed Bezier fails");
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
