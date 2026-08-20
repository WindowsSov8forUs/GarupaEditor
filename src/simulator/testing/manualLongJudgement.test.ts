import { DEFAULT_ORIGINAL_LIVE_SETTINGS } from "./originalLiveSettingsTestProfile";
import { LIVE_MANUAL_MODE } from "./modeFixtures";
import type { SimulatorManualInputGeometryBackend } from "../backends/contracts";
import {
  AfterNoteType,
  ButtonType,
  FrontNoteType,
  GameNoteType,
  type AfterNoteTypeValue,
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
import { NoteState } from "../engine/notes/noteBase";
import { chart, noteInformation } from "./firstSliceFixtures";

interface Graph {
  readonly input: InputManager;
  readonly dispatcher: GamePlayInputDispatcher;
  readonly manager: NoteManager;
  readonly oneFrame: InGameOneFrameJudgementController;
  readonly geometry: Geometry;
  readonly music: InGameMusicScoreController;
}
interface TestCase { readonly name: string; readonly run: () => void }
const tests: TestCase[] = [];
const manualMode = LIVE_MANUAL_MODE;
const origin = Object.freeze({ x: Math.fround(0), y: Math.fround(0) });
const frameDelta = Math.fround(1 / 60);
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
  inside = true;
  resolveButton() { return evidenceRequired("test.resolver-unused", ["MJ11"], "unused") }
  screenToWorld(position: ManualInputPosition) {
    return ok(Object.freeze({ x: position.x, y: position.y, z: Math.fround(0) }));
  }
  getDistanceNormalization() {
    return ok(Object.freeze({ cameraScale: Math.fround(1), gameplayScale: Math.fround(1) }));
  }
  isInsideTargetButtons() { return ok(this.inside) }
}
function root(afterNoteType: AfterNoteTypeValue, buttonType: ButtonTypeValue): NoteInformation {
  return {
    ...noteInformation(`long-${afterNoteType}`, 0),
    fireNoteType: FrontNoteType.Long,
    gameNoteType: GameNoteType.Long,
    buttonType,
    buttonTypes: [buttonType],
    buttonTypesArray: [buttonType],
    absolutePos: 2,
    storedAbsolutePos: 2,
    afterNoteType,
    afterNoteAbsolutePos: 3,
  };
}
function multipleHelper(): NoteInformation {
  return {
    ...noteInformation("long-multiple-helper", 1),
    fireNoteType: FrontNoteType.LongMultipleDirectionalFlickAdd,
    gameNoteType: GameNoteType.LongAddDirectionFlick,
    buttonType: ButtonType.Button_01_BMS_1P_01,
    buttonTypes: [ButtonType.Button_01_BMS_1P_01],
    buttonTypesArray: [ButtonType.Button_01_BMS_1P_01],
    absolutePos: 3,
    storedAbsolutePos: 3,
    afterNoteType: AfterNoteType.None,
    afterNoteAbsolutePos: 3,
  };
}
function createGraph(afterNoteType: AfterNoteTypeValue): Graph {
  const isMultiple = afterNoteType === AfterNoteType.MultipleDirectionalFlickLeft;
  const information = root(
    afterNoteType,
    isMultiple ? ButtonType.Button_02_BMS_1P_02 : ButtonType.Button_01_BMS_1P_01,
  );
  const list = isMultiple ? [information, multipleHelper()] : [information];
  const batch: NoteBatchInformation = {
    barIndex: 0, numerator: 0, denominator: 192, absolutePos: 1,
    informationList: list,
  };
  const runtimeChart = chart([batch]);
  const music = new InGameMusicScoreController(runtimeChart);
  const oneFrame = new InGameOneFrameJudgementController();
  requireOk(oneFrame.initialize(), "initialize OneFrame");
  const geometry = new Geometry();
  const manager = new NoteManager(
    [batch], new SlideNoteManager(), new Clock(), music, 0, 0,
    new InGameCalculatedData(manualMode, DEFAULT_ORIGINAL_LIVE_SETTINGS),
    () => oneFrame.getUsableOneFrameData(),
    () => evidenceRequired("test.auto-unused", ["MJ11"], "unused"),
    undefined,
    () => oneFrame.createManualJudgementTransaction(),
    geometry,
  );
  requireOk(oneFrame.registerManualJudgementOwner(
    (source) => manager.getManualJudgementOwnership(source),
  ), "register manual owner");
  requireOk(manager.execAwakeEnd(), "setup Long manager");
  requireOk(manager.execUpdate(0), "activate Long");
  const input = new InputManager(manualMode);
  const dispatcher = new GamePlayInputDispatcher(manager);
  requireOk(input.registerDispatcher(dispatcher), "register dispatcher");
  requireOk(input.initialize(), "initialize input");
  return { input, dispatcher, manager, oneFrame, geometry, music };
}
function longState(value: Graph): NoteState {
  const pool = value.manager.snapshot().pools.find((candidate) => candidate.family === "long");
  const object = pool?.objects[0]; assert(object !== undefined, "Long pool object exists");
  return object.state;
}
function begin(value: Graph, buttonType: ButtonTypeValue): void {
  const button = requireOk(value.dispatcher.getButtonForResolver(buttonType), "get button");
  const resolution = requireOk(value.input.issueButtonResolution(origin, button), "issue button");
  requireOk(value.input.prepareOuterFrame({ touches: [{
    fingerId: 0, phase: ManualTouchPhase.Began, position: origin,
    buttonResolution: resolution,
  }] }, frameDelta), "preflight Long Began");
  requireOk(value.input.execInput(GameState.PlayingSound), "commit Long Began");
  equal(longState(value), NoteState.Stop, "Long Began enters Stop");
  const head = requireOk(value.oneFrame.reflectOneFrameData(), "reflect Long head");
  assert(head !== null, "Long head exists");
  deep(head.entries.map((entry) => [entry.noteType, entry.phase, entry.rawResult]),
    [[4, "head", 4]], "Long head type4 projection");
}
function continuation(
  value: Graph,
  phase: typeof ManualTouchPhase.Moved | typeof ManualTouchPhase.Ended,
  x: number,
  delta = frameDelta,
): void {
  requireOk(value.input.prepareOuterFrame({ touches: [{
    fingerId: 0, phase, position: Object.freeze({ x, y: Math.fround(0) }),
    buttonResolution: null,
  }] }, delta), `preflight Long continuation ${phase}`);
  requireOk(value.input.execInput(GameState.PlayingSound), `commit Long continuation ${phase}`);
}
function reflectTail(value: Graph) {
  const batch = requireOk(value.oneFrame.reflectOneFrameData(), "reflect Long tail");
  assert(batch !== null, "Long tail exists"); return batch.entries[0]!;
}

