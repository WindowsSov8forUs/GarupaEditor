import {
  createNoteBatchInformationList,
  MusicScoreHeaderParser,
  NoteBatchInformationListFactory,
} from "../../../engine/chart/construction";
import { freezeChartConstructionResult } from "../../../engine/chart/immutability";
import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteAdditionalType,
  GameNoteType,
  VirtualLaneDirection,
  type ChartConstructionResult,
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
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function noteInformation(
  overrides: Partial<NoteInformation> = {},
): NoteInformation {
  return {
    index: 0,
    isResult: false,
    isSlideNoteHead: false,
    isMultiRangeCombine: false,
    isInvisible: false,
    buttonType: ButtonType.None,
    buttonTypes: [],
    buttonTypesArray: [],
    gameNoteType: GameNoteType.None,
    fireNoteType: FrontNoteType.None,
    afterNoteType: AfterNoteType.None,
    halfButtonIndex: 0,
    soundValue: "",
    ccNum: 0,
    barIndex: 0,
    numerator: 0,
    denominator: 1,
    absolutePos: 0,
    afterNoteAbsolutePos: -1,
    shortRhythmUnder8beat: false,
    afterNoteShortRhythmUnder8beat: false,
    bpm: 0,
    bpmString: "",
    storedAbsolutePos: 0,
    slideNoteList: [],
    soundValueList: [],
    gameNoteAdditionalType: GameNoteAdditionalType.None,
    gameNoteAdditionalTypeLongNoteEnd: GameNoteAdditionalType.None,
    virtualLaneDirection: VirtualLaneDirection.None,
    virtualLaneDistance: 0,
    ...overrides,
  };
}

test("谱面构造枚举保持 IL2CPP 确认值", () => {
  assertEqual(ButtonType.None, -1, "ButtonType.None");
  assertEqual(ButtonType.Button_15_BMS_2P_SC, 15, "last BMS button");
  assertEqual(GameNoteType.Normal, 0, "GameNoteType.Normal");
  assertEqual(GameNoteType.SlideAddDirectionalFlick, 25, "last GameNoteType");
  assertEqual(FrontNoteType.MultipleDirectionalFlick, 6, "multiple front type");
  assertEqual(AfterNoteType.SlideMultipleDirectionalFlickRight, 12, "last AfterNoteType");
  assertEqual(GameNoteAdditionalType.LaneChange, 4, "lane-change additional type");
  assertEqual(VirtualLaneDirection.Right, 2, "right virtual lane");
});

test("每次构造调用建立独立上下文并返回独立 C09 结果", () => {
  const firstFactory = new NoteBatchInformationListFactory();
  const secondFactory = new NoteBatchInformationListFactory();
  const firstParser = new MusicScoreHeaderParser();
  const secondParser = new MusicScoreHeaderParser();

  assert(firstFactory !== secondFactory, "factory instances must not be shared");
  assert(firstParser !== secondParser, "header parser instances must not be shared");
  assert(firstParser.wavFileNames !== secondParser.wavFileNames, "WAV maps must not be shared");

  const first = createNoteBatchInformationList({ musicScoreData: "" });
  const second = createNoteBatchInformationList({
    musicScoreData: "",
    isCommand: false,
  });
  assert(first !== second, "result objects must not be shared");
  assert(first.status === "ok", "default C09 construction status");
  assert(second.status === "ok", "explicit default C09 construction status");
  assert(first.value !== second.value, "construction values must not be shared");
});

test("构造结果深度冻结并保留共享节点身份", () => {
  const terminal = noteInformation({
    index: 1,
    buttonType: ButtonType.Button_02_BMS_1P_02,
    buttonTypes: [ButtonType.Button_02_BMS_1P_02],
    buttonTypesArray: [ButtonType.Button_02_BMS_1P_02],
    gameNoteType: GameNoteType.SlideEndA,
    absolutePos: 192,
  });
  const root = noteInformation({
    isSlideNoteHead: true,
    buttonType: ButtonType.Button_01_BMS_1P_01,
    buttonTypes: [ButtonType.Button_01_BMS_1P_01],
    buttonTypesArray: [ButtonType.Button_01_BMS_1P_01],
    gameNoteType: GameNoteType.SlideA,
    fireNoteType: FrontNoteType.SlideA,
    afterNoteType: AfterNoteType.SlideEnd,
    afterNoteAbsolutePos: 192,
    slideNoteList: [terminal],
  });
  const result: ChartConstructionResult = {
    noteBatches: [
      {
        barIndex: 0,
        numerator: 0,
        denominator: 1,
        absolutePos: 0,
        informationList: [root, terminal],
      },
    ],
    startBpm: 180,
    startBpmString: "180",
    bpmChangeRealValueList: [],
    bpmChangeStringRealValueList: [],
    isMultiRangeNotes: false,
    habahiroChangeAbsolutePos: -1,
  };

  const frozen = freezeChartConstructionResult(result);
  const frozenRoot = frozen.noteBatches[0]?.informationList[0];
  const frozenTerminal = frozen.noteBatches[0]?.informationList[1];
  assert(frozenRoot !== undefined && frozenTerminal !== undefined, "frozen graph must remain complete");
  assertEqual(frozenRoot.slideNoteList[0], frozenTerminal, "shared terminal identity");
  assert(Object.isFrozen(frozen), "result must be frozen");
  assert(Object.isFrozen(frozen.noteBatches), "batch list must be frozen");
  assert(Object.isFrozen(frozen.noteBatches[0]), "batch must be frozen");
  assert(Object.isFrozen(frozenRoot), "root must be frozen");
  assert(Object.isFrozen(frozenRoot.slideNoteList), "slide list must be frozen");
  assert(Object.isFrozen(frozenTerminal.buttonTypesArray), "baked buttons must be frozen");
});

test("原作形状记录不含夹具与同步投影字段", () => {
  const keys = new Set(Object.keys(noteInformation()));
  for (const forbidden of [
    "fixtureId",
    "sourceOrder",
    "syncConnectionSpec",
    "syncConnections",
  ]) {
    assert(!keys.has(forbidden), `forbidden adapter field: ${forbidden}`);
  }
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
  throw new Error(`${failures} chart-construction boundary test(s) failed`);
}

console.log(`chart-construction boundary tests passed: ${tests.length}`);
