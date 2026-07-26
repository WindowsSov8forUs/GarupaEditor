import { createNoteInformation } from "../engine/chart/batchConversion";
import type { BMSNoteMaterial } from "../engine/chart/bmsBuilder";
import { createNoteBatchInformationList } from "../engine/chart/construction";
import {
  finalizeNoteBatches,
  NOTE_FINALIZE_PASSES,
  shouldDeleteUnsupportedBgmNote,
  shouldRemoveLongPlaceholder,
  shouldRemoveMultiRangeSupportRecord,
  shouldRemoveSlideSupportRecord,
} from "../engine/chart/finalize";
import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  VirtualLaneDirection,
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

const baseMaterial: BMSNoteMaterial = {
  barIndex: 0,
  numerator_: 0,
  denominator_: 1,
  playMusicList_: [],
  fireNoteType_: FrontNoteType.Normal,
  gameNoteType_: GameNoteType.Normal,
  gameNoteAdditionalType_: GameNoteAdditionalType.None,
  soundValue: "normal",
  ccNum: 11,
  Bpm: 0,
  BpmString: "",
  IsInvisible: false,
  soundValueList: ["normal"],
  VirtualLaneDirection: VirtualLaneDirection.None,
  VirtualLaneDistance: 0,
};

function note(overrides: Partial<NoteInformation> = {}): NoteInformation {
  return {
    ...createNoteInformation(ButtonType.Button_01_BMS_1P_01, baseMaterial),
    ...overrides,
  };
}

test("终结过滤固定执行四个原作谓词顺序", () => {
  assertDeepEqual(
    NOTE_FINALIZE_PASSES.map((pass) => pass.name),
    ["long-placeholder", "unsupported-bgm", "slide-support", "multi-range-support"],
    "finalize pass order",
  );
});

test("第一遍移除 button -1 的 Long、flick 终端与左右 directional Long", () => {
  assert(shouldRemoveLongPlaceholder(note({
    gameNoteType: GameNoteType.Long,
    buttonType: ButtonType.None,
  })), "Long placeholder");
  assert(shouldRemoveLongPlaceholder(note({
    gameNoteType: GameNoteType.LongDirectionalFlickLeft,
    buttonType: ButtonType.None,
  })), "left directional Long placeholder");
  assert(shouldRemoveLongPlaceholder(note({
    gameNoteType: GameNoteType.LongDirectionalFlickRight,
    buttonType: ButtonType.None,
  })), "right directional Long placeholder");
  assert(shouldRemoveLongPlaceholder(note({
    gameNoteType: GameNoteType.LongEndFlick,
    buttonType: ButtonType.None,
    ccNum: 11,
  })), "Long flick terminal placeholder");
  assert(!shouldRemoveLongPlaceholder(note({
    gameNoteType: GameNoteType.LongEndFlick,
    buttonType: ButtonType.None,
    ccNum: 3,
  })), "BPM-compatible type 3 survives first pass");
});

test("第二遍保留声音、追加 button 与终端例外并删除空占位", () => {
  const empty = note({
    buttonType: ButtonType.None,
    buttonTypes: [ButtonType.None],
    soundValue: "",
    soundValueList: [],
  });
  assert(shouldDeleteUnsupportedBgmNote(empty), "empty unsupported record");
  assert(shouldDeleteUnsupportedBgmNote({
    ...empty,
    buttonType: ButtonType.Button_01_BMS_1P_01,
    buttonTypes: [ButtonType.Button_01_BMS_1P_01],
    soundValueList: [""],
  }), "orphaned control WAV record");
  assert(!shouldDeleteUnsupportedBgmNote({
    ...empty,
    soundValueList: ["bgm"],
  }), "sound value survives");
  assert(!shouldDeleteUnsupportedBgmNote({
    ...empty,
    buttonTypes: [ButtonType.None, ButtonType.Button_01_BMS_1P_01],
  }), "appended button survives");
  assert(!shouldDeleteUnsupportedBgmNote({
    ...empty,
    afterNoteType: AfterNoteType.DirectionalFlickRight,
  }), "directional right exception");
  assert(!shouldDeleteUnsupportedBgmNote({
    ...empty,
    afterNoteType: AfterNoteType.SlideFlickEnd,
  }), "slide flick exception");
  assert(!shouldDeleteUnsupportedBgmNote({
    ...empty,
    gameNoteType: GameNoteType.LongEndFlick,
    ccNum: 8,
  }), "BPM-compatible type 3 exception");
});

test("第三遍仅移除非 head Slide 家族支撑记录", () => {
  assert(shouldRemoveSlideSupportRecord(note({
    gameNoteType: GameNoteType.SlideA,
    isSlideNoteHead: false,
  })), "Slide A support");
  assert(shouldRemoveSlideSupportRecord(note({
    gameNoteType: GameNoteType.SlideBDirectionalFlickRight,
    isSlideNoteHead: false,
  })), "directional Slide support");
  assert(!shouldRemoveSlideSupportRecord(note({
    gameNoteType: GameNoteType.SlideB,
    isSlideNoteHead: true,
  })), "Slide head survives");
});

test("第四遍仅移除多范围覆盖成员", () => {
  assert(shouldRemoveMultiRangeSupportRecord(note({
    isMultiRangeCombine: true,
  })), "multi-range support");
  assert(!shouldRemoveMultiRangeSupportRecord(note()), "ordinary record survives");
});

test("四遍过滤保持存活子序列并逆序删除空批次", () => {
  const survivingA = note({ index: 1 });
  const removedLong = note({
    index: 2,
    gameNoteType: GameNoteType.Long,
    buttonType: ButtonType.None,
  });
  const survivingB = note({ index: 3, gameNoteType: GameNoteType.Flick });
  const removedSlide = note({
    index: 4,
    gameNoteType: GameNoteType.SlideA,
    isSlideNoteHead: false,
  });
  const removedWide = note({ index: 5, isMultiRangeCombine: true });
  const batches: NoteBatchInformation[] = [
    {
      barIndex: 0,
      numerator: 0,
      denominator: 1,
      absolutePos: 0,
      informationList: [survivingA, removedLong, survivingB, removedSlide, removedWide],
    },
    {
      barIndex: 1,
      numerator: 0,
      denominator: 1,
      absolutePos: 192,
      informationList: [note({
        gameNoteType: GameNoteType.LongDirectionalFlickLeft,
        buttonType: ButtonType.None,
      })],
    },
  ];
  finalizeNoteBatches(batches);
  assertEqual(batches.length, 1, "empty batch removed");
  assertDeepEqual(
    batches[0]?.informationList.map((record) => record.index),
    [1, 3],
    "surviving subsequence",
  );
  assertEqual(batches[0]?.informationList[0], survivingA, "first identity");
  assertEqual(batches[0]?.informationList[1], survivingB, "second identity");
});

test("公开入口完成 C09 后返回深度冻结构造结果", () => {
  const result = createNoteBatchInformationList({
    musicScoreData: "#BPM 120.00\n#WAV01 normal.wav\n#00011:01\n",
  });
  assert(result.status === "ok", "C09 construction result");
  assertEqual(result.value.startBpm, 120, "start BPM");
  assertEqual(result.value.startBpmString, "120.00", "start BPM string");
  assertEqual(result.value.noteBatches.length, 1, "batch count");
  assert(Object.isFrozen(result.value), "result frozen");
  assert(Object.isFrozen(result.value.noteBatches), "batch list frozen");
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
  throw new Error(`${failures} chart finalize test(s) failed`);
}

console.log(`chart finalize tests passed: ${tests.length}`);