test("MJ11/MJ15 Long Began type4与Normal physical Ended type2", () => {
  const inside = createGraph(AfterNoteType.Normal); begin(inside, ButtonType.Button_01_BMS_1P_01);
  continuation(inside, ManualTouchPhase.Ended, 0);
  const success = reflectTail(inside);
  deep([success.noteType, success.phase, success.rawResult, success.buttonTypes],
    [2, "tail", 4, [1]], "normal inside tail projection");
  equal(longState(inside), NoteState.Deactive, "normal release deactivates parent");

  const outside = createGraph(AfterNoteType.Normal); outside.geometry.inside = false;
  begin(outside, ButtonType.Button_01_BMS_1P_01);
  continuation(outside, ManualTouchPhase.Ended, 0);
  const missed = reflectTail(outside);
  deep([missed.noteType, missed.rawResult, missed.judgeTiming], [2, 0, 0],
    "normal outside converts to type2 Miss");
});

test("MJ12 Flick strict >0.04与grace owner合成type5 Ended", () => {
  const value = createGraph(AfterNoteType.Flick); begin(value, ButtonType.Button_01_BMS_1P_01);
  continuation(value, ManualTouchPhase.Moved, floatFromBits(0x3d23d70a));
  equal(longState(value), NoteState.Stop, "equal Flick threshold stays Stop");
  continuation(value, ManualTouchPhase.Moved, floatFromBits(0x3d23d70b));
  const tail = reflectTail(value);
  deep([tail.noteType, tail.phase, tail.rawResult], [5, "tail", 4], "Flick synthetic tail");
  equal(longState(value), NoteState.Deactive, "Flick success deactivates");
});

test("MJ13 Directional与Multiple count threshold提交type6/type7", () => {
  const directional = createGraph(AfterNoteType.DirectionalFlickLeft);
  begin(directional, ButtonType.Button_01_BMS_1P_01);
  continuation(directional, ManualTouchPhase.Moved, Math.fround(-floatFromBits(0x3c23d70b)));
  const directionalTail = reflectTail(directional);
  deep([directionalTail.noteType, directionalTail.rawResult], [6, 4], "Directional type6");

  const multiple = createGraph(AfterNoteType.MultipleDirectionalFlickLeft);
  begin(multiple, ButtonType.Button_02_BMS_1P_02);
  continuation(multiple, ManualTouchPhase.Moved, Math.fround(-floatFromBits(0x3ca3d70b)));
  const tail = reflectTail(multiple);
  deep([tail.noteType, tail.buttonTypes], [7, [2, 1]], "Multiple type7 owner buttons");
});

test("MJ14 grace不clamp且physical Flick无move success转Miss", () => {
  const value = createGraph(AfterNoteType.Flick); begin(value, ButtonType.Button_01_BMS_1P_01);
  value.geometry.inside = false;
  continuation(value, ManualTouchPhase.Moved, floatFromBits(0x3d23d70b), Math.fround(8));
  equal(longState(value), NoteState.Stop, "grace equal zero rejects movement completion");
  continuation(value, ManualTouchPhase.Ended, 0);
  const tail = reflectTail(value);
  deep([tail.noteType, tail.rawResult, tail.judgeTiming], [5, NoteResultType.Miss, 0],
    "physical Flick without success converts to Miss and clears timing");
});

test("M09 Long timeout deactivation同步清理button与finger owner", () => {
  const value = createGraph(AfterNoteType.Normal); begin(value, ButtonType.Button_01_BMS_1P_01);
  deep(value.dispatcher.snapshot().buttonWithFingerId.slice(0, 1), [1],
    "Long Stop retains finger button before timeout");
  requireOk(value.music.advance(Math.fround(100 / 96)), "advance beyond Long tail timeout");
  requireOk(value.manager.execUpdate(0), "execute Long tail timeout");
  const tail = reflectTail(value);
  deep([tail.noteType, tail.rawResult], [2, NoteResultType.Miss], "Long timeout tail Miss");
  deep(value.dispatcher.snapshot().buttonWithFingerId.slice(0, 1), [null],
    "timeout clears dispatcher finger owner");
  equal(value.dispatcher.snapshot().buttons[1]?.touchOwners.length, 0,
    "timeout clears GamePlayButton note owner");
});

let passed = 0;
for (const item of tests) {
  try { item.run(); passed += 1; console.log(`ok ${passed} - ${item.name}`); }
  catch (error) { console.error(`not ok ${passed + 1} - ${item.name}`); throw error; }
}
console.log(`manual Long judgement tests passed: ${passed}`);
