import type { SimulatorManualInputGeometryBackend } from "../backends/contracts";
import {
  ButtonType,
  FrontNoteType,
  GameNoteType,
  type ButtonTypeValue,
  type NoteBatchInformation,
  type NoteInformation,
} from "../engine/chart/types";
import { InGameCalculatedData } from "../engine/data/inGameCalculatedData";
import { GameState } from "../engine/data/inGameState";
import { ManualTouchPhase, type ManualInputPosition } from "../engine/data/manualInput";
import { NoteResultType } from "../engine/data/manualJudgement";
import { evidenceRequired, ok, type SimulatorResult } from "../engine/evidence";
import { GamePlayInputDispatcher, InputManager } from "../engine/managers/inputBoundaries";
import { InGameMusicScoreController } from "../engine/managers/inGameMusicScoreController";
import { InGameOneFrameJudgementController } from "../engine/managers/inGameOneFrameJudgementController";
import { NoteManager, type NoteManagerClock } from "../engine/managers/noteManager";
import { SlideNoteManager } from "../engine/managers/slideNoteManager";
import { chart, noteInformation } from "./firstSliceFixtures";

interface Graph {
  readonly input: InputManager;
  readonly dispatcher: GamePlayInputDispatcher;
  readonly manager: NoteManager;
  readonly oneFrame: InGameOneFrameJudgementController;
}
interface TestCase { readonly name: string; readonly run: () => void }
const tests: TestCase[] = [];
const manualMode = { kind: "manual" } as const;
const origin = Object.freeze({ x: Math.fround(0), y: Math.fround(0) });
const thresholdBits = new Map([[1, 0x3c23d70a], [2, 0x3ca3d70a], [3, 0x3cf5c28f]]);
function test(name: string, run: () => void): void { tests.push({ name, run }) }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
function equal<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function deep(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
}
function requireOk<T>(result: SimulatorResult<T>, message: string): T {
  assert(result.status === "ok", `${message}: ${JSON.stringify(result)}`); return result.value;
}
function requireEvidence<T>(result: SimulatorResult<T>, capability: string): void {
  assert(result.status === "evidence-required", `expected ${capability}: ${JSON.stringify(result)}`);
  equal(result.capability, capability, "evidence capability");
}
function floatFromBits(bits: number): number {
  const data = new ArrayBuffer(4); const view = new DataView(data);
  view.setUint32(0, bits, true); return view.getFloat32(0, true);
}
class Clock implements NoteManagerClock {
  validateAdvanceSequence(): SimulatorResult<void> { return ok(undefined) }
  setExecuteFrame(): void {}
  advance(): SimulatorResult<void> { return ok(undefined) }
  canActivateBatch(): SimulatorResult<boolean> { return ok(true) }
}
class Geometry implements SimulatorManualInputGeometryBackend {
  resolveButton() { return evidenceRequired("test.resolver-unused", ["MJ10"], "unused") }
  screenToWorld(position: ManualInputPosition) {
    return ok(Object.freeze({ x: position.x, y: position.y, z: Math.fround(0) }));
  }
  getDistanceNormalization() {
    return ok(Object.freeze({ cameraScale: Math.fround(1), gameplayScale: Math.fround(1) }));
  }
  isInsideTargetButtons() { return evidenceRequired("test.containment-unused", ["MJ10"], "unused") }
}
function source(index: number, buttonType: ButtonTypeValue): NoteInformation {
  return {
    ...noteInformation(`multiple-${index}`, index),
    fireNoteType: FrontNoteType.MultipleDirectionalFlick,
    gameNoteType: GameNoteType.DirectionalFlickLeft,
    buttonType,
    buttonTypes: [buttonType],
    buttonTypesArray: [buttonType],
    absolutePos: 2,
    storedAbsolutePos: 2,
  };
}
function createGraph(count: 1 | 2 | 3): Graph {
  const sources = Array.from({ length: count }, (_, index) => source(
    index,
    (ButtonType.Button_00_BMS_1P_SC + index) as ButtonTypeValue,
  ));
  const batch: NoteBatchInformation = {
    barIndex: 0, numerator: 0, denominator: 192, absolutePos: 1,
    informationList: sources,
  };
  const runtimeChart = chart([batch]);
  const music = new InGameMusicScoreController(runtimeChart);
  const oneFrame = new InGameOneFrameJudgementController();
  requireOk(oneFrame.initialize(), "initialize OneFrame");
  const manager = new NoteManager(
    [batch], new SlideNoteManager(), new Clock(), music, 0, 0,
    new InGameCalculatedData(manualMode),
    () => oneFrame.getUsableOneFrameData(),
    () => evidenceRequired("test.auto-unused", ["MJ10"], "unused"),
    undefined,
    () => oneFrame.createManualJudgementTransaction(),
    new Geometry(),
  );
  requireOk(oneFrame.registerManualJudgementOwner(
    (information) => manager.getManualJudgementOwnership(information),
  ), "register manual owner");
  requireOk(manager.execAwakeEnd(), "setup Multiple manager");
  requireOk(manager.execUpdate(0), "activate Multiple group");
  const input = new InputManager(manualMode);
  const dispatcher = new GamePlayInputDispatcher(manager);
  requireOk(input.registerDispatcher(dispatcher), "register dispatcher");
  requireOk(input.initialize(), "initialize input");
  return { input, dispatcher, manager, oneFrame };
}
function capability(value: Graph, buttonType: ButtonTypeValue, position = origin) {
  const button = requireOk(value.dispatcher.getButtonForResolver(buttonType), "get button");
  return requireOk(value.input.issueButtonResolution(position, button), "issue button");
}
function beganTouch(value: Graph, fingerId: number, buttonType: ButtonTypeValue) {
  return Object.freeze({
    fingerId, phase: ManualTouchPhase.Began, position: origin,
    buttonResolution: capability(value, buttonType),
  });
}
function dispatchBegan(value: Graph, buttonType = ButtonType.Button_00_BMS_1P_SC): void {
  requireOk(value.input.prepareOuterFrame({ touches: [beganTouch(value, 0, buttonType)] }), "preflight Began");
  requireOk(value.input.execInput(GameState.PlayingSound), "commit Began");
}
function dispatchMoved(value: Graph, x: number): SimulatorResult<void> {
  const prepared = value.input.prepareOuterFrame({ touches: [Object.freeze({
    fingerId: 0,
    phase: ManualTouchPhase.Moved,
    position: Object.freeze({ x, y: Math.fround(0) }),
    buttonResolution: null,
  })] });
  if (prepared.status !== "ok") return prepared;
  return value.input.execInput(GameState.PlayingSound);
}
function activeCount(value: Graph): number { return value.manager.snapshot().activeNotePoolObjectIds.length }

