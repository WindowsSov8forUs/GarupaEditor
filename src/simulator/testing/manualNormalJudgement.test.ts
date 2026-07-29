import {
  ButtonType,
  type ButtonTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
} from "../engine/chart/types";
import { InGameCalculatedData } from "../engine/data/inGameCalculatedData";
import { GameState } from "../engine/data/inGameState";
import { JudgeTiming, NoteResultType } from "../engine/data/manualJudgement";
import { ManualTouchPhase, type ManualInputButtonResolution } from "../engine/data/manualInput";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import {
  GamePlayInputDispatcher,
  InputManager,
} from "../engine/managers/inputBoundaries";
import { InGameMusicScoreController } from "../engine/managers/inGameMusicScoreController";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import { NoteManager, type NoteManagerClock } from "../engine/managers/noteManager";
import { SlideNoteManager } from "../engine/managers/slideNoteManager";
import { chart, noteInformation } from "./firstSliceFixtures";

interface TestCase {
  readonly name: string;
  readonly run: () => void;
}

interface NormalGraph {
  readonly manager: NoteManager;
  readonly input: InputManager;
  readonly dispatcher: GamePlayInputDispatcher;
  readonly oneFrame: InGameOneFrameJudgementController;
}

const tests: TestCase[] = [];
const manualPlayMode = { kind: "manual" } as const;
const touchPosition = Object.freeze({ x: Math.fround(760), y: Math.fround(650) });

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
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  assert(left === right, `${message}: ${left} !== ${right}`);
}

function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  assert(result.status === "ok", `${message}: ${result.status}`);
  return result.value;
}

function requireEvidence<T>(result: SimulatorResult<T>, capability: string): void {
  assert(result.status === "evidence-required", `${capability}: ${result.status}`);
  assertEqual(result.capability, capability, "failure capability");
}

class NormalClock implements NoteManagerClock {
  validateAdvanceSequence(): SimulatorResult<void> {
    return ok(undefined);
  }

  setExecuteFrame(): void {}

  advance(): SimulatorResult<void> {
    return ok(undefined);
  }

  canActivateBatch(): SimulatorResult<boolean> {
    return ok(true);
  }
}

function normalSource(
  id: string,
  index: number,
  buttonType: ButtonTypeValue,
  absolutePosition: number,
): NoteInformation {
  const base = noteInformation(id, index);
  return {
    ...base,
    buttonType,
    buttonTypes: [buttonType],
    buttonTypesArray: [buttonType],
    absolutePos: absolutePosition,
    storedAbsolutePos: absolutePosition,
  };
}

function createNormalGraph(sources: readonly NoteInformation[]): NormalGraph {
  const batch: NoteBatchInformation = {
    barIndex: 0,
    numerator: 0,
    denominator: 192,
    absolutePos: 1,
    informationList: sources,
  };
  const runtimeChart = chart([batch]);
  const music = new InGameMusicScoreController(runtimeChart);
  const oneFrame = new InGameOneFrameJudgementController();
  requireOk(oneFrame.initialize(), "initialize manual OneFrame");
  const manager = new NoteManager(
    [batch],
    new SlideNoteManager(),
    new NormalClock(),
    music,
    0,
    0,
    new InGameCalculatedData(manualPlayMode),
    () => oneFrame.getUsableOneFrameData(),
    () => evidenceRequired("test.auto-live-not-used", ["D05"], "not used"),
    undefined,
    () => oneFrame.createManualJudgementTransaction(),
  );
  requireOk(oneFrame.registerManualJudgementOwner(
    (information) => manager.ownsManualJudgementSource(information),
  ), "register manual judgement owner");
  requireOk(manager.execAwakeEnd(), "setup Normal NoteManager");
  requireOk(manager.execUpdate(0), "activate Normal notes");

  const input = new InputManager(manualPlayMode);
  const dispatcher = new GamePlayInputDispatcher(manager);
  requireOk(input.registerDispatcher(dispatcher), "register Normal dispatcher");
  requireOk(input.initialize(), "initialize Normal input");
  return { manager, input, dispatcher, oneFrame };
}

function resolution(
  graph: NormalGraph,
  buttonType: ButtonTypeValue,
): ManualInputButtonResolution {
  const button = requireOk(
    graph.dispatcher.getButtonForResolver(buttonType),
    "get Normal gameplay button",
  );
  return requireOk(
    graph.input.issueButtonResolution(touchPosition, button),
    "issue Normal button resolution",
  );
}

function began(fingerId: number, buttonResolution: ManualInputButtonResolution) {
  return {
    fingerId,
    phase: ManualTouchPhase.Began,
    position: touchPosition,
    buttonResolution,
  } as const;
}

function commitSingle(graph: NormalGraph, buttonType: ButtonTypeValue): void {
  const cap = resolution(graph, buttonType);
  requireOk(graph.input.prepareOuterFrame({ touches: [began(0, cap)] }),
    "preflight Normal Began");
  assertEqual(graph.oneFrame.snapshot().inUseContainerIds.length, 0,
    "pure preflight reserves no controller slot");
  requireOk(graph.input.execInput(GameState.PlayingSound), "commit Normal Began");
}