for (const count of [1, 2, 3] as const) {
  test(`MJ10 count ${count}使用owner Float32 strict threshold`, () => {
    const bits = thresholdBits.get(count); assert(bits !== undefined, "frozen threshold bits exist");
    const value = createGraph(count); dispatchBegan(value);
    requireOk(dispatchMoved(value, Math.fround(-floatFromBits(bits))), "equal threshold move");
    equal(value.oneFrame.snapshot().inUseContainerIds.length, 0, "equal full threshold does not judge");
    requireOk(dispatchMoved(value, Math.fround(-floatFromBits(bits + 1))), "after threshold move");
    const reflected = requireOk(value.oneFrame.reflectOneFrameData(), "reflect Multiple");
    assert(reflected !== null, "Multiple reflection exists");
    const entry = reflected.entries[0]; assert(entry !== undefined, "Multiple entry exists");
    equal(entry.noteType, 10, "Multiple type10");
    equal(entry.rawResult, NoteResultType.Perfect, "Began cached result");
    deep(entry.buttonTypes, Array.from({ length: count }, (_, index) => index),
      "button list comes from registered group owner");
    const setup = [...value.oneFrame.snapshot().trace].reverse().find(
      (candidate) => candidate.kind === "one-frame.setup-manual",
    );
    assert(setup?.kind === "one-frame.setup-manual", "manual setup trace exists");
    equal(setup.multipleDirectionalFlickNoteCount, count, "owner count reaches OneFrame");
    requireOk(value.manager.execUpdate(0), "consume side group members");
    equal(activeCount(value), 0, "used side members deactivate without extra judgement");
  });
}

test("MJ10 wrong direction与second finger保持全帧事务", () => {
  const wrong = createGraph(2); dispatchBegan(wrong);
  requireOk(dispatchMoved(wrong, floatFromBits(0x3ca3d70b)), "wrong direction move");
  equal(wrong.oneFrame.snapshot().inUseContainerIds.length, 0, "wrong direction emits nothing");

  const contested = createGraph(2);
  const first = beganTouch(contested, 0, ButtonType.Button_00_BMS_1P_SC);
  const second = beganTouch(contested, 1, ButtonType.Button_01_BMS_1P_01);
  const before = contested.input.snapshot();
  requireEvidence(contested.input.prepareOuterFrame({ touches: [first, second] }),
    "manual.multiple-directional-finger-owner-conflict");
  deep(contested.input.snapshot(), before, "second finger consumes no input capability or trace");
  deep(contested.dispatcher.snapshot().buttonWithFingerId.slice(0, 2), [null, null],
    "second finger commits no button owner");
  equal(contested.oneFrame.snapshot().inUseContainerIds.length, 0,
    "second finger reserves no global OneFrame slot");
});

test("MJ10 consumed side拒绝duplicate且不partial mutation", () => {
  const value = createGraph(2); dispatchBegan(value);
  requireOk(dispatchMoved(value, Math.fround(-floatFromBits(0x3ca3d70b))), "complete group");
  const resolution = capability(value, ButtonType.Button_01_BMS_1P_01);
  const before = value.input.snapshot();
  requireEvidence(value.input.prepareOuterFrame({ touches: [Object.freeze({
    fingerId: 1, phase: ManualTouchPhase.Began, position: origin,
    buttonResolution: resolution,
  })] }), "manual.multiple-directional-group-already-used");
  deep(value.input.snapshot(), before, "duplicate consumes no resolution or trace");
  equal(value.oneFrame.snapshot().inUseContainerIds.length, 1, "duplicate adds no slot");
});

test("MJ10 Multiple Wait第7帧走manual type10 synthetic", () => {
  const value = createGraph(2); dispatchBegan(value);
  requireOk(value.manager.execUpdate(Math.fround(6 / 60)), "six frames");
  equal(value.oneFrame.snapshot().inUseContainerIds.length, 0, "six frames remain pending");
  requireOk(value.manager.execUpdate(Math.fround(1 / 60)), "seventh frame");
  const reflected = requireOk(value.oneFrame.reflectOneFrameData(), "reflect synthetic Multiple");
  assert(reflected !== null, "synthetic Multiple reflection exists");
  deep(reflected.entries.map((entry) => [entry.noteType, entry.rawResult, entry.buttonTypes]),
    [[10, 4, [0, 1]]], "synthetic Multiple owner projection");
  requireOk(value.manager.execUpdate(0), "deactivate used sibling");
  equal(activeCount(value), 0, "synthetic side use deactivates sibling");
});

let passed = 0;
for (const item of tests) {
  try { item.run(); passed += 1; console.log(`ok ${passed} - ${item.name}`); }
  catch (error) { console.error(`not ok ${passed + 1} - ${item.name}`); throw error; }
}
console.log(`manual Multiple Directional tests passed: ${passed}`);