test("Normal Perfect提交owner派生OneFrame并即时Deactive", () => {
  const graph = createNormalGraph([
    normalSource("perfect", 0, ButtonType.Button_01_BMS_1P_01, 2),
  ]);
  commitSingle(graph, ButtonType.Button_01_BMS_1P_01);
  assertDeepEqual(graph.manager.snapshot().activeNotePoolObjectIds, [],
    "judged Normal leaves active list");
  const staged = graph.oneFrame.snapshot();
  assertEqual(staged.inUseContainerIds.length, 1, "Normal uses one fixed slot");
  assertDeepEqual(staged.trace.map((entry) => entry.kind), [
    "one-frame.get-usable",
    "one-frame.setup-manual",
  ], "manual commit preserves get-usable then Setup order");
  const batch = requireOk(graph.oneFrame.reflectOneFrameData(), "reflect Perfect");
  assert(batch !== null, "Perfect reflection exists");
  assertDeepEqual(batch.entries, [{
    slot: 0,
    containerId: "one-frame:0",
    noteIndex: 0,
    buttonTypes: [ButtonType.Button_01_BMS_1P_01],
    noteType: 0,
    phase: "head",
    rawResult: NoteResultType.Perfect,
    adjustedResult: NoteResultType.Perfect,
    addCombo: 1,
    absolutePosition: 2,
    judgeTiming: JudgeTiming.None,
  }], "Perfect closed projection");
});

test("Normal Good保留Fast且combo为负一", () => {
  const graph = createNormalGraph([
    normalSource("good", 1, ButtonType.Button_02_BMS_1P_02, 10),
  ]);
  commitSingle(graph, ButtonType.Button_02_BMS_1P_02);
  const batch = requireOk(graph.oneFrame.reflectOneFrameData(), "reflect Good");
  assert(batch !== null, "Good reflection exists");
  const entry = batch.entries[0];
  assert(entry !== undefined, "Good entry exists");
  assertEqual(entry.rawResult, NoteResultType.Good, "Good raw result");
  assertEqual(entry.adjustedResult, NoteResultType.Good, "no-skill adjusted identity");
  assertEqual(entry.judgeTiming, JudgeTiming.Fast, "Good retains Fast");
  assertEqual(entry.addCombo, -1, "Good breaks combo");
  assertEqual(batch.rawResult, NoteResultType.Good, "single manual aggregate raw");
  assertEqual(batch.judgeTiming, JudgeTiming.Fast, "single manual aggregate timing");
});

test("Normal None只保留button owner且不绑定note或OneFrame", () => {
  const graph = createNormalGraph([
    normalSource("none", 2, ButtonType.Button_03_BMS_1P_03, 13),
  ]);
  const cap = resolution(graph, ButtonType.Button_03_BMS_1P_03);
  requireOk(graph.input.prepareOuterFrame({ touches: [began(0, cap)] }),
    "preflight Normal None");
  requireOk(graph.input.execInput(GameState.PlayingSound), "commit Normal None");
  assertEqual(graph.manager.snapshot().activeNotePoolObjectIds.length, 1,
    "None leaves Normal active");
  assertEqual(graph.oneFrame.snapshot().inUseContainerIds.length, 0,
    "None stages no OneFrame");
  assertDeepEqual(graph.dispatcher.snapshot().buttonWithFingerId.slice(0, 1), [3],
    "Began resolver button remains finger owner");
  assertEqual(graph.dispatcher.snapshot().buttons[3]?.touchOwners.length, 0,
    "None does not bind button touch-note owner");
});

test("同帧第二manual judgement在全域commit前失败关闭", () => {
  const graph = createNormalGraph([
    normalSource("first", 3, ButtonType.Button_01_BMS_1P_01, 2),
    normalSource("second", 4, ButtonType.Button_02_BMS_1P_02, 2),
  ]);
  const first = resolution(graph, ButtonType.Button_01_BMS_1P_01);
  const second = resolution(graph, ButtonType.Button_02_BMS_1P_02);
  const inputBefore = graph.input.snapshot();
  const managerBefore = graph.manager.snapshot();
  requireEvidence(graph.input.prepareOuterFrame({
    touches: [began(0, first), began(1, second)],
  }), "one-frame.multiple-manual-judgements-unimplemented");
  assertDeepEqual(graph.input.snapshot(), inputBefore,
    "failed second judgement consumes no resolution");
  assertDeepEqual(graph.manager.snapshot(), managerBefore,
    "failed second judgement writes no note state");
  assertDeepEqual(graph.dispatcher.snapshot().buttonWithFingerId.slice(0, 2), [null, null],
    "failed second judgement writes no finger owner");
  assertEqual(graph.oneFrame.snapshot().inUseContainerIds.length, 0,
    "failed local reservations commit no OneFrame slot");
  assertDeepEqual(graph.oneFrame.snapshot().trace, [],
    "failed local reservations append no OneFrame trace");
});

let passed = 0;
for (const testCase of tests) {
  try {
    testCase.run();
    passed += 1;
    console.log(`ok ${passed} - ${testCase.name}`);
  } catch (error) {
    console.error(`not ok ${passed + 1} - ${testCase.name}`);
    throw error;
  }
}
console.log(`manual Normal judgement tests passed: ${passed}`);
